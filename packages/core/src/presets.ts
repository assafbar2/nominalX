import { evaluateFlightCheck } from "./gate1.js";
import { scoreStaticFire } from "./gate2.js";
import {
  applyCrewRemediation,
  createCrewDrillState,
  startCrewAlarm,
  summarizeCrewDrill,
} from "./gate3.js";
import type {
  AccountPresetId,
  ChaosVectorId,
  CrewAlarmScenarioSpec,
  CrewDrillResult,
  FlightCheckResult,
  NominalXConfig,
  ObservedEnvironmentTelemetry,
  StaticFireResult,
  StaticFireVectorObservation,
  StationCode,
  WaiverInput,
} from "./types.js";

export interface PresetPatchDiff {
  patchKey: string;
  label: string;
  targetType: "station" | "vector";
  targetId: StationCode | ChaosVectorId;
  diffLines: string[];
}

export interface AccountPreset {
  id: AccountPresetId;
  shortSlug: "meridian" | "kestrel" | "vanguard" | "helios";
  tagline: string;
  demoRole: string;
  referenceDate: string;
  config: NominalXConfig;
  initialObserved: ObservedEnvironmentTelemetry;
  patchedObserved: ObservedEnvironmentTelemetry;
  initialChaosFailures: ChaosVectorId[];
  /** Per-vector packet corruption counts when unpatched (total 1000 packets across 7 vectors). */
  unpatchedVectorCounts: Record<
    ChaosVectorId,
    { sent: number; corrupted: number; dropped: number; p95LatencyMs: number }
  >;
  patchDiffs: PresetPatchDiff[];
  crewDrillScenarios: CrewAlarmScenarioSpec[];
  defaultCrewDrillSplitsSec: {
    runaway_ingestion_storm: number;
    sso_cert_expiring_24h: number;
    dead_p1_alert_channel: number;
  };
}

const DEFAULT_REFERENCE_DATE = "2026-11-20";

