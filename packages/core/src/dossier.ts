import { computeVerificationDigest } from "./crypto.js";
import { LIFECYCLE_STAGES } from "./lifecycle.js";
import type {
  CrewDrillResult,
  Day1Runbook,
  DossierSigners,
  DossierVerdict,
  ExportFormat,
  FlightCheckResult,
  MasterVerdict,
  NominalXConfig,
  RunbookSection,
  SignedNominalDossier,
  StaticFireResult,
} from "./types.js";

function formatSplit(splitMs: number | null): string {
  if (splitMs === null) return "PENDING";
  return `${(splitMs / 1000).toFixed(1)}s`;
}

export function generateDay1Runbook(
  config: NominalXConfig,
  gate1: FlightCheckResult,
  gate2: StaticFireResult,
  gate3: CrewDrillResult,
  generatedAt: string = new Date().toISOString(),
): Day1Runbook {
  const { account, sold_contract: sold, environment: env } = config;
  const activeWaivers = gate1.waiverAudit.activeWaivers;

  const activeWaiverPlaybooks = activeWaivers.map((w) => ({
    station: String(w.stationLabel),
    owner: w.owner,
    expiresAt: w.expiresAt,
    daysRemaining: w.daysRemaining,
    agingBand: w.agingBand,
    rollbackPlan: w.rollbackPlan,
    reprobeCommand: `nominalx check examples/${account.id}/nominalx.yaml`,
  }));

  const hardStopNames = gate1.stations
    .filter((s) => s.isHardStop)
    .map((s) => s.stationLabel);

  const sections: RunbookSection[] = [
    {
      id: "drift-detection",
      title: "1. Support Day-1 Drift Detection & Contract Re-Verification",
      ownerRole: "Support Engineer + Customer On-Call SRE",
      summary: `Re-verify all ${gate1.counts.total} Gate 1 stations (Hard Stops: ${hardStopNames.join(", ")}) in one deterministic command.`,
      commands: [
        `nominalx check ./nominalx.yaml`,
        `nominalx report --config ./nominalx.yaml --type waivers --format md`,
      ],
      verificationSteps: [
        `Confirm AUTH / SSO (${sold.auth.protocol.toUpperCase()}) cert TTL >= ${sold.auth.min_cert_ttl_days}d and MFA enforced.`,
        `Confirm X-Served-Region stays strictly within [${sold.residency.allowed_regions.join(", ")}].`,
        ...(config.custom_stations ?? [])
          .filter((cs) => cs.hard_stop)
          .map(
            (cs) =>
              `Confirm custom Hard Stop ${cs.label} (${cs.method} ${cs.endpoint}) returns HTTP ${cs.expected_status ?? 200} and satisfies "${cs.sold_promise}".`,
          ),
        "Confirm exit code 0 and zero expired Operational Waivers.",
      ],
    },
    {
      id: "webhook-key-rotation",
      title: `2. Zero-Downtime Dual-HMAC Key Rotation (${account.stack.webhook_runtime})`,
      ownerRole: "Customer Backend Engineer + Security Engineer",
      summary: `Rotate ${sold.webhooks.signing} signing secrets on ${env.endpoints.webhook_ingress} using dual-key overlap (<= ${sold.webhooks.max_clock_skew_seconds}s replay tolerance).`,
      commands: [
        `export NOMINALX_WEBHOOK_SECRET_NEXT="<new_staged_secret>"`,
        `nominalx fire --url ${env.base_url}${env.endpoints.webhook_ingress} --config ./nominalx.yaml`,
      ],
      verificationSteps: [
        "Verify Gate 2 Sub-Stage 5 of 7 (Dual HMAC secret rotation) passes with 0% drop across v1 + v2 keys.",
        "Verify forged signatures still return 401/403 and stale -15m replay probes are rejected.",
        "Decommission prior v1 key only after 100% traffic signs with v2.",
      ],
    },
    {
      id: "sso-cert-rotation",
      title: `3. SSO Certificate Rotation (${account.stack.idp})`,
      ownerRole: "Customer Security Engineer + On-Call SRE",
      summary: `Promote staged X.509 signing certificate in dual-cert grace mode whenever TTL approaches ${sold.auth.min_cert_ttl_days}d (rehearsed in Gate 3 Sub-Stage 2 of 3).`,
      commands: [
        `curl -fsS ${env.base_url}${env.endpoints.auth_metadata}`,
        `nominalx check ./nominalx.yaml --json`,
      ],
      verificationSteps: [
        "Stage replacement X.509 fingerprint alongside active certificate before cutover.",
        `Confirm live SSO metadata endpoint returns protocol=${sold.auth.protocol}, mfa_enforced=true, and cert_ttl_days > 365.`,
      ],
    },
    {
      id: "rate-limit-storm",
      title: `4. Runaway Ingestion & Rate-Limit Mitigation (${account.stack.cloud})`,
      ownerRole: "Customer Platform / Infra Engineer + On-Call SRE",
      summary: `Enforce per-tenant rate cap and DLQ overflow while preserving ${sold.quota.guaranteed_rps.toLocaleString("en-US")} RPS contracted headroom and Retry-After headers.`,
      commands: [
        `curl -fsS ${env.base_url}${env.endpoints.quota_status}`,
        `nominalx fire --url ${env.base_url}${env.endpoints.webhook_ingress} --config ./nominalx.yaml`,
      ],
      verificationSteps: [
        "Identify runaway tenant/source key from gateway burst metrics.",
        "Apply per-tenant rate cap + enable DLQ overflow without throttling healthy tenants.",
        "Confirm 429 responses emit numeric Retry-After and burn rate holds in SLA for 3 consecutive ticks.",
      ],
    },
    {
      id: "p1-alerting-rollback",
      title: `5. P1 Alert Verification & Release Rollback (${account.stack.alerting} / ${account.stack.deployment_tool ?? "release-automation"})`,
      ownerRole: "Lead CSE + Support Engineer + Customer On-Call SRE",
      summary: `Verify synthetic P1 alert delivery to ${sold.alerting.p1_channel} (<= ${sold.alerting.max_ack_ms}ms) and rollback dry-run within ${sold.rollback.max_rto_minutes}m RTO.`,
      commands: [
        `curl -fsS -X POST -H "X-NominalX-Probe: true" ${env.base_url}${env.endpoints.alert_sink}`,
        `curl -fsS -X POST ${env.base_url}${env.endpoints.rollback_check}`,
      ],
      verificationSteps: [
        `Confirm ${sold.alerting.p1_channel} acknowledges synthetic probe with HTTP 2xx <= ${sold.alerting.max_ack_ms}ms.`,
        `Confirm rollback dry-run completes <= ${sold.rollback.max_rto_minutes}m with zero data loss.`,
      ],
    },
  ];

  if ((config.custom_stations?.length ?? 0) > 0) {
    sections.push({
      id: "custom-station-probes",
      title: `${sections.length + 1}. Custom Product Station Telemetry Probes`,
      ownerRole: "Lead FDE + Customer Engineering Lead",
      summary: `Verify ${config.custom_stations!.length} product-specific Gate 1 station(s) declared in nominalx.yaml alongside the 6 core stations.`,
      commands: config.custom_stations!.map(
        (cs) =>
          `curl -i -X ${cs.method} ${env.base_url}${cs.endpoint} # ${cs.code} (${cs.hard_stop ? "HARD STOP" : "OPERATIONAL"})`,
      ),
      verificationSteps: config.custom_stations!.map(
        (cs) =>
          `${cs.label} (${cs.code}, owner ${cs.owner}): ${cs.sold_promise}`,
      ),
    });
  }

  if ((config.custom_alarms?.length ?? 0) > 0) {
    sections.push({
      id: "custom-day30-alarms",
      title: `${sections.length + 1}. Custom Day-30 Incident Alarm Playbooks`,
      ownerRole: "Lead CSE + Support Engineer + Customer On-Call SRE",
      summary: `Rehearsed product-specific Day-30 remediation procedures for ${config.custom_alarms!.length} custom Crew Drill alarm(s).`,
      commands: config.custom_alarms!.map(
        (ca) => `# ${ca.title} (SLA ${ca.timer_seconds}s, owner ${ca.owner}): ${ca.remediation_label}`,
      ),
      verificationSteps: config.custom_alarms!.map(
        (ca) => `${ca.title}: ${ca.remediation_detail} — Verify: ${ca.verification_proof}`,
      ),
    });
  }

  if (activeWaiverPlaybooks.length > 0) {
    sections.push({
      id: "waiver-closure",
      title: `${sections.length + 1}. Active Operational Waiver Closure & Expiry Escalation`,
      ownerRole: "Support Engineer + TAM + Named Waiver Owners",
      summary: `${activeWaiverPlaybooks.length} active Operational Waiver(s) require live NOMINAL re-probe before expiry. Hard Stops (${hardStopNames.join(", ")}) hold 0 waivers.`,
      commands: activeWaiverPlaybooks.map(
        (w) => `# Close ${w.station} waiver (expires ${w.expiresAt}, owner ${w.owner}):\n${w.reprobeCommand}`,
      ),
      verificationSteps: activeWaiverPlaybooks.map(
        (w) =>
          `${w.station}: Owner ${w.owner} closes before ${w.expiresAt} (${w.daysRemaining ?? 0}d left). Fallback: ${w.rollbackPlan}`,
      ),
    });
  }

  return {
    accountId: account.id,
    accountName: account.name,
    generatedAt,
    stackSummary: { ...account.stack },
    primaryContacts: {
      leadFde: account.fde_owner,
      leadCse: account.cse_owner,
      supportOwner: account.support_owner ?? "support-oncall@vendor.io",
      tamOwner: account.tam_owner ?? "tam-lead@vendor.io",
      customerEngLead: account.customer_eng_lead,
      customerSreLead: account.customer_sre_lead ?? account.customer_eng_lead,
    },
    verifiedBaselines: {
      authProtocol: sold.auth.protocol,
      allowedRegions: [...sold.residency.allowed_regions],
      guaranteedRps: sold.quota.guaranteed_rps,
      p1Channel: sold.alerting.p1_channel,
      maxRtoMinutes: sold.rollback.max_rto_minutes,
      staticFireGrade: gate2.grade,
      staticFireCorruptionPct: gate2.corruptionPct,
    },
    activeWaiverPlaybooks,
    sections,
  };
}

