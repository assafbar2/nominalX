import http from "node:http";
import {
  getAccountPreset,
  hmacSha256Hex,
  type AccountPreset,
} from "@nominalx/core";
import { DEMO_SECRET_CURRENT, DEMO_SECRET_NEXT } from "./config.js";

export type DemoPatchKey =
  | "auth"
  | "residency"
  | "webhooks"
  | "quota"
  | "alerting"
  | "rollback"
  | "idempotency"
  | "ordering"
  | "rate-limit"
  | "timeout"
  | "dual-hmac"
  | "additive-json"
  | "clock-skew";

export const ALL_DEMO_PATCH_KEYS: readonly DemoPatchKey[] = [
  "auth",
  "residency",
  "webhooks",
  "quota",
  "alerting",
  "rollback",
  "idempotency",
  "ordering",
  "rate-limit",
  "timeout",
  "dual-hmac",
  "additive-json",
  "clock-skew",
];

const CORE_WEBHOOK_KEYS = new Set([
  "event_id",
  "type",
  "entity_id",
  "version",
  "data",
]);

export interface DemoTargetHandle {
  server: http.Server;
  port: number;
  baseUrl: string;
  preset: AccountPreset;
  getActivePatches: () => string[];
  close: () => Promise<void>;
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
    ...headers,
  });
  res.end(body);
}

