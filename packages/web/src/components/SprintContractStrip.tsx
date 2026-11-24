import {
  getStageMetadata,
  HANDOVER_SPRINT_METADATA,
  type StageMetadata,
  type StageNumber,
} from "@nominalx/core";
import { HelpTip } from "./HelpTip";
import { ShieldLockIcon } from "./Icons";

interface SprintContractStripProps {
  stageNumber: StageNumber;
  isReportsView?: boolean;
  onOpenGovernanceDrawer: () => void;
}

export function SprintContractStrip({
  stageNumber,
  isReportsView = false,
  onOpenGovernanceDrawer,
}: SprintContractStripProps) {
  const stage = getStageMetadata(stageNumber);

  const goal = isReportsView ? HANDOVER_SPRINT_METADATA.goal : stage.goal;
  const owner = isReportsView
    ? HANDOVER_SPRINT_METADATA.singleAccountableOwner
    : stage.singleAccountableOwner;
  const teamCount = isReportsView
    ? HANDOVER_SPRINT_METADATA.vendorEngineers.length +
      HANDOVER_SPRINT_METADATA.customerEngineers.length
    : stage.vendorEngineers.length + stage.customerEngineers.length;
  const integrationsCount = isReportsView
    ? HANDOVER_SPRINT_METADATA.integrations.length
    : stage.integrations.length;
  const trigger = isReportsView
    ? HANDOVER_SPRINT_METADATA.trigger
    : stage.trigger;
  const doneWhen = isReportsView
    ? HANDOVER_SPRINT_METADATA.definitionOfDone[0] ?? ""
    : stage.definitionOfDone[0] ?? "";

  return (
    <section
      className="sprint-strip"
      aria-label="Sprint Contract Summary"
      data-tour="sprint-contract"
    >
      <div className="sprint-tiles-group" data-tour="sprint-contract-tiles">
        <div className="sprint-tile">
          <span className="help-inline">
            <span className="eyebrow">GOAL</span>
            <HelpTip copyKey="sprint.goal" />
          </span>
          <div className="sprint-tile-value">{goal}</div>
        </div>

        <div className="sprint-tile">
          <span className="help-inline">
            <span className="eyebrow">SINGLE OWNER</span>
            <HelpTip copyKey="sprint.owner" />
          </span>
          <div className="sprint-tile-value" style={{ color: "var(--active-text)" }}>
            {owner}
          </div>
          <div className="sprint-tile-sub mono">
            {isReportsView ? HANDOVER_SPRINT_METADATA.timeBox : stage.timeBox}
          </div>
        </div>

        <div className="sprint-tile">
          <span className="help-inline">
            <span className="eyebrow">TEAM &amp; INTEGRATIONS</span>
            <HelpTip copyKey="sprint.team" />
          </span>
          <div className="sprint-tile-value">
            {teamCount} Engineering Roles · {integrationsCount} Integrations
          </div>
          <div className="sprint-tile-sub">
            Vendor + Customer Engineers paired
          </div>
        </div>

        <div className="sprint-tile">
          <span className="help-inline">
            <span className="eyebrow">TRIGGER</span>
            <HelpTip copyKey="sprint.trigger" />
          </span>
          <div className="sprint-tile-value">{trigger}</div>
        </div>

        <div className="sprint-tile">
          <span className="help-inline">
            <span className="eyebrow">DONE WHEN</span>
            <HelpTip copyKey="sprint.doneWhen" />
          </span>
          <div className="sprint-tile-value">{doneWhen}</div>
        </div>
      </div>

      <button
        type="button"
        className="btn"
        style={{
          position: "relative",
          flexDirection: "column",
          padding: "12px 16px",
          borderColor: "var(--active-border)",
          background: "var(--active-bg)",
          color: "var(--active-text)",
        }}
        onClick={onOpenGovernanceDrawer}
        data-testid="open-scope-governance-btn"
        data-tour="sprint-governance-btn"
      >
        <span style={{ position: "absolute", top: 6, right: 6 }}>
          <HelpTip asSpan copyKey="sprint.scopeGovernanceBtn" />
        </span>
        <ShieldLockIcon size={20} />
        <span style={{ fontSize: "0.78rem" }}>Scope &amp;</span>
        <span style={{ fontSize: "0.78rem" }}>Governance</span>
      </button>
    </section>
  );
}

interface ScopeGovernanceDrawerProps {
  stage: StageMetadata | null;
  onClose: () => void;
}

