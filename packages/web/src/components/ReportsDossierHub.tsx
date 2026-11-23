import { useEffect, useMemo, useState } from "react";
import {
  buildDossier,
  buildReport,
  DEPLOYMENT_MODEL_LABELS,
  renderDossier,
  renderReport,
  type AccountPreset,
  type CustomerBlueprint,
  type DossierSigners,
  type ExecutiveReadinessReport,
  type ExportFormat,
  type ManualGateState,
  type OperationalSprintDigest,
  type SignedNominalDossier,
} from "@nominalx/core";
import {
  downloadTextFile,
  getEffectiveConfigForMission,
  type AccountMissionState,
} from "../state/missionState";
import { HelpTip } from "./HelpTip";
import { ShieldLockIcon } from "./Icons";

export type DeliverableTab = "exec" | "digest" | "dossier" | "runbook";

interface ReportsDossierHubProps {
  preset: AccountPreset;
  mission: AccountMissionState;
  blueprint?: CustomerBlueprint | null;
  manualState?: ManualGateState | null;
  forceTab?: DeliverableTab | null;
  onUpdateSigners: (signers: DossierSigners) => void;
  onToggleSignDossier: () => void;
}

interface DeliverableMeta {
  id: DeliverableTab;
  title: string;
  shortLabel: string;
  whoReadsIt: string;
  whenToSend: string;
  helpKey:
    | "deliverables.tab.exec"
    | "deliverables.tab.digest"
    | "deliverables.tab.dossier"
    | "deliverables.tab.runbook";
  filenameSlug: string;
}

const DELIVERABLE_META: readonly DeliverableMeta[] = [
  {
    id: "exec",
    title: "Executive Brief",
    shortLabel: "Executive Brief",
    whoReadsIt: "VP Engineering, Customer Executives & Account Leadership",
    whenToSend: "Weekly before go-live and at final Go / No-Go review",
    helpKey: "deliverables.tab.exec",
    filenameSlug: "executive-brief",
  },
  {
    id: "digest",
    title: "Weekly Sprint Digest",
    shortLabel: "Weekly Sprint Digest",
    whoReadsIt: "Lead FDE, Lead CSE, Solutions Engineers & Customer Engineers",
    whenToSend: "Every sprint standup and Friday engineering sync",
    helpKey: "deliverables.tab.digest",
    filenameSlug: "weekly-sprint-digest",
  },
  {
    id: "dossier",
    title: "Handover Dossier",
    shortLabel: "Handover Dossier",
    whoReadsIt: "Lead FDE, Lead CSE, Support Engineers & Customer Eng Lead",
    whenToSend: "At Stage 4 -> 5 sign-off before FDE roll-off",
    helpKey: "deliverables.tab.dossier",
    filenameSlug: "handover-dossier",
  },
  {
    id: "runbook",
    title: "Customer On-Call Runbook",
    shortLabel: "Customer On-Call Runbook",
    whoReadsIt: "Support Engineers & Customer On-Call SREs",
    whenToSend: "Day 1 of production cutover and on-call shift onboarding",
    helpKey: "deliverables.tab.runbook",
    filenameSlug: "customer-on-call-runbook",
  },
];

interface EvidenceRow {
  gate: "Gate 1" | "Gate 2" | "Gate 3";
  item: string;
  status: string;
  note: string;
}

export function computeDeliverableLiveStatus(mission: AccountMissionState): {
  label: "Blocked by Hard Stop · Draft" | "Waivers Open · Draft" | "Ready to Send";
  pillClass: string;
} {
  if (mission.flightCheck.counts.hardStopFailures > 0) {
    return {
      label: "Blocked by Hard Stop · Draft",
      pillClass: "status-nogo",
    };
  }
  const hasWaivers = mission.flightCheck.waiverAudit.activeWaivers.length > 0;
  const allGatesClean =
    mission.flightCheck.passed &&
    mission.staticFire.passed &&
    mission.crewSummary.allStabilized;

  if (allGatesClean && !hasWaivers) {
    return {
      label: "Ready to Send",
      pillClass: "status-nominal",
    };
  }
  return {
    label: "Waivers Open · Draft",
    pillClass: "status-waived",
  };
}

