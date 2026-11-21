import type { AccountPreset } from "@nominalx/core";
import {
  computeReadinessScore,
  getEffectiveConfigForMission,
  type AccountMissionState,
  type CockpitView,
} from "../state/missionState";
import { ShieldLockIcon } from "./Icons";

interface HeroReadinessBandProps {
  preset: AccountPreset;
  mission: AccountMissionState;
  activeView: CockpitView;
  onSelectView: (view: CockpitView) => void;
}

function RadialReadinessGauge({
  score,
  hardStopBlocked,
  verdict,
}: {
  score: number;
  hardStopBlocked: boolean;
  verdict: string;
}) {
  const radius = 64;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const arcSpan = circumference * 0.75; // 270 degrees
  const filled = arcSpan * (Math.max(0, Math.min(100, score)) / 100);
  const strokeColor = hardStopBlocked
    ? "var(--nogo)"
    : score === 100
      ? "var(--nominal)"
      : score >= 75
        ? "var(--waived)"
        : "var(--active)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="172" height="146" viewBox="0 0 172 146" aria-label={`Flight readiness ${score}%`}>
        <g transform="translate(86, 82) rotate(135)">
          <circle
            r={radius}
            cx="0"
            cy="0"
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={stroke}
            strokeDasharray={`${arcSpan} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            r={radius}
            cx="0"
            cy="0"
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease" }}
          />
        </g>
        {[0, 25, 50, 75, 100].map((pct) => {
          const deg = 135 + (pct / 100) * 270;
          const rad = (deg * Math.PI) / 180;
          const x1 = 86 + Math.cos(rad) * 49;
          const y1 = 82 + Math.sin(rad) * 49;
          const x2 = 86 + Math.cos(rad) * 54;
          const y2 = 82 + Math.sin(rad) * 54;
          return (
            <line
              key={pct}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--text-dim)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}
        <text
          x="86"
          y="84"
          textAnchor="middle"
          fill="var(--text-primary)"
          className="mono"
          style={{ fontSize: "2.05rem", fontWeight: 800 }}
        >
          {score}%
        </text>
        <text
          x="86"
          y="102"
          textAnchor="middle"
          fill="var(--text-muted)"
          className="mono"
          style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em" }}
        >
          READINESS INDEX
        </text>
      </svg>
      <span
        className={`status-pill ${hardStopBlocked ? "status-nogo" : score === 100 ? "status-nominal" : score >= 75 ? "status-waived" : "status-active"}`}
        style={{ fontSize: "0.68rem", padding: "4px 10px" }}
      >
        {hardStopBlocked ? "HARD STOP LOCK" : verdict}
      </span>
    </div>
  );
}

export function HeroReadinessBand({
  preset,
  mission,
  activeView,
  onSelectView,
}: HeroReadinessBandProps) {
  const { flightCheck, staticFire, crewSummary } = mission;
  const effectiveConfig = getEffectiveConfigForMission(preset, mission);
  const account = effectiveConfig.account;
  const score = computeReadinessScore(mission);
  const hardStopFailingStations = flightCheck.stations.filter(
    (s) => s.isHardStop && s.status !== "NOMINAL",
  );
  const hardStopBlocked = hardStopFailingStations.length > 0;

  const g1Cleared = flightCheck.counts.nominal + flightCheck.counts.heldWaived;
  const g1Pill =
    flightCheck.verdict === "NOMINAL"
      ? "status-nominal"
      : flightCheck.verdict === "CONDITIONAL_GO"
        ? "status-waived"
        : "status-nogo";

  const g2Pill = staticFire.passed ? "status-nominal" : "status-nogo";
  const g3Pill = crewSummary.allStabilized
    ? crewSummary.overtimeCount > 0
      ? "status-waived"
      : "status-nominal"
    : crewSummary.stabilizedCount > 0
      ? "status-active"
      : "status-pending";

  const overallLabel =
    flightCheck.passed && staticFire.passed && crewSummary.allStabilized
      ? flightCheck.waiverAudit.activeWaivers.length > 0
        ? "CONDITIONAL GO"
        : "NOMINAL"
      : "IN PROGRESS";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Hard Stop Lock Banner when AUTH/SSO or RESIDENCY is red */}
      {hardStopBlocked && (
        <div
          className="hard-stop-banner"
          role="alert"
          data-testid="hard-stop-lock-banner"
        >
          <div className="hard-stop-banner-left">
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: "var(--nogo)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ShieldLockIcon size={24} />
            </div>
            <div>
              <div className="hard-stop-title">
                HARD STOP LOCK ACTIVE · NON-WAIVABLE SECURITY / COMPLIANCE BOUNDARY
              </div>
              <div className="hard-stop-sub">
                <strong>
                  {hardStopFailingStations
                    .map((s) => `${s.subStage} ${s.stationLabel}`)
                    .join(" & ")}
                </strong>{" "}
                failed live telemetry. Risk Waivers are strictly forbidden on Hard Stop stations — remediate live staging telemetry to unlock launch.
              </div>
            </div>
          </div>
          {activeView !== "gate1" && (
            <button
              type="button"
              className="btn btn-nogo"
              onClick={() => onSelectView("gate1")}
            >
              Inspect Gate 1 Hard Stop
            </button>
          )}
        </div>
      )}

      {/* Main Hero Grid: Account + 3 Huge Gate Score Cards + SVG Radial Gauge */}
      <div className="hero-grid">
        <div className="panel hero-account-card">
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="eyebrow">
                {account.tier ?? "Enterprise"} · {account.industry ?? "Production"}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: "0.74rem",
                  color: "var(--active-text)",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                GO-LIVE {account.target_go_live}
              </span>
            </div>
            <h1 className="account-name-xl" style={{ marginTop: 6 }}>
              {account.name}
            </h1>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
              {preset.tagline}
            </div>
          </div>

          <div className="stack-chips">
            <span className="stack-chip">CLOUD: {account.stack.cloud.toUpperCase()}</span>
            <span className="stack-chip">IDP: {account.stack.idp.toUpperCase()}</span>
            <span className="stack-chip">RUNTIME: {account.stack.webhook_runtime}</span>
            <span className="stack-chip">P1: {account.stack.alerting}</span>
          </div>
        </div>

        {/* Gate 1 Score Card */}
        <button
          type="button"
          className={`gate-score-card ${activeView === "gate1" ? "active-card" : ""}`}
          onClick={() => onSelectView("gate1")}
          data-testid="hero-gate1-card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span className="eyebrow">STAGE 2 · GATE 1 (1/3)</span>
            <span className={`status-pill ${g1Pill}`}>
              {flightCheck.verdict.replace("_", " ")}
            </span>
          </div>
          <div>
            <div className="kpi-xl" style={{ color: flightCheck.passed ? "var(--nominal-text)" : "var(--nogo-text)" }}>
              {g1Cleared}
              <span style={{ fontSize: "1.25rem", color: "var(--text-dim)" }}>/{flightCheck.counts.total}</span>
            </div>
            <div style={{ fontSize: "0.86rem", fontWeight: 800, marginTop: 4 }}>
              Flight Check
            </div>
          </div>
          <div className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            {flightCheck.counts.nominal} NOMINAL · {flightCheck.counts.heldWaived} WAIVED · {flightCheck.counts.noGo} NO-GO
          </div>
        </button>

        {/* Gate 2 Score Card */}
        <button
          type="button"
          className={`gate-score-card ${activeView === "gate2" ? "active-card" : ""}`}
          onClick={() => onSelectView("gate2")}
          data-testid="hero-gate2-card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span className="eyebrow">STAGE 3 · GATE 2 (2/3)</span>
            <span className={`status-pill ${g2Pill}`}>
              GRADE {staticFire.grade}
            </span>
          </div>
          <div>
            <div
              className="kpi-xl"
              style={{ color: staticFire.passed ? "var(--nominal-text)" : "var(--nogo-text)" }}
            >
              {staticFire.corruptionPct.toFixed(1)}%
            </div>
            <div style={{ fontSize: "0.86rem", fontWeight: 800, marginTop: 4 }}>
              Static Fire Corruption
            </div>
          </div>
          <div className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            {staticFire.totals.passedVectors}/{staticFire.totals.totalVectors} VECTORS · ATTEMPT #{staticFire.attemptNumber}
          </div>
        </button>

        {/* Gate 3 Score Card */}
        <button
          type="button"
          className={`gate-score-card ${activeView === "gate3" ? "active-card" : ""}`}
          onClick={() => onSelectView("gate3")}
          data-testid="hero-gate3-card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span className="eyebrow">STAGE 4 · GATE 3 (3/3)</span>
            <span className={`status-pill ${g3Pill}`}>
              {crewSummary.allStabilized ? "STABILIZED" : `${crewSummary.stabilizedCount}/${crewSummary.totalAlarms} LIVE`}
            </span>
          </div>
          <div>
            <div
              className="kpi-xl"
              style={{
                color: crewSummary.allStabilized
                  ? "var(--nominal-text)"
                  : crewSummary.stabilizedCount > 0
                    ? "var(--active-text)"
                    : "var(--text-primary)",
              }}
            >
              {crewSummary.stabilizedCount}
              <span style={{ fontSize: "1.25rem", color: "var(--text-dim)" }}>/{crewSummary.totalAlarms}</span>
            </div>
            <div style={{ fontSize: "0.86rem", fontWeight: 800, marginTop: 4 }}>
              Crew Drill Alarms
            </div>
          </div>
          <div className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            {crewSummary.totalSplitMs > 0
              ? `TOTAL SPLIT ${(crewSummary.totalSplitMs / 1000).toFixed(1)}s`
              : "90s LIVE GAME-DAY CLOCK"}
          </div>
        </button>

        {/* Radial Readiness Gauge */}
        <div className="panel radial-card">
          <RadialReadinessGauge
            score={score}
            hardStopBlocked={hardStopBlocked}
            verdict={overallLabel}
          />
        </div>
      </div>
    </div>
  );
}
