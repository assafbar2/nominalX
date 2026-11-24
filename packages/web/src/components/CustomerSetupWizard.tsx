import { useEffect, useState } from "react";
import {
  createBlankCustomerBlueprint,
  createDefaultBlueprintInput,
  DATA_FLOW_LABELS,
  DEPLOYMENT_MODEL_LABELS,
  generateCustomerBlueprint,
  REGULATED_DATA_LABELS,
  type BlueprintGate1Item,
  type BlueprintGate2Item,
  type BlueprintGate3Item,
  type CustomerBlueprint,
  type CustomerBlueprintInput,
  type DataFlowType,
  type DeploymentModel,
  type P1ResponseTargetMinutes,
  type RegulatedDataType,
  type ResidencyRegionOption,
} from "@nominalx/core";
import { HelpTip } from "./HelpTip";
import { ShieldLockIcon } from "./Icons";

interface CustomerSetupWizardProps {
  open: boolean;
  editingCustomerId?: string | null;
  initialBlueprint?: CustomerBlueprint | null;
  onClose: () => void;
  onComplete: (blueprint: CustomerBlueprint, editingCustomerId?: string | null) => void;
}

const STEP_META = [
  { num: 1, title: "Customer & Deployment", short: "1. Customer", helpKey: "wizard.step1" as const },
  { num: 2, title: "Security & Compliance", short: "2. Hard Stops", helpKey: "wizard.step2" as const },
  { num: 3, title: "Data & Traffic", short: "3. Data Flows", helpKey: "wizard.step3" as const },
  { num: 4, title: "Scale & On-Call", short: "4. Scale & P1", helpKey: "wizard.step4" as const },
  { num: 5, title: "Review Launch Blueprint", short: "5. Blueprint", helpKey: "wizard.step5" as const },
] as const;

const DATA_FLOW_CARDS: Array<{
  id: DataFlowType;
  label: string;
  g1Preview: string;
  g2Preview: string;
}> = [
  {
    id: "apis",
    label: DATA_FLOW_LABELS.apis,
    g1Preview: "Gate 1: Quota ceiling & Retry-After contract",
    g2Preview: "Gate 2: 429 burst, additive JSON fields & 30s timeout",
  },
  {
    id: "webhooks",
    label: DATA_FLOW_LABELS.webhooks,
    g1Preview: "Gate 1: HMAC-SHA256 signing & dual-key delivery",
    g2Preview: "Gate 2: Duplicate retry idempotency, ordering, rotation & clock skew",
  },
  {
    id: "batch_imports",
    label: DATA_FLOW_LABELS.batch_imports,
    g1Preview: "Gate 1: S3/SFTP drop credentials & checksum validation",
    g2Preview: "Gate 2: Malformed batch row quarantine & partial-file resume",
  },
  {
    id: "event_streaming",
    label: DATA_FLOW_LABELS.event_streaming,
    g1Preview: "Gate 1: Broker TLS/SASL auth, topic ACLs & lag ceiling",
    g2Preview: "Gate 2: Poison-pill DLQ routing & consumer rebalance",
  },
  {
    id: "db_warehouse_sync",
    label: DATA_FLOW_LABELS.db_warehouse_sync,
    g1Preview: "Gate 1: Scoped read-only role & incremental watermark",
    g2Preview: "Gate 2: Column schema drift & interrupted backfill idempotency",
  },
  {
    id: "installed_agent_sdk",
    label: DATA_FLOW_LABELS.installed_agent_sdk,
    g1Preview: "Gate 1: Signed package checksum & pinned SDK version",
    g2Preview: "Gate 2: Offline buffer cap & jittered reconnect storm",
  },
];

const REGULATED_CARDS: Array<{
  id: RegulatedDataType;
  label: string;
  lockReason: string;
}> = [
  {
    id: "hipaa",
    label: REGULATED_DATA_LABELS.hipaa,
    lockReason: "Locked Hard Stop: PHI KMS encryption & immutable BAA audit trail cannot be waived.",
  },
  {
    id: "pci_dss",
    label: REGULATED_DATA_LABELS.pci_dss,
    lockReason: "Locked Hard Stop: Cardholder PAN vault isolation & zero raw PAN logs cannot be waived.",
  },
  {
    id: "soc2_pii",
    label: REGULATED_DATA_LABELS.soc2_pii,
    lockReason: "Locked Hard Stop: Immutable audit logs & PII redaction in error traces cannot be waived.",
  },
];

