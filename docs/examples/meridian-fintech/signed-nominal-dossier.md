# NominalX Signed Flight Readiness Dossier — Meridian FinTech

> **Verdict:** `NOMINAL WITH WAIVERS` | **Master Launch State:** `CONDITIONAL_GO` | **Verification Digest:** `sha256:7608b6c86a41274b10b204d1d6cd547934c5595b15251a951f216283f90ccfea`

## Handover Sprint Sign-Off Block

| Role | Named Engineer | Lifecycle Baton |
|---|---|---|
| Single Accountable Owner (Lead FDE) | `alex.rivera@vendor.io` | Gate 1 (Flight Check), Gate 2 (Static Fire), Handover Sprint |
| Co-Signer (Lead CSE) | `priya.nair@vendor.io` | Gate 3 (Crew Drill · Live Incident Drill) |
| Co-Signer (Customer Engineering Lead) | `maya.chen@meridian.example` | Customer Production Sign-Off |
| Receiving Owner (Support Engineer) | `sre-tier3@vendor.io` | Live Support (Day-1 Runbook) |
| Signed At | `2026-11-24T13:23:32.752Z` | Target Go-Live: `2026-12-01` |

## Gate 1: Flight Check · Setup Check (Sales-to-FDE Handoff)

| Sub-Stage | Station | Policy Class | Owner | Sold | Observed | Status |
|---|---|---|---|---|---|---|
| 1 of 6 | `AUTH / SSO` | HARD STOP (Non-Waivable) | `alex.rivera@vendor.io` | SAML2 · MFA required · cert TTL >= 30d | SAML2 · MFA enforced · cert TTL 184d | **NOMINAL** |
| 2 of 6 | `RESIDENCY` | HARD STOP (Non-Waivable) | `alex.rivera@vendor.io` | Allowed [eu-central-1, eu-west-1] · strict egress=true | Served eu-central-1 · storage [eu-central-1, eu-west-1] · egress [eu-central-1] | **NOMINAL** |
| 3 of 6 | `WEBHOOKS` | Operational Waiver Eligible | `alex.rivera@vendor.io` | hmac-sha256 · dual-secret=true · skew <= 300s | unsigned_rejected=true · dual_key=true [v1, v2] | **NOMINAL** |
| 4 of 6 | `QUOTA / RATE` | Operational Waiver Eligible | `jordan.lee@vendor.io` | >= 50,000 RPS · Retry-After=true | 50,000 RPS · Retry-After=2s | **NOMINAL** |
| 5 of 6 | `ALERTING` | Operational Waiver Eligible | `priya.nair@vendor.io` | #eng-meridian-p1 · ACK <= 2000ms | #eng-meridian-p1 active · ACK 310ms | **NOMINAL** |
| 6 of 6 | `ROLLBACK` | Operational Waiver Eligible | `alex.rivera@vendor.io` | RTO <= 5m · dry-run=true · zero data loss | dry-run=failed · RTO 11m · artifact v2.4.1-rc3 | **HOLD_WAIVED** |

### Active Operational Waiver Register

| Station | Named Owner | Expires At | Days Left | Aging Band | Reason | Rollback Plan |
|---|---|---|---|---|---|---|
| `ROLLBACK` | `maya.chen@meridian.example` | `2026-12-15` | 24d | `HEALTHY` | Automated blue/green ArgoCD cutover ships Sprint 24; verified manual DNS failover active. | Run scripts/dns-failover.sh --cluster eu-central-v18 to revert traffic within 9 minutes. |

## Gate 2: Static Fire · Fault Injection (Integration & Cutover)

**Resilience Grade:** `A` | **Corruption:** `0.0%` | **Vectors Passed:** `7/7` | **Attempt:** `#2`

**Before / After Fire Progression:** Fire #1: 37.1% (Grade F) -> Fire #2: 0.0% (Grade A)

| Sub-Stage | Chaos Vector | Packets Sent | Corrupted | Corruption % | Status |
|---|---|---|---|---|---|
| 1 of 7 | Duplicate webhook delivery | 10 | 0 | 0.0% | **NOMINAL** |
| 2 of 7 | Out-of-order events (canceled before created) | 10 | 0 | 0.0% | **NOMINAL** |
| 3 of 7 | 429 rate-limit burst | 10 | 0 | 0.0% | **NOMINAL** |
| 4 of 7 | 30-second upstream timeout | 6 | 0 | 0.0% | **NOMINAL** |
| 5 of 7 | Dual HMAC secret rotation | 10 | 0 | 0.0% | **NOMINAL** |
| 6 of 7 | Additive / unknown JSON fields | 8 | 0 | 0.0% | **NOMINAL** |
| 7 of 7 | 5-minute clock skew | 8 | 0 | 0.0% | **NOMINAL** |

## Gate 3: Crew Drill · Live Incident Drill (Day-30 Enablement & Handover)

**Stabilized:** `3/3` | **Overtime Flags:** `0` | **Total Split:** `59.6s`

| Sub-Stage | Live Day-30 Alarm | Split | Status | Verification Proof |
|---|---|---|---|---|
| 1 of 3 | Runaway ingestion storm spiking quota/spend | `24.6s` | **STABILIZED** | 200 OK · source=src_meridian_batch_importer_09 capped at 5000 RPS + DLQ overflow active · 3/3 SLA ticks green |
| 2 of 3 | SSO certificate expiring within 24 hours | `19.2s` | **STABILIZED** | 200 NOMINAL · staged cert SHA256:4D:88:C1:92:FA:11 promoted in dual-cert grace mode · live SSO handshake verified (TTL 365d) |
| 3 of 3 | P1 alerts routing to a dead/archived channel | `15.8s` | **STABILIZED** | 200 OK · P1 alert route rebound to #eng-meridian-p1 · synthetic X-NominalX-Probe ping acknowledged |

