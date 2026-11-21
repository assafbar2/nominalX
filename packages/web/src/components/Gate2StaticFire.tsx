import type {
  AccountPreset,
  ChaosVectorId,
  StaticFireResult,
  TelemetryPoint,
} from "@nominalx/core";
import { VectorGlyph } from "./Icons";

interface Gate2StaticFireProps {
  preset: AccountPreset;
  staticFire: StaticFireResult;
  stagedPatches: ChaosVectorId[];
  isFiring: boolean;
  onToggleStagePatch: (vectorId: ChaosVectorId) => void;
  onStageAllPatches: () => void;
  onIgniteFire: () => void;
  onProceedToGate3: () => void;
}

function gradeColor(grade: StaticFireResult["grade"]): string {
  if (grade === "A") return "var(--nominal)";
  if (grade === "B") return "var(--active)";
  if (grade === "C" || grade === "D") return "var(--waived)";
  return "var(--nogo)";
}

function TelemetryWaveformChart({
  series,
  passed,
}: {
  series: TelemetryPoint[];
  passed: boolean;
}) {
  const width = 920;
  const height = 210;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxPps = Math.max(500, ...series.map((p) => p.packetsPerSec));
  const maxErr = Math.max(40, ...series.map((p) => Math.max(p.errorRatePct, p.corruptionRatePct)));

  const xFor = (idx: number) =>
    padL + (idx / Math.max(1, series.length - 1)) * plotW;
  const yPps = (val: number) => padT + plotH - (val / maxPps) * plotH;
  const yErr = (val: number) => padT + plotH - (val / maxErr) * plotH;

  const ppsPoints = series.map((p, i) => `${xFor(i).toFixed(1)},${yPps(p.packetsPerSec).toFixed(1)}`).join(" ");
  const errPoints = series.map((p, i) => `${xFor(i).toFixed(1)},${yErr(p.errorRatePct).toFixed(1)}`).join(" ");
  const errArea =
    `${padL},${padT + plotH} ` +
    errPoints +
    ` ${xFor(series.length - 1).toFixed(1)},${padT + plotH}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label="Static Fire Live Packet and Error-Rate Waveform"
    >
      <defs>
        <linearGradient id="errFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={passed ? "#22c55e" : "#ef4444"} stopOpacity="0.38" />
          <stop offset="100%" stopColor={passed ? "#22c55e" : "#ef4444"} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Horizontal gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padT + plotH * (1 - frac);
        return (
          <g key={frac}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="var(--border-subtle)"
              strokeDasharray="4 4"
            />
            <text
              x={padL - 8}
              y={y + 4}
              textAnchor="end"
              fill="var(--text-dim)"
              className="mono"
              style={{ fontSize: 10 }}
            >
              {Math.round(maxPps * frac)}
            </text>
          </g>
        );
      })}

      {/* Error/Corruption area + trace */}
      <polygon points={errArea} fill="url(#errFill)" />
      <polyline
        fill="none"
        stroke={passed ? "var(--nominal)" : "var(--nogo)"}
        strokeWidth="3"
        strokeLinejoin="round"
        points={errPoints}
      />

      {/* Packet throughput trace */}
      <polyline
        fill="none"
        stroke="var(--active)"
        strokeWidth="2.8"
        strokeLinejoin="round"
        points={ppsPoints}
      />

      {/* Peak markers */}
      {series.map((p, idx) =>
        idx % 4 === 0 ? (
          <g key={p.tick}>
            <circle cx={xFor(idx)} cy={yPps(p.packetsPerSec)} r="3.5" fill="var(--active)" />
            <circle
              cx={xFor(idx)}
              cy={yErr(p.errorRatePct)}
              r="3.5"
              fill={passed ? "var(--nominal)" : "var(--nogo)"}
            />
            <text
              x={xFor(idx)}
              y={height - 8}
              textAnchor="middle"
              fill="var(--text-dim)"
              className="mono"
              style={{ fontSize: 10 }}
            >
              T+{p.timeOffsetSec}s
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}

export function Gate2StaticFire({
  preset,
  staticFire,
  stagedPatches,
  isFiring,
  onToggleStagePatch,
  onStageAllPatches,
  onIgniteFire,
  onProceedToGate3,
}: Gate2StaticFireProps) {
  const vectorPatches = preset.patchDiffs.filter((d) => d.targetType === "vector");
  const stagedSet = new Set(stagedPatches);
  const gColor = gradeColor(staticFire.grade);

  const corruptionRadius = 56;
  const corrCirc = 2 * Math.PI * corruptionRadius;
  const corrArc = corrCirc * 0.72;
  const corrFilled = corrArc * Math.min(1, staticFire.corruptionPct / 50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Gate 2 Action Header */}
      <div className="panel gate-action-header">
        <div>
          <div className="eyebrow">
            STAGE 3: INTEGRATION &amp; CUTOVER · GATE 2 (2 OF 3): STATIC FIRE · SPRINT 2
          </div>
          <h2 className="gate-title-xl">
            Staging Failure Test Stand (7 Real-World Scenarios · Target 0.0% Data Loss, Grade A)
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Multi-Attempt History Delta Trail */}
          {staticFire.attemptHistory.map((attempt) => (
            <span
              key={attempt.attemptNumber}
              className={`status-pill ${attempt.grade === "A" ? "status-nominal" : "status-nogo"}`}
            >
              FIRE #{attempt.attemptNumber}: {attempt.corruptionPct.toFixed(1)}% · GRADE {attempt.grade}
            </span>
          ))}

          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onIgniteFire}
            disabled={isFiring}
            data-testid="ignite-static-fire-btn"
          >
            {isFiring
              ? "FIRING TEST STAND..."
              : staticFire.attemptNumber > 1 || stagedPatches.length > 0
                ? "RE-FIRE TEST STAND"
                : "IGNITE STATIC FIRE"}
          </button>

          {staticFire.passed && (
            <button
              type="button"
              className="btn btn-nominal btn-lg"
              onClick={onProceedToGate3}
              data-testid="proceed-to-gate3-btn"
            >
              Proceed to Gate 3: Crew Drill →
            </button>
          )}
        </div>
      </div>

      {/* 3 GIANT Visual Scoreboard Blocks */}
      <div className="fire-scoreboard">
        {/* Block 1: DATA CORRUPTION % Gauge */}
        <div className="panel score-block">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">DATA CORRUPTION RATE</span>
            <span className={`status-pill ${staticFire.passed ? "status-nominal" : "status-nogo"}`}>
              {staticFire.totals.packetsCorrupted} / {staticFire.totals.packetsSent} PACKETS
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="136" height="114" viewBox="0 0 136 120" aria-hidden="true">
              <g transform="translate(68, 66) rotate(140)">
                <circle
                  r={corruptionRadius}
                  cx="0"
                  cy="0"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="12"
                  strokeDasharray={`${corrArc} ${corrCirc}`}
                  strokeLinecap="round"
                />
                <circle
                  r={corruptionRadius}
                  cx="0"
                  cy="0"
                  fill="none"
                  stroke={staticFire.passed ? "var(--nominal)" : "var(--nogo)"}
                  strokeWidth="12"
                  strokeDasharray={`${staticFire.passed ? corrArc : Math.max(8, corrFilled)} ${corrCirc}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 0.5s ease" }}
                />
              </g>
              <text
                x="68"
                y="74"
                textAnchor="middle"
                fill={staticFire.passed ? "var(--nominal-text)" : "var(--nogo-text)"}
                className="mono"
                style={{ fontSize: "1.1rem", fontWeight: 800 }}
              >
                {staticFire.passed ? "0% CLEAN" : "CORRUPT"}
              </text>
            </svg>

            <div>
              <div
                className="kpi-huge"
                style={{ color: staticFire.passed ? "var(--nominal-text)" : "var(--nogo-text)" }}
                data-testid="static-fire-corruption-pct"
              >
                {staticFire.corruptionPct.toFixed(1)}%
              </div>
              <div className="mono" style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 6 }}>
                DROPPED: {staticFire.totals.packetsDropped} · TARGET: 0.0%
              </div>
            </div>
          </div>
        </div>

        {/* Block 2: 7-LED FAULT STRIP */}
        <div className="panel score-block">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">7-SCENARIO FAILURE STATUS</span>
            <span className="mono" style={{ fontSize: "0.86rem", fontWeight: 800, color: staticFire.passed ? "var(--nominal-text)" : "var(--nogo-text)" }}>
              {staticFire.totals.passedVectors} / 7 NOMINAL
            </span>
          </div>

          <div className="fault-led-grid">
            {staticFire.vectors.map((v) => (
              <div
                key={v.vectorId}
                className={`fault-led-cell ${v.passed ? "pass" : "fail"}`}
                title={`${v.subStage} ${v.vectorName}: ${v.corruptionPct.toFixed(1)}%`}
              >
                <span className={`fault-led-lamp ${v.passed ? "pass" : "fail"}`} />
                <span className="mono" style={{ fontSize: "0.7rem", fontWeight: 800 }}>
                  {v.index}/7
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: "0.64rem",
                    color: v.passed ? "var(--nominal-text)" : "var(--nogo-text)",
                    fontWeight: 700,
                  }}
                >
                  {v.passed ? "OK" : `${v.corruptionPct}%`}
                </span>
              </div>
            ))}
          </div>

          <div className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            TARGET: {staticFire.targetUrl}
          </div>
        </div>

        {/* Block 3: GIANT GRADE STAMP */}
        <div className="panel score-block" style={{ alignItems: "center", justifyContent: "center" }}>
          <span className="eyebrow">RESILIENCE GRADE</span>
          <div
            className="grade-stamp"
            style={{ color: gColor }}
            data-testid="static-fire-grade-stamp"
          >
            <span className="grade-stamp-letter">{staticFire.grade}</span>
            <span style={{ fontSize: "0.68rem", letterSpacing: "0.1em" }}>
              {staticFire.passed ? "NOMINAL" : "NO-GO"}
            </span>
          </div>
          <div className="mono" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            ATTEMPT #{staticFire.attemptNumber} · EXIT {staticFire.exitCode}
          </div>
        </div>
      </div>

      {/* Live SVG Packet & Error-Rate Waveform Chart */}
      <section className="panel panel-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <div>
            <span className="eyebrow">LIVE TEST STAND TELEMETRY WAVEFORM</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "1.1rem", fontWeight: 800 }}>
              Packet Throughput (req/s) vs. Error / Corruption Rate (%)
            </h3>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span className="mono" style={{ fontSize: "0.75rem", color: "var(--active-text)", fontWeight: 700 }}>
              ━ PACKETS / SEC
            </span>
            <span
              className="mono"
              style={{
                fontSize: "0.75rem",
                color: staticFire.passed ? "var(--nominal-text)" : "var(--nogo-text)",
                fontWeight: 700,
              }}
            >
              ━ ERROR &amp; CORRUPTION %
            </span>
          </div>
        </div>
        <TelemetryWaveformChart series={staticFire.telemetrySeries} passed={staticFire.passed} />
      </section>

      {/* Live Handler Patch Panel */}
      <section className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow">LIVE HANDLER PATCH SWITCHBOARD · {preset.config.account.stack.webhook_runtime.toUpperCase()}</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "1.18rem", fontWeight: 800 }}>
              Toggle Real Handler Fixes &amp; Re-Fire Test Stand
            </h3>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={onStageAllPatches}
              data-testid="stage-all-patches-btn"
            >
              Stage All {vectorPatches.length} Fixes
            </button>
            <button
              type="button"
              className="btn btn-nominal"
              onClick={onIgniteFire}
              disabled={isFiring}
              data-testid="refire-after-patch-btn"
            >
              {isFiring ? "FIRING..." : "RE-FIRE TEST STAND"}
            </button>
          </div>
        </div>

        <div className="patch-panel-grid">
          {vectorPatches.map((patch) => {
            const vectorId = patch.targetId as ChaosVectorId;
            const isStaged = stagedSet.has(vectorId);
            return (
              <button
                key={patch.patchKey}
                type="button"
                className={`patch-toggle-card ${isStaged ? "staged" : ""}`}
                onClick={() => onToggleStagePatch(vectorId)}
                data-testid={`patch-toggle-${patch.patchKey}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 8 }}>
                  <strong style={{ fontSize: "0.9rem" }}>{patch.label}</strong>
                  <span className={`status-pill ${isStaged ? "status-nominal" : "status-pending"}`}>
                    {isStaged ? "STAGED" : "OFF"}
                  </span>
                </div>
                <div className="code-diff-box" style={{ width: "100%" }}>
                  {patch.diffLines.map((line) => (
                    <span
                      key={line}
                      className={
                        line.startsWith("-")
                          ? "diff-line-del"
                          : line.startsWith("+")
                            ? "diff-line-add"
                            : ""
                      }
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 7 Chunky Vector Cards (1 of 7 -> 7 of 7) */}
      <div className="vector-grid">
        {staticFire.vectors.map((v) => {
          const color = v.passed ? "var(--nominal)" : "var(--nogo)";
          return (
            <div
              key={v.vectorId}
              className={`vector-card ${v.passed ? "pass" : "fail"}`}
              data-testid={`vector-card-${v.vectorId}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: "var(--bg-inset)",
                      border: `1px solid ${color}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <VectorGlyph id={v.vectorId} color={color} />
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--active-text)" }}>
                      {v.subStage}
                    </div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, lineHeight: 1.15 }}>
                      {v.shortName}
                    </div>
                  </div>
                </div>
                <span className={`status-pill ${v.passed ? "status-nominal" : "status-nogo"}`}>
                  {v.passed ? "NOMINAL" : "NO-GO"}
                </span>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: "1.8rem",
                      fontWeight: 800,
                      color: v.passed ? "var(--nominal-text)" : "var(--nogo-text)",
                    }}
                  >
                    {v.corruptionPct.toFixed(1)}%
                  </span>
                  <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    p95 {v.p95LatencyMs}ms
                  </span>
                </div>
                <div className="health-bar-track" style={{ marginTop: 6 }}>
                  <div
                    className="health-bar-fill"
                    style={{
                      width: v.passed ? "100%" : `${Math.max(12, 100 - v.corruptionPct)}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>

              <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                {v.packetsCorrupted}/{v.packetsSent} CORRUPTED · {v.packetsDropped} DROPPED
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
