import type {
  CrewDrillResult,
  FlightCheckResult,
  Gate1SubStageMetadata,
  Gate2SubStageMetadata,
  Gate3SubStageMetadata,
  HandoverSprintMetadata,
  IntegrationSpec,
  JourneyStageStatus,
  JourneyState,
  StageMetadata,
  StageNumber,
  StaticFireResult,
} from "./types.js";

export const INTEGRATIONS_CATALOG = {
  crmHandoff: {
    id: "crm-handoff",
    name: "CRM Deal-to-Engineering Handoff (Salesforce / HubSpot -> nominalx.yaml)",
    category: "crm_handoff",
    protocolOrInterface: "Versioned nominalx.yaml contract seed",
    purpose:
      "Converts Closed-Won commercial commitments into executable staging probe assertions.",
    ownerSide: "vendor",
  },
  oktaSso: {
    id: "idp-sso",
    name: "Identity Provider SSO (Okta / Entra ID SAML 2.0 & OIDC)",
    category: "identity",
    protocolOrInterface: "SAML 2.0 Metadata XML / OIDC Discovery + X.509 TLS",
    purpose:
      "Verifies contracted auth protocol, enforced MFA, certificate TTL > 30d, and unsigned assertion rejection.",
    ownerSide: "shared",
  },
  cloudResidency: {
    id: "cloud-residency",
    name: "Cloud Regional Routing & Egress (AWS / GCP Regional Endpoints)",
    category: "cloud_residency",
    protocolOrInterface: "HTTPS Region Headers + DNS CNAME + Storage/Egress Probe",
    purpose:
      "Proves every compute, DNS, and storage hop remains strictly inside contracted geographic boundaries.",
    ownerSide: "customer",
  },
  hmacWebhookGateway: {
    id: "hmac-webhook-gateway",
    name: "Signed Webhook Ingress Gateway (HMAC-SHA256 Dual-Key)",
    category: "webhook_gateway",
    protocolOrInterface: "HTTP POST + X-NominalX-Signature (v1/v2) + X-NominalX-Timestamp",
    purpose:
      "Enforces cryptographic verification, zero-downtime key rotation, idempotency, ordering, and clock-skew tolerance.",
    ownerSide: "shared",
  },
  rateLimitGateway: {
    id: "rate-limit-gateway",
    name: "API Quota & Rate-Limiting Edge (Kong / Envoy / AWS API Gateway)",
    category: "rate_limiting",
    protocolOrInterface: "HTTP 429 + Retry-After + Token Bucket / DLQ Overflow",
    purpose:
      "Confirms provisioned RPS meets contract and burst traffic backs off cleanly without retry storms.",
    ownerSide: "shared",
  },
  p1Alerting: {
    id: "p1-alerting",
    name: "P1 Incident Alerting & Paging (PagerDuty / Opsgenie / Slack)",
    category: "alerting",
    protocolOrInterface: "Synthetic Dry-Run Webhook (X-NominalX-Probe: true)",
    purpose:
      "Verifies active on-call routing within ACK SLA so Day-1 incidents never land in archived channels.",
    ownerSide: "shared",
  },
  deploymentRollback: {
    id: "deployment-rollback",
    name: "Release & Rollback Automation (Terraform / ArgoCD / GitHub Actions)",
    category: "deployment_rollback",
    protocolOrInterface: "Versioned Artifact Dry-Run / Blue-Green Kill-Switch",
    purpose:
      "Proves production cutover can revert within contracted RTO with zero data loss.",
    ownerSide: "customer",
  },
  issueTracker: {
    id: "issue-tracker",
    name: "Engineering Work & Waiver Tracking (Jira / Linear)",
    category: "issue_tracking",
    protocolOrInterface: "Waiver Ticket IDs & Capacity Upgrade Links",
    purpose:
      "Ties every bounded Operational Waiver and remediation task to a named owner and <= 30-day expiry.",
    ownerSide: "shared",
  },
} as const satisfies Record<string, IntegrationSpec>;

