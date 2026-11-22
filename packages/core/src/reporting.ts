import { computeVerificationDigest } from "./crypto.js";
import { computeJourneyState, LIFECYCLE_STAGES } from "./lifecycle.js";
import type {
  CrewDrillResult,
  EvaluatedWaiver,
  ExportFormat,
  FlightCheckResult,
  JourneyState,
  MasterVerdict,
  NominalXConfig,
  ReportType,
  StaticFireResult,
} from "./types.js";

export interface ReportBuilderInput {
  config: NominalXConfig;
  gate1: FlightCheckResult;
  gate2?: StaticFireResult;
  gate3?: CrewDrillResult;
  dossierSigned?: boolean;
  generatedAt?: string;
}

export interface ExecutiveReadinessReport {
  reportType: "exec";
  title: string;
  generatedAt: string;
  accountId: string;
  accountName: string;
  targetGoLive: string;
  masterVerdict: MasterVerdict;
  journey: JourneyState;
  singleAccountableOwner: string;
  hardStopCompliance: {
    authSso: string;
    residency: string;
    hardStopViolations: number;
    allHardStops: Array<{
      stationCode: string;
      stationLabel: string;
      status: string;
      isCustom: boolean;
    }>;
  };
  gate1Summary: {
    verdict: MasterVerdict;
    nominal: number;
    waived: number;
    noGo: number;
    totalStations: number;
    blockers: string[];
  };
  gate2Summary: {
    executed: boolean;
    grade: string;
    corruptionPct: number | null;
    passedVectors: number;
    totalVectors: number;
    attemptTrail: string;
  };
  gate3Summary: {
    executed: boolean;
    stabilizedCount: number;
    totalAlarms: number;
    overtimeCount: number;
    totalSplitSeconds: number | null;
  };
  waiverExposure: {
    activeCount: number;
    maxAllowed: number;
    nearestExpiry: string | null;
    nearestDaysRemaining: number | null;
  };
  scopeGovernance: {
    inScopeHighlights: string[];
    outOfScopeBoundaries: string[];
  };
  recommendedAction: string;
  verificationDigest: string;
}

export interface OperationalSprintDigest {
  reportType: "ops";
  title: string;
  generatedAt: string;
  accountId: string;
  accountName: string;
  activeStageLabel: string;
  activeGateLabel: string;
  accountableOwner: string;
  masterVerdict: MasterVerdict;
  stationBlockers: Array<{
    subStage: string;
    stationLabel: string;
    policyClass: string;
    owner: string;
    status: string;
    sold: string;
    observed: string;
    failingLines: string[];
    remediation: string;
  }>;
  chaosFailures: Array<{
    subStage: string;
    vectorName: string;
    corruptionPct: number;
    observedBehavior: string;
    remediation: string;
  }>;
  crewDrillStatus: Array<{
    subStage: string;
    alarmName: string;
    status: string;
    splitSeconds: number | null;
    overtime: boolean;
    proof: string | null;
  }>;
  integrationMatrix: Array<{
    integration: string;
    endpointOrTarget: string;
    status: string;
  }>;
  nextCommands: string[];
  verificationDigest: string;
}

export interface WaiverAgingRegisterReport {
  reportType: "waivers";
  title: string;
  generatedAt: string;
  referenceDate: string;
  accountId: string;
  accountName: string;
  policyAttestation: {
    hardStopStations: string[];
    hardStopWaiversForbidden: true;
    hardStopViolationsDetected: number;
    maxActiveWaivers: number;
    maxDurationDays: number;
    activeUtilization: string;
  };
  activeWaivers: EvaluatedWaiver[];
  rejectedOrExpiredWaivers: EvaluatedWaiver[];
  supportDriftCommand: string;
  verificationDigest: string;
}

export type NominalXReport =
  | ExecutiveReadinessReport
  | OperationalSprintDigest
  | WaiverAgingRegisterReport;

export function buildReport(
  type: ReportType,
  input: ReportBuilderInput,
): NominalXReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  switch (type) {
    case "exec":
      return buildExecutiveReport(input, generatedAt);
    case "ops":
      return buildOperationalDigest(input, generatedAt);
    case "waivers":
      return buildWaiverRegisterReport(input, generatedAt);
  }
}