function makeMeridianPreset(): AccountPreset {
  const config: NominalXConfig = {
    schema_version: "1.0",
    account: {
      id: "meridian-fintech",
      name: "Meridian FinTech",
      industry: "Payments & Settlement",
      tier: "Enterprise Strategic",
      arr_band: "$450k ARR",
      fde_owner: "alex.rivera@vendor.io",
      cse_owner: "priya.nair@vendor.io",
      se_owner: "jordan.lee@vendor.io",
      support_owner: "sre-tier3@vendor.io",
      tam_owner: "derek.cho@vendor.io",
      customer_eng_lead: "maya.chen@meridian.example",
      customer_security_lead: "tobias.keller@meridian.example",
      customer_sre_lead: "elena.rossi@meridian.example",
      target_go_live: "2026-12-01",
      stack: {
        cloud: "aws",
        idp: "okta-saml",
        alerting: "pagerduty+slack",
        webhook_runtime: "node-express",
        deployment_tool: "terraform+argocd",
        observability: "datadog",
        ticketing: "linear",
      },
    },
    sold_contract: {
      auth: {
        protocol: "saml2",
        mfa_required: true,
        min_cert_ttl_days: 30,
        reject_unsigned_assertions: true,
      },
      residency: {
        allowed_regions: ["eu-central-1", "eu-west-1"],
        strict_egress: true,
      },
      webhooks: {
        signing: "hmac-sha256",
        dual_secret_rotation: true,
        max_clock_skew_seconds: 300,
      },
      quota: {
        guaranteed_rps: 50000,
        require_retry_after_header: true,
      },
      alerting: {
        p1_channel: "#eng-meridian-p1",
        max_ack_ms: 2000,
      },
      rollback: {
        max_rto_minutes: 5,
        dry_run_required: true,
      },
    },
    environment: {
      base_url: "http://127.0.0.1:4040",
      endpoints: {
        auth_metadata: "/sso/metadata",
        residency_probe: "/health/region",
        webhook_ingress: "/webhooks/events",
        quota_status: "/internal/quota",
        alert_sink: "/alerts/test",
        rollback_check: "/internal/rollback/dry-run",
      },
      secrets: {
        webhook_secret_current: "env:NOMINALX_WEBHOOK_SECRET",
        webhook_secret_next: "env:NOMINALX_WEBHOOK_SECRET_NEXT",
      },
    },
    waivers: [
      {
        station: "ROLLBACK",
        owner: "maya.chen@meridian.example",
        reason:
          "Automated blue/green ArgoCD cutover ships Sprint 24; verified manual DNS failover active.",
        expires_at: "2026-12-15",
        rollback_plan:
          "Run scripts/dns-failover.sh --cluster eu-central-v18 to revert traffic within 9 minutes.",
        ticket_id: "MER-4182",
        issued_at: "2026-11-20",
      },
    ],
  };

  const initialObserved: ObservedEnvironmentTelemetry = {
    auth: {
      observedProtocol: "saml2",
      mfaEnforced: true,
      certTtlDays: 184,
      rejectsUnsignedAssertions: true,
      idpIssuer: "https://meridian.okta.com/exk92af1",
      certFingerprint: "SHA256:9F:12:4A:E7:09:B4",
      evidence: {
        method: "GET",
        endpoint: "/sso/metadata",
        httpStatus: 200,
        latencyMs: 38,
        headers: {
          "content-type": "application/json",
          "x-idp-provider": "okta-saml",
        },
        payload: {
          protocol: "saml2",
          mfa_enforced: true,
          cert_ttl_days: 184,
          reject_unsigned_assertions: true,
        },
        highlightLines: ["protocol: saml2 · cert_ttl_days: 184 · mfa_enforced: true"],
      },
    },
    residency: {
      observedRegion: "us-east-1",
      storageRegions: ["eu-central-1", "us-east-1"],
      egressRegions: ["us-east-1"],
      dnsTarget: "edge-us-east-1.meridian.internal",
      evidence: {
        method: "GET",
        endpoint: "/health/region",
        httpStatus: 200,
        latencyMs: 64,
        headers: {
          "x-served-region": "us-east-1",
          "x-storage-bucket": "s3.us-east-1.amazonaws.com/meridian-staging",
        },
        payload: {
          region: "us-east-1",
          storage_regions: ["eu-central-1", "us-east-1"],
          egress_regions: ["us-east-1"],
          dns_target: "edge-us-east-1.meridian.internal",
        },
        highlightLines: [
          "X-Served-Region: us-east-1 (OUTSIDE allowed [eu-central-1, eu-west-1])",
          "storage_regions leaked to us-east-1",
        ],
      },
    },
    webhooks: {
      rejectsUnsigned: false,
      rejectsTampered: true,
      acceptsValidHmac: true,
      dualSecretRotationReady: false,
      activeKeyIds: ["v1"],
      evidence: {
        method: "POST",
        endpoint: "/webhooks/events",
        httpStatus: 200,
        latencyMs: 41,
        headers: {
          "x-webhook-runtime": "node-express",
          "x-hmac-keys-loaded": "v1",
        },
        payload: {
          unsigned_probe_status: 200,
          next_key_probe_status: 401,
          active_key_ids: ["v1"],
        },
        highlightLines: [
          "Unsigned POST /webhooks/events returned 200 OK (expected 401/403)",
          "Staged v2 HMAC key rejected with 401 (dual-secret rotation broken)",
        ],
      },
    },
    quota: {
      provisionedRps: 50000,
      returnsRetryAfterHeader: true,
      sampleRetryAfterSeconds: 2,
      burstDropRatePct: 0,
      evidence: {
        method: "GET",
        endpoint: "/internal/quota",
        httpStatus: 200,
        latencyMs: 29,
        headers: {
          "x-ratelimit-limit": "50000",
          "retry-after": "2",
        },
        payload: {
          provisioned_rps: 50000,
          returns_retry_after: true,
          sample_retry_after_seconds: 2,
          burst_drop_rate_pct: 0,
        },
        highlightLines: ["provisioned_rps: 50000 · Retry-After: 2"],
      },
    },
    alerting: {
      channelActive: true,
      channelName: "#eng-meridian-p1",
      ackLatencyMs: 310,
      providerStatus: "200 OK (pagerduty+slack)",
      evidence: {
        method: "POST",
        endpoint: "/alerts/test",
        httpStatus: 200,
        latencyMs: 310,
        headers: {
          "x-nominalx-probe": "true",
          "x-alert-channel": "#eng-meridian-p1",
        },
        payload: {
          channel_active: true,
          channel_name: "#eng-meridian-p1",
          ack_latency_ms: 310,
        },
        highlightLines: ["Synthetic P1 ACK 310ms on #eng-meridian-p1"],
      },
    },
    rollback: {
      dryRunPassed: false,
      observedRtoMinutes: 11,
      artifactVersion: "v2.4.1-rc3",
      dataLossDetected: false,
      evidence: {
        method: "POST",
        endpoint: "/internal/rollback/dry-run",
        httpStatus: 200,
        latencyMs: 185,
        headers: {
          "x-release-artifact": "v2.4.1-rc3",
        },
        payload: {
          dry_run_passed: false,
          observed_rto_minutes: 11,
          artifact_version: "v2.4.1-rc3",
          data_loss_detected: false,
        },
        highlightLines: [
          "observed_rto_minutes: 11m exceeds sold max_rto_minutes: 5m",
          "Eligible for bounded Operational Waiver (MER-4182)",
        ],
      },
    },
  };

  const patchedObserved: ObservedEnvironmentTelemetry = {
    ...initialObserved,
    residency: {
      observedRegion: "eu-central-1",
      storageRegions: ["eu-central-1", "eu-west-1"],
      egressRegions: ["eu-central-1"],
      dnsTarget: "edge-eu-central-1.meridian.internal",
      evidence: {
        method: "GET",
        endpoint: "/health/region",
        httpStatus: 200,
        latencyMs: 24,
        headers: {
          "x-served-region": "eu-central-1",
          "x-storage-bucket": "s3.eu-central-1.amazonaws.com/meridian-prod",
        },
        payload: {
          region: "eu-central-1",
          storage_regions: ["eu-central-1", "eu-west-1"],
          egress_regions: ["eu-central-1"],
          dns_target: "edge-eu-central-1.meridian.internal",
        },
        highlightLines: ["X-Served-Region: eu-central-1 (EU allowlist verified)"],
      },
    },
    webhooks: {
      rejectsUnsigned: true,
      rejectsTampered: true,
      acceptsValidHmac: true,
      dualSecretRotationReady: true,
      activeKeyIds: ["v1", "v2"],
      evidence: {
        method: "POST",
        endpoint: "/webhooks/events",
        httpStatus: 200,
        latencyMs: 28,
        headers: {
          "x-webhook-runtime": "node-express",
          "x-hmac-keys-loaded": "v1,v2",
        },
        payload: {
          unsigned_probe_status: 401,
          next_key_probe_status: 200,
          active_key_ids: ["v1", "v2"],
        },
        highlightLines: ["Unsigned rejected (401) · Dual-key [v1, v2] active"],
      },
    },
    rollback: {
      dryRunPassed: true,
      observedRtoMinutes: 3.2,
      artifactVersion: "v2.4.1",
      dataLossDetected: false,
      evidence: {
        method: "POST",
        endpoint: "/internal/rollback/dry-run",
        httpStatus: 200,
        latencyMs: 112,
        headers: { "x-release-artifact": "v2.4.1" },
        payload: {
          dry_run_passed: true,
          observed_rto_minutes: 3.2,
          artifact_version: "v2.4.1",
          data_loss_detected: false,
        },
        highlightLines: ["Dry-run rollback passed in 3.2m (<= 5m RTO)"],
      },
    },
  };

  return {
    id: "meridian-fintech",
    shortSlug: "meridian",
    tagline: "Payments · EU-Strict · Okta SAML · 50k RPS",
    demoRole: "Primary 90-second walkthrough",
    referenceDate: DEFAULT_REFERENCE_DATE,
    config,
    initialObserved,
    patchedObserved,
    initialChaosFailures: [
      "duplicate_webhook",
      "out_of_order",
      "dual_hmac_rotation",
    ],
    // 140 + 112 + 90 = 342 corrupted out of 1000 => 34.2% (Grade F)
    unpatchedVectorCounts: {
      duplicate_webhook: { sent: 160, corrupted: 140, dropped: 0, p95LatencyMs: 68 },
      out_of_order: { sent: 140, corrupted: 112, dropped: 0, p95LatencyMs: 54 },
      rate_limit_429: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 39 },
      upstream_timeout_30s: { sent: 120, corrupted: 0, dropped: 0, p95LatencyMs: 145 },
      dual_hmac_rotation: { sent: 160, corrupted: 90, dropped: 90, p95LatencyMs: 42 },
      additive_json_fields: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 28 },
      clock_skew_5m: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 31 },
    },
    patchDiffs: [
      {
        patchKey: "residency",
        label: "Pin AWS EU-Central-1 Routing & Storage",
        targetType: "station",
        targetId: "RESIDENCY",
        diffLines: [
          "- aws_region = \"us-east-1\"",
          "+ aws_region = \"eu-central-1\"",
          "+ strict_eu_egress = true",
        ],
      },
      {
        patchKey: "webhooks",
        label: "Enforce Strict HMAC + Dual-Key Ring",
        targetType: "station",
        targetId: "WEBHOOKS",
        diffLines: [
          "- allowUnsignedInStaging: true",
          "+ allowUnsignedInStaging: false",
          "+ hmacSecrets: [env.WEBHOOK_SECRET, env.WEBHOOK_SECRET_NEXT]",
        ],
      },
      {
        patchKey: "idempotency",
        label: "Enable Atomic event_id Idempotency Store",
        targetType: "vector",
        targetId: "duplicate_webhook",
        diffLines: [
          "- await ledger.insert(event)",
          "+ await ledger.insertIfAbsent(event.id, event) // Redis NX + DB unique",
        ],
      },
      {
        patchKey: "ordering",
        label: "Enable Monotonic Sequence & Terminal State Guard",
        targetType: "vector",
        targetId: "out_of_order",
        diffLines: [
          "- await subscriptions.upsert(event.entity_id, event.state)",
          "+ await subscriptions.transitionIfNewer(event.entity_id, event.version, event.state)",
        ],
      },
      {
        patchKey: "dual-hmac",
        label: "Verify Ordered [v1, v2] Keyring",
        targetType: "vector",
        targetId: "dual_hmac_rotation",
        diffLines: [
          "- verifyHmac(body, sig, currentSecret)",
          "+ verifyAnyHmac(body, sig, [currentSecret, nextSecret])",
        ],
      },
    ],
    crewDrillScenarios: buildCrewScenarios({
      runawaySourceKey: "src_meridian_batch_importer_09",
      rateCapRps: 5000,
      stagedCertFingerprint: "SHA256:4D:88:C1:92:FA:11",
      deadChannel: "#eng-meridian-legacy-archived",
      activeChannel: "#eng-meridian-p1",
    }),
    defaultCrewDrillSplitsSec: {
      runaway_ingestion_storm: 24.6,
      sso_cert_expiring_24h: 19.2,
      dead_p1_alert_channel: 15.8,
    },
  };
}

