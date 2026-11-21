import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoTargetServer, type DemoTargetHandle } from "../src/demo-target.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, "../dist/cli.js");
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples");

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<CliRunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_BIN, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("nominalx CLI end-to-end against real demo-target HTTP server", () => {
  const handles: DemoTargetHandle[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (handles.length > 0) {
      await handles.pop()!.close();
    }
    while (tempDirs.length > 0) {
      await rm(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("runs full Meridian lifecycle: check -> demo-patch -> check -> fire -> demo-patch -> fire -> dossier & reports", async () => {
    const server = await createDemoTargetServer("meridian", { port: 0 });
    handles.push(server);

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "nominalx-e2e-"));
    tempDirs.push(tmpDir);

    const templateYaml = await readFile(
      path.join(EXAMPLES_DIR, "meridian-fintech/nominalx.yaml"),
      "utf8",
    );
    const configPath = path.join(tmpDir, "meridian.yaml");
    await writeFile(
      configPath,
      templateYaml.replace("http://127.0.0.1:4040", server.baseUrl),
      "utf8",
    );

    const flightCheckPath = path.join(tmpDir, "flight-check.json");
    const staticFirePath = path.join(tmpDir, "static-fire.json");
    const dossierMdPath = path.join(tmpDir, "dossier.md");
    const dossierJsonPath = path.join(tmpDir, "dossier.json");

    // 1. Gate 1 initial check -> NO_GO (RESIDENCY + WEBHOOKS failing, ROLLBACK waived)
    const check1 = await runCli([
      "check",
      configPath,
      "--as-of",
      "2026-11-20",
      "--out",
      flightCheckPath,
    ]);
    expect(check1.exitCode).toBe(1);
    expect(check1.stdout).toContain("Gate 1 (1 of 3): Flight Check");
    expect(check1.stdout).toContain("HARD STOP");
    const fc1 = JSON.parse(await readFile(flightCheckPath, "utf8"));
    expect(fc1.verdict).toBe("NO_GO");
    expect(fc1.counts.noGo).toBe(2);
    expect(fc1.counts.heldWaived).toBe(1);

    // 2. Patch residency + webhooks live via demo-patch CLI
    const patch1 = await runCli([
      "demo-patch",
      "--port",
      String(server.port),
      "--fix",
      "residency,webhooks",
    ]);
    expect(patch1.exitCode).toBe(0);
    expect(patch1.stdout).toContain("residency");

    // 3. Gate 1 re-check -> CONDITIONAL_GO (exit 0, 5/6 NOMINAL + 1 HOLD_WAIVED)
    const check2 = await runCli([
      "check",
      configPath,
      "--as-of",
      "2026-11-20",
      "--out",
      flightCheckPath,
    ]);
    expect(check2.exitCode).toBe(0);
    const fc2 = JSON.parse(await readFile(flightCheckPath, "utf8"));
    expect(fc2.verdict).toBe("CONDITIONAL_GO");
    expect(fc2.counts.nominal).toBe(5);
    expect(fc2.counts.heldWaived).toBe(1);
    expect(fc2.counts.noGo).toBe(0);

    // 4. Gate 2 Static Fire #1 -> fails on duplicate, out_of_order, dual_hmac
    const webhookUrl = `${server.baseUrl}/webhooks/events`;
    const fire1 = await runCli([
      "fire",
      "--url",
      webhookUrl,
      "--config",
      configPath,
      "--out",
      staticFirePath,
    ]);
    expect(fire1.exitCode).toBe(1);
    expect(fire1.stdout).toContain("Gate 2 (2 of 3): Static Fire");
    const sf1 = JSON.parse(await readFile(staticFirePath, "utf8"));
    expect(sf1.passed).toBe(false);
    expect(sf1.corruptionPct).toBeGreaterThan(0);
    expect(sf1.totals.failedVectors).toBe(3);
    expect(sf1.attemptNumber).toBe(1);

    // 5. Patch idempotency, ordering, dual-hmac live via demo-patch CLI
    const patch2 = await runCli([
      "demo-patch",
      "--port",
      String(server.port),
      "--fix",
      "idempotency,ordering,dual-hmac",
    ]);
    expect(patch2.exitCode).toBe(0);

    // 6. Gate 2 Static Fire #2 -> 0.0% Grade A NOMINAL with 2-attempt history
    const fire2 = await runCli([
      "fire",
      "--url",
      webhookUrl,
      "--config",
      configPath,
      "--out",
      staticFirePath,
    ]);
    expect(fire2.exitCode).toBe(0);
    expect(fire2.stdout).toContain("GRADE A");
    const sf2 = JSON.parse(await readFile(staticFirePath, "utf8"));
    expect(sf2.passed).toBe(true);
    expect(sf2.corruptionPct).toBe(0);
    expect(sf2.grade).toBe("A");
    expect(sf2.totals.passedVectors).toBe(7);
    expect(sf2.attemptHistory).toHaveLength(2);

    // 7. Signed Dossier in md, json, and slack formats
    const dMd = await runCli([
      "dossier",
      "--config",
      configPath,
      "--flight-check",
      flightCheckPath,
      "--static-fire",
      staticFirePath,
      "--format",
      "md",
      "--out",
      dossierMdPath,
    ]);
    expect(dMd.exitCode).toBe(0);
    const mdText = await readFile(dossierMdPath, "utf8");
    expect(mdText).toContain("NOMINAL WITH WAIVERS");
    expect(mdText).toContain("sha256:");
    expect(mdText).toContain("Day-1 Customer Runbook");

    const dJson = await runCli([
      "dossier",
      "--config",
      configPath,
      "--flight-check",
      flightCheckPath,
      "--static-fire",
      staticFirePath,
      "--format",
      "json",
      "--out",
      dossierJsonPath,
    ]);
    expect(dJson.exitCode).toBe(0);
    const parsedDossier = JSON.parse(await readFile(dossierJsonPath, "utf8"));
    expect(parsedDossier.verdict).toBe("NOMINAL_WITH_WAIVERS");
    expect(parsedDossier.verificationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const dSlack = await runCli([
      "dossier",
      "--config",
      configPath,
      "--flight-check",
      flightCheckPath,
      "--static-fire",
      staticFirePath,
      "--format",
      "slack",
    ]);
    expect(dSlack.exitCode).toBe(0);
    expect(dSlack.stdout).toContain("*NOMINALX GO-LIVE DOSSIER");

    // 8. Executive, Operational, and Waiver reports
    for (const type of ["exec", "ops", "waivers"] as const) {
      const repMd = await runCli([
        "report",
        "--config",
        configPath,
        "--flight-check",
        flightCheckPath,
        "--static-fire",
        staticFirePath,
        "--type",
        type,
        "--format",
        "md",
      ]);
      expect(repMd.exitCode).toBe(0);
      expect(repMd.stdout).toContain("sha256:");

      const repJson = await runCli([
        "report",
        "--config",
        configPath,
        "--flight-check",
        flightCheckPath,
        "--static-fire",
        staticFirePath,
        "--type",
        type,
        "--format",
        "json",
      ]);
      expect(repJson.exitCode).toBe(0);
      expect(JSON.parse(repJson.stdout).reportType).toBe(type);

      const repSlack = await runCli([
        "report",
        "--config",
        configPath,
        "--flight-check",
        flightCheckPath,
        "--static-fire",
        staticFirePath,
        "--type",
        type,
        "--format",
        "slack",
      ]);
      expect(repSlack.exitCode).toBe(0);
      expect(repSlack.stdout.length).toBeGreaterThan(80);
    }
  });

  it("enforces Hard Stop waiver rejection in live CLI check and passes Kestrel after --fix all", async () => {
    const server = await createDemoTargetServer("kestrel", { port: 0 });
    handles.push(server);

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "nominalx-kestrel-"));
    tempDirs.push(tmpDir);

    const templateYaml = await readFile(
      path.join(EXAMPLES_DIR, "kestrel-health/nominalx.yaml"),
      "utf8",
    );

    // Inject an illegal AUTH / SSO Hard Stop waiver
    const illegalYaml = templateYaml
      .replace("http://127.0.0.1:4041", server.baseUrl)
      .replace(
        "waivers: []",
        `waivers:
  - station: "AUTH / SSO"
    owner: "marcus.wright@kestrel.example"
    reason: "Attempting to waive expiring SSO cert"
    expires_at: "2026-12-01"
    rollback_plan: "Rotate cert later"`,
      );

    const illegalConfigPath = path.join(tmpDir, "kestrel-illegal.yaml");
    await writeFile(illegalConfigPath, illegalYaml, "utf8");

    const illegalCheck = await runCli([
      "check",
      illegalConfigPath,
      "--as-of",
      "2026-11-20",
      "--json",
    ]);
    expect(illegalCheck.exitCode).toBe(1);
    const parsedIllegal = JSON.parse(illegalCheck.stdout);
    expect(parsedIllegal.verdict).toBe("NO_GO");
    expect(parsedIllegal.waiverAudit.hardStopViolations).toHaveLength(1);
    expect(parsedIllegal.waiverAudit.hardStopViolations[0].violationCode).toBe(
      "HARD_STOP_WAIVER_FORBIDDEN",
    );

    // Now test clean Kestrel config + patch all -> both check and fire pass NOMINAL
    const cleanConfigPath = path.join(tmpDir, "kestrel-clean.yaml");
    await writeFile(
      cleanConfigPath,
      templateYaml.replace("http://127.0.0.1:4041", server.baseUrl),
      "utf8",
    );

    const patchAll = await runCli([
      "demo-patch",
      "--port",
      String(server.port),
      "--fix",
      "all",
    ]);
    expect(patchAll.exitCode).toBe(0);

    const cleanCheck = await runCli([
      "check",
      cleanConfigPath,
      "--as-of",
      "2026-11-20",
      "--json",
    ]);
    expect(cleanCheck.exitCode).toBe(0);
    expect(JSON.parse(cleanCheck.stdout).verdict).toBe("NOMINAL");

    const cleanFire = await runCli([
      "fire",
      "--url",
      `${server.baseUrl}/webhooks/events`,
      "--config",
      cleanConfigPath,
      "--json",
    ]);
    expect(cleanFire.exitCode).toBe(0);
    const parsedFire = JSON.parse(cleanFire.stdout);
    expect(parsedFire.grade).toBe("A");
    expect(parsedFire.corruptionPct).toBe(0);
  });

  it("verifies Vanguard Retail (429 burst + quota) and Helios Logistics (near-launch waiver) end-to-end", async () => {
    // Vanguard Retail
    const vServer = await createDemoTargetServer("vanguard", { port: 0 });
    handles.push(vServer);
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "nominalx-vh-"));
    tempDirs.push(tmpDir);

    const vTemplate = await readFile(
      path.join(EXAMPLES_DIR, "vanguard-retail/nominalx.yaml"),
      "utf8",
    );
    const vConfig = path.join(tmpDir, "vanguard.yaml");
    await writeFile(
      vConfig,
      vTemplate.replace("http://127.0.0.1:4042", vServer.baseUrl),
      "utf8",
    );

    const vCheck1 = await runCli(["check", vConfig, "--as-of", "2026-11-20", "--json"]);
    expect(vCheck1.exitCode).toBe(1);
    expect(JSON.parse(vCheck1.stdout).counts.noGo).toBe(2);

    await runCli(["demo-patch", "--port", String(vServer.port), "--fix", "all"]);
    const vCheck2 = await runCli(["check", vConfig, "--as-of", "2026-11-20", "--json"]);
    expect(vCheck2.exitCode).toBe(0);
    expect(JSON.parse(vCheck2.stdout).verdict).toBe("NOMINAL");

    const vFire = await runCli([
      "fire",
      "--url",
      `${vServer.baseUrl}/webhooks/events`,
      "--config",
      vConfig,
      "--json",
    ]);
    expect(vFire.exitCode).toBe(0);
    expect(JSON.parse(vFire.stdout).grade).toBe("A");

    // Helios Logistics (immediately CONDITIONAL_GO on Gate 1 with 1 valid waiver)
    const hServer = await createDemoTargetServer("helios", { port: 0 });
    handles.push(hServer);
    const hTemplate = await readFile(
      path.join(EXAMPLES_DIR, "helios-logistics/nominalx.yaml"),
      "utf8",
    );
    const hConfig = path.join(tmpDir, "helios.yaml");
    await writeFile(
      hConfig,
      hTemplate.replace("http://127.0.0.1:4043", hServer.baseUrl),
      "utf8",
    );

    const hCheck = await runCli(["check", hConfig, "--as-of", "2026-11-20", "--json"]);
    expect(hCheck.exitCode).toBe(0);
    const hParsed = JSON.parse(hCheck.stdout);
    expect(hParsed.verdict).toBe("CONDITIONAL_GO");
    expect(hParsed.counts.nominal).toBe(5);
    expect(hParsed.counts.heldWaived).toBe(1);

    const hFire1 = await runCli([
      "fire",
      "--url",
      `${hServer.baseUrl}/webhooks/events`,
      "--config",
      hConfig,
      "--json",
    ]);
    expect(hFire1.exitCode).toBe(1);
    expect(JSON.parse(hFire1.stdout).totals.failedVectors).toBe(1);

    await runCli(["demo-patch", "--port", String(hServer.port), "--fix", "dual-hmac"]);
    const hFire2 = await runCli([
      "fire",
      "--url",
      `${hServer.baseUrl}/webhooks/events`,
      "--config",
      hConfig,
      "--json",
    ]);
    expect(hFire2.exitCode).toBe(0);
    expect(JSON.parse(hFire2.stdout).grade).toBe("A");
  });
});
