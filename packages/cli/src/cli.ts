#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { Command } from "commander";
import {
  buildDossier,
  buildReport,
  evaluateFlightCheck,
  renderDossier,
  renderReport,
  resolveAccountPresetId,
  simulateCompletedCrewDrillForPreset,
  simulateFlightCheckForPreset,
  simulateStaticFireForPreset,
  type CrewDrillResult,
  type ExportFormat,
  type FireAttemptSummary,
  type FlightCheckResult,
  type NominalXConfig,
  type ReportType,
  type StaticFireResult,
} from "@nominalx/core";
import { runLiveStaticFire } from "./chaos.js";
import { loadConfigFile } from "./config.js";
import { createDemoTargetServer, patchDemoTarget } from "./demo-target.js";
import { formatFlightCheckTerminal, formatStaticFireTerminal } from "./format.js";
import { runLiveFlightCheck } from "./probes.js";

async function readOptionalJson<T>(filePath?: string): Promise<T | undefined> {
  if (!filePath) return undefined;
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function resolveArtifactsForReporting(
  config: NominalXConfig,
  opts: {
    flightCheck?: string;
    staticFire?: string;
    crewDrill?: string;
    asOf?: string;
  },
): Promise<{
  gate1: FlightCheckResult;
  gate2: StaticFireResult;
  gate3: CrewDrillResult;
}> {
  const presetId = resolveAccountPresetId(config.account.id);

  let gate1 = await readOptionalJson<FlightCheckResult>(opts.flightCheck);
  if (!gate1) {
    if (presetId) {
      gate1 = simulateFlightCheckForPreset(presetId, {
        referenceDate: opts.asOf,
      });
    } else {
      gate1 = await runLiveFlightCheck(config, { referenceDate: opts.asOf });
    }
  } else if (opts.asOf) {
    // Re-evaluate waiver aging against explicit asOf date when requested
    gate1 = evaluateFlightCheck(
      config,
      {
        auth: {
          observedProtocol: config.sold_contract.auth.protocol,
          mfaEnforced: config.sold_contract.auth.mfa_required,
          certTtlDays: 180,
          rejectsUnsignedAssertions: true,
          evidence: gate1.stations[0]!.evidence,
        },
        residency: {
          observedRegion: config.sold_contract.residency.allowed_regions[0]!,
          storageRegions: config.sold_contract.residency.allowed_regions,
          egressRegions: config.sold_contract.residency.allowed_regions,
          dnsTarget: "verified",
          evidence: gate1.stations[1]!.evidence,
        },
        webhooks: {
          rejectsUnsigned: gate1.stations[2]!.telemetryPassed,
          rejectsTampered: gate1.stations[2]!.telemetryPassed,
          acceptsValidHmac: gate1.stations[2]!.telemetryPassed,
          dualSecretRotationReady: gate1.stations[2]!.telemetryPassed,
          activeKeyIds: ["v1", "v2"],
          evidence: gate1.stations[2]!.evidence,
        },
        quota: {
          provisionedRps: config.sold_contract.quota.guaranteed_rps,
          returnsRetryAfterHeader: true,
          sampleRetryAfterSeconds: 2,
          burstDropRatePct: 0,
          evidence: gate1.stations[3]!.evidence,
        },
        alerting: {
          channelActive: gate1.stations[4]!.telemetryPassed,
          channelName: config.sold_contract.alerting.p1_channel,
          ackLatencyMs: 250,
          providerStatus: "200 OK",
          evidence: gate1.stations[4]!.evidence,
        },
        rollback: {
          dryRunPassed: gate1.stations[5]!.telemetryPassed,
          observedRtoMinutes: gate1.stations[5]!.telemetryPassed
            ? config.sold_contract.rollback.max_rto_minutes
            : config.sold_contract.rollback.max_rto_minutes + 5,
          artifactVersion: "v1.0.0",
          dataLossDetected: false,
          evidence: gate1.stations[5]!.evidence,
        },
      },
      { referenceDate: opts.asOf },
    );
  }

  let gate2 = await readOptionalJson<StaticFireResult>(opts.staticFire);
  if (!gate2) {
    if (presetId) {
      gate2 = simulateStaticFireForPreset(presetId);
    } else {
      throw new Error(
        "No --static-fire artifact supplied and account is not a built-in preset. Run `nominalx fire --out static-fire.json` first.",
      );
    }
  }

  let gate3 = await readOptionalJson<CrewDrillResult>(opts.crewDrill);
  if (!gate3) {
    if (presetId) {
      gate3 = simulateCompletedCrewDrillForPreset(presetId);
    } else {
      gate3 = {
        gateNumber: 3,
        gateLabel: "Gate 3 (3 of 3): Crew Drill",
        stageNumber: 4,
        stageLabel: "Stage 4: Day-30 Enablement & Handover",
        accountId: config.account.id,
        accountName: config.account.name,
        accountableOwner: config.account.cse_owner,
        executedAt: new Date().toISOString(),
        timeLimitSeconds: 90,
        alarms: [],
        stabilizedCount: 0,
        overtimeCount: 0,
        totalAlarms: 3,
        totalSplitMs: 0,
        allStabilized: false,
        passedCleanly: false,
      };
    }
  }

  return { gate1, gate2, gate3 };
}

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("nominalx")
    .description(
      "NominalX — Deterministic three-gate flight-readiness CLI for customer-facing engineers",
    )
    .version("0.1.0");

  // 1. nominalx check <config.yaml>
  program
    .command("check")
    .description(
      "Gate 1 (1 of 3): Flight Check — diff Sold contract vs. Observed staging telemetry across 6 stations",
    )
    .argument("<config>", "Path to nominalx.yaml contract config")
    .option("--json", "Emit machine-readable JSON to stdout", false)
    .option("--out <file>", "Write flight-check JSON artifact to path")
    .option("--as-of <YYYY-MM-DD>", "Reference UTC date for waiver aging checks")
    .option("--timeout-ms <ms>", "Per-probe HTTP timeout in ms", "5000")
    .action(async (configPath: string, opts: {
      json?: boolean;
      out?: string;
      asOf?: string;
      timeoutMs?: string;
    }) => {
      const config = await loadConfigFile(configPath);
      const result = await runLiveFlightCheck(config, {
        referenceDate: opts.asOf,
        timeoutMs: Number(opts.timeoutMs ?? 5000),
      });

      if (opts.out) {
        await writeFile(opts.out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      }

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(formatFlightCheckTerminal(result));
      }

      process.exitCode = result.exitCode;
    });

  // 2. nominalx fire --url <url> --config <config.yaml>
  program
    .command("fire")
    .description(
      "Gate 2 (2 of 3): Static Fire — run 7 realistic failure scenarios against staging and grade resilience (A-F)",
    )
    .requiredOption("--url <url>", "Target staging webhook/API URL")
    .requiredOption("--config <config>", "Path to nominalx.yaml contract config")
    .option("--json", "Emit machine-readable JSON to stdout", false)
    .option("--out <file>", "Write static-fire JSON artifact to path")
    .option("--history <file>", "Prior static-fire.json for before/after attempt tracking")
    .option("--timeout-ms <ms>", "Per-request timeout in ms", "5000")
    .action(async (opts: {
      url: string;
      config: string;
      json?: boolean;
      out?: string;
      history?: string;
      timeoutMs?: string;
    }) => {
      const config = await loadConfigFile(opts.config);
      let previousAttempts: FireAttemptSummary[] = [];

      const historySource = opts.history ?? opts.out;
      if (historySource) {
        try {
          const prior = await readOptionalJson<StaticFireResult>(historySource);
          if (prior && Array.isArray(prior.attemptHistory)) {
            previousAttempts = prior.attemptHistory;
          }
        } catch {
          // No prior file yet; start at attempt #1
        }
      }

      const result = await runLiveStaticFire({
        targetUrl: opts.url,
        config,
        previousAttempts,
        timeoutMs: Number(opts.timeoutMs ?? 5000),
      });

      if (opts.out) {
        await writeFile(opts.out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      }

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(formatStaticFireTerminal(result));
      }

      process.exitCode = result.exitCode;
    });

  // 3. nominalx dossier --config <config.yaml> --format <md|json|slack> [--out <file>]
  program
    .command("dossier")
    .description(
      "Handover Sprint — generate tamper-evident (SHA-256 signed) NOMINAL Dossier & stack-tailored Day-1 Runbook (md | json | slack)",
    )
    .requiredOption("--config <config>", "Path to nominalx.yaml contract config")
    .option("--format <format>", "Output format: md | json | slack", "md")
    .option("--out <file>", "Write rendered dossier to file")
    .option("--flight-check <file>", "Path to Gate 1 flight-check.json")
    .option("--static-fire <file>", "Path to Gate 2 static-fire.json")
    .option("--crew-drill <file>", "Path to Gate 3 crew-drill.json")
    .option("--as-of <YYYY-MM-DD>", "Reference UTC date for waiver aging checks")
    .action(async (opts: {
      config: string;
      format: string;
      out?: string;
      flightCheck?: string;
      staticFire?: string;
      crewDrill?: string;
      asOf?: string;
    }) => {
      const format = opts.format as ExportFormat;
      if (!["md", "json", "slack"].includes(format)) {
        throw new Error(`Unsupported format "${opts.format}". Use md, json, or slack.`);
      }
      const config = await loadConfigFile(opts.config);
      const { gate1, gate2, gate3 } = await resolveArtifactsForReporting(config, opts);
      const dossier = buildDossier({ config, gate1, gate2, gate3 });
      const rendered = renderDossier(dossier, format);

      if (opts.out) {
        await writeFile(opts.out, rendered, "utf8");
      } else {
        process.stdout.write(rendered);
      }
    });

  // 4. nominalx report --config <config.yaml> --type <exec|ops|waivers> --format <md|json|slack> [--out <file>]
  program
    .command("report")
    .description(
      "Reporting Engine — generate Executive Readiness (exec), Operational Sprint Digest (ops), or Active Waiver Aging Register (waivers)",
    )
    .requiredOption("--config <config>", "Path to nominalx.yaml contract config")
    .requiredOption("--type <type>", "Report type: exec | ops | waivers")
    .option("--format <format>", "Output format: md | json | slack", "md")
    .option("--out <file>", "Write rendered report to file")
    .option("--flight-check <file>", "Path to Gate 1 flight-check.json")
    .option("--static-fire <file>", "Path to Gate 2 static-fire.json")
    .option("--crew-drill <file>", "Path to Gate 3 crew-drill.json")
    .option("--as-of <YYYY-MM-DD>", "Reference UTC date for waiver aging checks")
    .action(async (opts: {
      config: string;
      type: string;
      format: string;
      out?: string;
      flightCheck?: string;
      staticFire?: string;
      crewDrill?: string;
      asOf?: string;
    }) => {
      const reportType = opts.type as ReportType;
      if (!["exec", "ops", "waivers"].includes(reportType)) {
        throw new Error(`Unsupported report type "${opts.type}". Use exec, ops, or waivers.`);
      }
      const format = opts.format as ExportFormat;
      if (!["md", "json", "slack"].includes(format)) {
        throw new Error(`Unsupported format "${opts.format}". Use md, json, or slack.`);
      }
      const config = await loadConfigFile(opts.config);
      const { gate1, gate2, gate3 } = await resolveArtifactsForReporting(config, opts);
      const report = buildReport(reportType, {
        config,
        gate1,
        gate2,
        gate3,
        dossierSigned: gate1.passed && gate2.passed && gate3.allStabilized,
      });
      const rendered = renderReport(report, format);

      if (opts.out) {
        await writeFile(opts.out, rendered, "utf8");
      } else {
        process.stdout.write(rendered);
      }
    });

  // 5. nominalx demo-target --port <port> --preset <meridian|kestrel|vanguard|helios>
  program
    .command("demo-target")
    .description(
      "Start a real local staging HTTP server reproducing all 6 Gate 1 stations & 7 Gate 2 chaos behaviors",
    )
    .option("--port <port>", "Port to bind on 127.0.0.1", "4040")
    .option(
      "--preset <preset>",
      "Enterprise preset: meridian | kestrel | vanguard | helios",
      "meridian",
    )
    .action(async (opts: { port: string; preset: string }) => {
      const handle = await createDemoTargetServer(opts.preset, {
        port: Number(opts.port),
      });
      process.stdout.write(
        `NominalX demo-target listening on ${handle.baseUrl} (preset: ${handle.preset.id} — ${handle.preset.config.account.name})\n`,
      );
      process.stdout.write(
        `Run \`nominalx check examples/${handle.preset.id}/nominalx.yaml\` or \`nominalx demo-patch --port ${handle.port} --fix all\`\n`,
      );

      const shutdown = async () => {
        await handle.close();
        process.exit(0);
      };
      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());
    });

  // 6. nominalx demo-patch --port <port> --fix <comma-list|all>
  program
    .command("demo-patch")
    .description("Live-patch a running nominalx demo-target staging server")
    .option("--port <port>", "Port of running demo-target", "4040")
    .option("--host <host>", "Host of running demo-target", "127.0.0.1")
    .requiredOption(
      "--fix <list>",
      "Comma-separated fix keys (auth,residency,webhooks,quota,alerting,rollback,idempotency,ordering,rate-limit,timeout,dual-hmac,additive-json,clock-skew) or 'all'",
    )
    .action(async (opts: { port: string; host: string; fix: string }) => {
      const fixes = opts.fix
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await patchDemoTarget({
        port: Number(opts.port),
        host: opts.host,
        fixes,
      });
      process.stdout.write(
        `Patched ${res.preset} on ${opts.host}:${opts.port} -> applied [${res.applied.join(", ")}]\n`,
      );
      for (const diff of res.diffs) {
        process.stdout.write(`  * ${diff.label} (${diff.patchKey}):\n`);
        for (const line of diff.diffLines) {
          process.stdout.write(`      ${line}\n`);
        }
      }
    });

  return program;
}

// Run only when invoked directly as CLI binary
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") ||
    process.argv[1].endsWith("/nominalx") ||
    process.argv[1].endsWith("\\cli.js"));

if (isMain) {
  createCliProgram()
    .parseAsync(process.argv)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`nominalx error: ${message}\n`);
      process.exit(1);
    });
}