function makeKestrelPreset(): AccountPreset {
  const config: NominalXConfig = {
    schema_version: "1.0",
    account: {
      id: "kestrel-health",
      name: "Kestrel Health",
      industry: "HIPAA Clinical Systems",
      tier: "Enterprise Regulated",
      arr_band: "$320k ARR",
      fde_owner: "sam.patel@vendor.io",
      cse_owner: "claire.bennett@vendor.io",
      se_owner: "jordan.lee@vendor.io",
      support_owner: "hipaa-support@vendor.io",
      tam_owner: "derek.cho@vendor.io",
      customer_eng_lead: "dr.hannah.brooks@kestrel.example",
      customer_security_lead: "marcus.wright@kestrel.example",
      customer_sre_lead: "devon.okafor@kestrel.example",
      target_go_live: "2026-12-05",
      stack: {
        cloud: "gcp",
        idp: "entra-oidc",
        alerting: "pagerduty",
        webhook_runtime: "go-chi",
        deployment_tool: "terraform+cloudbuild",
        observability: "prometheus+grafana",
        ticketing: "jira",
      },
    },
    sold_contract: {
      auth: {
        protocol: "oidc",
        mfa_required: true,
        min_cert_ttl_days: 30,
        reject_unsigned_assertions: true,
      },
      residency: {
        allowed_regions: ["us-east-1", "us-west-2"],
        strict_egress: true,
      },
      webhooks: {
        signing: "hmac-sha256",
        dual_secret_rotation: true,
        max_clock_skew_seconds: 300,
      },
      quota: {
        guaranteed_rps: 20000,
        require_retry_after_header: true,
      },
      alerting: {
        p1_channel: "#hipaa-sre-p1",
        max_ack_ms: 1500,
      },
      rollback: {
        max_rto_minutes: 5,
        dry_run_required: true,
      },
    },
    environment: {
      base_url: "http://127.0.0.1:4041",
      endpoints: {
        auth_metadata: "/sso/metadata",
        residency_probe: "/health/region",
        webhook_ingress: "/webhooks/events",
        quota_status: "/internal/quota",
        alert_sink: "/alerts/test",
        rollback_check: "/internal/rollback/dry-run",
      },
      secrets: {
        webhook_secret_current: "env:NOMINALX_WEBHOOK_SECRET",
        webhook_secret_next: "env:NOMINALX_WEBHOOK_SECRET_NEXT",
      },
    },
    waivers: [],
  };

  const initialObserved: ObservedEnvironmentTelemetry = {
    auth: {
      observedProtocol: "oidc",
      mfaEnforced: true,
      certTtlDays: 0.75,
      rejectsUnsignedAssertions: true,
      idpIssuer: "https://login.microsoftonline.com/kestrel-tenant",
      certFingerprint: "SHA256:AA:01:FE:33:8B:09",
      evidence: {
        method: "GET",
        endpoint: "/sso/metadata",
        httpStatus: 200,
        latencyMs: 44,
        headers: {
          "x-idp-provider": "entra-oidc",
          "x-cert-ttl-hours": "18",
        },
        payload: {
          protocol: "oidc",
          mfa_enforced: true,
          cert_ttl_days: 0.75,
          reject_unsigned_assertions: true,
        },
        highlightLines: [
          "HARD STOP: Signing certificate expires in 18h (0.75d < 30d contract minimum)",
        ],
      },
    },
    residency: {
      observedRegion: "us-east-1",
      storageRegions: ["us-east-1", "us-west-2"],
      egressRegions: ["us-east-1"],
      dnsTarget: "hipaa-us-east-1.kestrel.internal",
      evidence: {
        method: "GET",
        endpoint: "/health/region",
        httpStatus: 200,
        latencyMs: 26,
        headers: { "x-served-region": "us-east-1" },
        payload: {
          region: "us-east-1",
          storage_regions: ["us-east-1", "us-west-2"],
          egress_regions: ["us-east-1"],
        },
        highlightLines: ["X-Served-Region: us-east-1 (US HIPAA boundary verified)"],
      },
    },
    webhooks: {
      rejectsUnsigned: true,
      rejectsTampered: true,
      acceptsValidHmac: true,
      dualSecretRotationReady: true,
      activeKeyIds: ["v1", "v2"],
      evidence: {
        method: "POST",
        endpoint: "/webhooks/events",
        httpStatus: 200,
        latencyMs: 22,
        headers: { "x-hmac-keys-loaded": "v1,v2" },
        payload: { unsigned_probe_status: 401, active_key_ids: ["v1", "v2"] },
        highlightLines: ["HMAC-SHA256 dual-key [v1, v2] verified"],
      },
    },
    quota: {
      provisionedRps: 25000,
      returnsRetryAfterHeader: true,
      sampleRetryAfterSeconds: 1,
      burstDropRatePct: 0,
      evidence: {
        method: "GET",
        endpoint: "/internal/quota",
        httpStatus: 200,
        latencyMs: 19,
        headers: { "x-ratelimit-limit": "25000", "retry-after": "1" },
        payload: { provisioned_rps: 25000, returns_retry_after: true },
        highlightLines: ["provisioned_rps: 25000 >= 20000"],
      },
    },
    alerting: {
      channelActive: false,
      channelName: "#hipaa-sre-legacy",
      ackLatencyMs: 0,
      providerStatus: "404 channel_not_found (archived)",
      evidence: {
        method: "POST",
        endpoint: "/alerts/test",
        httpStatus: 404,
        latencyMs: 148,
        headers: { "x-alert-error": "channel_not_found" },
        payload: {
          channel_active: false,
          channel_name: "#hipaa-sre-legacy",
          error: "404 channel_not_found",
        },
        highlightLines: [
          "POST /alerts/test returned 404 channel_not_found (#hipaa-sre-legacy archived)",
        ],
      },
    },
    rollback: {
      dryRunPassed: true,
      observedRtoMinutes: 3.5,
      artifactVersion: "v1.14.0",
      dataLossDetected: false,
      evidence: {
        method: "POST",
        endpoint: "/internal/rollback/dry-run",
        httpStatus: 200,
        latencyMs: 95,
        headers: { "x-release-artifact": "v1.14.0" },
        payload: { dry_run_passed: true, observed_rto_minutes: 3.5 },
        highlightLines: ["Dry-run rollback passed in 3.5m <= 5m RTO"],
      },
    },
  };

  const patchedObserved: ObservedEnvironmentTelemetry = {
    ...initialObserved,
    auth: {
      ...initialObserved.auth,
      certTtlDays: 365,
      certFingerprint: "SHA256:BB:44:9E:12:0C:77",
      evidence: {
        ...initialObserved.auth.evidence,
        headers: { "x-idp-provider": "entra-oidc", "x-cert-ttl-days": "365" },
        payload: {
          protocol: "oidc",
          mfa_enforced: true,
          cert_ttl_days: 365,
          reject_unsigned_assertions: true,
        },
        highlightLines: ["Rotated Entra OIDC signing cert (TTL 365d)"],
      },
    },
    alerting: {
      channelActive: true,
      channelName: "#hipaa-sre-p1",
      ackLatencyMs: 245,
      providerStatus: "200 OK (pagerduty)",
      evidence: {
        method: "POST",
        endpoint: "/alerts/test",
        httpStatus: 200,
        latencyMs: 245,
        headers: { "x-alert-channel": "#hipaa-sre-p1" },
        payload: {
          channel_active: true,
          channel_name: "#hipaa-sre-p1",
          ack_latency_ms: 245,
        },
        highlightLines: ["Synthetic P1 ACK 245ms on #hipaa-sre-p1"],
      },
    },
  };

  return {
    id: "kestrel-health",
    shortSlug: "kestrel",
    tagline: "HIPAA Healthcare · Entra OIDC · Strict Timeouts",
    demoRole: "Compliance & timeout resilience",
    referenceDate: DEFAULT_REFERENCE_DATE,
    config,
    initialObserved,
    patchedObserved,
    initialChaosFailures: [
      "upstream_timeout_30s",
      "clock_skew_5m",
      "duplicate_webhook",
      "additive_json_fields",
    ],
    // 130 + 100 + 100 + 80 = 410 corrupted / 1000 => 41.0% (Grade F)
    unpatchedVectorCounts: {
      duplicate_webhook: { sent: 140, corrupted: 100, dropped: 0, p95LatencyMs: 52 },
      out_of_order: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 35 },
      rate_limit_429: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 41 },
      upstream_timeout_30s: { sent: 150, corrupted: 130, dropped: 130, p95LatencyMs: 30000 },
      dual_hmac_rotation: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 29 },
      additive_json_fields: { sent: 140, corrupted: 80, dropped: 80, p95LatencyMs: 48 },
      clock_skew_5m: { sent: 150, corrupted: 100, dropped: 100, p95LatencyMs: 37 },
    },
    patchDiffs: [
      {
        patchKey: "auth",
        label: "Promote 365d Entra OIDC Signing Certificate",
        targetType: "station",
        targetId: "AUTH_SSO",
        diffLines: [
          "- oidc_signing_cert_id: cert-2025-expiring",
          "+ oidc_signing_cert_id: cert-2026-365d",
        ],
      },
      {
        patchKey: "alerting",
        label: "Rebind P1 Webhook to #hipaa-sre-p1",
        targetType: "station",
        targetId: "ALERTING",
        diffLines: [
          "- p1_channel: #hipaa-sre-legacy",
          "+ p1_channel: #hipaa-sre-p1",
        ],
      },
      {
        patchKey: "timeout",
        label: "Add context.WithTimeout + Async DLQ Handoff",
        targetType: "vector",
        targetId: "upstream_timeout_30s",
        diffLines: [
          "- resp, err := client.Do(req)",
          "+ ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second); defer cancel()",
          "+ enqueueDlqOnDeadline(ctx, payload)",
        ],
      },
      {
        patchKey: "clock-skew",
        label: "Enforce +-300s Replay Window",
        targetType: "vector",
        targetId: "clock_skew_5m",
        diffLines: [
          "- const maxSkewSec = 30",
          "+ const maxSkewSec = 300",
        ],
      },
      {
        patchKey: "idempotency",
        label: "Enable Atomic Idempotency Key Table",
        targetType: "vector",
        targetId: "duplicate_webhook",
        diffLines: [
          "+ INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING",
        ],
      },
      {
        patchKey: "additive-json",
        label: "Disable DisallowUnknownFields() on JSON Decoder",
        targetType: "vector",
        targetId: "additive_json_fields",
        diffLines: [
          "- dec.DisallowUnknownFields()",
          "+ // Tolerant reader: ignore unknown additive fields",
        ],
      },
    ],
    crewDrillScenarios: buildCrewScenarios({
      runawaySourceKey: "src_kestrel_ehr_backfill_04",
      rateCapRps: 2500,
      stagedCertFingerprint: "SHA256:BB:44:9E:12:0C:77",
      deadChannel: "#hipaa-sre-legacy",
      activeChannel: "#hipaa-sre-p1",
    }),
    defaultCrewDrillSplitsSec: {
      runaway_ingestion_storm: 28.4,
      sso_cert_expiring_24h: 17.5,
      dead_p1_alert_channel: 14.1,
    },
  };
}