export interface BuildDossierInput {
  config: NominalXConfig;
  gate1: FlightCheckResult;
  gate2: StaticFireResult;
  gate3: CrewDrillResult;
  signers?: Partial<DossierSigners>;
  generatedAt?: string;
}

export function buildDossier(input: BuildDossierInput): SignedNominalDossier {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const { config, gate1, gate2, gate3 } = input;

  const signers: DossierSigners = {
    leadFde: input.signers?.leadFde ?? config.account.fde_owner,
    leadCse: input.signers?.leadCse ?? config.account.cse_owner,
    customerEngLead:
      input.signers?.customerEngLead ?? config.account.customer_eng_lead,
    supportAckOwner:
      input.signers?.supportAckOwner ??
      config.account.support_owner ??
      "support-oncall@vendor.io",
    signedAt: input.signers?.signedAt ?? generatedAt,
  };

  let verdict: DossierVerdict;
  let masterVerdict: MasterVerdict;
  if (!gate1.passed || !gate2.passed || !gate3.allStabilized) {
    verdict = "NO_GO";
    masterVerdict = "NO_GO";
  } else if (gate1.waiverAudit.activeWaivers.length > 0) {
    verdict = "NOMINAL_WITH_WAIVERS";
    masterVerdict = "CONDITIONAL_GO";
  } else {
    verdict = "NOMINAL";
    masterVerdict = "NOMINAL";
  }

  const runbook = generateDay1Runbook(
    config,
    gate1,
    gate2,
    gate3,
    generatedAt,
  );

  const enforcedHardStops = gate1.stations
    .filter((s) => s.isHardStop)
    .map((s) => s.stationLabel);

  const scopeSummary = {
    inScopeVerified: [
      `Stage 2 · Gate 1 (1 of 3): Flight Check — ${gate1.counts.total}/${gate1.counts.total} stations diffed Sold vs. Observed`,
      `Stage 3 · Gate 2 (2 of 3): Static Fire — ${gate2.totals.totalVectors}/${gate2.totals.totalVectors} real-world failure scenarios verified deterministically`,
      `Stage 4 · Gate 3 (3 of 3): Crew Drill — ${gate3.totalAlarms}/${gate3.totalAlarms} live timed operational alarms verified`,
      "Handover Sprint — Tamper-evident (SHA-256 signed) launch dossier & stack-tailored Day-1 Runbook",
    ],
    outOfScopeBoundaries: [
      ...LIFECYCLE_STAGES[1]!.outOfScope,
      ...LIFECYCLE_STAGES[2]!.outOfScope.slice(0, 2),
      ...LIFECYCLE_STAGES[3]!.outOfScope.slice(0, 1),
    ],
    hardStopsEnforced: enforcedHardStops,
  };

  const canonicalPayload = {
    schemaVersion: "1.0",
    documentType: "NOMINALX_SIGNED_DOSSIER",
    account: config.account,
    verdict,
    masterVerdict,
    signers,
    gate1: {
      verdict: gate1.verdict,
      referenceDate: gate1.referenceDate,
      stations: gate1.stations.map((s) => ({
        subStage: s.subStage,
        stationCode: s.stationCode,
        status: s.status,
        policyClass: s.policyClass,
        soldSummary: s.soldSummary,
        observedSummary: s.observedSummary,
      })),
      activeWaivers: gate1.waiverAudit.activeWaivers.map((w) => ({
        stationCode: w.stationCode,
        owner: w.owner,
        expiresAt: w.expiresAt,
        rollbackPlan: w.rollbackPlan,
      })),
    },
    gate2: {
      attemptNumber: gate2.attemptNumber,
      corruptionPct: gate2.corruptionPct,
      grade: gate2.grade,
      passed: gate2.passed,
      vectors: gate2.vectors.map((v) => ({
        subStage: v.subStage,
        vectorId: v.vectorId,
        passed: v.passed,
        corruptionPct: v.corruptionPct,
      })),
    },
    gate3: {
      stabilizedCount: gate3.stabilizedCount,
      overtimeCount: gate3.overtimeCount,
      allStabilized: gate3.allStabilized,
      alarms: gate3.alarms.map((a) => ({
        subStage: a.subStage,
        alarmId: a.alarmId,
        status: a.status,
        overtime: a.overtime,
        splitMs: a.splitMs,
      })),
    },
  };

  const verificationDigest = computeVerificationDigest(canonicalPayload);

  return {
    schemaVersion: "1.0",
    documentType: "NOMINALX_SIGNED_DOSSIER",
    generatedAt,
    account: config.account,
    verdict,
    masterVerdict,
    verificationDigest,
    signers,
    gate1,
    gate2,
    gate3,
    runbook,
    scopeSummary,
  };
}

