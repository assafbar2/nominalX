export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type GateNumber = 1 | 2 | 3;

export type BuiltInStationCode =
  | "AUTH_SSO"
  | "RESIDENCY"
  | "WEBHOOKS"
  | "QUOTA_RATE"
  | "ALERTING"
  | "ROLLBACK";

export type StationCode = BuiltInStationCode | (string & {});

export type BuiltInStationLabel =
  | "AUTH / SSO"
  | "RESIDENCY"
  | "WEBHOOKS"
  | "QUOTA / RATE"
  | "ALERTING"
  | "ROLLBACK";

export type StationLabel = BuiltInStationLabel | (string & {});

export type PolicyClass = "HARD_STOP" | "OPERATIONAL_WAIVER";

export type StationStatus = "NOMINAL" | "NO_GO" | "HOLD_WAIVED" | "PENDING";

export type MasterVerdict = "NOMINAL" | "CONDITIONAL_GO" | "NO_GO";

export type DossierVerdict = "NOMINAL" | "NOMINAL_WITH_WAIVERS" | "NO_GO";

export type ResilienceGrade = "A" | "B" | "C" | "D" | "F";

export type BuiltInChaosVectorId =
  | "duplicate_webhook"
  | "out_of_order"
  | "rate_limit_429"
  | "upstream_timeout_30s"
  | "dual_hmac_rotation"
  | "additive_json_fields"
  | "clock_skew_5m";

export type ChaosVectorId = BuiltInChaosVectorId | (string & {});

export type BuiltInCrewAlarmId =
  | "runaway_ingestion_storm"
  | "sso_cert_expiring_24h"
  | "dead_p1_alert_channel";

export type CrewAlarmId = BuiltInCrewAlarmId | (string & {});

export type ExportFormat = "md" | "json" | "slack";

export type ReportType = "exec" | "ops" | "waivers";

export type AccountPresetId =
  | "meridian-fintech"
  | "kestrel-health"
  | "vanguard-retail"
  | "helios-logistics";

export type WaiverAgingBand =
  | "EXPIRED"
  | "CRITICAL_7D"
  | "WARNING_14D"
  | "HEALTHY";

export type WaiverViolationCode =
  | "HARD_STOP_WAIVER_FORBIDDEN"
  | "WAIVER_EXPIRED"
  | "WAIVER_EXCEEDS_30_DAYS"
  | "WAIVER_LIMIT_EXCEEDED"
  | "WAIVER_INCOMPLETE_FIELDS"
  | "WAIVER_UNKNOWN_STATION";

export interface IntegrationSpec {
  id: string;
  name: string;
  category:
    | "identity"
    | "cloud_residency"
    | "webhook_gateway"
    | "rate_limiting"
    | "alerting"
    | "deployment_rollback"
    | "crm_handoff"
    | "issue_tracking";
  protocolOrInterface: string;
  purpose: string;
  ownerSide: "vendor" | "customer" | "shared";
}

export interface StageMetadata {
  stageNumber: StageNumber;
  stageName: string;
  displayTitle: string;
  shortTitle: string;
  inUnverifiedGap: boolean;
  gateNumber?: GateNumber;
  gateLabel?: string;
  sprintLabel: string;
  goal: string;
  singleAccountableOwner: string;
  vendorEngineers: string[];
  customerEngineers: string[];
  integrations: IntegrationSpec[];
  resources: string[];
  timeBox: string;
  trigger: string;
  inScope: string[];
  outOfScope: string[];
  definitionOfDone: string[];
  hardStops: string[];
}

export interface Gate1SubStageMetadata {
  index: 1 | 2 | 3 | 4 | 5 | 6;
  ofTotal: 6;
  subStageLabel: string;
  stationCode: StationCode;
  stationLabel: StationLabel;
  policyClass: PolicyClass;
  goal: string;
  singleAccountableOwner: string;
  vendorEngineers: string[];
  customerEngineers: string[];
  integrations: IntegrationSpec[];
  resources: string[];
  timeBox: string;
  trigger: string;
  inScope: string[];
  outOfScope: string[];
  definitionOfDone: string[];
  hardStopRule?: string;
}

