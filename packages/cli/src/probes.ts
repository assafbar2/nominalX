import {
  evaluateFlightCheck,
  hmacSha256Hex,
  type FlightCheckResult,
  type NominalXConfig,
  type ObservedEnvironmentTelemetry,
} from "@nominalx/core";
import { resolveWebhookSecrets } from "./config.js";

export interface HttpProbeResponse {
  status: number;
  latencyMs: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  rawText: string;
}

async function fetchJsonProbe(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<HttpProbeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const latencyMs = Math.max(1, Date.now() - started);
    const rawText = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = { raw: rawText };
    }
    return { status: res.status, latencyMs, headers, body, rawText };
  } finally {
    clearTimeout(timer);
  }
}

export function signWebhookPayload(
  secret: string,
  timestampSec: number,
  rawBody: string,
  keyId: string = "v1",
): { signatureHeader: string; timestampHeader: string; keyIdHeader: string } {
  const digest = hmacSha256Hex(secret, `${timestampSec}.${rawBody}`);
  return {
    signatureHeader: `${keyId}=${digest}`,
    timestampHeader: String(timestampSec),
    keyIdHeader: keyId,
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface RunLiveFlightCheckOptions {
  timeoutMs?: number;
  referenceDate?: string;
  evaluatedAt?: string;
}

export async function probeEnvironmentTelemetry(
  config: NominalXConfig,
  timeoutMs: number = 5000,
): Promise<ObservedEnvironmentTelemetry> {
  const baseUrl = config.environment.base_url;
  const ep = config.environment.endpoints;
  const secrets = resolveWebhookSecrets(config);

  // 1 of 6: AUTH / SSO
  const authRes = await fetchJsonProbe(
    joinUrl(baseUrl, ep.auth_metadata),
    { method: "GET", headers: { accept: "application/json" } },
    timeoutMs,
  );
  const observedProtocol = String(
    authRes.body.protocol ?? authRes.headers["x-auth-protocol"] ?? "unknown",
  );
  const mfaEnforced = Boolean(authRes.body.mfa_enforced ?? false);
  const certTtlDays = Number(authRes.body.cert_ttl_days ?? 0);
  const rejectsUnsignedAssertions = Boolean(
    authRes.body.reject_unsigned_assertions ?? false,
  );
  const authHighlights: string[] = [];
  if (observedProtocol.toLowerCase() !== config.sold_contract.auth.protocol) {
    authHighlights.push(
      `Observed protocol "${observedProtocol}" != sold "${config.sold_contract.auth.protocol}"`,
    );
  }
  if (certTtlDays < config.sold_contract.auth.min_cert_ttl_days) {
    authHighlights.push(
      `HARD STOP: cert_ttl_days=${certTtlDays}d below contract minimum ${config.sold_contract.auth.min_cert_ttl_days}d`,
    );
  }
  if (config.sold_contract.auth.mfa_required && !mfaEnforced) {
    authHighlights.push("HARD STOP: MFA not enforced by IdP");
  }
  if (authHighlights.length === 0) {
    authHighlights.push(
      `protocol=${observedProtocol} · mfa=${mfaEnforced} · cert_ttl_days=${certTtlDays}`,
    );
  }

  // 2 of 6: RESIDENCY
  const resRes = await fetchJsonProbe(
    joinUrl(baseUrl, ep.residency_probe),
    { method: "GET", headers: { accept: "application/json" } },
    timeoutMs,
  );
  const observedRegion = String(
    resRes.headers["x-served-region"] ?? resRes.body.region ?? "unknown",
  );
  const storageRegions = Array.isArray(resRes.body.storage_regions)
    ? resRes.body.storage_regions.map(String)
    : [observedRegion];
  const egressRegions = Array.isArray(resRes.body.egress_regions)
    ? resRes.body.egress_regions.map(String)
    : [observedRegion];
  const dnsTarget = String(resRes.body.dns_target ?? new URL(baseUrl).hostname);
  const allowedRegions = new Set(
    config.sold_contract.residency.allowed_regions.map((r) => r.toLowerCase()),
  );
  const resHighlights: string[] = [];
  if (!allowedRegions.has(observedRegion.toLowerCase())) {
    resHighlights.push(
      `HARD STOP: X-Served-Region "${observedRegion}" outside allowed [${config.sold_contract.residency.allowed_regions.join(", ")}]`,
    );
  }
  const leakedStorage = storageRegions.filter(
    (r) => !allowedRegions.has(r.toLowerCase()),
  );
  if (leakedStorage.length > 0) {
    resHighlights.push(
      `HARD STOP: Storage regions leaked outside allowlist: [${leakedStorage.join(", ")}]`,
    );
  }
  if (resHighlights.length === 0) {
    resHighlights.push(
      `X-Served-Region: ${observedRegion} · storage [${storageRegions.join(", ")}]`,
    );
  }

  // 3 of 6: WEBHOOKS (unsigned, tampered, current HMAC, next HMAC)
  const webhookUrl = joinUrl(baseUrl, ep.webhook_ingress);
  const probePayload = JSON.stringify({
    event_id: `evt_gate1_probe_${Date.now()}`,
    type: "nominalx.flight_check.probe",
    entity_id: "ent_flight_check",
    version: 1,
    data: { probe: true },
  });
  const nowSec = Math.floor(Date.now() / 1000);

  const unsignedRes = await fetchJsonProbe(
    webhookUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nominalx-probe": "gate1-unsigned",
      },
      body: probePayload,
    },
    timeoutMs,
  );

  const tamperedRes = await fetchJsonProbe(
    webhookUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nominalx-probe": "gate1-tampered",
        "x-nominalx-signature": "v1=deadbeef00000000000000000000000000000000000000000000000000000000",
        "x-nominalx-timestamp": String(nowSec),
        "x-nominalx-key-id": "v1",
      },
      body: probePayload,
    },
    timeoutMs,
  );

  const validCurrentSig = signWebhookPayload(
    secrets.current,
    nowSec,
    probePayload,
    "v1",
  );
  const currentRes = await fetchJsonProbe(
    webhookUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nominalx-probe": "gate1-valid-v1",
        "x-nominalx-signature": validCurrentSig.signatureHeader,
        "x-nominalx-timestamp": validCurrentSig.timestampHeader,
        "x-nominalx-key-id": validCurrentSig.keyIdHeader,
      },
      body: probePayload,
    },
    timeoutMs,
  );

  const validNextSig = signWebhookPayload(
    secrets.next,
    nowSec,
    probePayload,
    "v2",
  );
  const nextRes = await fetchJsonProbe(
    webhookUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nominalx-probe": "gate1-valid-v2",
        "x-nominalx-signature": validNextSig.signatureHeader,
        "x-nominalx-timestamp": validNextSig.timestampHeader,
        "x-nominalx-key-id": validNextSig.keyIdHeader,
      },
      body: probePayload,
    },
    timeoutMs,
  );

  const rejectsUnsigned =
    unsignedRes.status === 401 || unsignedRes.status === 403;
  const rejectsTampered =
    tamperedRes.status === 401 || tamperedRes.status === 403;
  const acceptsValidHmac =
    currentRes.status >= 200 && currentRes.status < 300;
  const dualSecretRotationReady =
    acceptsValidHmac && nextRes.status >= 200 && nextRes.status < 300;

  const activeKeyIds: string[] = [];
  if (acceptsValidHmac) activeKeyIds.push("v1");
  if (nextRes.status >= 200 && nextRes.status < 300) activeKeyIds.push("v2");

  const whHighlights: string[] = [];
  if (!rejectsUnsigned) {
    whHighlights.push(
      `Unsigned POST ${ep.webhook_ingress} returned ${unsignedRes.status} (expected 401/403)`,
    );
  }
  if (!rejectsTampered) {
    whHighlights.push(
      `Tampered HMAC POST ${ep.webhook_ingress} returned ${tamperedRes.status} (expected 401/403)`,
    );
  }
  if (
    config.sold_contract.webhooks.dual_secret_rotation &&
    !dualSecretRotationReady
  ) {
    whHighlights.push(
      `Staged next HMAC key (v2) returned ${nextRes.status} (expected 2xx for dual-secret rotation)`,
    );
  }
  if (whHighlights.length === 0) {
    whHighlights.push(
      `Unsigned=${unsignedRes.status} · Tampered=${tamperedRes.status} · v1=${currentRes.status} · v2=${nextRes.status}`,
    );
  }

  // 4 of 6: QUOTA / RATE
  const quotaRes = await fetchJsonProbe(
    joinUrl(baseUrl, ep.quota_status),
    { method: "GET", headers: { accept: "application/json" } },
    timeoutMs,
  );
  const provisionedRps = Number(
    quotaRes.body.provisioned_rps ??
      quotaRes.headers["x-ratelimit-limit"] ??
      0,
  );
  const retryAfterRaw =
    quotaRes.headers["retry-after"] ??
    (quotaRes.body.sample_retry_after_seconds !== undefined &&
    quotaRes.body.sample_retry_after_seconds !== null
      ? String(quotaRes.body.sample_retry_after_seconds)
      : undefined);
  const returnsRetryAfterHeader =
    Boolean(quotaRes.body.returns_retry_after) ||
    (retryAfterRaw !== undefined && Number(retryAfterRaw) > 0);
  const sampleRetryAfterSeconds =
    retryAfterRaw !== undefined && !Number.isNaN(Number(retryAfterRaw))
      ? Number(retryAfterRaw)
      : null;
  const burstDropRatePct = Number(quotaRes.body.burst_drop_rate_pct ?? 0);
  const quotaHighlights: string[] = [];
  if (provisionedRps < config.sold_contract.quota.guaranteed_rps) {
    quotaHighlights.push(
      `Provisioned ${provisionedRps} RPS < sold ${config.sold_contract.quota.guaranteed_rps} RPS`,
    );
  }
  if (
    config.sold_contract.quota.require_retry_after_header &&
    !returnsRetryAfterHeader
  ) {
    quotaHighlights.push("Missing numeric Retry-After header on 429 throttle");
  }
  if (quotaHighlights.length === 0) {
    quotaHighlights.push(
      `provisioned_rps=${provisionedRps} · Retry-After=${sampleRetryAfterSeconds ?? "ok"}s`,
    );
  }

  // 5 of 6: ALERTING
  const alertRes = await fetchJsonProbe(
    joinUrl(baseUrl, ep.alert_sink),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nominalx-probe": "true",
      },
      body: JSON.stringify({
        probe: true,
        severity: "P1",
        account_id: config.account.id,
        expected_channel: config.sold_contract.alerting.p1_channel,
      }),
    },
    timeoutMs,
  );
  const channelActive =
    alertRes.status >= 200 &&
    alertRes.status < 300 &&
    Boolean(alertRes.body.channel_active ?? true);
  const channelName = String(
    alertRes.body.channel_name ?? config.sold_contract.alerting.p1_channel,
  );
  const ackLatencyMs = Number(
    alertRes.body.ack_latency_ms ?? alertRes.latencyMs,
  );
  const providerStatus = String(
    alertRes.body.provider_status ??
      alertRes.body.error ??
      `${alertRes.status} ${channelActive ? "OK" : "FAILED"}`,
  );
  const alertHighlights: string[] = [];
  if (!channelActive) {
    alertHighlights.push(
      `POST ${ep.alert_sink} returned ${alertRes.status}: ${providerStatus}`,
    );
  } else if (ackLatencyMs > config.sold_contract.alerting.max_ack_ms) {
    alertHighlights.push(
      `ACK latency ${ackLatencyMs}ms exceeds contract max ${config.sold_contract.alerting.max_ack_ms}ms`,
    );
  } else {
    alertHighlights.push(
      `Synthetic P1 ACK ${ackLatencyMs}ms on ${channelName}`,
    );
  }

  // 6 of 6: ROLLBACK
  const rollbackRes = await fetchJsonProbe(
    joinUrl(baseUrl, ep.rollback_check),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nominalx-probe": "true",
      },
      body: JSON.stringify({ dry_run: true, account_id: config.account.id }),
    },
    timeoutMs,
  );
  const dryRunPassed =
    rollbackRes.status >= 200 &&
    rollbackRes.status < 300 &&
    Boolean(rollbackRes.body.dry_run_passed ?? false);
  const observedRtoMinutes = Number(
    rollbackRes.body.observed_rto_minutes ?? 999,
  );
  const artifactVersion = String(
    rollbackRes.body.artifact_version ?? "unknown",
  );
  const dataLossDetected = Boolean(rollbackRes.body.data_loss_detected ?? false);
  const rollbackHighlights: string[] = [];
  if (!dryRunPassed || observedRtoMinutes > config.sold_contract.rollback.max_rto_minutes) {
    rollbackHighlights.push(
      `dry_run_passed=${dryRunPassed} · observed_rto_minutes=${observedRtoMinutes}m (max ${config.sold_contract.rollback.max_rto_minutes}m)`,
    );
  } else {
    rollbackHighlights.push(
      `Dry-run rollback passed in ${observedRtoMinutes}m (artifact ${artifactVersion})`,
    );
  }

  return {
    auth: {
      observedProtocol,
      mfaEnforced,
      certTtlDays,
      rejectsUnsignedAssertions,
      idpIssuer:
        typeof authRes.body.idp_issuer === "string"
          ? authRes.body.idp_issuer
          : undefined,
      certFingerprint:
        typeof authRes.body.cert_fingerprint === "string"
          ? authRes.body.cert_fingerprint
          : undefined,
      evidence: {
        method: "GET",
        endpoint: ep.auth_metadata,
        httpStatus: authRes.status,
        latencyMs: authRes.latencyMs,
        headers: authRes.headers,
        payload: authRes.body,
        highlightLines: authHighlights,
      },
    },
    residency: {
      observedRegion,
      storageRegions,
      egressRegions,
      dnsTarget,
      evidence: {
        method: "GET",
        endpoint: ep.residency_probe,
        httpStatus: resRes.status,
        latencyMs: resRes.latencyMs,
        headers: resRes.headers,
        payload: resRes.body,
        highlightLines: resHighlights,
      },
    },
    webhooks: {
      rejectsUnsigned,
      rejectsTampered,
      acceptsValidHmac,
      dualSecretRotationReady,
      activeKeyIds,
      evidence: {
        method: "POST",
        endpoint: ep.webhook_ingress,
        httpStatus: currentRes.status,
        latencyMs: currentRes.latencyMs,
        headers: currentRes.headers,
        payload: {
          unsigned_probe_status: unsignedRes.status,
          tampered_probe_status: tamperedRes.status,
          current_key_status: currentRes.status,
          next_key_status: nextRes.status,
          active_key_ids: activeKeyIds,
        },
        highlightLines: whHighlights,
      },
    },
    quota: {
      provisionedRps,
      returnsRetryAfterHeader,
      sampleRetryAfterSeconds,
      burstDropRatePct,
      evidence: {
        method: "GET",
        endpoint: ep.quota_status,
        httpStatus: quotaRes.status,
        latencyMs: quotaRes.latencyMs,
        headers: quotaRes.headers,
        payload: quotaRes.body,
        highlightLines: quotaHighlights,
      },
    },
    alerting: {
      channelActive,
      channelName,
      ackLatencyMs,
      providerStatus,
      evidence: {
        method: "POST",
        endpoint: ep.alert_sink,
        httpStatus: alertRes.status,
        latencyMs: alertRes.latencyMs,
        headers: alertRes.headers,
        payload: alertRes.body,
        highlightLines: alertHighlights,
      },
    },
    rollback: {
      dryRunPassed,
      observedRtoMinutes,
      artifactVersion,
      dataLossDetected,
      evidence: {
        method: "POST",
        endpoint: ep.rollback_check,
        httpStatus: rollbackRes.status,
        latencyMs: rollbackRes.latencyMs,
        headers: rollbackRes.headers,
        payload: rollbackRes.body,
        highlightLines: rollbackHighlights,
      },
    },
  };
}

export async function runLiveFlightCheck(
  config: NominalXConfig,
  options: RunLiveFlightCheckOptions = {},
): Promise<FlightCheckResult> {
  const observed = await probeEnvironmentTelemetry(
    config,
    options.timeoutMs ?? 5000,
  );
  return evaluateFlightCheck(config, observed, {
    referenceDate: options.referenceDate,
    evaluatedAt: options.evaluatedAt,
  });
}