export const LIFECYCLE_STAGES: readonly StageMetadata[] = [
  {
    stageNumber: 1,
    stageName: "Deal Close",
    displayTitle: "Stage 1: Deal Close",
    shortTitle: "Deal Close",
    inUnverifiedGap: false,
    sprintLabel: "Pre-Gap Contract Seed",
    goal: "Capture signed technical commitments in a validated nominalx.yaml contract seed before engineering handoff.",
    singleAccountableOwner: "Lead Solutions Engineer (SE / SA)",
    vendorEngineers: [
      "Sales Engineer",
      "Solutions Engineer (SE / SA)",
      "Lead Forward-Deployed Engineer (FDE, read-in)",
    ],
    customerEngineers: [
      "Customer Engineering Lead",
      "Customer Security Engineer",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.crmHandoff,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Signed order form & technical discovery commitments",
      "nominalx.yaml v1.0 contract template",
      "Named vendor and customer engineering owner roster",
    ],
    timeBox: "1 closing review session (<= 45 min)",
    trigger: "Commercial agreement signed (Closed-Won) and architecture approved.",
    inScope: [
      "Codify sold SSO, residency, webhook HMAC, RPS quota, P1 alerting, and RTO targets into nominalx.yaml",
      "Validate schema_version 1.0 contract completeness before Gate 1 kickoff",
      "Assign single accountable vendor and customer engineering leads",
    ],
    outOfScope: [
      "Commercial pricing, redlines, or legal contract negotiation",
      "Production traffic cutover or staging code changes",
      "Unverified verbal promises excluded from nominalx.yaml",
    ],
    definitionOfDone: [
      "Versioned nominalx.yaml passes NominalXConfigSchema validation with zero missing contract fields",
      "Staging endpoint paths and secret env-var references are populated",
      "Lead FDE, Lead CSE, and Customer Engineering Lead are explicitly named",
    ],
    hardStops: [
      "No Gate 1 sprint starts without a schema-valid nominalx.yaml contract seed",
    ],
  },
  {
    stageNumber: 2,
    stageName: "Sales-to-FDE Handoff",
    displayTitle: "Stage 2: Sales-to-FDE Handoff",
    shortTitle: "Sales -> FDE",
    inUnverifiedGap: true,
    gateNumber: 1,
    gateLabel: "Gate 1 (1 of 3): Flight Check",
    sprintLabel: "Sprint 1",
    goal: "Diff What Sales Sold against What Exists in Customer Staging across 6 parallel telemetry stations.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: [
      "Lead Forward-Deployed Engineer (FDE)",
      "Solutions Engineer (SE / SA)",
      "Sales Engineer",
      "Lead Customer Success Engineer (CSE)",
      "Support Engineer",
      "Technical Account Manager (TAM)",
    ],
    customerEngineers: [
      "Customer Platform / Infrastructure Engineer",
      "Customer Security Engineer",
      "Customer Backend Engineer",
      "Customer On-Call SRE",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.oktaSso,
      INTEGRATIONS_CATALOG.cloudResidency,
      INTEGRATIONS_CATALOG.hmacWebhookGateway,
      INTEGRATIONS_CATALOG.rateLimitGateway,
      INTEGRATIONS_CATALOG.p1Alerting,
      INTEGRATIONS_CATALOG.deploymentRollback,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Validated nominalx.yaml contract seed",
      "Staging base URL and read-only probe tokens",
      "Dual HMAC test secrets (current + next)",
      "nominalx check CLI / Mission Control Flight Check board",
    ],
    timeBox: "1 short engineering sprint (2-3 working sessions; all 6 stations in parallel)",
    trigger: "Stage 1 nominalx.yaml handoff packet published and schema-validated.",
    inScope: [
      "Live deterministic telemetry probes across 1 of 6 (AUTH / SSO) through 6 of 6 (ROLLBACK)",
      "Strict Sold vs. Observed contract diffing with raw HTTP/header evidence",
      "Hard Stop enforcement on AUTH / SSO and RESIDENCY plus bounded Operational Waiver governance (max 2 active, <= 30d)",
    ],
    outOfScope: [
      "Issuing waivers on security/compliance Hard Stops (AUTH / SSO or RESIDENCY)",
      "Full production load generation at 50k RPS from a developer laptop",
      "Multi-week waterfall sign-off committees or unverified spreadsheet checkboxes",
    ],
    definitionOfDone: [
      "Zero NO-GO stations remain across all 6 Flight Check stations",
      "Both non-waivable Hard Stops (AUTH / SSO and RESIDENCY) lock NOMINAL via live telemetry",
      "All operational stations are NOMINAL or covered by valid Operational Waivers (<= 2 active, named owner, <= 30d expiry, concrete rollback plan)",
    ],
    hardStops: [
      "AUTH / SSO (1 of 6) is a non-waivable Hard Stop",
      "RESIDENCY (2 of 6) is a non-waivable Hard Stop",
    ],
  },
  {
    stageNumber: 3,
    stageName: "Integration & Cutover",
    displayTitle: "Stage 3: Integration & Cutover",
    shortTitle: "Integration",
    inUnverifiedGap: true,
    gateNumber: 2,
    gateLabel: "Gate 2 (2 of 3): Static Fire",
    sprintLabel: "Sprint 2",
    goal: "Bolt staging integration to the adversarial test stand and fire 7 failure vectors until corruption reaches 0.0% (Grade A).",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: [
      "Lead Forward-Deployed Engineer (FDE)",
      "Technical Account Manager (TAM)",
    ],
    customerEngineers: [
      "Customer Backend Engineer",
      "Customer Platform / Infrastructure Engineer",
      "Customer Security Engineer",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.hmacWebhookGateway,
      INTEGRATIONS_CATALOG.rateLimitGateway,
      INTEGRATIONS_CATALOG.deploymentRollback,
    ],
    resources: [
      "Live staging webhook/API endpoint",
      "Dual HMAC test secrets (v1 current + v2 next)",
      "Handler config and deployment access",
      "nominalx fire adversarial chaos harness",
    ],
    timeBox: "1 short engineering sprint (tight 15-30 min fire -> patch -> re-fire loops)",
    trigger: "Gate 1 (1 of 3): Flight Check clears with zero NO-GO stations.",
    inScope: [
      "Adversarial verification of all 7 chaos vectors (1 of 7 through 7 of 7)",
      "Live handler patching, config diffs, and multi-attempt before/after corruption telemetry",
      "Deterministic resilience grading (A-F) down to 0.0% corruption",
    ],
    outOfScope: [
      "Untested staging changes promoted to production without a clean re-fire",
      "LLM-generated pass/fail opinions or manual QA sign-off without packet telemetry",
      "Sustained multi-hour soak/penetration testing outside the 7 integration failure modes",
    ],
    definitionOfDone: [
      "All 7 of 7 chaos vectors pass live telemetry checks",
      "Measured corruption reaches 0.0% (Resilience Grade A · NOMINAL)",
      "Before/after firing attempt history is captured in static-fire.json",
    ],
    hardStops: [
      "Any vector corruption > 0.0% keeps Gate 2 in NO-GO (exit code 1)",
    ],
  },
  {
    stageNumber: 4,
    stageName: "Day-30 Enablement & Handover",
    displayTitle: "Stage 4: Day-30 Enablement & Handover",
    shortTitle: "Enablement",
    inUnverifiedGap: true,
    gateNumber: 3,
    gateLabel: "Gate 3 (3 of 3): Crew Drill + Handover Sprint",
    sprintLabel: "Sprint 3 & Handover Sprint",
    goal: "Prove customer on-call engineers can stabilize 3 live Day-30 alarms under a 90s clock, then sign the NOMINAL Dossier & Day-1 Runbook.",
    singleAccountableOwner: "Lead Customer Success Engineer (CSE)",
    vendorEngineers: [
      "Lead Customer Success Engineer (CSE)",
      "Lead Forward-Deployed Engineer (FDE, co-signer & shadow)",
      "Support Engineer",
      "Technical Account Manager (TAM)",
    ],
    customerEngineers: [
      "Customer On-Call SRE",
      "Customer Backend Engineer",
      "Customer Security Engineer",
      "Customer Engineering Lead (co-signer)",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.rateLimitGateway,
      INTEGRATIONS_CATALOG.oktaSso,
      INTEGRATIONS_CATALOG.p1Alerting,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Live ops drill console with 90-second countdown clock",
      "Staged next X.509 SSO certificate fingerprint",
      "Verified backup P1 alerting channel / PagerDuty route",
      "Gate 1-3 JSON artifacts and nominalx dossier generator",
    ],
    timeBox: "1 focused 60-min live game-day sprint + 30-min Handover sign-off sprint",
    trigger: "Production cutover live (or T-7 days before FDE roll-off).",
    inScope: [
      "3 live timed operational alarms (1 of 3 through 3 of 3) with real config remediation and ping verification",
      "Signed NOMINAL (or NOMINAL WITH WAIVERS) Dossier with deterministic SHA-256 verification digest",
      "Stack-tailored Day-1 Runbook exported in Markdown, JSON, and Go-Live Slack mrkdwn",
    ],
    outOfScope: [
      "Slide-deck trainings or multiple-choice certification quizzes",
      "FDE roll-off without Support Engineer acknowledgement of the Day-1 Runbook",
      "Manual editing of SHA-256 signed telemetry records",
    ],
    definitionOfDone: [
      "3 of 3 Crew Drill alarms stabilized with live verification proof and split times logged",
      "Signed Dossier sealed by Lead FDE, Lead CSE, and Customer Engineering Lead",
      "Day-1 Runbook and Active Waiver Aging Register handed directly to Support Engineers and Customer On-Call SREs",
    ],
    hardStops: [
      "Zero unstabilized Crew Drill alarms allowed prior to FDE roll-off",
    ],
  },
  {
    stageNumber: 5,
    stageName: "Support",
    displayTitle: "Stage 5: Support",
    shortTitle: "Support",
    inUnverifiedGap: false,
    sprintLabel: "Post-Gap Operations",
    goal: "Operate production SLAs from verified Day-1 telemetry baselines and close every Gate 1 Operational Waiver before expiry.",
    singleAccountableOwner: "Assigned Lead Support Engineer",
    vendorEngineers: [
      "Support Engineers",
      "Technical Account Manager (TAM)",
      "Customer Success Engineer (CSE, escalation)",
    ],
    customerEngineers: [
      "Customer On-Call SREs",
      "Customer Backend / Platform Engineers",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.p1Alerting,
      INTEGRATIONS_CATALOG.issueTracker,
      INTEGRATIONS_CATALOG.deploymentRollback,
    ],
    resources: [
      "Signed NOMINAL Dossier & SHA-256 baseline",
      "Tailored Day-1 Customer Runbook",
      "Active Waiver Aging Register (<= 30-day window)",
      "nominalx check drift-detection command",
    ],
    timeBox: "Continuous SLA operations + scheduled waiver-expiry check-ins (<= 30d)",
    trigger: "Handover Sprint signed and Day-1 Runbook acknowledged by Support Engineers.",
    inScope: [
      "Incident triage anchored on verified Day-1 stack configs and endpoints",
      "1-command configuration drift detection via nominalx check",
      "Closing every active Operational Waiver via live NOMINAL re-probe before expires_at",
    ],
    outOfScope: [
      "Re-discovering what Sales promised during P1 outages",
      "Silently extending expired waivers past their 30-day cap without live re-verification",
    ],
    definitionOfDone: [
      "Incidents resolve against documented Day-1 telemetry baselines",
      "Every Gate 1 Operational Waiver closes to live NOMINAL before its expiry date",
    ],
    hardStops: [
      "Any expired waiver (today > expires_at) immediately flags NO-GO in nominalx check",
    ],
  },
  {
    stageNumber: 6,
    stageName: "Renewal & Expansion",
    displayTitle: "Stage 6: Renewal & Expansion",
    shortTitle: "Renewal",
    inUnverifiedGap: false,
    sprintLabel: "Post-Gap Growth",
    goal: "Anchor renewal on longitudinal resilience telemetry and seed every expansion workload directly back into Stage 1 -> Gate 1.",
    singleAccountableOwner: "Technical Account Manager (TAM)",
    vendorEngineers: [
      "Technical Account Manager (TAM)",
      "Lead Customer Success Engineer (CSE)",
      "Sales Engineer (expansion scoping)",
    ],
    customerEngineers: [
      "Customer Engineering Leadership",
      "Customer Platform & Security Leads",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.crmHandoff,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Historical signed NOMINAL Dossiers (JSON longitudinal diffs)",
      "Waiver closure history & quarterly nominalx check / fire snapshots",
      "Executive Readiness Reports",
    ],
    timeBox: "1 quarterly / pre-renewal technical review sprint (60 min)",
    trigger: "90 days pre-renewal or expansion workload scoped (new region, higher RPS tier, new integration).",
    inScope: [
      "Diffing longitudinal signed JSON dossiers across quarters to prove sustained resilience",
      "Reviewing zero-waiver closure discipline and incident MTTR improvements",
      "Seeding new region/RPS expansion contracts into a fresh Stage 1 nominalx.yaml",
    ],
    outOfScope: [
      "Qualitative health scores unsupported by production telemetry",
      "Bypassing Gate 1 Hard Stops when launching new geographic regions",
    ],
    definitionOfDone: [
      "Executive Readiness Report shared with Customer Engineering Leadership",
      "Zero unresolved waivers remain prior to renewal lock",
      "Any expansion workload is seeded as a schema-valid Stage 1 nominalx.yaml",
    ],
    hardStops: [
      "Expansion into new residency regions requires a fresh Stage 2 Gate 1 RESIDENCY pass",
    ],
  },
];

