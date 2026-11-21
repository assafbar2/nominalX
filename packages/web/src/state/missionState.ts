import {
  ACCOUNT_PRESETS,
  buildSimulatedCustomStationTelemetry,
  computeJourneyState,
  createCrewDrillState,
  evaluateFlightCheck,
  parseNominalXConfigYaml,
  resolveCrewDrillScenarios,
  serializeNominalXConfigYaml,
  simulateStaticFireForPreset,
  summarizeCrewDrill,
  type AccountPreset,
  type AccountPresetId,
  type ChaosVectorId,
  type ConfigValidationError,
  type CrewDrillMachineState,
  type CrewDrillResult,
  type CustomAlarmConfig,
  type CustomChaosVectorConfig,
  type CustomStationConfig,
  type DossierSigners,
  type FlightCheckResult,
  type JourneyState,
  type NominalXConfig,
  type ObservedCustomStationTelemetry,
  type ObservedEnvironmentTelemetry,
  type StageNumber,
  type StaticFireResult,
  type StationCode,
  type WaiverInput,
} from "@nominalx/core";

export type CockpitView = "gate1" | "gate2" | "gate3" | "reports";

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

export interface AccountCustomizations {
  customStations: CustomStationConfig[];
  disabledVectors: string[];
  customVectors: CustomChaosVectorConfig[];
  disabledAlarms: string[];
  customAlarms: CustomAlarmConfig[];
  yamlBaseConfig?: NominalXConfig | null;
}

export interface AccountMissionState {
  presetId: AccountPresetId;
  customizations: AccountCustomizations;
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

const CUSTOMIZATIONS_STORAGE_KEY = "nominalx-customizations-v1";

export function createEmptyCustomizations(): AccountCustomizations {
  return {
    customStations: [],
    disabledVectors: [],
    customVectors: [],
    disabledAlarms: [],
    customAlarms: [],
    yamlBaseConfig: null,
  };
}

export function countActiveCustomizations(c: AccountCustomizations): number {
  return (
    c.customStations.length +
    c.disabledVectors.length +
    c.customVectors.length +
    c.disabledAlarms.length +
    c.customAlarms.length
  );
}

export function loadStoredCustomizations(
  presetId: AccountPresetId,
): AccountCustomizations {
  if (typeof window === "undefined") {
    return createEmptyCustomizations();
  }
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATIONS_STORAGE_KEY);
    if (!raw) return createEmptyCustomizations();
    const parsed = JSON.parse(raw) as Partial<
      Record<AccountPresetId, Partial<AccountCustomizations>>
    >;
    const entry = parsed[presetId];
    if (!entry) return createEmptyCustomizations();
    return {
      customStations: Array.isArray(entry.customStations)
        ? entry.customStations
        : [],
      disabledVectors: Array.isArray(entry.disabledVectors)
        ? entry.disabledVectors
        : [],
      customVectors: Array.isArray(entry.customVectors)
        ? entry.customVectors
        : [],
      disabledAlarms: Array.isArray(entry.disabledAlarms)
        ? entry.disabledAlarms
        : [],
      customAlarms: Array.isArray(entry.customAlarms) ? entry.customAlarms : [],
      yamlBaseConfig: entry.yamlBaseConfig ?? null,
    };
  } catch {
    return createEmptyCustomizations();
  }
}

export function saveStoredCustomizations(
  presetId: AccountPresetId,
  customizations: AccountCustomizations,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATIONS_STORAGE_KEY);
    const all: Record<string, AccountCustomizations> = raw
      ? (JSON.parse(raw) as Record<string, AccountCustomizations>)
      : {};
    const isEmpty =
      countActiveCustomizations(customizations) === 0 &&
      !customizations.yamlBaseConfig;
    if (isEmpty) {
      delete all[presetId];
    } else {
      all[presetId] = customizations;
    }
    window.localStorage.setItem(
      CUSTOMIZATIONS_STORAGE_KEY,
      JSON.stringify(all),
    );
  } catch {
    // Ignore storage unavailability
  }
}

export function clearStoredCustomizations(presetId: AccountPresetId): void {
  saveStoredCustomizations(presetId, createEmptyCustomizations());
}

function nowTimeLabel(): string {
  return new Date().toISOString().slice(11, 19);
}

