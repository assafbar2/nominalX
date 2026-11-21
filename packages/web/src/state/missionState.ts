import {
  ACCOUNT_PRESETS,
  computeJourneyState,
  createCrewDrillState,
  evaluateFlightCheck,
  simulateFlightCheckForPreset,
  simulateStaticFireForPreset,
  summarizeCrewDrill,
  type AccountPreset,
  type AccountPresetId,
  type ChaosVectorId,
  type CrewDrillMachineState,
  type CrewDrillResult,
  type DossierSigners,
  type FlightCheckResult,
  type JourneyState,
  type NominalXConfig,
  type StageNumber,
  type StaticFireResult,
  type StationCode,
  type WaiverInput,
} from "@nominalx/core";

export type CockpitView =
  | "gate1"
  | "gate2"
  | "gate3"
  | "reports";

export interface WireLogEntry {
  id: string;
  timestamp: string;
  gate: "GATE 1" | "GATE 2" | "GATE 3" | "GOVERNANCE";
  method: "GET" | "POST" | "PATCH" | "SIGN";
  endpoint: string;
  httpStatus: number;
  latencyMs: number;
  summary: string;
  details: string[];
}

export interface AccountMissionState {
  presetId: AccountPresetId;
  patchedStations: StationCode[];
  customWaivers: WaiverInput[];
  removedPresetWaiverStations: StationCode[];
  flightCheck: FlightCheckResult;
  flightCheckRunCount: number;
  selectedStation: StationCode;
  stagedVectorPatches: ChaosVectorId[];
  appliedVectorPatches: ChaosVectorId[];
  staticFire: StaticFireResult;
  crewDrill: CrewDrillMachineState;
  crewSummary: CrewDrillResult;
  signers: DossierSigners;
  dossierSigned: boolean;
  wireLog: WireLogEntry[];
}

function nowTimeLabel(): string {
  return new Date().toISOString().slice(11, 19);
}

export function buildEffectiveConfig(
  preset: AccountPreset,
  customWaivers: WaiverInput[],
  removedPresetWaiverStations: StationCode[],
): NominalXConfig {
  const removed = new Set(removedPresetWaiverStations);
  const baseWaivers = (preset.config.waivers ?? []).filter((w) => {
    const key = w.station.trim().toUpperCase();
    return !removed.has(key as StationCode);
  });
  return {
    ...preset.config,
    waivers: [...baseWaivers, ...customWaivers],
  };
}

export function evaluatePresetFlightCheck(
  preset: AccountPreset,
  patchedStations: readonly StationCode[],
  customWaivers: WaiverInput[],
  removedPresetWaiverStations: StationCode[],
): FlightCheckResult {
  const effectiveConfig = buildEffectiveConfig(
    preset,
    customWaivers,
    removedPresetWaiverStations,
  );
  const patched = new Set(patchedStations);
  const observed = {
    auth: patched.has("AUTH_SSO")
      ? preset.patchedObserved.auth
      : preset.initialObserved.auth,
    residency: patched.has("RESIDENCY")
      ? preset.patchedObserved.residency
      : preset.initialObserved.residency,
    webhooks: patched.has("WEBHOOKS")
      ? preset.patchedObserved.webhooks
      : preset.initialObserved.webhooks,
    quota: patched.has("QUOTA_RATE")
      ? preset.patchedObserved.quota
      : preset.initialObserved.quota,
    alerting: patched.has("ALERTING")
      ? preset.patchedObserved.alerting
      : preset.initialObserved.alerting,
    rollback: patched.has("ROLLBACK")
      ? preset.patchedObserved.rollback
      : preset.initialObserved.rollback,
  };

  return evaluateFlightCheck(effectiveConfig, observed, {
    referenceDate: preset.referenceDate,
    evaluatedAt: `${preset.referenceDate}T16:00:00.000Z`,
  });
}