export function ScopeGovernanceDrawer({
  stage,
  onClose,
}: ScopeGovernanceDrawerProps) {
  if (!stage) return null;

  return (
    <div
      className="overlay-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${stage.displayTitle} Scope and Governance`}
      data-testid="scope-governance-drawer"
    >
      <div className="drawer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="help-inline">
              <div className="eyebrow">
                {stage.inUnverifiedGap
                  ? `THE UNVERIFIED GAP · ${stage.sprintLabel.toUpperCase()}`
                  : stage.sprintLabel.toUpperCase()}
              </div>
              <HelpTip copyKey="governance.header" />
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: "1.3rem", fontWeight: 800 }}>
              {stage.gateLabel
                ? `${stage.gateLabel} — ${stage.stageName}`
                : stage.displayTitle}
            </h2>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          {/* Owner & Timebox */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="kpi-box">
              <span className="help-inline">
                <span className="eyebrow">SINGLE ACCOUNTABLE OWNER</span>
                <HelpTip copyKey="governance.owner" />
              </span>
              <div style={{ fontWeight: 800, color: "var(--active-text)", fontSize: "0.95rem" }}>
                {stage.singleAccountableOwner}
              </div>
            </div>
            <div className="kpi-box">
              <span className="help-inline">
                <span className="eyebrow">SPRINT TIMEBOX</span>
                <HelpTip copyKey="governance.timebox" />
              </span>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{stage.timeBox}</div>
            </div>
          </div>

          {/* Hard Stops */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              background: "var(--nogo-bg)",
              border: "1.5px solid var(--nogo-border)",
            }}
          >
            <div
              className="eyebrow"
              style={{ color: "var(--nogo-text)", display: "flex", alignItems: "center", gap: 6 }}
            >
              <ShieldLockIcon size={15} />
              <span>NON-NEGOTIABLE HARD STOPS</span>
              <HelpTip copyKey="governance.hardStops" />
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "0.86rem", display: "grid", gap: 5 }}>
              {stage.hardStops.map((hs) => (
                <li key={hs}>{hs}</li>
              ))}
            </ul>
          </div>

          {/* Strict In-Scope vs Out-of-Scope */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: "var(--nominal-bg)",
                border: "1px solid var(--nominal-border)",
              }}
            >
              <div className="help-inline">
                <div className="eyebrow" style={{ color: "var(--nominal-text)" }}>
                  STRICTLY IN-SCOPE
                </div>
                <HelpTip copyKey="governance.inScope" />
              </div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: "0.82rem", display: "grid", gap: 6 }}>
                {stage.inScope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-strong)",
              }}
            >
              <div className="help-inline">
                <div className="eyebrow" style={{ color: "var(--waived-text)" }}>
                  EXPLICITLY OUT-OF-SCOPE
                </div>
                <HelpTip copyKey="governance.outOfScope" />
              </div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: "0.82rem", display: "grid", gap: 6 }}>
                {stage.outOfScope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Engineer Roster */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="kpi-box">
              <span className="help-inline">
                <span className="eyebrow">CUSTOMER-FACING ENGINEERS (VENDOR)</span>
                <HelpTip copyKey="governance.vendorEngineers" />
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {stage.vendorEngineers.map((eng) => (
                  <span key={eng} className="stack-chip">
                    {eng}
                  </span>
                ))}
              </div>
            </div>
            <div className="kpi-box">
              <span className="help-inline">
                <span className="eyebrow">CUSTOMER ENGINEERS</span>
                <HelpTip copyKey="governance.customerEngineers" />
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {stage.customerEngineers.map((eng) => (
                  <span key={eng} className="stack-chip">
                    {eng}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Connected Integrations Matrix */}
          <div className="kpi-box">
            <span className="help-inline">
              <span className="eyebrow">CONNECTED INTEGRATIONS MATRIX</span>
              <HelpTip copyKey="governance.integrations" />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {stage.integrations.map((intg) => (
                <div
                  key={intg.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: "0.84rem" }}>{intg.name}</strong>
                    <span className="mono" style={{ fontSize: "0.7rem", color: "var(--active-text)" }}>
                      {intg.ownerSide.toUpperCase()}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 3 }}>
                    {intg.protocolOrInterface}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resources & Definition of Done */}
          <div className="kpi-box">
            <span className="help-inline">
              <span className="eyebrow">REQUIRED RESOURCES</span>
              <HelpTip copyKey="governance.resources" />
            </span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "0.84rem", display: "grid", gap: 4 }}>
              {stage.resources.map((res) => (
                <li key={res}>{res}</li>
              ))}
            </ul>
          </div>

          <div className="kpi-box">
            <span className="help-inline">
              <span className="eyebrow">DEFINITION OF DONE</span>
              <HelpTip copyKey="governance.dod" />
            </span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "0.84rem", display: "grid", gap: 5 }}>
              {stage.definitionOfDone.map((dod) => (
                <li key={dod}>{dod}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