export function buildEffectiveConfig(
  preset: AccountPreset,
  customWaivers: WaiverInput[],
  removedPresetWaiverStations: StationCode[],
  customizations?: AccountCustomizations,
): NominalXConfig {
  const baseConfig = customizations?.yamlBaseConfig ?? preset.config;
  const removed = new Set(
    removedPresetWaiverStations.map((s) => s.trim().toUpperCase()),
  );
  const baseWaivers = (baseConfig.waivers ?? []).filter((w) => {
    const key = w.station.trim().toUpperCase();
    return !removed.has(key);
  });

  const customStations = customizations?.customStations ?? [];
  const disabledVectors = customizations?.disabledVectors ?? [];
  const customVectors = customizations?.customVectors ?? [];
  const disabledAlarms = customizations?.disabledAlarms ?? [];
  const customAlarms = customizations?.customAlarms ?? [];

  return {
    ...baseConfig,
    waivers: [...baseWaivers, ...customWaivers],
    custom_stations: customStations.length > 0 ? customStations : undefined,
    chaos_overrides:
      disabledVectors.length > 0
        ? { disabled_vectors: disabledVectors }
        : undefined,
    custom_vectors: customVectors.length > 0 ? customVectors : undefined,
    disabled_alarms: disabledAlarms.length > 0 ? disabledAlarms : undefined,
    custom_alarms: customAlarms.length > 0 ? customAlarms : undefined,
  };
}

export function getEffectiveConfigForMission(
  preset: AccountPreset,
  mission: AccountMissionState,
): NominalXConfig {
  return buildEffectiveConfig(
    preset,
    mission.customWaivers,
    mission.removedPresetWaiverStations,
    mission.customizations,
  );
}

export function evaluatePresetFlightCheck(
  preset: AccountPreset,
  patchedStations: readonly StationCode[],
  customWaivers: WaiverInput[],
  removedPresetWaiverStations: StationCode[],
  customizations?: AccountCustomizations,
): FlightCheckResult {
  const effectiveConfig = buildEffectiveConfig(
    preset,
    customWaivers,
    removedPresetWaiverStations,
    customizations,
  );
  const patched = new Set(patchedStations);
  const customStationsObs: Record<string, ObservedCustomStationTelemetry> = {};
  for (const custom of effectiveConfig.custom_stations ?? []) {
    customStationsObs[custom.code] = buildSimulatedCustomStationTelemetry(
      custom,
      patched.has(custom.code),
    );
  }

  const observed: ObservedEnvironmentTelemetry = {
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
    customStations:
      Object.keys(customStationsObs).length > 0 ? customStationsObs : undefined,
  };

  return evaluateFlightCheck(effectiveConfig, observed, {
    referenceDate: preset.referenceDate,
    evaluatedAt: `${preset.referenceDate}T16:00:00.000Z`,
  });
}

export function evaluateMissionStaticFire(
  preset: AccountPreset,
  effectiveConfig: NominalXConfig,
  options: {
    patchedVectors?: readonly ChaosVectorId[];
    attemptNumber?: number;
    previousAttempts?: StaticFireResult["attemptHistory"];
  } = {},
): StaticFireResult {
  return simulateStaticFireForPreset(preset.id, {
    patchedVectors: options.patchedVectors,
    attemptNumber: options.attemptNumber,
    previousAttempts: options.previousAttempts,
    overrideConfig: effectiveConfig,
  });
}

export function buildMissionCrewDrill(
  preset: AccountPreset,
  effectiveConfig: NominalXConfig,
  previousDrill?: CrewDrillMachineState,
): CrewDrillMachineState {
  const scenarios = resolveCrewDrillScenarios(
    preset.crewDrillScenarios,
    effectiveConfig,
  );
  const fresh = createCrewDrillState({
    accountId: effectiveConfig.account.id,
    accountName: effectiveConfig.account.name,
    accountableOwner: effectiveConfig.account.cse_owner,
    scenarios,
  });

  if (!previousDrill) return fresh;

  // Preserve stabilized progress for alarms that still exist in the updated configuration
  const mergedAlarms = { ...fresh.alarms };
  for (const id of fresh.alarmOrder) {
    const prevAlarm = previousDrill.alarms[id];
    const nextAlarm = mergedAlarms[id];
    if (prevAlarm && nextAlarm && prevAlarm.status === "stabilized") {
      mergedAlarms[id] = {
        ...prevAlarm,
        index: nextAlarm.index,
        subStage: nextAlarm.subStage,
      };
    }
  }

  const allDone = fresh.alarmOrder.every(
    (id) => mergedAlarms[id]?.status === "stabilized",
  );
  return {
    ...fresh,
    alarms: mergedAlarms,
    activeAlarmId:
      previousDrill.activeAlarmId &&
      fresh.alarmOrder.includes(previousDrill.activeAlarmId)
        ? previousDrill.activeAlarmId
        : null,
    startedAt: previousDrill.startedAt,
    completedAt: allDone ? previousDrill.completedAt : null,
  };
}