export const GATE1_SUB_STAGES: readonly Gate1SubStageMetadata[] = [
  {
    index: 1,
    ofTotal: 6,
    subStageLabel: "1 of 6",
    stationCode: "AUTH_SSO",
    stationLabel: "AUTH / SSO",
    policyClass: "HARD_STOP",
    goal: "Verify live IdP protocol, enforced MFA, X.509 certificate TTL (> 30d), and rejection of unsigned assertions.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE", "Solutions Engineer (SE / SA)"],
    customerEngineers: ["Customer Security Engineer"],
    integrations: [INTEGRATIONS_CATALOG.oktaSso],
    resources: [
      "Sold IdP contract spec (SAML 2.0 / OIDC)",
      "Staging IdP metadata URL",
      "TLS / X.509 certificate probe",
    ],
    timeBox: "<= 1 working session",
    trigger: "Gate 1 (1 of 3): Flight Check sprint kickoff",
    inScope: [
      "Protocol match (saml2 or oidc) against sold_contract.auth",
      "MFA enforcement verification and unsigned assertion rejection",
      "Active signing certificate TTL > min_cert_ttl_days",
    ],
    outOfScope: [
      "Issuing Risk Waivers for weak auth or expiring certificates",
      "Provisioning individual end-user seats or SCIM directory sync",
    ],
    definitionOfDone: [
      "Live probe locks NOMINAL across protocol, MFA, cert TTL, and unsigned assertion checks",
    ],
    hardStopRule:
      "HARD STOP · NON-WAIVABLE: Any waiver targeting AUTH / SSO is rejected as NO-GO.",
  },
  {
    index: 2,
    ofTotal: 6,
    subStageLabel: "2 of 6",
    stationCode: "RESIDENCY",
    stationLabel: "RESIDENCY",
    policyClass: "HARD_STOP",
    goal: "Prove every response region header, DNS target, storage bucket, and egress hop stays inside contracted regions.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE", "Solutions Engineer (SE / SA)"],
    customerEngineers: [
      "Customer Platform / Infrastructure Engineer",
      "Customer Security Engineer",
    ],
    integrations: [INTEGRATIONS_CATALOG.cloudResidency],
    resources: [
      "Contracted allowed_regions allowlist",
      "Staging health/region and egress probe endpoints",
    ],
    timeBox: "<= 1 working session",
    trigger: "Gate 1 (1 of 3): Flight Check sprint kickoff",
    inScope: [
      "X-Served-Region response header inspection",
      "Storage region, egress hop, and DNS target allowlist verification",
      "Zero cross-region fallback leakage when strict_egress is true",
    ],
    outOfScope: [
      "Issuing Risk Waivers for out-of-region data routing",
      "Full cloud IAM audit outside contracted data-plane endpoints",
    ],
    definitionOfDone: [
      "100% of observed compute, storage, and egress regions belong to sold_contract.residency.allowed_regions",
    ],
    hardStopRule:
      "HARD STOP · NON-WAIVABLE: Any waiver targeting RESIDENCY is rejected as NO-GO.",
  },
  {
    index: 3,
    ofTotal: 6,
    subStageLabel: "3 of 6",
    stationCode: "WEBHOOKS",
    stationLabel: "WEBHOOKS",
    policyClass: "OPERATIONAL_WAIVER",
    goal: "Confirm webhook ingress rejects unsigned/tampered payloads and supports dual-secret HMAC-SHA256 rotation.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: ["Customer Backend Engineer"],
    integrations: [
      INTEGRATIONS_CATALOG.hmacWebhookGateway,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Staging webhook ingress URL",
      "Current + Next HMAC-SHA256 test secrets",
      "Signed, unsigned, and tampered probe payloads",
    ],
    timeBox: "<= 1 working session",
    trigger: "Gate 1 (1 of 3): Flight Check sprint kickoff",
    inScope: [
      "Unsigned and tampered signature rejection (401/403)",
      "Valid current HMAC signature acceptance (2xx)",
      "Dual-key overlap readiness when dual_secret_rotation is sold",
    ],
    outOfScope: [
      "Adversarial duplicate/out-of-order replay bursts (covered in Gate 2 Static Fire)",
    ],
    definitionOfDone: [
      "NOMINAL live HMAC probe, OR valid staging-only Operational Waiver (owner + <= 30d expiry + rollback plan)",
    ],
  },
  {
    index: 4,
    ofTotal: 6,
    subStageLabel: "4 of 6",
    stationCode: "QUOTA_RATE",
    stationLabel: "QUOTA / RATE",
    policyClass: "OPERATIONAL_WAIVER",
    goal: "Confirm provisioned RPS ceiling meets sold contract and 429 throttle responses include valid Retry-After headers.",
    singleAccountableOwner: "Solutions Engineer (SE / SA)",
    vendorEngineers: ["Solutions Engineer (SE / SA)", "Lead FDE"],
    customerEngineers: ["Customer Platform / Infrastructure Engineer"],
    integrations: [
      INTEGRATIONS_CATALOG.rateLimitGateway,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Sold RPS guarantee",
      "Quota status endpoint and controlled burst probe",
    ],
    timeBox: "<= 1 working session",
    trigger: "Gate 1 (1 of 3): Flight Check sprint kickoff",
    inScope: [
      "Provisioned RPS >= sold_contract.quota.guaranteed_rps",
      "429 Too Many Requests returns valid Retry-After backoff header",
      "Zero silent 503 drops under controlled burst probe",
    ],
    outOfScope: [
      "Sustained 50k RPS distributed load testing from a single CLI host",
    ],
    definitionOfDone: [
      "NOMINAL quota & Retry-After verification, OR valid Operational Waiver with capacity upgrade ticket + <= 30d expiry",
    ],
  },
  {
    index: 5,
    ofTotal: 6,
    subStageLabel: "5 of 6",
    stationCode: "ALERTING",
    stationLabel: "ALERTING",
    policyClass: "OPERATIONAL_WAIVER",
    goal: "Verify synthetic P1 dry-run alerts reach an active monitored channel within contracted ACK latency.",
    singleAccountableOwner: "Lead Customer Success Engineer (CSE)",
    vendorEngineers: ["Lead CSE", "Support Engineer"],
    customerEngineers: ["Customer On-Call SRE"],
    integrations: [
      INTEGRATIONS_CATALOG.p1Alerting,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Contracted P1 channel / PagerDuty escalation route",
      "Synthetic probe header (X-NominalX-Probe: true)",
    ],
    timeBox: "<= 30 min",
    trigger: "Gate 1 (1 of 3): Flight Check sprint kickoff",
    inScope: [
      "Live dry-run alert delivery to active channel (2xx)",
      "ACK latency within sold_contract.alerting.max_ack_ms",
      "Detection of dead/archived channels (404/410) or revoked webhooks",
    ],
    outOfScope: [
      "Paging real on-call humans outside synthetic dry-run probes",
    ],
    definitionOfDone: [
      "NOMINAL synthetic P1 ping within SLA, OR valid Operational Waiver with verified backup paging route",
    ],
  },
  {
    index: 6,
    ofTotal: 6,
    subStageLabel: "6 of 6",
    stationCode: "ROLLBACK",
    stationLabel: "ROLLBACK",
    policyClass: "OPERATIONAL_WAIVER",
    goal: "Prove versioned release rollback dry-run completes within contracted max RTO with zero data loss.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE", "Technical Account Manager (TAM)"],
    customerEngineers: [
      "Customer Platform / Infrastructure Engineer",
      "Customer On-Call SRE",
    ],
    integrations: [
      INTEGRATIONS_CATALOG.deploymentRollback,
      INTEGRATIONS_CATALOG.issueTracker,
    ],
    resources: [
      "Contracted max RTO minutes",
      "Staging rollback dry-run endpoint & versioned artifact",
    ],
    timeBox: "<= 1 working session",
    trigger: "Gate 1 (1 of 3): Flight Check sprint kickoff",
    inScope: [
      "Dry-run rollback execution and artifact version verification",
      "Observed RTO <= sold_contract.rollback.max_rto_minutes",
      "Zero data loss attestation on dry-run revert",
    ],
    outOfScope: [
      "Multi-region disaster recovery failover outside the integration cutover boundary",
    ],
    definitionOfDone: [
      "NOMINAL dry-run rollback within RTO, OR valid Operational Waiver with verified manual failover script + <= 30d expiry",
    ],
  },
];

