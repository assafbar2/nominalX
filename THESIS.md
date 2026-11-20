# NominalX — Thesis & Architecture

> *Sales says the account is green. Nothing is nominal until telemetry proves it.*

## The Lifecycle Opportunity (Stages 2 → 4)

```text
[1. Deal Close] -> [2. Sales-to-FDE Handoff] -> [3. Integration & Cutover] -> [4. Day-30 Enablement] -> [5. Support] -> [6. Renewal]
                            \____________________________  ____________________________/
                                                         \/
                                          The unverified gap (Stages 2 -> 4)
```

Most customer-facing software lives at the two edges of the lifecycle: pre-sales CRM at Stage 1, or reactive support ticketing at Stage 5. Almost nothing executable or verifiable sits in **Stages 2 → 4**, where signed enterprise bookings actually turn into resilient production ARR:

- **Stage 2 — Sales-to-FDE handoff:** What was promised during discovery (EU residency, SAML SSO, 50k RPS, rollback plan) routinely collides with what actually exists inside the customer's environment on Day 1.
- **Stage 3 — Integration & cutover:** Go-lives are still tracked in 90-row spreadsheets where "staging looked fine" hides missing HMAC verification, double-writes on duplicate webhooks, 429 retry storms, and silent region leaks.
- **Stage 4 — Customer enablement & handover:** Enablement defaults to slide decks and multiple-choice quizzes that evaporate during the customer's first real 2 a.m. incident.

**NominalX** replaces the spreadsheet and the slide deck with an executable three-gate flight-readiness system.

---

## The Three Gates

### Gate 1 — `FLIGHT CHECK` (Integration & Contract Readiness)
- Diffs **What Sales Sold** against **What Exists in the Customer Environment**.
- Polls 6 Flight Director stations (`AUTH / SSO`, `RESIDENCY`, `WEBHOOKS`, `QUOTA / RATE`, `ALERTING`, `ROLLBACK`).
- Every station locks **`NOMINAL`**, **`NO-GO`** (with exact failing payload/header evidence), or **`HOLD / WAIVED`** (a time-boxed Risk Waiver with explicit owner, expiry date, and rollback plan).

### Gate 2 — `STATIC FIRE` (Adversarial Chaos Harness)
- Bolts the integration to the test stand and fires **7 real-world failure vectors** at full thrust while plotting live packet telemetry and error rates:
  1. Duplicate webhook delivery (idempotency check)
  2. Out-of-order events (`canceled` arriving before `created`)
  3. 429 rate-limit burst (exponential backoff vs. retry storm)
  4. 30-second upstream timeout (clean abort vs. worker exhaustion)
  5. Dual HMAC secret rotation (zero-downtime rotation vs. 100% drop)
  6. Additive / unknown JSON fields (tolerant reader vs. strict-schema crash)
  7. 5-minute clock skew (replay-window tolerance)
- Patch the integration config/handler live and re-fire until corruption drops to `0% · NOMINAL`.

### Gate 3 — `CREW DRILL` (Day-30 Customer Enablement & Handover)
- Before the FDE rolls off, the customer's ops console takes **3 live Day-30 alarms**:
  1. Runaway ingestion storm spiking quota/spend
  2. SSO certificate expiring within 24 hours
  3. P1 alerts routing to a dead/archived channel
- No multiple-choice quizzes: diagnose live telemetry, apply the config fix, and stabilize the system before the timer expires.

### Final Output — Signed `NOMINAL` Dossier & Day-1 Runbook
- Station-by-station Go/No-Go verdict, Static Fire resilience grade (`A`–`F`), active Risk Waivers with owners and expiries, Crew Drill completion times, and an auto-generated **Day-1 Customer Runbook** tailored to that account's stack and waivers.
- Exportable as Markdown, JSON, or a ready-to-paste Go-Live Slack thread update.

---

## Dual Delivery (One Engine, Two Surfaces)

1. **Real CLI (`nominalx`):** Runs real deterministic HTTP, TLS, residency, webhook HMAC, and adversarial chaos probes against any staging endpoint (`nominalx check nominalx.yaml`, `nominalx fire --url ...`, `nominalx dossier`). Zero LLM dependency.
2. **Static Browser Mission Control:** Zero-backend avionics cockpit (hosted free on GitHub Pages) pre-loaded with 4 realistic enterprise accounts (*Meridian FinTech*, *Kestrel Health*, *Vanguard Retail*, *Helios Logistics*) so anyone can run Flight Check → Static Fire → Crew Drill → Signed Dossier in 90 seconds.