export function createInitialMissionState(
  presetId: AccountPresetId,
  options: {
    skipStorage?: boolean;
    initialCustomizations?: AccountCustomizations;
  } = {},
): AccountMissionState {
  const preset = ACCOUNT_PRESETS[presetId];
  const customizations =
    options.initialCustomizations ??
    (options.skipStorage
      ? createEmptyCustomizations()
      : loadStoredCustomizations(presetId));

  const effectiveConfig = buildEffectiveConfig(preset, [], [], customizations);
  const flightCheck = evaluatePresetFlightCheck(
    preset,
    [],
    [],
    [],
    customizations,
  );
  const staticFire = evaluateMissionStaticFire(preset, effectiveConfig, {
    patchedVectors: [],
    attemptNumber: 1,
  });
  const crewDrill = buildMissionCrewDrill(preset, effectiveConfig);
  const crewSummary = summarizeCrewDrill(crewDrill);

  const firstFailing =
    flightCheck.stations.find((s) => s.status === "NO_GO")?.stationCode ??
    flightCheck.stations.find((s) => s.status === "HOLD_WAIVED")?.stationCode ??
    "AUTH_SSO";

  const initialLogs: WireLogEntry[] = flightCheck.stations.map((s, idx) => ({
    id: `init-${presetId}-${idx}`,
    timestamp: `16:00:0${idx}`,
    gate: "GATE 1",
    method: s.evidence.method === "GET" || s.evidence.method === "POST" ? s.evidence.method : "POST",
    endpoint: s.evidence.endpoint,
    httpStatus: s.evidence.httpStatus,
    latencyMs: s.latencyMs,
    summary: `${s.subStage} ${s.stationLabel} -> ${s.status}`,
    details: s.evidence.highlightLines,
  }));

  return {
    presetId,
    customizations,
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
      leadFde: effectiveConfig.account.fde_owner,
      leadCse: effectiveConfig.account.cse_owner,
      customerEngLead: effectiveConfig.account.customer_eng_lead,
      supportAckOwner:
        effectiveConfig.account.support_owner ?? "support-oncall@vendor.io",
      signedAt: `${preset.referenceDate}T16:45:00.000Z`,
    },
    dossierSigned: false,
    wireLog: initialLogs,
  };
}