export const GATE2_SUB_STAGES: readonly Gate2SubStageMetadata[] = [
  {
    index: 1,
    ofTotal: 7,
    subStageLabel: "1 of 7",
    vectorId: "duplicate_webhook",
    vectorName: "Duplicate webhook delivery",
    shortName: "Duplicate Webhook",
    goal: "Prove identical event_id replays (concurrent & sequential) mutate state exactly once with zero double-writes.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: ["Customer Backend Engineer"],
    integrations: [INTEGRATIONS_CATALOG.hmacWebhookGateway],
    resources: ["Staging webhook endpoint", "nominalx fire replay burst"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Concurrent & sequential identical event_id replay verification"],
    outOfScope: ["Cross-tenant semantic deduplication beyond event_id"],
    definitionOfDone: [
      "Identical event_id causes 1 state mutation; duplicates return 200/204/409",
    ],
    failureMode: "Double-writes / duplicate ledger mutations on retried webhook events",
    remediationSummary: "Persist processed event_id keys in atomic idempotency store (Redis/DB unique constraint)",
  },
  {
    index: 2,
    ofTotal: 7,
    subStageLabel: "2 of 7",
    vectorId: "out_of_order",
    vectorName: "Out-of-order events (canceled before created)",
    shortName: "Out-of-Order Events",
    goal: "Prove late earlier-version events never resurrect terminal canceled records.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: ["Customer Backend Engineer"],
    integrations: [INTEGRATIONS_CATALOG.hmacWebhookGateway],
    resources: ["Ordered state-transition probe (v2 canceled then v1 created)"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Monotonic version / terminal-state guard verification"],
    outOfScope: ["Global distributed total ordering across unrelated entities"],
    definitionOfDone: [
      "Terminal canceled state holds; late v1 created event ignored with 0% state corruption",
    ],
    failureMode: "Zombie records resurrected when delayed created events overwrite canceled state",
    remediationSummary: "Enforce monotonic sequence_version guard and terminal state transition checks",
  },
  {
    index: 3,
    ofTotal: 7,
    subStageLabel: "3 of 7",
    vectorId: "rate_limit_429",
    vectorName: "429 rate-limit burst",
    shortName: "429 Rate-Limit Burst",
    goal: "Prove throttled bursts honor Retry-After with exponential backoff + jitter without retry storms or silent drops.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE", "Technical Account Manager (TAM)"],
    customerEngineers: [
      "Customer Backend Engineer",
      "Customer Platform / Infrastructure Engineer",
    ],
    integrations: [INTEGRATIONS_CATALOG.rateLimitGateway],
    resources: ["429 + Retry-After burst probe", "Packet telemetry plot"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Retry-After header emission and bounded backoff/jitter verification"],
    outOfScope: ["DDoS edge mitigation tuning"],
    definitionOfDone: [
      "Zero retry storms, valid Retry-After headers, and zero silently dropped events",
    ],
    failureMode: "Immediate tight-loop retries amplify 429 bursts into cascading 503 outages",
    remediationSummary: "Emit numeric Retry-After headers and enforce exponential backoff with jitter + bounded queue",
  },
  {
    index: 4,
    ofTotal: 7,
    subStageLabel: "4 of 7",
    vectorId: "upstream_timeout_30s",
    vectorName: "30-second upstream timeout",
    shortName: "30s Upstream Timeout",
    goal: "Prove stalled upstream dependencies abort cleanly at deadline and route to retry/DLQ without worker exhaustion.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: [
      "Customer Backend Engineer",
      "Customer Platform / Infrastructure Engineer",
    ],
    integrations: [INTEGRATIONS_CATALOG.hmacWebhookGateway],
    resources: ["30s stalled upstream probe", "Worker pool & DLQ telemetry"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Bounded request deadline abort, worker release, and DLQ handoff"],
    outOfScope: ["Full database failover testing"],
    definitionOfDone: [
      "Handler aborts at deadline, frees workers, and routes payload cleanly to DLQ (zero worker exhaustion)",
    ],
    failureMode: "Unbounded upstream waits exhaust worker pool and cascade 502/504 across all tenants",
    remediationSummary: "Enforce hard per-request abort deadline (AbortController/context timeout) + async DLQ handoff",
  },
  {
    index: 5,
    ofTotal: 7,
    subStageLabel: "5 of 7",
    vectorId: "dual_hmac_rotation",
    vectorName: "Dual HMAC secret rotation",
    shortName: "Dual HMAC Rotation",
    goal: "Prove zero-downtime key rotation accepts both active (v1) and staged (v2) HMAC secrets while rejecting forged traffic.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: [
      "Customer Backend Engineer",
      "Customer Security Engineer",
    ],
    integrations: [INTEGRATIONS_CATALOG.hmacWebhookGateway],
    resources: ["Active v1 + staged v2 HMAC secrets", "Split-signature stream"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Simultaneous v1/v2 acceptance and constant-time forged signature rejection"],
    outOfScope: ["Secret vault provisioning automation (AWS Secrets Manager / Vault)"],
    definitionOfDone: [
      "100% of valid v1 and v2 signatures accepted; 100% of forged signatures rejected (401/403)",
    ],
    failureMode: "Single-secret verification causes 100% webhook drop during routine credential rotation",
    remediationSummary: "Verify signatures against ordered keyring [current, next] with constant-time digest comparison",
  },
  {
    index: 6,
    ofTotal: 7,
    subStageLabel: "6 of 7",
    vectorId: "additive_json_fields",
    vectorName: "Additive / unknown JSON fields",
    shortName: "Additive JSON Fields",
    goal: "Prove forward-compatible tolerant readers ignore unknown top-level and nested JSON fields without crashing.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: ["Customer Backend Engineer"],
    integrations: [INTEGRATIONS_CATALOG.hmacWebhookGateway],
    resources: ["Additive-field test payloads"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Unknown top-level and nested property tolerance on webhook deserialization"],
    outOfScope: ["Breaking type changes on existing documented fields"],
    definitionOfDone: [
      "Unknown additive keys ignored cleanly (2xx) with zero 400/422/500 deserialization crashes",
    ],
    failureMode: "Strict additionalProperties:false schema crashes on backwards-compatible API additions",
    remediationSummary: "Configure webhook parser as a tolerant reader (strip/passthrough unknown keys)",
  },
  {
    index: 7,
    ofTotal: 7,
    subStageLabel: "7 of 7",
    vectorId: "clock_skew_5m",
    vectorName: "5-minute clock skew",
    shortName: "5m Clock Skew",
    goal: "Prove valid probes within +-5m clock skew pass while stale 15m replay attacks are rejected.",
    singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
    vendorEngineers: ["Lead FDE"],
    customerEngineers: [
      "Customer Backend Engineer",
      "Customer Security Engineer",
    ],
    integrations: [INTEGRATIONS_CATALOG.hmacWebhookGateway],
    resources: ["Signed probes at now +- 5m + stale replay control at now - 15m"],
    timeBox: "1 patch/re-fire loop (<= 30 min)",
    trigger: "Gate 2 (2 of 3): Static Fire run triggered",
    inScope: ["Bounded +-300s replay window validation against signed X-NominalX-Timestamp"],
    outOfScope: ["Host NTP daemon configuration"],
    definitionOfDone: [
      "Valid +-5m skewed probes accepted (2xx); stale -15m replay control rejected (401)",
    ],
    failureMode: "Overly tight timestamp windows drop valid events, or missing checks allow replay attacks",
    remediationSummary: "Enforce |now - timestamp| <= 300s replay tolerance bound inside HMAC verification middleware",
  },
];

export const GATE3_SUB_STAGES: readonly Gate3SubStageMetadata[] = [
  {
    index: 1,
    ofTotal: 3,
    subStageLabel: "1 of 3",
    alarmId: "runaway_ingestion_storm",
    alarmName: "Runaway ingestion storm spiking quota/spend",
    shortName: "Ingestion Storm",
    goal: "Isolate offending source key, apply per-tenant rate cap + DLQ overflow, and hold RPS/spend inside green SLA for 3 ticks.",
    singleAccountableOwner: "Lead Customer Success Engineer (CSE)",
    vendorEngineers: ["Lead CSE", "Lead FDE (shadow)", "Support Engineer"],
    customerEngineers: ["Customer On-Call SRE", "Customer Backend Engineer"],
    integrations: [INTEGRATIONS_CATALOG.rateLimitGateway],
    resources: [
      "Live RPS/spend curve telemetry",
      "Per-tenant rate-cap & DLQ controls",
      "90-second drill countdown clock",
    ],
    timeBox: "90s live countdown",
    trigger: "Crew Drill sprint starts (Alarm 1 injected)",
    inScope: [
      "Live source-key isolation, rate-cap remediation, and DLQ overflow routing",
    ],
    outOfScope: ["Multiple-choice quizzes or slide-deck walkthroughs"],
    definitionOfDone: [
      "Offending source key capped with DLQ enabled and RPS/burn stabilized inside SLA for 3 consecutive ticks",
    ],
  },
  {
    index: 2,
    ofTotal: 3,
    subStageLabel: "2 of 3",
    alarmId: "sso_cert_expiring_24h",
    alarmName: "SSO certificate expiring within 24 hours",
    shortName: "SSO Cert <24h",
    goal: "Promote staged next X.509 certificate in dual-cert grace mode and verify live SSO handshake returns 200 NOMINAL with TTL > 365d.",
    singleAccountableOwner: "Lead Customer Success Engineer (CSE)",
    vendorEngineers: ["Lead CSE", "Lead FDE (shadow)"],
    customerEngineers: ["Customer On-Call SRE", "Customer Security Engineer"],
    integrations: [INTEGRATIONS_CATALOG.oktaSso],
    resources: [
      "Live Auth telemetry (CERT_TTL < 24h)",
      "Staged next X.509 certificate fingerprint",
      "Live SSO handshake verifier",
    ],
    timeBox: "90s live countdown",
    trigger: "Alarm 1 stabilized (Alarm 2 injected)",
    inScope: [
      "Zero-downtime staged cert promotion in dual-cert grace mode and live handshake verification",
    ],
    outOfScope: ["Issuing new root CAs or modifying end-user IdP policies"],
    definitionOfDone: [
      "Staged certificate promoted with dual-cert grace active and live SSO probe returning 200 NOMINAL (TTL > 365d)",
    ],
  },
  {
    index: 3,
    ofTotal: 3,
    subStageLabel: "3 of 3",
    alarmId: "dead_p1_alert_channel",
    alarmName: "P1 alerts routing to a dead/archived channel",
    shortName: "Dead P1 Route",
    goal: "Diagnose 404 channel_not_found trace, rebind P1 route to verified active ops channel, and verify live test P1 ping returns 200 OK.",
    singleAccountableOwner: "Lead Customer Success Engineer (CSE)",
    vendorEngineers: ["Lead CSE", "Support Engineer"],
    customerEngineers: ["Customer On-Call SRE"],
    integrations: [INTEGRATIONS_CATALOG.p1Alerting],
    resources: [
      "Live alert error stream (404 channel_not_found)",
      "Active P1 ops channel / PagerDuty target",
      "Live test ping verifier",
    ],
    timeBox: "90s live countdown",
    trigger: "Alarm 2 stabilized (Alarm 3 injected)",
    inScope: [
      "Live P1 alert route rebinding and synthetic 200 OK acknowledgement verification",
    ],
    outOfScope: ["Escalation schedule staffing rotations"],
    definitionOfDone: [
      "P1 alert sink rebound to active ops channel and synthetic P1 test ping verified 200 OK",
    ],
  },
];

export const HANDOVER_SPRINT_METADATA: HandoverSprintMetadata = {
  sprintName: "Handover Sprint: Signed NOMINAL Dossier & Tailored Day-1 Runbook",
  stageLabel: "Stage 4 -> Stage 5 Handover",
  goal: "Seal telemetry from Gates 1-3 with a deterministic SHA-256 verification digest and hand a stack-tailored Day-1 Runbook to Support Engineers and Customer On-Call SREs.",
  singleAccountableOwner: "Lead Forward-Deployed Engineer (FDE)",
  coSigners: [
    "Lead Customer Success Engineer (CSE)",
    "Customer Engineering Lead",
  ],
  vendorEngineers: [
    "Lead Forward-Deployed Engineer (FDE)",
    "Lead Customer Success Engineer (CSE)",
    "Support Engineer",
    "Technical Account Manager (TAM)",
  ],
  customerEngineers: [
    "Customer Engineering Lead",
    "Customer On-Call SRE",
  ],
  integrations: [
    INTEGRATIONS_CATALOG.p1Alerting,
    INTEGRATIONS_CATALOG.issueTracker,
    INTEGRATIONS_CATALOG.deploymentRollback,
  ],
  resources: [
    "Gate 1 flight-check.json",
    "Gate 2 static-fire.json",
    "Gate 3 crew-drill.json",
    "Active Operational Waiver Aging Register",
    "nominalx dossier & nominalx report exporters",
  ],
  timeBox: "30-min sign-off & publish sprint",
  trigger: "Gates 1, 2, and 3 complete with zero NO-GO blockers.",
  inScope: [
    "Deterministic SHA-256 signed Flight Readiness Dossier",
    "Stack-tailored Day-1 Customer Runbook with exact CLI verification and waiver closure commands",
    "Exports in Markdown (.md), JSON (.json), and Go-Live Slack mrkdwn",
  ],
  outOfScope: [
    "Unsigned verbal approvals or unverified spreadsheet sign-offs",
    "Waiving AUTH / SSO or RESIDENCY Hard Stops at sign-off",
  ],
  definitionOfDone: [
    "Signed NOMINAL or NOMINAL WITH WAIVERS Dossier sealed with SHA-256 digest",
    "Day-1 Runbook acknowledged by Support Engineers and Customer On-Call SREs",
    "Executive Readiness Report and Active Waiver Aging Register published",
  ],
};

export function getStageMetadata(stageNumber: StageNumber): StageMetadata {
  const stage = LIFECYCLE_STAGES.find((s) => s.stageNumber === stageNumber);
  if (!stage) {
    throw new Error(`Unknown lifecycle stage: ${stageNumber}`);
  }
  return stage;
}

export function computeJourneyState(input: {
  flightCheck?: FlightCheckResult;
  staticFire?: StaticFireResult;
  crewDrill?: CrewDrillResult;
  dossierSigned?: boolean;
}): JourneyState {
  const { flightCheck, staticFire, crewDrill, dossierSigned = false } = input;

  const g1Status: JourneyStageStatus["status"] = !flightCheck
    ? "ACTIVE"
    : flightCheck.verdict === "NO_GO"
      ? "NO_GO"
      : flightCheck.verdict === "CONDITIONAL_GO"
        ? "CONDITIONAL_GO"
        : "NOMINAL";

  const g2Status: JourneyStageStatus["status"] = !flightCheck || !flightCheck.passed
    ? "PENDING"
    : !staticFire
      ? "ACTIVE"
      : staticFire.passed
        ? "NOMINAL"
        : "NO_GO";

  const g3Status: JourneyStageStatus["status"] =
    !staticFire || !staticFire.passed
      ? "PENDING"
      : !crewDrill
        ? "ACTIVE"
        : crewDrill.allStabilized
          ? dossierSigned
            ? "NOMINAL"
            : "ACTIVE"
          : "NO_GO";

  const hardStopStatus: "CLEAR" | "BLOCKED" =
    flightCheck && flightCheck.counts.hardStopFailures > 0 ? "BLOCKED" : "CLEAR";

  const activeWaiverCount = flightCheck
    ? flightCheck.waiverAudit.activeWaivers.length
    : 0;

  let activeGate: JourneyState["activeGate"] = 1;
  let accountableOwner = "Lead FDE";
  if (flightCheck?.passed) {
    activeGate = 2;
    accountableOwner = "Lead FDE";
  }
  if (flightCheck?.passed && staticFire?.passed) {
    activeGate = 3;
    accountableOwner = "Lead CSE";
  }
  if (flightCheck?.passed && staticFire?.passed && crewDrill?.allStabilized) {
    activeGate = "HANDOVER";
    accountableOwner = "Lead FDE + Lead CSE";
  }

  let masterVerdict: JourneyState["masterVerdict"] = "NO_GO";
  if (flightCheck?.passed && staticFire?.passed && crewDrill?.allStabilized) {
    masterVerdict = activeWaiverCount > 0 ? "CONDITIONAL_GO" : "NOMINAL";
  } else if (
    flightCheck?.passed &&
    !staticFire &&
    !crewDrill &&
    activeWaiverCount > 0
  ) {
    masterVerdict = "CONDITIONAL_GO";
  } else if (flightCheck?.verdict === "NOMINAL" && !staticFire && !crewDrill) {
    masterVerdict = "NO_GO";
  }

  const stage2Pips: JourneyStageStatus["pips"] = flightCheck
    ? flightCheck.stations.map((s) => ({
        label: s.stationLabel,
        status: s.status,
      }))
    : GATE1_SUB_STAGES.map((s) => ({
        label: s.stationLabel,
        status: "PENDING",
      }));

  const stage3Pips: JourneyStageStatus["pips"] = staticFire
    ? staticFire.vectors.map((v) => ({
        label: v.shortName,
        status: v.passed ? "NOMINAL" : "NO_GO",
      }))
    : GATE2_SUB_STAGES.map((v) => ({
        label: v.shortName,
        status: "PENDING",
      }));

  const stage4Pips: JourneyStageStatus["pips"] = crewDrill
    ? [
        ...crewDrill.alarms.map((a) => ({
          label: a.subStage,
          status:
            a.status === "stabilized"
              ? a.overtime
                ? ("HOLD_WAIVED" as const)
                : ("NOMINAL" as const)
              : a.status === "active" || a.status === "overtime"
                ? ("ACTIVE" as const)
                : ("PENDING" as const),
        })),
        {
          label: "Dossier Seal",
          status: dossierSigned ? ("NOMINAL" as const) : ("PENDING" as const),
        },
      ]
    : [
        ...GATE3_SUB_STAGES.map((a) => ({
          label: a.shortName,
          status: "PENDING" as const,
        })),
        { label: "Dossier Seal", status: "PENDING" as const },
      ];

  const supportStatus: JourneyStageStatus["status"] = dossierSigned
    ? activeWaiverCount > 0
      ? "CONDITIONAL_GO"
      : "READY"
    : "PENDING";

  const renewalStatus: JourneyStageStatus["status"] = dossierSigned
    ? "READY"
    : "PENDING";

  return {
    stageStatus: {
      1: {
        stageNumber: 1,
        stageName: "Deal Close",
        shortTitle: "Deal Close",
        inUnverifiedGap: false,
        status: "NOMINAL",
        accountableOwner: "Lead SE / SA",
        pips: [{ label: "nominalx.yaml", status: "NOMINAL" }],
      },
      2: {
        stageNumber: 2,
        stageName: "Sales-to-FDE Handoff",
        shortTitle: "Flight Check",
        inUnverifiedGap: true,
        status: g1Status,
        accountableOwner: "Lead FDE",
        pips: stage2Pips,
      },
      3: {
        stageNumber: 3,
        stageName: "Integration & Cutover",
        shortTitle: "Static Fire",
        inUnverifiedGap: true,
        status: g2Status,
        accountableOwner: "Lead FDE",
        pips: stage3Pips,
      },
      4: {
        stageNumber: 4,
        stageName: "Day-30 Enablement & Handover",
        shortTitle: "Crew Drill",
        inUnverifiedGap: true,
        status: g3Status,
        accountableOwner: "Lead CSE",
        pips: stage4Pips,
      },
      5: {
        stageNumber: 5,
        stageName: "Support",
        shortTitle: "Support",
        inUnverifiedGap: false,
        status: supportStatus,
        accountableOwner: "Lead Support Engineer",
        pips: [
          {
            label: "Day-1 Runbook",
            status: dossierSigned ? "NOMINAL" : "PENDING",
          },
        ],
      },
      6: {
        stageNumber: 6,
        stageName: "Renewal & Expansion",
        shortTitle: "Renewal",
        inUnverifiedGap: false,
        status: renewalStatus,
        accountableOwner: "TAM",
        pips: [
          {
            label: "Resilience Baseline",
            status: dossierSigned ? "NOMINAL" : "PENDING",
          },
        ],
      },
    },
    activeGate,
    accountableOwner,
    masterVerdict,
    activeWaiverCount,
    hardStopStatus,
  };
}