export async function createDemoTargetServer(
  presetIdOrSlug: string,
  options: {
    port?: number;
    host?: string;
    currentSecret?: string;
    nextSecret?: string;
  } = {},
): Promise<DemoTargetHandle> {
  const preset = getAccountPreset(presetIdOrSlug);
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 4040;
  const currentSecret =
    options.currentSecret ??
    process.env.NOMINALX_WEBHOOK_SECRET ??
    DEMO_SECRET_CURRENT;
  const nextSecret =
    options.nextSecret ??
    process.env.NOMINALX_WEBHOOK_SECRET_NEXT ??
    DEMO_SECRET_NEXT;

  const activePatches = new Set<DemoPatchKey>();
  const failingChaosSet = new Set(preset.initialChaosFailures);

  // Stateful webhook runtime stores to prove real mutation/ordering behavior
  const eventMutationCount = new Map<string, number>();
  const entityStates = new Map<string, { state: string; version: number }>();

  const isPatched = (key: DemoPatchKey): boolean => activePatches.has(key);

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url ?? "/", `http://${host}`);
    const pathname = urlObj.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    // Control plane: state inspection
    if (method === "GET" && pathname === "/_nominalx/state") {
      sendJson(res, 200, {
        preset: preset.id,
        account_name: preset.config.account.name,
        active_patches: [...activePatches],
      });
      return;
    }

    // Control plane: live patching
    if (method === "POST" && pathname === "/_nominalx/patch") {
      const raw = await readRequestBody(req);
      let fixes: string[] = [];
      try {
        const parsed = JSON.parse(raw) as { fixes?: string[] };
        fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }

      const applied: string[] = [];
      for (const rawFix of fixes) {
        const normalized = rawFix.trim().toLowerCase();
        if (normalized === "all") {
          for (const k of ALL_DEMO_PATCH_KEYS) {
            activePatches.add(k);
            applied.push(k);
          }
        } else if (
          (ALL_DEMO_PATCH_KEYS as readonly string[]).includes(normalized)
        ) {
          activePatches.add(normalized as DemoPatchKey);
          applied.push(normalized);
        }
      }

      // Reset transient runtime dedupe/entity state so re-fire starts clean
      eventMutationCount.clear();
      entityStates.clear();

      const matchingDiffs = preset.patchDiffs.filter(
        (d) =>
          applied.includes(d.patchKey) ||
          fixes.some((f) => f.trim().toLowerCase() === "all"),
      );

      sendJson(res, 200, {
        ok: true,
        preset: preset.id,
        applied: [...new Set(applied)],
        active_patches: [...activePatches],
        diffs: matchingDiffs,
      });
      return;
    }

    // Station 1: AUTH / SSO
    if (method === "GET" && pathname === preset.config.environment.endpoints.auth_metadata) {
      const obs = isPatched("auth")
        ? preset.patchedObserved.auth
        : preset.initialObserved.auth;
      sendJson(
        res,
        obs.evidence.httpStatus,
        {
          protocol: obs.observedProtocol,
          mfa_enforced: obs.mfaEnforced,
          cert_ttl_days: obs.certTtlDays,
          reject_unsigned_assertions: obs.rejectsUnsignedAssertions,
          idp_issuer: obs.idpIssuer,
          cert_fingerprint: obs.certFingerprint,
        },
        obs.evidence.headers,
      );
      return;
    }

    // Station 2: RESIDENCY
    if (method === "GET" && pathname === preset.config.environment.endpoints.residency_probe) {
      const obs = isPatched("residency")
        ? preset.patchedObserved.residency
        : preset.initialObserved.residency;
      sendJson(
        res,
        obs.evidence.httpStatus,
        {
          region: obs.observedRegion,
          storage_regions: obs.storageRegions,
          egress_regions: obs.egressRegions,
          dns_target: obs.dnsTarget,
        },
        {
          "x-served-region": obs.observedRegion,
        },
      );
      return;
    }

    // Station 4: QUOTA / RATE
    if (method === "GET" && pathname === preset.config.environment.endpoints.quota_status) {
      const obs = isPatched("quota")
        ? preset.patchedObserved.quota
        : preset.initialObserved.quota;
      const headers: Record<string, string> = {
        "x-ratelimit-limit": String(obs.provisionedRps),
      };
      if (obs.returnsRetryAfterHeader && obs.sampleRetryAfterSeconds !== null) {
        headers["retry-after"] = String(obs.sampleRetryAfterSeconds);
      }
      sendJson(
        res,
        obs.evidence.httpStatus,
        {
          provisioned_rps: obs.provisionedRps,
          returns_retry_after: obs.returnsRetryAfterHeader,
          sample_retry_after_seconds: obs.sampleRetryAfterSeconds,
          burst_drop_rate_pct: obs.burstDropRatePct,
        },
        headers,
      );
      return;
    }

    // Station 5: ALERTING
    if (method === "POST" && pathname === preset.config.environment.endpoints.alert_sink) {
      const obs = isPatched("alerting")
        ? preset.patchedObserved.alerting
        : preset.initialObserved.alerting;
      sendJson(
        res,
        obs.channelActive ? 200 : 404,
        {
          channel_active: obs.channelActive,
          channel_name: obs.channelName,
          ack_latency_ms: obs.ackLatencyMs,
          provider_status: obs.providerStatus,
        },
        { "x-alert-channel": obs.channelName },
      );
      return;
    }

    // Station 6: ROLLBACK
    if (method === "POST" && pathname === preset.config.environment.endpoints.rollback_check) {
      const obs = isPatched("rollback")
        ? preset.patchedObserved.rollback
        : preset.initialObserved.rollback;
      sendJson(
        res,
        200,
        {
          dry_run_passed: obs.dryRunPassed,
          observed_rto_minutes: obs.observedRtoMinutes,
          artifact_version: obs.artifactVersion,
          data_loss_detected: obs.dataLossDetected,
        },
        { "x-release-artifact": obs.artifactVersion },
      );
      return;
    }

    // Station 3 & Gate 2 Static Fire: WEBHOOKS
    if (method === "POST" && pathname === preset.config.environment.endpoints.webhook_ingress) {
      const rawBody = await readRequestBody(req);
      const vector = String(req.headers["x-nominalx-vector"] ?? "");
      const sigHeader = req.headers["x-nominalx-signature"]
        ? String(req.headers["x-nominalx-signature"])
        : "";
      const tsHeader = req.headers["x-nominalx-timestamp"]
        ? Number(req.headers["x-nominalx-timestamp"])
        : null;

      const whObs = isPatched("webhooks")
        ? preset.patchedObserved.webhooks
        : preset.initialObserved.webhooks;

      // 1. Unsigned check
      if (!sigHeader) {
        if (whObs.rejectsUnsigned) {
          sendJson(res, 401, { error: "missing_hmac_signature" });
        } else {
          sendJson(res, 200, {
            ok: true,
            warning: "unsigned_payload_accepted_insecurely",
          });
        }
        return;
      }

      // 2. Signature verification (current v1 + optional staged v2)
      const dualKeyEnabled =
        vector === "dual_hmac_rotation"
          ? !failingChaosSet.has("dual_hmac_rotation") || isPatched("dual-hmac")
          : whObs.dualSecretRotationReady || isPatched("dual-hmac");

      const timestampForHmac = tsHeader ?? Math.floor(Date.now() / 1000);
      const expectedV1 = `v1=${hmacSha256Hex(currentSecret, `${timestampForHmac}.${rawBody}`)}`;
      const expectedV2 = `v2=${hmacSha256Hex(nextSecret, `${timestampForHmac}.${rawBody}`)}`;

      const matchesV1 = sigHeader === expectedV1;
      const matchesV2 = dualKeyEnabled && sigHeader === expectedV2;

      if (!matchesV1 && !matchesV2) {
        if (!whObs.rejectsTampered && !isPatched("webhooks")) {
          // Vanguard unpatched accepts tampered signatures
          sendJson(res, 200, { ok: true, warning: "tampered_hmac_bypassed" });
          return;
        }
        sendJson(res, 401, {
          error: "invalid_hmac_signature",
          dual_key_enabled: dualKeyEnabled,
        });
        return;
      }

      // 3. Clock skew check (Vector 7)
      if (tsHeader !== null) {
        const nowSec = Math.floor(Date.now() / 1000);
        const diffSec = Math.abs(nowSec - tsHeader);
        const skewBroken =
          failingChaosSet.has("clock_skew_5m") && !isPatched("clock-skew");
        const maxAllowedSkew = skewBroken
          ? 30
          : preset.config.sold_contract.webhooks.max_clock_skew_seconds;
        if (diffSec > maxAllowedSkew) {
          sendJson(res, 401, {
            error: "timestamp_outside_replay_window",
            skew_seconds: diffSec,
            max_allowed_seconds: maxAllowedSkew,
          });
          return;
        }
      }

      // 4. Parse JSON & check additive unknown fields (Vector 6)
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { error: "invalid_json" });
        return;
      }

      const additiveBroken =
        failingChaosSet.has("additive_json_fields") && !isPatched("additive-json");
      if (additiveBroken) {
        const unknownKeys = Object.keys(payload).filter(
          (k) => !CORE_WEBHOOK_KEYS.has(k),
        );
        if (unknownKeys.length > 0) {
          sendJson(res, 422, {
            error: "strict_schema_unknown_fields",
            unknown_keys: unknownKeys,
          });
          return;
        }
      }

      // 5. Rate-limit burst vector (Vector 3)
      if (vector === "rate_limit_429") {
        const burstIdx = Number(req.headers["x-nominalx-burst-index"] ?? 0);
        const rateLimitBroken =
          failingChaosSet.has("rate_limit_429") && !isPatched("rate-limit");
        if (burstIdx >= 4) {
          if (rateLimitBroken) {
            sendJson(res, 503, {
              error: "worker_overloaded_no_retry_after",
              retry_storm_detected: true,
            });
            return;
          }
          sendJson(
            res,
            429,
            {
              error: "rate_limited_backoff_ok",
              backoff_honored: true,
              retry_storm_detected: false,
            },
            { "retry-after": "2" },
          );
          return;
        }
      }

      // 6. 30-second upstream timeout vector (Vector 4)
      if (vector === "upstream_timeout_30s") {
        const timeoutBroken =
          failingChaosSet.has("upstream_timeout_30s") && !isPatched("timeout");
        if (timeoutBroken) {
          sendJson(res, 504, {
            error: "upstream_30s_worker_pool_exhausted",
            worker_exhaustion: true,
            dlq_routed: false,
          });
          return;
        }
        sendJson(
          res,
          202,
          {
            ok: true,
            aborted_at_deadline: true,
            worker_exhaustion: false,
            dlq_routed: true,
          },
          { "x-nominalx-dlq-routed": "true" },
        );
        return;
      }

      // 7. Duplicate webhook idempotency (Vector 1)
      const eventId = String(payload.event_id ?? "");
      const idempotencyBroken =
        failingChaosSet.has("duplicate_webhook") && !isPatched("idempotency");
      if (eventId) {
        const prev = eventMutationCount.get(eventId) ?? 0;
        if (prev > 0 && !idempotencyBroken) {
          sendJson(
            res,
            200,
            {
              ok: true,
              event_id: eventId,
              deduplicated: true,
              mutations: prev,
            },
            { "x-nominalx-mutations": String(prev) },
          );
          return;
        }
        const nextCount = prev + 1;
        eventMutationCount.set(eventId, nextCount);

        // 8. Out-of-order state transition guard (Vector 2)
        const entityId = String(payload.entity_id ?? "");
        const incomingVersion = Number(payload.version ?? 1);
        const dataObj = (payload.data ?? {}) as Record<string, unknown>;
        const incomingState =
          typeof dataObj.state === "string"
            ? dataObj.state
            : String(payload.type ?? "processed");

        const orderingBroken =
          failingChaosSet.has("out_of_order") && !isPatched("ordering");
        if (entityId) {
          const existing = entityStates.get(entityId);
          if (
            !existing ||
            orderingBroken ||
            (incomingVersion > existing.version && existing.state !== "canceled")
          ) {
            entityStates.set(entityId, {
              state: incomingState,
              version: incomingVersion,
            });
          }
          const finalState = entityStates.get(entityId)!;
          sendJson(
            res,
            200,
            {
              ok: true,
              event_id: eventId,
              deduplicated: false,
              mutations: nextCount,
              entity_id: entityId,
              entity_state: finalState.state,
              entity_version: finalState.version,
            },
            { "x-nominalx-mutations": String(nextCount) },
          );
          return;
        }

        sendJson(
          res,
          200,
          {
            ok: true,
            event_id: eventId,
            deduplicated: false,
            mutations: nextCount,
          },
          { "x-nominalx-mutations": String(nextCount) },
        );
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "not_found", path: pathname });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => resolve());
  });

  const address = server.address();
  const actualPort =
    address && typeof address === "object" ? address.port : requestedPort;

  return {
    server,
    port: actualPort,
    baseUrl: `http://${host}:${actualPort}`,
    preset,
    getActivePatches: () => [...activePatches],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export async function patchDemoTarget(options: {
  port: number;
  fixes: string[];
  host?: string;
}): Promise<{
  ok: boolean;
  preset: string;
  applied: string[];
  active_patches: string[];
  diffs: Array<{ patchKey: string; label: string; diffLines: string[] }>;
}> {
  const host = options.host ?? "127.0.0.1";
  const url = `http://${host}:${options.port}/_nominalx/patch`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fixes: options.fixes }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to patch demo-target at ${url}: HTTP ${res.status}`,
    );
  }
  return (await res.json()) as {
    ok: boolean;
    preset: string;
    applied: string[];
    active_patches: string[];
    diffs: Array<{ patchKey: string; label: string; diffLines: string[] }>;
  };
}