function buildExecutiveReport(
  input: ReportBuilderInput,
  generatedAt: string,
): ExecutiveReadinessReport {
  const { config, gate1, gate2, gate3, dossierSigned = false } = input;
  const journey = computeJourneyState({
    flightCheck: gate1,
    staticFire: gate2,
    crewDrill: gate3,
    dossierSigned,
  });

  const authStation = gate1.stations.find((s) => s.stationCode === "AUTH_SSO");
  const residencyStation = gate1.stations.find(
    (s) => s.stationCode === "RESIDENCY",
  );
  const allHardStops = gate1.stations
    .filter((s) => s.isHardStop)
    .map((s) => ({
      stationCode: String(s.stationCode),
      stationLabel: String(s.stationLabel),
      status: s.status,
      isCustom: Boolean(s.isCustom),
    }));
  const hardStopNamesText =
    allHardStops.length > 0
      ? allHardStops.map((h) => h.stationLabel).join(", ")
      : "None configured";

  const blockers = gate1.stations
    .filter((s) => s.status === "NO_GO")
    .map((s) => `${s.subStage} ${s.stationLabel}: ${s.observedSummary}`);

  const activeWaivers = gate1.waiverAudit.activeWaivers;
  const sortedByExpiry = [...activeWaivers].sort(
    (a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999),
  );
  const nearest = sortedByExpiry[0];

  const attemptTrail = gate2
    ? gate2.attemptHistory
        .map(
          (a) =>
            `Fire #${a.attemptNumber}: ${a.corruptionPct.toFixed(1)}% (Grade ${a.grade})`,
        )
        .join(" -> ")
    : "Not yet executed";

  let recommendedAction: string;
  if (gate1.verdict === "NO_GO") {
    recommendedAction = `HOLD LAUNCH — Resolve ${gate1.counts.noGo} Gate 1 NO-GO station(s) owned by ${gate1.accountableOwner} (Hard Stops ${hardStopNamesText} cannot be waived).`;
  } else if (!gate2 || !gate2.passed) {
    recommendedAction = `COMPLETE SPRINT 2 — Execute Gate 2 (2 of 3): Static Fire patch/re-fire loops until corruption drops to 0.0% (Grade A).`;
  } else if (!gate3 || !gate3.allStabilized) {
    recommendedAction = `COMPLETE SPRINT 3 — Run Gate 3 (3 of 3): Crew Drill live Day-30 alarm stabilization with Customer On-Call SREs under Lead CSE ${config.account.cse_owner}.`;
  } else if (activeWaivers.length > 0) {
    recommendedAction = `CONDITIONAL GO — Proceed with Signed NOMINAL WITH WAIVERS Dossier; track ${activeWaivers.length} active Operational Waiver(s) to closure before ${nearest?.expiresAt ?? config.account.target_go_live}.`;
  } else {
    recommendedAction = `GO FOR LAUNCH — All 3 Gates verified NOMINAL with 0 active waivers; transition Day-1 Runbook to Stage 5 Support Engineers.`;
  }

  const totalVectors = gate2?.totals.totalVectors ?? 7;
  const totalAlarms = gate3?.totalAlarms ?? 3;

  const basePayload = {
    reportType: "exec" as const,
    title: `Executive Readiness Report — ${config.account.name}`,
    generatedAt,
    accountId: config.account.id,
    accountName: config.account.name,
    targetGoLive: config.account.target_go_live,
    masterVerdict: journey.masterVerdict,
    journey,
    singleAccountableOwner: journey.accountableOwner,
    hardStopCompliance: {
      authSso: authStation?.status ?? "N/A",
      residency: residencyStation?.status ?? "N/A",
      hardStopViolations: gate1.waiverAudit.hardStopViolations.length,
      allHardStops,
    },
    gate1Summary: {
      verdict: gate1.verdict,
      nominal: gate1.counts.nominal,
      waived: gate1.counts.heldWaived,
      noGo: gate1.counts.noGo,
      totalStations: gate1.counts.total,
      blockers,
    },
    gate2Summary: {
      executed: Boolean(gate2),
      grade: gate2?.grade ?? "PENDING",
      corruptionPct: gate2?.corruptionPct ?? null,
      passedVectors: gate2?.totals.passedVectors ?? 0,
      totalVectors,
      attemptTrail,
    },
    gate3Summary: {
      executed: Boolean(gate3),
      stabilizedCount: gate3?.stabilizedCount ?? 0,
      totalAlarms,
      overtimeCount: gate3?.overtimeCount ?? 0,
      totalSplitSeconds: gate3
        ? Math.round((gate3.totalSplitMs / 1000) * 10) / 10
        : null,
    },
    waiverExposure: {
      activeCount: activeWaivers.length,
      maxAllowed: gate1.waiverAudit.maxAllowedActive,
      nearestExpiry: nearest?.expiresAt ?? null,
      nearestDaysRemaining: nearest?.daysRemaining ?? null,
    },
    scopeGovernance: {
      inScopeHighlights: [
        `Stage 2 · Gate 1 (1 of 3): Flight Check — ${gate1.counts.total}-station Sold vs. Observed telemetry`,
        `Stage 3 · Gate 2 (2 of 3): Static Fire — ${totalVectors}-vector deterministic chaos grading`,
        `Stage 4 · Gate 3 (3 of 3): Crew Drill — ${totalAlarms} live operational alarm drills + Handover Dossier`,
      ],
      outOfScopeBoundaries: [
        `Waiving non-negotiable Hard Stops (${hardStopNamesText})`,
        "LLM-generated readiness opinions or unverified launch spreadsheets",
        "Distributed 50k RPS load testing from a laptop",
      ],
    },
    recommendedAction,
  };

  return {
    ...basePayload,
    verificationDigest: computeVerificationDigest(basePayload),
  };
}

