import { GATE1_SUB_STAGES } from "./lifecycle.js";
import type {
  ContractDelta,
  EvaluatedWaiver,
  FlightCheckResult,
  MasterVerdict,
  NominalXConfig,
  ObservedEnvironmentTelemetry,
  PolicyClass,
  StationCode,
  StationLabel,
  StationResult,
  WaiverAgingBand,
  WaiverEvaluationResult,
  WaiverInput,
} from "./types.js";

export const HARD_STOP_STATIONS: readonly StationCode[] = [
  "AUTH_SSO",
  "RESIDENCY",
];

export const OPERATIONAL_WAIVER_STATIONS: readonly StationCode[] = [
  "WEBHOOKS",
  "QUOTA_RATE",
  "ALERTING",
  "ROLLBACK",
];

export const MAX_ACTIVE_WAIVERS = 2;
export const MAX_WAIVER_DURATION_DAYS = 30;

const STATION_ALIASES: Record<string, StationCode> = {
  AUTH_SSO: "AUTH_SSO",
  "AUTH / SSO": "AUTH_SSO",
  "AUTH/SSO": "AUTH_SSO",
  AUTH: "AUTH_SSO",
  SSO: "AUTH_SSO",
  RESIDENCY: "RESIDENCY",
  WEBHOOKS: "WEBHOOKS",
  WEBHOOK: "WEBHOOKS",
  QUOTA_RATE: "QUOTA_RATE",
  "QUOTA / RATE": "QUOTA_RATE",
  "QUOTA/RATE": "QUOTA_RATE",
  QUOTA: "QUOTA_RATE",
  RATE: "QUOTA_RATE",
  ALERTING: "ALERTING",
  ALERTS: "ALERTING",
  ROLLBACK: "ROLLBACK",
};

const STATION_LABEL_BY_CODE: Record<StationCode, StationLabel> = {
  AUTH_SSO: "AUTH / SSO",
  RESIDENCY: "RESIDENCY",
  WEBHOOKS: "WEBHOOKS",
  QUOTA_RATE: "QUOTA / RATE",
  ALERTING: "ALERTING",
  ROLLBACK: "ROLLBACK",
};

export function normalizeStationCode(input: string): StationCode | null {
  const normalized = input.trim().toUpperCase().replace(/\s+/g, " ");
  return STATION_ALIASES[normalized] ?? null;
}

export function getStationLabel(code: StationCode): StationLabel {
  return STATION_LABEL_BY_CODE[code];
}

export function isHardStopStation(code: StationCode): boolean {
  return HARD_STOP_STATIONS.includes(code);
}

export function getStationPolicyClass(code: StationCode): PolicyClass {
  return isHardStopStation(code) ? "HARD_STOP" : "OPERATIONAL_WAIVER";
}

