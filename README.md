# NominalX — Field Guide & Executable Flight-Readiness System

> ***"Sales says the account is green. Nothing is nominal until telemetry proves it."***

![NominalX Customer Engineering Lifecycle (Stages 1 to 6 & The Unverified Gap)](./docs/customer-journey.svg)

**Live Static Mission Control Cockpit (Zero Backend):** [https://assafbar2.github.io/nominalX/](https://assafbar2.github.io/nominalX/)

---

## An Open Guide, Ideas & Inspiration for Customer-Facing Engineering Teams

NominalX is an **open field guide, working set of ideas, and executable reference architecture** built engineer-to-engineer for technical products deployed into technical customer environments. Fork it, adapt its sprint contracts, or borrow its Hard Stop and reporting patterns to replace 90-row launch spreadsheets and Day-30 slide decks with deterministic telemetry.

**Written explicitly for:**
- **Customer-Facing Engineers:** **Sales Engineers**, **Solutions Engineers (SEs) / Solutions Architects (SAs)**, **Forward-Deployed Engineers (FDEs) / Implementation Engineers**, **Customer Success Engineers (CSEs)**, **Technical Account Managers (TAMs)**, and **Support Engineers**.
- **Customer Engineers:** **Customer Backend Engineers**, **Customer Platform / Infrastructure Engineers**, **Customer Security Engineers**, and **Customer On-Call SREs**.

### Why Stages 2 → 4 (*The Unverified Gap*)

Most customer software lives at the two edges of the lifecycle: pre-sales CRM at **Stage 1: Deal Close**, or reactive ticketing at **Stage 5: Support**. Almost nothing executable sits in **Stages 2 → 4**, where signed technical commitments actually turn into resilient production systems:

1. **Stage 2: Sales-to-FDE Handoff · Gate 1 (`1 of 3`): `FLIGHT CHECK`** — Diffs **What Sales Sold** against **What Exists in Customer Staging** across 6 parallel telemetry stations (`1 of 6`–`6 of 6`) with **Non-Waivable Hard Stops** on `AUTH / SSO` and `RESIDENCY`.
2. **Stage 3: Integration & Cutover · Gate 2 (`2 of 3`): `STATIC FIRE`** — Bolts the staging integration to an adversarial chaos test stand and fires **7 real-world failure vectors** (`1 of 7`–`7 of 7`) in tight fire → patch → re-fire loops until corruption hits **`0.0% · Grade A`**.
3. **Stage 4: Day-30 Enablement & Handover · Gate 3 (`3 of 3`): `CREW DRILL` + Handover Sprint** — Runs **3 live 90-second P1 alarms** (`1 of 3`–`3 of 3`) with real config remediation (zero multiple-choice quizzes), then seals a **SHA-256 Signed `NOMINAL` Dossier** and stack-tailored **Day-1 Customer Runbook** directly into **Stage 5: Support**.

---

## Master Lifecycle & Sprint Governance Table (Stages 1 → 6)

Every stage is executed as a **time-boxed engineering sprint** with **one Single Accountable Owner**, paired vendor + customer engineers, connected integrations, strict scope boundaries, and telemetry-backed Definition of Done.

| Stage | Goal | Single Accountable Owner | Vendor & Customer Engineers | Connected Integrations | Strict Scope Guardrails (In / Out / Hard Stops) | Reporting & Definition of Done |
|---|---|---|---|---|---|---|
| **Stage 1: Deal Close** *(Pre-Gap Contract Seed)* | Codify signed technical promises into a schema-valid `nominalx.yaml`. | **Lead Solutions Engineer (SE / SA)** | **Vendor:** Sales Eng, SE/SA, Lead FDE (read-in)<br>**Customer:** Eng Lead, Security Eng | CRM Handoff (`nominalx.yaml`), Jira/Linear | **In:** SSO, residency, HMAC, RPS, P1, RTO targets.<br>**Out:** Commercial pricing, unverified verbal promises.<br>**Hard Stop:** Schema-valid `nominalx.yaml` v1.0 required before Gate 1. | Committed `nominalx.yaml` passing `NominalXConfigSchema` with named engineering owners. |
| **Stage 2: Sales-to-FDE Handoff**<br>**Gate 1 (`1 of 3`): `FLIGHT CHECK`** *(Sprint 1)* | Diff **Sold Contract** vs. **Live Staging Telemetry** across 6 parallel stations (`1 of 6`–`6 of 6`). | **Lead Forward-Deployed Engineer (FDE)** | **Vendor:** Lead FDE, SE/SA, Sales Eng, Lead CSE, Support Eng, TAM<br>**Customer:** Platform/Infra, Security, Backend, On-Call SRE | Okta/Entra SSO, AWS/GCP Residency, HMAC Gateway, API Quota Edge, PagerDuty/Slack P1, Terraform/ArgoCD Rollback, Jira/Linear | **In:** Live HTTP/header/HMAC probes, strict Sold vs. Observed diffs.<br>**Out:** Waiving Hard Stops, 50k RPS laptop load tests, spreadsheet sign-offs.<br>**Hard Stops:** **`AUTH / SSO` (`1 of 6`) & `RESIDENCY` (`2 of 6`) are Non-Waivable.** Operational stations (`3–6 of 6`) allow max **2 active waivers ≤ 30d**. | `flight-check.json`, `exec` / `ops` / `waivers` reports; **0 `NO-GO`** stations; both Hard Stops `NOMINAL`. |
| **Stage 3: Integration & Cutover**<br>**Gate 2 (`2 of 3`): `STATIC FIRE`** *(Sprint 2)* | Fire **7 adversarial chaos vectors** (`1 of 7`–`7 of 7`) and patch/re-fire until corruption hits `0.0%`. | **Lead Forward-Deployed Engineer (FDE)** | **Vendor:** Lead FDE, TAM<br>**Customer:** Backend, Platform/Infra, Security Engineers | HMAC Webhook Gateway, Rate-Limit Gateway, Release Automation | **In:** 7 deterministic vectors, live config diffs, before/after firing history.<br>**Out:** Untested prod deploys, LLM-guessed grades, multi-hour soak tests.<br>**Hard Stop:** Any corruption `> 0.0%` locks Gate 2 in `NO-GO` (exit `1`). | `static-fire.json` with **`0.0%` corruption (`Grade A · NOMINAL`)**, 7/7 vectors passed, multi-attempt delta log. |
| **Stage 4: Day-30 Enablement & Handover**<br>**Gate 3 (`3 of 3`): `CREW DRILL` + Handover Sprint** *(Sprint 3)* | Stabilize **3 live 90s Day-30 alarms** (`1 of 3`–`3 of 3`), then seal Signed Dossier & Day-1 Runbook. | **Lead Customer Success Engineer (CSE)** *(Crew Drill)*<br>**Lead FDE** *(Handover Sign-Off)* | **Vendor:** Lead CSE, Lead FDE, Support Eng, TAM<br>**Customer:** On-Call SRE, Backend, Security, Customer Eng Lead | Rate-Limit Edge, Okta/Entra SSO, PagerDuty/Slack P1, Jira/Linear | **In:** Live 90s alarm config patches, SHA-256 dossier seal, tailored Day-1 Runbook.<br>**Out:** Slide-deck trainings, multiple-choice quizzes, unsigned FDE roll-offs.<br>**Hard Stop:** Zero unstabilized Crew Drill alarms allowed prior to FDE roll-off. | `crew-drill.json` (3/3 stabilized with split times) + Signed `NOMINAL` Dossier (`.md`, `.json`, Slack) + Day-1 Runbook. |
| **Stage 5: Support** *(Post-Gap Operations)* | Operate SLAs from verified Day-1 baselines and close every Operational Waiver before expiry. | **Assigned Lead Support Engineer** | **Vendor:** Support Engineers, TAM, CSE<br>**Customer:** On-Call SREs, Backend/Platform Engineers | PagerDuty/Slack P1, Jira/Linear, Rollback Automation | **In:** Day-1 Runbook triage, 1-command `nominalx check` drift checks, waiver closure.<br>**Out:** Re-discovering Sales promises during P1s, silent waiver extensions.<br>**Hard Stop:** Any expired waiver (`today > expires_at`) immediately flags `NO-GO`. | Active Waiver Aging Register closed to `0` active waivers via live `NOMINAL` re-probe. |
| **Stage 6: Renewal & Expansion** *(Post-Gap Growth)* | Anchor renewal on longitudinal telemetry and seed expansion workloads into Stage 1 → Gate 1. | **Technical Account Manager (TAM)** | **Vendor:** TAM, Lead CSE, Sales Engineer<br>**Customer:** Customer Engineering, Platform & Security Leads | CRM Handoff (`nominalx.yaml`), Jira/Linear | **In:** Quarterly JSON dossier diffs, zero-waiver discipline, new region/RPS seeding.<br>**Out:** Qualitative health scores without telemetry, bypassing Gate 1 Hard Stops.<br>**Hard Stop:** New geographic regions require a fresh Gate 1 `RESIDENCY` pass. | Executive Readiness Report (`exec`) + fresh `nominalx.yaml` for expansion scope. |

---

## Sub-Stage Breakdown Across The Three Gates

### Stage 2 · Gate 1 (`1 of 3`): `FLIGHT CHECK` (`1 of 6` → `6 of 6`)

| Sub-Stage | Station | Policy Class | Accountable Owner | Definition of Done |
|---|---|---|---|---|
| **1 of 6** | `AUTH / SSO` | **HARD STOP (Non-Waivable)** | Lead FDE | Live IdP protocol matches contract, MFA enforced, cert TTL `≥ 30d`, unsigned assertions rejected. |
| **2 of 6** | `RESIDENCY` | **HARD STOP (Non-Waivable)** | Lead FDE | `100%` of `X-Served-Region`, storage buckets, and egress hops stay inside contracted region allowlist. |
| **3 of 6** | `WEBHOOKS` | Operational Waiver Eligible | Lead FDE | Unsigned/tampered payloads rejected (`401`/`403`), valid HMAC accepted, dual-key `[v1, v2]` rotation ready. |
| **4 of 6** | `QUOTA / RATE` | Operational Waiver Eligible | Lead SE / SA | Provisioned RPS `≥` sold contract and `429` responses emit valid numeric `Retry-After` headers. |
| **5 of 6** | `ALERTING` | Operational Waiver Eligible | Lead CSE | Synthetic P1 probe (`X-NominalX-Probe: true`) acknowledged (`2xx`) within SLA on active channel. |
| **6 of 6** | `ROLLBACK` | Operational Waiver Eligible | Lead FDE | Versioned artifact rollback dry-run passes within contracted max RTO with zero data loss. |

### Stage 3 · Gate 2 (`2 of 3`): `STATIC FIRE` (`1 of 7` → `7 of 7`)

| Sub-Stage | Chaos Vector | Failure Mode Caught | Definition of Done (`0.0%` Corruption) |
|---|---|---|---|
| **1 of 7** | Duplicate webhook delivery | Double-writes / duplicate ledger mutations | Identical `event_id` replays mutate state once (`200`/`204`/`409`). |
| **2 of 7** | Out-of-order events (`canceled` before `created`) | Zombie record resurrection | Monotonic version / terminal-state guard preserves `canceled`. |
| **3 of 7** | 429 rate-limit burst | Tight-loop retry storms & silent drops | Honors `Retry-After` with exponential backoff + jitter. |
| **4 of 7** | 30-second upstream timeout | Worker pool exhaustion & `502`/`504` cascade | Clean deadline abort + async retry/DLQ handoff. |
| **5 of 7** | Dual HMAC secret rotation | 100% drop during routine secret rotation | Accepts valid `v1` + `v2` signatures; rejects forged payloads. |
| **6 of 7** | Additive / unknown JSON fields | Strict-schema `400`/`422`/`500` crashes | Tolerant reader ignores unknown top-level & nested keys. |
| **7 of 7** | 5-minute clock skew | False drops on clock drift or replay exposure | Accepts valid `±5m` probes; rejects stale `-15m` replay (`401`). |

### Stage 4 · Gate 3 (`3 of 3`): `CREW DRILL` (`1 of 3` → `3 of 3`)

| Sub-Stage | Live Day-30 Alarm (`90s` Clock) | Accountable Owner | Real Config Remediation Verified (Zero Quizzes) |
|---|---|---|---|
| **1 of 3** | Runaway ingestion storm spiking quota/spend | Lead CSE | Isolate offending `source_key`, apply per-tenant RPS cap + DLQ overflow, hold green SLA for 3 consecutive ticks. |
| **2 of 3** | SSO certificate expiring within 24 hours | Lead CSE | Promote staged next X.509 fingerprint in dual-cert grace mode; verify live SSO handshake returns `200 NOMINAL` (`TTL > 365d`). |
| **3 of 3** | P1 alerts routing to a dead/archived channel | Lead CSE | Rebind P1 route to verified active ops channel; confirm live synthetic `X-NominalX-Probe` ping returns `200 OK`. |

---

## Executive & Operational Reporting Engine

One deterministic reporting engine (`packages/core/src/reporting.ts` & `packages/core/src/dossier.ts`) generates identical **Markdown (`.md`)**, **JSON (`.json`)**, and **Slack (`mrkdwn`)** outputs in both the CLI and the static web cockpit:

- **Executive Readiness Report (`nominalx report --type exec`)**: Master Launch Verdict, 6-stage lifecycle table, Hard Stop compliance attestation, Gate 1–3 telemetry rollup, waiver exposure, scope guardrails, and SHA-256 verification digest.
- **Operational Sprint & Integrations Digest (`nominalx report --type ops`)**: Active stage & single baton owner, live Integration Health Matrix, non-nominal station/vector blockers with failing wire lines, and exact next CLI commands.
- **Active Waiver Aging Register (`nominalx report --type waivers`)**: Non-waivable Hard Stop attestation (`AUTH / SSO`, `RESIDENCY`), `2`-waiver cap utilization, aging bands (`HEALTHY` / `WARNING_14D` / `CRITICAL_7D` / `EXPIRED`), and Stage 5 Support drift command.
- **Signed `NOMINAL` Dossier & Tailored Day-1 Runbook (`nominalx dossier`)**: Co-signed by Lead FDE, Lead CSE, and Customer Engineering Lead with deterministic SHA-256 seal and stack-tailored Day-1 Runbook commands.

---

## Offline CLI Quickstart (Zero External Infrastructure)

Run the full deterministic lifecycle locally against the built-in buggy staging target (`meridian`, `kestrel`, `vanguard`, or `helios`):

```bash
pnpm install && pnpm build

# Terminal 1: Start a real local staging target reproducing all 6 Gate 1 stations & 7 Gate 2 vectors
pnpm --filter nominalx exec nominalx demo-target --port 4040 --preset meridian

# Terminal 2: Stage 2 / Gate 1 (1 of 3) — Flight Check (fails on RESIDENCY Hard Stop & WEBHOOKS)
pnpm --filter nominalx exec nominalx check examples/meridian-fintech/nominalx.yaml --out flight-check.json

# Patch staging residency & dual-HMAC webhook verification live, then re-verify
pnpm --filter nominalx exec nominalx demo-patch --port 4040 --fix residency,webhooks
pnpm --filter nominalx exec nominalx check examples/meridian-fintech/nominalx.yaml --out flight-check.json

# Stage 3 / Gate 2 (2 of 3) — Static Fire (34.2% Grade F -> live patch -> 0.0% Grade A)
pnpm --filter nominalx exec nominalx fire --url http://127.0.0.1:4040/webhooks/events --config examples/meridian-fintech/nominalx.yaml --out static-fire.json
pnpm --filter nominalx exec nominalx demo-patch --port 4040 --fix idempotency,ordering,dual-hmac
pnpm --filter nominalx exec nominalx fire --url http://127.0.0.1:4040/webhooks/events --config examples/meridian-fintech/nominalx.yaml --out static-fire.json

# Executive & Operational Reports (md | json | slack)
pnpm --filter nominalx exec nominalx report --config examples/meridian-fintech/nominalx.yaml --type exec --format slack --flight-check flight-check.json --static-fire static-fire.json
pnpm --filter nominalx exec nominalx report --config examples/meridian-fintech/nominalx.yaml --type ops --format md --flight-check flight-check.json --static-fire static-fire.json
pnpm --filter nominalx exec nominalx report --config examples/meridian-fintech/nominalx.yaml --type waivers --format md --flight-check flight-check.json

# Handover Sprint — Signed NOMINAL Dossier & Stack-Tailored Day-1 Runbook
pnpm --filter nominalx exec nominalx dossier --config examples/meridian-fintech/nominalx.yaml --flight-check flight-check.json --static-fire static-fire.json --format md --out nominalx-dossier-meridian.md
pnpm --filter nominalx exec nominalx dossier --config examples/meridian-fintech/nominalx.yaml --flight-check flight-check.json --static-fire static-fire.json --format slack
```

### Run the Static Web Mission Control Locally

```bash
pnpm --filter @nominalx/web dev      # Local dev cockpit (Dark default + 1-click Light toggle)
pnpm --filter @nominalx/web build    # Zero-backend static bundle in packages/web/dist/
pnpm --filter @nominalx/web preview  # Preview production static bundle
```

---

## Monorepo Architecture

```text
nominalX/
├── docs/
│   └── customer-journey.svg         # Stages 1 -> 6 & The Unverified Gap vector graphic
├── examples/                        # 4 pre-built enterprise nominalx.yaml contract seeds
│   ├── meridian-fintech/            # Payments · EU-Strict · Okta SAML · 50k RPS (default)
│   ├── kestrel-health/              # HIPAA Healthcare · Entra OIDC · Strict Timeouts
│   ├── vanguard-retail/             # Peak Commerce · FastAPI · 50k RPS Burst
│   └── helios-logistics/            # Global Supply Chain · Near-Launch · 1 Active Waiver
├── packages/
│   ├── core/                        # @nominalx/core — Zero-LLM browser+Node deterministic engine
│   ├── cli/                         # nominalx — Real HTTP/TLS/HMAC/chaos CLI + demo-target
│   └── web/                         # @nominalx/web — Option C static cockpit (GitHub Pages)
├── .github/workflows/
│   ├── ci.yml                       # Typecheck, build, unit & E2E tests across all packages
│   └── pages.yml                    # Automated static deployment to GitHub Pages
└── THESIS.md                        # Product thesis & architectural principles
```
