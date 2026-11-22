import { useEffect, useState } from "react";
import {
  CUSTOM_ALARM_TEMPLATES,
  CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
  CUSTOM_STATION_TEMPLATES,
  CUSTOM_VECTOR_TEMPLATES,
  GATE1_SUB_STAGES,
  GATE2_SUB_STAGES,
  GATE3_SUB_STAGES,
  serializeNominalXConfigYaml,
  type AccountPreset,
  type ConfigValidationError,
  type CustomAlarmConfig,
  type CustomChaosVectorConfig,
  type CustomStationConfig,
} from "@nominalx/core";
import {
  countActiveCustomizations,
  downloadTextFile,
  serializeMissionToYaml,
  type AccountCustomizations,
  type AccountMissionState,
} from "../state/missionState";
import { HelpTip } from "./HelpTip";
import { ShieldLockIcon } from "./Icons";

type CustomizeTab = "gate1" | "gate2" | "gate3" | "yaml";

interface CustomizeDrawerProps {
  open: boolean;
  preset: AccountPreset;
  mission: AccountMissionState;
  onClose: () => void;
  onUpdateCustomizations: (next: AccountCustomizations) => void;
  onApplyYaml: (yamlText: string) => {
    ok: boolean;
    errors?: ConfigValidationError[];
  };
  onResetCustomizations: () => void;
}

