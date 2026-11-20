import type {
  CrewAlarmId,
  CrewAlarmScenarioSpec,
  CrewAlarmState,
  CrewAlarmSummary,
  CrewDrillMachineState,
  CrewDrillResult,
  CrewTelemetrySample,
} from "./types.js";

export const CREW_DRILL_ALARM_ORDER: readonly CrewAlarmId[] = [
  "runaway_ingestion_storm",
  "sso_cert_expiring_24h",
  "dead_p1_alert_channel",
];

export const CREW_ALARM_TIME_LIMIT_SECONDS = 90;
export const CREW_STABILIZATION_TICKS = 3;

function buildInitialTelemetry(
  spec: CrewAlarmScenarioSpec,
): CrewTelemetrySample[] {
  return [
    {
      tick: 0,
      elapsedSec: 0,
      metricLabel: spec.metricLabel,
      metricUnit: spec.metricUnit,
      value: spec.initialValue,
      slaThreshold: spec.slaThreshold,
      withinSla: false,
    },
  ];
}

function createInitialAlarmState(spec: CrewAlarmScenarioSpec): CrewAlarmState {
  return {
    alarmId: spec.alarmId,
    index: spec.index,
    subStage: spec.subStage,
    alarmName: spec.alarmName,
    shortName: spec.shortName,
    status: "idle",
    timeLimitSeconds: CREW_ALARM_TIME_LIMIT_SECONDS,
    elapsedSeconds: 0,
    remainingSeconds: CREW_ALARM_TIME_LIMIT_SECONDS,
    overtime: false,
    splitMs: null,
    consecutiveSlaTicks: 0,
    appliedPatch: null,
    patchDiff: [],
    verificationProof: null,
    lastError: null,
    telemetrySeries: buildInitialTelemetry(spec),
    errorTrace: [...spec.errorTrace],
    scenario: spec,
  };
}

export function createCrewDrillState(input: {
  accountId: string;
  accountName: string;
  accountableOwner: string;
  scenarios: readonly CrewAlarmScenarioSpec[];
}): CrewDrillMachineState {
  const map = {} as Record<CrewAlarmId, CrewAlarmState>;
  for (const spec of input.scenarios) {
    map[spec.alarmId] = createInitialAlarmState(spec);
  }
  for (const alarmId of CREW_DRILL_ALARM_ORDER) {
    if (!map[alarmId]) {
      throw new Error(`Missing Crew Drill scenario spec for "${alarmId}"`);
    }
  }
  return {
    gateNumber: 3,
    gateLabel: "Gate 3 (3 of 3): Crew Drill",
    stageNumber: 4,
    stageLabel: "Stage 4: Day-30 Enablement & Handover",
    accountId: input.accountId,
    accountName: input.accountName,
    accountableOwner: input.accountableOwner,
    activeAlarmId: null,
    alarms: map,
    startedAt: null,
    completedAt: null,
  };
}

export function startCrewAlarm(
  state: CrewDrillMachineState,
  alarmId: CrewAlarmId,
  startedAtIso: string = new Date().toISOString(),
): CrewDrillMachineState {
  const current = state.alarms[alarmId];
  const nextAlarm: CrewAlarmState = {
    ...current,
    status: "active",
    elapsedSeconds: 0,
    remainingSeconds: CREW_ALARM_TIME_LIMIT_SECONDS,
    overtime: false,
    splitMs: null,
    consecutiveSlaTicks: 0,
    appliedPatch: null,
    patchDiff: [],
    verificationProof: null,
    lastError: null,
    telemetrySeries: buildInitialTelemetry(current.scenario),
  };

  return {
    ...state,
    startedAt: state.startedAt ?? startedAtIso,
    activeAlarmId: alarmId,
    alarms: {
      ...state.alarms,
      [alarmId]: nextAlarm,
    },
  };
}