function makeVanguardPreset(): AccountPreset {
  const config: NominalXConfig = {
    schema_version: "1.0",
    account: {
      id: "vanguard-retail",
      name: "Vanguard Retail",
      industry: "High-Throughput Peak Commerce",
      tier: "Enterprise High-Volume",
      arr_band: "$600k ARR",
      fde_owner: "marcus.chen@vendor.io",
      cse_owner: "nina.alvarez@vendor.io",
      se_owner: "jordan.lee@vendor.io",
      support_owner: "commerce-support@vendor.io",
      tam_owner: "rachel.kim@vendor.io",
      customer_eng_lead: "omar.farooq@vanguard.example",
      customer_security_lead: "chloe.grant@vanguard.example",
      customer_sre_lead: "liam.murphy@vanguard.example",
      target_go_live: "2026-12-03",
      stack: {
        cloud: "aws",
        idp: "okta-oidc",
        alerting: "opsgenie+slack",
        webhook_runtime: "python-fastapi",
        deployment_tool: "github-actions+argocd",
        observability: "newrelic",
        ticketing: "jira",
      },
    },
    sold_contract: {
      auth: {
        protocol: "oidc",
        mfa_required: true,
        min_cert_ttl_days: 30,
        reject_unsigned_assertions: true,
      },
      residency: {
        allowed_regions: ["us-east-1", "us-west-2", "eu-west-1"],
        strict_egress: true,
      },
      webhooks: {
        signing: "hmac-sha256",
        dual_secret_rotation: true,
        max_clock_skew_seconds: 300,
      },
      quota: {
        guaranteed_rps: 50000,
        require_retry_after_header: true,
      },
      alerting: {
        p1_channel: "#commerce-p1-ops",
        max_ack_ms: 2000,
      },
      rollback: {
        max_rto_minutes: 5,
        dry_run_required: true,
      },
    },
    environment: {
      base_url: "http://127.0.0.1:4042",
      endpoints: {
        auth_metadata: "/sso/metadata",
        residency_probe: "/health/region",
        webhook_ingress: "/webhooks/events",
        quota_status: "/internal/quota",
        alert_sink: "/alerts/test",
        rollback_check: "/internal/rollback/dry-run",
      },
      secrets: {
        webhook_secret_current: "env:NOMINALX_WEBHOOK_SECRET",
        webhook_secret_next: "env:NOMINALX_WEBHOOK_SECRET_NEXT",
      },
    },
    waivers: [],
  };

  const initialObserved: ObservedEnvironmentTelemetry = {
    auth: {
      observedProtocol: "oidc",
      mfaEnforced: true,
      certTtlDays: 210,
      rejectsUnsignedAssertions: true,
      evidence: {
        method: "GET",
        endpoint: "/sso/metadata",
        httpStatus: 200,
        latencyMs: 31,
        headers: { "x-idp-provider": "okta-oidc" },
        payload: { protocol: "oidc", mfa_enforced: true, cert_ttl_days: 210 },
        highlightLines: ["Okta OIDC verified (TTL 210d)"],
      },
    },
    residency: {
      observedRegion: "us-east-1",
      storageRegions: ["us-east-1", "eu-west-1"],
      egressRegions: ["us-east-1"],
      dnsTarget: "edge-us-east-1.vanguard.internal",
      evidence: {
        method: "GET",
        endpoint: "/health/region",
        httpStatus: 200,
        latencyMs: 21,
        headers: { "x-served-region": "us-east-1" },
        payload: {
          region: "us-east-1",
          storage_regions: ["us-east-1", "eu-west-1"],
          egress_regions: ["us-east-1"],
        },
        highlightLines: ["Multi-region allowlist verified"],
      },
    },
    webhooks: {
      rejectsUnsigned: false,
      rejectsTampered: false,
      acceptsValidHmac: true,
      dualSecretRotationReady: true,
      activeKeyIds: ["v1", "v2"],
      evidence: {
        method: "POST",
        endpoint: "/webhooks/events",
        httpStatus: 200,
        latencyMs: 34,
        headers: { "x-webhook-runtime": "python-fastapi" },
        payload: {
          unsigned_probe_status: 200,
          tampered_probe_status: 200,
        },
        highlightLines: [
          "Unsigned and tampered webhook probes accepted (200 OK) — HMAC middleware bypassed",
        ],
      },
    },
    quota: {
      provisionedRps: 5000,
      returnsRetryAfterHeader: false,
      sampleRetryAfterSeconds: null,
      burstDropRatePct: 18.5,
      evidence: {
        method: "GET",
        endpoint: "/internal/quota",
        httpStatus: 200,
        latencyMs: 28,
        headers: { "x-ratelimit-limit": "5000" },
        payload: {
          provisioned_rps: 5000,
          returns_retry_after: false,
          burst_drop_rate_pct: 18.5,
        },
        highlightLines: [
          "Provisioned quota 5,000 RPS << sold 50,000 RPS",
          "429/503 responses missing Retry-After header",
        ],
      },
    },
    alerting: {
      channelActive: true,
      channelName: "#commerce-p1-ops",
      ackLatencyMs: 290,
      providerStatus: "200 OK (opsgenie+slack)",
      evidence: {
        method: "POST",
        endpoint: "/alerts/test",
        httpStatus: 200,
        latencyMs: 290,
        headers: { "x-alert-channel": "#commerce-p1-ops" },
        payload: { channel_active: true, ack_latency_ms: 290 },
        highlightLines: ["Synthetic P1 ACK 290ms on #commerce-p1-ops"],
      },
    },
    rollback: {
      dryRunPassed: true,
      observedRtoMinutes: 2.8,
      artifactVersion: "v4.11.2",
      dataLossDetected: false,
      evidence: {
        method: "POST",
        endpoint: "/internal/rollback/dry-run",
        httpStatus: 200,
        latencyMs: 88,
        headers: { "x-release-artifact": "v4.11.2" },
        payload: { dry_run_passed: true, observed_rto_minutes: 2.8 },
        highlightLines: ["ArgoCD rollback dry-run passed in 2.8m"],
      },
    },
  };

  const patchedObserved: ObservedEnvironmentTelemetry = {
    ...initialObserved,
    webhooks: {
      rejectsUnsigned: true,
      rejectsTampered: true,
      acceptsValidHmac: true,
      dualSecretRotationReady: true,
      activeKeyIds: ["v1", "v2"],
      evidence: {
        ...initialObserved.webhooks.evidence,
        payload: { unsigned_probe_status: 401, tampered_probe_status: 401 },
        highlightLines: ["HMAC verification enforced on FastAPI ingress"],
      },
    },
    quota: {
      provisionedRps: 50000,
      returnsRetryAfterHeader: true,
      sampleRetryAfterSeconds: 2,
      burstDropRatePct: 0,
      evidence: {
        ...initialObserved.quota.evidence,
        headers: { "x-ratelimit-limit": "50000", "retry-after": "2" },
        payload: {
          provisioned_rps: 50000,
          returns_retry_after: true,
          sample_retry_after_seconds: 2,
          burst_drop_rate_pct: 0,
        },
        highlightLines: ["Quota raised to 50,000 RPS with Retry-After: 2"],
      },
    },
  };

  return {
    id: "vanguard-retail",
    shortSlug: "vanguard",
    tagline: "Peak Commerce · FastAPI · 50k RPS Burst",
    demoRole: "Burst & rate-limit resilience",
    referenceDate: DEFAULT_REFERENCE_DATE,
    config,
    initialObserved,
    patchedObserved,
    initialChaosFailures: [
      "rate_limit_429",
      "additive_json_fields",
      "duplicate_webhook",
    ],
    // 68 + 42 + 38 = 148 corrupted / 1000 => 14.8% (Grade D)
    unpatchedVectorCounts: {
      duplicate_webhook: { sent: 140, corrupted: 38, dropped: 0, p95LatencyMs: 55 },
      out_of_order: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 32 },
      rate_limit_429: { sent: 160, corrupted: 68, dropped: 68, p95LatencyMs: 210 },
      upstream_timeout_30s: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 118 },
      dual_hmac_rotation: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 29 },
      additive_json_fields: { sent: 140, corrupted: 42, dropped: 42, p95LatencyMs: 44 },
      clock_skew_5m: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 30 },
    },
    patchDiffs: [
      {
        patchKey: "quota",
        label: "Raise API Gateway Tier to 50k RPS + Retry-After",
        targetType: "station",
        targetId: "QUOTA_RATE",
        diffLines: [
          "- rate_limit_rps = 5000",
          "+ rate_limit_rps = 50000",
          "+ include_retry_after_header = true",
        ],
      },
      {
        patchKey: "webhooks",
        label: "Require Valid HMAC Signature on FastAPI Route",
        targetType: "station",
        targetId: "WEBHOOKS",
        diffLines: [
          "- @app.post('/webhooks/events')",
          "+ @app.post('/webhooks/events', dependencies=[Depends(verify_hmac_dual)])",
        ],
      },
      {
        patchKey: "rate-limit",
        label: "Add Exponential Backoff + Jitter on 429",
        targetType: "vector",
        targetId: "rate_limit_429",
        diffLines: [
          "- retry_delay = 0",
          "+ retry_delay = max(retry_after, min(30, 2**attempt + jitter()))",
        ],
      },
      {
        patchKey: "additive-json",
        label: "Set Pydantic model_config extra='ignore'",
        targetType: "vector",
        targetId: "additive_json_fields",
        diffLines: [
          "- model_config = ConfigDict(extra='forbid')",
          "+ model_config = ConfigDict(extra='ignore')",
        ],
      },
      {
        patchKey: "idempotency",
        label: "Deduplicate event_id via Redis SETNX",
        targetType: "vector",
        targetId: "duplicate_webhook",
        diffLines: [
          "+ if not await redis.set(f'evt:{event.id}', '1', nx=True, ex=86400): return {'deduplicated': True}",
        ],
      },
    ],
    crewDrillScenarios: buildCrewScenarios({
      runawaySourceKey: "src_vanguard_flash_sale_bot_12",
      rateCapRps: 8000,
      stagedCertFingerprint: "SHA256:CC:72:11:A4:E0:55",
      deadChannel: "#commerce-p1-old",
      activeChannel: "#commerce-p1-ops",
    }),
    defaultCrewDrillSplitsSec: {
      runaway_ingestion_storm: 21.3,
      sso_cert_expiring_24h: 22.0,
      dead_p1_alert_channel: 16.4,
    },
  };
}

