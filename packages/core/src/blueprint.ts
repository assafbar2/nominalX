import {
  GATE1_SUB_STAGES,
  GATE2_SUB_STAGES,
  GATE3_SUB_STAGES,
} from "./lifecycle.js";
import type {
  ChaosVectorId,
  CrewAlarmId,
  CustomAlarmConfig,
  CustomChaosVectorConfig,
  CustomStationConfig,
  NominalXConfig,
  StationCode,
} from "./types.js";

export type DeploymentModel =
  | "multi_tenant_saas"
  | "dedicated_vpc"
  | "self_hosted_on_prem";

export type ResidencyRegionOption = "eu" | "us" | "uk" | "custom";

export type RegulatedDataType = "hipaa" | "pci_dss" | "soc2_pii";

export type DataFlowType =
  | "apis"
  | "webhooks"
  | "batch_imports"
  | "event_streaming"
  | "db_warehouse_sync"
  | "installed_agent_sdk";

export type ReliabilityTier = "standard" | "high_volume";

export type P1ResponseTargetMinutes = 5 | 15 | 30;

export interface CustomerBlueprintInput {
  companyName: string;
  targetGoLive: string;
  deploymentModel: DeploymentModel;
  dealScopeSummary: string;
  leadFde: string;
  leadCse: string;
  customerEngLead?: string;
  cloudProvider?: string;
  idpProvider?: string;
  alertingPlatform?: string;
  // Step 2: Security & Compliance
  enterpriseSsoSaml: boolean;
  ssoProtocol?: "saml2" | "oidc";
  regionalDataResidency: boolean;
  residencyRegion: ResidencyRegionOption;
  customRegions?: string;
  regulatedData: RegulatedDataType[];
  privateNetworkingIpAllowlist: boolean;
  // Step 3: How Data & Traffic Move
  dataFlows: DataFlowType[];
  // Step 4: Scale & On-Call Model
  reliabilityTier: ReliabilityTier;
  customerHasOwnOnCall: boolean;
  targetP1ResponseMinutes: P1ResponseTargetMinutes;
}

export interface BlueprintGate1Item {
  id: StationCode;
  label: string;
  isBuiltIn: boolean;
  isHardStop: boolean;
  /** True when security/compliance policy locks this item as a Hard Stop. */
  hardStopLockedByPolicy: boolean;
  enabled: boolean;
  owner: string;
  soldPromise: string;
  endpoint: string;
  method: "GET" | "POST";
  whyAdded: string;
  customStation?: CustomStationConfig;
}

export interface BlueprintGate2Item {
  id: ChaosVectorId;
  label: string;
  description: string;
  isBuiltIn: boolean;
  enabled: boolean;
  owner: string;
  whyAdded: string;
  customVector?: CustomChaosVectorConfig;
}

export interface BlueprintGate3Item {
  id: CrewAlarmId;
  title: string;
  metricLabel: string;
  timerSeconds: number;
  isBuiltIn: boolean;
  enabled: boolean;
  owner: string;
  whyAdded: string;
  customAlarm?: CustomAlarmConfig;
}

export interface CustomerBlueprint {
  slug: string;
  input: CustomerBlueprintInput;
  gate1Items: BlueprintGate1Item[];
  gate2Items: BlueprintGate2Item[];
  gate3Items: BlueprintGate3Item[];
}

export const DEPLOYMENT_MODEL_LABELS: Record<DeploymentModel, string> = {
  multi_tenant_saas: "Multi-tenant SaaS",
  dedicated_vpc: "Dedicated Cloud / VPC",
  self_hosted_on_prem: "Self-Hosted / On-Prem",
};

export const DATA_FLOW_LABELS: Record<DataFlowType, string> = {
  apis: "REST / GraphQL APIs",
  webhooks: "Webhooks",
  batch_imports: "Batch / File Imports (S3/SFTP/CSV)",
  event_streaming: "Event Streaming (Kafka/PubSub)",
  db_warehouse_sync: "Database / Warehouse Sync",
  installed_agent_sdk: "Installed Agent / SDK",
};

export const REGULATED_DATA_LABELS: Record<RegulatedDataType, string> = {
  hipaa: "HIPAA (PHI)",
  pci_dss: "PCI-DSS (Cardholder)",
  soc2_pii: "SOC2 / Sensitive PII",
};

export function slugifyCompanyName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 44);
  return "customer-launch";
}

export function defaultGoLiveDateIso(referenceDateIso?: string): string {
  const base = referenceDateIso
    ? new Date(`${referenceDateIso}T00:00:00.000Z`)
    : new Date();
  const target = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

export function createDefaultBlueprintInput(
  referenceDateIso?: string,
): CustomerBlueprintInput {
  return {
    companyName: "",
    targetGoLive: defaultGoLiveDateIso(referenceDateIso),
    deploymentModel: "multi_tenant_saas",
    dealScopeSummary: "",
    leadFde: "alex.rivera@vendor.io",
    leadCse: "priya.nair@vendor.io",
    customerEngLead: "",
    cloudProvider: "aws",
    idpProvider: "okta-saml",
    alertingPlatform: "pagerduty+slack",
    enterpriseSsoSaml: true,
    ssoProtocol: "saml2",
    regionalDataResidency: true,
    residencyRegion: "us",
    customRegions: "",
    regulatedData: ["soc2_pii"],
    privateNetworkingIpAllowlist: false,
    dataFlows: ["apis", "webhooks"],
    reliabilityTier: "standard",
    customerHasOwnOnCall: true,
    targetP1ResponseMinutes: 15,
  };
}

function resolveAllowedRegions(input: CustomerBlueprintInput): string[] {
  if (!input.regionalDataResidency) {
    return ["us-east-1", "eu-central-1"];
  }
  switch (input.residencyRegion) {
    case "eu":
      return ["eu-central-1", "eu-west-1"];
    case "us":
      return ["us-east-1", "us-west-2"];
    case "uk":
      return ["eu-west-2"];
    case "custom": {
      const parsed = (input.customRegions ?? "")
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length >= 2);
      return parsed.length > 0 ? parsed : ["ap-southeast-1"];
    }
  }
}

function regionDisplayName(input: CustomerBlueprintInput): string {
  if (!input.regionalDataResidency) return "Standard multi-region";
  switch (input.residencyRegion) {
    case "eu":
      return "EU (eu-central-1, eu-west-1)";
    case "us":
      return "US (us-east-1, us-west-2)";
    case "uk":
      return "UK (eu-west-2)";
    case "custom":
      return `Custom (${resolveAllowedRegions(input).join(", ")})`;
  }
}

