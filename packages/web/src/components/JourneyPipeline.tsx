import {
  LIFECYCLE_STAGES,
  type JourneyState,
  type StageNumber,
} from "@nominalx/core";
import type { CockpitView } from "../state/missionState";

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

  return (
    <section className="panel journey-panel" aria-label="Customer Lifecycle Stages 1 to 6">
      <div className="journey-header">
        <div className="journey-title-wrap">
          <span className="eyebrow">CUSTOMER LIFECYCLE PIPELINE · STAGES 1 → 6</span>
          <span className="gap-chip">THE UNVERIFIED GAP: STAGES 2 → 4</span>
        </div>

        <div className="journey-controls">
          <div className="owner-badge" title="Current Single Accountable Engineering Owner">
            <span className="eyebrow" style={{ color: "var(--text-dim)" }}>
              BATON OWNER
            </span>
            <span className="mono" style={{ color: "var(--active-text)" }}>
              {journey.accountableOwner}
            </span>
          </div>

          <span
            className={`status-pill lg ${verdictPillClass(journey.masterVerdict)}`}
            data-testid="master-launch-pill"
          >
            MASTER: {verdictLabel(journey.masterVerdict)}
          </span>

          <button
            type="button"
            className={`btn ${activeView === "reports" ? "btn-primary" : ""}`}
            onClick={() => onSelectView("reports")}
            data-testid="nav-reports-dossier"
          >
            <span>Reports &amp; Handover Dossier</span>
          </button>
        </div>
      </div>

      {/* Vector Pipeline Conduit SVG */}
      <svg
        viewBox="0 0 1200 26"
        preserveAspectRatio="none"
        style={{ width: "100%", height: 22, display: "block", marginBottom: 8 }}
        aria-hidden="true"
      >
        {/* Full track line */}
        <line
          x1="40"
          y1="13"
          x2="1160"
          y2="13"
          stroke="var(--border-strong)"
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />
        {/* Highlighted Unverified Gap conduit (Stages 2 -> 4) */}
        <rect
          x="165"
          y="3"
          width="705"
          height="20"
          rx="10"
          fill="var(--active-bg)"
          stroke="var(--active)"
          strokeWidth="1.5"
        />
        <line
          x1="180"
          y1="13"
          x2="855"
          y2="13"
          stroke="var(--active)"
          strokeWidth="3"
        />
        {/* Stage node ticks */}
        {[85, 290, 520, 755, 960, 1115].map((cx, i) => {
          const stNum = (i + 1) as StageNumber;
          const st = journey.stageStatus[stNum].status;
          const fill =
            st === "NOMINAL" || st === "READY"
              ? "var(--nominal)"
              : st === "NO_GO"
                ? "var(--nogo)"
                : st === "CONDITIONAL_GO"
                  ? "var(--waived)"
                  : st === "ACTIVE"
                    ? "var(--active)"
                    : "var(--pending)";
          return (
            <g key={stNum}>
              <circle cx={cx} cy="13" r="6.5" fill={fill} stroke="var(--bg-surface)" strokeWidth="2" />
            </g>
          );
        })}
      </svg>

      {/* 6 Bold Interactive Stage Nodes */}
      <div className="journey-grid">
        {LIFECYCLE_STAGES.map((stage) => {
          const st = journey.stageStatus[stage.stageNumber];
          const isSelected =
            (stage.stageNumber === 2 && activeView === "gate1") ||
            (stage.stageNumber === 3 && activeView === "gate2") ||
            (stage.stageNumber === 4 && activeView === "gate3");

          const gateChip =
            stage.gateNumber === 1
              ? "GATE 1 (1/3)"
              : stage.gateNumber === 2
                ? "GATE 2 (2/3)"
                : stage.gateNumber === 3
                  ? "GATE 3 (3/3)"
                  : stage.stageNumber === 1
                    ? "SEED"
                    : "POST-GAP";

          return (
            <button
              key={stage.stageNumber}
              type="button"
              className={`stage-node ${stage.inUnverifiedGap ? "in-gap" : ""} ${isSelected ? "is-selected" : ""} status-border-${st.status}`}
              onClick={() => handleStageClick(stage.stageNumber)}
              data-testid={`journey-stage-${stage.stageNumber}`}
            >
              <div>
                <div className="stage-node-top">
                  <span className="stage-num">0{stage.stageNumber}</span>
                  <span className="stage-gate-tag">{gateChip}</span>
                </div>
                <div className="stage-name" style={{ marginTop: 6 }}>
                  Stage {stage.stageNumber}: {stage.stageName}
                </div>
                {stage.gateLabel && (
                  <div
                    className="mono"
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--active-text)",
                      fontWeight: 700,
                      marginTop: 3,
                    }}
                  >
                    {stage.gateNumber === 1
                      ? `Flight Check (1–${st.pips.length}/${st.pips.length})`
                      : stage.gateNumber === 2
                        ? `Static Fire (1–${st.pips.length}/${st.pips.length})`
                        : `Crew Drill (1–${Math.max(1, st.pips.length - 1)}/${Math.max(1, st.pips.length - 1)}) + Seal`}
                  </div>
                )}
              </div>

              <div>
                <div className="stage-owner-line">{st.accountableOwner}</div>
                <div className="led-strip" aria-label={`Stage ${stage.stageNumber} status indicators`}>
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

      {/* Explicit Bracket Framing The Unverified Gap */}
      <div className="gap-bracket-row">
        <div
          className="mono"
          style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "center" }}
        >
          PRE-GAP · CLICK STAGE 1
        </div>
        <div className="gap-bracket-bar">
          <span>◄━━</span>
          <span>THE UNVERIFIED GAP (STAGES 2 → 4) · 3 DETERMINISTIC SPRINTS + SIGNED HANDOVER</span>
          <span>━━►</span>
        </div>
        <div
          className="mono"
          style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "center" }}
        >
          POST-GAP · CLICK STAGE 5 OR 6
        </div>
      </div>
    </section>
  );
}