function makeHeliosPreset(): AccountPreset {
  const config: NominalXConfig = {
    schema_version: "1.0",
    account: {
      id: "helios-logistics",
      name: "Helios Logistics",
      industry: "Global Freight & Supply Chain",
      tier: "Enterprise Global",
      arr_band: "$280k ARR",
      fde_owner: "alex.rivera@vendor.io",
      cse_owner: "priya.nair@vendor.io",
      se_owner: "jordan.lee@vendor.io",
      support_owner: "global-support@vendor.io",
      tam_owner: "rachel.kim@vendor.io",
      customer_eng_lead: "kenji.tanaka@helios.example",
      customer_security_lead: "sofia.lindqvist@helios.example",
      customer_sre_lead: "lucas.mendes@helios.example",
      target_go_live: "2026-11-28",
      stack: {
        cloud: "gcp",
        idp: "okta-saml",
        alerting: "pagerduty+slack",
        webhook_runtime: "java-spring",
        deployment_tool: "helm+argocd",
        observability: "datadog",
        ticketing: "linear",
      },
    },
    sold_contract: {
      auth: {
        protocol: "saml2",
        mfa_required: true,
        min_cert_ttl_days: 30,
        reject_unsigned_assertions: true,
      },
      residency: {
        allowed_regions: ["eu-central-1", "ap-southeast-1"],
        strict_egress: true,
      },
      webhooks: {
        signing: "hmac-sha256",
        dual_secret_rotation: true,
        max_clock_skew_seconds: 300,
      },
      quota: {
        guaranteed_rps: 15000,
        require_retry_after_header: true,
      },
      alerting: {
        p1_channel: "#helios-platform-p1",
        max_ack_ms: 2000,
      },
      rollback: {
        max_rto_minutes: 5,
        dry_run_required: true,
      },
    },
    environment: {
      base_url: "http://127.0.0.1:4043",
      endpoints: {
        auth_metadata: "/sso/metadata",
        residency_probe: "/health/region",
        webhook_ingress: "/webhooks/events",
        quota_status: "/internal/quota",
        alert_sink: "/alerts/test",
        rollback_check: "/internal/rollback/dry-run",
      },
      secrets: {
        webhook_secret_current: "env:NOMINALX_WEBHOOK_SECRET",
        webhook_secret_next: "env:NOMINALX_WEBHOOK_SECRET_NEXT",
      },
    },
    waivers: [
      {
        station: "ROLLBACK",
        owner: "kenji.tanaka@helios.example",
        reason:
          "Helm automated canary revert finishes next week; verified manual Helm rollback script ready.",
        expires_at: "2026-12-10",
        rollback_plan:
          "Run helm rollback helios-ingress 42 --namespace prod-eu (verified 7m RTO).",
        ticket_id: "HEL-903",
        issued_at: "2026-11-20",
      },
    ],
  };

  const initialObserved: ObservedEnvironmentTelemetry = {
    auth: {
      observedProtocol: "saml2",
      mfaEnforced: true,
      certTtlDays: 290,
      rejectsUnsignedAssertions: true,
      evidence: {
        method: "GET",
        endpoint: "/sso/metadata",
        httpStatus: 200,
        latencyMs: 28,
        headers: { "x-idp-provider": "okta-saml" },
        payload: { protocol: "saml2", mfa_enforced: true, cert_ttl_days: 290 },
        highlightLines: ["Okta SAML2 verified (TTL 290d)"],
      },
    },
    residency: {
      observedRegion: "eu-central-1",
      storageRegions: ["eu-central-1", "ap-southeast-1"],
      egressRegions: ["eu-central-1"],
      dnsTarget: "edge-eu-central-1.helios.internal",
      evidence: {
        method: "GET",
        endpoint: "/health/region",
        httpStatus: 200,
        latencyMs: 25,
        headers: { "x-served-region": "eu-central-1" },
        payload: {
          region: "eu-central-1",
          storage_regions: ["eu-central-1", "ap-southeast-1"],
          egress_regions: ["eu-central-1"],
        },
        highlightLines: ["EU/APAC regional boundaries verified"],
      },
    },
    webhooks: {
      rejectsUnsigned: true,
      rejectsTampered: true,
      acceptsValidHmac: true,
      dualSecretRotationReady: true,
      activeKeyIds: ["v1", "v2"],
      evidence: {
        method: "POST",
        endpoint: "/webhooks/events",
        httpStatus: 200,
        latencyMs: 24,
        headers: { "x-hmac-keys-loaded": "v1,v2" },
        payload: { unsigned_probe_status: 401, active_key_ids: ["v1", "v2"] },
        highlightLines: ["HMAC-SHA256 verified"],
      },
    },
    quota: {
      provisionedRps: 20000,
      returnsRetryAfterHeader: true,
      sampleRetryAfterSeconds: 2,
      burstDropRatePct: 0,
      evidence: {
        method: "GET",
        endpoint: "/internal/quota",
        httpStatus: 200,
        latencyMs: 20,
        headers: { "x-ratelimit-limit": "20000", "retry-after": "2" },
        payload: { provisioned_rps: 20000, returns_retry_after: true },
        highlightLines: ["20,000 RPS provisioned >= 15,000 sold"],
      },
    },
    alerting: {
      channelActive: true,
      channelName: "#helios-platform-p1",
      ackLatencyMs: 260,
      providerStatus: "200 OK (pagerduty+slack)",
      evidence: {
        method: "POST",
        endpoint: "/alerts/test",
        httpStatus: 200,
        latencyMs: 260,
        headers: { "x-alert-channel": "#helios-platform-p1" },
        payload: { channel_active: true, ack_latency_ms: 260 },
        highlightLines: ["Synthetic P1 ACK 260ms on #helios-platform-p1"],
      },
    },
    rollback: {
      dryRunPassed: false,
      observedRtoMinutes: 7.2,
      artifactVersion: "v3.8.0",
      dataLossDetected: false,
      evidence: {
        method: "POST",
        endpoint: "/internal/rollback/dry-run",
        httpStatus: 200,
        latencyMs: 140,
        headers: { "x-release-artifact": "v3.8.0" },
        payload: { dry_run_passed: false, observed_rto_minutes: 7.2 },
        highlightLines: [
          "observed_rto_minutes: 7.2m > 5m (covered by active Operational Waiver HEL-903)",
        ],
      },
    },
  };

  const patchedObserved: ObservedEnvironmentTelemetry = {
    ...initialObserved,
    rollback: {
      dryRunPassed: true,
      observedRtoMinutes: 3.1,
      artifactVersion: "v3.8.1",
      dataLossDetected: false,
      evidence: {
        ...initialObserved.rollback.evidence,
        payload: { dry_run_passed: true, observed_rto_minutes: 3.1 },
        highlightLines: ["Automated canary revert passed in 3.1m <= 5m"],
      },
    },
  };

  return {
    id: "helios-logistics",
    shortSlug: "helios",
    tagline: "Global Supply Chain · Near-Launch · 1 Active Waiver",
    demoRole: "Fast near-green / waiver showcase",
    referenceDate: DEFAULT_REFERENCE_DATE,
    config,
    initialObserved,
    patchedObserved,
    initialChaosFailures: ["dual_hmac_rotation"],
    // 10 corrupted / 1000 => 1.0% (Grade B)
    unpatchedVectorCounts: {
      duplicate_webhook: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 29 },
      out_of_order: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 31 },
      rate_limit_429: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 36 },
      upstream_timeout_30s: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 92 },
      dual_hmac_rotation: { sent: 160, corrupted: 10, dropped: 10, p95LatencyMs: 44 },
      additive_json_fields: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 25 },
      clock_skew_5m: { sent: 140, corrupted: 0, dropped: 0, p95LatencyMs: 28 },
    },
    patchDiffs: [
      {
        patchKey: "dual-hmac",
        label: "Accept Staged v2 HMAC Secret in Spring Filter",
        targetType: "vector",
        targetId: "dual_hmac_rotation",
        diffLines: [
          "- hmacVerifier.verify(rawBody, signature, primaryKey);",
          "+ hmacVerifier.verifyAny(rawBody, signature, List.of(primaryKey, stagedNextKey));",
        ],
      },
    ],
    crewDrillScenarios: buildCrewScenarios({
      runawaySourceKey: "src_helios_customs_sync_02",
      rateCapRps: 3000,
      stagedCertFingerprint: "SHA256:DD:31:8F:22:19:AB",
      deadChannel: "#helios-alerts-deprecated",
      activeChannel: "#helios-platform-p1",
    }),
    defaultCrewDrillSplitsSec: {
      runaway_ingestion_storm: 18.9,
      sso_cert_expiring_24h: 16.2,
      dead_p1_alert_channel: 12.5,
    },
  };
}