export function CustomizeDrawer({
  open,
  preset,
  mission,
  onClose,
  onUpdateCustomizations,
  onApplyYaml,
  onResetCustomizations,
}: CustomizeDrawerProps) {
  const [activeTab, setActiveTab] = useState<CustomizeTab>("gate1");
  const [formError, setFormError] = useState<string | null>(null);
  const [yamlText, setYamlText] = useState<string>("");
  const [yamlErrors, setYamlErrors] = useState<ConfigValidationError[]>([]);
  const [yamlNotice, setYamlNotice] = useState<string | null>(null);

  // Gate 1 custom station form
  const [stCode, setStCode] = useState("");
  const [stLabel, setStLabel] = useState("");
  const [stOwner, setStOwner] = useState(preset.config.account.fde_owner);
  const [stEndpoint, setStEndpoint] = useState("/health/custom-check");
  const [stMethod, setStMethod] = useState<"GET" | "POST">("GET");
  const [stExpectedStatus, setStExpectedStatus] = useState(200);
  const [stHardStop, setStHardStop] = useState(false);
  const [stHeaderName, setStHeaderName] = useState("");
  const [stHeaderContains, setStHeaderContains] = useState("");
  const [stJsonPath, setStJsonPath] = useState("");
  const [stJsonEquals, setStJsonEquals] = useState("");
  const [stSoldPromise, setStSoldPromise] = useState("");

  // Gate 2 custom vector form
  const [vecId, setVecId] = useState("");
  const [vecLabel, setVecLabel] = useState("");
  const [vecDescription, setVecDescription] = useState("");
  const [vecOwner, setVecOwner] = useState(preset.config.account.fde_owner);
  const [vecMethod, setVecMethod] = useState<"GET" | "POST" | "PUT" | "PATCH">("POST");
  const [vecEndpoint, setVecEndpoint] = useState("/webhooks/events");
  const [vecExpectedStatus, setVecExpectedStatus] = useState(400);
  const [vecPatchLabel, setVecPatchLabel] = useState("");
  const [vecPatchDiff, setVecPatchDiff] = useState(
    "- allowUnvalidatedPayload(req)\n+ rejectInvalidPayloadWith400(req)",
  );

  // Gate 3 custom alarm form
  const [alId, setAlId] = useState("");
  const [alTitle, setAlTitle] = useState("");
  const [alOwner, setAlOwner] = useState(preset.config.account.cse_owner);
  const [alTimer, setAlTimer] = useState(90);
  const [alMetric, setAlMetric] = useState("Queue Backlog Depth");
  const [alSymptom, setAlSymptom] = useState("");
  const [alLogLine, setAlLogLine] = useState("");
  const [alRemLabel, setAlRemLabel] = useState("");
  const [alRemDetail, setAlRemDetail] = useState("");
  const [alProof, setAlProof] = useState("");

  const { customizations } = mission;
  const activeCount = countActiveCustomizations(customizations);

  // Keep YAML editor 2-way synced whenever the drawer opens or form tabs mutate mission state
  useEffect(() => {
    if (open) {
      setYamlText(serializeMissionToYaml(preset, mission));
      setYamlErrors([]);
    }
  }, [open, preset, mission]);

  useEffect(() => {
    setStOwner(preset.config.account.fde_owner);
    setVecOwner(preset.config.account.fde_owner);
    setAlOwner(preset.config.account.cse_owner);
  }, [preset.id, preset.config.account.fde_owner, preset.config.account.cse_owner]);

  if (!open) return null;

  const builtInStationCodes = new Set(GATE1_SUB_STAGES.map((s) => s.stationCode));

  // Gate 1 actions
  const handleAddStationTemplate = (template: CustomStationConfig) => {
    setFormError(null);
    if (
      customizations.customStations.some(
        (s) => s.code.toUpperCase() === template.code.toUpperCase(),
      )
    ) {
      setFormError(`Station ${template.code} is already added.`);
      return;
    }
    onUpdateCustomizations({
      ...customizations,
      customStations: [...customizations.customStations, template],
    });
  };

  const handleAddCustomStation = () => {
    setFormError(null);
    const code = stCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_");
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) {
      setFormError(
        "Station code must be an uppercase slug starting with a letter (e.g., PCI_VAULT).",
      );
      return;
    }
    if (
      builtInStationCodes.has(code) ||
      customizations.customStations.some((s) => s.code === code)
    ) {
      setFormError(`Station code "${code}" already exists.`);
      return;
    }
    if (!stLabel.trim() || !stSoldPromise.trim() || !stEndpoint.startsWith("/")) {
      setFormError(
        "Label, endpoint (starting with /), and sold contract promise are required.",
      );
      return;
    }

    let parsedJsonEquals: string | number | boolean = stJsonEquals.trim();
    if (parsedJsonEquals === "true") parsedJsonEquals = true;
    else if (parsedJsonEquals === "false") parsedJsonEquals = false;
    else if (
      parsedJsonEquals !== "" &&
      !Number.isNaN(Number(parsedJsonEquals))
    ) {
      parsedJsonEquals = Number(parsedJsonEquals);
    }

    const nextStation: CustomStationConfig = {
      code,
      label: stLabel.trim(),
      owner: stOwner.trim() || preset.config.account.fde_owner,
      hard_stop: stHardStop,
      endpoint: stEndpoint.trim(),
      method: stMethod,
      expected_status: Number(stExpectedStatus) || 200,
      required_header:
        stHeaderName.trim() && stHeaderContains.trim()
          ? { name: stHeaderName.trim(), contains: stHeaderContains.trim() }
          : undefined,
      required_json_field:
        stJsonPath.trim() && stJsonEquals.trim() !== ""
          ? { path: stJsonPath.trim(), equals: parsedJsonEquals }
          : undefined,
      sold_promise: stSoldPromise.trim(),
      initial_status: "NO_GO",
      failure_evidence: `${stMethod} ${stEndpoint.trim()} failed live staging assertion`,
      fix_summary: `Remediate ${stLabel.trim()} on ${stEndpoint.trim()} to satisfy "${stSoldPromise.trim()}"`,
    };

    onUpdateCustomizations({
      ...customizations,
      customStations: [...customizations.customStations, nextStation],
    });
    setStCode("");
    setStLabel("");
    setStSoldPromise("");
    setStHeaderName("");
    setStHeaderContains("");
    setStJsonPath("");
    setStJsonEquals("");
    setStHardStop(false);
  };

  const handleRemoveCustomStation = (code: string) => {
    setFormError(null);
    onUpdateCustomizations({
      ...customizations,
      customStations: customizations.customStations.filter(
        (s) => s.code !== code,
      ),
    });
  };

  // Gate 2 actions
  const handleToggleBuiltInVector = (vectorId: string) => {
    setFormError(null);
    const isDisabled = customizations.disabledVectors.includes(vectorId);
    const nextDisabled = isDisabled
      ? customizations.disabledVectors.filter((id) => id !== vectorId)
      : [...customizations.disabledVectors, vectorId];

    const remaining =
      GATE2_SUB_STAGES.length -
      nextDisabled.length +
      customizations.customVectors.length;
    if (remaining <= 0) {
      setFormError("At least 1 Gate 2 chaos vector must remain active.");
      return;
    }

    onUpdateCustomizations({
      ...customizations,
      disabledVectors: nextDisabled,
    });
  };

  const handleAddVectorTemplate = (template: CustomChaosVectorConfig) => {
    setFormError(null);
    if (customizations.customVectors.some((v) => v.id === template.id)) {
      setFormError(`Custom vector "${template.id}" is already added.`);
      return;
    }
    onUpdateCustomizations({
      ...customizations,
      customVectors: [...customizations.customVectors, template],
    });
  };

  const handleAddCustomVector = () => {
    setFormError(null);
    const id = vecId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_");
    if (!/^[a-z][a-z0-9_-]{1,47}$/.test(id)) {
      setFormError(
        "Vector id must use lowercase snake_case or kebab-case (e.g., invalid_currency_code).",
      );
      return;
    }
    if (
      GATE2_SUB_STAGES.some((v) => v.vectorId === id) ||
      customizations.customVectors.some((v) => v.id === id)
    ) {
      setFormError(`Vector id "${id}" already exists.`);
      return;
    }
    if (!vecLabel.trim() || !vecDescription.trim()) {
      setFormError("Vector label and description are required.");
      return;
    }

    const diffLines = vecPatchDiff
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(Boolean);

    const nextVector: CustomChaosVectorConfig = {
      id,
      label: vecLabel.trim(),
      description: vecDescription.trim(),
      owner: vecOwner.trim() || preset.config.account.fde_owner,
      endpoint_override: vecEndpoint.trim().startsWith("/")
        ? vecEndpoint.trim()
        : undefined,
      method: vecMethod,
      payload: { event_id: `evt_${id}_probe`, vector: id },
      expected_status: Number(vecExpectedStatus) || 400,
      weight: 80,
      patch_id: `fix_${id}`,
      patch_label:
        vecPatchLabel.trim() || `Harden handler for ${vecLabel.trim()}`,
      patch_summary: `Enforce HTTP ${Number(vecExpectedStatus) || 400} handling for ${vecLabel.trim()}.`,
      patch_diff:
        diffLines.length > 0
          ? diffLines
          : [`+ enforceGuard("${id}", { status: ${Number(vecExpectedStatus) || 400} })`],
    };

    onUpdateCustomizations({
      ...customizations,
      customVectors: [...customizations.customVectors, nextVector],
    });
    setVecId("");
    setVecLabel("");
    setVecDescription("");
    setVecPatchLabel("");
  };

  const handleRemoveCustomVector = (id: string) => {
    setFormError(null);
    const nextCustom = customizations.customVectors.filter((v) => v.id !== id);
    const remaining =
      GATE2_SUB_STAGES.length -
      customizations.disabledVectors.length +
      nextCustom.length;
    if (remaining <= 0) {
      setFormError("At least 1 Gate 2 chaos vector must remain active.");
      return;
    }
    onUpdateCustomizations({
      ...customizations,
      customVectors: nextCustom,
    });
  };

  // Gate 3 actions
  const handleToggleBuiltInAlarm = (alarmId: string) => {
    setFormError(null);
    const isDisabled = customizations.disabledAlarms.includes(alarmId);
    const nextDisabled = isDisabled
      ? customizations.disabledAlarms.filter((id) => id !== alarmId)
      : [...customizations.disabledAlarms, alarmId];

    const remaining =
      GATE3_SUB_STAGES.length -
      nextDisabled.length +
      customizations.customAlarms.length;
    if (remaining <= 0) {
      setFormError("At least 1 Gate 3 Crew Drill alarm must remain active.");
      return;
    }

    onUpdateCustomizations({
      ...customizations,
      disabledAlarms: nextDisabled,
    });
  };

  const handleAddAlarmTemplate = (template: CustomAlarmConfig) => {
    setFormError(null);
    if (customizations.customAlarms.some((a) => a.id === template.id)) {
      setFormError(`Custom alarm "${template.id}" is already added.`);
      return;
    }
    onUpdateCustomizations({
      ...customizations,
      customAlarms: [...customizations.customAlarms, template],
    });
  };

  const handleAddCustomAlarm = () => {
    setFormError(null);
    const id = alId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_");
    if (!/^[a-z][a-z0-9_-]{1,47}$/.test(id)) {
      setFormError(
        "Alarm id must use lowercase snake_case or kebab-case (e.g., dlq_backlog_spike).",
      );
      return;
    }
    if (
      GATE3_SUB_STAGES.some((a) => a.alarmId === id) ||
      customizations.customAlarms.some((a) => a.id === id)
    ) {
      setFormError(`Alarm id "${id}" already exists.`);
      return;
    }
    if (!alTitle.trim() || !alSymptom.trim() || !alRemLabel.trim()) {
      setFormError("Alarm title, trigger symptom, and remediation label are required.");
      return;
    }

    const nextAlarm: CustomAlarmConfig = {
      id,
      title: alTitle.trim(),
      owner: alOwner.trim() || preset.config.account.cse_owner,
      timer_seconds: Math.max(15, Math.min(600, Number(alTimer) || 90)),
      metric_label: alMetric.trim() || "Incident Metric",
      trigger_symptom: alSymptom.trim(),
      log_lines: alLogLine.trim()
        ? alLogLine
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
        : [`P1 ALERT triggered on ${alTitle.trim()}`],
      remediation_label: alRemLabel.trim(),
      remediation_detail:
        alRemDetail.trim() || `Execute ${alRemLabel.trim()} and verify live telemetry recovery.`,
      verification_proof:
        alProof.trim() ||
        `200 OK · ${alRemLabel.trim()} confirmed · 3/3 SLA ticks green`,
    };

    onUpdateCustomizations({
      ...customizations,
      customAlarms: [...customizations.customAlarms, nextAlarm],
    });
    setAlId("");
    setAlTitle("");
    setAlSymptom("");
    setAlLogLine("");
    setAlRemLabel("");
    setAlRemDetail("");
    setAlProof("");
  };

  const handleRemoveCustomAlarm = (id: string) => {
    setFormError(null);
    const nextCustom = customizations.customAlarms.filter((a) => a.id !== id);
    const remaining =
      GATE3_SUB_STAGES.length -
      customizations.disabledAlarms.length +
      nextCustom.length;
    if (remaining <= 0) {
      setFormError("At least 1 Gate 3 Crew Drill alarm must remain active.");
      return;
    }
    onUpdateCustomizations({
      ...customizations,
      customAlarms: nextCustom,
    });
  };

  // YAML tab actions
  const handleApplyYamlClick = () => {
    setYamlNotice(null);
    const res = onApplyYaml(yamlText);
    if (!res.ok) {
      setYamlErrors(res.errors ?? []);
    } else {
      setYamlErrors([]);
      setYamlNotice("Applied nominalx.yaml live across Gate 1, Gate 2, Gate 3 & Reports.");
    }
  };

  const handleLoadPaymentsExample = () => {
    const exampleYaml = serializeNominalXConfigYaml(
      CUSTOM_PAYMENTS_EXAMPLE_CONFIG,
    );
    setYamlText(exampleYaml);
    setYamlErrors([]);
    const res = onApplyYaml(exampleYaml);
    if (res.ok) {
      setYamlNotice(
        "Loaded Custom Payments API example (PCI_TOKEN_VAULT Hard Stop + Malformed Idempotency Key + Webhook DLQ Backlog Spike).",
      );
    } else {
      setYamlErrors(res.errors ?? []);
    }
  };

  const handleDownloadYaml = () => {
    downloadTextFile(
      `nominalx-${mission.flightCheck.accountId}.yaml`,
      yamlText,
      "text/yaml",
    );
    setYamlNotice(`Downloaded nominalx-${mission.flightCheck.accountId}.yaml`);
  };

  const handleResetAll = () => {
    onResetCustomizations();
    setFormError(null);
    setYamlErrors([]);
    setYamlNotice("Reset all customizations back to clean preset defaults.");
  };

  return (
    <div
      className="overlay-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customize NominalX Gates and YAML"
      data-testid="customize-drawer"
    >
      <div
        className="drawer-sheet drawer-sheet-wide"
        onClick={(e) => e.stopPropagation()}
        data-tour="customize-drawer-sheet"
      >
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div className="help-inline">
              <div className="eyebrow">
                LIVE GATE CUSTOMIZER · NOMINALX.YAML · {mission.flightCheck.accountName.toUpperCase()}
              </div>
              <HelpTip copyKey="customize.header" />
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: "1.35rem", fontWeight: 800 }}>
              Tailor Stations, Chaos Vectors &amp; Alarms
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {activeCount > 0 && (
              <span className="status-pill status-active">
                {activeCount} ACTIVE CUSTOM
              </span>
            )}
            <button
              type="button"
              className="btn"
              onClick={onClose}
              data-testid="close-customize-drawer-btn"
            >
              Close
            </button>
          </div>
        </div>

        {/* 4 Focused Tabs */}
        <div className="customize-tabs">
          <button
            type="button"
            className={`customize-tab ${activeTab === "gate1" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("gate1");
              setFormError(null);
            }}
            data-testid="customize-tab-gate1"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span className="eyebrow">GATE 1</span>
              <HelpTip asSpan copyKey="customize.tab.gate1" />
            </div>
            <strong>Stations ({mission.flightCheck.counts.total})</strong>
          </button>

          <button
            type="button"
            className={`customize-tab ${activeTab === "gate2" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("gate2");
              setFormError(null);
            }}
            data-testid="customize-tab-gate2"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span className="eyebrow">GATE 2</span>
              <HelpTip asSpan copyKey="customize.tab.gate2" />
            </div>
            <strong>Vectors ({mission.staticFire.totals.totalVectors})</strong>
          </button>

          <button
            type="button"
            className={`customize-tab ${activeTab === "gate3" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("gate3");
              setFormError(null);
            }}
            data-testid="customize-tab-gate3"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span className="eyebrow">GATE 3</span>
              <HelpTip asSpan copyKey="customize.tab.gate3" />
            </div>
            <strong>Alarms ({mission.crewSummary.totalAlarms})</strong>
          </button>

          <button
            type="button"
            className={`customize-tab ${activeTab === "yaml" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("yaml");
              setFormError(null);
              setYamlText(serializeMissionToYaml(preset, mission));
            }}
            data-testid="customize-tab-yaml"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span className="eyebrow">LIVE SYNC</span>
              <HelpTip asSpan copyKey="customize.tab.yaml" />
            </div>
            <strong>YAML (nominalx.yaml)</strong>
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {formError && activeTab !== "yaml" && (
            <div className="validation-alert" role="alert">
              {formError}
            </div>
          )}

          {/* TAB 1: GATE 1 STATIONS */}
          {activeTab === "gate1" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 1-Click Template Presets */}
              <div className="customize-section">
                <div className="help-inline">
                  <div className="eyebrow">1-CLICK STATION TEMPLATES</div>
                  <HelpTip copyKey="customize.g1.templates" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-nogo"
                    onClick={() => handleAddStationTemplate(CUSTOM_STATION_TEMPLATES[0]!)}
                    data-testid="preset-add-pci-vault"
                  >
                    <ShieldLockIcon size={14} />
                    <span>+ PCI / Secret Vault (Hard Stop)</span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleAddStationTemplate(CUSTOM_STATION_TEMPLATES[1]!)}
                    data-testid="preset-add-sla-endpoint"
                  >
                    + Custom SLA Endpoint
                  </button>
                </div>
              </div>

              {/* Active Stations Roster */}
              <div className="customize-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="help-inline">
                    <span className="eyebrow">
                      ACTIVE FLIGHT CHECK STATIONS ({mission.flightCheck.counts.total})
                    </span>
                    <HelpTip copyKey="customize.g1.roster" />
                  </span>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    HARD STOPS ARE NON-WAIVABLE
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {mission.flightCheck.stations.map((st) => (
                    <div key={st.stationCode} className="customize-item-row">
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--active-text)", fontWeight: 800 }}>
                            {st.subStage}
                          </span>
                          <strong style={{ fontSize: "0.9rem" }}>{st.stationLabel}</strong>
                          <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            ({st.stationCode})
                          </span>
                          {st.isCustom && (
                            <span className="status-pill status-active" style={{ padding: "2px 7px", fontSize: "0.64rem" }}>
                              CUSTOM
                            </span>
                          )}
                          {st.isHardStop && (
                            <span className="hard-stop-shield" style={{ padding: "2px 7px", fontSize: "0.64rem" }}>
                              <ShieldLockIcon size={11} />
                              <span>HARD STOP</span>
                            </span>
                          )}
                        </div>
                        <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          {st.evidence.method} {st.evidence.endpoint} · Owner: {st.accountableOwner}
                        </div>
                      </div>

                      {st.isCustom ? (
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "5px 10px", fontSize: "0.74rem" }}
                          onClick={() => handleRemoveCustomStation(st.stationCode)}
                          data-testid={`remove-custom-station-${st.stationCode}`}
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="mono" style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>
                          BUILT-IN
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Custom Station Form */}
              <div className="customize-section">
                <div className="eyebrow">ADD CUSTOM GATE 1 STATION</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-code">Station Code (UPPER_SLUG)</label>
                      <HelpTip copyKey="customize.g1.code" />
                    </div>
                    <input
                      id="cs-code"
                      className="field-input mono"
                      placeholder="e.g. PCI_VAULT"
                      value={stCode}
                      onChange={(e) => setStCode(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-label">Display Label</label>
                      <HelpTip copyKey="customize.g1.label" />
                    </div>
                    <input
                      id="cs-label"
                      className="field-input"
                      placeholder="e.g. PCI Token Vault"
                      value={stLabel}
                      onChange={(e) => setStLabel(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-endpoint">Probe Endpoint Path</label>
                      <HelpTip copyKey="customize.g1.endpoint" />
                    </div>
                    <input
                      id="cs-endpoint"
                      className="field-input mono"
                      value={stEndpoint}
                      onChange={(e) => setStEndpoint(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="field-group">
                      <div className="help-label-row">
                        <label className="field-label" htmlFor="cs-method">Method</label>
                        <HelpTip copyKey="customize.g1.method" />
                      </div>
                      <select
                        id="cs-method"
                        className="field-input mono"
                        value={stMethod}
                        onChange={(e) => setStMethod(e.target.value as "GET" | "POST")}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <div className="help-label-row">
                        <label className="field-label" htmlFor="cs-status">Expected HTTP</label>
                        <HelpTip copyKey="customize.g1.expectedStatus" />
                      </div>
                      <input
                        id="cs-status"
                        type="number"
                        className="field-input mono"
                        value={stExpectedStatus}
                        onChange={(e) => setStExpectedStatus(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-hdr-name">Required Header (Optional)</label>
                      <HelpTip copyKey="customize.g1.requiredHeader" />
                    </div>
                    <input
                      id="cs-hdr-name"
                      className="field-input mono"
                      placeholder="x-pci-vault-mode"
                      value={stHeaderName}
                      onChange={(e) => setStHeaderName(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-hdr-contains">Header Contains</label>
                      <HelpTip copyKey="customize.g1.headerContains" />
                    </div>
                    <input
                      id="cs-hdr-contains"
                      className="field-input mono"
                      placeholder="HSM-FIPS-140-3"
                      value={stHeaderContains}
                      onChange={(e) => setStHeaderContains(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-json-path">Required JSON Field (Optional)</label>
                      <HelpTip copyKey="customize.g1.jsonPath" />
                    </div>
                    <input
                      id="cs-json-path"
                      className="field-input mono"
                      placeholder="tokenization.pan_isolation"
                      value={stJsonPath}
                      onChange={(e) => setStJsonPath(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-json-eq">Equals Value</label>
                      <HelpTip copyKey="customize.g1.jsonEquals" />
                    </div>
                    <input
                      id="cs-json-eq"
                      className="field-input mono"
                      placeholder="true"
                      value={stJsonEquals}
                      onChange={(e) => setStJsonEquals(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-owner">Accountable Engineer</label>
                      <HelpTip copyKey="customize.g1.owner" />
                    </div>
                    <input
                      id="cs-owner"
                      className="field-input mono"
                      value={stOwner}
                      onChange={(e) => setStOwner(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cs-promise">Sold Contract Promise</label>
                      <HelpTip copyKey="customize.g1.soldPromise" />
                    </div>
                    <input
                      id="cs-promise"
                      className="field-input"
                      placeholder="What must live staging prove?"
                      value={stSoldPromise}
                      onChange={(e) => setStSoldPromise(e.target.value)}
                    />
                  </div>
                </div>

                <label
                  className={`switch-row ${stHardStop ? "checked" : ""}`}
                  style={{
                    marginTop: 10,
                    borderColor: stHardStop ? "var(--nogo-border)" : undefined,
                    background: stHardStop ? "var(--nogo-bg)" : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.86rem", display: "flex", alignItems: "center", gap: 6 }}>
                      <ShieldLockIcon size={15} />
                      <span>Enforce as Non-Waivable Hard Stop</span>
                      <HelpTip asSpan copyKey="customize.g1.hardStop" />
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Blocks Risk Waivers identically to AUTH / SSO and RESIDENCY
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={stHardStop}
                    onChange={(e) => setStHardStop(e.target.checked)}
                    data-testid="cs-hard-stop-checkbox"
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddCustomStation}
                    data-testid="add-custom-station-btn"
                  >
                    Add Custom Station
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GATE 2 VECTORS */}
          {activeTab === "gate2" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="customize-section">
                <div className="help-inline">
                  <div className="eyebrow">1-CLICK CHAOS VECTOR TEMPLATE</div>
                  <HelpTip copyKey="customize.g2.templates" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleAddVectorTemplate(CUSTOM_VECTOR_TEMPLATES[0]!)}
                    data-testid="preset-add-idempotency-vector"
                  >
                    + Malformed Idempotency Key (HTTP 400)
                  </button>
                </div>
              </div>

              <div className="customize-section">
                <div className="help-inline">
                  <div className="eyebrow">BUILT-IN ADVERSARIAL VECTORS (ENABLE / DISABLE)</div>
                  <HelpTip copyKey="customize.g2.builtinToggle" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {GATE2_SUB_STAGES.map((v) => {
                    const enabled = !customizations.disabledVectors.includes(v.vectorId);
                    return (
                      <label
                        key={v.vectorId}
                        className={`switch-row ${enabled ? "checked" : ""}`}
                        style={{ padding: "10px 12px" }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.86rem" }}>{v.vectorName}</div>
                          <div className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {v.vectorId}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => handleToggleBuiltInVector(v.vectorId)}
                          data-testid={`toggle-vector-${v.vectorId}`}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              {customizations.customVectors.length > 0 && (
                <div className="customize-section">
                  <div className="eyebrow">
                    CUSTOM CHAOS VECTORS ({customizations.customVectors.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {customizations.customVectors.map((cv) => (
                      <div key={cv.id} className="customize-item-row">
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <strong style={{ fontSize: "0.88rem" }}>{cv.label}</strong>
                            <span className="status-pill status-active" style={{ padding: "2px 7px", fontSize: "0.64rem" }}>
                              CUSTOM
                            </span>
                          </div>
                          <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                            {cv.method} {cv.endpoint_override ?? preset.config.environment.endpoints.webhook_ingress} → expect HTTP {cv.expected_status} · Patch: {cv.patch_label}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "5px 10px", fontSize: "0.74rem" }}
                          onClick={() => handleRemoveCustomVector(cv.id)}
                          data-testid={`remove-custom-vector-${cv.id}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="customize-section">
                <div className="eyebrow">ADD CUSTOM GATE 2 CHAOS VECTOR</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cv-id">Vector ID (snake_case)</label>
                      <HelpTip copyKey="customize.g2.id" />
                    </div>
                    <input
                      id="cv-id"
                      className="field-input mono"
                      placeholder="invalid_currency_code"
                      value={vecId}
                      onChange={(e) => setVecId(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cv-label">Vector Label</label>
                      <HelpTip copyKey="customize.g2.label" />
                    </div>
                    <input
                      id="cv-label"
                      className="field-input"
                      placeholder="Invalid ISO Currency Code"
                      value={vecLabel}
                      onChange={(e) => setVecLabel(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cv-endpoint">Endpoint Override</label>
                      <HelpTip copyKey="customize.g2.endpoint" />
                    </div>
                    <input
                      id="cv-endpoint"
                      className="field-input mono"
                      value={vecEndpoint}
                      onChange={(e) => setVecEndpoint(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="field-group">
                      <div className="help-label-row">
                        <label className="field-label" htmlFor="cv-method">Method</label>
                        <HelpTip copyKey="customize.g2.method" />
                      </div>
                      <select
                        id="cv-method"
                        className="field-input mono"
                        value={vecMethod}
                        onChange={(e) =>
                          setVecMethod(e.target.value as "GET" | "POST" | "PUT" | "PATCH")
                        }
                      >
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="GET">GET</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <div className="help-label-row">
                        <label className="field-label" htmlFor="cv-status">Expected HTTP</label>
                        <HelpTip copyKey="customize.g2.expectedStatus" />
                      </div>
                      <input
                        id="cv-status"
                        type="number"
                        className="field-input mono"
                        value={vecExpectedStatus}
                        onChange={(e) => setVecExpectedStatus(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <div className="help-label-row">
                    <label className="field-label" htmlFor="cv-desc">Failure Assertion Description</label>
                    <HelpTip copyKey="customize.g2.description" />
                  </div>
                  <input
                    id="cv-desc"
                    className="field-input"
                    placeholder="Reject unsupported currency codes with deterministic 400"
                    value={vecDescription}
                    onChange={(e) => setVecDescription(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cv-patch-label">Switchboard Patch Label</label>
                      <HelpTip copyKey="customize.g2.patchLabel" />
                    </div>
                    <input
                      id="cv-patch-label"
                      className="field-input"
                      placeholder="Add ISO-4217 validator"
                      value={vecPatchLabel}
                      onChange={(e) => setVecPatchLabel(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="cv-owner">Accountable Engineer</label>
                      <HelpTip copyKey="customize.g2.owner" />
                    </div>
                    <input
                      id="cv-owner"
                      className="field-input mono"
                      value={vecOwner}
                      onChange={(e) => setVecOwner(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <div className="help-label-row">
                    <label className="field-label" htmlFor="cv-diff">Handler Patch Diff Lines</label>
                    <HelpTip copyKey="customize.g2.patchDiff" />
                  </div>
                  <textarea
                    id="cv-diff"
                    className="field-input mono"
                    rows={2}
                    value={vecPatchDiff}
                    onChange={(e) => setVecPatchDiff(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddCustomVector}
                    data-testid="add-custom-vector-btn"
                  >
                    Add Custom Chaos Vector
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GATE 3 ALARMS */}
          {activeTab === "gate3" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="customize-section">
                <div className="help-inline">
                  <div className="eyebrow">1-CLICK DAY-30 ALARM TEMPLATE</div>
                  <HelpTip copyKey="customize.g3.templates" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleAddAlarmTemplate(CUSTOM_ALARM_TEMPLATES[0]!)}
                    data-testid="preset-add-dlq-alarm"
                  >
                    + Webhook DLQ Backlog Spike (90s P1)
                  </button>
                </div>
              </div>

              <div className="customize-section">
                <div className="help-inline">
                  <div className="eyebrow">BUILT-IN DAY-30 ALARMS (ENABLE / DISABLE)</div>
                  <HelpTip copyKey="customize.g3.builtinToggle" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {GATE3_SUB_STAGES.map((a) => {
                    const enabled = !customizations.disabledAlarms.includes(a.alarmId);
                    return (
                      <label
                        key={a.alarmId}
                        className={`switch-row ${enabled ? "checked" : ""}`}
                        style={{ padding: "10px 12px" }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "0.86rem" }}>{a.alarmName}</div>
                          <div className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {a.alarmId} · 90s SLA
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => handleToggleBuiltInAlarm(a.alarmId)}
                          data-testid={`toggle-alarm-${a.alarmId}`}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              {customizations.customAlarms.length > 0 && (
                <div className="customize-section">
                  <div className="eyebrow">
                    CUSTOM DAY-30 ALARMS ({customizations.customAlarms.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {customizations.customAlarms.map((ca) => (
                      <div key={ca.id} className="customize-item-row">
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <strong style={{ fontSize: "0.88rem" }}>{ca.title}</strong>
                            <span className="status-pill status-active" style={{ padding: "2px 7px", fontSize: "0.64rem" }}>
                              CUSTOM · {ca.timer_seconds}s
                            </span>
                          </div>
                          <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                            Metric: {ca.metric_label} · Owner: {ca.owner}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "5px 10px", fontSize: "0.74rem" }}
                          onClick={() => handleRemoveCustomAlarm(ca.id)}
                          data-testid={`remove-custom-alarm-${ca.id}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="customize-section">
                <div className="eyebrow">ADD CUSTOM DAY-30 CREW DRILL ALARM</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="ca-id">Alarm ID (snake_case)</label>
                      <HelpTip copyKey="customize.g3.id" />
                    </div>
                    <input
                      id="ca-id"
                      className="field-input mono"
                      placeholder="redis_pool_exhaustion"
                      value={alId}
                      onChange={(e) => setAlId(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="ca-title">Alarm Title</label>
                      <HelpTip copyKey="customize.g3.title" />
                    </div>
                    <input
                      id="ca-title"
                      className="field-input"
                      placeholder="Redis Idempotency Pool Exhaustion"
                      value={alTitle}
                      onChange={(e) => setAlTitle(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="ca-metric">Metric Label</label>
                      <HelpTip copyKey="customize.g3.metric" />
                    </div>
                    <input
                      id="ca-metric"
                      className="field-input"
                      value={alMetric}
                      onChange={(e) => setAlMetric(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="field-group">
                      <div className="help-label-row">
                        <label className="field-label" htmlFor="ca-timer">Timer (sec)</label>
                        <HelpTip copyKey="customize.g3.timer" />
                      </div>
                      <input
                        id="ca-timer"
                        type="number"
                        className="field-input mono"
                        value={alTimer}
                        onChange={(e) => setAlTimer(Number(e.target.value))}
                      />
                    </div>
                    <div className="field-group">
                      <div className="help-label-row">
                        <label className="field-label" htmlFor="ca-owner">Owner</label>
                        <HelpTip copyKey="customize.g3.owner" />
                      </div>
                      <input
                        id="ca-owner"
                        className="field-input mono"
                        value={alOwner}
                        onChange={(e) => setAlOwner(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <div className="help-label-row">
                    <label className="field-label" htmlFor="ca-symptom">Trigger Symptom</label>
                    <HelpTip copyKey="customize.g3.symptom" />
                  </div>
                  <input
                    id="ca-symptom"
                    className="field-input"
                    placeholder="ALERT P1: Connection pool saturation at 99% blocking webhook dedupe"
                    value={alSymptom}
                    onChange={(e) => setAlSymptom(e.target.value)}
                  />
                </div>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <div className="help-label-row">
                    <label className="field-label" htmlFor="ca-logs">Log Lines (1 per line)</label>
                    <HelpTip copyKey="customize.g3.logLines" />
                  </div>
                  <textarea
                    id="ca-logs"
                    className="field-input mono"
                    rows={2}
                    placeholder="ERR_POOL_EXHAUSTED active=512/512 waiting=184"
                    value={alLogLine}
                    onChange={(e) => setAlLogLine(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="ca-rem-label">Remediation Action Label</label>
                      <HelpTip copyKey="customize.g3.remLabel" />
                    </div>
                    <input
                      id="ca-rem-label"
                      className="field-input"
                      placeholder="Enable Read-Replica Failover & Raise Pool Cap"
                      value={alRemLabel}
                      onChange={(e) => setAlRemLabel(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <div className="help-label-row">
                      <label className="field-label" htmlFor="ca-proof">Verification Proof</label>
                      <HelpTip copyKey="customize.g3.proof" />
                    </div>
                    <input
                      id="ca-proof"
                      className="field-input"
                      placeholder="200 OK · Pool utilization dropped to 24% · 3/3 SLA ticks green"
                      value={alProof}
                      onChange={(e) => setAlProof(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field-group" style={{ marginTop: 10 }}>
                  <div className="help-label-row">
                    <label className="field-label" htmlFor="ca-rem-detail">Remediation Detail</label>
                    <HelpTip copyKey="customize.g3.remDetail" />
                  </div>
                  <input
                    id="ca-rem-detail"
                    className="field-input"
                    placeholder="Exact step customer on-call SRE executes during drill"
                    value={alRemDetail}
                    onChange={(e) => setAlRemDetail(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddCustomAlarm}
                    data-testid="add-custom-alarm-btn"
                  >
                    Add Custom Day-30 Alarm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LIVE 2-WAY SYNCED YAML EDITOR */}
          {activeTab === "yaml" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div className="help-control-wrap">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleApplyYamlClick}
                    data-testid="apply-yaml-btn"
                  >
                    Apply YAML
                  </button>
                  <HelpTip copyKey="customize.yaml.apply" />
                </div>
                <div className="help-control-wrap">
                  <button
                    type="button"
                    className="btn btn-nominal"
                    onClick={handleLoadPaymentsExample}
                    data-testid="load-payments-example-btn"
                  >
                    Load Custom Payments Example
                  </button>
                  <HelpTip copyKey="customize.yaml.loadExample" />
                </div>
                <div className="help-control-wrap">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleDownloadYaml}
                    data-testid="download-yaml-btn"
                  >
                    Download nominalx.yaml
                  </button>
                  <HelpTip copyKey="customize.yaml.download" />
                </div>
                <div className="help-control-wrap">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleResetAll}
                    data-testid="reset-customizations-btn"
                  >
                    Reset Customizations
                  </button>
                  <HelpTip copyKey="customize.yaml.reset" />
                </div>
              </div>

              {yamlNotice && yamlErrors.length === 0 && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 11,
                    background: "var(--nominal-bg)",
                    border: "1.5px solid var(--nominal-border)",
                    color: "var(--nominal-text)",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                  }}
                  data-testid="yaml-apply-notice"
                >
                  {yamlNotice}
                </div>
              )}

              {yamlErrors.length > 0 && (
                <div
                  className="validation-alert"
                  role="alert"
                  data-testid="yaml-validation-errors"
                >
                  <div className="eyebrow" style={{ color: "var(--nogo-text)", marginBottom: 6 }}>
                    NOMINALX.YAML VALIDATION ERRORS ({yamlErrors.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                    {yamlErrors.map((err, idx) => (
                      <li key={`${err.path}-${idx}`}>
                        <code className="mono">{err.path}</code>: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="field-group">
                <div className="help-label-row">
                  <label className="field-label" htmlFor="nominalx-yaml-editor">
                    LIVE 2-WAY SYNCED CONTRACT (nominalx.yaml)
                  </label>
                  <HelpTip copyKey="customize.yaml.editor" />
                </div>
                <textarea
                  id="nominalx-yaml-editor"
                  className="yaml-editor-textarea mono"
                  value={yamlText}
                  onChange={(e) => {
                    setYamlText(e.target.value);
                    setYamlNotice(null);
                  }}
                  spellCheck={false}
                  rows={24}
                  data-testid="yaml-editor-textarea"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