function resolveWebhookRuntime(input: CustomerBlueprintInput): string {
  if (input.deploymentModel === "self_hosted_on_prem") return "kubernetes-helm";
  if (input.dataFlows.includes("event_streaming")) return "kafka-consumer-service";
  if (input.dataFlows.includes("installed_agent_sdk")) return "agent-sdk-runtime";
  if (input.dataFlows.includes("batch_imports")) return "batch-etl-worker";
  if (input.dataFlows.includes("db_warehouse_sync")) return "warehouse-sync-connector";
  return "api-webhook-service";
}

function resolveDrillTimerSeconds(p1Minutes: P1ResponseTargetMinutes): number {
  if (p1Minutes === 5) return 60;
  if (p1Minutes === 15) return 90;
  return 120;
}

/**
 * Deterministic, zero-LLM blueprint generator for any B2B technical customer.
 * Maps plain operational selections across Steps 1-4 into Gate 1 checks & Hard Stops,
 * Gate 2 fault-injection tests, and Gate 3 live incident drills — each with an
 * explicit one-line "Why we added this" rationale.
 */
export function generateCustomerBlueprint(
  rawInput: CustomerBlueprintInput,
): CustomerBlueprint {
  const companyName = rawInput.companyName.trim() || "New Enterprise Customer";
  const slug = slugifyCompanyName(companyName);
  const fdeOwner = rawInput.leadFde.trim() || "alex.rivera@vendor.io";
  const cseOwner = rawInput.leadCse.trim() || "priya.nair@vendor.io";
  const customerEngLead =
    rawInput.customerEngLead?.trim() || `eng-lead@${slug}.example`;
  const ssoProtocol = rawInput.ssoProtocol ?? "saml2";
  const regions = resolveAllowedRegions(rawInput);
  const flows = new Set<DataFlowType>(rawInput.dataFlows);
  const regulated = new Set<RegulatedDataType>(rawInput.regulatedData);
  const isHighVolume = rawInput.reliabilityTier === "high_volume";
  const guaranteedRps = isHighVolume ? 50000 : 5000;
  const maxRtoMinutes = isHighVolume ? 5 : 15;
  const maxAckMs =
    rawInput.targetP1ResponseMinutes === 5
      ? 1500
      : rawInput.targetP1ResponseMinutes === 15
        ? 2000
        : 3500;
  const drillTimerSec = resolveDrillTimerSeconds(
    rawInput.targetP1ResponseMinutes,
  );

  const input: CustomerBlueprintInput = {
    ...rawInput,
    companyName,
    leadFde: fdeOwner,
    leadCse: cseOwner,
    customerEngLead,
    ssoProtocol,
    cloudProvider:
      rawInput.cloudProvider?.trim() ||
      (rawInput.deploymentModel === "self_hosted_on_prem" ? "on-prem" : "aws"),
    idpProvider:
      rawInput.idpProvider?.trim() ||
      (ssoProtocol === "oidc" ? "entra-oidc" : "okta-saml"),
    alertingPlatform: rawInput.alertingPlatform?.trim() || "pagerduty+slack",
  };

  // ── GATE 1: Setup Checks & Hard Stops ──────────────────────────────────────
  const gate1Items: BlueprintGate1Item[] = [];

  gate1Items.push({
    id: "AUTH_SSO",
    label: "AUTH / SSO",
    isBuiltIn: true,
    isHardStop: true,
    hardStopLockedByPolicy: true,
    enabled: input.enterpriseSsoSaml,
    owner: fdeOwner,
    soldPromise: input.enterpriseSsoSaml
      ? `${ssoProtocol.toUpperCase()} enforced with MFA, unsigned assertions rejected, and cert TTL >= 30d`
      : "Production authentication & access control boundaries verified",
    endpoint: "/sso/metadata",
    method: "GET",
    whyAdded: input.enterpriseSsoSaml
      ? "Locked as a non-waivable Hard Stop because you selected Enterprise SSO / SAML in Step 2."
      : "Included as baseline identity check (toggle on if SSO is added later).",
  });

  gate1Items.push({
    id: "RESIDENCY",
    label: "RESIDENCY",
    isBuiltIn: true,
    isHardStop: true,
    hardStopLockedByPolicy: true,
    enabled: input.regionalDataResidency,
    owner: fdeOwner,
    soldPromise: `All compute, storage, and egress strictly pinned to [${regions.join(", ")}]`,
    endpoint: "/health/region",
    method: "GET",
    whyAdded: input.regionalDataResidency
      ? `Locked as a non-waivable Hard Stop because you required ${regionDisplayName(input)} Regional Data Residency in Step 2.`
      : "Included as regional routing baseline (disabled since residency pinning was not selected).",
  });

  if (regulated.has("hipaa")) {
    const customStation: CustomStationConfig = {
      code: "HIPAA_PHI_ENCRYPTION",
      label: "HIPAA PHI Encryption & BAA Audit",
      owner: fdeOwner,
      hard_stop: true,
      endpoint: "/compliance/hipaa/health",
      method: "GET",
      expected_status: 200,
      required_header: { name: "x-phi-encryption", contains: "AES-256-KMS" },
      required_json_field: { path: "hipaa.audit_logging_active", equals: true },
      sold_promise:
        "PHI encrypted with KMS (TLS 1.3 + AES-256) and immutable BAA access logging active",
      initial_status: "NO_GO",
      failure_evidence:
        "GET /compliance/hipaa/health missing AES-256-KMS header or audit_logging_active=false",
      fix_summary:
        "Enable KMS customer-managed encryption and immutable HIPAA audit trail on staging",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: true,
      hardStopLockedByPolicy: true,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Locked as a non-waivable Hard Stop because you selected HIPAA regulated data in Step 2.",
      customStation,
    });
  }

  if (regulated.has("pci_dss")) {
    const customStation: CustomStationConfig = {
      code: "PCI_PAN_ISOLATION",
      label: "PCI-DSS Cardholder Isolation",
      owner: fdeOwner,
      hard_stop: true,
      endpoint: "/compliance/pci/vault",
      method: "GET",
      expected_status: 200,
      required_header: { name: "x-pci-vault-mode", contains: "FIPS-140-3" },
      required_json_field: { path: "tokenization.pan_isolated", equals: true },
      sold_promise:
        "Cardholder PAN isolated in FIPS 140-3 tokenized vault with zero raw PAN in logs",
      initial_status: "NO_GO",
      failure_evidence:
        "GET /compliance/pci/vault reported pan_isolated=false or software fallback",
      fix_summary:
        "Bind FIPS 140-3 tokenization vault and verify raw PAN redaction in staging logs",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: true,
      hardStopLockedByPolicy: true,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Locked as a non-waivable Hard Stop because you selected PCI-DSS regulated data in Step 2.",
      customStation,
    });
  }

  if (regulated.has("soc2_pii")) {
    const customStation: CustomStationConfig = {
      code: "SOC2_PII_AUDIT_TRAIL",
      label: "SOC2 Audit Trail & PII Redaction",
      owner: fdeOwner,
      hard_stop: true,
      endpoint: "/compliance/soc2/audit",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "audit.pii_redaction_enforced", equals: true },
      sold_promise:
        "Immutable admin/data access logs enabled with sensitive PII redacted from error traces",
      initial_status: "NO_GO",
      failure_evidence:
        "GET /compliance/soc2/audit returned pii_redaction_enforced=false",
      fix_summary:
        "Enable structured PII scrubbing middleware and verify immutable audit log sink",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: true,
      hardStopLockedByPolicy: true,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Locked as a non-waivable Hard Stop because you selected SOC2 / Sensitive PII in Step 2.",
      customStation,
    });
  }

  if (input.privateNetworkingIpAllowlist) {
    const customStation: CustomStationConfig = {
      code: "PRIVATE_NET_ALLOWLIST",
      label: "Private Networking / IP Allowlist",
      owner: fdeOwner,
      hard_stop: true,
      endpoint: "/health/network-policy",
      method: "GET",
      expected_status: 200,
      required_header: { name: "x-network-boundary", contains: "private-allowlist" },
      required_json_field: { path: "network.public_ingress_blocked", equals: true },
      sold_promise:
        "PrivateLink / VPN / CIDR IP allowlist enforced; unapproved public IPs rejected with 403",
      initial_status: "NO_GO",
      failure_evidence:
        "GET /health/network-policy accepted public internet probe instead of returning 403",
      fix_summary:
        "Lock ingress security groups to customer CIDR allowlist / PrivateLink endpoint",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: true,
      hardStopLockedByPolicy: true,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Locked as a non-waivable Hard Stop because you enabled Private Networking / IP Allowlisting in Step 2.",
      customStation,
    });
  }

  if (input.deploymentModel === "dedicated_vpc") {
    const customStation: CustomStationConfig = {
      code: "VPC_PEERING_ISOLATION",
      label: "Dedicated VPC Peering & Tenant Isolation",
      owner: fdeOwner,
      hard_stop: false,
      endpoint: "/health/vpc-isolation",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "vpc.single_tenant_isolated", equals: true },
      sold_promise:
        "Dedicated Cloud / VPC peering, private DNS routing, and single-tenant IAM isolation verified",
      initial_status: "NO_GO",
      failure_evidence:
        "VPC peering route table or dedicated KMS key policy not yet verified on staging",
      fix_summary:
        "Confirm Terraform VPC peering state and private DNS resolution from customer subnet",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: false,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Added because you chose Dedicated Cloud / VPC deployment in Step 1.",
      customStation,
    });
  }

  if (input.deploymentModel === "self_hosted_on_prem") {
    const customStation: CustomStationConfig = {
      code: "SELF_HOSTED_PREFLIGHT",
      label: "Self-Hosted Runtime & Air-Gap Preflight",
      owner: fdeOwner,
      hard_stop: false,
      endpoint: "/health/self-hosted",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "runtime.helm_preflight_passed", equals: true },
      sold_promise:
        "Signed container images, TLS certs, storage volumes, and upgrade/rollback path verified in customer cluster",
      initial_status: "NO_GO",
      failure_evidence:
        "Cluster preflight checks pending for image registry mirror and persistent volume backup",
      fix_summary:
        "Verify signed container registry mirror, TLS trust store, and Helm rollback snapshot",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: false,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Added because you chose Self-Hosted / On-Prem deployment in Step 1.",
      customStation,
    });
  }

  gate1Items.push({
    id: "WEBHOOKS",
    label: "WEBHOOKS",
    isBuiltIn: true,
    isHardStop: false,
    hardStopLockedByPolicy: false,
    enabled: flows.has("webhooks"),
    owner: fdeOwner,
    soldPromise:
      "Webhook ingress verifies HMAC-SHA256 signatures, rejects unsigned/tampered calls, and supports dual-key rotation",
    endpoint: "/webhooks/events",
    method: "POST",
    whyAdded: flows.has("webhooks")
      ? "Added because you selected Webhooks in Step 3."
      : "Disabled because Webhooks was not selected in Step 3 (toggle on anytime).",
  });

  gate1Items.push({
    id: "QUOTA_RATE",
    label: "QUOTA / RATE",
    isBuiltIn: true,
    isHardStop: false,
    hardStopLockedByPolicy: false,
    enabled: flows.has("apis") || isHighVolume || flows.size === 0,
    owner: fdeOwner,
    soldPromise: `Provisioned >= ${guaranteedRps.toLocaleString("en-US")} RPS ceiling with numeric Retry-After headers on HTTP 429`,
    endpoint: "/internal/quota",
    method: "GET",
    whyAdded: isHighVolume
      ? `Added with a ${guaranteedRps.toLocaleString("en-US")} RPS ceiling because you selected High-Volume / Mission-Critical SLA in Step 4.`
      : flows.has("apis")
        ? `Added with a ${guaranteedRps.toLocaleString("en-US")} RPS baseline because you selected REST / GraphQL APIs in Step 3.`
        : "Included as baseline API capacity and rate-limit check.",
  });

  if (flows.has("batch_imports")) {
    const customStation: CustomStationConfig = {
      code: "BATCH_IMPORT_PIPELINE",
      label: "Batch / File Import Pipeline",
      owner: fdeOwner,
      hard_stop: false,
      endpoint: "/batch/imports/health",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "batch.checksum_validation", equals: true },
      sold_promise:
        "S3/SFTP/CSV drop credentials, schema validation, SHA-256 checksum check, and dead-letter reject bucket verified",
      initial_status: "NO_GO",
      failure_evidence:
        "Staging S3/SFTP drop bucket permissions or reject-file quarantine path not yet verified",
      fix_summary:
        "Verify least-privilege S3/SFTP credentials and schema + checksum dry-run import",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: false,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Added because you selected Batch / File Imports (S3/SFTP/CSV) in Step 3.",
      customStation,
    });
  }

  if (flows.has("event_streaming")) {
    const customStation: CustomStationConfig = {
      code: "STREAM_BROKER_CONTRACT",
      label: "Event Stream Broker & Topic ACLs",
      owner: fdeOwner,
      hard_stop: false,
      endpoint: "/streaming/health",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "streaming.sasl_tls_verified", equals: true },
      sold_promise:
        "Kafka/PubSub TLS+SASL auth, topic ACLs, schema registry version, and consumer lag alerting verified",
      initial_status: "NO_GO",
      failure_evidence:
        "Staging Kafka/PubSub consumer group credentials or dead-letter topic ACLs unverified",
      fix_summary:
        "Confirm SASL/TLS handshake, topic partition count, and DLQ topic write ACLs",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: false,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Added because you selected Event Streaming (Kafka/PubSub) in Step 3.",
      customStation,
    });
  }

  if (flows.has("db_warehouse_sync")) {
    const customStation: CustomStationConfig = {
      code: "WAREHOUSE_SYNC_CONTRACT",
      label: "Database / Warehouse Sync Contract",
      owner: fdeOwner,
      hard_stop: false,
      endpoint: "/sync/warehouse/health",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "sync.read_only_role_verified", equals: true },
      sold_promise:
        "Scoped service role, watermark cursor checkpointing, and zero-lock incremental sync verified",
      initial_status: "NO_GO",
      failure_evidence:
        "Staging database/warehouse role permissions or incremental watermark cursor unverified",
      fix_summary:
        "Grant least-privilege sync role and verify dry-run incremental watermark sync",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: false,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Added because you selected Database / Warehouse Sync in Step 3.",
      customStation,
    });
  }

  if (flows.has("installed_agent_sdk")) {
    const customStation: CustomStationConfig = {
      code: "AGENT_SDK_TELEMETRY",
      label: "Installed Agent / SDK Handshake",
      owner: fdeOwner,
      hard_stop: false,
      endpoint: "/sdk/agent/health",
      method: "GET",
      expected_status: 200,
      required_json_field: { path: "sdk.version_pinned", equals: true },
      sold_promise:
        "Signed agent/SDK package checksum, outbound mTLS/TLS proxy traversal, and version pinning verified",
      initial_status: "NO_GO",
      failure_evidence:
        "Staging agent/SDK telemetry heartbeat or pinned version check has not yet passed",
      fix_summary:
        "Verify signed package checksum, outbound proxy rules, and agent heartbeat in staging",
    };
    gate1Items.push({
      id: customStation.code,
      label: customStation.label,
      isBuiltIn: false,
      isHardStop: false,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: customStation.owner,
      soldPromise: customStation.sold_promise,
      endpoint: customStation.endpoint,
      method: customStation.method,
      whyAdded:
        "Added because you selected Installed Agent / SDK in Step 3.",
      customStation,
    });
  }

  gate1Items.push({
    id: "ALERTING",
    label: "ALERTING",
    isBuiltIn: true,
    isHardStop: false,
    hardStopLockedByPolicy: false,
    enabled: true,
    owner: cseOwner,
    soldPromise: `Synthetic P1 alert reaches #eng-${slug}-p1 within ${maxAckMs}ms (${input.targetP1ResponseMinutes}-min P1 response SLA)`,
    endpoint: "/alerts/test",
    method: "POST",
    whyAdded: `Added because you set a ${input.targetP1ResponseMinutes}-minute P1 response target in Step 4.`,
  });

  gate1Items.push({
    id: "ROLLBACK",
    label: "ROLLBACK",
    isBuiltIn: true,
    isHardStop: false,
    hardStopLockedByPolicy: false,
    enabled: true,
    owner: fdeOwner,
    soldPromise: `Versioned release rollback dry-run completes <= ${maxRtoMinutes}m RTO with zero data loss`,
    endpoint: "/internal/rollback/dry-run",
    method: "POST",
    whyAdded: isHighVolume
      ? `Added with a strict <= ${maxRtoMinutes}m RTO because you chose High-Volume / Mission-Critical SLA in Step 4.`
      : `Added as a required cutover safety net (<= ${maxRtoMinutes}m RTO) for ${DEPLOYMENT_MODEL_LABELS[input.deploymentModel]}.`,
  });

  // ── GATE 2: Fault-Injection Tests ──────────────────────────────────────────
  const gate2Items: BlueprintGate2Item[] = [];

  const builtInVectorReasons: Record<
    string,
    { enabled: boolean; whyAdded: string }
  > = {
    duplicate_webhook: {
      enabled: flows.has("webhooks") || flows.has("apis"),
      whyAdded: flows.has("webhooks")
        ? "Added because you selected Webhooks in Step 3 — proves duplicate retries never double-write."
        : "Added because you selected REST / GraphQL APIs in Step 3 — proves retry idempotency.",
    },
    out_of_order: {
      enabled: flows.has("webhooks") || flows.has("event_streaming"),
      whyAdded: flows.has("webhooks")
        ? "Added because you selected Webhooks in Step 3 — prevents stale out-of-order events from resurrecting old state."
        : "Added because you selected Event Streaming in Step 3 — proves monotonic state ordering.",
    },
    rate_limit_429: {
      enabled: flows.has("apis") || flows.has("webhooks") || isHighVolume,
      whyAdded: isHighVolume
        ? "Added because you chose High-Volume / Mission-Critical SLA in Step 4 — proves clean backoff under burst load."
        : "Added because you selected APIs / Webhooks in Step 3 — proves Retry-After backoff without retry storms.",
    },
    upstream_timeout_30s: {
      enabled:
        flows.has("apis") ||
        flows.has("webhooks") ||
        isHighVolume ||
        flows.size === 0,
      whyAdded: isHighVolume
        ? "Added because you chose High-Volume / Mission-Critical SLA in Step 4 — prevents worker exhaustion during 30s stalls."
        : "Added to verify hard request timeouts and clean Dead-Letter Queue fallback on upstream stalls.",
    },
    dual_hmac_rotation: {
      enabled: flows.has("webhooks"),
      whyAdded: flows.has("webhooks")
        ? "Added because you selected Webhooks in Step 3 — proves zero-downtime signing secret rotation."
        : "Disabled because Webhooks was not selected in Step 3.",
    },
    additive_json_fields: {
      enabled: flows.has("apis") || flows.has("webhooks"),
      whyAdded:
        "Added because you selected APIs / Webhooks in Step 3 — proves new backwards-compatible JSON fields will not crash deserializers.",
    },
    clock_skew_5m: {
      enabled: flows.has("webhooks") || input.enterpriseSsoSaml,
      whyAdded: flows.has("webhooks")
        ? "Added because you selected Webhooks in Step 3 — proves +-5m host clock drift passes while stale replays fail."
        : "Added because you enabled Enterprise SSO / SAML in Step 2 — verifies token/timestamp clock-skew tolerance.",
    },
  };

  for (const meta of GATE2_SUB_STAGES) {
    const decision = builtInVectorReasons[meta.vectorId] ?? {
      enabled: false,
      whyAdded: "Standard Gate 2 fault-injection test.",
    };
    gate2Items.push({
      id: meta.vectorId,
      label: meta.vectorName,
      description: meta.goal,
      isBuiltIn: true,
      enabled: decision.enabled,
      owner: fdeOwner,
      whyAdded: decision.whyAdded,
    });
  }

  if (flows.has("batch_imports")) {
    const customVector: CustomChaosVectorConfig = {
      id: "malformed_batch_partial_retry",
      label: "Malformed Batch Row & Partial-File Resume",
      description:
        "Inject malformed CSV/JSON rows mid-file and interrupt transfer at 50% to prove clean row quarantine and zero duplicate ingestion on retry.",
      owner: fdeOwner,
      endpoint_override: "/batch/imports/ingest",
      method: "POST",
      payload: { batch_id: "batch_fault_probe", corrupt_row_index: 42 },
      expected_status: 202,
      weight: 100,
      patch_id: "batch-quarantine-idempotent",
      patch_label: "Enable Row-Level Quarantine & Checksum Resume",
      patch_summary:
        "Quarantine invalid rows to dead-letter file and key ingestion on file_checksum + row_number.",
      patch_diff: [
        "- abortEntireBatchOnRowError(file)",
        "+ quarantineInvalidRow(row) && upsertByChecksumRow(file.sha256, row.index)",
      ],
    };
    gate2Items.push({
      id: customVector.id,
      label: customVector.label,
      description: customVector.description,
      isBuiltIn: false,
      enabled: true,
      owner: customVector.owner,
      whyAdded:
        "Added because you selected Batch / File Imports (S3/SFTP/CSV) in Step 3.",
      customVector,
    });
  }

  if (flows.has("event_streaming")) {
    const customVector: CustomChaosVectorConfig = {
      id: "stream_poison_pill_dlq",
      label: "Poison-Pill Event & Consumer Rebalance",
      description:
        "Inject an unparseable message and force a consumer group rebalance to prove the poison pill routes to DLQ without stalling partitions or duplicating commits.",
      owner: fdeOwner,
      endpoint_override: "/streaming/consume/test",
      method: "POST",
      payload: { topic: "events.prod", poison_pill: true, force_rebalance: true },
      expected_status: 200,
      weight: 100,
      patch_id: "stream-dlq-rebalance-guard",
      patch_label: "Route Poison Pills to DLQ & Commit Offsets Atomically",
      patch_summary:
        "Catch schema parse failures into dead-letter topic and commit offsets only after idempotent sink writes.",
      patch_diff: [
        "- consumer.onError((err) => worker.crash(err))",
        "+ consumer.routeToDlq(msg, err) && commitOffsetAfterIdempotentWrite(msg)",
      ],
    };
    gate2Items.push({
      id: customVector.id,
      label: customVector.label,
      description: customVector.description,
      isBuiltIn: false,
      enabled: true,
      owner: customVector.owner,
      whyAdded:
        "Added because you selected Event Streaming (Kafka/PubSub) in Step 3.",
      customVector,
    });
  }

  if (flows.has("db_warehouse_sync")) {
    const customVector: CustomChaosVectorConfig = {
      id: "warehouse_schema_drift_backfill",
      label: "Warehouse Column Drift & Interrupted Backfill",
      description:
        "Simulate an unexpected nullable column addition and mid-run connection drop to prove incremental sync resumes cleanly from the watermark without duplicate rows.",
      owner: fdeOwner,
      endpoint_override: "/sync/warehouse/probe",
      method: "POST",
      payload: { sync_mode: "incremental", inject_column_drift: true },
      expected_status: 200,
      weight: 100,
      patch_id: "warehouse-watermark-merge",
      patch_label: "Use MERGE Upsert & Tolerant Schema Evolution",
      patch_summary:
        "Replace blind INSERT with primary-key MERGE and ignore additive nullable warehouse columns.",
      patch_diff: [
        "- INSERT INTO target_table SELECT * FROM staging_batch",
        "+ MERGE INTO target_table USING staging_batch ON primary_key // idempotent watermark",
      ],
    };
    gate2Items.push({
      id: customVector.id,
      label: customVector.label,
      description: customVector.description,
      isBuiltIn: false,
      enabled: true,
      owner: customVector.owner,
      whyAdded:
        "Added because you selected Database / Warehouse Sync in Step 3.",
      customVector,
    });
  }

  if (flows.has("installed_agent_sdk")) {
    const customVector: CustomChaosVectorConfig = {
      id: "sdk_offline_buffer_reconnect",
      label: "Agent / SDK Offline Partition & Reconnect Storm",
      description:
        "Drop outbound connectivity for 5 minutes to prove bounded local buffering, zero host OOM, and jittered reconnect without losing telemetry.",
      owner: fdeOwner,
      endpoint_override: "/sdk/agent/reconnect-test",
      method: "POST",
      payload: { outage_seconds: 300, max_buffer_mb: 64 },
      expected_status: 200,
      weight: 100,
      patch_id: "sdk-bounded-ring-buffer",
      patch_label: "Enforce Bounded Ring Buffer & Jittered Reconnect",
      patch_summary:
        "Cap in-memory SDK queue at 64MB with disk spill and jittered exponential backoff on reconnect.",
      patch_diff: [
        "- buffer.push(event) // unbounded memory growth during network outage",
        "+ ringBuffer.pushBounded(event, { maxMb: 64, jitterBackoff: true })",
      ],
    };
    gate2Items.push({
      id: customVector.id,
      label: customVector.label,
      description: customVector.description,
      isBuiltIn: false,
      enabled: true,
      owner: customVector.owner,
      whyAdded:
        "Added because you selected Installed Agent / SDK in Step 3.",
      customVector,
    });
  }

  // Ensure at least 1 Gate 2 item is enabled even if user unselected everything in Step 3
  if (!gate2Items.some((item) => item.enabled) && gate2Items.length > 0) {
    gate2Items[0]!.enabled = true;
    gate2Items[0]!.whyAdded =
      "Kept enabled as minimum baseline Gate 2 fault-injection verification.";
  }

  // ── GATE 3: Live Incident Drills ───────────────────────────────────────────
  const gate3Items: BlueprintGate3Item[] = [];

  for (const meta of GATE3_SUB_STAGES) {
    const isSso = meta.alarmId === "sso_cert_expiring_24h";
    const isStorm = meta.alarmId === "runaway_ingestion_storm";
    const enabled = isSso ? input.enterpriseSsoSaml : true;

    let whyAdded: string;
    if (isSso) {
      whyAdded = input.enterpriseSsoSaml
        ? "Added because you enabled Enterprise SSO / SAML in Step 2 — rehearses zero-downtime cert rotation."
        : "Disabled because Enterprise SSO / SAML was not selected in Step 2.";
    } else if (isStorm) {
      whyAdded = isHighVolume
        ? `Added with a ${drillTimerSec}s SLA timer because you chose High-Volume / Mission-Critical SLA + ${input.targetP1ResponseMinutes}-min P1 target in Step 4.`
        : `Added because you configured a ${input.targetP1ResponseMinutes}-min P1 response model in Step 4 — rehearses quota/spend containment.`;
    } else {
      whyAdded = input.customerHasOwnOnCall
        ? `Added for joint Support + Customer On-Call SRE drill (${input.targetP1ResponseMinutes}-min P1 SLA) from Step 4.`
        : `Added to verify Vendor-Led P1 escalation and customer notification channel (${input.targetP1ResponseMinutes}-min P1 SLA) from Step 4.`;
    }

    gate3Items.push({
      id: meta.alarmId,
      title: meta.alarmName,
      metricLabel: isStorm
        ? "Ingest RPS"
        : isSso
          ? "Cert TTL"
          : "Alert Delivery Failure",
      timerSeconds: drillTimerSec,
      isBuiltIn: true,
      enabled,
      owner: cseOwner,
      whyAdded,
    });
  }

  if (input.deploymentModel === "self_hosted_on_prem") {
    const customAlarm: CustomAlarmConfig = {
      id: "self_hosted_upgrade_rollback_drill",
      title: "Self-Hosted Release Regression & Emergency Rollback",
      owner: cseOwner,
      timer_seconds: drillTimerSec,
      metric_label: "Error Rate %",
      trigger_symptom:
        "ALERT P1: Post-upgrade pod crashloop spiking 5xx rate to 48% in customer cluster.",
      log_lines: [
        "HELM_RELEASE_DEGRADED release=nominalx-prod rev=14 crashloop_pods=6/6",
        "ACTION REQUIRED: Roll back to verified rev=13 snapshot and confirm 200 OK health",
      ],
      remediation_label: "Execute Helm Rollback to Last Verified Snapshot",
      remediation_detail:
        "Run helm rollback to rev 13, verify migration compatibility, and confirm 3/3 green health ticks.",
      verification_proof:
        "200 OK · Self-hosted pods restored on rev=13 · 5xx rate 0.0% · 3/3 SLA ticks green",
    };
    gate3Items.push({
      id: customAlarm.id,
      title: customAlarm.title,
      metricLabel: customAlarm.metric_label,
      timerSeconds: customAlarm.timer_seconds,
      isBuiltIn: false,
      enabled: true,
      owner: customAlarm.owner,
      whyAdded:
        "Added because you chose Self-Hosted / On-Prem deployment in Step 1 — rehearses cluster rollback under P1 pressure.",
      customAlarm,
    });
  }

  if (!input.customerHasOwnOnCall) {
    const customAlarm: CustomAlarmConfig = {
      id: "vendor_led_p1_escalation_bridge",
      title: "Vendor-Led P1 Escalation & Customer Bridge Handshake",
      owner: cseOwner,
      timer_seconds: drillTimerSec,
      metric_label: "Escalation ACK Time",
      trigger_symptom: `ALERT P1: Customer has no 24/7 SRE team — Support Engineer must isolate fault and notify customer lead within ${input.targetP1ResponseMinutes}m.`,
      log_lines: [
        `ESCALATION_POLICY mode=vendor_led target_sla=${input.targetP1ResponseMinutes}m`,
        `CUSTOMER_CONTACT lead=${customerEngLead} channel=#eng-${slug}-p1`,
      ],
      remediation_label: "Apply Safe Circuit Breaker & Page Customer Backup Contact",
      remediation_detail:
        "Engage vendor-side circuit breaker to stop impact and dispatch structured status update to customer engineering lead.",
      verification_proof: `200 OK · Circuit breaker active + customer lead notified within ${input.targetP1ResponseMinutes}m SLA`,
    };
    gate3Items.push({
      id: customAlarm.id,
      title: customAlarm.title,
      metricLabel: customAlarm.metric_label,
      timerSeconds: customAlarm.timer_seconds,
      isBuiltIn: false,
      enabled: true,
      owner: customAlarm.owner,
      whyAdded:
        "Added because you indicated the customer does not have their own on-call engineers in Step 4.",
      customAlarm,
    });
  }

  return {
    slug,
    input,
    gate1Items,
    gate2Items,
    gate3Items,
  };
}