export interface Gate2SubStageMetadata {
  index: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  ofTotal: 7;
  subStageLabel: string;
  vectorId: ChaosVectorId;
  vectorName: string;
  shortName: string;
  goal: string;
  singleAccountableOwner: string;
  vendorEngineers: string[];
  customerEngineers: string[];
  integrations: IntegrationSpec[];
  resources: string[];
  timeBox: string;
  trigger: string;
  inScope: string[];
  outOfScope: string[];
  definitionOfDone: string[];
  failureMode: string;
  remediationSummary: string;
}

export interface Gate3SubStageMetadata {
  index: 1 | 2 | 3;
  ofTotal: 3;
  subStageLabel: string;
  alarmId: CrewAlarmId;
  alarmName: string;
  shortName: string;
  goal: string;
  singleAccountableOwner: string;
  vendorEngineers: string[];
  customerEngineers: string[];
  integrations: IntegrationSpec[];
  resources: string[];
  timeBox: string;
  trigger: string;
  inScope: string[];
  outOfScope: string[];
  definitionOfDone: string[];
}

export interface HandoverSprintMetadata {
  sprintName: string;
  stageLabel: string;
  goal: string;
  singleAccountableOwner: string;
  coSigners: string[];
  vendorEngineers: string[];
  customerEngineers: string[];
  integrations: IntegrationSpec[];
  resources: string[];
  timeBox: string;
  trigger: string;
  inScope: string[];
  outOfScope: string[];
  definitionOfDone: string[];
}

export interface AccountStackProfile {
  cloud: string;
  idp: string;
  alerting: string;
  webhook_runtime: string;
  deployment_tool?: string;
  observability?: string;
  ticketing?: string;
}

export interface AccountConfig {
  id: string;
  name: string;
  industry?: string;
  tier?: string;
  arr_band?: string;
  fde_owner: string;
  cse_owner: string;
  se_owner?: string;
  support_owner?: string;
  tam_owner?: string;
  customer_eng_lead: string;
  customer_security_lead?: string;
  customer_sre_lead?: string;
  target_go_live: string;
  stack: AccountStackProfile;
}

export interface SoldContractConfig {
  auth: {
    protocol: "saml2" | "oidc";
    mfa_required: boolean;
    min_cert_ttl_days: number;
    reject_unsigned_assertions?: boolean;
  };
  residency: {
    allowed_regions: string[];
    strict_egress: boolean;
  };
  webhooks: {
    signing: "hmac-sha256";
    dual_secret_rotation: boolean;
    max_clock_skew_seconds: number;
  };
  quota: {
    guaranteed_rps: number;
    require_retry_after_header: boolean;
  };
  alerting: {
    p1_channel: string;
    max_ack_ms: number;
  };
  rollback: {
    max_rto_minutes: number;
    dry_run_required: boolean;
  };
}

export interface EnvironmentConfig {
  base_url: string;
  endpoints: {
    auth_metadata: string;
    residency_probe: string;
    webhook_ingress: string;
    quota_status: string;
    alert_sink: string;
    rollback_check: string;
  };
  secrets: {
    webhook_secret_current: string;
    webhook_secret_next: string;
  };
}

export interface WaiverInput {
  station: string;
  owner: string;
  reason: string;
  expires_at: string;
  rollback_plan: string;
  ticket_id?: string;
  issued_at?: string;
}

export interface CustomStationRequiredHeader {
  name: string;
  contains: string;
}

export interface CustomStationRequiredJsonField {
  path: string;
  equals: string | number | boolean;
}

export interface CustomStationConfig {
  code: string;
  label: string;
  owner: string;
  hard_stop?: boolean;
  endpoint: string;
  method: "GET" | "POST";
  expected_status?: number;
  required_header?: CustomStationRequiredHeader;
  required_json_field?: CustomStationRequiredJsonField;
  sold_promise: string;
  initial_status?: "NOMINAL" | "NO_GO";
  failure_evidence?: string;
  fix_summary?: string;
}

export interface ChaosOverridesConfig {
  disabled_vectors?: string[];
}

export interface CustomChaosVectorConfig {
  id: string;
  label: string;
  description: string;
  owner: string;
  endpoint_override?: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  payload?: Record<string, unknown>;
  expected_status: number;
  weight?: number;
  patch_id: string;
  patch_label: string;
  patch_summary: string;
  patch_diff: string[];
}