function buildOperationalDigest(
  input: ReportBuilderInput,
  generatedAt: string,
): OperationalSprintDigest {
  const { config, gate1, gate2, gate3, dossierSigned = false } = input;
  const journey = computeJourneyState({
    flightCheck: gate1,
    staticFire: gate2,
    crewDrill: gate3,
    dossierSigned,
  });

  const activeStageLabel =
    journey.activeGate === 1
      ? LIFECYCLE_STAGES[1]!.displayTitle
      : journey.activeGate === 2
        ? LIFECYCLE_STAGES[2]!.displayTitle
        : LIFECYCLE_STAGES[3]!.displayTitle;

  const activeGateLabel =
    journey.activeGate === 1
      ? "Gate 1 (1 of 3): Flight Check"
      : journey.activeGate === 2
        ? "Gate 2 (2 of 3): Static Fire"
        : journey.activeGate === 3
          ? "Gate 3 (3 of 3): Crew Drill"
          : "Handover Sprint: Signed NOMINAL Dossier & Day-1 Runbook";

  const stationBlockers = gate1.stations
    .filter((s) => s.status !== "NOMINAL")
    .map((s) => ({
      subStage: s.subStage,
      stationLabel: s.stationLabel,
      policyClass: s.isHardStop ? "HARD STOP (NON-WAIVABLE)" : "OPERATIONAL WAIVER",
      owner: s.accountableOwner,
      status: s.status,
      sold: s.soldSummary,
      observed: s.observedSummary,
      failingLines: s.evidence.highlightLines,
      remediation: s.remediationHint,
    }));

  const chaosFailures = (gate2?.vectors ?? [])
    .filter((v) => !v.passed)
    .map((v) => ({
      subStage: v.subStage,
      vectorName: v.vectorName,
      corruptionPct: v.corruptionPct,
      observedBehavior: v.observedBehavior,
      remediation: v.remediationSummary,
    }));

  const crewDrillStatus = (gate3?.alarms ?? []).map((a) => ({
    subStage: a.subStage,
    alarmName: a.alarmName,
    status: a.status,
    splitSeconds: a.splitMs !== null ? Math.round(a.splitMs / 100) / 10 : null,
    overtime: a.overtime,
    proof: a.verificationProof,
  }));

  const stationStatusByCode = new Map(
    gate1.stations.map((s) => [s.stationCode, s.status]),
  );
  const integrationMatrix = [
    ...(stationStatusByCode.has("AUTH_SSO")
      ? [
          {
            integration: `IdP SSO (${config.account.stack.idp})`,
            endpointOrTarget: config.environment.endpoints.auth_metadata,
            status: stationStatusByCode.get("AUTH_SSO")!,
          },
        ]
      : []),
    ...(stationStatusByCode.has("RESIDENCY")
      ? [
          {
            integration: `Cloud Residency (${config.account.stack.cloud})`,
            endpointOrTarget: config.environment.endpoints.residency_probe,
            status: stationStatusByCode.get("RESIDENCY")!,
          },
        ]
      : []),
    ...(stationStatusByCode.has("WEBHOOKS")
      ? [
          {
            integration: `Webhook Gateway (${config.account.stack.webhook_runtime})`,
            endpointOrTarget: config.environment.endpoints.webhook_ingress,
            status: stationStatusByCode.get("WEBHOOKS")!,
          },
        ]
      : []),
    ...(stationStatusByCode.has("QUOTA_RATE")
      ? [
          {
            integration: "API Quota / Rate Limiter",
            endpointOrTarget: config.environment.endpoints.quota_status,
            status: stationStatusByCode.get("QUOTA_RATE")!,
          },
        ]
      : []),
    ...(stationStatusByCode.has("ALERTING")
      ? [
          {
            integration: `P1 Alerting (${config.account.stack.alerting})`,
            endpointOrTarget: `${config.environment.endpoints.alert_sink} -> ${config.sold_contract.alerting.p1_channel}`,
            status: stationStatusByCode.get("ALERTING")!,
          },
        ]
      : []),
    ...(stationStatusByCode.has("ROLLBACK")
      ? [
          {
            integration: `Rollback Automation (${config.account.stack.deployment_tool ?? "terraform/argocd"})`,
            endpointOrTarget: config.environment.endpoints.rollback_check,
            status: stationStatusByCode.get("ROLLBACK")!,
          },
        ]
      : []),
    ...gate1.stations
      .filter((s) => s.isCustom)
      .map((s) => ({
        integration: `${s.stationLabel} (${s.isHardStop ? "Custom Hard Stop" : "Custom Station"})`,
        endpointOrTarget: `${s.evidence.method} ${s.evidence.endpoint}`,
        status: s.status,
      })),
  ];

  const nextCommands: string[] = [
    `nominalx check examples/${config.account.id}/nominalx.yaml`,
    `nominalx fire --url ${config.environment.base_url}${config.environment.endpoints.webhook_ingress} --config examples/${config.account.id}/nominalx.yaml`,
    `nominalx dossier --config examples/${config.account.id}/nominalx.yaml --format slack`,
  ];

  const basePayload = {
    reportType: "ops" as const,
    title: `Operational Sprint & Blocker Digest — ${config.account.name}`,
    generatedAt,
    accountId: config.account.id,
    accountName: config.account.name,
    activeStageLabel,
    activeGateLabel,
    accountableOwner: journey.accountableOwner,
    masterVerdict: journey.masterVerdict,
    stationBlockers,
    chaosFailures,
    crewDrillStatus,
    integrationMatrix,
    nextCommands,
  };

  return {
    ...basePayload,
    verificationDigest: computeVerificationDigest(basePayload),
  };
}