/**
 * Minimal blank starter blueprint so experienced engineers can build from scratch
 * in Step 5 with 1 core item per gate.
 */
export function createBlankCustomerBlueprint(
  partialInput?: Partial<CustomerBlueprintInput>,
): CustomerBlueprint {
  const base = createDefaultBlueprintInput();
  const companyName = partialInput?.companyName?.trim() || "Custom Launch";
  const slug = slugifyCompanyName(companyName);
  const fdeOwner = partialInput?.leadFde?.trim() || base.leadFde;
  const cseOwner = partialInput?.leadCse?.trim() || base.leadCse;
  const customerEngLead =
    partialInput?.customerEngLead?.trim() || `eng-lead@${slug}.example`;

  const input: CustomerBlueprintInput = {
    ...base,
    ...partialInput,
    companyName,
    leadFde: fdeOwner,
    leadCse: cseOwner,
    customerEngLead,
    enterpriseSsoSaml: false,
    regionalDataResidency: false,
    regulatedData: [],
    privateNetworkingIpAllowlist: false,
    dataFlows: [],
  };

  return {
    slug,
    input,
    gate1Items: [
      {
        id: "AUTH_SSO",
        label: "AUTH / SSO",
        isBuiltIn: true,
        isHardStop: true,
        hardStopLockedByPolicy: true,
        enabled: true,
        owner: fdeOwner,
        soldPromise: "Production auth & access controls verified on staging",
        endpoint: "/sso/metadata",
        method: "GET",
        whyAdded: "Starter Hard Stop in Blank Template — customize or add more checks below.",
      },
      {
        id: "ROLLBACK",
        label: "ROLLBACK",
        isBuiltIn: true,
        isHardStop: false,
        hardStopLockedByPolicy: false,
        enabled: true,
        owner: fdeOwner,
        soldPromise: "Release rollback dry-run verified within contracted RTO",
        endpoint: "/internal/rollback/dry-run",
        method: "POST",
        whyAdded: "Starter operational check in Blank Template.",
      },
    ],
    gate2Items: [
      {
        id: "upstream_timeout_30s",
        label: GATE2_SUB_STAGES[3]!.vectorName,
        description: GATE2_SUB_STAGES[3]!.goal,
        isBuiltIn: true,
        enabled: true,
        owner: fdeOwner,
        whyAdded: "Starter fault-injection test in Blank Template — add custom scenarios below.",
      },
    ],
    gate3Items: [
      {
        id: "dead_p1_alert_channel",
        title: GATE3_SUB_STAGES[2]!.alarmName,
        metricLabel: "Alert Delivery Failure",
        timerSeconds: 90,
        isBuiltIn: true,
        enabled: true,
        owner: cseOwner,
        whyAdded: "Starter live incident drill in Blank Template — add custom drills below.",
      },
    ],
  };
}