export interface CustomAlarmConfig {
  id: string;
  title: string;
  owner: string;
  timer_seconds: number;
  metric_label: string;
  trigger_symptom: string;
  log_lines: string[];
  remediation_label: string;
  remediation_detail: string;
  verification_proof: string;
}

export interface NominalXConfig {
  schema_version: "1.0";
  account: AccountConfig;
  sold_contract: SoldContractConfig;
  environment: EnvironmentConfig;
  waivers?: WaiverInput[];
  custom_stations?: CustomStationConfig[];
  chaos_overrides?: ChaosOverridesConfig;
  custom_vectors?: CustomChaosVectorConfig[];
  disabled_alarms?: string[];
  custom_alarms?: CustomAlarmConfig[];
}

export interface WireEvidence {
  method: "GET" | "POST" | "PUT" | "PATCH";
  endpoint: string;
  httpStatus: number;
  latencyMs: number;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  highlightLines: string[];
}

export interface ObservedAuthTelemetry {
  observedProtocol: string;
  mfaEnforced: boolean;
  certTtlDays: number;
  rejectsUnsignedAssertions: boolean;
  idpIssuer?: string;
  certFingerprint?: string;
  evidence: WireEvidence;
}

export interface ObservedResidencyTelemetry {
  observedRegion: string;
  storageRegions: string[];
  egressRegions: string[];
  dnsTarget: string;
  evidence: WireEvidence;
}

export interface ObservedWebhooksTelemetry {
  rejectsUnsigned: boolean;
  rejectsTampered: boolean;
  acceptsValidHmac: boolean;
  dualSecretRotationReady: boolean;
  activeKeyIds: string[];
  evidence: WireEvidence;
}

export interface ObservedQuotaTelemetry {
  provisionedRps: number;
  returnsRetryAfterHeader: boolean;
  sampleRetryAfterSeconds: number | null;
  burstDropRatePct: number;
  evidence: WireEvidence;
}

export interface ObservedAlertingTelemetry {
  channelActive: boolean;
  channelName: string;
  ackLatencyMs: number;
  providerStatus: string;
  evidence: WireEvidence;
}

export interface ObservedRollbackTelemetry {
  dryRunPassed: boolean;
  observedRtoMinutes: number;
  artifactVersion: string;
  dataLossDetected: boolean;
  evidence: WireEvidence;
}

export interface ObservedCustomStationTelemetry {
  code: string;
  httpStatus: number;
  headerMatched: boolean;
  observedHeaderValue?: string | null;
  jsonFieldMatched: boolean;
  observedJsonValue?: unknown;
  evidence: WireEvidence;
}

export interface ObservedEnvironmentTelemetry {
  auth: ObservedAuthTelemetry;
  residency: ObservedResidencyTelemetry;
  webhooks: ObservedWebhooksTelemetry;
  quota: ObservedQuotaTelemetry;
  alerting: ObservedAlertingTelemetry;
  rollback: ObservedRollbackTelemetry;
  customStations?: Record<string, ObservedCustomStationTelemetry>;
}

export interface ContractDelta {
  field: string;
  sold: string;
  observed: string;
  matched: boolean;
  severity: "hard_stop" | "operational";
}

export interface EvaluatedWaiver {
  stationInput: string;
  stationCode: StationCode | null;
  stationLabel: StationLabel | string;
  policyClass: PolicyClass | "UNKNOWN";
  owner: string;
  reason: string;
  expiresAt: string;
  rollbackPlan: string;
  ticketId?: string;
  issuedAt?: string;
  daysRemaining: number | null;
  agingBand: WaiverAgingBand;
  valid: boolean;
  status: "ACTIVE" | "REJECTED_HARD_STOP" | "EXPIRED" | "REJECTED_POLICY";
  violationCode?: WaiverViolationCode;
  violationMessage?: string;
}

export interface WaiverEvaluationResult {
  referenceDate: string;
  maxAllowedActive: number;
  maxDurationDays: number;
  allWaivers: EvaluatedWaiver[];
  activeWaivers: EvaluatedWaiver[];
  rejectedWaivers: EvaluatedWaiver[];
  hardStopViolations: EvaluatedWaiver[];
}

