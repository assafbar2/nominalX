import type {
  FlightCheckResult,
  ResilienceGrade,
  StaticFireResult,
  StationStatus,
} from "@nominalx/core";

const useColor =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  Boolean(process.stdout.isTTY);

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function paint(color: keyof typeof ANSI, text: string): string {
  if (!useColor) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

export function badgeStatus(status: StationStatus | string): string {
  switch (status) {
    case "NOMINAL":
      return paint("green", "[NOMINAL]");
    case "CONDITIONAL_GO":
    case "HOLD_WAIVED":
    case "NOMINAL_WITH_WAIVERS":
      return paint("yellow", `[${status}]`);
    case "NO_GO":
      return paint("red", "[NO-GO]");
    default:
      return paint("cyan", `[${status}]`);
  }
}

export function badgeGrade(grade: ResilienceGrade): string {
  if (grade === "A") return paint("green", `GRADE ${grade}`);
  if (grade === "B" || grade === "C") return paint("yellow", `GRADE ${grade}`);
  return paint("red", `GRADE ${grade}`);
}

export function formatFlightCheckTerminal(result: FlightCheckResult): string {
  const lines: string[] = [];
  const hr = "=".repeat(88);

  lines.push(paint("bold", hr));
  lines.push(
    `${paint("bold", "NOMINALX")} · ${paint("cyan", result.stageLabel)} · ${paint("bold", result.gateLabel)}`,
  );
  lines.push(
    `Account: ${paint("bold", result.accountName)} (${result.accountId}) | Owner: ${result.accountableOwner} | As Of: ${result.referenceDate}`,
  );
  lines.push(hr);
  lines.push("");

  for (const s of result.stations) {
    const policyTag = s.isHardStop
      ? paint("red", "HARD STOP · NON-WAIVABLE")
      : paint("dim", "OPERATIONAL");
    lines.push(
      `  ${paint("bold", s.subStage)}  ${s.stationLabel.padEnd(13)} ${badgeStatus(s.status).padEnd(useColor ? 24 : 15)} ${String(`${s.latencyMs}ms`).padStart(6)}  ${policyTag}`,
    );
    lines.push(`         Sold:     ${s.soldSummary}`);
    lines.push(`         Observed: ${s.observedSummary}`);
    if (s.status === "HOLD_WAIVED" && s.activeWaiver) {
      lines.push(
        `         ${paint("yellow", `Waiver:   owner=${s.activeWaiver.owner} · expires=${s.activeWaiver.expiresAt} (${s.activeWaiver.daysRemaining ?? 0}d left, ${s.activeWaiver.agingBand})`)}`,
      );
      lines.push(`         Rollback: ${s.activeWaiver.rollbackPlan}`);
    } else if (s.status === "NO_GO") {
      for (const hl of s.evidence.highlightLines) {
        lines.push(`         ${paint("red", `Evidence: ${hl}`)}`);
      }
      lines.push(`         Fix:      ${s.remediationHint}`);
    }
    lines.push("");
  }

  if (result.waiverAudit.rejectedWaivers.length > 0) {
    lines.push(paint("red", "WAIVER POLICY VIOLATIONS:"));
    for (const v of result.waiverAudit.rejectedWaivers) {
      lines.push(
        `  - [${v.violationCode}] ${v.stationLabel}: ${v.violationMessage}`,
      );
    }
    lines.push("");
  }

  lines.push(hr);
  lines.push(
    `VERDICT: ${badgeStatus(result.verdict)}  |  NOMINAL: ${result.counts.nominal}/${result.counts.total}  |  WAIVED: ${result.counts.heldWaived}/${result.waiverAudit.maxAllowedActive}  |  NO-GO: ${result.counts.noGo}  |  HARD STOP FAILURES: ${result.counts.hardStopFailures}`,
  );
  lines.push(hr);
  return `${lines.join("\n")}\n`;
}

export function formatStaticFireTerminal(result: StaticFireResult): string {
  const lines: string[] = [];
  const hr = "=".repeat(88);

  lines.push(paint("bold", hr));
  lines.push(
    `${paint("bold", "NOMINALX")} · ${paint("cyan", result.stageLabel)} · ${paint("bold", result.gateLabel)}`,
  );
  lines.push(
    `Account: ${paint("bold", result.accountName)} | Target: ${result.targetUrl} | Fire Attempt #${result.attemptNumber}`,
  );
  lines.push(hr);
  lines.push("");

  for (const v of result.vectors) {
    const status = v.passed ? badgeStatus("NOMINAL") : badgeStatus("NO_GO");
    lines.push(
      `  ${paint("bold", v.subStage)}  ${v.shortName.padEnd(21)} ${status.padEnd(useColor ? 20 : 11)}  corrupted=${String(v.packetsCorrupted).padStart(3)}/${String(v.packetsSent).padEnd(3)} (${v.corruptionPct.toFixed(1).padStart(5)}%)  p95=${v.p95LatencyMs}ms`,
    );
    if (!v.passed) {
      lines.push(`         ${paint("red", `Observed: ${v.observedBehavior}`)}`);
      lines.push(`         Fix:      ${v.remediationSummary}`);
    }
  }

  lines.push("");
  if (result.attemptHistory.length > 1) {
    const trail = result.attemptHistory
      .map(
        (a) =>
          `Fire #${a.attemptNumber}: ${a.corruptionPct.toFixed(1)}% (${a.grade})`,
      )
      .join(" -> ");
    lines.push(`Attempt Progression: ${paint("cyan", trail)}`);
  }
  lines.push(hr);
  lines.push(
    `STATIC FIRE RESULT: ${badgeGrade(result.grade)}  |  CORRUPTION: ${result.corruptionPct.toFixed(1)}%  |  VECTORS PASSED: ${result.totals.passedVectors}/${result.totals.totalVectors}  |  ${result.passed ? badgeStatus("NOMINAL") : badgeStatus("NO_GO")}`,
  );
  lines.push(hr);
  return `${lines.join("\n")}\n`;
}
