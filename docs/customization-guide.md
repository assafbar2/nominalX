# Customizing NominalX Gates (`nominalx.yaml` & Live Cockpit)

Every technical product has its own non-negotiable security boundaries, protocol edge cases, and Day-30 failure modes. NominalX lets customer-facing engineers (Solutions Engineers, Forward-Deployed Engineers, Customer Success Engineers, Support Engineers) and customer engineers extend all three gates without forking the engine.

All customizations are 100% optional and backward-compatible with existing `schema_version: "1.0"` contracts.

## 1. Gate 1: Custom Flight Check · Setup Check Stations (`custom_stations`)

Declare product-specific HTTP telemetry checks alongside the 6 built-in stations (`AUTH / SSO`, `RESIDENCY`, `WEBHOOKS`, `QUOTA / RATE`, `ALERTING`, `ROLLBACK`).

- Set `hard_stop: true` to enforce a custom station with the exact same **non-waivable Hard Stop** guardrail as `AUTH / SSO` and `RESIDENCY`. Any waiver targeting a `hard_stop: true` station is rejected by both `parseNominalXConfigYaml()` and `nominalx check` (`HARD_STOP_WAIVER_FORBIDDEN`, exit code `1`).
- Set `hard_stop: false` (default) for operational stations eligible for bounded Operational Waivers (max 2 active per account, named owner, `<= 30` days, concrete rollback plan).

```yaml
custom_stations:
  - code: "PCI_TOKEN_VAULT"
    label: "PCI / Secret Vault"
    owner: "tobias.keller@apexpayments.example"
    hard_stop: true
    endpoint: "/pci/vault/health"
    method: "GET"
    expected_status: 200
    required_header:
      name: "x-pci-vault-mode"
      contains: "HSM-FIPS-140-3"
    required_json_field:
      path: "tokenization.pan_isolation"
      equals: true
    sold_promise: "Cardholder PAN data isolated inside FIPS 140-3 HSM token vault (Hard Stop · non-waivable)"
    initial_status: "NO_GO"
    failure_evidence: "GET /pci/vault/health returned x-pci-vault-mode=software-fallback & tokenization.pan_isolation=false"
    fix_summary: "Bind HSM-FIPS-140-3 vault cluster and enforce PAN tokenization isolation on staging ingress"
```

When `nominalx check` executes, it probes every custom station live over HTTP, verifies `expected_status`, `required_header`, and/or `required_json_field`, captures raw header/body failure evidence, and dynamically numbers all stations `1 of N` through `N of N`.

## 2. Gate 2: Static Fire · Fault Injection Overrides & Custom Vectors (`chaos_overrides`, `custom_vectors`)

Disable built-in chaos vectors that do not apply to a product and add custom adversarial HTTP probes. Enabled built-ins plus custom vectors are numbered `1 of N` through `N of N` and rolled deterministically into overall corruption `%` and Resilience Grade (`A`–`F`).

```yaml
chaos_overrides:
  disabled_vectors: []

custom_vectors:
  - id: "malformed_idempotency_key"
    label: "Malformed Idempotency Key"
    description: "Reject malformed or overly long Idempotency-Key payloads deterministically with HTTP 400."
    owner: "alex.rivera@vendor.io"
    endpoint_override: "/webhooks/events"
    method: "POST"
    payload:
      event_id: "evt_bad_idem_probe"
      idempotency_key: "!!!invalid key with spaces & 256+ chars!!!"
      type: "payment.capture"
      amount_cents: 19900
    expected_status: 400
    weight: 100
    patch_id: "idempotency-key-validator"
    patch_label: "Validate Strict UUIDv4 / ASCII Idempotency-Key Format"
    patch_summary: "Validate idempotency_key against ^[A-Za-z0-9_-]{8,64}$ before ledger write and return HTTP 400."
    patch_diff:
      - "- const key = req.body.idempotency_key;"
      - "+ const key = assertValidIdempotencyKey(req.body.idempotency_key); // returns 400 on malformed"
```

## 3. Gate 3: Custom Crew Drill · Live Incident Drill Alarms (`disabled_alarms`, `custom_alarms`)

Disable built-in alarms or declare product-specific timed P1 drills. Custom alarms are immediately playable in the browser cockpit's Crew Drill console and flow into the Signed `NOMINAL` Dossier and Day-1 Runbook.

```yaml
disabled_alarms: []

custom_alarms:
  - id: "webhook_dlq_backlog_spike"
    title: "Webhook DLQ Backlog Spike"
    owner: "priya.nair@vendor.io"
    timer_seconds: 90
    metric_label: "DLQ Backlog Depth"
    trigger_symptom: "ALERT P1: Payment webhook DLQ depth spiked to 480 messages (> 25 SLA floor)."
    log_lines:
      - "DLQ_CONSUMER_PAUSED queue=payments-webhooks-dlq depth=480 oldest_age_sec=412"
      - "ROOT_CAUSE: poisoned batch partition #3 blocking consumer worker pool"
    remediation_label: "Quarantine Poison Batch & Enable Parallel DLQ Drain"
    remediation_detail: "Move malformed partition #3 messages to quarantine bucket and enable 4x bounded DLQ replay workers."
    verification_proof: "200 OK · DLQ backlog drained from 480 -> 4 msgs (< 25 SLA) · 3/3 consecutive green ticks verified"
```

## 4. Full Sample Fixture & Live Browser Customizer

- **Working CLI Fixture:** [`examples/custom-payments-api/nominalx.yaml`](../examples/custom-payments-api/nominalx.yaml)
- **Live Browser Cockpit:** Click **Customize** in the top mission bar to add/remove Gate 1 stations, toggle or add Gate 2 chaos vectors, toggle or add Gate 3 Day-30 alarms, or edit the live 2-way synced `nominalx.yaml` directly (including **Load Custom Payments Example** and **Download nominalx.yaml**).
- **CLI Commands:**

```bash
nominalx check examples/custom-payments-api/nominalx.yaml
nominalx fire --url http://127.0.0.1:4040/webhooks/events --config examples/custom-payments-api/nominalx.yaml
nominalx report --config examples/custom-payments-api/nominalx.yaml --type exec --format md
nominalx dossier --config examples/custom-payments-api/nominalx.yaml --format md
```
