import type {
  BlueprintGate1Item,
  CustomerBlueprint,
} from "./blueprint.js";
import {
  evaluateWaivers,
  isHardStopStation,
  todayIsoUtc,
} from "./gate1.js";
import { scoreStaticFire, type ResolvedChaosVectorSpec } from "./gate2.js";
import {
  applyCrewRemediation,
  buildCustomAlarmScenario,
  createCrewDrillState,
  startCrewAlarm,
  summarizeCrewDrill,
} from "./gate3.js";
import { GATE3_SUB_STAGES } from "./lifecycle.js";
import type {
  CrewAlarmScenarioSpec,
  CrewDrillMachineState,
  CrewDrillResult,
  CustomStationConfig,
  EvaluatedWaiver,
  FlightCheckResult,
  MasterVerdict,
  NominalXConfig,
  StaticFireResult,
  StaticFireVectorObservation,
  StationCode,
  StationResult,
  WaiverInput,
  WaiverViolationCode,
} from "./types.js";

export type ManualGate1Status = "PENDING" | "PASS" | "FAIL" | "WAIVED";
export type ManualGate2Status = "PENDING" | "PASS" | "FAIL";
export type ManualGate3Status = "PENDING" | "PASS" | "FAIL";

export interface ManualGate1Entry {
  status: ManualGate1Status;
  evidenceNote: string;
  updatedAt?: string;
  waiver?: WaiverInput;
}

export interface ManualGate2Entry {
  status: ManualGate2Status;
  evidenceNote: string;
  updatedAt?: string;
}

export interface ManualGate3Entry {
  status: ManualGate3Status;
  evidenceNote: string;
  splitSeconds?: number;
  updatedAt?: string;
}

export interface ManualGateState {
  gate1: Record<string, ManualGate1Entry>;
  gate2: Record<string, ManualGate2Entry>;
  gate3: Record<string, ManualGate3Entry>;
}

export type ManualWaiverValidationResult =
  | { ok: true; waiver: WaiverInput; evaluated: EvaluatedWaiver }
  | { ok: false; violationCode: WaiverViolationCode; message: string };

export function createInitialManualGateState(
  blueprint: CustomerBlueprint,
  existingWaivers?: readonly WaiverInput[],
): ManualGateState {
  const waiverByStation = new Map<string, WaiverInput>();
  for (const w of existingWaivers ?? []) {
    waiverByStation.set(w.station.trim().toUpperCase(), w);
  }

  const gate1: Record<string, ManualGate1Entry> = {};
  for (const item of blueprint.gate1Items) {
    if (!item.enabled) continue;
    const matchedWaiver =
      !item.isHardStop
        ? waiverByStation.get(String(item.id).toUpperCase())
        : undefined;
    gate1[item.id] = matchedWaiver
      ? {
          status: "WAIVED",
          evidenceNote: `Waiver imported: ${matchedWaiver.reason}`,
          waiver: matchedWaiver,
        }
      : {
          status: "PENDING",
          evidenceNote: "",
        };
  }

  const gate2: Record<string, ManualGate2Entry> = {};
  for (const item of blueprint.gate2Items) {
    if (!item.enabled) continue;
    gate2[item.id] = {
      status: "PENDING",
      evidenceNote: "",
    };
  }

  const gate3: Record<string, ManualGate3Entry> = {};
  for (const item of blueprint.gate3Items) {
    if (!item.enabled) continue;
    gate3[item.id] = {
      status: "PENDING",
      evidenceNote: "",
    };
  }

  return { gate1, gate2, gate3 };
}

/**
 * Deterministic Hard Stop & Operational Waiver validator for interactive manual
 * gate checking. Reuses @nominalx/core's evaluateWaivers() so manual checks and
 * automated CLI checks enforce the exact same governance rules:
 * - Hard Stops (built-in or blueprint-locked) can NEVER be waived.
 * - Operational waivers require named owner, operational reason, <= 30d expiry,
 *   concrete rollback plan, and max 2 active waivers per account.
 */