export interface StationResult {
  index: number;
  subStage: string;
  stationCode: StationCode;
  stationLabel: StationLabel;
  policyClass: PolicyClass;
  isHardStop: boolean;
  isCustom?: boolean;
  customSpec?: CustomStationConfig;
  accountableOwner: string;
  status: StationStatus;
  telemetryPassed: boolean;
  soldSummary: string;
  observedSummary: string;
  deltas: ContractDelta[];
  latencyMs: number;
  evidence: WireEvidence;
  remediationHint: string;
  activeWaiver?: EvaluatedWaiver;
  waiverViolation?: EvaluatedWaiver;
}

export interface FlightCheckResult {
  gateNumber: 1;
  gateLabel: "Gate 1: Flight Check · Setup Check";
  stageNumber: 2;
  stageLabel: "Sales-to-FDE Handoff";
  accountId: string;
  accountName: string;
  evaluatedAt: string;
  referenceDate: string;
  accountableOwner: string;
  stations: StationResult[];
  waiverAudit: WaiverEvaluationResult;
  counts: {
    nominal: number;
    noGo: number;
    heldWaived: number;
    total: number;
    hardStopFailures: number;
  };
  verdict: MasterVerdict;
  passed: boolean;
  exitCode: 0 | 1;
}

export interface StaticFireVectorObservation {
  vectorId: ChaosVectorId;
  packetsSent: number;
  packetsCorrupted: number;
  packetsDropped: number;
  passed: boolean;
  p95LatencyMs: number;
  observedBehavior: string;
  expectedBehavior: string;
  httpStatusSamples: number[];
  wireEvidence: WireEvidence;
}

export interface StaticFireVectorResult extends StaticFireVectorObservation {
  index: number;
  subStage: string;
  vectorName: string;
  shortName: string;
  isCustom?: boolean;
  corruptionPct: number;
  accountableOwner: string;
  remediationSummary: string;
}

export interface TelemetryPoint {
  tick: number;
  timeOffsetSec: number;
  packetsPerSec: number;
  errorRatePct: number;
  corruptionRatePct: number;
  p95LatencyMs: number;
}

export interface FireAttemptSummary {
  attemptNumber: number;
  executedAt: string;
  corruptionPct: number;
  grade: ResilienceGrade;
  passedVectors: number;
  totalVectors: number;
  patchesApplied: string[];
}

export interface StaticFireResult {
  gateNumber: 2;
  gateLabel: "Gate 2: Static Fire · Fault Injection";
  stageNumber: 3;
  stageLabel: "Integration & Cutover";
  accountId: string;
  accountName: string;
  targetUrl: string;
  executedAt: string;
  accountableOwner: string;
  attemptNumber: number;
  patchesApplied: string[];
  vectors: StaticFireVectorResult[];
  totals: {
    packetsSent: number;
    packetsCorrupted: number;
    packetsDropped: number;
    passedVectors: number;
    failedVectors: number;
    totalVectors: number;
  };
  corruptionPct: number;
  grade: ResilienceGrade;
  passed: boolean;
  exitCode: 0 | 1;
  telemetrySeries: TelemetryPoint[];
  attemptHistory: FireAttemptSummary[];
}

export type CrewAlarmStatus =
  | "idle"
  | "active"
  | "verifying"
  | "stabilized"
  | "overtime";

export interface CrewTelemetrySample {
  tick: number;
  elapsedSec: number;
  metricLabel: string;
  metricUnit: string;
  value: number;
  slaThreshold: number;
  withinSla: boolean;
}

export interface CrewAlarmScenarioSpec {
  alarmId: CrewAlarmId;
  index: number;
  subStage: string;
  alarmName: string;
  shortName: string;
  severity: "P1";
  isCustom?: boolean;
  owner?: string;
  timerSeconds?: number;
  metricLabel: string;
  metricUnit: string;
  slaThreshold: number;
  initialValue: number;
  stabilizedValue: number;
  errorTrace: string[];
  remediationLabel?: string;
  remediationDetail?: string;
  verificationProofTemplate?: string;
  expectedRemediation: {
    summary: string;
    requiredPatch: Record<string, string | number | boolean>;
  };
  defaultContext: Record<string, string | number | boolean>;
}

export interface CrewAlarmState {
  alarmId: CrewAlarmId;
  index: number;
  subStage: string;
  alarmName: string;
  shortName: string;
  isCustom?: boolean;
  owner?: string;
  status: CrewAlarmStatus;
  timeLimitSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  overtime: boolean;
  splitMs: number | null;
  consecutiveSlaTicks: number;
  appliedPatch: Record<string, string | number | boolean> | null;
  patchDiff: string[];
  verificationProof: string | null;
  lastError: string | null;
  telemetrySeries: CrewTelemetrySample[];
  errorTrace: string[];
  scenario: CrewAlarmScenarioSpec;
}

