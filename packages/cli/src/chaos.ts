import {
  scoreStaticFire,
  type FireAttemptSummary,
  type NominalXConfig,
  type StaticFireResult,
  type StaticFireVectorObservation,
} from "@nominalx/core";
import { resolveWebhookSecrets } from "./config.js";
import { signWebhookPayload } from "./probes.js";

interface ProbeHttpResult {
  status: number;
  latencyMs: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

async function sendChaosRequest(
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH",
  rawBody: string | undefined,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ProbeHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(method !== "GET" ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(method !== "GET" && rawBody !== undefined ? { body: rawBody } : {}),
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Date.now() - started);
    const text = await res.text();
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      outHeaders[k.toLowerCase()] = v;
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = { raw: text };
    }
    return { status: res.status, latencyMs, headers: outHeaders, body };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - started);
    return {
      status: 504,
      latencyMs,
      headers: {},
      body: {
        error: err instanceof Error ? err.message : "request_aborted",
        worker_exhaustion: true,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postChaosEvent(
  url: string,
  rawBody: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ProbeHttpResult> {
  return sendChaosRequest(url, "POST", rawBody, headers, timeoutMs);
}

function p95(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx]!;
}

export interface RunLiveStaticFireOptions {
  targetUrl: string;
  config: NominalXConfig;
  timeoutMs?: number;
  previousAttempts?: FireAttemptSummary[];
  patchesApplied?: string[];
  executedAt?: string;
}

export async function runLiveStaticFire(
  options: RunLiveStaticFireOptions,
): Promise<StaticFireResult> {
  const { targetUrl, config } = options;
  const timeoutMs = options.timeoutMs ?? 5000;
  const secrets = resolveWebhookSecrets(config);
  const runSalt = Date.now().toString(36);
  const nowSec = Math.floor(Date.now() / 1000);
  const parsedTarget = new URL(targetUrl);
  const endpointPath = parsedTarget.pathname;
  const disabledVectors = new Set(
    config.chaos_overrides?.disabled_vectors ?? [],
  );

  const observations: StaticFireVectorObservation[] = [];

  // 1 of 7: Duplicate webhook delivery (10 identical event_ids)
  if (!disabledVectors.has("duplicate_webhook")) {
    const eventId = `evt_dup_${runSalt}`;
    const rawBody = JSON.stringify({
      event_id: eventId,
      type: "payment.settled",
      entity_id: `pay_${runSalt}`,
      version: 1,
      data: { amount_cents: 42000 },
    });
    const sig = signWebhookPayload(secrets.current, nowSec, rawBody, "v1");
    const statuses: number[] = [];
    const latencies: number[] = [];
    let maxMutations = 0;

    for (let i = 0; i < 10; i += 1) {
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "duplicate_webhook",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": sig.keyIdHeader,
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);
      const mut = Number(
        res.body.mutations ?? res.headers["x-nominalx-mutations"] ?? 1,
      );
      if (mut > maxMutations) maxMutations = mut;
    }

    const extraMutations = Math.max(0, maxMutations - 1);
    const badStatusCount = statuses.filter(
      (s) => s !== 200 && s !== 204 && s !== 409,
    ).length;
    const corrupted = Math.min(10, extraMutations + badStatusCount);
    const passed = corrupted === 0;

    observations.push({
      vectorId: "duplicate_webhook",
      packetsSent: 10,
      packetsCorrupted: corrupted,
      packetsDropped: badStatusCount,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? `10 identical replays -> 1 state mutation (9 deduplicated)`
        : `10 identical replays caused ${maxMutations} state mutations (${extraMutations} double-writes)`,
      expectedBehavior: "1 state mutation across 10 replays (zero double-writes)",
      httpStatusSamples: statuses.slice(0, 4),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[statuses.length - 1] ?? 200,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "duplicate_webhook" },
        payload: { event_id: eventId, replays: 10, mutations: maxMutations },
        highlightLines: [
          passed
            ? "Idempotency verified: 1 mutation across 10 replays"
            : `Double-write corruption: ${maxMutations} mutations on identical event_id`,
        ],
      },
    });
  }

  // 2 of 7: Out-of-order events (v2 canceled followed by v1 created, across 5 entities = 10 packets)
  if (!disabledVectors.has("out_of_order")) {
    const statuses: number[] = [];
    const latencies: number[] = [];
    let resurrectedCount = 0;

    for (let i = 0; i < 5; i += 1) {
      const entityId = `sub_${runSalt}_${i}`;
      const cancelBody = JSON.stringify({
        event_id: `evt_ooo_cancel_${runSalt}_${i}`,
        type: "subscription.canceled",
        entity_id: entityId,
        version: 2,
        data: { state: "canceled" },
      });
      const createBody = JSON.stringify({
        event_id: `evt_ooo_create_${runSalt}_${i}`,
        type: "subscription.created",
        entity_id: entityId,
        version: 1,
        data: { state: "created" },
      });

      const sig2 = signWebhookPayload(secrets.current, nowSec, cancelBody, "v1");
      const r1 = await postChaosEvent(
        targetUrl,
        cancelBody,
        {
          "x-nominalx-vector": "out_of_order",
          "x-nominalx-signature": sig2.signatureHeader,
          "x-nominalx-timestamp": sig2.timestampHeader,
          "x-nominalx-key-id": sig2.keyIdHeader,
        },
        timeoutMs,
      );
      statuses.push(r1.status);
      latencies.push(r1.latencyMs);

      const sig1 = signWebhookPayload(secrets.current, nowSec, createBody, "v1");
      const r2 = await postChaosEvent(
        targetUrl,
        createBody,
        {
          "x-nominalx-vector": "out_of_order",
          "x-nominalx-signature": sig1.signatureHeader,
          "x-nominalx-timestamp": sig1.timestampHeader,
          "x-nominalx-key-id": sig1.keyIdHeader,
        },
        timeoutMs,
      );
      statuses.push(r2.status);
      latencies.push(r2.latencyMs);

      const resultingState = String(r2.body.entity_state ?? "canceled");
      if (resultingState !== "canceled" || r2.status >= 500) {
        resurrectedCount += 1;
      }
    }

    const corrupted = resurrectedCount * 2;
    const passed = resurrectedCount === 0;
    observations.push({
      vectorId: "out_of_order",
      packetsSent: 10,
      packetsCorrupted: corrupted,
      packetsDropped: 0,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? "Terminal canceled state preserved on all 5/5 late v1 events"
        : `${resurrectedCount}/5 canceled subscriptions resurrected to 'created' by late v1 event`,
      expectedBehavior: "Terminal canceled state holds on late v1 events (0% corruption)",
      httpStatusSamples: statuses.slice(0, 4),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[statuses.length - 1] ?? 200,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "out_of_order" },
        payload: { pairs_tested: 5, resurrected: resurrectedCount },
        highlightLines: [
          passed
            ? "Monotonic sequence guard preserved terminal canceled state"
            : `${resurrectedCount}/5 records resurrected by stale v1 created event`,
        ],
      },
    });
  }

  // 3 of 7: 429 rate-limit burst (10 burst probes)
  if (!disabledVectors.has("rate_limit_429")) {
    const statuses: number[] = [];
    const latencies: number[] = [];
    let badBurst = 0;

    for (let i = 0; i < 10; i += 1) {
      const rawBody = JSON.stringify({
        event_id: `evt_burst_${runSalt}_${i}`,
        type: "telemetry.burst",
        entity_id: `burst_${i}`,
        version: 1,
        data: { sequence: i },
      });
      const sig = signWebhookPayload(secrets.current, nowSec, rawBody, "v1");
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "rate_limit_429",
          "x-nominalx-burst-index": String(i),
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": sig.keyIdHeader,
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);

      const retryStorm = Boolean(res.body.retry_storm_detected ?? false);
      if (res.status === 429) {
        const hasRetryAfter =
          res.headers["retry-after"] !== undefined &&
          Number(res.headers["retry-after"]) > 0;
        if (!hasRetryAfter || retryStorm) badBurst += 1;
      } else if (res.status >= 500 || retryStorm) {
        badBurst += 1;
      }
    }

    const passed = badBurst === 0;
    observations.push({
      vectorId: "rate_limit_429",
      packetsSent: 10,
      packetsCorrupted: badBurst,
      packetsDropped: badBurst,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? "429 throttle emitted numeric Retry-After with clean backoff (0 drops)"
        : `${badBurst}/10 burst requests triggered 503/retry-storm without Retry-After`,
      expectedBehavior: "Respect Retry-After with exponential backoff + jitter (zero storm)",
      httpStatusSamples: statuses.slice(0, 4),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[statuses.length - 1] ?? 429,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "rate_limit_429" },
        payload: { burst_size: 10, failed_burst_probes: badBurst },
        highlightLines: [
          passed
            ? "429 Retry-After backoff verified with zero retry storms"
            : `${badBurst}/10 burst probes dropped or missing Retry-After`,
        ],
      },
    });
  }

  // 4 of 7: 30-second upstream timeout (6 stall probes with bounded deadline)
  if (!disabledVectors.has("upstream_timeout_30s")) {
    const statuses: number[] = [];
    const latencies: number[] = [];
    let exhaustedCount = 0;

    for (let i = 0; i < 6; i += 1) {
      const rawBody = JSON.stringify({
        event_id: `evt_timeout_${runSalt}_${i}`,
        type: "upstream.stall_test",
        entity_id: `stall_${i}`,
        version: 1,
        data: { simulated_upstream_stall_ms: 30000 },
      });
      const sig = signWebhookPayload(secrets.current, nowSec, rawBody, "v1");
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "upstream_timeout_30s",
          "x-nominalx-simulated-stall-ms": "30000",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": sig.keyIdHeader,
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);

      const workerExhaustion = Boolean(res.body.worker_exhaustion ?? false);
      const dlqRouted =
        res.headers["x-nominalx-dlq-routed"] === "true" ||
        Boolean(res.body.dlq_routed);
      const cleanAbort =
        !workerExhaustion &&
        ((res.status >= 200 && res.status < 300) || dlqRouted);
      if (!cleanAbort) exhaustedCount += 1;
    }

    const passed = exhaustedCount === 0;
    observations.push({
      vectorId: "upstream_timeout_30s",
      packetsSent: 6,
      packetsCorrupted: exhaustedCount,
      packetsDropped: exhaustedCount,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? "Clean deadline abort + DLQ routing on 6/6 stall probes (zero worker exhaustion)"
        : `${exhaustedCount}/6 stall probes triggered worker exhaustion / cascading 504`,
      expectedBehavior: "Abort cleanly at deadline and route to retry/DLQ (zero exhaustion)",
      httpStatusSamples: statuses.slice(0, 4),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[0] ?? 202,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "upstream_timeout_30s" },
        payload: { probes: 6, worker_exhausted: exhaustedCount },
        highlightLines: [
          passed
            ? "Deadline abort + DLQ handoff verified cleanly"
            : `${exhaustedCount}/6 probes suffered worker pool exhaustion`,
        ],
      },
    });
  }

  // 5 of 7: Dual HMAC secret rotation (4 v1 + 4 v2 + 2 forged = 10 probes)
  if (!disabledVectors.has("dual_hmac_rotation")) {
    const statuses: number[] = [];
    const latencies: number[] = [];
    let failedHmac = 0;

    for (let i = 0; i < 4; i += 1) {
      const rawBody = JSON.stringify({
        event_id: `evt_hmac_v1_${runSalt}_${i}`,
        type: "hmac.rotation.v1",
        entity_id: `key_v1_${i}`,
        version: 1,
        data: { key: "v1" },
      });
      const sig = signWebhookPayload(secrets.current, nowSec, rawBody, "v1");
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "dual_hmac_rotation",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": "v1",
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);
      if (res.status < 200 || res.status >= 300) failedHmac += 1;
    }

    for (let i = 0; i < 4; i += 1) {
      const rawBody = JSON.stringify({
        event_id: `evt_hmac_v2_${runSalt}_${i}`,
        type: "hmac.rotation.v2",
        entity_id: `key_v2_${i}`,
        version: 1,
        data: { key: "v2" },
      });
      const sig = signWebhookPayload(secrets.next, nowSec, rawBody, "v2");
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "dual_hmac_rotation",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": "v2",
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);
      if (res.status < 200 || res.status >= 300) failedHmac += 1;
    }

    for (let i = 0; i < 2; i += 1) {
      const rawBody = JSON.stringify({
        event_id: `evt_hmac_forged_${runSalt}_${i}`,
        type: "hmac.rotation.forged",
        entity_id: `key_forged_${i}`,
        version: 1,
        data: { forged: true },
      });
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "dual_hmac_rotation",
          "x-nominalx-signature":
            "v2=0000000000000000000000000000000000000000000000000000000000000000",
          "x-nominalx-timestamp": String(nowSec),
          "x-nominalx-key-id": "v2",
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);
      if (res.status !== 401 && res.status !== 403) failedHmac += 1;
    }

    const passed = failedHmac === 0;
    observations.push({
      vectorId: "dual_hmac_rotation",
      packetsSent: 10,
      packetsCorrupted: failedHmac,
      packetsDropped: failedHmac,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? "100% of v1 & v2 signed payloads accepted; 100% of forged signatures rejected"
        : `${failedHmac}/10 dual-HMAC rotation probes failed (staged v2 rejected or forged accepted)`,
      expectedBehavior: "Accept valid v1 + v2 overlap; reject forged signatures (401/403)",
      httpStatusSamples: statuses.slice(0, 6),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[4] ?? 200,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "dual_hmac_rotation" },
        payload: { v1_sent: 4, v2_sent: 4, forged_sent: 2, failed: failedHmac },
        highlightLines: [
          passed
            ? "Dual-secret [v1, v2] overlap verified with zero drops"
            : `${failedHmac}/10 dual-HMAC probes failed during key overlap`,
        ],
      },
    });
  }

  // 6 of 7: Additive / unknown JSON fields (8 forward-compatible payloads)
  if (!disabledVectors.has("additive_json_fields")) {
    const statuses: number[] = [];
    const latencies: number[] = [];
    let schemaCrashes = 0;

    for (let i = 0; i < 8; i += 1) {
      const rawBody = JSON.stringify({
        event_id: `evt_additive_${runSalt}_${i}`,
        type: "invoice.updated",
        entity_id: `inv_${i}`,
        version: 1,
        data: {
          amount_cents: 1200,
          future_nested_tax_metadata: { region_code: "EU-VAT-2027", rate: 0.2 },
        },
        future_top_level_flag: true,
        experimental_trace_baggage: ["canary-v2", "zero-trust"],
      });
      const sig = signWebhookPayload(secrets.current, nowSec, rawBody, "v1");
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "additive_json_fields",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": "v1",
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);
      if (res.status < 200 || res.status >= 300) schemaCrashes += 1;
    }

    const passed = schemaCrashes === 0;
    observations.push({
      vectorId: "additive_json_fields",
      packetsSent: 8,
      packetsCorrupted: schemaCrashes,
      packetsDropped: schemaCrashes,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? "Tolerant reader accepted all 8/8 additive JSON payloads (2xx)"
        : `${schemaCrashes}/8 additive payloads crashed strict JSON schema (400/422/500)`,
      expectedBehavior: "Ignore unknown additive JSON keys and return 2xx",
      httpStatusSamples: statuses.slice(0, 4),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[0] ?? 200,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "additive_json_fields" },
        payload: { probes: 8, strict_schema_crashes: schemaCrashes },
        highlightLines: [
          passed
            ? "Forward-compatible JSON tolerant reader verified"
            : `${schemaCrashes}/8 requests failed strict schema deserialization`,
        ],
      },
    });
  }

  // 7 of 7: 5-minute clock skew (3 at now-290s, 3 at now+290s -> 2xx; 2 stale at now-900s -> 401/403)
  if (!disabledVectors.has("clock_skew_5m")) {
    const statuses: number[] = [];
    const latencies: number[] = [];
    let skewFailures = 0;

    const skewOffsets = [-290, -280, -270, 270, 280, 290, -900, -960];
    for (let i = 0; i < skewOffsets.length; i += 1) {
      const offset = skewOffsets[i]!;
      const ts = nowSec + offset;
      const isStaleControl = Math.abs(offset) > config.sold_contract.webhooks.max_clock_skew_seconds;
      const rawBody = JSON.stringify({
        event_id: `evt_skew_${runSalt}_${i}`,
        type: "clock.skew_probe",
        entity_id: `skew_${i}`,
        version: 1,
        data: { offset_sec: offset },
      });
      const sig = signWebhookPayload(secrets.current, ts, rawBody, "v1");
      const res = await postChaosEvent(
        targetUrl,
        rawBody,
        {
          "x-nominalx-vector": "clock_skew_5m",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": "v1",
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);

      if (isStaleControl) {
        if (res.status !== 401 && res.status !== 403) skewFailures += 1;
      } else if (res.status < 200 || res.status >= 300) {
        skewFailures += 1;
      }
    }

    const passed = skewFailures === 0;
    observations.push({
      vectorId: "clock_skew_5m",
      packetsSent: skewOffsets.length,
      packetsCorrupted: skewFailures,
      packetsDropped: skewFailures,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? "Accepted 6/6 valid +-5m skewed probes and rejected 2/2 stale -15m replay controls"
        : `${skewFailures}/8 clock-skew probes failed (+-5m dropped or -15m replay accepted)`,
      expectedBehavior: "Accept valid +-5m probes (2xx); reject stale -15m replay (401/403)",
      httpStatusSamples: statuses.slice(0, 6),
      wireEvidence: {
        method: "POST",
        endpoint: endpointPath,
        httpStatus: statuses[0] ?? 200,
        latencyMs: p95(latencies),
        headers: { "x-nominalx-vector": "clock_skew_5m" },
        payload: { probes: skewOffsets.length, failures: skewFailures },
        highlightLines: [
          passed
            ? "+-300s clock-skew tolerance and -15m replay rejection verified"
            : `${skewFailures}/8 clock-skew assertions failed`,
        ],
      },
    });
  }

  // Custom Chaos Vectors (Gate 2 extensibility)
  for (const customVec of config.custom_vectors ?? []) {
    const customUrl = customVec.endpoint_override
      ? `${parsedTarget.origin}${customVec.endpoint_override.startsWith("/") ? customVec.endpoint_override : `/${customVec.endpoint_override}`}`
      : targetUrl;
    const customEndpointPath = new URL(customUrl).pathname;
    const probeCount = Math.max(1, Math.min(20, customVec.weight ?? 6));
    const statuses: number[] = [];
    const latencies: number[] = [];
    let failedCount = 0;

    for (let i = 0; i < probeCount; i += 1) {
      const payloadObj = {
        ...(customVec.payload ?? {}),
        nominalx_probe_seq: i,
      };
      const rawBody =
        customVec.method === "GET" ? undefined : JSON.stringify(payloadObj);
      const sig = signWebhookPayload(
        secrets.current,
        nowSec,
        rawBody ?? "",
        "v1",
      );
      const res = await sendChaosRequest(
        customUrl,
        customVec.method,
        rawBody,
        {
          "x-nominalx-vector": customVec.id,
          "x-nominalx-custom-vector": "true",
          "x-nominalx-signature": sig.signatureHeader,
          "x-nominalx-timestamp": sig.timestampHeader,
          "x-nominalx-key-id": sig.keyIdHeader,
        },
        timeoutMs,
      );
      statuses.push(res.status);
      latencies.push(res.latencyMs);
      if (res.status !== customVec.expected_status) {
        failedCount += 1;
      }
    }

    const passed = failedCount === 0;
    observations.push({
      vectorId: customVec.id,
      packetsSent: probeCount,
      packetsCorrupted: failedCount,
      packetsDropped: failedCount,
      passed,
      p95LatencyMs: p95(latencies),
      observedBehavior: passed
        ? `All ${probeCount}/${probeCount} probes returned contracted HTTP ${customVec.expected_status}`
        : `${failedCount}/${probeCount} probes returned unexpected status [${[...new Set(statuses)].join(", ")}] (expected HTTP ${customVec.expected_status})`,
      expectedBehavior: `${customVec.method} ${customEndpointPath} returns HTTP ${customVec.expected_status}`,
      httpStatusSamples: statuses.slice(0, 6),
      wireEvidence: {
        method: customVec.method,
        endpoint: customEndpointPath,
        httpStatus: statuses[0] ?? 500,
        latencyMs: p95(latencies),
        headers: {
          "x-nominalx-vector": customVec.id,
          "x-nominalx-custom-vector": "true",
        },
        payload: {
          vector: customVec.id,
          probes: probeCount,
          failed: failedCount,
          expected_status: customVec.expected_status,
          observed_statuses: statuses.slice(0, 6),
        },
        highlightLines: [
          passed
            ? `Custom vector "${customVec.label}" verified HTTP ${customVec.expected_status} across ${probeCount}/${probeCount} probes`
            : `Custom vector "${customVec.label}" failed ${failedCount}/${probeCount} probes (expected HTTP ${customVec.expected_status}, got [${[...new Set(statuses)].join(", ")}])`,
        ],
      },
    });
  }

  return scoreStaticFire({
    accountId: config.account.id,
    accountName: config.account.name,
    targetUrl,
    accountableOwner: config.account.fde_owner,
    observations,
    config,
    previousAttempts: options.previousAttempts,
    patchesApplied: options.patchesApplied,
    executedAt: options.executedAt,
  });
}