function buildWaiverRegisterReport(
  input: ReportBuilderInput,
  generatedAt: string,
): WaiverAgingRegisterReport {
  const { config, gate1 } = input;
  const audit = gate1.waiverAudit;

  const hardStopStations = gate1.stations
    .filter((s) => s.isHardStop)
    .map((s) => `${s.stationLabel} (${s.subStage})`);

  const basePayload = {
    reportType: "waivers" as const,
    title: `Active Waiver Aging Register — ${config.account.name}`,
    generatedAt,
    referenceDate: audit.referenceDate,
    accountId: config.account.id,
    accountName: config.account.name,
    policyAttestation: {
      hardStopStations,
      hardStopWaiversForbidden: true as const,
      hardStopViolationsDetected: audit.hardStopViolations.length,
      maxActiveWaivers: audit.maxAllowedActive,
      maxDurationDays: audit.maxDurationDays,
      activeUtilization: `${audit.activeWaivers.length} / ${audit.maxAllowedActive}`,
    },
    activeWaivers: audit.activeWaivers,
    rejectedOrExpiredWaivers: audit.rejectedWaivers,
    supportDriftCommand: `nominalx check examples/${config.account.id}/nominalx.yaml`,
  };

  return {
    ...basePayload,
    verificationDigest: computeVerificationDigest(basePayload),
  };
}

export function renderReport(
  report: NominalXReport,
  format: ExportFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  switch (report.reportType) {
    case "exec":
      return format === "md"
        ? renderExecMarkdown(report)
        : renderExecSlack(report);
    case "ops":
      return format === "md"
        ? renderOpsMarkdown(report)
        : renderOpsSlack(report);
    case "waivers":
      return format === "md"
        ? renderWaiversMarkdown(report)
        : renderWaiversSlack(report);
  }
}