function parseUtcDate(dateStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export function todayIsoUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function computeWaiverAgingBand(
  daysRemaining: number | null,
): WaiverAgingBand {
  if (daysRemaining === null || daysRemaining < 0) return "EXPIRED";
  if (daysRemaining <= 7) return "CRITICAL_7D";
  if (daysRemaining <= 14) return "WARNING_14D";
  return "HEALTHY";
}

export function evaluateWaivers(
  waivers: readonly WaiverInput[],
  referenceDateIso: string = todayIsoUtc(),
): WaiverEvaluationResult {
  const refMs = parseUtcDate(referenceDateIso) ?? parseUtcDate(todayIsoUtc())!;
  const allWaivers: EvaluatedWaiver[] = [];
  const activeWaivers: EvaluatedWaiver[] = [];
  const rejectedWaivers: EvaluatedWaiver[] = [];
  const hardStopViolations: EvaluatedWaiver[] = [];

  for (const waiver of waivers) {
    const stationCode = normalizeStationCode(waiver.station);
    const stationLabel = stationCode
      ? getStationLabel(stationCode)
      : waiver.station;
    const policyClass = stationCode
      ? getStationPolicyClass(stationCode)
      : "UNKNOWN";

    const expiryMs = parseUtcDate(waiver.expires_at);
    const daysRemaining =
      expiryMs === null
        ? null
        : Math.round((expiryMs - refMs) / (24 * 60 * 60 * 1000));
    const agingBand = computeWaiverAgingBand(daysRemaining);

    if (!stationCode) {
      const evaluated: EvaluatedWaiver = {
        stationInput: waiver.station,
        stationCode: null,
        stationLabel,
        policyClass: "UNKNOWN",
        owner: waiver.owner,
        reason: waiver.reason,
        expiresAt: waiver.expires_at,
        rollbackPlan: waiver.rollback_plan,
        ticketId: waiver.ticket_id,
        issuedAt: waiver.issued_at,
        daysRemaining,
        agingBand,
        valid: false,
        status: "REJECTED_POLICY",
        violationCode: "WAIVER_UNKNOWN_STATION",
        violationMessage: `Unknown Flight Check station "${waiver.station}".`,
      };
      allWaivers.push(evaluated);
      rejectedWaivers.push(evaluated);
      continue;
    }

    if (isHardStopStation(stationCode)) {
      const evaluated: EvaluatedWaiver = {
        stationInput: waiver.station,
        stationCode,
        stationLabel,
        policyClass: "HARD_STOP",
        owner: waiver.owner,
        reason: waiver.reason,
        expiresAt: waiver.expires_at,
        rollbackPlan: waiver.rollback_plan,
        ticketId: waiver.ticket_id,
        issuedAt: waiver.issued_at,
        daysRemaining,
        agingBand,
        valid: false,
        status: "REJECTED_HARD_STOP",
        violationCode: "HARD_STOP_WAIVER_FORBIDDEN",
        violationMessage: `HARD STOP · NON-WAIVABLE: Waivers are strictly forbidden on ${stationLabel}. Station must pass live telemetry (NOMINAL).`,
      };
      allWaivers.push(evaluated);
      rejectedWaivers.push(evaluated);
      hardStopViolations.push(evaluated);
      continue;
    }

    if (
      !waiver.owner.trim() ||
      !waiver.reason.trim() ||
      !waiver.rollback_plan.trim() ||
      expiryMs === null
    ) {
      const evaluated: EvaluatedWaiver = {
        stationInput: waiver.station,
        stationCode,
        stationLabel,
        policyClass,
        owner: waiver.owner,
        reason: waiver.reason,
        expiresAt: waiver.expires_at,
        rollbackPlan: waiver.rollback_plan,
        ticketId: waiver.ticket_id,
        issuedAt: waiver.issued_at,
        daysRemaining,
        agingBand,
        valid: false,
        status: "REJECTED_POLICY",
        violationCode: "WAIVER_INCOMPLETE_FIELDS",
        violationMessage: `Operational Waiver on ${stationLabel} requires a named owner, operational reason, valid YYYY-MM-DD expires_at date, and concrete rollback plan.`,
      };
      allWaivers.push(evaluated);
      rejectedWaivers.push(evaluated);
      continue;
    }

    if (daysRemaining !== null && daysRemaining < 0) {
      const evaluated: EvaluatedWaiver = {
        stationInput: waiver.station,
        stationCode,
        stationLabel,
        policyClass,
        owner: waiver.owner,
        reason: waiver.reason,
        expiresAt: waiver.expires_at,
        rollbackPlan: waiver.rollback_plan,
        ticketId: waiver.ticket_id,
        issuedAt: waiver.issued_at,
        daysRemaining,
        agingBand: "EXPIRED",
        valid: false,
        status: "EXPIRED",
        violationCode: "WAIVER_EXPIRED",
        violationMessage: `Operational Waiver on ${stationLabel} expired on ${waiver.expires_at} (${Math.abs(daysRemaining)}d overdue). Re-probe to NOMINAL before proceeding.`,
      };
      allWaivers.push(evaluated);
      rejectedWaivers.push(evaluated);
      continue;
    }

    const durationBasisMs = waiver.issued_at
      ? (parseUtcDate(waiver.issued_at) ?? refMs)
      : refMs;
    const effectiveDurationDays = Math.round(
      (expiryMs - durationBasisMs) / (24 * 60 * 60 * 1000),
    );
    if (
      effectiveDurationDays > MAX_WAIVER_DURATION_DAYS ||
      (daysRemaining !== null && daysRemaining > MAX_WAIVER_DURATION_DAYS)
    ) {
      const evaluated: EvaluatedWaiver = {
        stationInput: waiver.station,
        stationCode,
        stationLabel,
        policyClass,
        owner: waiver.owner,
        reason: waiver.reason,
        expiresAt: waiver.expires_at,
        rollbackPlan: waiver.rollback_plan,
        ticketId: waiver.ticket_id,
        issuedAt: waiver.issued_at,
        daysRemaining,
        agingBand,
        valid: false,
        status: "REJECTED_POLICY",
        violationCode: "WAIVER_EXCEEDS_30_DAYS",
        violationMessage: `Operational Waiver on ${stationLabel} exceeds the ${MAX_WAIVER_DURATION_DAYS}-day maximum expiry window (requested ${Math.max(effectiveDurationDays, daysRemaining ?? 0)}d).`,
      };
      allWaivers.push(evaluated);
      rejectedWaivers.push(evaluated);
      continue;
    }

    const alreadyActiveForStation = activeWaivers.some(
      (w) => w.stationCode === stationCode,
    );
    if (!alreadyActiveForStation && activeWaivers.length >= MAX_ACTIVE_WAIVERS) {
      const evaluated: EvaluatedWaiver = {
        stationInput: waiver.station,
        stationCode,
        stationLabel,
        policyClass,
        owner: waiver.owner,
        reason: waiver.reason,
        expiresAt: waiver.expires_at,
        rollbackPlan: waiver.rollback_plan,
        ticketId: waiver.ticket_id,
        issuedAt: waiver.issued_at,
        daysRemaining,
        agingBand,
        valid: false,
        status: "REJECTED_POLICY",
        violationCode: "WAIVER_LIMIT_EXCEEDED",
        violationMessage: `Operational Waiver cap exceeded on ${stationLabel}: maximum ${MAX_ACTIVE_WAIVERS} active waivers allowed per account.`,
      };
      allWaivers.push(evaluated);
      rejectedWaivers.push(evaluated);
      continue;
    }

    const evaluated: EvaluatedWaiver = {
      stationInput: waiver.station,
      stationCode,
      stationLabel,
      policyClass,
      owner: waiver.owner,
      reason: waiver.reason,
      expiresAt: waiver.expires_at,
      rollbackPlan: waiver.rollback_plan,
      ticketId: waiver.ticket_id,
      issuedAt: waiver.issued_at,
      daysRemaining,
      agingBand,
      valid: true,
      status: "ACTIVE",
    };
    allWaivers.push(evaluated);
    if (!alreadyActiveForStation) {
      activeWaivers.push(evaluated);
    }
  }

  return {
    referenceDate: referenceDateIso,
    maxAllowedActive: MAX_ACTIVE_WAIVERS,
    maxDurationDays: MAX_WAIVER_DURATION_DAYS,
    allWaivers,
    activeWaivers,
    rejectedWaivers,
    hardStopViolations,
  };
}

export interface EvaluateFlightCheckOptions {
  evaluatedAt?: string;
  referenceDate?: string;
  extraWaivers?: WaiverInput[];
}

export function evaluateFlightCheck(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  options: EvaluateFlightCheckOptions = {},
): FlightCheckResult {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const referenceDate = options.referenceDate ?? evaluatedAt.slice(0, 10);

  const combinedWaivers: WaiverInput[] = [
    ...(config.waivers ?? []),
    ...(options.extraWaivers ?? []),
  ];
  const waiverAudit = evaluateWaivers(combinedWaivers, referenceDate);

  const activeWaiverByStation = new Map<StationCode, EvaluatedWaiver>();
  for (const w of waiverAudit.activeWaivers) {
    if (w.stationCode) activeWaiverByStation.set(w.stationCode, w);
  }

  const violationByStation = new Map<StationCode, EvaluatedWaiver>();
  for (const w of waiverAudit.rejectedWaivers) {
    if (w.stationCode && !violationByStation.has(w.stationCode)) {
      violationByStation.set(w.stationCode, w);
    }
  }

  const stations: StationResult[] = [
    evaluateAuthStation(config, observed, violationByStation.get("AUTH_SSO")),
    evaluateResidencyStation(
      config,
      observed,
      violationByStation.get("RESIDENCY"),
    ),
    evaluateWebhooksStation(
      config,
      observed,
      activeWaiverByStation.get("WEBHOOKS"),
      violationByStation.get("WEBHOOKS"),
    ),
    evaluateQuotaStation(
      config,
      observed,
      activeWaiverByStation.get("QUOTA_RATE"),
      violationByStation.get("QUOTA_RATE"),
    ),
    evaluateAlertingStation(
      config,
      observed,
      activeWaiverByStation.get("ALERTING"),
      violationByStation.get("ALERTING"),
    ),
    evaluateRollbackStation(
      config,
      observed,
      activeWaiverByStation.get("ROLLBACK"),
      violationByStation.get("ROLLBACK"),
    ),
  ];

  const nominal = stations.filter((s) => s.status === "NOMINAL").length;
  const noGo = stations.filter((s) => s.status === "NO_GO").length;
  const heldWaived = stations.filter((s) => s.status === "HOLD_WAIVED").length;
  const hardStopFailures = stations.filter(
    (s) => s.isHardStop && s.status !== "NOMINAL",
  ).length;

  const hasHardStopWaiverViolation = waiverAudit.hardStopViolations.length > 0;

  let verdict: MasterVerdict;
  if (noGo > 0 || hardStopFailures > 0 || hasHardStopWaiverViolation) {
    verdict = "NO_GO";
  } else if (heldWaived > 0) {
    verdict = "CONDITIONAL_GO";
  } else {
    verdict = "NOMINAL";
  }

  return {
    gateNumber: 1,
    gateLabel: "Gate 1 (1 of 3): Flight Check",
    stageNumber: 2,
    stageLabel: "Stage 2: Sales-to-FDE Handoff",
    accountId: config.account.id,
    accountName: config.account.name,
    evaluatedAt,
    referenceDate,
    accountableOwner: config.account.fde_owner,
    stations,
    waiverAudit,
    counts: {
      nominal,
      noGo,
      heldWaived,
      total: 6,
      hardStopFailures,
    },
    verdict,
    passed: verdict !== "NO_GO",
    exitCode: verdict === "NO_GO" ? 1 : 0,
  };
}

function evaluateAuthStation(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  waiverViolation?: EvaluatedWaiver,
): StationResult {
  const meta = GATE1_SUB_STAGES[0]!;
  const sold = config.sold_contract.auth;
  const obs = observed.auth;
  const requireRejectUnsigned = sold.reject_unsigned_assertions ?? true;

  const deltas: ContractDelta[] = [
    {
      field: "auth.protocol",
      sold: sold.protocol,
      observed: obs.observedProtocol,
      matched:
        obs.observedProtocol.toLowerCase() === sold.protocol.toLowerCase(),
      severity: "hard_stop",
    },
    {
      field: "auth.mfa_required",
      sold: String(sold.mfa_required),
      observed: String(obs.mfaEnforced),
      matched: !sold.mfa_required || obs.mfaEnforced,
      severity: "hard_stop",
    },
    {
      field: "auth.min_cert_ttl_days",
      sold: `>= ${sold.min_cert_ttl_days}d`,
      observed: `${obs.certTtlDays}d`,
      matched: obs.certTtlDays >= sold.min_cert_ttl_days,
      severity: "hard_stop",
    },
    {
      field: "auth.reject_unsigned_assertions",
      sold: String(requireRejectUnsigned),
      observed: String(obs.rejectsUnsignedAssertions),
      matched: !requireRejectUnsigned || obs.rejectsUnsignedAssertions,
      severity: "hard_stop",
    },
  ];

  const telemetryPassed = deltas.every((d) => d.matched);
  // Hard Stop: even if telemetry passed, an attempted Hard Stop waiver is an explicit policy violation
  const status =
    telemetryPassed && !waiverViolation ? "NOMINAL" : "NO_GO";

  return {
    index: 1,
    subStage: meta.subStageLabel,
    stationCode: "AUTH_SSO",
    stationLabel: "AUTH / SSO",
    policyClass: "HARD_STOP",
    isHardStop: true,
    accountableOwner: config.account.fde_owner,
    status,
    telemetryPassed,
    soldSummary: `${sold.protocol.toUpperCase()} · MFA ${sold.mfa_required ? "required" : "optional"} · cert TTL >= ${sold.min_cert_ttl_days}d`,
    observedSummary: `${obs.observedProtocol.toUpperCase()} · MFA ${obs.mfaEnforced ? "enforced" : "disabled"} · cert TTL ${obs.certTtlDays}d`,
    deltas,
    latencyMs: obs.evidence.latencyMs,
    evidence: obs.evidence,
    remediationHint: waiverViolation
      ? waiverViolation.violationMessage ??
        "Remove illegal AUTH / SSO waiver and remediate IdP telemetry."
      : telemetryPassed
        ? "AUTH / SSO Hard Stop verified NOMINAL."
        : "Align IdP protocol, enforce MFA, rotate signing certificate above min_cert_ttl_days, and reject unsigned assertions.",
    waiverViolation,
  };
}

function evaluateResidencyStation(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  waiverViolation?: EvaluatedWaiver,
): StationResult {
  const meta = GATE1_SUB_STAGES[1]!;
  const sold = config.sold_contract.residency;
  const obs = observed.residency;
  const allowed = new Set(sold.allowed_regions.map((r) => r.toLowerCase()));

  const regionInAllowlist = allowed.has(obs.observedRegion.toLowerCase());
  const invalidStorage = obs.storageRegions.filter(
    (r) => !allowed.has(r.toLowerCase()),
  );
  const invalidEgress = obs.egressRegions.filter(
    (r) => !allowed.has(r.toLowerCase()),
  );

  const deltas: ContractDelta[] = [
    {
      field: "residency.observed_region",
      sold: sold.allowed_regions.join(", "),
      observed: obs.observedRegion,
      matched: regionInAllowlist,
      severity: "hard_stop",
    },
    {
      field: "residency.storage_regions",
      sold: sold.allowed_regions.join(", "),
      observed: obs.storageRegions.join(", "),
      matched: invalidStorage.length === 0,
      severity: "hard_stop",
    },
    {
      field: "residency.egress_regions",
      sold: sold.strict_egress
        ? `strict (${sold.allowed_regions.join(", ")})`
        : "relaxed",
      observed: obs.egressRegions.join(", "),
      matched: !sold.strict_egress || invalidEgress.length === 0,
      severity: "hard_stop",
    },
  ];

  const telemetryPassed = deltas.every((d) => d.matched);
  const status =
    telemetryPassed && !waiverViolation ? "NOMINAL" : "NO_GO";

  return {
    index: 2,
    subStage: meta.subStageLabel,
    stationCode: "RESIDENCY",
    stationLabel: "RESIDENCY",
    policyClass: "HARD_STOP",
    isHardStop: true,
    accountableOwner: config.account.fde_owner,
    status,
    telemetryPassed,
    soldSummary: `Allowed [${sold.allowed_regions.join(", ")}] · strict egress=${sold.strict_egress}`,
    observedSummary: `Served ${obs.observedRegion} · storage [${obs.storageRegions.join(", ")}] · egress [${obs.egressRegions.join(", ")}]`,
    deltas,
    latencyMs: obs.evidence.latencyMs,
    evidence: obs.evidence,
    remediationHint: waiverViolation
      ? waiverViolation.violationMessage ??
        "Remove illegal RESIDENCY waiver and pin routing inside contracted regions."
      : telemetryPassed
        ? "RESIDENCY Hard Stop verified NOMINAL."
        : `Pin edge routing, storage buckets, and egress gateways exclusively to [${sold.allowed_regions.join(", ")}].`,
    waiverViolation,
  };
}

function evaluateWebhooksStation(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  activeWaiver?: EvaluatedWaiver,
  waiverViolation?: EvaluatedWaiver,
): StationResult {
  const meta = GATE1_SUB_STAGES[2]!;
  const sold = config.sold_contract.webhooks;
  const obs = observed.webhooks;

  const deltas: ContractDelta[] = [
    {
      field: "webhooks.reject_unsigned",
      sold: "true (401/403)",
      observed: String(obs.rejectsUnsigned),
      matched: obs.rejectsUnsigned,
      severity: "operational",
    },
    {
      field: "webhooks.reject_tampered",
      sold: "true (401/403)",
      observed: String(obs.rejectsTampered),
      matched: obs.rejectsTampered,
      severity: "operational",
    },
    {
      field: "webhooks.accept_valid_hmac",
      sold: `true (${sold.signing})`,
      observed: String(obs.acceptsValidHmac),
      matched: obs.acceptsValidHmac,
      severity: "operational",
    },
    {
      field: "webhooks.dual_secret_rotation",
      sold: String(sold.dual_secret_rotation),
      observed: `${obs.dualSecretRotationReady} (keys: ${obs.activeKeyIds.join(", ") || "none"})`,
      matched: !sold.dual_secret_rotation || obs.dualSecretRotationReady,
      severity: "operational",
    },
  ];

  const telemetryPassed = deltas.every((d) => d.matched);
  const status = telemetryPassed
    ? "NOMINAL"
    : activeWaiver
      ? "HOLD_WAIVED"
      : "NO_GO";

  return {
    index: 3,
    subStage: meta.subStageLabel,
    stationCode: "WEBHOOKS",
    stationLabel: "WEBHOOKS",
    policyClass: "OPERATIONAL_WAIVER",
    isHardStop: false,
    accountableOwner: config.account.fde_owner,
    status,
    telemetryPassed,
    soldSummary: `${sold.signing} · dual-secret=${sold.dual_secret_rotation} · skew <= ${sold.max_clock_skew_seconds}s`,
    observedSummary: `unsigned_rejected=${obs.rejectsUnsigned} · dual_key=${obs.dualSecretRotationReady} [${obs.activeKeyIds.join(", ")}]`,
    deltas,
    latencyMs: obs.evidence.latencyMs,
    evidence: obs.evidence,
    remediationHint: telemetryPassed
      ? "Webhook HMAC ingress verified NOMINAL."
      : "Enforce HMAC-SHA256 verification on unsigned/tampered payloads and accept both current + next signing keys.",
    activeWaiver: status === "HOLD_WAIVED" ? activeWaiver : undefined,
    waiverViolation: status === "NO_GO" ? waiverViolation : undefined,
  };
}

function evaluateQuotaStation(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  activeWaiver?: EvaluatedWaiver,
  waiverViolation?: EvaluatedWaiver,
): StationResult {
  const meta = GATE1_SUB_STAGES[3]!;
  const sold = config.sold_contract.quota;
  const obs = observed.quota;

  const deltas: ContractDelta[] = [
    {
      field: "quota.guaranteed_rps",
      sold: `>= ${sold.guaranteed_rps.toLocaleString("en-US")} RPS`,
      observed: `${obs.provisionedRps.toLocaleString("en-US")} RPS`,
      matched: obs.provisionedRps >= sold.guaranteed_rps,
      severity: "operational",
    },
    {
      field: "quota.retry_after_header",
      sold: String(sold.require_retry_after_header),
      observed: obs.returnsRetryAfterHeader
        ? `true (Retry-After: ${obs.sampleRetryAfterSeconds ?? 1}s)`
        : "missing",
      matched: !sold.require_retry_after_header || obs.returnsRetryAfterHeader,
      severity: "operational",
    },
    {
      field: "quota.burst_drop_rate_pct",
      sold: "0%",
      observed: `${obs.burstDropRatePct}%`,
      matched: obs.burstDropRatePct === 0,
      severity: "operational",
    },
  ];

  const telemetryPassed = deltas.every((d) => d.matched);
  const status = telemetryPassed
    ? "NOMINAL"
    : activeWaiver
      ? "HOLD_WAIVED"
      : "NO_GO";

  return {
    index: 4,
    subStage: meta.subStageLabel,
    stationCode: "QUOTA_RATE",
    stationLabel: "QUOTA / RATE",
    policyClass: "OPERATIONAL_WAIVER",
    isHardStop: false,
    accountableOwner: config.account.se_owner ?? config.account.fde_owner,
    status,
    telemetryPassed,
    soldSummary: `>= ${sold.guaranteed_rps.toLocaleString("en-US")} RPS · Retry-After=${sold.require_retry_after_header}`,
    observedSummary: `${obs.provisionedRps.toLocaleString("en-US")} RPS · Retry-After=${obs.returnsRetryAfterHeader ? `${obs.sampleRetryAfterSeconds ?? 1}s` : "missing"}`,
    deltas,
    latencyMs: obs.evidence.latencyMs,
    evidence: obs.evidence,
    remediationHint: telemetryPassed
      ? "Provisioned RPS ceiling and 429 Retry-After behavior verified NOMINAL."
      : `Raise edge quota to >= ${sold.guaranteed_rps.toLocaleString("en-US")} RPS and attach numeric Retry-After headers on 429 responses.`,
    activeWaiver: status === "HOLD_WAIVED" ? activeWaiver : undefined,
    waiverViolation: status === "NO_GO" ? waiverViolation : undefined,
  };
}

function evaluateAlertingStation(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  activeWaiver?: EvaluatedWaiver,
  waiverViolation?: EvaluatedWaiver,
): StationResult {
  const meta = GATE1_SUB_STAGES[4]!;
  const sold = config.sold_contract.alerting;
  const obs = observed.alerting;

  const deltas: ContractDelta[] = [
    {
      field: "alerting.channel_active",
      sold: `active (${sold.p1_channel})`,
      observed: obs.channelActive
        ? `active (${obs.channelName})`
        : `inactive (${obs.providerStatus})`,
      matched: obs.channelActive,
      severity: "operational",
    },
    {
      field: "alerting.ack_latency_ms",
      sold: `<= ${sold.max_ack_ms}ms`,
      observed: `${obs.ackLatencyMs}ms`,
      matched: obs.channelActive && obs.ackLatencyMs <= sold.max_ack_ms,
      severity: "operational",
    },
  ];

  const telemetryPassed = deltas.every((d) => d.matched);
  const status = telemetryPassed
    ? "NOMINAL"
    : activeWaiver
      ? "HOLD_WAIVED"
      : "NO_GO";

  return {
    index: 5,
    subStage: meta.subStageLabel,
    stationCode: "ALERTING",
    stationLabel: "ALERTING",
    policyClass: "OPERATIONAL_WAIVER",
    isHardStop: false,
    accountableOwner: config.account.cse_owner,
    status,
    telemetryPassed,
    soldSummary: `${sold.p1_channel} · ACK <= ${sold.max_ack_ms}ms`,
    observedSummary: obs.channelActive
      ? `${obs.channelName} active · ACK ${obs.ackLatencyMs}ms`
      : `${obs.channelName} failed (${obs.providerStatus})`,
    deltas,
    latencyMs: obs.evidence.latencyMs,
    evidence: obs.evidence,
    remediationHint: telemetryPassed
      ? "Synthetic P1 alerting path verified NOMINAL."
      : `Rebind P1 webhook target to active channel ${sold.p1_channel} and confirm 2xx synthetic probe ACK <= ${sold.max_ack_ms}ms.`,
    activeWaiver: status === "HOLD_WAIVED" ? activeWaiver : undefined,
    waiverViolation: status === "NO_GO" ? waiverViolation : undefined,
  };
}

function evaluateRollbackStation(
  config: NominalXConfig,
  observed: ObservedEnvironmentTelemetry,
  activeWaiver?: EvaluatedWaiver,
  waiverViolation?: EvaluatedWaiver,
): StationResult {
  const meta = GATE1_SUB_STAGES[5]!;
  const sold = config.sold_contract.rollback;
  const obs = observed.rollback;

  const deltas: ContractDelta[] = [
    {
      field: "rollback.dry_run_passed",
      sold: String(sold.dry_run_required),
      observed: String(obs.dryRunPassed),
      matched: !sold.dry_run_required || obs.dryRunPassed,
      severity: "operational",
    },
    {
      field: "rollback.max_rto_minutes",
      sold: `<= ${sold.max_rto_minutes}m`,
      observed: `${obs.observedRtoMinutes}m`,
      matched: obs.observedRtoMinutes <= sold.max_rto_minutes,
      severity: "operational",
    },
    {
      field: "rollback.data_loss_detected",
      sold: "false",
      observed: String(obs.dataLossDetected),
      matched: !obs.dataLossDetected,
      severity: "operational",
    },
  ];

  const telemetryPassed = deltas.every((d) => d.matched);
  const status = telemetryPassed
    ? "NOMINAL"
    : activeWaiver
      ? "HOLD_WAIVED"
      : "NO_GO";

  return {
    index: 6,
    subStage: meta.subStageLabel,
    stationCode: "ROLLBACK",
    stationLabel: "ROLLBACK",
    policyClass: "OPERATIONAL_WAIVER",
    isHardStop: false,
    accountableOwner: config.account.fde_owner,
    status,
    telemetryPassed,
    soldSummary: `RTO <= ${sold.max_rto_minutes}m · dry-run=${sold.dry_run_required} · zero data loss`,
    observedSummary: `dry-run=${obs.dryRunPassed ? "passed" : "failed"} · RTO ${obs.observedRtoMinutes}m · artifact ${obs.artifactVersion}`,
    deltas,
    latencyMs: obs.evidence.latencyMs,
    evidence: obs.evidence,
    remediationHint: telemetryPassed
      ? "Rollback dry-run verified within contracted RTO."
      : `Cut automated blue/green rollback RTO from ${obs.observedRtoMinutes}m to <= ${sold.max_rto_minutes}m, or document a bounded Operational Waiver with verified manual failover.`,
    activeWaiver: status === "HOLD_WAIVED" ? activeWaiver : undefined,
    waiverViolation: status === "NO_GO" ? waiverViolation : undefined,
  };
}