export function validateManualWaiver(input: {
  stationCode: StationCode;
  stationLabel: string;
  isHardStop: boolean;
  waiver: WaiverInput;
  existingActiveWaivers: readonly WaiverInput[];
  referenceDate?: string;
  customStations?: readonly CustomStationConfig[];
}): ManualWaiverValidationResult {
  const referenceDate = input.referenceDate ?? todayIsoUtc();

  if (
    input.isHardStop ||
    isHardStopStation(input.stationCode, input.customStations)
  ) {
    return {
      ok: false,
      violationCode: "HARD_STOP_WAIVER_FORBIDDEN",
      message: `HARD STOP · NON-WAIVABLE: Waivers are strictly forbidden on ${input.stationLabel}. Verify Pass with live evidence to unlock launch.`,
    };
  }

  // Ensure customStations includes this station if it is custom, with hard_stop: false
  const effectiveCustomStations: CustomStationConfig[] = [
    ...(input.customStations ?? []),
  ];
  const alreadyKnown =
    ["AUTH_SSO", "RESIDENCY", "WEBHOOKS", "QUOTA_RATE", "ALERTING", "ROLLBACK"].includes(
      String(input.stationCode).toUpperCase(),
    ) ||
    effectiveCustomStations.some(
      (c) => c.code.toUpperCase() === String(input.stationCode).toUpperCase(),
    );
  if (!alreadyKnown) {
    effectiveCustomStations.push({
      code: String(input.stationCode),
      label: input.stationLabel,
      owner: input.waiver.owner || "Lead FDE",
      hard_stop: false,
      endpoint: "/health/manual",
      method: "GET",
      expected_status: 200,
      sold_promise: input.stationLabel,
    });
  }

  const candidate: WaiverInput = {
    ...input.waiver,
    station: String(input.stationCode),
  };

  const others = input.existingActiveWaivers.filter(
    (w) => w.station.trim().toUpperCase() !== String(input.stationCode).toUpperCase(),
  );

  const audit = evaluateWaivers(
    [...others, candidate],
    referenceDate,
    effectiveCustomStations,
  );

  const rejected = audit.rejectedWaivers.find(
    (w) =>
      (w.stationCode ?? w.stationInput).toUpperCase() ===
      String(input.stationCode).toUpperCase(),
  );
  if (rejected) {
    return {
      ok: false,
      violationCode: rejected.violationCode ?? "WAIVER_INCOMPLETE_FIELDS",
      message:
        rejected.violationMessage ??
        "Operational Waiver violates NominalX governance policy.",
    };
  }

  const active = audit.activeWaivers.find(
    (w) =>
      (w.stationCode ?? w.stationInput).toUpperCase() ===
      String(input.stationCode).toUpperCase(),
  );
  if (!active) {
    return {
      ok: false,
      violationCode: "WAIVER_INCOMPLETE_FIELDS",
      message:
        "Operational Waiver requires a named owner, reason, <= 30-day expiry date, and concrete rollback plan.",
    };
  }

  return {
    ok: true,
    waiver: candidate,
    evaluated: active,
  };
}

export interface EvaluatedManualCustomerGates {
  flightCheck: FlightCheckResult;
  staticFire: StaticFireResult;
  crewDrill: CrewDrillMachineState;
  crewSummary: CrewDrillResult;
  effectiveWaivers: WaiverInput[];
}