function renderExecMarkdown(r: ExecutiveReadinessReport): string {
  const lines: string[] = [
    `# ${r.title}`,
    "",
    `> **Master Verdict:** \`${r.masterVerdict}\` | **Accountable Owner:** \`${r.singleAccountableOwner}\` | **Target Go-Live:** \`${r.targetGoLive}\``,
    "",
    "## Executive Decision",
    "",
    r.recommendedAction,
    "",
    "## Customer Lifecycle Progression (Stages 1 -> 6)",
    "",
    "| Stage | Lifecycle Phase | Unverified Gap | Accountable Owner | Status |",
    "|---|---|---|---|---|",
  ];

  for (const stageNum of [1, 2, 3, 4, 5, 6] as const) {
    const s = r.journey.stageStatus[stageNum];
    lines.push(
      `| Stage ${s.stageNumber} | ${s.stageName} | ${s.inUnverifiedGap ? "Yes (Stages 2-4)" : "No"} | \`${s.accountableOwner}\` | **${s.status}** |`,
    );
  }

  lines.push("");
  lines.push("## Gate Telemetry Summary");
  lines.push("");
  lines.push("| Gate | Metric | Result |");
  lines.push("|---|---|---|");
  lines.push(
    `| Gate 1 (1 of 3): Flight Check | Station Verdict | \`${r.gate1Summary.verdict}\` (${r.gate1Summary.nominal}/${r.gate1Summary.totalStations} NOMINAL, ${r.gate1Summary.waived} WAIVED, ${r.gate1Summary.noGo} NO-GO) |`,
  );
  const hsInline = r.hardStopCompliance.allHardStops
    .map((h) => `${h.stationLabel} \`${h.status}\``)
    .join(" · ");
  lines.push(
    `| Hard Stops (Non-Waivable) | ${r.hardStopCompliance.allHardStops.map((h) => h.stationLabel).join(" & ")} | ${hsInline} (Violations: ${r.hardStopCompliance.hardStopViolations}) |`,
  );
  lines.push(
    `| Gate 2 (2 of 3): Static Fire | Resilience Grade & Corruption | Grade \`${r.gate2Summary.grade}\` · ${r.gate2Summary.corruptionPct === null ? "PENDING" : `${r.gate2Summary.corruptionPct.toFixed(1)}%`} (${r.gate2Summary.passedVectors}/${r.gate2Summary.totalVectors}) · ${r.gate2Summary.attemptTrail} |`,
  );
  lines.push(
    `| Gate 3 (3 of 3): Crew Drill | Day-30 Alarm Stabilization | ${r.gate3Summary.executed ? `${r.gate3Summary.stabilizedCount}/${r.gate3Summary.totalAlarms} stabilized (${r.gate3Summary.overtimeCount} overtime, total ${r.gate3Summary.totalSplitSeconds}s)` : "PENDING"} |`,
  );
  lines.push(
    `| Operational Waiver Exposure | Active Cap & Nearest Expiry | \`${r.waiverExposure.activeCount} / ${r.waiverExposure.maxAllowed}\` · Nearest expiry: \`${r.waiverExposure.nearestExpiry ?? "None"}\`${r.waiverExposure.nearestDaysRemaining !== null ? ` (${r.waiverExposure.nearestDaysRemaining}d left)` : ""} |`,
  );

  if (r.gate1Summary.blockers.length > 0) {
    lines.push("");
    lines.push("## Active Launch Blockers");
    lines.push("");
    for (const blocker of r.gate1Summary.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("");
  lines.push("## Scope Governance");
  lines.push("");
  lines.push("**In-Scope:**");
  for (const item of r.scopeGovernance.inScopeHighlights) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("**Explicitly Out-of-Scope:**");
  for (const item of r.scopeGovernance.outOfScopeBoundaries) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push(`*Verification Digest:* \`${r.verificationDigest}\``);
  return `${lines.join("\n")}\n`;
}

function renderExecSlack(r: ExecutiveReadinessReport): string {
  const hsSummary = r.hardStopCompliance.allHardStops
    .map((h) => `${h.stationLabel} \`${h.status}\``)
    .join(", ");
  const lines: string[] = [
    `*${r.title}*`,
    `*Verdict:* \`${r.masterVerdict}\` | *Target Go-Live:* \`${r.targetGoLive}\` | *Baton Owner:* \`${r.singleAccountableOwner}\``,
    "",
    `*Decision:* ${r.recommendedAction}`,
    `• *Gate 1 (1 of 3) Flight Check:* \`${r.gate1Summary.verdict}\` (${r.gate1Summary.nominal}/${r.gate1Summary.totalStations} NOMINAL, ${r.gate1Summary.waived} WAIVED, ${r.gate1Summary.noGo} NO-GO) · Hard Stops: ${hsSummary}`,
    `• *Gate 2 (2 of 3) Static Fire:* Grade \`${r.gate2Summary.grade}\` · ${r.gate2Summary.passedVectors}/${r.gate2Summary.totalVectors} · ${r.gate2Summary.attemptTrail}`,
    `• *Gate 3 (3 of 3) Crew Drill:* ${r.gate3Summary.executed ? `${r.gate3Summary.stabilizedCount}/${r.gate3Summary.totalAlarms} stabilized (${r.gate3Summary.overtimeCount} overtime)` : "PENDING"}`,
    `• *Waiver Exposure:* \`${r.waiverExposure.activeCount}/${r.waiverExposure.maxAllowed}\` active · Nearest expiry: \`${r.waiverExposure.nearestExpiry ?? "None"}\``,
    `*Digest:* \`${r.verificationDigest}\``,
  ];
  return `${lines.join("\n")}\n`;
}

function renderOpsMarkdown(r: OperationalSprintDigest): string {
  const lines: string[] = [
    `# ${r.title}`,
    "",
    `> **Active Stage:** ${r.activeStageLabel} | **Active Gate:** ${r.activeGateLabel} | **Owner:** \`${r.accountableOwner}\` | **Verdict:** \`${r.masterVerdict}\``,
    "",
    "## Gate 1 (1 of 3): Flight Check — Non-Nominal Stations & Blockers",
    "",
  ];

  if (r.stationBlockers.length === 0) {
    lines.push("All Flight Check stations are `NOMINAL`. Zero blockers.");
  } else {
    lines.push("| Sub-Stage | Station | Policy | Owner | Status | Sold -> Observed | Remediation |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const b of r.stationBlockers) {
      lines.push(
        `| ${b.subStage} | \`${b.stationLabel}\` | ${b.policyClass} | \`${b.owner}\` | **${b.status}** | ${b.sold} -> ${b.observed} | ${b.remediation} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Gate 2 (2 of 3): Static Fire — Failing Chaos Vectors");
  lines.push("");
  if (r.chaosFailures.length === 0) {
    lines.push("Zero failing chaos vectors (either `0.0% · Grade A` or Gate 2 pending).");
  } else {
    lines.push("| Sub-Stage | Vector | Corruption % | Observed Failure | Engineering Remediation |");
    lines.push("|---|---|---|---|---|");
    for (const f of r.chaosFailures) {
      lines.push(
        `| ${f.subStage} | ${f.vectorName} | ${f.corruptionPct.toFixed(1)}% | ${f.observedBehavior} | ${f.remediation} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Integration Health Matrix");
  lines.push("");
  lines.push("| Integration | Target / Endpoint | Telemetry Status |");
  lines.push("|---|---|---|");
  for (const row of r.integrationMatrix) {
    lines.push(`| ${row.integration} | \`${row.endpointOrTarget}\` | **${row.status}** |`);
  }

  lines.push("");
  lines.push("## Next Engineering Commands");
  lines.push("");
  lines.push("```bash");
  for (const cmd of r.nextCommands) {
    lines.push(cmd);
  }
  lines.push("```");
  lines.push("");
  lines.push(`*Verification Digest:* \`${r.verificationDigest}\``);
  return `${lines.join("\n")}\n`;
}

function renderOpsSlack(r: OperationalSprintDigest): string {
  const lines: string[] = [
    `*${r.title}*`,
    `*Stage:* ${r.activeStageLabel} · *Gate:* ${r.activeGateLabel} · *Owner:* \`${r.accountableOwner}\` · *Verdict:* \`${r.masterVerdict}\``,
    "",
  ];
  if (r.stationBlockers.length === 0) {
    lines.push("• *Gate 1 Blockers:* None — all stations NOMINAL.");
  } else {
    lines.push(`*Gate 1 Non-Nominal Stations (${r.stationBlockers.length}):*`);
    for (const b of r.stationBlockers) {
      lines.push(
        `> • ${b.subStage} \`${b.stationLabel}\` [${b.status}] (${b.policyClass}) — ${b.remediation}`,
      );
    }
  }
  if (r.chaosFailures.length > 0) {
    lines.push(`*Gate 2 Failing Vectors (${r.chaosFailures.length}):*`);
    for (const f of r.chaosFailures) {
      lines.push(
        `> • ${f.subStage} ${f.vectorName} (\`${f.corruptionPct.toFixed(1)}%\`) — ${f.remediation}`,
      );
    }
  }
  lines.push(`*Digest:* \`${r.verificationDigest}\``);
  return `${lines.join("\n")}\n`;
}

function renderWaiversMarkdown(r: WaiverAgingRegisterReport): string {
  const lines: string[] = [
    `# ${r.title}`,
    "",
    `> **Reference Date:** \`${r.referenceDate}\` | **Active Cap Utilization:** \`${r.policyAttestation.activeUtilization}\` | **Max Window:** \`<= ${r.policyAttestation.maxDurationDays}d\` | **Hard Stop Violations:** \`${r.policyAttestation.hardStopViolationsDetected}\``,
    "",
    "## Hard Stop Policy Attestation",
    "",
    `- **Non-Waivable Hard Stop Stations:** ${r.policyAttestation.hardStopStations.join(", ")}`,
    `- **Policy Rule:** Any waiver targeting a Hard Stop is rejected as \`NO-GO\`. Only operational stations (\`WEBHOOKS\`, \`QUOTA / RATE\`, \`ALERTING\`, \`ROLLBACK\`) may carry time-boxed waivers.`,
    "",
    "## Active Operational Waivers",
    "",
  ];

  if (r.activeWaivers.length === 0) {
    lines.push("No active Operational Waivers (`0 / 2`).");
  } else {
    lines.push("| Station | Owner | Ticket | Expires At | Days Remaining | Aging Band | Reason | Rollback Plan |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const w of r.activeWaivers) {
      lines.push(
        `| \`${w.stationLabel}\` | \`${w.owner}\` | \`${w.ticketId ?? "N/A"}\` | \`${w.expiresAt}\` | ${w.daysRemaining ?? 0}d | \`${w.agingBand}\` | ${w.reason} | ${w.rollbackPlan} |`,
      );
    }
  }

  if (r.rejectedOrExpiredWaivers.length > 0) {
    lines.push("");
    lines.push("## Rejected / Expired Waiver Violations (Blocks Launch)");
    lines.push("");
    lines.push("| Station | Status | Violation Code | Owner | Expires At | Details |");
    lines.push("|---|---|---|---|---|---|");
    for (const w of r.rejectedOrExpiredWaivers) {
      lines.push(
        `| \`${w.stationLabel}\` | **${w.status}** | \`${w.violationCode ?? "INVALID"}\` | \`${w.owner}\` | \`${w.expiresAt}\` | ${w.violationMessage ?? ""} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Stage 5 Support Drift-Detection Command");
  lines.push("");
  lines.push("```bash");
  lines.push(r.supportDriftCommand);
  lines.push("```");
  lines.push("");
  lines.push(`*Verification Digest:* \`${r.verificationDigest}\``);
  return `${lines.join("\n")}\n`;
}

function renderWaiversSlack(r: WaiverAgingRegisterReport): string {
  const lines: string[] = [
    `*${r.title}*`,
    `*As Of:* \`${r.referenceDate}\` | *Cap Used:* \`${r.policyAttestation.activeUtilization}\` | *Hard Stop Violations:* \`${r.policyAttestation.hardStopViolationsDetected}\``,
  ];
  if (r.activeWaivers.length === 0) {
    lines.push("> Zero active Operational Waivers.");
  } else {
    for (const w of r.activeWaivers) {
      lines.push(
        `> • \`${w.stationLabel}\` | Owner \`${w.owner}\` | Expires \`${w.expiresAt}\` (\`${w.daysRemaining ?? 0}d\`, \`${w.agingBand}\`) | Rollback: ${w.rollbackPlan}`,
      );
    }
  }
  if (r.rejectedOrExpiredWaivers.length > 0) {
    lines.push("*VIOLATIONS (BLOCKING NO-GO):*");
    for (const w of r.rejectedOrExpiredWaivers) {
      lines.push(
        `> • \`${w.stationLabel}\` [${w.violationCode}] — ${w.violationMessage}`,
      );
    }
  }
  lines.push(`*Support Re-Probe:* \`${r.supportDriftCommand}\``);
  lines.push(`*Digest:* \`${r.verificationDigest}\``);
  return `${lines.join("\n")}\n`;
}