function collectEvidenceNotes(
  mission: AccountMissionState,
  manualState?: ManualGateState | null,
): EvidenceRow[] {
  if (!manualState) return [];
  const rows: EvidenceRow[] = [];

  for (const s of mission.flightCheck.stations) {
    const entry = manualState.gate1[s.stationCode];
    if (entry?.evidenceNote.trim()) {
      rows.push({
        gate: "Gate 1",
        item: s.stationLabel,
        status: s.status,
        note: entry.evidenceNote.trim(),
      });
    }
  }
  for (const v of mission.staticFire.vectors) {
    const entry = manualState.gate2[v.vectorId];
    if (entry?.evidenceNote.trim()) {
      rows.push({
        gate: "Gate 2",
        item: v.vectorName,
        status: v.passed ? "PASS" : entry.status,
        note: entry.evidenceNote.trim(),
      });
    }
  }
  for (const a of mission.crewSummary.alarms) {
    const entry = manualState.gate3[a.alarmId];
    if (entry?.evidenceNote.trim()) {
      rows.push({
        gate: "Gate 3",
        item: a.alarmName,
        status: a.status === "stabilized" ? "STABILIZED" : entry.status,
        note: entry.evidenceNote.trim(),
      });
    }
  }
  return rows;
}

function renderRunbookMarkdown(
  dossier: SignedNominalDossier,
  evidenceNotes: readonly EvidenceRow[],
  blueprint?: CustomerBlueprint | null,
): string {
  const rb = dossier.runbook;
  const lines: string[] = [
    `# Customer On-Call Runbook — ${dossier.account.name}`,
    "",
    `> **Target Go-Live:** \`${dossier.account.target_go_live}\` | **Lead FDE:** \`${rb.primaryContacts.leadFde}\` | **Lead CSE:** \`${rb.primaryContacts.leadCse}\` | **Support Owner:** \`${rb.primaryContacts.supportOwner}\``,
    "",
  ];

  if (blueprint) {
    lines.push(
      `- **Deployment Model:** ${DEPLOYMENT_MODEL_LABELS[blueprint.input.deploymentModel]}`,
    );
    if (blueprint.input.dealScopeSummary.trim()) {
      lines.push(`- **Integration Scope:** ${blueprint.input.dealScopeSummary.trim()}`);
    }
    lines.push(
      `- **On-Call Model:** ${blueprint.input.customerHasOwnOnCall ? "Joint Support + Customer On-Call SREs" : "Vendor-Led P1 Escalation"} (Target P1 Response: ${blueprint.input.targetP1ResponseMinutes} min)`,
    );
    lines.push("");
  }

  lines.push("## Verified Production Baselines");
  lines.push("");
  lines.push(
    `- **Stack:** Cloud \`${rb.stackSummary.cloud}\` · IdP \`${rb.stackSummary.idp}\` · Alerting \`${rb.stackSummary.alerting}\` · Runtime \`${rb.stackSummary.webhook_runtime}\``,
  );
  lines.push(
    `- **Auth Protocol:** \`${rb.verifiedBaselines.authProtocol.toUpperCase()}\` · **Regions:** \`[${rb.verifiedBaselines.allowedRegions.join(", ")}]\` · **Quota:** \`${rb.verifiedBaselines.guaranteedRps.toLocaleString("en-US")} RPS\` · **P1 Channel:** \`${rb.verifiedBaselines.p1Channel}\` · **Max RTO:** \`${rb.verifiedBaselines.maxRtoMinutes}m\``,
  );
  lines.push("");

  for (const section of rb.sections) {
    lines.push(`## ${section.title}`);
    lines.push(`*Owner:* ${section.ownerRole}`);
    lines.push("");
    lines.push(section.summary);
    lines.push("");
    lines.push("```bash");
    for (const cmd of section.commands) {
      lines.push(cmd);
    }
    lines.push("```");
    lines.push("");
    for (const step of section.verificationSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  if (evidenceNotes.length > 0) {
    lines.push("## Captured Verification Evidence Notes");
    lines.push("");
    for (const row of evidenceNotes) {
      lines.push(`- **${row.gate} · ${row.item} (${row.status}):** ${row.note}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function appendEvidenceMarkdown(
  baseMarkdown: string,
  evidenceNotes: readonly EvidenceRow[],
  blueprint?: CustomerBlueprint | null,
): string {
  const extra: string[] = [];
  if (blueprint?.input.dealScopeSummary.trim()) {
    extra.push("", "## Customer Launch Context", "");
    extra.push(
      `- **Deployment Model:** ${DEPLOYMENT_MODEL_LABELS[blueprint.input.deploymentModel]}`,
    );
    extra.push(`- **Scope:** ${blueprint.input.dealScopeSummary.trim()}`);
    extra.push(
      `- **P1 Target Response:** ${blueprint.input.targetP1ResponseMinutes} min (${blueprint.input.customerHasOwnOnCall ? "Customer has on-call engineers" : "Vendor-led P1 escalation"})`,
    );
  }
  if (evidenceNotes.length > 0) {
    extra.push("", "## Logged Gate Evidence Notes", "");
    for (const row of evidenceNotes) {
      extra.push(`- **${row.gate} · ${row.item} (${row.status}):** ${row.note}`);
    }
  }
  return extra.length > 0 ? `${baseMarkdown.trimEnd()}\n${extra.join("\n")}\n` : baseMarkdown;
}

function statusPillForString(status: string): string {
  if (status === "NOMINAL" || status === "READY" || status === "STABILIZED" || status === "PASS") {
    return "status-nominal";
  }
  if (
    status === "CONDITIONAL_GO" ||
    status === "HOLD_WAIVED" ||
    status === "NOMINAL_WITH_WAIVERS" ||
    status === "WAIVED"
  ) {
    return "status-waived";
  }
  if (status === "NO_GO" || status === "EXPIRED" || status === "REJECTED_HARD_STOP" || status === "FAIL") {
    return "status-nogo";
  }
  if (status === "ACTIVE") return "status-active";
  return "status-pending";
}

export function ReportsDossierHub({
  preset,
  mission,
  blueprint = null,
  manualState = null,
  forceTab = null,
  onUpdateSigners,
  onToggleSignDossier,
}: ReportsDossierHubProps) {
  const [activeTab, setActiveTab] = useState<DeliverableTab>("dossier");
  const [previewFormat, setPreviewFormat] = useState<ExportFormat | null>(null);
  const [copiedConfirm, setCopiedConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (forceTab) {
      setActiveTab(forceTab);
    }
  }, [forceTab]);

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

  const evidenceNotes = useMemo(
    () => collectEvidenceNotes(mission, manualState),
    [mission, manualState],
  );

  const liveStatus = useMemo(
    () => computeDeliverableLiveStatus(mission),
    [mission],
  );

  const activeMeta =
    DELIVERABLE_META.find((m) => m.id === activeTab) ?? DELIVERABLE_META[0]!;

  const getRenderedOutput = (format: ExportFormat): string => {
    if (activeTab === "exec") {
      const base = renderReport(execReport, format);
      return format === "md"
        ? appendEvidenceMarkdown(base, evidenceNotes, blueprint)
        : base;
    }
    if (activeTab === "digest") {
      const base = renderReport(opsReport, format);
      return format === "md"
        ? appendEvidenceMarkdown(base, evidenceNotes, blueprint)
        : base;
    }
    if (activeTab === "dossier") {
      const base = renderDossier(dossier, format);
      return format === "md"
        ? appendEvidenceMarkdown(base, evidenceNotes, blueprint)
        : base;
    }
    // runbook
    if (format === "json") {
      return `${JSON.stringify({ runbook: dossier.runbook, evidenceNotes }, null, 2)}\n`;
    }
    return renderRunbookMarkdown(dossier, evidenceNotes, blueprint);
  };

  const handleCopyDeliverable = async () => {
    const content = getRenderedOutput("md");
    try {
      await navigator.clipboard.writeText(content);
      setCopiedConfirm(`Copied ${activeMeta.title} ✓`);
    } catch {
      setCopiedConfirm(`${activeMeta.title} ready in preview`);
      setPreviewFormat("md");
    }
    window.setTimeout(() => setCopiedConfirm(null), 2600);
  };

  const handleDownloadMd = () => {
    const content = getRenderedOutput("md");
    downloadTextFile(
      `${effectiveConfig.account.id}-${activeMeta.filenameSlug}.md`,
      content,
      "text/markdown",
    );
    setCopiedConfirm(`Downloaded ${activeMeta.filenameSlug}.md ✓`);
    window.setTimeout(() => setCopiedConfirm(null), 2400);
  };

  const canSignCleanly =
    mission.flightCheck.passed &&
    mission.staticFire.passed &&
    mission.crewSummary.allStabilized;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
        data-tour="reports-hub-top"
      >
        {/* Top Reframed Section Header */}
        <div className="panel gate-action-header">
          <div>
            <div className="help-inline">
              <div className="eyebrow">
                LIVE LAUNCH DELIVERABLES · AUTO-GENERATED FROM YOUR GATES
              </div>
              <HelpTip copyKey="deliverables.header" />
            </div>
            <h2 className="gate-title-xl">
              Live Launch Deliverables (Auto-Generated from Your Gates)
            </h2>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: "0.88rem",
                color: "var(--text-secondary)",
              }}
            >
              These four documents are generated live from your Gate 1 to Gate 3 results so engineers
              never write manual launch updates or handover wikis.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              className={`status-pill lg ${liveStatus.pillClass}`}
              data-testid="deliverables-live-status-pill"
            >
              {liveStatus.label}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setPreviewFormat((cur) => (cur ? null : "md"))}
              data-testid="toggle-raw-preview-btn"
            >
              {previewFormat ? "Hide Raw Markdown" : "Inspect Raw Output"}
            </button>
          </div>
        </div>

        {/* 4 Clean Deliverable Tabs */}
        <div className="report-tabs" role="tablist" aria-label="Live Launch Deliverables">
          {DELIVERABLE_META.map((meta) => {
            const isActive = activeTab === meta.id;
            return (
              <button
                key={meta.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`report-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(meta.id)}
                data-testid={`deliverable-tab-${meta.id}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 6 }}>
                  <span className="eyebrow" style={{ color: isActive ? "var(--active-text)" : "var(--text-muted)" }}>
                    AUTO-GENERATED
                  </span>
                  <HelpTip asSpan copyKey={meta.helpKey} />
                </div>
                <strong style={{ fontSize: "1.02rem" }}>{meta.title}</strong>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.3 }}>
                  {meta.whoReadsIt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bold Deliverable Audience / Timing / Live Status / Copy & Download Header Card */}
        <section
          className="panel deliverable-meta-card"
          data-testid="deliverable-header-card"
        >
          <div className="deliverable-meta-grid">
            <div>
              <div className="help-inline">
                <span className="eyebrow" style={{ color: "var(--active-text)" }}>
                  WHO READS IT
                </span>
                <HelpTip copyKey="deliverables.metaCard" />
              </div>
              <div style={{ fontSize: "0.94rem", fontWeight: 800, marginTop: 4 }}>
                {activeMeta.whoReadsIt}
              </div>
            </div>

            <div>
              <span className="eyebrow" style={{ color: "var(--active-text)" }}>
                WHEN TO SEND IT
              </span>
              <div style={{ fontSize: "0.94rem", fontWeight: 700, marginTop: 4, color: "var(--text-secondary)" }}>
                {activeMeta.whenToSend}
              </div>
            </div>

            <div>
              <span className="eyebrow" style={{ color: "var(--active-text)" }}>
                LIVE STATUS
              </span>
              <div style={{ marginTop: 5 }}>
                <span
                  className={`status-pill ${liveStatus.pillClass}`}
                  data-testid="deliverable-card-status-badge"
                >
                  {liveStatus.label}
                </span>
              </div>
            </div>

            <div className="deliverable-meta-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleCopyDeliverable()}
                data-testid="deliverable-copy-btn"
              >
                {copiedConfirm ?? "Copy"}
              </button>
              <button
                type="button"
                className="btn btn-nominal"
                onClick={handleDownloadMd}
                data-testid="deliverable-download-md-btn"
              >
                Download .md
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Optional Raw Output Preview */}
      {previewFormat && (
        <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span className="eyebrow">
              LIVE GENERATED MARKDOWN / JSON ({activeMeta.title.toUpperCase()})
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["md", "slack", "json"] as const).map((fmt) => (
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
            style={{ maxHeight: 300, overflowY: "auto", margin: 0, whiteSpace: "pre-wrap" }}
          >
            {getRenderedOutput(previewFormat)}
          </pre>
        </section>
      )}

      {/* TAB 1: EXECUTIVE BRIEF */}
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
              <span className="help-inline">
                <span className="eyebrow">EXECUTIVE LAUNCH DECISION · {effectiveConfig.account.name.toUpperCase()}</span>
                <HelpTip copyKey="reports.exec.decision" />
              </span>
              <span className={`status-pill lg ${statusPillForString(execReport.masterVerdict)}`}>
                {execReport.masterVerdict.replace("_", " ")}
              </span>
            </div>
            <div style={{ fontSize: "1.22rem", fontWeight: 800, marginTop: 8 }}>
              {execReport.recommendedAction}
            </div>
            {blueprint?.input.dealScopeSummary.trim() && (
              <div style={{ fontSize: "0.86rem", color: "var(--text-secondary)", marginTop: 6 }}>
                <strong>Deal Scope:</strong> {blueprint.input.dealScopeSummary} ·{" "}
                <strong>Deployment:</strong> {DEPLOYMENT_MODEL_LABELS[blueprint.input.deploymentModel]}
              </div>
            )}
          </section>

          <div className="kpi-4-grid">
            <div className="panel kpi-box">
              <span className="help-inline">
                <span className="eyebrow">HARD STOPS ({execReport.hardStopCompliance.allHardStops.length})</span>
                <HelpTip copyKey="reports.exec.hardStops" />
              </span>
              {execReport.hardStopCompliance.allHardStops.map((hs) => (
                <div key={hs.stationCode} className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, marginTop: 2 }}>
                  {hs.stationLabel}:{" "}
                  <span style={{ color: hs.status === "NOMINAL" ? "var(--nominal-text)" : "var(--nogo-text)" }}>
                    {hs.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="panel kpi-box">
              <span className="eyebrow">GATE 1 · SETUP CHECK</span>
              <div className="mono" style={{ fontSize: "1.75rem", fontWeight: 800 }}>
                {execReport.gate1Summary.nominal}/{execReport.gate1Summary.totalStations} PASS
              </div>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {execReport.gate1Summary.waived} WAIVED · {execReport.gate1Summary.noGo} BLOCKED/PENDING
              </span>
            </div>

            <div className="panel kpi-box">
              <span className="eyebrow">GATE 2 · FAULT INJECTION</span>
              <div className="mono" style={{ fontSize: "1.75rem", fontWeight: 800 }}>
                GRADE {execReport.gate2Summary.grade}
              </div>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {execReport.gate2Summary.passedVectors}/{execReport.gate2Summary.totalVectors} TESTS PASSED
              </span>
            </div>

            <div className="panel kpi-box">
              <span className="help-inline">
                <span className="eyebrow">WAIVER EXPOSURE</span>
                <HelpTip copyKey="reports.exec.waiverExposure" />
              </span>
              <div className="mono" style={{ fontSize: "1.75rem", fontWeight: 800 }}>
                {execReport.waiverExposure.activeCount} / {execReport.waiverExposure.maxAllowed}
              </div>
              <span className="mono" style={{ fontSize: "0.74rem", color: "var(--waived-text)" }}>
                {execReport.waiverExposure.nearestExpiry
                  ? `NEAREST EXPIRY: ${execReport.waiverExposure.nearestExpiry}`
                  : "ZERO ACTIVE WAIVERS"}
              </span>
            </div>
          </div>

          {evidenceNotes.length > 0 && (
            <section className="panel panel-pad">
              <span className="eyebrow">LOGGED VERIFICATION EVIDENCE ({evidenceNotes.length})</span>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {evidenceNotes.map((row, idx) => (
                  <div key={`${row.gate}-${row.item}-${idx}`} className="customize-item-row">
                    <div>
                      <strong>
                        {row.gate} · {row.item}
                      </strong>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 2 }}>
                        {row.note}
                      </div>
                    </div>
                    <span className={`status-pill ${statusPillForString(row.status)}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: WEEKLY SPRINT DIGEST */}
      {activeTab === "digest" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="panel panel-pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <span className="help-inline">
                  <span className="eyebrow">LIVE INTEGRATION HEALTH MATRIX</span>
                  <HelpTip copyKey="reports.ops.integrationMatrix" />
                </span>
                <h3 style={{ margin: "3px 0 0", fontSize: "1.2rem", fontWeight: 800 }}>
                  {opsReport.accountName} · {opsReport.activeStageLabel}
                </h3>
              </div>
              <span className="owner-badge">
                BATON OWNER: <strong className="mono">{opsReport.accountableOwner}</strong>
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
              <span className="help-inline">
                <span className="eyebrow">OPEN GATE 1 BLOCKERS ({opsReport.stationBlockers.length})</span>
                <HelpTip copyKey="reports.ops.blockers" />
              </span>
              {opsReport.stationBlockers.length === 0 ? (
                <div style={{ marginTop: 10, color: "var(--nominal-text)", fontWeight: 800 }}>
                  All {mission.flightCheck.counts.total} Gate 1 setup checks are verified PASS.
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
              <span className="help-inline">
                <span className="eyebrow">NEXT DETERMINISTIC CLI COMMANDS</span>
                <HelpTip copyKey="reports.ops.cliCommands" />
              </span>
              <div className="wire-terminal" style={{ marginTop: 10 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 6 }}>
                  $ nominalx check --config {effectiveConfig.account.id}.nominalx.yaml
                </div>
                {opsReport.nextCommands.map((cmd) => (
                  <div key={cmd} style={{ color: "#7dd3fc", marginBottom: 6 }}>
                    $ {cmd}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {evidenceNotes.length > 0 && (
            <section className="panel panel-pad">
              <span className="eyebrow">ENGINEER EVIDENCE LOG ({evidenceNotes.length})</span>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {evidenceNotes.map((row, idx) => (
                  <div key={`${row.gate}-${row.item}-${idx}`} className="customize-item-row">
                    <div>
                      <strong>
                        {row.gate} · {row.item}
                      </strong>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 2 }}>
                        {row.note}
                      </div>
                    </div>
                    <span className={`status-pill ${statusPillForString(row.status)}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 3: HANDOVER DOSSIER */}
      {activeTab === "dossier" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section
            className={`panel certificate-hero verdict-${dossier.verdict}`}
            data-tour="reports-dossier-hero"
          >
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="help-inline">
                    <span className={`status-pill lg ${statusPillForString(dossier.verdict)}`}>
                      FLIGHT READINESS SEAL: {dossier.verdict.replace(/_/g, " ")}
                    </span>
                    <HelpTip copyKey="reports.dossier.seal" />
                  </span>
                  {mission.dossierSigned && (
                    <span className="status-pill lg status-nominal">
                      SIGNED &amp; SEALED ✓
                    </span>
                  )}
                </div>

                <h3 style={{ fontSize: "1.9rem", fontWeight: 800, margin: "12px 0 4px", letterSpacing: "-0.03em" }}>
                  {dossier.account.name} — Handover Dossier
                </h3>
                <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                  Tamper-evident (SHA-256 signed) launch readiness dossier recording every passed check,
                  active waiver, fault-injection grade, drill split, and engineer evidence note.
                </div>
              </div>

              <div className="kpi-4-grid">
                <div className="kpi-box">
                  <span className="eyebrow">GATE 1 · SETUP CHECK</span>
                  <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                    {dossier.gate1.counts.nominal + dossier.gate1.counts.heldWaived}/{dossier.gate1.counts.total}
                  </div>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {dossier.gate1.verdict}
                  </span>
                </div>
                <div className="kpi-box">
                  <span className="eyebrow">GATE 2 · FAULT INJECTION</span>
                  <div className="mono" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                    {dossier.gate2.grade} · {dossier.gate2.corruptionPct.toFixed(1)}%
                  </div>
                  <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {dossier.gate2.totals.passedVectors}/{dossier.gate2.totals.totalVectors} TESTS
                  </span>
                </div>
                <div className="kpi-box">
                  <span className="eyebrow">GATE 3 · INCIDENT DRILL</span>
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
                <span className="help-inline">
                  <span className="eyebrow">DETERMINISTIC SHA-256 VERIFICATION DIGEST</span>
                  <HelpTip copyKey="reports.dossier.sha256" />
                </span>
                <code
                  className="mono"
                  style={{ fontSize: "0.74rem", color: "var(--active-text)", wordBreak: "break-all" }}
                  data-testid="dossier-sha256-digest"
                >
                  {dossier.verificationDigest}
                </code>
              </div>
            </div>

            <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="help-inline">
                  <span className="eyebrow">HANDOVER SPRINT SIGN-OFF BLOCK</span>
                  <HelpTip copyKey="reports.dossier.signoff" />
                </span>
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

          {/* Active Waivers & Hard Stop Attestation Summary inside Dossier */}
          <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--nogo-text)" }}>
                <ShieldLockIcon size={18} />
                <span className="eyebrow" style={{ color: "var(--nogo-text)" }}>
                  HARD STOP POLICY ATTESTATION &amp; ACTIVE WAIVERS ({dossier.gate1.waiverAudit.activeWaivers.length}/2)
                </span>
              </div>
              <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                NON-WAIVABLE: {dossier.scopeSummary.hardStopsEnforced.join(", ") || "None"}
              </span>
            </div>

            {dossier.gate1.waiverAudit.activeWaivers.length === 0 ? (
              <div style={{ fontSize: "0.86rem", color: "var(--nominal-text)", fontWeight: 700 }}>
                Zero active Operational Waivers. All non-waivable Hard Stops enforced.
              </div>
            ) : (
              dossier.gate1.waiverAudit.activeWaivers.map((w) => (
                <div
                  key={`${w.stationLabel}-${w.expiresAt}`}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--waived-bg)",
                    border: "1px solid var(--waived-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong className="mono">{w.stationLabel}</strong> · Owner:{" "}
                    <span className="mono">{w.owner}</span>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 2 }}>
                      {w.reason} — Rollback: {w.rollbackPlan}
                    </div>
                  </div>
                  <span className="status-pill status-waived">
                    EXP {w.expiresAt} ({w.daysRemaining ?? 0}d LEFT)
                  </span>
                </div>
              ))
            )}

            {evidenceNotes.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <span className="eyebrow">CAPTURED EVIDENCE NOTES ({evidenceNotes.length})</span>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  {evidenceNotes.map((row, idx) => (
                    <div key={`${row.gate}-${row.item}-${idx}`} className="mono" style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      <strong>[{row.gate} · {row.item}]</strong> {row.note}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: CUSTOMER ON-CALL RUNBOOK */}
      {activeTab === "runbook" && (
        <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <span className="help-inline">
                <span className="eyebrow">AUTO-GENERATED STAGE 5 SUPPORT &amp; SRE HANDOFF</span>
                <HelpTip copyKey="reports.dossier.runbook" />
              </span>
              <h3 style={{ margin: "3px 0 0", fontSize: "1.35rem", fontWeight: 800 }}>
                Customer On-Call Runbook — {dossier.account.name}
              </h3>
            </div>
            <div className="stack-chips">
              <span className="stack-chip">{dossier.runbook.verifiedBaselines.authProtocol.toUpperCase()}</span>
              <span className="stack-chip">REGIONS: {dossier.runbook.verifiedBaselines.allowedRegions.join(", ")}</span>
              <span className="stack-chip">{dossier.runbook.verifiedBaselines.guaranteedRps.toLocaleString("en-US")} RPS</span>
              <span className="stack-chip">P1: {dossier.runbook.verifiedBaselines.p1Channel}</span>
              <span className="stack-chip">RTO &le; {dossier.runbook.verifiedBaselines.maxRtoMinutes}m</span>
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
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.78rem", color: "var(--text-muted)", display: "grid", gap: 4 }}>
                  {section.verificationSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {evidenceNotes.length > 0 && (
            <div className="customize-section">
              <span className="eyebrow">DAY-1 VERIFICATION EVIDENCE NOTES ({evidenceNotes.length})</span>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {evidenceNotes.map((row, idx) => (
                  <div key={`${row.gate}-${row.item}-${idx}`} style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    <strong>{row.gate} · {row.item}</strong> ({row.status}): {row.note}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