export function CustomerSetupWizard({
  open,
  editingCustomerId = null,
  initialBlueprint = null,
  onClose,
  onComplete,
}: CustomerSetupWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [input, setInput] = useState<CustomerBlueprintInput>(() =>
    createDefaultBlueprintInput(),
  );
  const [blueprint, setBlueprint] = useState<CustomerBlueprint>(() =>
    generateCustomerBlueprint(createDefaultBlueprintInput()),
  );
  const [blueprintDirty, setBlueprintDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 5 inline custom item adders
  const [addingKind, setAddingKind] = useState<"none" | "g1" | "g2" | "g3">("none");
  const [newG1Label, setNewG1Label] = useState("");
  const [newG1Promise, setNewG1Promise] = useState("");
  const [newG1HardStop, setNewG1HardStop] = useState(false);
  const [newG2Label, setNewG2Label] = useState("");
  const [newG2Desc, setNewG2Desc] = useState("");
  const [newG3Title, setNewG3Title] = useState("");
  const [newG3Metric, setNewG3Metric] = useState("Error Rate %");

  useEffect(() => {
    if (!open) return;
    if (initialBlueprint) {
      setInput(initialBlueprint.input);
      setBlueprint(initialBlueprint);
      setBlueprintDirty(true);
      setStep(editingCustomerId ? 5 : 1);
    } else {
      const def = createDefaultBlueprintInput();
      setInput(def);
      setBlueprint(generateCustomerBlueprint(def));
      setBlueprintDirty(false);
      setStep(1);
    }
    setError(null);
    setAddingKind("none");
  }, [open, initialBlueprint, editingCustomerId]);

  if (!open) return null;

  const updateInput = (patch: Partial<CustomerBlueprintInput>) => {
    setError(null);
    setInput((prev) => {
      const next = { ...prev, ...patch };
      setBlueprint(generateCustomerBlueprint(next));
      setBlueprintDirty(false);
      return next;
    });
  };

  const toggleRegulated = (item: RegulatedDataType) => {
    const exists = input.regulatedData.includes(item);
    updateInput({
      regulatedData: exists
        ? input.regulatedData.filter((x) => x !== item)
        : [...input.regulatedData, item],
    });
  };

  const toggleDataFlow = (flow: DataFlowType) => {
    const exists = input.dataFlows.includes(flow);
    updateInput({
      dataFlows: exists
        ? input.dataFlows.filter((x) => x !== flow)
        : [...input.dataFlows, flow],
    });
  };

  const goNext = () => {
    setError(null);
    if (step === 1 && !input.companyName.trim()) {
      setError("Enter the customer company name to continue.");
      return;
    }
    if (step === 4 && !blueprintDirty) {
      setBlueprint(generateCustomerBlueprint(input));
    }
    setStep((s) => Math.min(5, s + 1));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleToggleG1Enabled = (id: string) => {
    setError(null);
    const enabledCount = blueprint.gate1Items.filter((i) => i.enabled).length;
    const target = blueprint.gate1Items.find((i) => i.id === id);
    if (target?.enabled && enabledCount <= 1) {
      setError("Keep at least 1 Gate 1 setup check enabled.");
      return;
    }
    setBlueprintDirty(true);
    setBlueprint((prev) => ({
      ...prev,
      gate1Items: prev.gate1Items.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      ),
    }));
  };

  const handleToggleG1HardStop = (id: string) => {
    setBlueprintDirty(true);
    setBlueprint((prev) => ({
      ...prev,
      gate1Items: prev.gate1Items.map((item) =>
        item.id === id && !item.hardStopLockedByPolicy
          ? {
              ...item,
              isHardStop: !item.isHardStop,
              customStation: item.customStation
                ? { ...item.customStation, hard_stop: !item.isHardStop }
                : undefined,
            }
          : item,
      ),
    }));
  };

  const handleToggleG2Enabled = (id: string) => {
    setError(null);
    const enabledCount = blueprint.gate2Items.filter((i) => i.enabled).length;
    const target = blueprint.gate2Items.find((i) => i.id === id);
    if (target?.enabled && enabledCount <= 1) {
      setError("Keep at least 1 Gate 2 fault-injection test enabled.");
      return;
    }
    setBlueprintDirty(true);
    setBlueprint((prev) => ({
      ...prev,
      gate2Items: prev.gate2Items.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      ),
    }));
  };

  const handleToggleG3Enabled = (id: string) => {
    setError(null);
    const enabledCount = blueprint.gate3Items.filter((i) => i.enabled).length;
    const target = blueprint.gate3Items.find((i) => i.id === id);
    if (target?.enabled && enabledCount <= 1) {
      setError("Keep at least 1 Gate 3 live incident drill enabled.");
      return;
    }
    setBlueprintDirty(true);
    setBlueprint((prev) => ({
      ...prev,
      gate3Items: prev.gate3Items.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      ),
    }));
  };

  const handleAddCustomG1 = () => {
    if (!newG1Label.trim() || !newG1Promise.trim()) {
      setError("Enter both a check name and what staging must prove.");
      return;
    }
    const slug = newG1Label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 34);
    const code = /^[A-Z]/.test(slug) ? slug : `CUSTOM_${slug || "CHECK"}`;
    const uniqueCode = blueprint.gate1Items.some((i) => i.id === code)
      ? `${code}_${blueprint.gate1Items.length + 1}`
      : code;

    const item: BlueprintGate1Item = {
      id: uniqueCode,
      label: newG1Label.trim(),
      isBuiltIn: false,
      isHardStop: newG1HardStop,
      hardStopLockedByPolicy: false,
      enabled: true,
      owner: input.leadFde.trim() || "alex.rivera@vendor.io",
      soldPromise: newG1Promise.trim(),
      endpoint: `/health/${uniqueCode.toLowerCase()}`,
      method: "GET",
      whyAdded: "Added manually as a custom check in Step 5.",
      customStation: {
        code: uniqueCode,
        label: newG1Label.trim(),
        owner: input.leadFde.trim() || "alex.rivera@vendor.io",
        hard_stop: newG1HardStop,
        endpoint: `/health/${uniqueCode.toLowerCase()}`,
        method: "GET",
        expected_status: 200,
        sold_promise: newG1Promise.trim(),
        initial_status: "NO_GO",
      },
    };
    setBlueprintDirty(true);
    setBlueprint((prev) => ({ ...prev, gate1Items: [...prev.gate1Items, item] }));
    setNewG1Label("");
    setNewG1Promise("");
    setNewG1HardStop(false);
    setAddingKind("none");
    setError(null);
  };

  const handleAddCustomG2 = () => {
    if (!newG2Label.trim() || !newG2Desc.trim()) {
      setError("Enter both a fault test label and failure assertion.");
      return;
    }
    const rawId = newG2Label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 38);
    const baseId = /^[a-z]/.test(rawId) ? rawId : `fault_${rawId || "test"}`;
    const uniqueId = blueprint.gate2Items.some((i) => i.id === baseId)
      ? `${baseId}_${blueprint.gate2Items.length + 1}`
      : baseId;

    const item: BlueprintGate2Item = {
      id: uniqueId,
      label: newG2Label.trim(),
      description: newG2Desc.trim(),
      isBuiltIn: false,
      enabled: true,
      owner: input.leadFde.trim() || "alex.rivera@vendor.io",
      whyAdded: "Added manually as a custom Gate 2 fault test in Step 5.",
      customVector: {
        id: uniqueId,
        label: newG2Label.trim(),
        description: newG2Desc.trim(),
        owner: input.leadFde.trim() || "alex.rivera@vendor.io",
        method: "POST",
        expected_status: 200,
        weight: 80,
        patch_id: `fix_${uniqueId}`,
        patch_label: `Harden ${newG2Label.trim()}`,
        patch_summary: newG2Desc.trim(),
        patch_diff: [`+ enforceResilience("${uniqueId}")`],
      },
    };
    setBlueprintDirty(true);
    setBlueprint((prev) => ({ ...prev, gate2Items: [...prev.gate2Items, item] }));
    setNewG2Label("");
    setNewG2Desc("");
    setAddingKind("none");
    setError(null);
  };

  const handleAddCustomG3 = () => {
    if (!newG3Title.trim()) {
      setError("Enter a title for the custom live incident drill.");
      return;
    }
    const rawId = newG3Title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 38);
    const baseId = /^[a-z]/.test(rawId) ? rawId : `drill_${rawId || "alarm"}`;
    const uniqueId = blueprint.gate3Items.some((i) => i.id === baseId)
      ? `${baseId}_${blueprint.gate3Items.length + 1}`
      : baseId;

    const item: BlueprintGate3Item = {
      id: uniqueId,
      title: newG3Title.trim(),
      metricLabel: newG3Metric.trim() || "Error Rate %",
      timerSeconds: 90,
      isBuiltIn: false,
      enabled: true,
      owner: input.leadCse.trim() || "priya.nair@vendor.io",
      whyAdded: "Added manually as a custom Gate 3 incident drill in Step 5.",
      customAlarm: {
        id: uniqueId,
        title: newG3Title.trim(),
        owner: input.leadCse.trim() || "priya.nair@vendor.io",
        timer_seconds: 90,
        metric_label: newG3Metric.trim() || "Error Rate %",
        trigger_symptom: `ALERT P1: ${newG3Title.trim()} triggered during live rehearsal`,
        log_lines: [`P1_DRILL_START alarm=${uniqueId}`],
        remediation_label: `Execute ${newG3Title.trim()} runbook`,
        remediation_detail: `Stabilize ${newG3Title.trim()} and verify recovery metrics.`,
        verification_proof: `200 OK · ${newG3Title.trim()} stabilized · 3/3 SLA ticks green`,
      },
    };
    setBlueprintDirty(true);
    setBlueprint((prev) => ({ ...prev, gate3Items: [...prev.gate3Items, item] }));
    setNewG3Title("");
    setAddingKind("none");
    setError(null);
  };

  const handleUseBlankTemplate = () => {
    setBlueprintDirty(true);
    setBlueprint(createBlankCustomerBlueprint(input));
    setError(null);
  };

  const handleSubmit = () => {
    if (!input.companyName.trim()) {
      setError("Company name is required (Step 1).");
      setStep(1);
      return;
    }
    const finalBlueprint: CustomerBlueprint = {
      ...blueprint,
      input: {
        ...blueprint.input,
        companyName: input.companyName.trim(),
      },
    };
    onComplete(finalBlueprint, editingCustomerId);
  };

  const currentStepMeta = STEP_META[step - 1]!;
  const g1HardStops = blueprint.gate1Items.filter((i) => i.isHardStop);
  const g1Operational = blueprint.gate1Items.filter((i) => !i.isHardStop);
  const activeG1HardStopCount = g1HardStops.filter((i) => i.enabled).length;
  const activeG1OpCount = g1Operational.filter((i) => i.enabled).length;
  const activeG2Count = blueprint.gate2Items.filter((i) => i.enabled).length;
  const activeG3Count = blueprint.gate3Items.filter((i) => i.enabled).length;

  return (
    <div
      className="overlay-modal-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Universal B2B Customer Setup Wizard"
      data-testid="customer-setup-wizard"
    >
      <div
        className="modal-card wizard-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="help-inline">
              <span className="eyebrow" style={{ color: "var(--active-text)" }}>
                {editingCustomerId
                  ? "EDIT CUSTOMER BLUEPRINT · DETERMINISTIC ZERO-LLM ENGINE"
                  : "GUIDED CUSTOMER SETUP WIZARD · 60 SECONDS · ZERO-LLM"}
              </span>
              <HelpTip copyKey="wizard.header" />
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: "1.45rem", fontWeight: 800 }}>
              Step {step} of 5: {currentStepMeta.title}
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="wizard-close-btn"
          >
            Cancel
          </button>
        </div>

        {/* 5-Step Progress Bar */}
        <div className="wizard-stepper" role="tablist" aria-label="Setup Wizard Steps">
          {STEP_META.map((s) => {
            const isActive = s.num === step;
            const isDone = s.num < step;
            return (
              <button
                key={s.num}
                type="button"
                className={`wizard-step-pill ${isActive ? "active" : isDone ? "done" : ""}`}
                onClick={() => {
                  if (s.num <= step || input.companyName.trim()) {
                    setStep(s.num);
                    setError(null);
                  }
                }}
                data-testid={`wizard-step-tab-${s.num}`}
              >
                <span className="mono">{s.short}</span>
              </button>
            );
          })}
          <HelpTip copyKey={currentStepMeta.helpKey} />
        </div>

        {error && (
          <div className="validation-alert" role="alert" data-testid="wizard-error">
            {error}
          </div>
        )}

        {/* STEP BODY */}
        <div className="wizard-body">
          {/* STEP 1: Customer & Deployment */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                <div className="field-group">
                  <label className="field-label" htmlFor="wiz-company">
                    Customer Company Name *
                  </label>
                  <input
                    id="wiz-company"
                    className="field-input"
                    placeholder="e.g. Northstar Data Corp"
                    value={input.companyName}
                    onChange={(e) => updateInput({ companyName: e.target.value })}
                    data-testid="wizard-company-name"
                    autoFocus
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="wiz-golive">
                    Target Go-Live Date
                  </label>
                  <input
                    id="wiz-golive"
                    type="date"
                    className="field-input mono"
                    value={input.targetGoLive}
                    onChange={(e) => updateInput({ targetGoLive: e.target.value })}
                    data-testid="wizard-go-live-date"
                  />
                </div>
              </div>

              <div className="field-group">
                <span className="field-label">Deployment Model</span>
                <div className="wizard-option-grid-3">
                  {(
                    [
                      {
                        id: "multi_tenant_saas" as DeploymentModel,
                        title: "Multi-tenant SaaS",
                        desc: "Customer connects to your managed cloud plane.",
                      },
                      {
                        id: "dedicated_vpc" as DeploymentModel,
                        title: "Dedicated Cloud / VPC",
                        desc: "Single-tenant cloud, PrivateLink, or VPC peering.",
                      },
                      {
                        id: "self_hosted_on_prem" as DeploymentModel,
                        title: "Self-Hosted / On-Prem",
                        desc: "Runs inside customer Kubernetes / private data center.",
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = input.deploymentModel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`wizard-choice-card ${selected ? "selected" : ""}`}
                        onClick={() => updateInput({ deploymentModel: opt.id })}
                        data-testid={`wizard-deploy-${opt.id}`}
                      >
                        <strong style={{ fontSize: "0.94rem" }}>{opt.title}</strong>
                        <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="wiz-scope">
                  Short Deal / Integration Scope Summary
                </label>
                <input
                  id="wiz-scope"
                  className="field-input"
                  placeholder="e.g. Real-time billing webhooks + EU Snowflake sync with Okta SAML"
                  value={input.dealScopeSummary}
                  onChange={(e) => updateInput({ dealScopeSummary: e.target.value })}
                  data-testid="wizard-scope-summary"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field-group">
                  <label className="field-label" htmlFor="wiz-fde">
                    Lead FDE Name / Email (Owns Gates 1 &amp; 2)
                  </label>
                  <input
                    id="wiz-fde"
                    className="field-input mono"
                    value={input.leadFde}
                    onChange={(e) => updateInput({ leadFde: e.target.value })}
                    data-testid="wizard-lead-fde"
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="wiz-cse">
                    Lead CSE Name / Email (Owns Gate 3)
                  </label>
                  <input
                    id="wiz-cse"
                    className="field-input mono"
                    value={input.leadCse}
                    onChange={(e) => updateInput({ leadCse: e.target.value })}
                    data-testid="wizard-lead-cse"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Security & Compliance (Builds Gate 1 Hard Stops) */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "var(--nogo-bg)",
                  border: "1px solid var(--nogo-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: "0.84rem",
                }}
              >
                <ShieldLockIcon size={18} />
                <span>
                  Every security or compliance requirement selected below automatically becomes a{" "}
                  <strong>Non-Waivable Gate 1 Hard Stop</strong> — launch stays locked until verified Pass.
                </span>
              </div>

              {/* Enterprise SSO / SAML */}
              <div className={`wizard-toggle-block ${input.enterpriseSsoSaml ? "active-hardstop" : ""}`}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <div>
                    <strong style={{ fontSize: "0.96rem" }}>Enterprise SSO / SAML</strong>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Customer requires IdP SSO with MFA enforcement and certificate expiry checks.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={input.enterpriseSsoSaml}
                    onChange={(e) => updateInput({ enterpriseSsoSaml: e.target.checked })}
                    data-testid="wizard-toggle-sso"
                  />
                </label>
                {input.enterpriseSsoSaml && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                    <span className="hard-stop-shield">
                      <ShieldLockIcon size={12} />
                      <span>LOCKED HARD STOP: Prevents weak auth &amp; account takeover — never waivable</span>
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["saml2", "oidc"] as const).map((proto) => (
                        <button
                          key={proto}
                          type="button"
                          className={`btn ${input.ssoProtocol === proto ? "btn-primary" : ""}`}
                          style={{ padding: "4px 10px", fontSize: "0.74rem" }}
                          onClick={() => updateInput({ ssoProtocol: proto })}
                        >
                          {proto.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Regional Data Residency */}
              <div className={`wizard-toggle-block ${input.regionalDataResidency ? "active-hardstop" : ""}`}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <div>
                    <strong style={{ fontSize: "0.96rem" }}>Regional Data Residency</strong>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Contract requires all compute, storage, and egress to stay inside a specific region.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={input.regionalDataResidency}
                    onChange={(e) => updateInput({ regionalDataResidency: e.target.checked })}
                    data-testid="wizard-toggle-residency"
                  />
                </label>
                {input.regionalDataResidency && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {(
                        [
                          { id: "eu" as ResidencyRegionOption, label: "EU (eu-central-1)" },
                          { id: "us" as ResidencyRegionOption, label: "US (us-east-1)" },
                          { id: "uk" as ResidencyRegionOption, label: "UK (eu-west-2)" },
                          { id: "custom" as ResidencyRegionOption, label: "Custom Region" },
                        ] as const
                      ).map((reg) => (
                        <button
                          key={reg.id}
                          type="button"
                          className={`btn ${input.residencyRegion === reg.id ? "btn-primary" : ""}`}
                          style={{ padding: "5px 10px", fontSize: "0.76rem" }}
                          onClick={() => updateInput({ residencyRegion: reg.id })}
                          data-testid={`wizard-region-${reg.id}`}
                        >
                          {reg.label}
                        </button>
                      ))}
                      {input.residencyRegion === "custom" && (
                        <input
                          className="field-input mono"
                          style={{ width: 220, padding: "5px 9px", fontSize: "0.78rem" }}
                          placeholder="ap-southeast-1, ca-central-1"
                          value={input.customRegions ?? ""}
                          onChange={(e) => updateInput({ customRegions: e.target.value })}
                        />
                      )}
                    </div>
                    <span className="hard-stop-shield" style={{ alignSelf: "flex-start" }}>
                      <ShieldLockIcon size={12} />
                      <span>LOCKED HARD STOP: Out-of-region leakage violates data-sovereignty law — never waivable</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Regulated Data */}
              <div className="customize-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="field-label">Regulated Data Scope (Select all that apply)</span>
                <div className="wizard-option-grid-3">
                  {REGULATED_CARDS.map((card) => {
                    const active = input.regulatedData.includes(card.id);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className={`wizard-choice-card ${active ? "selected-hardstop" : ""}`}
                        onClick={() => toggleRegulated(card.id)}
                        data-testid={`wizard-reg-${card.id}`}
                      >
                        <strong style={{ fontSize: "0.92rem" }}>{card.label}</strong>
                        {active ? (
                          <span className="hard-stop-shield" style={{ fontSize: "0.64rem", whiteSpace: "normal", textAlign: "left" }}>
                            <ShieldLockIcon size={11} />
                            <span>{card.lockReason}</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                            Click to lock compliance Hard Stop
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Private Networking / IP Allowlisting */}
              <div className={`wizard-toggle-block ${input.privateNetworkingIpAllowlist ? "active-hardstop" : ""}`}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <div>
                    <strong style={{ fontSize: "0.96rem" }}>Private Networking / IP Allowlisting</strong>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Traffic must traverse PrivateLink, VPN, or strict CIDR IP allowlists with public access blocked.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={input.privateNetworkingIpAllowlist}
                    onChange={(e) =>
                      updateInput({ privateNetworkingIpAllowlist: e.target.checked })
                    }
                    data-testid="wizard-toggle-private-net"
                  />
                </label>
                {input.privateNetworkingIpAllowlist && (
                  <span className="hard-stop-shield" style={{ alignSelf: "flex-start", marginTop: 8 }}>
                    <ShieldLockIcon size={12} />
                    <span>LOCKED HARD STOP: Public exposure breaks network boundary — never waivable</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: How Data & Traffic Move */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                Select every way data and traffic move between your product and{" "}
                <strong>{input.companyName || "this customer"}</strong>. Each choice deterministically
                generates matching Gate 1 staging checks and Gate 2 fault-injection tests.
              </div>

              <div className="wizard-option-grid-2">
                {DATA_FLOW_CARDS.map((card) => {
                  const selected = input.dataFlows.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`wizard-choice-card ${selected ? "selected" : ""}`}
                      onClick={() => toggleDataFlow(card.id)}
                      data-testid={`wizard-flow-${card.id}`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                        <strong style={{ fontSize: "0.96rem" }}>{card.label}</strong>
                        <span className={`status-pill ${selected ? "status-nominal" : "status-pending"}`}>
                          {selected ? "SELECTED" : "ADD"}
                        </span>
                      </div>
                      <div className="mono" style={{ fontSize: "0.71rem", color: "var(--active-text)" }}>
                        {card.g1Preview}
                      </div>
                      <div className="mono" style={{ fontSize: "0.71rem", color: "var(--text-muted)" }}>
                        {card.g2Preview}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: Scale & On-Call Model */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field-group">
                <span className="field-label">Traffic &amp; Reliability Tier (Sets RPS &amp; Rollback Baselines)</span>
                <div className="wizard-option-grid-2">
                  <button
                    type="button"
                    className={`wizard-choice-card ${input.reliabilityTier === "standard" ? "selected" : ""}`}
                    onClick={() => updateInput({ reliabilityTier: "standard" })}
                    data-testid="wizard-tier-standard"
                  >
                    <strong style={{ fontSize: "1rem" }}>Standard Production</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Steady business traffic. Generates 5,000 RPS baseline and &le; 15-min rollback RTO.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`wizard-choice-card ${input.reliabilityTier === "high_volume" ? "selected" : ""}`}
                    onClick={() => updateInput({ reliabilityTier: "high_volume" })}
                    data-testid="wizard-tier-high-volume"
                  >
                    <strong style={{ fontSize: "1rem" }}>High-Volume / Mission-Critical SLA</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Burst-heavy or revenue-critical workload. Generates 50,000 RPS baseline, &le; 5-min RTO, and strict burst/timeout fault tests.
                    </span>
                  </button>
                </div>
              </div>

              <div className="field-group">
                <span className="field-label">Customer On-Call Engineering Team</span>
                <div className="wizard-option-grid-2">
                  <button
                    type="button"
                    className={`wizard-choice-card ${input.customerHasOwnOnCall ? "selected" : ""}`}
                    onClick={() => updateInput({ customerHasOwnOnCall: true })}
                    data-testid="wizard-oncall-yes"
                  >
                    <strong style={{ fontSize: "0.96rem" }}>Yes — Customer Has On-Call Engineers</strong>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Gate 3 rehearses joint Support + Customer SRE triage and shared P1 paging.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`wizard-choice-card ${!input.customerHasOwnOnCall ? "selected" : ""}`}
                    onClick={() => updateInput({ customerHasOwnOnCall: false })}
                    data-testid="wizard-oncall-no"
                  >
                    <strong style={{ fontSize: "0.96rem" }}>No — Vendor-Led P1 Escalation</strong>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Adds a dedicated Vendor-Led P1 Escalation &amp; Customer Bridge Handshake drill in Gate 3.
                    </span>
                  </button>
                </div>
              </div>

              <div className="field-group">
                <span className="field-label">Target P1 Incident Response Time</span>
                <div className="wizard-option-grid-3">
                  {([5, 15, 30] as P1ResponseTargetMinutes[]).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={`wizard-choice-card ${input.targetP1ResponseMinutes === mins ? "selected" : ""}`}
                      onClick={() => updateInput({ targetP1ResponseMinutes: mins })}
                      data-testid={`wizard-p1-${mins}`}
                    >
                      <strong className="mono" style={{ fontSize: "1.2rem" }}>
                        {mins} min
                      </strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {mins === 5
                          ? "60s drill clock · <=1.5s alert ACK"
                          : mins === 15
                            ? "90s drill clock · <=2.0s alert ACK"
                            : "120s drill clock · <=3.5s alert ACK"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Review Your Launch Blueprint */}
          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="status-pill status-nogo">
                    {activeG1HardStopCount} HARD STOPS
                  </span>
                  <span className="status-pill status-active">
                    {activeG1OpCount} G1 OPERATIONAL
                  </span>
                  <span className="status-pill status-waived">
                    {activeG2Count} G2 FAULT TESTS
                  </span>
                  <span className="status-pill status-nominal">
                    {activeG3Count} G3 DRILLS
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="help-control-wrap">
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "5px 10px", fontSize: "0.76rem" }}
                      onClick={handleUseBlankTemplate}
                      data-testid="wizard-blank-template-btn"
                    >
                      Start from Blank Template
                    </button>
                    <HelpTip copyKey="wizard.blankTemplate" />
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "5px 10px", fontSize: "0.76rem" }}
                    onClick={() => setAddingKind(addingKind === "g1" ? "none" : "g1")}
                    data-testid="wizard-add-custom-g1-toggle"
                  >
                    + Custom G1 Check
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "5px 10px", fontSize: "0.76rem" }}
                    onClick={() => setAddingKind(addingKind === "g2" ? "none" : "g2")}
                    data-testid="wizard-add-custom-g2-toggle"
                  >
                    + Custom G2 Test
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "5px 10px", fontSize: "0.76rem" }}
                    onClick={() => setAddingKind(addingKind === "g3" ? "none" : "g3")}
                    data-testid="wizard-add-custom-g3-toggle"
                  >
                    + Custom G3 Drill
                  </button>
                </div>
              </div>

              {/* Inline Custom Item Mini-Form */}
              {addingKind === "g1" && (
                <div className="customize-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span className="eyebrow">ADD CUSTOM GATE 1 SETUP CHECK</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8 }}>
                    <input
                      className="field-input"
                      placeholder="Check name (e.g. Custom KMS Key Rotation)"
                      value={newG1Label}
                      onChange={(e) => setNewG1Label(e.target.value)}
                      data-testid="wizard-custom-g1-label"
                    />
                    <input
                      className="field-input"
                      placeholder="What must staging prove?"
                      value={newG1Promise}
                      onChange={(e) => setNewG1Promise(e.target.value)}
                      data-testid="wizard-custom-g1-promise"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={newG1HardStop}
                        onChange={(e) => setNewG1HardStop(e.target.checked)}
                      />
                      <span>Lock as Non-Waivable Hard Stop</span>
                    </label>
                    <button type="button" className="btn btn-primary" onClick={handleAddCustomG1} data-testid="wizard-custom-g1-save">
                      Add Check
                    </button>
                  </div>
                </div>
              )}

              {addingKind === "g2" && (
                <div className="customize-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span className="eyebrow">ADD CUSTOM GATE 2 FAULT-INJECTION TEST</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8 }}>
                    <input
                      className="field-input"
                      placeholder="Fault test name (e.g. Malformed Currency Code)"
                      value={newG2Label}
                      onChange={(e) => setNewG2Label(e.target.value)}
                      data-testid="wizard-custom-g2-label"
                    />
                    <input
                      className="field-input"
                      placeholder="Expected resilient behavior (zero corruption)"
                      value={newG2Desc}
                      onChange={(e) => setNewG2Desc(e.target.value)}
                      data-testid="wizard-custom-g2-desc"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-primary" onClick={handleAddCustomG2} data-testid="wizard-custom-g2-save">
                      Add Fault Test
                    </button>
                  </div>
                </div>
              )}

              {addingKind === "g3" && (
                <div className="customize-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span className="eyebrow">ADD CUSTOM GATE 3 LIVE INCIDENT DRILL</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 8 }}>
                    <input
                      className="field-input"
                      placeholder="Incident drill title (e.g. Webhook DLQ Backlog Spike)"
                      value={newG3Title}
                      onChange={(e) => setNewG3Title(e.target.value)}
                      data-testid="wizard-custom-g3-title"
                    />
                    <input
                      className="field-input"
                      placeholder="Monitored metric (e.g. Queue Depth)"
                      value={newG3Metric}
                      onChange={(e) => setNewG3Metric(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-primary" onClick={handleAddCustomG3} data-testid="wizard-custom-g3-save">
                      Add Incident Drill
                    </button>
                  </div>
                </div>
              )}

              {/* Section 1: Gate 1 Hard Stops */}
              <div className="customize-section">
                <div className="eyebrow" style={{ color: "var(--nogo-text)", marginBottom: 8 }}>
                  GATE 1 · NON-WAIVABLE HARD STOPS ({activeG1HardStopCount} ACTIVE)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g1HardStops.map((item) => (
                    <div key={item.id} className="blueprint-item-row">
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleG1Enabled(item.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "0.9rem" }}>{item.label}</strong>
                            <span className="hard-stop-shield" style={{ fontSize: "0.62rem", padding: "2px 6px" }}>
                              <ShieldLockIcon size={10} />
                              <span>HARD STOP</span>
                            </span>
                          </div>
                          <div className="blueprint-why-line">
                            <strong>Why we added this:</strong> {item.whyAdded}
                          </div>
                        </div>
                      </label>
                      {!item.hardStopLockedByPolicy && (
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "4px 8px", fontSize: "0.7rem" }}
                          onClick={() => handleToggleG1HardStop(item.id)}
                        >
                          Unlock to Operational
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Gate 1 Operational Checks */}
              <div className="customize-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span className="eyebrow" style={{ color: "var(--active-text)" }}>
                    GATE 1 · OPERATIONAL SETUP CHECKS ({activeG1OpCount} ACTIVE)
                  </span>
                  <span className="help-inline">
                    <span className="mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      LOCK ANY CHECK AS HARD STOP
                    </span>
                    <HelpTip copyKey="wizard.hardStopToggle" />
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g1Operational.map((item) => (
                    <div key={item.id} className="blueprint-item-row">
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleG1Enabled(item.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <strong style={{ fontSize: "0.9rem" }}>{item.label}</strong>
                          <div className="blueprint-why-line">
                            <strong>Why we added this:</strong> {item.whyAdded}
                          </div>
                        </div>
                      </label>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "4px 9px", fontSize: "0.7rem" }}
                        onClick={() => handleToggleG1HardStop(item.id)}
                        data-testid={`wizard-lock-hardstop-${item.id}`}
                      >
                        Lock as Hard Stop
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Gate 2 Fault Tests */}
              <div className="customize-section">
                <div className="eyebrow" style={{ color: "var(--waived-text)", marginBottom: 8 }}>
                  GATE 2 · FAULT-INJECTION TESTS ({activeG2Count} ACTIVE)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {blueprint.gate2Items.map((item) => (
                    <label key={item.id} className="blueprint-item-row" style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleG2Enabled(item.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <strong style={{ fontSize: "0.9rem" }}>{item.label}</strong>
                          <div className="blueprint-why-line">
                            <strong>Why we added this:</strong> {item.whyAdded}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Section 4: Gate 3 Live Incident Drills */}
              <div className="customize-section">
                <div className="eyebrow" style={{ color: "var(--nominal-text)", marginBottom: 8 }}>
                  GATE 3 · LIVE INCIDENT DRILLS ({activeG3Count} ACTIVE)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {blueprint.gate3Items.map((item) => (
                    <label key={item.id} className="blueprint-item-row" style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleG3Enabled(item.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "0.9rem" }}>{item.title}</strong>
                            <span className="stack-chip">{item.timerSeconds}s SLA</span>
                          </div>
                          <div className="blueprint-why-line">
                            <strong>Why we added this:</strong> {item.whyAdded}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div>
            {step > 1 ? (
              <button type="button" className="btn" onClick={goBack} data-testid="wizard-back-btn">
                ← Back
              </button>
            ) : (
              <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                SAVES IN BROWSER LOCALSTORAGE
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {step < 5 ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={goNext}
                data-testid="wizard-next-btn"
              >
                Next: {STEP_META[step]!.title} →
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-nominal btn-lg"
                onClick={handleSubmit}
                data-testid="wizard-submit-btn"
              >
                {editingCustomerId
                  ? "Save Blueprint Changes ✓"
                  : "Create Customer & Open Cockpit →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
