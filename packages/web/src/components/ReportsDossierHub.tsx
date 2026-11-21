import { useMemo, useState } from "react";
import {
  buildDossier,
  buildReport,
  renderDossier,
  renderReport,
  type AccountPreset,
  type DossierSigners,
  type ExecutiveReadinessReport,
  type ExportFormat,
  type OperationalSprintDigest,
  type WaiverAgingRegisterReport,
} from "@nominalx/core";
import {
  downloadTextFile,
  getEffectiveConfigForMission,
  type AccountMissionState,
} from "../state/missionState";
import { ShieldLockIcon } from "./Icons";

type HubTab = "dossier" | "exec" | "ops" | "waivers";

interface ReportsDossierHubProps {
  preset: AccountPreset;
  mission: AccountMissionState;
  onUpdateSigners: (signers: DossierSigners) => void;
  onToggleSignDossier: () => void;
}

function agingPillClass(band: string): string {
  if (band === "EXPIRED" || band === "CRITICAL_7D") return "status-nogo";
  if (band === "WARNING_14D") return "status-waived";
  return "status-nominal";
}

function statusPillForString(status: string): string {
  if (status === "NOMINAL" || status === "READY" || status === "STABILIZED") {
    return "status-nominal";
  }
  if (status === "CONDITIONAL_GO" || status === "HOLD_WAIVED" || status === "NOMINAL_WITH_WAIVERS") {
    return "status-waived";
  }
  if (status === "NO_GO" || status === "EXPIRED" || status === "REJECTED_HARD_STOP") {
    return "status-nogo";
  }
  if (status === "ACTIVE") return "status-active";
  return "status-pending";
}

