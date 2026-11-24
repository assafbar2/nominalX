import {
  LIFECYCLE_STAGES,
  type JourneyState,
  type StageMetadata,
  type StageNumber,
} from "@nominalx/core";
import { getStageHelp } from "../data/helpCopy";
import type { CockpitView } from "../state/missionState";
import { HelpTip } from "./HelpTip";

interface JourneyPipelineProps {
  journey: JourneyState;
  activeView: CockpitView;
  onSelectView: (view: CockpitView) => void;
  onOpenStageContext: (stage: StageNumber) => void;
}

function verdictPillClass(verdict: JourneyState["masterVerdict"]): string {
  if (verdict === "NOMINAL") return "status-nominal";
  if (verdict === "CONDITIONAL_GO") return "status-waived";
  return "status-nogo";
}

function verdictLabel(verdict: JourneyState["masterVerdict"]): string {
  if (verdict === "CONDITIONAL_GO") return "CONDITIONAL GO";
  if (verdict === "NO_GO") return "NO-GO";
  return "NOMINAL";
}

export function JourneyPipeline({
  journey,
  activeView,
  onSelectView,
  onOpenStageContext,
}: JourneyPipelineProps) {
  const handleStageClick = (stageNum: StageNumber) => {
    if (stageNum === 2) {
      onSelectView("gate1");
    } else if (stageNum === 3) {
      onSelectView("gate2");
    } else if (stageNum === 4) {
      onSelectView("gate3");
    } else {
      onOpenStageContext(stageNum);
    }
  };

  const dealCloseStage = LIFECYCLE_STAGES[0]!;
  const gateStages = LIFECYCLE_STAGES.slice(1, 4);
  const supportStage = LIFECYCLE_STAGES[4]!;
  const renewalStage = LIFECYCLE_STAGES[5]!;

  const renderBookendNode = (
    stage: StageMetadata,
    tagLabel: string,
    subtitle: string,
  ) => {
    const st = journey.stageStatus[stage.stageNumber];
    return (
      <button
        key={stage.stageNumber}
        type="button"
        className={`stage-node stage-bookend status-border-${st.status}`}
        onClick={() => handleStageClick(stage.stageNumber)}
        data-testid={`journey-stage-${stage.stageNumber}`}
      >
        <div>
          <div className="stage-node-top">
            <span className="stage-bookend-tag">{tagLabel}</span>
            <HelpTip
              asSpan
              entry={getStageHelp(stage.stageNumber)}
              testId={`help-tip-pipeline.stage.${stage.stageNumber}`}
            />
          </div>
          <div className="stage-name" style={{ marginTop: 8 }}>
            {stage.stageName}
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              marginTop: 4,
              lineHeight: 1.3,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div>
          <div className="stage-owner-line">{st.accountableOwner}</div>
          <div
            className="led-strip"
            aria-label={`${stage.stageName} status indicators`}
          >
            {st.pips.map((pip, idx) => (
              <span
                key={`${stage.stageNumber}-${idx}`}
                className={`led-pip ${pip.status}`}
                title={`${pip.label}: ${pip.status}`}
              />
            ))}
          </div>
        </div>
      </button>
    );
  };

  return (
    <section
      className="panel journey-panel"
      aria-label="Customer Engineering Journey from Deal Close through NominalX Gates 1 to 3 to Support and Renewal"
      data-tour="journey-pipeline"
    >
      <div className="journey-header">
        <div className="journey-title-wrap">
          <span className="help-inline">
            <span className="eyebrow">
              CUSTOMER ENGINEERING JOURNEY · DEAL CLOSE → GATES 1–3 → SUPPORT &amp; RENEWAL
            </span>
            <HelpTip copyKey="pipeline.header" />
          </span>
          <span className="help-inline">
            <span className="gap-chip">THE IN-BETWEEN GAP · NOMINALX (GATES 1–3)</span>
            <HelpTip copyKey="pipeline.unverifiedGap" />
          </span>
        </div>

        <div className="journey-controls" data-tour="journey-verdict-controls">
          <div className="owner-badge">
            <span className="eyebrow" style={{ color: "var(--text-dim)" }}>
              BATON OWNER
            </span>
            <span className="mono" style={{ color: "var(--active-text)" }}>
              {journey.accountableOwner}
            </span>
            <HelpTip copyKey="pipeline.batonOwner" />
          </div>

          <span className="help-inline">
            <span
              className={`status-pill lg ${verdictPillClass(journey.masterVerdict)}`}
              data-testid="master-launch-pill"
            >
              MASTER: {verdictLabel(journey.masterVerdict)}
            </span>
            <HelpTip copyKey="pipeline.masterVerdict" />
          </span>

          <div className="help-control-wrap">
            <button
              type="button"
              className={`btn ${activeView === "reports" ? "btn-primary" : ""}`}
              onClick={() => onSelectView("reports")}
              data-testid="nav-reports-dossier"
            >
              <span>Live Launch Deliverables</span>
            </button>
            <HelpTip copyKey="deliverables.header" />
          </div>
        </div>
      </div>

      {/* Unnumbered Bookends (Deal Close / Support + Renewal) flanking the Highlighted Center Gap (Gate 1 · Gate 2 · Gate 3) */}
      <div className="journey-bookend-layout" data-tour="journey-stages-grid">
        {/* Left Unnumbered Bookend: Deal Close */}
        <div className="journey-bookend-col">
          <div className="journey-col-eyebrow mono">BEFORE NOMINALX</div>
          {renderBookendNode(
            dealCloseStage,
            "CRM HANDOFF",
            "Before Launch Readiness · nominalx.yaml contract seed",
          )}
        </div>

        {/* Center Highlighted Enclosure: The Unverified Gap (Gate 1, Gate 2, Gate 3) */}
        <div className="journey-gap-enclosure" data-testid="journey-gap-enclosure">
          <div className="journey-gap-enclosure-head">
            <span className="mono journey-gap-enclosure-title">
              THE UNVERIFIED GAP · NOMINALX LAUNCH READINESS — BRIDGING DEAL CLOSE TO LIVE OPERATIONS
            </span>
            <span className="mono journey-gap-enclosure-sub">
              ONLY NUMBERED STAGES: GATE 1 → GATE 2 → GATE 3
            </span>
          </div>

          <div className="journey-gates-row">
            {gateStages.map((stage) => {
              const st = journey.stageStatus[stage.stageNumber];
              const isSelected =
                (stage.gateNumber === 1 && activeView === "gate1") ||
                (stage.gateNumber === 2 && activeView === "gate2") ||
                (stage.gateNumber === 3 && activeView === "gate3");

              const gateTitle =
                stage.gateNumber === 1
                  ? "Flight Check · Setup Check"
                  : stage.gateNumber === 2
                    ? "Static Fire · Fault Injection"
                    : "Crew Drill · Live Incident Drill";

              const gateSubRange =
                stage.gateNumber === 1
                  ? `${stage.stageName} (1–${st.pips.length}/${st.pips.length})`
                  : stage.gateNumber === 2
                    ? `${stage.stageName} (1–${st.pips.length}/${st.pips.length})`
                    : `${stage.stageName} (1–${Math.max(1, st.pips.length - 1)}/${Math.max(1, st.pips.length - 1)})`;

              const gatePlainDesc =
                stage.gateNumber === 1
                  ? "Proving staging matches what Sales sold."
                  : stage.gateNumber === 2
                    ? "Controlled fault injection to prove zero corruption."
                    : "Timed P1 alert rehearsal for Support and Customer SREs.";

              const sprintTag =
                stage.gateNumber === 1
                  ? "SPRINT 1"
                  : stage.gateNumber === 2
                    ? "SPRINT 2"
                    : "SPRINT 3";

              return (
                <button
                  key={stage.stageNumber}
                  type="button"
                  className={`stage-node in-gap ${isSelected ? "is-selected" : ""} status-border-${st.status}`}
                  onClick={() => handleStageClick(stage.stageNumber)}
                  data-testid={`journey-stage-${stage.stageNumber}`}
                >
                  <div>
                    <div className="stage-node-top">
                      <span className="stage-gate-num">GATE {stage.gateNumber}</span>
                      <div className="help-inline" style={{ gap: 5 }}>
                        <span className="stage-gate-tag">{sprintTag}</span>
                        <HelpTip
                          asSpan
                          entry={getStageHelp(stage.stageNumber)}
                          testId={`help-tip-pipeline.stage.${stage.stageNumber}`}
                        />
                      </div>
                    </div>
                    <div className="stage-name" style={{ marginTop: 6 }}>
                      {gateTitle}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "0.68rem",
                        color: "var(--active-text)",
                        fontWeight: 700,
                        marginTop: 3,
                        lineHeight: 1.25,
                      }}
                    >
                      {gateSubRange}
                    </div>
                    <div
                      style={{
                        fontSize: "0.69rem",
                        color: "var(--text-muted)",
                        marginTop: 3,
                        lineHeight: 1.3,
                      }}
                    >
                      {gatePlainDesc}
                    </div>
                  </div>

                  <div>
                    <div className="stage-owner-line">{st.accountableOwner}</div>
                    <div
                      className="led-strip"
                      aria-label={`Gate ${stage.gateNumber} status indicators`}
                    >
                      {st.pips.map((pip, idx) => (
                        <span
                          key={`${stage.stageNumber}-${idx}`}
                          className={`led-pip ${pip.status}`}
                          title={`${pip.label}: ${pip.status}`}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Unnumbered Bookends: Support & Renewal */}
        <div className="journey-bookend-col journey-bookend-right-col">
          <div className="journey-col-eyebrow mono">AFTER NOMINALX</div>
          <div className="journey-bookend-right-pair">
            {renderBookendNode(
              supportStage,
              "LIVE OPERATIONS",
              "Day-1 Runbook & Waiver Closure",
            )}
            {renderBookendNode(
              renewalStage,
              "CUSTOMER GROWTH",
              "Longitudinal Telemetry · Expansion → Gate 1",
            )}
          </div>
        </div>
      </div>

      {/* Explicit Bracket Framing The In-Between Gap */}
      <div className="gap-bracket-row" data-tour="journey-gap-bracket">
        <div
          className="mono"
          style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "center" }}
        >
          BEFORE · CLICK DEAL CLOSE
        </div>
        <div className="gap-bracket-bar">
          <span>◄━━</span>
          <span>THE IN-BETWEEN GAP · GATE 1 → GATE 2 → GATE 3 + SIGNED HANDOVER</span>
          <span>━━►</span>
        </div>
        <div
          className="mono"
          style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "center" }}
        >
          AFTER · CLICK SUPPORT OR RENEWAL
        </div>
      </div>
    </section>
  );
}