export function createInitialMissionState(
  presetId: AccountPresetId,
): AccountMissionState {
  const preset = ACCOUNT_PRESETS[presetId];
  const flightCheck = simulateFlightCheckForPreset(presetId);
  const staticFire = simulateStaticFireForPreset(presetId, {
    patchedVectors: [],
    attemptNumber: 1,
  });
  const crewDrill = createCrewDrillState({
    accountId: preset.config.account.id,
    accountName: preset.config.account.name,
    accountableOwner: preset.config.account.cse_owner,
    scenarios: preset.crewDrillScenarios,
  });
  const crewSummary = summarizeCrewDrill(crewDrill);

  const firstFailing =
    flightCheck.stations.find((s) => s.status === "NO_GO")?.stationCode ??
    flightCheck.stations.find((s) => s.status === "HOLD_WAIVED")?.stationCode ??
    "AUTH_SSO";

  const initialLogs: WireLogEntry[] = flightCheck.stations.map((s, idx) => ({
    id: `init-${presetId}-${idx}`,
    timestamp: `16:00:0${idx}`,
    gate: "GATE 1",
    method: s.evidence.method,
    endpoint: s.evidence.endpoint,
    httpStatus: s.evidence.httpStatus,
    latencyMs: s.latencyMs,
    summary: `${s.subStage} ${s.stationLabel} -> ${s.status}`,
    details: s.evidence.highlightLines,
  }));

  return {
    presetId,
    patchedStations: [],
    customWaivers: [],
    removedPresetWaiverStations: [],
    flightCheck,
    flightCheckRunCount: 1,
    selectedStation: firstFailing,
    stagedVectorPatches: [],
    appliedVectorPatches: [],
    staticFire,
    crewDrill,
    crewSummary,
    signers: {
      leadFde: preset.config.account.fde_owner,
      leadCse: preset.config.account.cse_owner,
      customerEngLead: preset.config.account.customer_eng_lead,
      supportAckOwner:
        preset.config.account.support_owner ?? "support-oncall@vendor.io",
      signedAt: `${preset.referenceDate}T16:45:00.000Z`,
    },
    dossierSigned: false,
    wireLog: initialLogs,
  };
}

export function computeReadinessScore(state: AccountMissionState): number {
  const g1Cleared = state.flightCheck.stations.filter(
    (s) => s.status === "NOMINAL" || s.status === "HOLD_WAIVED",
  ).length;
  const g1Score = (g1Cleared / 6) * 40;

  const g2Score = (state.staticFire.totals.passedVectors / 7) * 35;

  const g3Score = (state.crewSummary.stabilizedCount / 3) * 20;

  const sealScore = state.dossierSigned ? 5 : 0;

  // Hard Stop failure caps visual readiness cleanly at 65% so launch lock is unmistakable
  const raw = Math.round(g1Score + g2Score + g3Score + sealScore);
  if (state.flightCheck.counts.hardStopFailures > 0) {
    return Math.min(raw, 65);
  }
  return Math.min(100, raw);
}

export function computeMissionJourney(
  state: AccountMissionState,
): JourneyState {
  return computeJourneyState({
    flightCheck: state.flightCheck,
    staticFire: state.staticFire,
    crewDrill: state.crewSummary,
    dossierSigned: state.dossierSigned,
  });
}

export function createWireEntry(
  gate: WireLogEntry["gate"],
  method: WireLogEntry["method"],
  endpoint: string,
  httpStatus: number,
  latencyMs: number,
  summary: string,
  details: string[],
): WireLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: nowTimeLabel(),
    gate,
    method,
    endpoint,
    httpStatus,
    latencyMs,
    summary,
    details,
  };
}

export function viewToStageNumber(view: CockpitView): StageNumber {
  switch (view) {
    case "gate1":
      return 2;
    case "gate2":
      return 3;
    case "gate3":
      return 4;
    case "reports":
      return 4;
  }
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