function buildCrewScenarios(params: {
  runawaySourceKey: string;
  rateCapRps: number;
  stagedCertFingerprint: string;
  deadChannel: string;
  activeChannel: string;
}): CrewAlarmScenarioSpec[] {
  return [
    {
      alarmId: "runaway_ingestion_storm",
      index: 1,
      subStage: "1 of 3",
      alarmName: "Runaway ingestion storm spiking quota/spend",
      shortName: "Ingestion Storm",
      severity: "P1",
      metricLabel: "Ingest RPS",
      metricUnit: "RPS",
      slaThreshold: params.rateCapRps,
      initialValue: params.rateCapRps * 3.4,
      stabilizedValue: Math.round(params.rateCapRps * 0.68),
      errorTrace: [
        `ALERT P1: Quota burn at 340% of contracted ceiling`,
        `TOP_OFFENDER source_key=${params.runawaySourceKey} rps=${params.rateCapRps * 3.4}`,
        `STATUS: DLQ overflow disabled · retry amplification climbing`,
      ],
      expectedRemediation: {
        summary: `Isolate ${params.runawaySourceKey}, cap <= ${params.rateCapRps} RPS, enable DLQ overflow.`,
        requiredPatch: {
          isolated_source_key: params.runawaySourceKey,
          rate_cap_rps: params.rateCapRps,
          dlq_overflow_enabled: true,
        },
      },
      defaultContext: {
        isolated_source_key: "none",
        rate_cap_rps: 999999,
        dlq_overflow_enabled: false,
      },
    },
    {
      alarmId: "sso_cert_expiring_24h",
      index: 2,
      subStage: "2 of 3",
      alarmName: "SSO certificate expiring within 24 hours",
      shortName: "SSO Cert <24h",
      severity: "P1",
      metricLabel: "Cert TTL",
      metricUnit: "hours",
      slaThreshold: 720,
      initialValue: 18,
      stabilizedValue: 8760,
      errorTrace: [
        "ALERT P1: Active IdP signing certificate TTL = 18h (< 24h emergency floor)",
        `STAGED_CERT_READY fingerprint=${params.stagedCertFingerprint} ttl=365d`,
        "ACTION REQUIRED: Promote staged cert in dual-cert grace mode & verify live SSO handshake",
      ],
      expectedRemediation: {
        summary: `Promote ${params.stagedCertFingerprint} with dual_cert_grace_mode=true.`,
        requiredPatch: {
          promote_cert_fingerprint: params.stagedCertFingerprint,
          dual_cert_grace_mode: true,
        },
      },
      defaultContext: {
        promote_cert_fingerprint: "SHA256:OLD:EXPIRING:CERT",
        dual_cert_grace_mode: false,
      },
    },
    {
      alarmId: "dead_p1_alert_channel",
      index: 3,
      subStage: "3 of 3",
      alarmName: "P1 alerts routing to a dead/archived channel",
      shortName: "Dead P1 Route",
      severity: "P1",
      metricLabel: "Alert Delivery Failure",
      metricUnit: "%",
      slaThreshold: 0,
      initialValue: 100,
      stabilizedValue: 0,
      errorTrace: [
        `POST /alerts/test -> 404 channel_not_found (${params.deadChannel} archived)`,
        `VERIFIED_ACTIVE_TARGET channel=${params.activeChannel}`,
        "ACTION REQUIRED: Rebind P1 route to active ops channel & confirm live 200 OK ping",
      ],
      expectedRemediation: {
        summary: `Rebind active_p1_channel to ${params.activeChannel} and confirm synthetic test ping.`,
        requiredPatch: {
          active_p1_channel: params.activeChannel,
          synthetic_ping_verified: true,
        },
      },
      defaultContext: {
        active_p1_channel: params.deadChannel,
        synthetic_ping_verified: false,
      },
    },
  ];
}