export function tickCrewAlarm(
  state: CrewDrillMachineState,
  alarmId: CrewAlarmId,
  elapsedSeconds: number,
): CrewDrillMachineState {
  const current = state.alarms[alarmId];
  if (current.status === "stabilized" || current.status === "idle") {
    return state;
  }

  const clampedElapsed = Math.max(0, elapsedSeconds);
  const overtime = clampedElapsed > current.timeLimitSeconds;
  const remainingSeconds = Math.max(0, current.timeLimitSeconds - clampedElapsed);

  const tickIndex = current.telemetrySeries.length;
  // Deterministic spike oscillation while unstabilized
  const jitter = 1 + 0.06 * Math.sin(tickIndex * 1.3);
  const currentValue =
    Math.round(current.scenario.initialValue * jitter * 10) / 10;

  const sample: CrewTelemetrySample = {
    tick: tickIndex,
    elapsedSec: clampedElapsed,
    metricLabel: current.scenario.metricLabel,
    metricUnit: current.scenario.metricUnit,
    value: currentValue,
    slaThreshold: current.scenario.slaThreshold,
    withinSla: false,
  };

  const nextAlarm: CrewAlarmState = {
    ...current,
    status: overtime ? "overtime" : "active",
    elapsedSeconds: clampedElapsed,
    remainingSeconds,
    overtime,
    telemetrySeries: [...current.telemetrySeries, sample],
  };

  return {
    ...state,
    alarms: {
      ...state.alarms,
      [alarmId]: nextAlarm,
    },
  };
}

export interface RemediationAttemptResult {
  state: CrewDrillMachineState;
  accepted: boolean;
  message: string;
}

export function applyCrewRemediation(
  state: CrewDrillMachineState,
  alarmId: CrewAlarmId,
  patch: Record<string, string | number | boolean>,
  elapsedSeconds: number,
  verifiedAtIso: string = new Date().toISOString(),
): RemediationAttemptResult {
  const current = state.alarms[alarmId];
  const required = current.scenario.expectedRemediation.requiredPatch;

  const mismatches: string[] = [];
  const diffLines: string[] = [];

  for (const [key, expectedValue] of Object.entries(required)) {
    const provided = patch[key];
    const beforeValue = current.scenario.defaultContext[key];
    if (typeof expectedValue === "number") {
      // Allow exact match or stricter cap for rate_cap_rps
      const ok =
        typeof provided === "number" &&
        (key.includes("cap")
          ? provided > 0 && provided <= expectedValue
          : provided === expectedValue);
      if (!ok) {
        mismatches.push(
          `${key} expected <= ${expectedValue}, received ${String(provided ?? "unset")}`,
        );
      } else {
        diffLines.push(`- ${key}: ${String(beforeValue ?? "unset")}`);
        diffLines.push(`+ ${key}: ${String(provided)}`);
      }
    } else if (provided !== expectedValue) {
      mismatches.push(
        `${key} expected "${String(expectedValue)}", received "${String(provided ?? "unset")}"`,
      );
    } else {
      diffLines.push(`- ${key}: ${String(beforeValue ?? "unset")}`);
      diffLines.push(`+ ${key}: ${String(provided)}`);
    }
  }

  const clampedElapsed = Math.max(0.1, elapsedSeconds);
  const overtime = clampedElapsed > current.timeLimitSeconds;

  if (mismatches.length > 0) {
    const errorMessage = buildVerificationFailureMessage(alarmId, mismatches);
    const nextAlarm: CrewAlarmState = {
      ...current,
      status: overtime ? "overtime" : "active",
      elapsedSeconds: clampedElapsed,
      remainingSeconds: Math.max(0, current.timeLimitSeconds - clampedElapsed),
      overtime,
      lastError: errorMessage,
      errorTrace: [...current.errorTrace, `VERIFY FAILED: ${errorMessage}`],
    };
    return {
      state: {
        ...state,
        alarms: { ...state.alarms, [alarmId]: nextAlarm },
      },
      accepted: false,
      message: errorMessage,
    };
  }

  // Append 3 consecutive green SLA stabilization ticks
  const baseTick = current.telemetrySeries.length;
  const stabilizedSamples: CrewTelemetrySample[] = [];
  for (let i = 0; i < CREW_STABILIZATION_TICKS; i += 1) {
    stabilizedSamples.push({
      tick: baseTick + i,
      elapsedSec: Math.round((clampedElapsed + i) * 10) / 10,
      metricLabel: current.scenario.metricLabel,
      metricUnit: current.scenario.metricUnit,
      value: current.scenario.stabilizedValue,
      slaThreshold: current.scenario.slaThreshold,
      withinSla: true,
    });
  }

  const verificationProof = buildVerificationProof(alarmId, patch);
  const splitMs = Math.round(clampedElapsed * 1000);

  const stabilizedAlarm: CrewAlarmState = {
    ...current,
    status: "stabilized",
    elapsedSeconds: clampedElapsed,
    remainingSeconds: Math.max(0, current.timeLimitSeconds - clampedElapsed),
    overtime,
    splitMs,
    consecutiveSlaTicks: CREW_STABILIZATION_TICKS,
    appliedPatch: { ...patch },
    patchDiff: diffLines,
    verificationProof,
    lastError: null,
    telemetrySeries: [...current.telemetrySeries, ...stabilizedSamples],
  };

  const updatedAlarms = {
    ...state.alarms,
    [alarmId]: stabilizedAlarm,
  };

  const nextPending = CREW_DRILL_ALARM_ORDER.find(
    (id) => updatedAlarms[id].status !== "stabilized",
  );

  const allDone = !nextPending;

  return {
    state: {
      ...state,
      alarms: updatedAlarms,
      activeAlarmId: nextPending ?? null,
      completedAt: allDone ? verifiedAtIso : state.completedAt,
    },
    accepted: true,
    message: overtime
      ? `Stabilized in OVERTIME (${clampedElapsed.toFixed(1)}s): ${verificationProof}`
      : `Stabilized in ${clampedElapsed.toFixed(1)}s: ${verificationProof}`,
  };
}