## Stack-Tailored Day-1 Customer Runbook (Into Live Support)

- **Stack:** Cloud `aws` · IdP `okta-saml` · Alerting `pagerduty+slack` · Runtime `node-express`
- **Verified Baselines:** Auth `SAML2` · Regions `[eu-central-1, eu-west-1]` · Quota `50,000 RPS` · P1 `#eng-meridian-p1` · Max RTO `5m`

### 1. Support Day-1 Drift Detection & Contract Re-Verification
*Owner:* Support Engineer + Customer On-Call SRE

Re-verify all 6 Gate 1 stations (Hard Stops: AUTH / SSO, RESIDENCY) in one deterministic command.

```bash
nominalx check ./nominalx.yaml
nominalx report --config ./nominalx.yaml --type waivers --format md
```

- Confirm AUTH / SSO (SAML2) cert TTL >= 30d and MFA enforced.
- Confirm X-Served-Region stays strictly within [eu-central-1, eu-west-1].
- Confirm exit code 0 and zero expired Operational Waivers.

### 2. Zero-Downtime Dual-HMAC Key Rotation (node-express)
*Owner:* Customer Backend Engineer + Security Engineer

Rotate hmac-sha256 signing secrets on /webhooks/events using dual-key overlap (<= 300s replay tolerance).

```bash
export NOMINALX_WEBHOOK_SECRET_NEXT="<new_staged_secret>"
nominalx fire --url http://127.0.0.1:4040/webhooks/events --config ./nominalx.yaml
```

- Verify Gate 2 Vector 5 of 7 (Dual HMAC secret rotation) passes with 0% drop across v1 + v2 keys.
- Verify forged signatures still return 401/403 and stale -15m replay probes are rejected.
- Decommission prior v1 key only after 100% traffic signs with v2.

### 3. SSO Certificate Rotation (okta-saml)
*Owner:* Customer Security Engineer + On-Call SRE

Promote staged X.509 signing certificate in dual-cert grace mode whenever TTL approaches 30d (rehearsed in Gate 3 Drill 2 of 3).

```bash
curl -fsS http://127.0.0.1:4040/sso/metadata
nominalx check ./nominalx.yaml --json
```

- Stage replacement X.509 fingerprint alongside active certificate before cutover.
- Confirm live SSO metadata endpoint returns protocol=saml2, mfa_enforced=true, and cert_ttl_days > 365.

### 4. Runaway Ingestion & Rate-Limit Mitigation (aws)
*Owner:* Customer Platform / Infra Engineer + On-Call SRE

Enforce per-tenant rate cap and DLQ overflow while preserving 50,000 RPS contracted headroom and Retry-After headers.

```bash
curl -fsS http://127.0.0.1:4040/internal/quota
nominalx fire --url http://127.0.0.1:4040/webhooks/events --config ./nominalx.yaml
```

- Identify runaway tenant/source key from gateway burst metrics.
- Apply per-tenant rate cap + enable DLQ overflow without throttling healthy tenants.
- Confirm 429 responses emit numeric Retry-After and burn rate holds in SLA for 3 consecutive ticks.

### 5. P1 Alert Verification & Release Rollback (pagerduty+slack / terraform+argocd)
*Owner:* Lead CSE + Support Engineer + Customer On-Call SRE

Verify synthetic P1 alert delivery to #eng-meridian-p1 (<= 2000ms) and rollback dry-run within 5m RTO.

```bash
curl -fsS -X POST -H "X-NominalX-Probe: true" http://127.0.0.1:4040/alerts/test
curl -fsS -X POST http://127.0.0.1:4040/internal/rollback/dry-run
```

- Confirm #eng-meridian-p1 acknowledges synthetic probe with HTTP 2xx <= 2000ms.
- Confirm rollback dry-run completes <= 5m with zero data loss.

### 6. Active Operational Waiver Closure & Expiry Escalation
*Owner:* Support Engineer + TAM + Named Waiver Owners

1 active Operational Waiver(s) require live NOMINAL re-probe before expiry. Hard Stops (AUTH / SSO, RESIDENCY) hold 0 waivers.

```bash
# Close ROLLBACK waiver (expires 2026-12-15, owner maya.chen@meridian.example):
nominalx check examples/meridian-fintech/nominalx.yaml
```

- ROLLBACK: Owner maya.chen@meridian.example closes before 2026-12-15 (24d left). Fallback: Run scripts/dns-failover.sh --cluster eu-central-v18 to revert traffic within 9 minutes.

## Scope Governance Boundaries

**In-Scope Verified:**
- Gate 1: Flight Check · Setup Check — 6/6 stations diffed Sold vs. Observed
- Gate 2: Static Fire · Fault Injection — 7/7 real-world failure scenarios verified deterministically
- Gate 3: Crew Drill · Live Incident Drill — 3/3 live timed operational alarms verified
- Handover Sprint — Tamper-evident (SHA-256 signed) launch dossier & stack-tailored Day-1 Runbook

**Explicitly Out-of-Scope:**
- Issuing waivers on security/compliance Hard Stops (AUTH / SSO or RESIDENCY)
- Full production load generation at 50k RPS from a developer laptop
- Multi-week waterfall sign-off committees or unverified spreadsheet checkboxes
- Untested staging changes promoted to production without a clean re-fire
- LLM-generated pass/fail opinions or manual QA sign-off without packet telemetry
- Slide-deck trainings or multiple-choice certification quizzes