export function applyCustomizationsToMission(
  preset: AccountPreset,
  prev: AccountMissionState,
  nextCustomizations: AccountCustomizations,
  options: {
    resetWaiverEdits?: boolean;
    wireSummary?: string;
    wireDetails?: string[];
  } = {},
): AccountMissionState {
  const customWaivers = options.resetWaiverEdits ? [] : prev.customWaivers;
  const removedPresetWaiverStations = options.resetWaiverEdits
    ? []
    : prev.removedPresetWaiverStations;

  const effectiveConfig = buildEffectiveConfig(
    preset,
    customWaivers,
    removedPresetWaiverStations,
    nextCustomizations,
  );

  const nextFlightCheck = evaluatePresetFlightCheck(
    preset,
    prev.patchedStations,
    customWaivers,
    removedPresetWaiverStations,
    nextCustomizations,
  );

  const validStationCodes = new Set(
    nextFlightCheck.stations.map((s) => s.stationCode),
  );
  const selectedStation = validStationCodes.has(prev.selectedStation)
    ? prev.selectedStation
    : (nextFlightCheck.stations.find((s) => s.status === "NO_GO")
        ?.stationCode ?? "AUTH_SSO");

  const nextStaticFire = evaluateMissionStaticFire(preset, effectiveConfig, {
    patchedVectors: prev.appliedVectorPatches,
    attemptNumber: prev.staticFire.attemptNumber,
    previousAttempts: prev.staticFire.attemptHistory.filter(
      (a) => a.attemptNumber !== prev.staticFire.attemptNumber,
    ),
  });

  const validVectorIds = new Set(nextStaticFire.vectors.map((v) => v.vectorId));
  const stagedVectorPatches = prev.stagedVectorPatches.filter((id) =>
    validVectorIds.has(id),
  );
  const appliedVectorPatches = prev.appliedVectorPatches.filter((id) =>
    validVectorIds.has(id),
  );

  const nextCrewDrill = buildMissionCrewDrill(
    preset,
    effectiveConfig,
    prev.crewDrill,
  );
  const nextCrewSummary = summarizeCrewDrill(nextCrewDrill);

  const wireEntry = createWireEntry(
    "GOVERNANCE",
    "PATCH",
    "/nominalx.yaml",
    200,
    6,
    options.wireSummary ??
      `CUSTOMIZED GATES · G1 ${nextFlightCheck.counts.total} stations · G2 ${nextStaticFire.totals.totalVectors} vectors · G3 ${nextCrewSummary.totalAlarms} alarms`,
    options.wireDetails ?? [
      `Custom stations: ${nextCustomizations.customStations.map((s) => s.code).join(", ") || "none"}`,
      `Custom vectors: ${nextCustomizations.customVectors.map((v) => v.id).join(", ") || "none"}`,
      `Custom alarms: ${nextCustomizations.customAlarms.map((a) => a.id).join(", ") || "none"}`,
    ],
  );

  const signers: DossierSigners = nextCustomizations.yamlBaseConfig
    ? {
        ...prev.signers,
        leadFde: effectiveConfig.account.fde_owner,
        leadCse: effectiveConfig.account.cse_owner,
        customerEngLead: effectiveConfig.account.customer_eng_lead,
        supportAckOwner:
          effectiveConfig.account.support_owner ?? prev.signers.supportAckOwner,
      }
    : prev.signers;

  return {
    ...prev,
    customizations: nextCustomizations,
    customWaivers,
    removedPresetWaiverStations,
    flightCheck: nextFlightCheck,
    selectedStation,
    stagedVectorPatches,
    appliedVectorPatches,
    staticFire: nextStaticFire,
    crewDrill: nextCrewDrill,
    crewSummary: nextCrewSummary,
    signers,
    wireLog: [wireEntry, ...prev.wireLog].slice(0, 60),
  };
}

export function applyYamlToMission(
  preset: AccountPreset,
  prev: AccountMissionState,
  yamlText: string,
):
  | { ok: true; state: AccountMissionState; config: NominalXConfig }
  | { ok: false; errors: ConfigValidationError[] } {
  const parsed = parseNominalXConfigYaml(yamlText);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors };
  }

  const cfg = parsed.config;
  const nextCustomizations: AccountCustomizations = {
    customStations: cfg.custom_stations ?? [],
    disabledVectors: cfg.chaos_overrides?.disabled_vectors ?? [],
    customVectors: cfg.custom_vectors ?? [],
    disabledAlarms: cfg.disabled_alarms ?? [],
    customAlarms: cfg.custom_alarms ?? [],
    yamlBaseConfig: cfg,
  };

  const state = applyCustomizationsToMission(preset, prev, nextCustomizations, {
    resetWaiverEdits: true,
    wireSummary: `APPLIED NOMINALX.YAML · ${cfg.account.name} (${6 + nextCustomizations.customStations.length} stations, ${7 - nextCustomizations.disabledVectors.length + nextCustomizations.customVectors.length} vectors, ${3 - nextCustomizations.disabledAlarms.length + nextCustomizations.customAlarms.length} alarms)`,
  });

  return { ok: true, state, config: cfg };
}

export function serializeMissionToYaml(
  preset: AccountPreset,
  mission: AccountMissionState,
): string {
  return serializeNominalXConfigYaml(
    getEffectiveConfigForMission(preset, mission),
  );
}

export function computeReadinessScore(state: AccountMissionState): number {
  const g1Cleared = state.flightCheck.stations.filter(
    (s) => s.status === "NOMINAL" || s.status === "HOLD_WAIVED",
  ).length;
  const g1Score =
    (g1Cleared / Math.max(1, state.flightCheck.counts.total)) * 40;

  const g2Score =
    (state.staticFire.totals.passedVectors /
      Math.max(1, state.staticFire.totals.totalVectors)) *
    35;

  const g3Score =
    (state.crewSummary.stabilizedCount /
      Math.max(1, state.crewSummary.totalAlarms)) *
    20;

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