export interface CrewDrillMachineState {
  gateNumber: 3;
  gateLabel: "Gate 3: Crew Drill · Live Incident Drill";
  stageNumber: 4;
  stageLabel: "Day-30 Enablement & Handover";
  accountId: string;
  accountName: string;
  accountableOwner: string;
  alarmOrder: CrewAlarmId[];
  activeAlarmId: CrewAlarmId | null;
  alarms: Record<string, CrewAlarmState>;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CrewAlarmSummary {
  index: number;
  subStage: string;
  alarmId: CrewAlarmId;
  alarmName: string;
  isCustom?: boolean;
  status: CrewAlarmStatus;
  overtime: boolean;
  splitMs: number | null;
  patchDiff: string[];
  verificationProof: string | null;
}

export interface CrewDrillResult {
  gateNumber: 3;
  gateLabel: "Gate 3: Crew Drill · Live Incident Drill";
  stageNumber: 4;
  stageLabel: "Day-30 Enablement & Handover";
  accountId: string;
  accountName: string;
  accountableOwner: string;
  executedAt: string;
  timeLimitSeconds: number;
  alarms: CrewAlarmSummary[];
  stabilizedCount: number;
  overtimeCount: number;
  totalAlarms: number;
  totalSplitMs: number;
  allStabilized: boolean;
  passedCleanly: boolean;
}

export interface RunbookSection {
  id: string;
  title: string;
  ownerRole: string;
  summary: string;
  commands: string[];
  verificationSteps: string[];
}

export interface Day1Runbook {
  accountId: string;
  accountName: string;
  generatedAt: string;
  stackSummary: AccountStackProfile;
  primaryContacts: {
    leadFde: string;
    leadCse: string;
    supportOwner: string;
    tamOwner: string;
    customerEngLead: string;
    customerSreLead: string;
  };
  verifiedBaselines: {
    authProtocol: string;
    allowedRegions: string[];
    guaranteedRps: number;
    p1Channel: string;
    maxRtoMinutes: number;
    staticFireGrade: ResilienceGrade;
    staticFireCorruptionPct: number;
  };
  activeWaiverPlaybooks: Array<{
    station: string;
    owner: string;
    expiresAt: string;
    daysRemaining: number | null;
    agingBand: WaiverAgingBand;
    rollbackPlan: string;
    reprobeCommand: string;
  }>;
  sections: RunbookSection[];
}

export interface DossierSigners {
  leadFde: string;
  leadCse: string;
  customerEngLead: string;
  supportAckOwner?: string;
  signedAt: string;
}

export interface SignedNominalDossier {
  schemaVersion: "1.0";
  documentType: "NOMINALX_SIGNED_DOSSIER";
  generatedAt: string;
  account: AccountConfig;
  verdict: DossierVerdict;
  masterVerdict: MasterVerdict;
  verificationDigest: string;
  signers: DossierSigners;
  gate1: FlightCheckResult;
  gate2: StaticFireResult;
  gate3: CrewDrillResult;
  runbook: Day1Runbook;
  scopeSummary: {
    inScopeVerified: string[];
    outOfScopeBoundaries: string[];
    hardStopsEnforced: StationLabel[];
  };
}

export interface JourneyStageStatus {
  stageNumber: StageNumber;
  stageName: string;
  shortTitle: string;
  inUnverifiedGap: boolean;
  status: "NOMINAL" | "CONDITIONAL_GO" | "NO_GO" | "ACTIVE" | "READY" | "PENDING";
  accountableOwner: string;
  pips: Array<{
    label: string;
    status: "NOMINAL" | "NO_GO" | "HOLD_WAIVED" | "ACTIVE" | "PENDING";
  }>;
}

export interface JourneyState {
  stageStatus: Record<StageNumber, JourneyStageStatus>;
  activeGate: GateNumber | "HANDOVER";
  accountableOwner: string;
  masterVerdict: MasterVerdict;
  activeWaiverCount: number;
  hardStopStatus: "CLEAR" | "BLOCKED";
}
