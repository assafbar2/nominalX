import { execFile } from "node:child_process";
import http from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { hmacSha256Hex } from "@nominalx/core";
import { DEMO_SECRET_CURRENT, DEMO_SECRET_NEXT } from "../src/config.js";
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

  it("executes live HTTP probes for custom Hard Stop stations, disabled built-in vectors, and custom chaos vectors", async () => {
    let pciPatched = false;
    let idempotencyValidatorPatched = false;
    const seenEvents = new Map<string, number>();
    const entityStates = new Map<string, { state: string; version: number }>();

    const customServer = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathname = urlObj.pathname;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const rawBody = Buffer.concat(chunks).toString("utf8");

      const reply = (
        status: number,
        payload: unknown,
        headers: Record<string, string> = {},
      ) => {
        const body = JSON.stringify(payload);
        res.writeHead(status, {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          ...headers,
        });
        res.end(body);
      };

      if (pathname === "/sso/metadata") {
        reply(200, {
          protocol: "saml2",
          mfa_enforced: true,
          cert_ttl_days: 180,
          reject_unsigned_assertions: true,
        });
        return;
      }
      if (pathname === "/health/region") {
        reply(
          200,
          {
            region: "eu-central-1",
            storage_regions: ["eu-central-1"],
            egress_regions: ["eu-central-1"],
          },
          { "x-served-region": "eu-central-1" },
        );
        return;
      }
      if (pathname === "/internal/quota") {
        reply(
          200,
          {
            provisioned_rps: 50000,
            returns_retry_after: true,
            sample_retry_after_seconds: 2,
            burst_drop_rate_pct: 0,
          },
          { "x-ratelimit-limit": "50000", "retry-after": "2" },
        );
        return;
      }
      if (pathname === "/alerts/test") {
        reply(200, {
          channel_active: true,
          channel_name: "#payments-p1-ops",
          ack_latency_ms: 190,
        });
        return;
      }
      if (pathname === "/internal/rollback/dry-run") {
        reply(200, {
          dry_run_passed: true,
          observed_rto_minutes: 3.0,
          artifact_version: "v2.5.0",
          data_loss_detected: false,
        });
        return;
      }
      if (pathname === "/pci/vault/health") {
        if (!pciPatched) {
          reply(
            200,
            { tokenization: { pan_isolation: false } },
            { "x-pci-vault-mode": "software-fallback" },
          );
        } else {
          reply(
            200,
            { tokenization: { pan_isolation: true } },
            { "x-pci-vault-mode": "HSM-FIPS-140-3" },
          );
        }
        return;
      }
      if (pathname === "/webhooks/events") {
        const sig = String(req.headers["x-nominalx-signature"] ?? "");
        const ts = Number(req.headers["x-nominalx-timestamp"] ?? 0);
        const vector = String(req.headers["x-nominalx-vector"] ?? "");
        if (!sig) {
          reply(401, { error: "missing_signature" });
          return;
        }
        const v1 = `v1=${hmacSha256Hex(DEMO_SECRET_CURRENT, `${ts}.${rawBody}`)}`;
        const v2 = `v2=${hmacSha256Hex(DEMO_SECRET_NEXT, `${ts}.${rawBody}`)}`;
        if (sig !== v1 && sig !== v2) {
          reply(401, { error: "invalid_signature" });
          return;
        }
        if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
          reply(401, { error: "stale_timestamp" });
          return;
        }

        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        if (vector === "malformed_idempotency_key") {
          if (idempotencyValidatorPatched) {
            reply(400, { error: "malformed_idempotency_key_rejected" });
          } else {
            reply(500, { error: "unhandled_key_length_crash" });
          }
          return;
        }
        if (vector === "rate_limit_429") {
          const idx = Number(req.headers["x-nominalx-burst-index"] ?? 0);
          if (idx >= 4) {
            reply(429, { backoff_honored: true }, { "retry-after": "2" });
            return;
          }
        }
        if (vector === "upstream_timeout_30s") {
          reply(
            202,
            { dlq_routed: true, worker_exhaustion: false },
            { "x-nominalx-dlq-routed": "true" },
          );
          return;
        }

        const eventId = String(parsed.event_id ?? "");
        const prev = seenEvents.get(eventId) ?? 0;
        if (prev > 0) {
          reply(200, { deduplicated: true, mutations: prev });
          return;
        }
        seenEvents.set(eventId, prev + 1);

        const entityId = String(parsed.entity_id ?? "");
        const ver = Number(parsed.version ?? 1);
        const state = String(
          ((parsed.data as Record<string, unknown> | undefined)?.state) ??
            "ok",
        );
        if (entityId) {
          const cur = entityStates.get(entityId);
          if (!cur || (ver > cur.version && cur.state !== "canceled")) {
            entityStates.set(entityId, { state, version: ver });
          }
          reply(200, {
            ok: true,
            mutations: 1,
            entity_state: entityStates.get(entityId)!.state,
          });
          return;
        }
        reply(200, { ok: true, mutations: 1 });
        return;
      }

      reply(404, { error: "not_found" });
    });

    await new Promise<void>((resolve) =>
      customServer.listen(0, "127.0.0.1", () => resolve()),
    );
    const addr = customServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), "nominalx-custom-"));
      tempDirs.push(tmpDir);

      const templateYaml = await readFile(
        path.join(EXAMPLES_DIR, "custom-payments-api/nominalx.yaml"),
        "utf8",
      );
      const liveYaml = templateYaml
        .replace("http://127.0.0.1:4040", baseUrl)
        .replace(
          "disabled_vectors: []",
          'disabled_vectors:\n    - "additive_json_fields"',
        );

      const cfgPath = path.join(tmpDir, "custom-payments.yaml");
      await writeFile(cfgPath, liveYaml, "utf8");

      // 1. Custom Hard Stop PCI_TOKEN_VAULT fails initially -> NO_GO, exit code 1
      const c1 = await runCli([
        "check",
        cfgPath,
        "--as-of",
        "2026-11-20",
        "--json",
      ]);
      expect(c1.exitCode).toBe(1);
      const fc1 = JSON.parse(c1.stdout);
      expect(fc1.verdict).toBe("NO_GO");
      expect(fc1.counts.total).toBe(7);
      expect(fc1.counts.hardStopFailures).toBe(1);
      const pci1 = fc1.stations.find(
        (s: { stationCode: string }) => s.stationCode === "PCI_TOKEN_VAULT",
      );
      expect(pci1.status).toBe("NO_GO");
      expect(pci1.isHardStop).toBe(true);
      expect(pci1.evidence.highlightLines.join(" ")).toContain(
        "software-fallback",
      );

      // 2. Attempt illegal waiver on custom Hard Stop PCI_TOKEN_VAULT -> HARD_STOP_WAIVER_FORBIDDEN
      const illegalWaiverPath = path.join(tmpDir, "custom-illegal.yaml");
      await writeFile(
        illegalWaiverPath,
        liveYaml.replace(
          'station: "ROLLBACK"',
          'station: "PCI_TOKEN_VAULT"',
        ),
        "utf8",
      );
      const cIllegal = await runCli([
        "check",
        illegalWaiverPath,
        "--as-of",
        "2026-11-20",
        "--json",
      ]);
      expect(cIllegal.exitCode).toBe(1);
      const fcIllegal = JSON.parse(cIllegal.stdout);
      expect(fcIllegal.waiverAudit.hardStopViolations).toHaveLength(1);
      expect(fcIllegal.waiverAudit.hardStopViolations[0].violationCode).toBe(
        "HARD_STOP_WAIVER_FORBIDDEN",
      );

      // 3. Patch PCI vault endpoint -> live check passes 7/7 NOMINAL
      pciPatched = true;
      const c2 = await runCli([
        "check",
        cfgPath,
        "--as-of",
        "2026-11-20",
        "--json",
      ]);
      expect(c2.exitCode).toBe(0);
      const fc2 = JSON.parse(c2.stdout);
      expect(fc2.verdict).toBe("NOMINAL");
      expect(fc2.counts.nominal).toBe(7);
      expect(fc2.counts.total).toBe(7);

      // 4. Static Fire with 1 disabled built-in + 1 custom vector (initially failing)
      const f1 = await runCli([
        "fire",
        "--url",
        `${baseUrl}/webhooks/events`,
        "--config",
        cfgPath,
        "--json",
      ]);
      expect(f1.exitCode).toBe(1);
      const sf1 = JSON.parse(f1.stdout);
      expect(sf1.totals.totalVectors).toBe(7); // 7 - 1 disabled + 1 custom
      expect(sf1.totals.failedVectors).toBe(1);
      expect(
        sf1.vectors.some(
          (v: { vectorId: string }) => v.vectorId === "additive_json_fields",
        ),
      ).toBe(false);
      const customVec1 = sf1.vectors.find(
        (v: { vectorId: string }) =>
          v.vectorId === "malformed_idempotency_key",
      );
      expect(customVec1.passed).toBe(false);

      // 5. Patch custom idempotency validator -> Grade A 0.0% across 7/7 active vectors
      idempotencyValidatorPatched = true;
      seenEvents.clear();
      entityStates.clear();
      const f2 = await runCli([
        "fire",
        "--url",
        `${baseUrl}/webhooks/events`,
        "--config",
        cfgPath,
        "--json",
      ]);
      expect(f2.exitCode).toBe(0);
      const sf2 = JSON.parse(f2.stdout);
      expect(sf2.passed).toBe(true);
      expect(sf2.grade).toBe("A");
      expect(sf2.corruptionPct).toBe(0);
      expect(sf2.totals.passedVectors).toBe(7);
      expect(sf2.totals.totalVectors).toBe(7);
    } finally {
      await new Promise<void>((resolve) => customServer.close(() => resolve()));
    }
  });
});