export function ReportsDossierHub({
  preset,
  mission,
  onUpdateSigners,
  onToggleSignDossier,
}: ReportsDossierHubProps) {
  const [activeTab, setActiveTab] = useState<HubTab>("dossier");
  const [previewFormat, setPreviewFormat] = useState<ExportFormat | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const effectiveConfig = useMemo(
    () => getEffectiveConfigForMission(preset, mission),
    [preset, mission],
  );

  const generatedAt = `${preset.referenceDate}T16:45:00.000Z`;

  const dossier = useMemo(
    () =>
      buildDossier({
        config: effectiveConfig,
        gate1: mission.flightCheck,
        gate2: mission.staticFire,
        gate3: mission.crewSummary,
        signers: mission.signers,
        generatedAt,
      }),
    [effectiveConfig, mission.flightCheck, mission.staticFire, mission.crewSummary, mission.signers, generatedAt],
  );

  const execReport = useMemo(
    () =>
      buildReport("exec", {
        config: effectiveConfig,
        gate1: mission.flightCheck,
        gate2: mission.staticFire,
        gate3: mission.crewSummary,
        dossierSigned: mission.dossierSigned,
        generatedAt,
      }) as ExecutiveReadinessReport,
    [effectiveConfig, mission.flightCheck, mission.staticFire, mission.crewSummary, mission.dossierSigned, generatedAt],
  );

  const opsReport = useMemo(
    () =>
      buildReport("ops", {
        config: effectiveConfig,
        gate1: mission.flightCheck,
        gate2: mission.staticFire,
        gate3: mission.crewSummary,
        dossierSigned: mission.dossierSigned,
        generatedAt,
      }) as OperationalSprintDigest,
    [effectiveConfig, mission.flightCheck, mission.staticFire, mission.crewSummary, mission.dossierSigned, generatedAt],
  );

  const waiversReport = useMemo(
    () =>
      buildReport("waivers", {
        config: effectiveConfig,
        gate1: mission.flightCheck,
        gate2: mission.staticFire,
        gate3: mission.crewSummary,
        dossierSigned: mission.dossierSigned,
        generatedAt,
      }) as WaiverAgingRegisterReport,
    [effectiveConfig, mission.flightCheck, mission.staticFire, mission.crewSummary, mission.dossierSigned, generatedAt],
  );

  const getRenderedOutput = (format: ExportFormat): string => {
    if (activeTab === "dossier") return renderDossier(dossier, format);
    if (activeTab === "exec") return renderReport(execReport, format);
    if (activeTab === "ops") return renderReport(opsReport, format);
    return renderReport(waiversReport, format);
  };

  const handleCopySlack = async () => {
    const slackText = getRenderedOutput("slack");
    try {
      await navigator.clipboard.writeText(slackText);
      setCopyToast("Copied Slack mrkdwn to clipboard");
    } catch {
      setCopyToast("Slack mrkdwn ready in preview");
      setPreviewFormat("slack");
    }
    window.setTimeout(() => setCopyToast(null), 2600);
  };

  const handleDownload = (format: "md" | "json") => {
    const content = getRenderedOutput(format);
    const ext = format === "md" ? "md" : "json";
    const mime = format === "md" ? "text/markdown" : "application/json";
    downloadTextFile(
      `nominalx-${activeTab}-${preset.config.account.id}.${ext}`,
      content,
      mime,
    );
    setCopyToast(`Downloaded .${ext} artifact`);
    window.setTimeout(() => setCopyToast(null), 2400);
  };

  const canSignCleanly =
    mission.flightCheck.passed &&
    mission.staticFire.passed &&
    mission.crewSummary.allStabilized;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Hub Header + 1-Click Export Controls */}
      <div className="panel gate-action-header">
        <div>
          <div className="eyebrow">
            REPORTING &amp; HANDOVER HUB · POWERED BY @NOMINALX/CORE DETERMINISTIC ENGINE
          </div>
          <h2 className="gate-title-xl">
            Executive Reports, Operational Digests &amp; Signed NOMINAL Dossier
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {copyToast && (
            <span className="status-pill status-nominal">{copyToast}</span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleCopySlack()}
            data-testid="export-copy-slack-btn"
          >
            Copy Slack
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleDownload("md")}
            data-testid="export-download-md-btn"
          >
            Download .md
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleDownload("json")}
            data-testid="export-download-json-btn"
          >
            Download .json
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setPreviewFormat((cur) => (cur ? null : "slack"))
            }
            data-testid="toggle-raw-preview-btn"
          >
            {previewFormat ? "Hide Raw Output" : "Inspect Raw Export"}
          </button>
        </div>
      </div>

      {/* 4 Big Visual Report Tabs */}
      <div className="report-tabs">
        <button
          type="button"
          className={`report-tab ${activeTab === "dossier" ? "active" : ""}`}
          onClick={() => setActiveTab("dossier")}
          data-testid="report-tab-dossier"
        >
          <span className="eyebrow">HANDOVER SPRINT · STAGE 4 → 5</span>
          <strong style={{ fontSize: "1.02rem" }}>Signed NOMINAL Dossier &amp; Day-1 Runbook</strong>
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--active-text)" }}>
            VERDICT: {dossier.verdict.replace(/_/g, " ")}
          </span>
        </button>

        <button
          type="button"
          className={`report-tab ${activeTab === "exec" ? "active" : ""}`}
          onClick={() => setActiveTab("exec")}
          data-testid="report-tab-exec"
        >
          <span className="eyebrow">VP ENG / LEADERSHIP</span>
          <strong style={{ fontSize: "1.02rem" }}>Executive Readiness Report</strong>
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            nominalx report --type exec
          </span>
        </button>

        <button
          type="button"
          className={`report-tab ${activeTab === "ops" ? "active" : ""}`}
          onClick={() => setActiveTab("ops")}
          data-testid="report-tab-ops"
        >
          <span className="eyebrow">FDE / CSE / SRE DAILY STANDUP</span>
          <strong style={{ fontSize: "1.02rem" }}>Operational Sprint &amp; Integrations Digest</strong>
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            nominalx report --type ops
          </span>
        </button>

        <button
          type="button"
          className={`report-tab ${activeTab === "waivers" ? "active" : ""}`}
          onClick={() => setActiveTab("waivers")}
          data-testid="report-tab-waivers"
        >
          <span className="eyebrow">SECURITY &amp; GOVERNANCE AUDIT</span>
          <strong style={{ fontSize: "1.02rem" }}>Waiver Aging &amp; Governance Register</strong>
          <span className="mono" style={{ fontSize: "0.72rem", color: "var(--waived-text)" }}>
            CAP: {waiversReport.policyAttestation.activeUtilization} ACTIVE
          </span>
        </button>
      </div>

      {/* Optional Raw Output Preview (Slack / MD / JSON) */}
      {previewFormat && (
        <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span className="eyebrow">RAW DETERMINISTIC EXPORT PREVIEW ({activeTab.toUpperCase()})</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["slack", "md", "json"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={`btn ${previewFormat === fmt ? "btn-primary" : ""}`}
                  onClick={() => setPreviewFormat(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <pre
            className="wire-terminal"
            style={{ maxHeight: 280, overflowY: "auto", margin: 0, whiteSpace: "pre-wrap" }}
          >
            {getRenderedOutput(previewFormat)}
          </pre>
        </section>
      )}

      {/* TAB 1: SIGNED NOMINAL DOSSIER & TAILORED DAY-1 RUNBOOK */}
      {activeTab === "dossier" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Flight Readiness Certificate Hero */}
          <section className={`panel certificate-hero verdict-${dossier.verdict}`}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className={`status-pill lg ${statusPillForString(dossier.verdict)}`}>
                    FLIGHT READINESS SEAL: {dossier.verdict.replace(/_/g, " ")}
                  </span>
                  {mission.dossierSigned && (
                    <span className="status-pill lg status-nominal">
                      SIGNED &amp; SEALED ✓
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: "1.95rem", fontWeight: 800, margin: "12px 0 4px", letterSpacing: "-0.03em" }}>
                  {dossier.account.name} — Handover Certificate
                </h3>
                <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                  Deterministic launch telemetry verified across Stages 2 → 4 and sealed for Stage 5 Support Engineers &amp; Customer On-Call SREs.
                </div>
              </div>

              {/* 4 Oversized Gate KPIs */}
              <div className="kpi-4-grid">
                <div className="kpi-box">
                  <span className="eyebrow">GATE 1 (1/3)</span>
                  <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                    {dossier.gate1.counts.nominal + dossier.gate1.counts.heldWaived}/{dossier.gate1.counts.total}
                  </div>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {dossier.gate1.verdict}
                  </span>
                </div>
                <div className="kpi-box">
                  <span className="eyebrow">GATE 2 (2/3)</span>
                  <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                    {dossier.gate2.grade} · {dossier.gate2.corruptionPct.toFixed(1)}%
                  </div>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {dossier.gate2.totals.passedVectors}/{dossier.gate2.totals.totalVectors} VECTORS
                  </span>
                </div>
                <div className="kpi-box">
                  <span className="eyebrow">GATE 3 (3/3)</span>
                  <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                    {dossier.gate3.stabilizedCount}/{dossier.gate3.totalAlarms}
                  </div>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {(dossier.gate3.totalSplitMs / 1000).toFixed(1)}s TOTAL
                  </span>
                </div>
                <div className="kpi-box">
                  <span className="eyebrow">WAIVERS</span>
                  <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                    {dossier.gate1.waiverAudit.activeWaivers.length}/2
                  </div>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    0 HARD STOP WAIVERS
                  </span>
                </div>
              </div>

              {/* Deterministic SHA-256 Digest Strip */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 11,
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border-strong)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span className="eyebrow">DETERMINISTIC SHA-256 VERIFICATION DIGEST</span>
                <code
                  className="mono"
                  style={{ fontSize: "0.74rem", color: "var(--active-text)", wordBreak: "break-all" }}
                  data-testid="dossier-sha256-digest"
                >
                  {dossier.verificationDigest}
                </code>
              </div>
            </div>

            {/* Right: Interactive Engineer Sign-Off Block */}
            <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="eyebrow">HANDOVER SPRINT SIGN-OFF BLOCK</span>
                <div className="field-group">
                  <label className="field-label" htmlFor="signer-fde">
                    Single Accountable Owner (Lead FDE)
                  </label>
                  <input
                    id="signer-fde"
                    className="field-input mono"
                    value={mission.signers.leadFde}
                    onChange={(e) =>
                      onUpdateSigners({ ...mission.signers, leadFde: e.target.value })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="signer-cse">
                    Co-Signer (Lead CSE · Gate 3 Owner)
                  </label>
                  <input
                    id="signer-cse"
                    className="field-input mono"
                    value={mission.signers.leadCse}
                    onChange={(e) =>
                      onUpdateSigners({ ...mission.signers, leadCse: e.target.value })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="signer-cust">
                    Co-Signer (Customer Engineering Lead)
                  </label>
                  <input
                    id="signer-cust"
                    className="field-input mono"
                    value={mission.signers.customerEngLead}
                    onChange={(e) =>
                      onUpdateSigners({
                        ...mission.signers,
                        customerEngLead: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                className={`btn btn-lg ${mission.dossierSigned ? "btn-nominal" : "btn-primary"}`}
                onClick={onToggleSignDossier}
                data-testid="seal-sign-dossier-btn"
              >
                {mission.dossierSigned
                  ? "DOSSIER SIGNED & SEALED ✓"
                  : canSignCleanly
                    ? "SIGN & SEAL NOMINAL DOSSIER"
                    : "SIGN DRAFT HANDOVER DOSSIER"}
              </button>
            </div>
          </section>

          {/* Tailored Day-1 Customer Runbook */}
          <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <span className="eyebrow">AUTO-GENERATED STAGE 5 HANDOVER ARTIFACT</span>
                <h3 style={{ margin: "3px 0 0", fontSize: "1.3rem", fontWeight: 800 }}>
                  Stack-Tailored Day-1 Customer Runbook ({dossier.account.name})
                </h3>
              </div>
              <div className="stack-chips">
                <span className="stack-chip">{dossier.runbook.verifiedBaselines.authProtocol.toUpperCase()}</span>
                <span className="stack-chip">REGIONS: {dossier.runbook.verifiedBaselines.allowedRegions.join(", ")}</span>
                <span className="stack-chip">{dossier.runbook.verifiedBaselines.guaranteedRps.toLocaleString("en-US")} RPS</span>
                <span className="stack-chip">P1: {dossier.runbook.verifiedBaselines.p1Channel}</span>
                <span className="stack-chip">RTO ≤ {dossier.runbook.verifiedBaselines.maxRtoMinutes}m</span>
              </div>
            </div>

            <div className="runbook-grid">
              {dossier.runbook.sections.map((section) => (
                <div
                  key={section.id}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 15,
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <strong style={{ fontSize: "0.96rem" }}>{section.title}</strong>
                    <span className="mono" style={{ fontSize: "0.68rem", color: "var(--active-text)", fontWeight: 700 }}>
                      {section.ownerRole}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    {section.summary}
                  </div>
                  <div className="wire-terminal" style={{ padding: "10px 12px", fontSize: "0.73rem" }}>
                    {section.commands.map((cmd) => (
                      <div key={cmd} style={{ color: "#7dd3fc" }}>
                        $ {cmd}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: EXECUTIVE READINESS REPORT (exec) */}
      {activeTab === "exec" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section
            className="panel panel-pad"
            style={{
              borderLeft: `6px solid ${
                execReport.masterVerdict === "NOMINAL"
                  ? "var(--nominal)"
                  : execReport.masterVerdict === "CONDITIONAL_GO"
                    ? "var(--waived)"
                    : "var(--nogo)"
              }`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="eyebrow">EXECUTIVE LAUNCH DECISION</span>
              <span className={`status-pill lg ${statusPillForString(execReport.masterVerdict)}`}>
                {execReport.masterVerdict.replace("_", " ")}
              </span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, marginTop: 8 }}>
              {execReport.recommendedAction}
            </div>
          </section>

          <div className="kpi-4-grid">
            <div className="panel kpi-box">
              <span className="eyebrow">HARD STOP COMPLIANCE ({execReport.hardStopCompliance.allHardStops.length})</span>
              {execReport.hardStopCompliance.allHardStops.map((hs) => (
                <div key={hs.stationCode} className="mono" style={{ fontSize: "0.95rem", fontWeight: 800, marginTop: 2 }}>
                  {hs.stationLabel}:{" "}
                  <span style={{ color: hs.status === "NOMINAL" ? "var(--nominal-text)" : "var(--nogo-text)" }}>
                    {hs.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="panel kpi-box">
              <span className="eyebrow">GATE 1 · FLIGHT CHECK</span>
              <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
                {execReport.gate1Summary.nominal}/{execReport.gate1Summary.totalStations} NOMINAL
              </div>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {execReport.gate1Summary.waived} WAIVED · {execReport.gate1Summary.noGo} NO-GO
              </span>
            </div>

            <div className="panel kpi-box">
              <span className="eyebrow">GATE 2 · STATIC FIRE</span>
              <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
                GRADE {execReport.gate2Summary.grade}
              </div>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {execReport.gate2Summary.attemptTrail}
              </span>
            </div>

            <div className="panel kpi-box">
              <span className="eyebrow">WAIVER EXPOSURE</span>
              <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
                {execReport.waiverExposure.activeCount} / {execReport.waiverExposure.maxAllowed}
              </div>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--waived-text)" }}>
                {execReport.waiverExposure.nearestExpiry
                  ? `NEAREST: ${execReport.waiverExposure.nearestExpiry} (${execReport.waiverExposure.nearestDaysRemaining}d)`
                  : "ZERO ACTIVE WAIVERS"}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="panel panel-pad">
              <span className="eyebrow" style={{ color: "var(--nominal-text)" }}>IN-SCOPE VERIFIED BOUNDARY</span>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 7, fontSize: "0.88rem" }}>
                {execReport.scopeGovernance.inScopeHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="panel panel-pad">
              <span className="eyebrow" style={{ color: "var(--waived-text)" }}>EXPLICIT OUT-OF-SCOPE GUARDRAILS</span>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 7, fontSize: "0.88rem" }}>
                {execReport.scopeGovernance.outOfScopeBoundaries.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OPERATIONAL SPRINT & INTEGRATIONS DIGEST (ops) */}
      {activeTab === "ops" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="panel panel-pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <span className="eyebrow">LIVE TELEMETRY STATUS ACROSS CONNECTED INTEGRATIONS</span>
                <h3 style={{ margin: "3px 0 0", fontSize: "1.2rem", fontWeight: 800 }}>
                  Integration Health Matrix · {opsReport.activeStageLabel}
                </h3>
              </div>
              <span className="owner-badge">
                BATON: <strong className="mono">{opsReport.accountableOwner}</strong>
              </span>
            </div>

            <div className="integration-grid">
              {opsReport.integrationMatrix.map((row) => (
                <div
                  key={row.integration}
                  className="kpi-box"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: "0.88rem" }}>{row.integration}</strong>
                    <span className={`status-pill ${statusPillForString(row.status)}`}>
                      {row.status}
                    </span>
                  </div>
                  <code className="mono" style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>
                    {row.endpointOrTarget}
                  </code>
                </div>
              ))}
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="panel panel-pad">
              <span className="eyebrow">GATE 1 NON-NOMINAL STATIONS ({opsReport.stationBlockers.length})</span>
              {opsReport.stationBlockers.length === 0 ? (
                <div style={{ marginTop: 10, color: "var(--nominal-text)", fontWeight: 800 }}>
                  All {mission.flightCheck.counts.total} Flight Check stations are NOMINAL.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                  {opsReport.stationBlockers.map((b) => (
                    <div
                      key={b.stationLabel}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: "var(--bg-surface-2)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong>
                          {b.subStage} {b.stationLabel}
                        </strong>
                        <span className={`status-pill ${statusPillForString(b.status)}`}>
                          {b.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 5 }}>
                        {b.remediation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel panel-pad">
              <span className="eyebrow">NEXT DETERMINISTIC CLI COMMANDS</span>
              <div className="wire-terminal" style={{ marginTop: 10 }}>
                {opsReport.nextCommands.map((cmd) => (
                  <div key={cmd} style={{ color: "#7dd3fc", marginBottom: 6 }}>
                    $ {cmd}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WAIVER AGING & GOVERNANCE REGISTER (waivers) */}
      {activeTab === "waivers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
            <div
              className="panel panel-pad"
              style={{
                borderColor: "var(--nogo-border)",
                background: "linear-gradient(135deg, var(--bg-surface) 0%, var(--nogo-bg) 100%)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--nogo-text)" }}>
                <ShieldLockIcon size={22} />
                <span className="eyebrow" style={{ color: "var(--nogo-text)" }}>
                  HARD STOP POLICY ATTESTATION
                </span>
              </div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, marginTop: 8 }}>
                {waiversReport.policyAttestation.hardStopStations.join(" & ")} are Non-Waivable Hard Stops.
              </div>
              <div className="mono" style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 6 }}>
                VIOLATIONS DETECTED: {waiversReport.policyAttestation.hardStopViolationsDetected} · MAX DURATION: ≤ {waiversReport.policyAttestation.maxDurationDays} DAYS
              </div>
            </div>

            <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              <span className="eyebrow">OPERATIONAL WAIVER CAP UTILIZATION</span>
              <div className="kpi-xl" style={{ color: "var(--waived-text)" }}>
                {waiversReport.policyAttestation.activeUtilization}
              </div>
              <div className="health-bar-track">
                <div
                  className="health-bar-fill"
                  style={{
                    width: `${(waiversReport.activeWaivers.length / waiversReport.policyAttestation.maxActiveWaivers) * 100}%`,
                    background: "var(--waived)",
                  }}
                />
              </div>
            </div>
          </div>

          <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="eyebrow">ACTIVE OPERATIONAL WAIVERS (AS OF {waiversReport.referenceDate})</span>
            {waiversReport.activeWaivers.length === 0 ? (
              <div style={{ color: "var(--nominal-text)", fontWeight: 800, fontSize: "1rem" }}>
                Zero active Operational Waivers — full telemetry compliance.
              </div>
            ) : (
              waiversReport.activeWaivers.map((w) => {
                const pctLeft = Math.max(
                  5,
                  Math.min(100, ((w.daysRemaining ?? 0) / 30) * 100),
                );
                return (
                  <div
                    key={`${w.stationLabel}-${w.expiresAt}`}
                    style={{
                      padding: "16px 18px",
                      borderRadius: 14,
                      background: "var(--bg-surface-2)",
                      border: "1.5px solid var(--waived-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong className="mono" style={{ fontSize: "1.05rem" }}>
                          {w.stationLabel}
                        </strong>
                        <span className="stack-chip">OWNER: {w.owner}</span>
                        {w.ticketId && <span className="stack-chip">{w.ticketId}</span>}
                      </div>
                      <span className={`status-pill ${agingPillClass(w.agingBand)}`}>
                        {w.agingBand} · {w.daysRemaining ?? 0}d LEFT (EXP {w.expiresAt})
                      </span>
                    </div>

                    <div className="health-bar-track">
                      <div
                        className="health-bar-fill"
                        style={{ width: `${pctLeft}%`, background: "var(--waived)" }}
                      />
                    </div>

                    <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                      <strong>Reason:</strong> {w.reason}
                    </div>
                    <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                      <strong>Rollback Plan:</strong> {w.rollbackPlan}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}
    </div>
  );
}