function buildBlueprintCrewScenario(
  config: NominalXConfig,
  item: CustomerBlueprint["gate3Items"][number],
  index: number,
  total: number,
): CrewAlarmScenarioSpec {
  if (item.customAlarm) {
    return buildCustomAlarmScenario(item.customAlarm, index, total);
  }
  const slug = config.account.id;
  if (item.id === "runaway_ingestion_storm") {
    const cap = Math.max(1000, Math.round(config.sold_contract.quota.guaranteed_rps / 10));
    return {
      alarmId: "runaway_ingestion_storm",
      index,
      subStage: `${index} of ${total}`,
      alarmName: item.title,
      shortName: "Ingestion Storm",
      severity: "P1",
      owner: item.owner,
      timerSeconds: item.timerSeconds,
      metricLabel: "Ingest RPS",
      metricUnit: "RPS",
      slaThreshold: cap,
      initialValue: cap * 3.2,
      stabilizedValue: Math.round(cap * 0.65),
      errorTrace: [
        `ALERT P1: Quota burn at 320% of contracted ceiling for ${config.account.name}`,
        `TOP_OFFENDER source_key=src_${slug.replace(/-/g, "_")}_batch_01 rps=${cap * 3.2}`,
        "STATUS: DLQ overflow disabled · retry amplification climbing",
      ],
      expectedRemediation: {
        summary: `Isolate src_${slug.replace(/-/g, "_")}_batch_01, cap <= ${cap} RPS, enable DLQ overflow.`,
        requiredPatch: {
          isolated_source_key: `src_${slug.replace(/-/g, "_")}_batch_01`,
          rate_cap_rps: cap,
          dlq_overflow_enabled: true,
        },
      },
      defaultContext: {
        isolated_source_key: "none",
        rate_cap_rps: 999999,
        dlq_overflow_enabled: false,
      },
    };
  }

  if (item.id === "sso_cert_expiring_24h") {
    return {
      alarmId: "sso_cert_expiring_24h",
      index,
      subStage: `${index} of ${total}`,
      alarmName: item.title,
      shortName: "SSO Cert <24h",
      severity: "P1",
      owner: item.owner,
      timerSeconds: item.timerSeconds,
      metricLabel: "Cert TTL",
      metricUnit: "hours",
      slaThreshold: 720,
      initialValue: 18,
      stabilizedValue: 8760,
      errorTrace: [
        "ALERT P1: Active IdP signing certificate TTL = 18h (< 24h emergency floor)",
        "STAGED_CERT_READY fingerprint=SHA256:7E:41:B2:90:AC:15 ttl=365d",
        "ACTION REQUIRED: Promote staged cert in dual-cert grace mode & verify live SSO handshake",
      ],
      expectedRemediation: {
        summary: "Promote SHA256:7E:41:B2:90:AC:15 with dual_cert_grace_mode=true.",
        requiredPatch: {
          promote_cert_fingerprint: "SHA256:7E:41:B2:90:AC:15",
          dual_cert_grace_mode: true,
        },
      },
      defaultContext: {
        promote_cert_fingerprint: "SHA256:OLD:EXPIRING:CERT",
        dual_cert_grace_mode: false,
      },
    };
  }

  const activeChannel = config.sold_contract.alerting.p1_channel;
  const builtInMeta = GATE3_SUB_STAGES.find((m) => m.alarmId === item.id);
  return {
    alarmId: item.id,
    index,
    subStage: `${index} of ${total}`,
    alarmName: item.title,
    shortName: builtInMeta?.shortName ?? "Dead P1 Route",
    severity: "P1",
    owner: item.owner,
    timerSeconds: item.timerSeconds,
    metricLabel: item.metricLabel,
    metricUnit: "%",
    slaThreshold: 0,
    initialValue: 100,
    stabilizedValue: 0,
    errorTrace: [
      `POST /alerts/test -> 404 channel_not_found (#eng-${slug}-legacy archived)`,
      `VERIFIED_ACTIVE_TARGET channel=${activeChannel}`,
      "ACTION REQUIRED: Rebind P1 route to active ops channel & confirm live 200 OK ping",
    ],
    expectedRemediation: {
      summary: `Rebind active_p1_channel to ${activeChannel} and confirm synthetic test ping.`,
      requiredPatch: {
        active_p1_channel: activeChannel,
        synthetic_ping_verified: true,
      },
    },
    defaultContext: {
      active_p1_channel: `#eng-${slug}-legacy`,
      synthetic_ping_verified: false,
    },
  };
}

/**
 * Evaluates a customer's live manual Gate 1, Gate 2, and Gate 3 state into
 * standard @nominalx/core FlightCheckResult, StaticFireResult, and CrewDrillResult
 * structures — enforcing every Hard Stop and Operational Waiver rule identically
 * to live CLI telemetry.
 */