/**
 * Compiles any CustomerBlueprint into a 100% schema-valid NominalXConfig
 * compatible with @nominalx/core and the `nominalx` CLI.
 */
export function compileBlueprintToConfig(
  blueprint: CustomerBlueprint,
): NominalXConfig {
  const { input, slug } = blueprint;
  const regions = resolveAllowedRegions(input);
  const isHighVolume = input.reliabilityTier === "high_volume";
  const guaranteedRps = isHighVolume ? 50000 : 5000;
  const maxRtoMinutes = isHighVolume ? 5 : 15;
  const maxAckMs =
    input.targetP1ResponseMinutes === 5
      ? 1500
      : input.targetP1ResponseMinutes === 15
        ? 2000
        : 3500;

  const customStations: CustomStationConfig[] = blueprint.gate1Items
    .filter((item) => !item.isBuiltIn && item.enabled)
    .map((item) => ({
      ...(item.customStation ?? {
        code: String(item.id),
        label: item.label,
        owner: item.owner,
        endpoint: item.endpoint,
        method: item.method,
        expected_status: 200,
        sold_promise: item.soldPromise,
        initial_status: "NO_GO" as const,
      }),
      label: item.label,
      owner: item.owner,
      hard_stop: item.isHardStop,
      sold_promise: item.soldPromise,
    }));

  const enabledBuiltInVectors = new Set(
    blueprint.gate2Items
      .filter((item) => item.isBuiltIn && item.enabled)
      .map((item) => item.id),
  );
  const disabledVectors = GATE2_SUB_STAGES.map((m) => m.vectorId).filter(
    (id) => !enabledBuiltInVectors.has(id),
  );
  const customVectors: CustomChaosVectorConfig[] = blueprint.gate2Items
    .filter((item) => !item.isBuiltIn && item.enabled && item.customVector)
    .map((item) => item.customVector!);

  // Ensure schema rule: at least 1 active Gate 2 vector
  if (
    disabledVectors.length >= GATE2_SUB_STAGES.length &&
    customVectors.length === 0
  ) {
    disabledVectors.pop();
  }

  const enabledBuiltInAlarms = new Set(
    blueprint.gate3Items
      .filter((item) => item.isBuiltIn && item.enabled)
      .map((item) => item.id),
  );
  const disabledAlarms = GATE3_SUB_STAGES.map((m) => m.alarmId).filter(
    (id) => !enabledBuiltInAlarms.has(id),
  );
  const customAlarms: CustomAlarmConfig[] = blueprint.gate3Items
    .filter((item) => !item.isBuiltIn && item.enabled && item.customAlarm)
    .map((item) => item.customAlarm!);

  // Ensure schema rule: at least 1 active Gate 3 alarm
  if (
    disabledAlarms.length >= GATE3_SUB_STAGES.length &&
    customAlarms.length === 0
  ) {
    disabledAlarms.pop();
  }

  const tierLabel = isHighVolume ? "High-Volume SLA" : "Standard Prod";

  return {
    schema_version: "1.0",
    account: {
      id: slug,
      name: input.companyName.trim() || "New Enterprise Customer",
      industry: DEPLOYMENT_MODEL_LABELS[input.deploymentModel],
      tier: tierLabel,
      fde_owner: input.leadFde.trim() || "alex.rivera@vendor.io",
      cse_owner: input.leadCse.trim() || "priya.nair@vendor.io",
      support_owner: "support-oncall@vendor.io",
      customer_eng_lead:
        input.customerEngLead?.trim() || `eng-lead@${slug}.example`,
      customer_sre_lead: input.customerHasOwnOnCall
        ? `sre-oncall@${slug}.example`
        : input.leadCse.trim() || "priya.nair@vendor.io",
      target_go_live: /^\d{4}-\d{2}-\d{2}$/.test(input.targetGoLive)
        ? input.targetGoLive
        : defaultGoLiveDateIso(),
      stack: {
        cloud: input.cloudProvider?.trim() || "aws",
        idp: input.idpProvider?.trim() || "okta-saml",
        alerting: input.alertingPlatform?.trim() || "pagerduty+slack",
        webhook_runtime: resolveWebhookRuntime(input),
        deployment_tool:
          input.deploymentModel === "self_hosted_on_prem"
            ? "helm+kubernetes"
            : "terraform+ci",
      },
    },
    sold_contract: {
      auth: {
        protocol: input.ssoProtocol ?? "saml2",
        mfa_required: input.enterpriseSsoSaml,
        min_cert_ttl_days: 30,
        reject_unsigned_assertions: true,
      },
      residency: {
        allowed_regions: regions,
        strict_egress: input.regionalDataResidency,
      },
      webhooks: {
        signing: "hmac-sha256",
        dual_secret_rotation: true,
        max_clock_skew_seconds: 300,
      },
      quota: {
        guaranteed_rps: guaranteedRps,
        require_retry_after_header: true,
      },
      alerting: {
        p1_channel: `#eng-${slug}-p1`,
        max_ack_ms: maxAckMs,
      },
      rollback: {
        max_rto_minutes: maxRtoMinutes,
        dry_run_required: true,
      },
    },
    environment: {
      base_url: `https://staging.${slug}.example`,
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

/**
 * Reverse-maps any imported valid NominalXConfig (e.g. from nominalx.yaml)
 * into a CustomerBlueprint so imported customers work identically in the
 * interactive cockpit and can be edited in the wizard.
 */
export function blueprintFromNominalXConfig(
  config: NominalXConfig,
): CustomerBlueprint {
  const fdeOwner = config.account.fde_owner;
  const cseOwner = config.account.cse_owner;
  const regions = config.sold_contract.residency.allowed_regions;
  const firstRegion = (regions[0] ?? "").toLowerCase();
  const residencyRegion: ResidencyRegionOption = firstRegion.startsWith("eu-west-2")
    ? "uk"
    : firstRegion.startsWith("eu-")
      ? "eu"
      : firstRegion.startsWith("us-")
        ? "us"
        : "custom";

  const tierLower = (config.account.tier ?? "").toLowerCase();
  const deploymentModel: DeploymentModel = tierLower.includes("self-hosted")
    ? "self_hosted_on_prem"
    : tierLower.includes("vpc") || tierLower.includes("dedicated")
      ? "dedicated_vpc"
      : "multi_tenant_saas";

  const reliabilityTier: ReliabilityTier =
    config.sold_contract.quota.guaranteed_rps >= 25000
      ? "high_volume"
      : "standard";

  const targetP1ResponseMinutes: P1ResponseTargetMinutes =
    config.sold_contract.alerting.max_ack_ms <= 1500
      ? 5
      : config.sold_contract.alerting.max_ack_ms <= 2500
        ? 15
        : 30;

  const input: CustomerBlueprintInput = {
    companyName: config.account.name,
    targetGoLive: config.account.target_go_live,
    deploymentModel,
    dealScopeSummary: config.account.industry ?? "Imported from nominalx.yaml",
    leadFde: fdeOwner,
    leadCse: cseOwner,
    customerEngLead: config.account.customer_eng_lead,
    cloudProvider: config.account.stack.cloud,
    idpProvider: config.account.stack.idp,
    alertingPlatform: config.account.stack.alerting,
    enterpriseSsoSaml: config.sold_contract.auth.mfa_required,
    ssoProtocol: config.sold_contract.auth.protocol,
    regionalDataResidency: config.sold_contract.residency.strict_egress,
    residencyRegion,
    customRegions: residencyRegion === "custom" ? regions.join(", ") : "",
    regulatedData: [],
    privateNetworkingIpAllowlist: false,
    dataFlows: ["apis", "webhooks"],
    reliabilityTier,
    customerHasOwnOnCall: true,
    targetP1ResponseMinutes,
  };

  const gate1Items: BlueprintGate1Item[] = [
    ...GATE1_SUB_STAGES.map((meta): BlueprintGate1Item => {
      const endpointMap: Record<string, string> = {
        AUTH_SSO: config.environment.endpoints.auth_metadata,
        RESIDENCY: config.environment.endpoints.residency_probe,
        WEBHOOKS: config.environment.endpoints.webhook_ingress,
        QUOTA_RATE: config.environment.endpoints.quota_status,
        ALERTING: config.environment.endpoints.alert_sink,
        ROLLBACK: config.environment.endpoints.rollback_check,
      };
      return {
        id: meta.stationCode,
        label: meta.stationLabel,
        isBuiltIn: true,
        isHardStop: meta.policyClass === "HARD_STOP",
        hardStopLockedByPolicy: meta.policyClass === "HARD_STOP",
        enabled: true,
        owner:
          meta.stationCode === "ALERTING"
            ? cseOwner
            : fdeOwner,
        soldPromise: meta.goal,
        endpoint: endpointMap[meta.stationCode] ?? "/health",
        method:
          meta.stationCode === "WEBHOOKS" ||
          meta.stationCode === "ALERTING" ||
          meta.stationCode === "ROLLBACK"
            ? "POST"
            : "GET",
        whyAdded: "Imported from nominalx.yaml core station contract.",
      };
    }),
    ...(config.custom_stations ?? []).map(
      (cs): BlueprintGate1Item => ({
        id: cs.code,
        label: cs.label,
        isBuiltIn: false,
        isHardStop: Boolean(cs.hard_stop),
        hardStopLockedByPolicy: Boolean(cs.hard_stop),
        enabled: true,
        owner: cs.owner,
        soldPromise: cs.sold_promise,
        endpoint: cs.endpoint,
        method: cs.method,
        whyAdded: "Imported custom Gate 1 station from nominalx.yaml.",
        customStation: cs,
      }),
    ),
  ];

  const disabledVectors = new Set(config.chaos_overrides?.disabled_vectors ?? []);
  const gate2Items: BlueprintGate2Item[] = [
    ...GATE2_SUB_STAGES.map(
      (meta): BlueprintGate2Item => ({
        id: meta.vectorId,
        label: meta.vectorName,
        description: meta.goal,
        isBuiltIn: true,
        enabled: !disabledVectors.has(meta.vectorId),
        owner: fdeOwner,
        whyAdded: disabledVectors.has(meta.vectorId)
          ? "Disabled in imported nominalx.yaml."
          : "Imported built-in Gate 2 fault test from nominalx.yaml.",
      }),
    ),
    ...(config.custom_vectors ?? []).map(
      (cv): BlueprintGate2Item => ({
        id: cv.id,
        label: cv.label,
        description: cv.description,
        isBuiltIn: false,
        enabled: true,
        owner: cv.owner,
        whyAdded: "Imported custom Gate 2 fault test from nominalx.yaml.",
        customVector: cv,
      }),
    ),
  ];

  const disabledAlarms = new Set(config.disabled_alarms ?? []);
  const gate3Items: BlueprintGate3Item[] = [
    ...GATE3_SUB_STAGES.map(
      (meta): BlueprintGate3Item => ({
        id: meta.alarmId,
        title: meta.alarmName,
        metricLabel:
          meta.alarmId === "runaway_ingestion_storm"
            ? "Ingest RPS"
            : meta.alarmId === "sso_cert_expiring_24h"
              ? "Cert TTL"
              : "Alert Delivery Failure",
        timerSeconds: 90,
        isBuiltIn: true,
        enabled: !disabledAlarms.has(meta.alarmId),
        owner: cseOwner,
        whyAdded: disabledAlarms.has(meta.alarmId)
          ? "Disabled in imported nominalx.yaml."
          : "Imported built-in Gate 3 live incident drill from nominalx.yaml.",
      }),
    ),
    ...(config.custom_alarms ?? []).map(
      (ca): BlueprintGate3Item => ({
        id: ca.id,
        title: ca.title,
        metricLabel: ca.metric_label,
        timerSeconds: ca.timer_seconds,
        isBuiltIn: false,
        enabled: true,
        owner: ca.owner,
        whyAdded: "Imported custom Gate 3 incident drill from nominalx.yaml.",
        customAlarm: ca,
      }),
    ),
  ];

  return {
    slug: config.account.id,
    input,
    gate1Items,
    gate2Items,
    gate3Items,
  };
}