function buildVerificationFailureMessage(
  alarmId: CrewAlarmId,
  mismatches: string[],
): string {
  switch (alarmId) {
    case "runaway_ingestion_storm":
      return `BURN_RATE_ABOVE_SLA — remediation incomplete (${mismatches.join("; ")})`;
    case "sso_cert_expiring_24h":
      return `CERT_TTL_STILL_UNDER_24H — handshake probe rejected (${mismatches.join("; ")})`;
    case "dead_p1_alert_channel":
      return `404 channel_not_found — synthetic P1 ping failed (${mismatches.join("; ")})`;
  }
}

function buildVerificationProof(
  alarmId: CrewAlarmId,
  patch: Record<string, string | number | boolean>,
): string {
  switch (alarmId) {
    case "runaway_ingestion_storm":
      return `200 OK · source=${String(patch.isolated_source_key ?? "tenant")} capped at ${String(patch.rate_cap_rps)} RPS + DLQ overflow active · 3/3 SLA ticks green`;
    case "sso_cert_expiring_24h":
      return `200 NOMINAL · staged cert ${String(patch.promote_cert_fingerprint)} promoted in dual-cert grace mode · live SSO handshake verified (TTL 365d)`;
    case "dead_p1_alert_channel":
      return `200 OK · P1 alert route rebound to ${String(patch.active_p1_channel)} · synthetic X-NominalX-Probe ping acknowledged`;
  }
}

export function summarizeCrewDrill(
  state: CrewDrillMachineState,
  executedAt: string = state.completedAt ?? new Date().toISOString(),
): CrewDrillResult {
  const alarms: CrewAlarmSummary[] = CREW_DRILL_ALARM_ORDER.map((id) => {
    const a = state.alarms[id];
    return {
      index: a.index,
      subStage: a.subStage,
      alarmId: a.alarmId,
      alarmName: a.alarmName,
      status: a.status,
      overtime: a.overtime,
      splitMs: a.splitMs,
      patchDiff: a.patchDiff,
      verificationProof: a.verificationProof,
    };
  });

  const stabilizedCount = alarms.filter((a) => a.status === "stabilized").length;
  const overtimeCount = alarms.filter((a) => a.overtime).length;
  const totalSplitMs = alarms.reduce((sum, a) => sum + (a.splitMs ?? 0), 0);
  const allStabilized = stabilizedCount === 3;

  return {
    gateNumber: 3,
    gateLabel: "Gate 3 (3 of 3): Crew Drill",
    stageNumber: 4,
    stageLabel: "Stage 4: Day-30 Enablement & Handover",
    accountId: state.accountId,
    accountName: state.accountName,
    accountableOwner: state.accountableOwner,
    executedAt,
    timeLimitSeconds: CREW_ALARM_TIME_LIMIT_SECONDS,
    alarms,
    stabilizedCount,
    overtimeCount,
    totalAlarms: 3,
    totalSplitMs,
    allStabilized,
    passedCleanly: allStabilized && overtimeCount === 0,
  };
}