export function renderDossier(
  dossier: SignedNominalDossier,
  format: ExportFormat,
): string {
  switch (format) {
    case "json":
      return `${JSON.stringify(dossier, null, 2)}\n`;
    case "md":
      return renderDossierMarkdown(dossier);
    case "slack":
      return renderDossierSlack(dossier);
  }
}

function renderDossierMarkdown(d: SignedNominalDossier): string {
  const lines: string[] = [];
  const verdictLabel = d.verdict.replace(/_/g, " ");
  const activeWaivers = d.gate1.waiverAudit.activeWaivers;

  lines.push(`# NominalX Signed Flight Readiness Dossier — ${d.account.name}`);
  lines.push("");
  lines.push(
    `> **Verdict:** \`${verdictLabel}\` | **Master Launch State:** \`${d.masterVerdict}\` | **Verification Digest:** \`${d.verificationDigest}\``,
  );
  lines.push("");
  lines.push("## Handover Sprint Sign-Off Block");
  lines.push("");
  lines.push("| Role | Named Engineer | Lifecycle Baton |");
  lines.push("|---|---|---|");
  lines.push(`| Single Accountable Owner (Lead FDE) | \`${d.signers.leadFde}\` | Stage 2 (Gate 1), Stage 3 (Gate 2), Handover Sprint |`);
  lines.push(`| Co-Signer (Lead CSE) | \`${d.signers.leadCse}\` | Stage 4 (Gate 3: Crew Drill) |`);
  lines.push(`| Co-Signer (Customer Engineering Lead) | \`${d.signers.customerEngLead}\` | Customer Production Sign-Off |`);
  lines.push(`| Receiving Owner (Support Engineer) | \`${d.signers.supportAckOwner ?? "support-oncall@vendor.io"}\` | Stage 5: Support (Day-1 Runbook) |`);
  lines.push(`| Signed At | \`${d.signers.signedAt}\` | Target Go-Live: \`${d.account.target_go_live}\` |`);
  lines.push("");

  lines.push("## Stage 2: Sales-to-FDE Handoff — Gate 1 (1 of 3): Flight Check");
  lines.push("");
  lines.push("| Sub-Stage | Station | Policy Class | Owner | Sold | Observed | Status |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const s of d.gate1.stations) {
    const policy = s.isHardStop ? "HARD STOP (Non-Waivable)" : "Operational Waiver Eligible";
    lines.push(
      `| ${s.subStage} | \`${s.stationLabel}\` | ${policy} | \`${s.accountableOwner}\` | ${s.soldSummary} | ${s.observedSummary} | **${s.status}** |`,
    );
  }
  lines.push("");

  lines.push("### Active Operational Waiver Register");
  lines.push("");
  const hardStopListMd = d.scopeSummary.hardStopsEnforced
    .map((label) => `\`${label}\``)
    .join(", ");
  if (activeWaivers.length === 0) {
    lines.push(`No active Operational Waivers (\`0 / 2\` cap used). All Hard Stops (${hardStopListMd}) verified \`NOMINAL\`.`);
  } else {
    lines.push("| Station | Named Owner | Expires At | Days Left | Aging Band | Reason | Rollback Plan |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const w of activeWaivers) {
      lines.push(
        `| \`${w.stationLabel}\` | \`${w.owner}\` | \`${w.expiresAt}\` | ${w.daysRemaining ?? 0}d | \`${w.agingBand}\` | ${w.reason} | ${w.rollbackPlan} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Stage 3: Integration & Cutover — Gate 2 (2 of 3): Static Fire");
  lines.push("");
  lines.push(
    `**Resilience Grade:** \`${d.gate2.grade}\` | **Corruption:** \`${d.gate2.corruptionPct.toFixed(1)}%\` | **Vectors Passed:** \`${d.gate2.totals.passedVectors}/${d.gate2.totals.totalVectors}\` | **Attempt:** \`#${d.gate2.attemptNumber}\``,
  );
  lines.push("");
  if (d.gate2.attemptHistory.length > 1) {
    const deltaTrail = d.gate2.attemptHistory
      .map(
        (a) =>
          `Fire #${a.attemptNumber}: ${a.corruptionPct.toFixed(1)}% (Grade ${a.grade})`,
      )
      .join(" -> ");
    lines.push(`**Before / After Fire Progression:** ${deltaTrail}`);
    lines.push("");
  }
  lines.push("| Sub-Stage | Chaos Vector | Packets Sent | Corrupted | Corruption % | Status |");
  lines.push("|---|---|---|---|---|---|");
  for (const v of d.gate2.vectors) {
    lines.push(
      `| ${v.subStage} | ${v.vectorName} | ${v.packetsSent} | ${v.packetsCorrupted} | ${v.corruptionPct.toFixed(1)}% | **${v.passed ? "NOMINAL" : "NO-GO"}** |`,
    );
  }
  lines.push("");

  lines.push("## Stage 4: Day-30 Enablement & Handover — Gate 3 (3 of 3): Crew Drill");
  lines.push("");
  lines.push(
    `**Stabilized:** \`${d.gate3.stabilizedCount}/${d.gate3.totalAlarms}\` | **Overtime Flags:** \`${d.gate3.overtimeCount}\` | **Total Split:** \`${formatSplit(d.gate3.totalSplitMs)}\``,
  );
  lines.push("");
  lines.push("| Sub-Stage | Live Day-30 Alarm | Split | Status | Verification Proof |");
  lines.push("|---|---|---|---|---|");
  for (const a of d.gate3.alarms) {
    const statusLabel =
      a.status === "stabilized"
        ? a.overtime
          ? "STABILIZED (OVERTIME)"
          : "STABILIZED"
        : a.status.toUpperCase();
    lines.push(
      `| ${a.subStage} | ${a.alarmName} | \`${formatSplit(a.splitMs)}\` | **${statusLabel}** | ${a.verificationProof ?? "Pending remediation"} |`,
    );
  }
  lines.push("");

  lines.push("## Stack-Tailored Day-1 Customer Runbook (Into Stage 5: Support)");
  lines.push("");
  lines.push(
    `- **Stack:** Cloud \`${d.runbook.stackSummary.cloud}\` · IdP \`${d.runbook.stackSummary.idp}\` · Alerting \`${d.runbook.stackSummary.alerting}\` · Runtime \`${d.runbook.stackSummary.webhook_runtime}\``,
  );
  lines.push(
    `- **Verified Baselines:** Auth \`${d.runbook.verifiedBaselines.authProtocol.toUpperCase()}\` · Regions \`[${d.runbook.verifiedBaselines.allowedRegions.join(", ")}]\` · Quota \`${d.runbook.verifiedBaselines.guaranteedRps.toLocaleString("en-US")} RPS\` · P1 \`${d.runbook.verifiedBaselines.p1Channel}\` · Max RTO \`${d.runbook.verifiedBaselines.maxRtoMinutes}m\``,
  );
  lines.push("");
  for (const section of d.runbook.sections) {
    lines.push(`### ${section.title}`);
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

  lines.push("## Scope Governance Boundaries");
  lines.push("");
  lines.push("**In-Scope Verified:**");
  for (const item of d.scopeSummary.inScopeVerified) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("**Explicitly Out-of-Scope:**");
  for (const item of d.scopeSummary.outOfScopeBoundaries) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  return lines.join("\n");
}

function renderDossierSlack(d: SignedNominalDossier): string {
  const verdictLabel = d.verdict.replace(/_/g, " ");
  const activeWaivers = d.gate1.waiverAudit.activeWaivers;
  const g1Summary = d.gate1.stations
    .map((s) => `${s.stationLabel}: \`${s.status}\``)
    .join(" · ");
  const fireDelta =
    d.gate2.attemptHistory.length > 1
      ? d.gate2.attemptHistory
          .map((a) => `#${a.attemptNumber} ${a.corruptionPct.toFixed(1)}% (${a.grade})`)
          .join(" -> ")
      : `#${d.gate2.attemptNumber} ${d.gate2.corruptionPct.toFixed(1)}% (Grade ${d.gate2.grade})`;
  const drillSplits = d.gate3.alarms
    .map(
      (a) =>
        `${a.subStage} \`${formatSplit(a.splitMs)}\`${a.overtime ? " [OVERTIME]" : ""}`,
    )
    .join(" · ");

  const lines: string[] = [
    `*NOMINALX GO-LIVE DOSSIER — ${d.account.name}*`,
    `*Verdict:* \`${verdictLabel}\` | *Target Go-Live:* \`${d.account.target_go_live}\` | *Lead FDE:* \`${d.signers.leadFde}\``,
    "",
    `*Stage 2 · Gate 1 (1 of 3): Flight Check* — \`${d.gate1.verdict}\` (${d.gate1.counts.nominal} NOMINAL, ${d.gate1.counts.heldWaived} WAIVED, ${d.gate1.counts.noGo} NO-GO)`,
    `> ${g1Summary}`,
    "",
    `*Stage 3 · Gate 2 (2 of 3): Static Fire* — Grade \`${d.gate2.grade}\` · \`${d.gate2.corruptionPct.toFixed(1)}%\` corruption (\`${d.gate2.totals.passedVectors}/${d.gate2.totals.totalVectors}\` vectors)`,
    `> Progression: ${fireDelta}`,
    "",
    `*Stage 4 · Gate 3 (3 of 3): Crew Drill* — \`${d.gate3.stabilizedCount}/${d.gate3.totalAlarms}\` alarms stabilized`,
    `> Splits: ${drillSplits}`,
    "",
    `*Active Operational Waivers (${activeWaivers.length}/2 cap; Hard Stops ${d.scopeSummary.hardStopsEnforced.join(", ")} non-waivable):*`,
  ];

  if (activeWaivers.length === 0) {
    lines.push("> None — 0 active waivers.");
  } else {
    for (const w of activeWaivers) {
      lines.push(
        `> • \`${w.stationLabel}\` | Owner: \`${w.owner}\` | Expires: \`${w.expiresAt}\` (${w.daysRemaining ?? 0}d left, \`${w.agingBand}\`) | Rollback: ${w.rollbackPlan}`,
      );
    }
  }

  lines.push("");
  lines.push(
    `*Signers:* Lead FDE \`${d.signers.leadFde}\` · Lead CSE \`${d.signers.leadCse}\` · Customer Eng Lead \`${d.signers.customerEngLead}\``,
  );
  lines.push(
    `*Stage 5 Support Handover:* Day-1 Runbook tailored for \`${d.runbook.stackSummary.cloud}\` / \`${d.runbook.stackSummary.idp}\` / \`${d.runbook.stackSummary.webhook_runtime}\` -> \`${d.signers.supportAckOwner ?? "support-oncall@vendor.io"}\``,
  );
  lines.push(`*SHA-256 Digest:* \`${d.verificationDigest}\``);
  return `${lines.join("\n")}\n`;
}