export function evaluateManualCustomerGates(input: {
  config: NominalXConfig;
  blueprint: CustomerBlueprint;
  manualState: ManualGateState;
  referenceDate?: string;
  evaluatedAt?: string;
}): EvaluatedManualCustomerGates {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const referenceDate = input.referenceDate ?? evaluatedAt.slice(0, 10);
  const { config, blueprint, manualState } = input;

  // ── 1. Gate 1 (Flight Check · Setup Check) ─────────────────────────────────
  const enabledG1 = blueprint.gate1Items.filter((item) => item.enabled);
  const g1Items: BlueprintGate1Item[] =
    enabledG1.length > 0 ? enabledG1 : blueprint.gate1Items.slice(0, 1);

  const syntheticCustomStations: CustomStationConfig[] = g1Items
    .filter((item) => !item.isBuiltIn)
    .map((item) => ({
      ...(item.customStation ?? {
        code: String(item.id),
        label: item.label,
        owner: item.owner,
        endpoint: item.endpoint,
        method: item.method,
        expected_status: 200,
        sold_promise: item.soldPromise,
      }),
      hard_stop: item.isHardStop,
    }));

  // Collect waivers submitted on manual entries
  const collectedWaivers: WaiverInput[] = [];
  for (const item of g1Items) {
    const entry = manualState.gate1[item.id];
    if (entry?.status === "WAIVED" && entry.waiver) {
      collectedWaivers.push({
        ...entry.waiver,
        station: String(item.id),
      });
    }
  }

  // Also ensure any blueprint-promoted Hard Stop on a built-in operational station
  // is rejected as HARD_STOP_WAIVER_FORBIDDEN
  const blueprintHardStopSet = new Set(
    g1Items.filter((item) => item.isHardStop).map((item) => String(item.id).toUpperCase()),
  );

  const rawWaiverAudit = evaluateWaivers(
    collectedWaivers,
    referenceDate,
    syntheticCustomStations,
  );

  // Enforce blueprint-level Hard Stop lock even if a built-in operational station
  // was locked as a Hard Stop in Step 5
  const activeWaivers: EvaluatedWaiver[] = [];
  const rejectedWaivers: EvaluatedWaiver[] = [...rawWaiverAudit.rejectedWaivers];
  const hardStopViolations: EvaluatedWaiver[] = [
    ...rawWaiverAudit.hardStopViolations,
  ];
  const allWaivers: EvaluatedWaiver[] = [];

  for (const w of rawWaiverAudit.allWaivers) {
    const codeUpper = (w.stationCode ?? w.stationInput).toUpperCase();
    if (w.valid && blueprintHardStopSet.has(codeUpper)) {
      const blocked: EvaluatedWaiver = {
        ...w,
        policyClass: "HARD_STOP",
        valid: false,
        status: "REJECTED_HARD_STOP",
        violationCode: "HARD_STOP_WAIVER_FORBIDDEN",
        violationMessage: `HARD STOP · NON-WAIVABLE: ${w.stationLabel} is locked as a Hard Stop and cannot carry a Risk Waiver.`,
      };
      allWaivers.push(blocked);
      rejectedWaivers.push(blocked);
      hardStopViolations.push(blocked);
    } else {
      allWaivers.push(w);
      if (w.valid) activeWaivers.push(w);
    }
  }

  const waiverAudit = {
    ...rawWaiverAudit,
    allWaivers,
    activeWaivers,
    rejectedWaivers,
    hardStopViolations,
  };

  const activeWaiverByCode = new Map<string, EvaluatedWaiver>();
  for (const w of activeWaivers) {
    if (w.stationCode) activeWaiverByCode.set(w.stationCode.toUpperCase(), w);
  }
  const violationByCode = new Map<string, EvaluatedWaiver>();
  for (const w of rejectedWaivers) {
    if (w.stationCode && !violationByCode.has(w.stationCode.toUpperCase())) {
      violationByCode.set(w.stationCode.toUpperCase(), w);
    }
  }

  const totalG1 = g1Items.length;
  const stations: StationResult[] = g1Items.map((item, idx) => {
    const entry = manualState.gate1[item.id] ?? {
      status: "PENDING" as const,
      evidenceNote: "",
    };
    const codeUpper = String(item.id).toUpperCase();
    const activeWaiver = activeWaiverByCode.get(codeUpper);
    const violation = violationByCode.get(codeUpper);

    let status: StationResult["status"];
    let telemetryPassed = false;

    if (violation) {
      status = "NO_GO";
    } else if (entry.status === "PASS") {
      status = "NOMINAL";
      telemetryPassed = true;
    } else if (entry.status === "WAIVED") {
      if (item.isHardStop || !activeWaiver) {
        status = "NO_GO";
      } else {
        status = "HOLD_WAIVED";
      }
    } else if (entry.status === "FAIL") {
      status = "NO_GO";
    } else {
      status = "PENDING";
    }

    const noteText = entry.evidenceNote.trim();
    const observedSummary =
      status === "NOMINAL"
        ? noteText || "Manually verified PASS by engineer"
        : status === "HOLD_WAIVED"
          ? `Waived until ${activeWaiver?.expiresAt ?? "scheduled fix"} (owner ${activeWaiver?.owner ?? item.owner})`
          : status === "NO_GO"
            ? noteText || "Marked FAIL — remediation required"
            : "Pending verification — set Pass, Fail, or run CLI probe";

    const highlightLines = [
      status === "NOMINAL"
        ? `VERIFIED PASS: ${noteText || "Confirmed against customer staging"}`
        : status === "HOLD_WAIVED"
          ? `RISK WAIVER ACTIVE (${activeWaiver?.expiresAt}): ${activeWaiver?.reason ?? ""}`
          : status === "NO_GO"
            ? `FAIL / BLOCKED: ${noteText || violation?.violationMessage || "Requires staging remediation"}`
            : `PENDING: ${item.whyAdded}`,
    ];

    return {
      index: idx + 1,
      subStage: `${idx + 1} of ${totalG1}`,
      stationCode: item.id,
      stationLabel: item.label,
      policyClass: item.isHardStop ? "HARD_STOP" : "OPERATIONAL_WAIVER",
      isHardStop: item.isHardStop,
      isCustom: !item.isBuiltIn || undefined,
      customSpec: item.customStation,
      accountableOwner: item.owner,
      status,
      telemetryPassed,
      soldSummary: item.soldPromise,
      observedSummary,
      deltas: [
        {
          field: `${String(item.id).toLowerCase()}.verification_status`,
          sold: item.soldPromise,
          observed: observedSummary,
          matched: telemetryPassed,
          severity: item.isHardStop ? "hard_stop" : "operational",
        },
      ],
      latencyMs: status === "PENDING" ? 0 : 24,
      evidence: {
        method: item.method,
        endpoint: item.endpoint,
        httpStatus:
          status === "NOMINAL" ? 200 : status === "NO_GO" ? 503 : status === "HOLD_WAIVED" ? 202 : 0,
        latencyMs: status === "PENDING" ? 0 : 24,
        headers: {
          "x-nominalx-mode": "manual-verification",
          "x-nominalx-status": status,
        },
        payload: {
          manual_status: entry.status,
          evidence_note: noteText,
          why_added: item.whyAdded,
          protocol: config.sold_contract.auth.protocol,
          cert_ttl_days: status === "NOMINAL" ? 365 : 0,
          region: config.sold_contract.residency.allowed_regions[0] ?? "us-east-1",
          provisioned_rps:
            status === "NOMINAL" ? config.sold_contract.quota.guaranteed_rps : 0,
          ack_latency_ms:
            status === "NOMINAL" ? Math.round(config.sold_contract.alerting.max_ack_ms * 0.35) : 0,
          observed_rto_minutes:
            status === "NOMINAL" ? Math.max(1, config.sold_contract.rollback.max_rto_minutes - 1) : 0,
        },
        highlightLines,
      },
      remediationHint:
        violation?.violationMessage ??
        (telemetryPassed
          ? `${item.label} verified PASS.`
          : item.isHardStop
            ? `Hard Stop cannot be waived — verify ${item.label} on staging and record evidence.`
            : `Verify ${item.label} on staging, or issue a bounded <= 30d Operational Risk Waiver.`),
      activeWaiver: status === "HOLD_WAIVED" ? activeWaiver : undefined,
      waiverViolation: status === "NO_GO" ? violation : undefined,
    };
  });

  const nominalCount = stations.filter((s) => s.status === "NOMINAL").length;
  const heldWaivedCount = stations.filter((s) => s.status === "HOLD_WAIVED").length;
  const noGoCount = stations.filter(
    (s) => s.status === "NO_GO" || s.status === "PENDING",
  ).length;
  const hardStopFailures = stations.filter(
    (s) => s.isHardStop && s.status !== "NOMINAL",
  ).length;

  let g1Verdict: MasterVerdict;
  if (
    noGoCount > 0 ||
    hardStopFailures > 0 ||
    waiverAudit.hardStopViolations.length > 0
  ) {
    g1Verdict = "NO_GO";
  } else if (heldWaivedCount > 0) {
    g1Verdict = "CONDITIONAL_GO";
  } else {
    g1Verdict = "NOMINAL";
  }

  const flightCheck: FlightCheckResult = {
    gateNumber: 1,
    gateLabel: "Gate 1: Flight Check · Setup Check",
    stageNumber: 2,
    stageLabel: "Sales-to-FDE Handoff",
    accountId: config.account.id,
    accountName: config.account.name,
    evaluatedAt,
    referenceDate,
    accountableOwner: config.account.fde_owner,
    stations,
    waiverAudit,
    counts: {
      nominal: nominalCount,
      noGo: noGoCount,
      heldWaived: heldWaivedCount,
      total: stations.length,
      hardStopFailures,
    },
    verdict: g1Verdict,
    passed: g1Verdict !== "NO_GO",
    exitCode: g1Verdict === "NO_GO" ? 1 : 0,
  };

  // ── 2. Gate 2 (Static Fire · Fault Injection) ──────────────────────────────
  const enabledG2 = blueprint.gate2Items.filter((item) => item.enabled);
  const g2Items = enabledG2.length > 0 ? enabledG2 : blueprint.gate2Items.slice(0, 1);

  const activeVectorSpecs: ResolvedChaosVectorSpec[] = g2Items.map((item, idx) => ({
    index: idx + 1,
    ofTotal: g2Items.length,
    subStage: `${idx + 1} of ${g2Items.length}`,
    vectorId: item.id,
    vectorName: item.label,
    shortName:
      item.label.length > 26 ? `${item.label.slice(0, 24)}..` : item.label,
    description: item.description,
    owner: item.owner,
    isCustom: !item.isBuiltIn,
    remediationSummary:
      item.customVector?.patch_summary ?? item.description,
    customConfig: item.customVector,
  }));

  const observations: StaticFireVectorObservation[] = g2Items.map((item) => {
    const entry = manualState.gate2[item.id] ?? {
      status: "PENDING" as const,
      evidenceNote: "",
    };
    const noteText = entry.evidenceNote.trim();
    const passed = entry.status === "PASS";
    const failed = entry.status === "FAIL";
    const packetsSent = passed ? 100 : failed ? 100 : 100;
    const packetsCorrupted = passed ? 0 : failed ? 30 : 15;
    const packetsDropped = failed ? 10 : 0;

    return {
      vectorId: item.id,
      packetsSent,
      packetsCorrupted,
      packetsDropped,
      passed,
      p95LatencyMs: passed ? 34 : failed ? 210 : 0,
      observedBehavior: passed
        ? noteText || "Manually verified PASS (0% corruption)"
        : failed
          ? noteText || "Marked FAIL — handler remediation required"
          : "Pending verification — run staging fault test or CLI fire",
      expectedBehavior: "0.0% corruption · deterministic resilient handling",
      httpStatusSamples: passed ? [200, 200, 200] : failed ? [500, 500, 200] : [0],
      wireEvidence: {
        method: item.customVector?.method ?? "POST",
        endpoint:
          item.customVector?.endpoint_override ??
          config.environment.endpoints.webhook_ingress,
        httpStatus: passed ? 200 : failed ? 500 : 0,
        latencyMs: passed ? 34 : failed ? 210 : 0,
        headers: {
          "x-nominalx-mode": "manual-verification",
          "x-nominalx-vector": String(item.id),
        },
        payload: {
          manual_status: entry.status,
          evidence_note: noteText,
        },
        highlightLines: [
          passed
            ? `VERIFIED PASS: ${noteText || "Zero data corruption confirmed"}`
            : failed
              ? `FAIL: ${noteText || "Fault test failed on staging"}`
              : `PENDING: ${item.whyAdded}`,
        ],
      },
    };
  });

  const staticFire = scoreStaticFire({
    accountId: config.account.id,
    accountName: config.account.name,
    targetUrl: `${config.environment.base_url}${config.environment.endpoints.webhook_ingress}`,
    accountableOwner: config.account.fde_owner,
    observations,
    activeVectors: activeVectorSpecs,
    attemptNumber: 1,
    executedAt: evaluatedAt,
  });

  // ── 3. Gate 3 (Crew Drill · Live Incident Drill) ───────────────────────────
  const enabledG3 = blueprint.gate3Items.filter((item) => item.enabled);
  const g3Items = enabledG3.length > 0 ? enabledG3 : blueprint.gate3Items.slice(0, 1);
  const scenarios = g3Items.map((item, idx) =>
    buildBlueprintCrewScenario(config, item, idx + 1, g3Items.length),
  );

  let crewDrill = createCrewDrillState({
    accountId: config.account.id,
    accountName: config.account.name,
    accountableOwner: config.account.cse_owner,
    scenarios,
  });

  for (const scenario of scenarios) {
    const entry = manualState.gate3[scenario.alarmId];
    if (!entry || entry.status === "PENDING") continue;
    if (entry.status === "PASS") {
      crewDrill = startCrewAlarm(crewDrill, scenario.alarmId, evaluatedAt);
      const splitSec = entry.splitSeconds ?? 38.5;
      const res = applyCrewRemediation(
        crewDrill,
        scenario.alarmId,
        scenario.expectedRemediation.requiredPatch,
        splitSec,
        evaluatedAt,
      );
      crewDrill = res.state;
      if (entry.evidenceNote.trim()) {
        const currentAlarm = crewDrill.alarms[scenario.alarmId];
        if (currentAlarm) {
          crewDrill = {
            ...crewDrill,
            alarms: {
              ...crewDrill.alarms,
              [scenario.alarmId]: {
                ...currentAlarm,
                verificationProof: `VERIFIED PASS · ${entry.evidenceNote.trim()}`,
              },
            },
          };
        }
      }
    } else if (entry.status === "FAIL") {
      crewDrill = startCrewAlarm(crewDrill, scenario.alarmId, evaluatedAt);
      const currentAlarm = crewDrill.alarms[scenario.alarmId];
      if (currentAlarm) {
        crewDrill = {
          ...crewDrill,
          alarms: {
            ...crewDrill.alarms,
            [scenario.alarmId]: {
              ...currentAlarm,
              status: "overtime",
              overtime: true,
              lastError:
                entry.evidenceNote.trim() ||
                "Marked FAIL — incident drill needs rerun before handover.",
              errorTrace: [
                ...currentAlarm.errorTrace,
                `DRILL FAILED: ${entry.evidenceNote.trim() || "Needs remediation rerun"}`,
              ],
            },
          },
        };
      }
    }
  }

  const crewSummary = summarizeCrewDrill(crewDrill, evaluatedAt);

  return {
    flightCheck,
    staticFire,
    crewDrill,
    crewSummary,
    effectiveWaivers: activeWaivers.map((w) => ({
      station: String(w.stationCode ?? w.stationInput),
      owner: w.owner,
      reason: w.reason,
      expires_at: w.expiresAt,
      rollback_plan: w.rollbackPlan,
      ticket_id: w.ticketId,
      issued_at: w.issuedAt,
    })),
  };
}