export const ACCOUNT_PRESETS: Record<AccountPresetId, AccountPreset> = {
  "meridian-fintech": makeMeridianPreset(),
  "kestrel-health": makeKestrelPreset(),
  "vanguard-retail": makeVanguardPreset(),
  "helios-logistics": makeHeliosPreset(),
};

const SLUG_TO_ID: Record<string, AccountPresetId> = {
  meridian: "meridian-fintech",
  "meridian-fintech": "meridian-fintech",
  kestrel: "kestrel-health",
  "kestrel-health": "kestrel-health",
  vanguard: "vanguard-retail",
  "vanguard-retail": "vanguard-retail",
  helios: "helios-logistics",
  "helios-logistics": "helios-logistics",
};

export function resolveAccountPresetId(input: string): AccountPresetId | null {
  return SLUG_TO_ID[input.trim().toLowerCase()] ?? null;
}

export function getAccountPreset(idOrSlug: string): AccountPreset {
  const resolved = resolveAccountPresetId(idOrSlug);
  if (!resolved) {
    throw new Error(
      `Unknown account preset "${idOrSlug}". Valid presets: meridian, kestrel, vanguard, helios.`,
    );
  }
  return ACCOUNT_PRESETS[resolved];
}

export function listAccountPresets(): AccountPreset[] {
  return [
    ACCOUNT_PRESETS["meridian-fintech"],
    ACCOUNT_PRESETS["kestrel-health"],
    ACCOUNT_PRESETS["vanguard-retail"],
    ACCOUNT_PRESETS["helios-logistics"],
  ];
}

export function simulateFlightCheckForPreset(
  presetId: AccountPresetId,
  options: {
    patchedStations?: readonly StationCode[];
    extraWaivers?: WaiverInput[];
    referenceDate?: string;
    evaluatedAt?: string;
  } = {},
): FlightCheckResult {
  const preset = ACCOUNT_PRESETS[presetId];
  const patched = new Set(options.patchedStations ?? []);

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
  };

  return evaluateFlightCheck(preset.config, observed, {
    referenceDate: options.referenceDate ?? preset.referenceDate,
    evaluatedAt: options.evaluatedAt ?? `${preset.referenceDate}T16:00:00.000Z`,
    extraWaivers: options.extraWaivers,
  });
}

export function simulateStaticFireForPreset(
  presetId: AccountPresetId,
  options: {
    patchedVectors?: readonly ChaosVectorId[];
    attemptNumber?: number;
    previousAttempts?: StaticFireResult["attemptHistory"];
    executedAt?: string;
  } = {},
): StaticFireResult {
  const preset = ACCOUNT_PRESETS[presetId];
  const patchedSet = new Set(options.patchedVectors ?? []);
  const failingInitially = new Set(preset.initialChaosFailures);

  const observations: StaticFireVectorObservation[] = (
    Object.keys(preset.unpatchedVectorCounts) as ChaosVectorId[]
  ).map((vectorId) => {
    const counts = preset.unpatchedVectorCounts[vectorId];
    const stillFailing =
      failingInitially.has(vectorId) && !patchedSet.has(vectorId);

    return {
      vectorId,
      packetsSent: counts.sent,
      packetsCorrupted: stillFailing ? counts.corrupted : 0,
      packetsDropped: stillFailing ? counts.dropped : 0,
      passed: !stillFailing,
      p95LatencyMs: stillFailing ? counts.p95LatencyMs : Math.min(counts.p95LatencyMs, 42),
      observedBehavior: stillFailing
        ? `${counts.corrupted}/${counts.sent} packets failed resilience assertion`
        : `0/${counts.sent} corrupted · deterministic resilience verified`,
      expectedBehavior: `0/${counts.sent} corrupted (0.0% · NOMINAL)`,
      httpStatusSamples: stillFailing ? [500, 401, 200] : [200, 200, 200],
      wireEvidence: {
        method: "POST",
        endpoint: preset.config.environment.endpoints.webhook_ingress,
        httpStatus: stillFailing ? 500 : 200,
        latencyMs: stillFailing ? counts.p95LatencyMs : 32,
        headers: {
          "x-nominalx-vector": vectorId,
          "x-nominalx-result": stillFailing ? "CORRUPTED" : "NOMINAL",
        },
        payload: {
          vector: vectorId,
          packets_sent: counts.sent,
          packets_corrupted: stillFailing ? counts.corrupted : 0,
        },
        highlightLines: stillFailing
          ? [`Vector ${vectorId}: ${counts.corrupted} corrupted packets detected`]
          : [`Vector ${vectorId}: 0 corrupted packets (NOMINAL)`],
      },
    };
  });

  return scoreStaticFire({
    accountId: preset.config.account.id,
    accountName: preset.config.account.name,
    targetUrl: `${preset.config.environment.base_url}${preset.config.environment.endpoints.webhook_ingress}`,
    accountableOwner: preset.config.account.fde_owner,
    observations,
    attemptNumber: options.attemptNumber,
    patchesApplied: [...patchedSet],
    previousAttempts: options.previousAttempts,
    executedAt: options.executedAt ?? `${preset.referenceDate}T16:15:00.000Z`,
  });
}

export function simulateCompletedCrewDrillForPreset(
  presetId: AccountPresetId,
  executedAt?: string,
): CrewDrillResult {
  const preset = ACCOUNT_PRESETS[presetId];
  const timestamp = executedAt ?? `${preset.referenceDate}T16:30:00.000Z`;
  let state = createCrewDrillState({
    accountId: preset.config.account.id,
    accountName: preset.config.account.name,
    accountableOwner: preset.config.account.cse_owner,
    scenarios: preset.crewDrillScenarios,
  });

  for (const scenario of preset.crewDrillScenarios) {
    state = startCrewAlarm(state, scenario.alarmId, timestamp);
    const splitSec = preset.defaultCrewDrillSplitsSec[scenario.alarmId];
    const res = applyCrewRemediation(
      state,
      scenario.alarmId,
      scenario.expectedRemediation.requiredPatch,
      splitSec,
      timestamp,
    );
    state = res.state;
  }

  return summarizeCrewDrill(state, timestamp);
}
