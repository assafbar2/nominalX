import type {
  CrewAlarmState,
  StageNumber,
  StaticFireResult,
  StationResult,
} from "@nominalx/core";

export interface HelpEntry {
  title: string;
  body: string;
  tag?: string;
}

export const HELP_COPY = {
  // ── Header & Global Controls ───────────────────────────────────────────────
  "brand.mission": {
    tag: "MISSION CONTROL",
    title: "What is NominalX?",
    body: "NominalX verifies enterprise customer integrations before launch using live staging probes, automated failure tests, and timed on-call drills. Instead of trusting verbal sign-offs or spreadsheets, every go-live decision is backed by real telemetry and a signed handover dossier.",
  },
  "header.accountSwitcher": {
    tag: "ACCOUNT PRESETS",
    title: "Enterprise Account Switcher",
    body: "Switch between four realistic enterprise launch scenarios (Meridian, Kestrel, Vanguard, and Helios) with different clouds, identity providers, and pre-existing failure states. Each account keeps its own live fixes, waivers, drills, and custom YAML settings independently.",
  },
  "header.customize": {
    tag: "CUSTOMIZATION",
    title: "Customize Gates & nominalx.yaml",
    body: "Add custom Gate 1 stations, toggle or add Gate 2 chaos vectors, and configure Gate 3 alarms with 2-way synced nominalx.yaml export. The +N badge counts active custom stations, custom/disabled chaos vectors, and custom/disabled alarms. Edits auto-save per account in browser localStorage—clear them via Reset Customizations inside the drawer or Reset Scenario in the top bar.",
  },
  "header.resetScenario": {
    tag: "SCENARIO RESET",
    title: "Reset Active Account to Default",
    body: "Resets telemetry, staging patches, waivers, failure-test attempts, drills, dossier seal, and saved customizations for the active account back to its clean factory default (and clears any Customize +N badge and localStorage overrides for this account).",
  },
  "header.liveWireLog": {
    tag: "AUDIT STREAM",
    title: "Live Wire Telemetry Log",
    body: "Opens a chronological log of every probe, patch, waiver, failure-test run, and sign-off recorded in this session. Use it to inspect exact HTTP endpoints, status codes, response latencies, and highlighted pass/fail evidence.",
  },
  "header.themeToggle": {
    tag: "APPEARANCE",
    title: "Dark / Light Cockpit Theme",
    body: "Switches the entire cockpit between Dark mode (default) and high-contrast Light mode. Your preference is saved locally in your browser so it persists across reloads.",
  },
  "header.tour": {
    tag: "GUIDED WALKTHROUGH",
    title: "Replay Interactive Cockpit Tour",
    body: "Restarts the guided walkthrough from Step 1, spotlighting Live Customer Readiness, Stages 1–6, Gate 1 (Setup Check), Gate 2 (Fault Injection), Gate 3 (Live Incident Drill), the Reporting Hub, and the live nominalx.yaml Customizer.",
  },

  // ── Customer Journey Pipeline (Stages 1–6) ─────────────────────────────────
  "pipeline.header": {
    tag: "LIFECYCLE",
    title: "Customer Lifecycle Pipeline (Stages 1 to 6)",
    body: "Maps the full enterprise journey from signed deal to renewal so every team sees where technical readiness lives. Click Stages 2–4 to work the active engineering gates, or click Stages 1, 5, or 6 to inspect their scope and ownership contract.",
  },
  "pipeline.unverifiedGap": {
    tag: "CORE FOCUS",
    title: "Why Stages 2 to 4 Are 'The Unverified Gap'",
    body: "Most enterprise launches break between Sales closing a deal (Stage 1) and Support inheriting production (Stage 5) because nobody verifies staging under real failure conditions. NominalX closes this gap with three deterministic engineering gates before handoff.",
  },
  "pipeline.batonOwner": {
    tag: "ACCOUNTABILITY",
    title: "Single Accountable Owner (Baton Owner)",
    body: "Names the one engineer currently accountable for moving the launch forward—the single 'throat to choke' with zero ambiguity. Ownership passes from Lead FDE (Gates 1–2) to Lead CSE (Gate 3) and then jointly seals the handover to Support.",
  },
  "pipeline.masterVerdict": {
    tag: "LAUNCH VERDICT",
    title: "Master Launch Verdict",
    body: "Rolls up live results across all three gates: NOMINAL means every check passed with zero waivers; CONDITIONAL GO means all Hard Stops passed with at most two bounded operational waivers; NO-GO means at least one blocker still requires a fix.",
  },
  "pipeline.reportsHub": {
    tag: "HANDOVER & REPORTS",
    title: "Reports & Signed Handover Dossier",
    body: "Opens the Reporting & Handover Hub to inspect and export the tamper-evident NOMINAL Dossier, Day-1 Customer Runbook, Executive Readiness Brief, Operational Sprint Digest, and Waiver Aging Register.",
  },
  "pipeline.stage.1": {
    tag: "STAGE 1 · PRE-GAP",
    title: "Stage 1: Deal Close (Contract Seed)",
    body: "Owned by the Lead Solutions Engineer (SE / SA). Captures every technical commitment Sales made—SSO, data residency, webhook signing, RPS quotas, alerting, and rollback RTO—into a validated nominalx.yaml contract seed before engineering starts.",
  },
  "pipeline.stage.2": {
    tag: "STAGE 2 · GATE 1 · SETUP CHECK",
    title: "Stage 2: Sales-to-FDE Handoff (Flight Check · Setup Check)",
    body: "Proving staging matches what Sales sold. Owned by the Lead FDE and enforced here as Gate 1, running parallel live telemetry probes against customer staging and locking launch on security/compliance Hard Stops.",
  },
  "pipeline.stage.3": {
    tag: "STAGE 3 · GATE 2 · FAULT INJECTION",
    title: "Stage 3: Integration & Cutover (Static Fire · Fault Injection)",
    body: "Controlled fault injection to prove zero corruption. Owned by the Lead FDE and enforced here as Gate 2, firing duplicates, out-of-order events, 429 bursts, timeouts, secret rotations, schema additions, and clock skew until data loss hits 0.0% (Grade A).",
  },
  "pipeline.stage.4": {
    tag: "STAGE 4 · GATE 3 · LIVE INCIDENT DRILL",
    title: "Stage 4: Day-30 Enablement & Handover (Crew Drill · Live Incident Drill)",
    body: "Timed P1 alert rehearsal for Support and Customer SREs. Owned by the Lead CSE and enforced here as Gate 3, proving engineers can stabilize live P1 alarms under a 90-second clock before sealing the SHA-256 NOMINAL Dossier.",
  },
  "pipeline.stage.5": {
    tag: "STAGE 5 · POST-GAP",
    title: "Stage 5: Production Support",
    body: "Owned by the Assigned Lead Support Engineer. Support operates production SLAs using the verified Day-1 Runbook, runs drift checks with nominalx check, and closes every active Gate 1 Operational Waiver before its 30-day expiry.",
  },
  "pipeline.stage.6": {
    tag: "STAGE 6 · POST-GAP",
    title: "Stage 6: Renewal & Expansion",
    body: "Owned by the Technical Account Manager (TAM). Uses longitudinal signed dossiers to prove sustained reliability at renewal and feeds any new region or RPS expansion straight back into Stage 1 nominalx.yaml.",
  },

  // ── Hero Readiness Band ────────────────────────────────────────────────────
  "hero.hardStopBanner": {
    tag: "LAUNCH LOCKED",
    title: "Hard Stop Lock Active",
    body: "One or more non-waivable security or compliance checks (such as AUTH / SSO, RESIDENCY, or a custom hard_stop station) failed live telemetry. Waivers are strictly blocked here—click the button to jump straight to the failing check and fix it.",
  },
  "hero.accountMeta": {
    tag: "ACCOUNT PROFILE",
    title: "Customer Tier & Target Go-Live",
    body: "Shows the active enterprise account's commercial tier, industry vertical, and contracted production launch date from nominalx.yaml. Every probe and runbook in the cockpit is scoped to this account.",
  },
  "hero.stackChips": {
    tag: "CUSTOMER STACK",
    title: "Verified Environment Stack Metadata",
    body: "Displays the customer's cloud provider, identity provider (IdP), webhook handler runtime, and P1 alerting platform. NominalX tailors probe assertions, code fix diffs, and Day-1 Runbook commands to this exact stack.",
  },
  "hero.gate1Card": {
    tag: "GATE 1 · SETUP CHECK",
    title: "Flight Check (Setup Check) Station Score",
    body: "Proving staging matches what Sales sold. Shows how many Gate 1 stations are cleared (NOMINAL or validly WAIVED) out of the total active stations—click to open the Setup Check board.",
  },
  "hero.gate2Card": {
    tag: "GATE 2 · FAULT INJECTION",
    title: "Static Fire (Fault Injection) Corruption & Grade",
    body: "Controlled fault injection to prove zero corruption. Shows measured packet corruption across all Gate 2 failure scenarios plus resilience grade (A–F); Gate 2 requires 0.0% corruption (Grade A).",
  },
  "hero.gate3Card": {
    tag: "GATE 3 · LIVE INCIDENT DRILL",
    title: "Crew Drill (Live Incident Drill) Stabilized Alarms",
    body: "Timed P1 alert rehearsal for Support and Customer SREs. Tracks how many Day-30 P1 alarms have been stabilized with real config fixes and 3/3 green SLA ticks under the 90-second clock.",
  },
  "hero.readinessIndex": {
    tag: "OVERALL SCORE",
    title: "Composite Flight Readiness Index",
    body: "Combines Gate 1 (40%), Gate 2 (35%), Gate 3 (20%), and Signed Handover Dossier (5%) into a single 0–100% readiness score. If any Hard Stop station is red, the index is intentionally capped at 65% so the launch lock is unmistakable.",
  },

  // ── Sprint Contract Strip & Scope/Governance Drawer ────────────────────────
  "sprint.goal": {
    tag: "SPRINT CONTRACT",
    title: "Current Sprint Goal",
    body: "States the single concrete engineering outcome this stage must prove before passing the baton. Everything outside this goal belongs in another stage or out-of-scope.",
  },
  "sprint.owner": {
    tag: "ACCOUNTABLE OWNER",
    title: "Single Owner & Timebox",
    body: "Identifies the one role accountable for completing this sprint within the listed timebox. Clear single-threaded ownership prevents handoffs from stalling across vendor and customer teams.",
  },
  "sprint.team": {
    tag: "TEAM PAIRING",
    title: "Required Teams & Connected Integrations",
    body: "Counts the paired vendor and customer engineering roles plus live systems involved in this stage. Open Scope & Governance to see the exact roster and integration protocols.",
  },
  "sprint.trigger": {
    tag: "ENTRY CRITERIA",
    title: "Sprint Start Trigger",
    body: "Defines the exact prerequisite that unlocks this sprint so teams never waste time running downstream checks before upstream contracts or staging setups are ready.",
  },
  "sprint.doneWhen": {
    tag: "EXIT CRITERIA",
    title: "Completion Criteria (Done When)",
    body: "Summarizes the measurable condition required to clear this gate. Open Scope & Governance to view the full Definition of Done checklist.",
  },
  "sprint.scopeGovernanceBtn": {
    tag: "GOVERNANCE",
    title: "Scope & Governance Contract Drawer",
    body: "Opens the complete operating contract for the active stage—including Hard Stop rules, strict In-Scope vs. Out-of-Scope boundaries, engineer rosters, connected integrations, and Definition of Done.",
  },
  "governance.header": {
    tag: "STAGE CONTRACT",
    title: "Stage Scope & Governance Charter",
    body: "Defines what this stage owns, what it explicitly refuses to do, and which live telemetry proof is required to exit. Prevents scope creep and clarifies vendor vs. customer responsibilities.",
  },
  "governance.owner": {
    tag: "ACCOUNTABILITY",
    title: "Single Accountable Owner",
    body: "The one named role responsible for driving this stage to completion and escalating blockers. Other engineers collaborate, but one person owns the outcome.",
  },
  "governance.timebox": {
    tag: "CADENCE",
    title: "Target Sprint Timebox",
    body: "Expected focused engineering window for this stage. NominalX gates are designed for short, tight verification sprints—never multi-week review committees.",
  },
  "governance.hardStops": {
    tag: "HARD STOP POLICY",
    title: "Non-Negotiable Hard Stops",
    body: "Conditions that automatically force NO-GO and cannot be waived under any circumstances. Live staging telemetry must prove compliance before launch can proceed.",
  },
  "governance.inScope": {
    tag: "BOUNDARY",
    title: "Strictly In-Scope Work",
    body: "Exact technical checks and deliverables this sprint is responsible for verifying. Keeps engineering effort focused on launch-critical reliability.",
  },
  "governance.outOfScope": {
    tag: "GUARDRAILS",
    title: "Explicitly Out-of-Scope Work",
    body: "Activities intentionally excluded from this stage (such as verbal sign-offs, security waivers, or unrelated audits) so sprints finish fast without drifting.",
  },
  "governance.vendorEngineers": {
    tag: "VENDOR ROSTER",
    title: "Customer-Facing Engineers (Vendor)",
    body: "Vendor engineering roles participating in this stage—such as Lead FDE, SE/SA, Lead CSE, Support Engineer, and TAM—each with a defined handoff responsibility.",
  },
  "governance.customerEngineers": {
    tag: "CUSTOMER ROSTER",
    title: "Customer Engineering Counterparts",
    body: "Customer technical roles paired directly with vendor engineers to make real staging fixes, rotate secrets, and validate alerting and runbooks.",
  },
  "governance.integrations": {
    tag: "SYSTEMS",
    title: "Connected Integrations Matrix",
    body: "Lists every external platform, protocol, and ownership side (vendor, customer, or shared) probed during this stage.",
  },
  "governance.resources": {
    tag: "PREREQUISITES",
    title: "Required Resources & Credentials",
    body: "Specific artifacts, staging URLs, read-only tokens, or test secrets teams need on hand before kicking off this sprint.",
  },
  "governance.dod": {
    tag: "COMPLETION",
    title: "Definition of Done",
    body: "Objective exit checklist verified by deterministic telemetry. Every item must be satisfied before advancing to the next stage.",
  },

  // ── Gate 1: Flight Check (Setup Check) ─────────────────────────────────────
  "gate1.header": {
    tag: "GATE 1 · SETUP CHECK",
    title: "Flight Check (Setup Check): Sold Contract vs. Live Staging",
    body: "Proving staging matches what Sales sold. Probes every contracted technical requirement in parallel against customer staging—click any station tile below to inspect exact contract-vs-observed diffs, raw HTTP traces, and one-click fix or waiver controls.",
  },
  "gate1.counters": {
    tag: "STATION STATUS",
    title: "NOMINAL, WAIVED & NO-GO Counters",
    body: "NOMINAL means live telemetry matches the sold contract. WAIVED (max 2 active) means an operational check has a time-boxed Risk Waiver (≤ 30 days) with an owner and rollback plan. NO-GO blocks Gate 1 until fixed or validly waived.",
  },
  "gate1.runFlightCheck": {
    tag: "LIVE PROBE",
    title: "Run Parallel Flight Check Sweep",
    body: "Re-polls every Gate 1 station sequentially with live telemetry animations, refreshes pass/fail verdicts, and appends fresh HTTP evidence entries to the Live Wire Log.",
  },
  "gate1.hardStopBadge": {
    tag: "NON-WAIVABLE",
    title: "Hard Stop Security / Compliance Boundary",
    body: "This station protects a non-negotiable security or compliance guarantee (like SSO/MFA or data residency). Risk Waivers are permanently disabled—live staging telemetry must pass to unlock launch.",
  },
  "gate1.waivableBadge": {
    tag: "WAIVER ELIGIBLE",
    title: "Operational Check (Waiver Eligible)",
    body: "If staging cannot pass immediately due to a scheduled upgrade, you may issue a bounded Risk Waiver with a named owner, ≤ 30-day expiry, and rollback plan (up to 2 active waivers total).",
  },
  "gate1.stationStatus": {
    tag: "TELEMETRY VERDICT",
    title: "Station Telemetry Status",
    body: "NOMINAL = live probe passed every contract assertion. HOLD / WAIVED = failing check temporarily covered by a valid ≤ 30-day Operational Waiver. NO-GO = active drift blocking Gate 1 completion.",
  },
  "station.AUTH_SSO": {
    tag: "GATE 1 · HARD STOP",
    title: "1 of 6: AUTH / SSO",
    body: "Verifies that staging enforces the contracted identity protocol (SAML 2.0 or OIDC), requires MFA, rejects unsigned assertions, and uses a signing certificate with more than 30 days left. Because weak auth risks account takeover, this is a non-waivable Hard Stop.",
  },
  "station.RESIDENCY": {
    tag: "GATE 1 · HARD STOP",
    title: "2 of 6: DATA RESIDENCY",
    body: "Inspects response region headers, DNS targets, storage buckets, and egress hops to prove customer data never leaves contracted geographic regions. Because out-of-region routing breaks compliance laws, this is a non-waivable Hard Stop.",
  },
  "station.WEBHOOKS": {
    tag: "GATE 1 · OPERATIONAL",
    title: "3 of 6: WEBHOOKS (HMAC-SHA256)",
    body: "Probes webhook ingress with valid, unsigned, and tampered payloads to verify strict HMAC signature checks and dual-key rotation readiness. Failing staging checks can be patched directly or covered by a bounded operational waiver.",
  },
  "station.QUOTA_RATE": {
    tag: "GATE 1 · OPERATIONAL",
    title: "4 of 6: QUOTA / RATE LIMITS",
    body: "Confirms provisioned throughput (RPS) meets the contracted ceiling and that HTTP 429 throttle responses include a valid Retry-After header. Prevents sudden Day-1 throttling when real traffic ramps up.",
  },
  "station.ALERTING": {
    tag: "GATE 1 · OPERATIONAL",
    title: "5 of 6: P1 ALERTING",
    body: "Sends a synthetic dry-run alert (X-NominalX-Probe: true) to verify alerts land in an active, monitored channel within the contracted ACK latency—catching archived Slack channels or dead PagerDuty webhooks before launch.",
  },
  "station.ROLLBACK": {
    tag: "GATE 1 · OPERATIONAL",
    title: "6 of 6: RELEASE ROLLBACK",
    body: "Runs a versioned rollback dry-run to prove production cutover can revert within the contracted maximum RTO with zero data loss. Gives both teams a verified emergency exit before turning on traffic.",
  },
  "gate1.diffInspector": {
    tag: "CONTRACT DIFF",
    title: "Contract Promised vs. Live Telemetry Inspector",
    body: "Compares each technical promise recorded in nominalx.yaml side-by-side against what the live staging probe returned. Red DRIFT rows pinpoint the exact mismatch that needs fixing.",
  },
  "gate1.promisedColumn": {
    tag: "EXPECTED",
    title: "Contract Promised (nominalx.yaml)",
    body: "The exact target value agreed at Deal Close and codified in nominalx.yaml. Every field here becomes an automated pass/fail assertion.",
  },
  "gate1.observedColumn": {
    tag: "ACTUAL",
    title: "Live Telemetry Observed",
    body: "The real value returned by probing the customer's staging endpoint. Rows turn green (MATCH) once live telemetry satisfies the contract.",
  },
  "gate1.applyFix": {
    tag: "REMEDIATION",
    title: "Apply Staging Fix & Re-Poll",
    body: "Applies the staged infrastructure or configuration fix shown in the diff preview and immediately re-polls this station so you can verify live telemetry flips to NOMINAL.",
  },
  "gate1.waiverAction": {
    tag: "WAIVER CONTROL",
    title: "Operational Risk Waiver Policy",
    body: "Allows a temporary launch exception on operational (non-Hard-Stop) stations when a real remediation is already scheduled. Hard Stops stay locked; waivers require an owner, ≤ 30-day expiry, and rollback plan, capped at 2 active.",
  },
  "gate1.wireEvidence": {
    tag: "HTTP EVIDENCE",
    title: "Raw Wire Probe Evidence",
    body: "Shows the exact curl probe, HTTP status, latency, response headers, and highlighted assertion lines captured from staging. This raw evidence eliminates debates about whether a check actually ran.",
  },
  "gate1.patchDiff": {
    tag: "FIX PREVIEW",
    title: "Staged Infrastructure Fix Preview",
    body: "Shows the exact configuration or code diff that resolves the failing telemetry drift. Review red removed lines and green added lines before clicking Apply Staging Fix & Re-Poll.",
  },
  "gate1.subStageOwner": {
    tag: "OWNERSHIP",
    title: "Station Owner & Required Engineers",
    body: "Shows which single engineer owns clearing this station and which vendor + customer roles collaborate on the fix.",
  },
  "waiver.policy": {
    tag: "WAIVER RULES",
    title: "Bounded Operational Risk Waiver Rules",
    body: "Waivers are strictly capped at 2 active per account, expire in 30 days or less, and can never be issued on Hard Stop stations. Every field is validated live by the core governance engine.",
  },
  "waiver.owner": {
    tag: "REQUIRED FIELD",
    title: "Named Engineering Owner",
    body: "The specific engineer accountable for closing this waiver before expiry. Generic team aliases are discouraged so follow-through stays clear.",
  },
  "waiver.expiry": {
    tag: "MAX 30 DAYS",
    title: "Hard Expiry Date (≤ 30 Days)",
    body: "Date by which live staging telemetry must pass NOMINAL. Any waiver past 30 days is rejected immediately, and expired waivers automatically flip the station back to NO-GO.",
  },
  "waiver.ticket": {
    tag: "TRACKING",
    title: "Jira / Linear Ticket ID",
    body: "Links this waiver to a tracked engineering remediation issue so Support and TAM teams can monitor closure progress in the Waiver Aging Register.",
  },
  "waiver.reason": {
    tag: "JUSTIFICATION",
    title: "Operational Justification",
    body: "Explains why this operational gap is safe to carry temporarily and what scheduled work will close it. Appears verbatim in the Signed Dossier and Executive Report.",
  },
  "waiver.rollback": {
    tag: "SAFETY NET",
    title: "Concrete Rollback Plan",
    body: "Specifies the exact manual fallback or kill-switch procedure on-call engineers will execute if this waived check degrades in production before the permanent fix lands.",
  },

  // ── Gate 2: Static Fire (Fault Injection) ──────────────────────────────────
  "gate2.header": {
    tag: "GATE 2 · FAULT INJECTION",
    title: "Static Fire (Fault Injection): Staging Failure Test Stand",
    body: "Controlled fault injection to prove zero corruption. Injects real-world integration failures (duplicates, out-of-order delivery, rate-limit bursts, timeouts, secret rotation, schema additions, and clock drift) against staging until corruption reaches 0.0% (Grade A).",
  },
  "gate2.attemptHistory": {
    tag: "DELTA TRAIL",
    title: "Multi-Attempt Firing History",
    body: "Records each Static Fire run's corruption percentage and resilience grade over time. Provides auditable before-and-after proof in the Signed Dossier that your handler fixes eliminated data loss.",
  },
  "gate2.igniteBtn": {
    tag: "RUN FAILURE TEST",
    title: "Ignite / Re-Fire Static Fire Test Stand",
    body: "Executes every active failure scenario against the staging webhook endpoint using any fixes currently toggled ON in the patch switchboard. Updates packet counts, waveform telemetry, and grade live.",
  },
  "gate2.corruptionRate": {
    tag: "TARGET: 0.0%",
    title: "Data Corruption & Drop Rate",
    body: "Measures the percentage of test packets that caused duplicate writes, state corruption, crashes, or silent drops. Gate 2 stays NO-GO until corruption reaches 0.0% across every active scenario.",
  },
  "gate2.scenarioStrip": {
    tag: "SCENARIO MATRIX",
    title: "Per-Scenario Pass/Fail LED Strip",
    body: "Gives an instant visual readout of every active failure scenario in Gate 2. Green lamps passed with 0.0% corruption; red lamps show the exact corruption percentage still needing a handler fix.",
  },
  "gate2.resilienceGrade": {
    tag: "VERDICT STAMP",
    title: "Resilience Grade & CLI Exit Code",
    body: "Grades overall handler resilience from F to A based on measured data loss. Only Grade A (0.0% corruption, exit code 0) clears Gate 2 and unlocks Gate 3.",
  },
  "gate2.waveform": {
    tag: "LIVE TELEMETRY",
    title: "Packet Throughput vs. Error / Corruption Waveform",
    body: "Plots synthetic test load (blue line, requests/sec) against observed error and corruption spikes (red/green shaded curve) over the firing window. A flat 0% error baseline under load confirms clean recovery.",
  },
  "gate2.patchSwitchboard": {
    tag: "REMEDIATION",
    title: "Live Handler Patch Switchboard",
    body: "Toggle realistic code fixes for each failing failure mode—or stage all fixes at once—then click Re-Fire Test Stand to prove the patches drive corruption to 0.0%.",
  },
  "gate2.vectorMetrics": {
    tag: "SLO METRICS",
    title: "Corruption %, p95 Latency & Packet Counts",
    body: "Shows each scenario's exact corruption percentage, 95th-percentile response latency (p95 ms), corrupted packets, and silently dropped packets so you can spot both correctness bugs and latency spikes.",
  },
  "vector.duplicate_webhook": {
    tag: "GATE 2 · VECTOR 1",
    title: "Duplicate Webhook Delivery",
    body: "Replays identical event_id payloads concurrently and sequentially to catch double-writes or duplicate billing mutations. Passing requires an atomic idempotency store returning 200/204/409 without mutating state twice.",
  },
  "vector.out_of_order": {
    tag: "GATE 2 · VECTOR 2",
    title: "Out-of-Order Events",
    body: "Delivers a newer terminal event (canceled) before an older event (created) to catch 'zombie record' bugs. Passing requires monotonic sequence/version guards that ignore stale transitions.",
  },
  "vector.rate_limit_429": {
    tag: "GATE 2 · VECTOR 3",
    title: "429 Rate-Limit Burst",
    body: "Sends a burst exceeding steady-state RPS to verify the handler emits valid Retry-After headers and backs off with jitter instead of triggering a cascading retry storm or silent drops.",
  },
  "vector.upstream_timeout_30s": {
    tag: "GATE 2 · VECTOR 4",
    title: "30-Second Upstream Timeout",
    body: "Stalls a downstream dependency for 30 seconds to detect worker-pool exhaustion and 502/504 cascades. Passing requires hard per-request deadlines and clean Dead-Letter Queue (DLQ) handoff.",
  },
  "vector.dual_hmac_rotation": {
    tag: "GATE 2 · VECTOR 5",
    title: "Dual HMAC Secret Rotation",
    body: "Sends webhooks signed with both the active (v1) and staged next (v2) secrets alongside forged payloads. Proves routine credential rotation will cause zero dropped webhooks while rejecting forgeries.",
  },
  "vector.additive_json_fields": {
    tag: "GATE 2 · VECTOR 6",
    title: "Additive / Unknown JSON Fields",
    body: "Adds unexpected top-level and nested JSON keys to valid payloads to catch overly strict schema validators. Passing proves backwards-compatible API additions will never crash the integration.",
  },
  "vector.clock_skew_5m": {
    tag: "GATE 2 · VECTOR 7",
    title: "5-Minute Clock Skew",
    body: "Tests valid signed timestamps skewed by ±5 minutes plus a stale 15-minute replay attack. Proves minor host clock drift won't drop legitimate traffic while old replayed payloads are still blocked.",
  },

  // ── Gate 3: Crew Drill (Live Incident Drill) ───────────────────────────────
  "gate3.header": {
    tag: "GATE 3 · LIVE INCIDENT DRILL",
    title: "Crew Drill (Live Incident Drill): 90-Second Ops Game-Day",
    body: "Timed P1 alert rehearsal for Support and Customer SREs. Owned by the Lead CSE to hand off production safely—engineers stabilize real Day-30 alarms by applying actual config fixes under a live clock instead of taking quizzes.",
  },
  "gate3.stabilizedPill": {
    tag: "DRILL PROGRESS",
    title: "Stabilized Alarms & Handover Unlock",
    body: "Tracks how many P1 drill scenarios have achieved 3/3 consecutive green SLA ticks with verified ping proof. Stabilizing every active alarm unlocks the final Sign NOMINAL Dossier step.",
  },
  "gate3.slaTicks": {
    tag: "RECOVERY PROOF",
    title: "3/3 Consecutive Green SLA Ticks",
    body: "A single momentary dip isn't enough to declare an incident resolved. Each alarm requires three consecutive telemetry ticks inside the green SLA band before locking STABILIZED.",
  },
  "gate3.countdownClock": {
    tag: "90s GAME-DAY CLOCK",
    title: "Live Incident Countdown & Overtime",
    body: "Counts down the 90-second target MTTR budget once an alarm is injected. If the timer expires, the drill enters OVERTIME—you can still complete the real remediation to earn an OVERTIME PASS.",
  },
  "gate3.liveTelemetryChart": {
    tag: "LIVE METRIC",
    title: "Live Alarm Metric & Green SLA Band",
    body: "Plots the failing operational metric in real time against the dashed green SLA threshold. Once your configuration fix is accepted, the metric drops into (or rises above) the green band.",
  },
  "gate3.errorStream": {
    tag: "INCIDENT LOGS",
    title: "Live Incident Error Stream",
    body: "Streams real-time failure logs containing the clues needed to remediate—such as the offending source key, expiring certificate fingerprint, or archived P1 channel name.",
  },
  "gate3.remediationConsole": {
    tag: "REAL OPS CONTROLS",
    title: "Tactile Configuration Remediation Console",
    body: "Apply the exact production config patch required for the selected alarm, then click Apply Fix & Verify Ping. Invalid or incomplete patches are rejected with an actionable error message.",
  },
  "gate3.ctrl.sourceKey": {
    tag: "REMEDIATION INPUT",
    title: "Isolate Offending Source Key",
    body: "Identify the runaway API/source key flooding ingestion from the live error stream and isolate it so healthy tenants stay unaffected. Click 'Use Trace Key' to copy it directly from the trace.",
  },
  "gate3.ctrl.rateCap": {
    tag: "REMEDIATION INPUT",
    title: "Per-Tenant Rate Cap (RPS)",
    body: "Lower the tenant's allowed requests per second to or below the contracted SLA ceiling so ingestion throughput and spend return inside the green band.",
  },
  "gate3.ctrl.dlq": {
    tag: "REMEDIATION TOGGLE",
    title: "Enable DLQ Overflow Queue",
    body: "Routes burst payloads above the rate cap into a durable Dead-Letter Queue instead of dropping them or triggering an endless retry storm.",
  },
  "gate3.ctrl.certFp": {
    tag: "REMEDIATION INPUT",
    title: "Promote Staged X.509 Certificate Fingerprint",
    body: "Select the pre-staged replacement X.509 certificate fingerprint (>365d TTL) to replace the certificate expiring within 24 hours.",
  },
  "gate3.ctrl.dualGrace": {
    tag: "REMEDIATION TOGGLE",
    title: "Dual-Cert Grace Mode",
    body: "Accepts both the old and newly promoted X.509 certificates simultaneously during cutover so active user SSO sessions never drop mid-rotation.",
  },
  "gate3.ctrl.p1Channel": {
    tag: "REMEDIATION INPUT",
    title: "Rebind Active P1 Ops Channel",
    body: "Replaces the dead/archived alert target returning 404 channel_not_found with the customer's verified active P1 incident channel or PagerDuty route.",
  },
  "gate3.ctrl.pingVerify": {
    tag: "REMEDIATION TOGGLE",
    title: "Execute Live Synthetic P1 Ping",
    body: "Sends a live synthetic probe (X-NominalX-Probe: true) to the newly bound channel and requires an HTTP 200 OK acknowledgement before declaring the route healthy.",
  },
  "gate3.ctrl.customFix": {
    tag: "CUSTOM DRILL",
    title: "Apply Custom Remediation Step",
    body: "Confirms the on-call engineer executed the custom configuration or failover step defined in this Day-30 playbook.",
  },
  "gate3.ctrl.customProof": {
    tag: "CUSTOM DRILL",
    title: "Confirm Live Verification Probe",
    body: "Verifies that live telemetry confirms recovery and meets the 3/3 consecutive green SLA tick requirement.",
  },
  "alarm.runaway_ingestion_storm": {
    tag: "GATE 3 · ALARM 1",
    title: "1 of 3: Runaway Ingestion Storm",
    body: "Simulates a misbehaving source key spiking ingestion RPS and cloud spend past contracted limits. Stabilize it by isolating the offending key, setting the rate cap within SLA, and enabling DLQ overflow.",
  },
  "alarm.sso_cert_expiring_24h": {
    tag: "GATE 3 · ALARM 2",
    title: "2 of 3: SSO Certificate Expiring < 24h",
    body: "Simulates an imminent X.509 signing certificate expiration that would lock every customer user out overnight. Stabilize it by promoting the staged certificate with Dual-Cert Grace Mode enabled.",
  },
  "alarm.dead_p1_alert_channel": {
    tag: "GATE 3 · ALARM 3",
    title: "3 of 3: Dead / Archived P1 Alert Channel",
    body: "Simulates critical P1 alerts silently failing with 404 channel_not_found after a Slack or PagerDuty reorganization. Stabilize it by rebinding the active P1 route and confirming a 200 OK synthetic ping.",
  },

  // ── Reporting & Handover Hub ───────────────────────────────────────────────
  "reports.header": {
    tag: "REPORTING HUB",
    title: "Deterministic Reports & Signed Handover Hub",
    body: "Generates four role-specific artifacts directly from live Gate 1–3 telemetry using @nominalx/core—no manual copy-pasting or stale screenshots. Export any view to Slack, Markdown, or JSON in one click.",
  },
  "reports.exports": {
    tag: "1-CLICK EXPORTS",
    title: "Copy Slack, Download .md/.json & Raw Preview",
    body: "Copy Slack formats the active report as clean Slack mrkdwn for launch channels; Download .md saves human-readable docs for Notion/GitHub; Download .json saves machine-auditable evidence; Inspect Raw shows the exact output inline.",
  },
  "reports.tab.dossier": {
    tag: "STAGE 4 → 5",
    title: "Signed NOMINAL Dossier & Day-1 Runbook",
    body: "The formal launch certificate sealing every Gate 1–3 result with a SHA-256 verification digest, paired with an auto-generated Day-1 Runbook tailored to this customer's exact endpoints, quotas, and alert channels.",
  },
  "reports.tab.exec": {
    tag: "LEADERSHIP BRIEF",
    title: "Executive Readiness Report",
    body: "A concise go/no-go summary for VP Engineering and customer executives covering Hard Stop compliance, Gate 1–2 scores, active waiver exposure, and strict in-scope vs. out-of-scope boundaries.",
  },
  "reports.tab.ops": {
    tag: "DAILY STANDUP",
    title: "Operational Sprint & Integrations Digest",
    body: "An engineering-first view showing live health across every connected integration, remaining Gate 1 station blockers with remediation steps, and exact next CLI commands to run.",
  },
  "reports.tab.waivers": {
    tag: "AUDIT REGISTER",
    title: "Waiver Aging & Governance Register",
    body: "Tracks every active operational waiver's owner, Jira/Linear ticket, rollback plan, and countdown to its ≤ 30-day expiry, alongside formal attestation that zero Hard Stops are waived.",
  },
  "reports.dossier.seal": {
    tag: "CERTIFICATE SEAL",
    title: "Flight Readiness Seal Verdict",
    body: "Reflects the immutable launch state captured at signing time: NOMINAL (all green, zero waivers), NOMINAL WITH WAIVERS (all Hard Stops green, ≤ 2 valid operational waivers), or NO-GO (draft only until blockers clear).",
  },
  "reports.dossier.sha256": {
    tag: "TAMPER-EVIDENT",
    title: "Deterministic SHA-256 Verification Digest",
    body: "A cryptographic fingerprint computed deterministically over the account config, Gate 1–3 evidence, and signer roster. If any check result or waiver changes later, the digest changes immediately.",
  },
  "reports.dossier.signoff": {
    tag: "HANDOVER LOCK",
    title: "Multi-Party Handover Sign-Off Block",
    body: "Requires named Lead FDE, Lead CSE (Gate 3 Owner), and Customer Engineering Lead signers before sealing the Dossier. Sealing locks the handover baseline for Stage 5 Support and bumps Readiness to 100%.",
  },
  "reports.dossier.runbook": {
    tag: "STAGE 5 HANDOFF",
    title: "Stack-Tailored Day-1 Customer Runbook",
    body: "Auto-generated directly from verified telemetry baselines (auth protocol, regions, RPS ceiling, P1 channel, RTO). Gives Support Engineers and Customer SREs copy-paste CLI commands on Day 1.",
  },
  "reports.exec.decision": {
    tag: "GO / NO-GO",
    title: "Executive Launch Decision & Recommended Action",
    body: "Translates technical telemetry into a clear launch recommendation so leadership immediately knows whether to cut over, hold for a specific fix, or proceed with bounded waivers.",
  },
  "reports.exec.hardStops": {
    tag: "SECURITY GATE",
    title: "Hard Stop Compliance Summary",
    body: "Lists every non-waivable security and compliance station (built-in and custom) and confirms each one is verified NOMINAL by live telemetry.",
  },
  "reports.exec.waiverExposure": {
    tag: "RISK EXPOSURE",
    title: "Active Waiver Exposure & Nearest Expiry",
    body: "Shows how many of the maximum 2 operational waivers are currently in use and flags the soonest expiration date so leadership can prevent post-launch drift.",
  },
  "reports.exec.scopeBoundaries": {
    tag: "GOVERNANCE",
    title: "Verified Scope Boundaries",
    body: "Clarifies exactly what NominalX verified in-scope versus what remains explicitly out-of-scope, avoiding misaligned expectations at launch sign-off.",
  },
  "reports.ops.integrationMatrix": {
    tag: "SYSTEM HEALTH",
    title: "Live Integration Health Matrix",
    body: "Maps every connected vendor and customer integration (IdP, cloud region, webhook gateway, rate limiter, P1 alerting, rollback pipeline) to its current live probe status and endpoint.",
  },
  "reports.ops.blockers": {
    tag: "ACTION QUEUE",
    title: "Gate 1 Non-Nominal Blockers",
    body: "Lists only the stations still in NO-GO or WAIVED state along with their concrete remediation instructions so daily standups focus strictly on closing gaps.",
  },
  "reports.ops.cliCommands": {
    tag: "EXECUTABLE CLI",
    title: "Next Deterministic CLI Commands",
    body: "Exact nominalx CLI commands engineers can run in CI or from a terminal to re-verify fixes, fire failure tests, or export the signed dossier.",
  },
  "reports.waivers.policyAttestation": {
    tag: "POLICY AUDIT",
    title: "Hard Stop Policy Attestation",
    body: "Formal governance statement proving which stations are locked as non-waivable Hard Stops, confirming zero policy violations, and enforcing the ≤ 30-day maximum duration.",
  },
  "reports.waivers.capUtilization": {
    tag: "WAIVER BUDGET",
    title: "Operational Waiver Cap Utilization",
    body: "Shows current usage against the hard cap of 2 active operational waivers per account. Exceeding the cap is automatically blocked by the engine.",
  },
  "reports.waivers.agingRegister": {
    tag: "EXPIRY TRACKER",
    title: "Active Operational Waivers Aging Register",
    body: "Tracks remaining days until each waiver expires (color-coded by urgency band) along with the named owner, linked ticket, justification, and rollback plan.",
  },

  // ── Live Wire Log Drawer ───────────────────────────────────────────────────
  "wireLog.header": {
    tag: "TELEMETRY LOG",
    title: "Deterministic Probe Telemetry Stream",
    body: "Shows every probe, staging patch, waiver decision, failure-test run, and dossier seal executed in this session with timestamp, HTTP method, endpoint, status code, and latency.",
  },

  // ── Customize Slide-Over Drawer ────────────────────────────────────────────
  "customize.header": {
    tag: "LIVE CUSTOMIZER",
    title: "Tailor Gates Live & Export nominalx.yaml",
    body: "Adapt NominalX to any customer's unique security, API, or operational requirements right in the browser. Edits save locally per account, update all three gates immediately, and stay 2-way synced with nominalx.yaml.",
  },
  "customize.tab.gate1": {
    tag: "GATE 1 · SETUP CHECK",
    title: "Customize Flight Check (Setup Check) Stations",
    body: "Inspect the 6 built-in Setup Check stations and add custom HTTP/JSON/header probes—including custom non-waivable Hard Stops like PCI or HSM checks.",
  },
  "customize.tab.gate2": {
    tag: "GATE 2 · FAULT INJECTION",
    title: "Customize Static Fire (Fault Injection) Chaos Vectors",
    body: "Enable or disable built-in Fault Injection scenarios (at least 1 must stay active) or define custom adversarial webhook/API payloads and handler patch diffs.",
  },
  "customize.tab.gate3": {
    tag: "GATE 3 · LIVE INCIDENT DRILL",
    title: "Customize Crew Drill (Live Incident Drill) Alarms",
    body: "Enable or disable built-in Day-30 Live Incident Drills or create custom timed P1 alarms with tailored symptoms, log lines, and remediation proof.",
  },
  "customize.tab.yaml": {
    tag: "CONTRACT AS CODE",
    title: "Live 2-Way Synced nominalx.yaml Editor",
    body: "View, edit, validate, or download the complete nominalx.yaml contract file. Any valid YAML applied here immediately updates Gate 1, Gate 2, Gate 3, and all Reports.",
  },
  "customize.g1.templates": {
    tag: "QUICK START",
    title: "1-Click Custom Station Templates",
    body: "Instantly add pre-built enterprise probes—like a non-waivable PCI / Secret Vault Hard Stop or a Custom SLA Endpoint—to see how custom stations behave across Gate 1 and Reports.",
  },
  "customize.g1.roster": {
    tag: "ACTIVE STATIONS",
    title: "Active Flight Check Stations Roster",
    body: "Lists all 6 core built-in stations plus any custom stations you added. Built-in stations stay locked as the baseline; custom stations can be removed anytime.",
  },
  "customize.g1.code": {
    tag: "STATION ID",
    title: "Station Code (UPPER_SLUG)",
    body: "Unique uppercase identifier used in nominalx.yaml, CLI output, and waiver rules (for example, PCI_VAULT or KMS_HSM). Must start with a letter and use A–Z, 0–9, or underscores.",
  },
  "customize.g1.label": {
    tag: "DISPLAY NAME",
    title: "Station Display Label",
    body: "Human-readable title shown on the Gate 1 tile, diff inspector, and Signed Dossier (for example, 'PCI Token Vault').",
  },
  "customize.g1.endpoint": {
    tag: "HTTP TARGET",
    title: "Probe Endpoint Path",
    body: "Relative staging URL path (starting with /) that NominalX probes during Flight Check, combined with the account's staging base URL.",
  },
  "customize.g1.method": {
    tag: "HTTP VERB",
    title: "Probe HTTP Method",
    body: "HTTP verb sent to the staging endpoint—use GET for read-only health/metadata endpoints or POST for synthetic dry-run verification endpoints.",
  },
  "customize.g1.expectedStatus": {
    tag: "ASSERTION",
    title: "Expected HTTP Status Code",
    body: "Exact HTTP status code (typically 200 or 204) required for the live telemetry probe to pass NOMINAL.",
  },
  "customize.g1.requiredHeader": {
    tag: "OPTIONAL ASSERTION",
    title: "Required Response Header Name",
    body: "Optional HTTP header that must appear in the staging response (for example, x-pci-vault-mode or x-served-region) to prove infrastructure enforcement.",
  },
  "customize.g1.headerContains": {
    tag: "OPTIONAL ASSERTION",
    title: "Required Header Substring",
    body: "Expected value or substring that the required response header must contain for the assertion to pass.",
  },
  "customize.g1.jsonPath": {
    tag: "OPTIONAL ASSERTION",
    title: "Required JSON Field Path",
    body: "Optional dot-separated path inside the JSON response body (for example, tokenization.pan_isolation) to verify specific runtime configuration flags.",
  },
  "customize.g1.jsonEquals": {
    tag: "OPTIONAL ASSERTION",
    title: "Expected JSON Field Value",
    body: "Exact boolean, number, or string value the JSON field must equal (for example, true or 'strict') to mark the station NOMINAL.",
  },
  "customize.g1.owner": {
    tag: "ACCOUNTABILITY",
    title: "Accountable Station Engineer",
    body: "Single named engineer responsible for clearing this custom station if staging telemetry drifts.",
  },
  "customize.g1.soldPromise": {
    tag: "CONTRACT PROMISE",
    title: "Sold Contract Promise",
    body: "Plain-English description of what Sales committed and what staging must prove. Appears in the Gate 1 Contract Diff table and Signed Dossier.",
  },
  "customize.g1.hardStop": {
    tag: "POLICY LOCK",
    title: "Enforce as Non-Waivable Hard Stop (hard_stop: true)",
    body: "Marks this custom station as a strict security or compliance boundary identical to AUTH / SSO and RESIDENCY. When enabled, waivers are blocked in both the UI and nominalx.yaml validation.",
  },
  "customize.g2.templates": {
    tag: "QUICK START",
    title: "1-Click Chaos Vector Template",
    body: "Adds a ready-made 'Malformed Idempotency Key (HTTP 400)' failure test so you can immediately see custom vectors run, fail, patch, and reach Grade A in Gate 2.",
  },
  "customize.g2.builtinToggle": {
    tag: "SCENARIO SELECTION",
    title: "Enable / Disable Built-In Failure Scenarios",
    body: "Tailor Gate 2 to the customer's architecture by toggling individual built-in scenarios on or off. At least one Gate 2 vector must remain active.",
  },
  "customize.g2.id": {
    tag: "VECTOR ID",
    title: "Chaos Vector ID (snake_case)",
    body: "Unique lowercase identifier used in nominalx.yaml and static-fire.json (for example, invalid_currency_code).",
  },
  "customize.g2.label": {
    tag: "DISPLAY NAME",
    title: "Chaos Vector Label",
    body: "Short readable name shown on the Gate 2 scenario card and failure LED strip.",
  },
  "customize.g2.endpoint": {
    tag: "HTTP TARGET",
    title: "Endpoint Override Path",
    body: "Staging endpoint path (starting with /) targeted by this failure scenario. Defaults to the account's main webhook ingress endpoint.",
  },
  "customize.g2.method": {
    tag: "HTTP VERB",
    title: "Fault Injection HTTP Method",
    body: "HTTP method used when sending the adversarial test payload to staging.",
  },
  "customize.g2.expectedStatus": {
    tag: "PASS THRESHOLD",
    title: "Expected Resilient HTTP Status",
    body: "HTTP status code a properly hardened handler should return (for example, 400 for malformed input or 200/409 for deduplicated replays).",
  },
  "customize.g2.description": {
    tag: "ASSERTION",
    title: "Failure Assertion Description",
    body: "Explains the exact failure condition being tested and what correct handler behavior looks like.",
  },
  "customize.g2.patchLabel": {
    tag: "SWITCHBOARD",
    title: "Handler Switchboard Patch Label",
    body: "Label shown on the Gate 2 Live Handler Patch Switchboard card so engineers can toggle and verify this fix.",
  },
  "customize.g2.owner": {
    tag: "ACCOUNTABILITY",
    title: "Accountable Vector Engineer",
    body: "Named engineer responsible for hardening the handler against this failure mode.",
  },
  "customize.g2.patchDiff": {
    tag: "FIX DIFF",
    title: "Handler Patch Diff Lines",
    body: "Code diff preview (- removed / + added lines) displayed on the Gate 2 switchboard to show the exact fix required.",
  },
  "customize.g3.templates": {
    tag: "QUICK START",
    title: "1-Click Day-30 Alarm Template",
    body: "Adds a pre-built 'Webhook DLQ Backlog Spike (90s P1)' drill to Gate 3 so you can run a realistic custom on-call game day immediately.",
  },
  "customize.g3.builtinToggle": {
    tag: "ALARM SELECTION",
    title: "Enable / Disable Built-In Day-30 Alarms",
    body: "Choose which core P1 scenarios run during this customer's Crew Drill sprint. At least one active alarm is required.",
  },
  "customize.g3.id": {
    tag: "ALARM ID",
    title: "Alarm ID (snake_case)",
    body: "Unique lowercase identifier used in nominalx.yaml and crew-drill.json (for example, redis_pool_exhaustion).",
  },
  "customize.g3.title": {
    tag: "DISPLAY NAME",
    title: "Alarm Scenario Title",
    body: "Incident headline displayed on the Gate 3 drill card and remediation console.",
  },
  "customize.g3.metric": {
    tag: "TELEMETRY",
    title: "Monitored Incident Metric Label",
    body: "Operational metric plotted on the live Gate 3 recovery chart (for example, 'Queue Backlog Depth' or 'Error Rate %').",
  },
  "customize.g3.timer": {
    tag: "MTTR BUDGET",
    title: "Drill Countdown Timer (Seconds)",
    body: "Target stabilization window (15–600 seconds, default 90s). Completing remediation before zero earns a clean STABILIZED pass; finishing late records an OVERTIME PASS.",
  },
  "customize.g3.owner": {
    tag: "ACCOUNTABILITY",
    title: "Drill Scenario Owner",
    body: "Lead CSE or Support/SRE owner responsible for facilitating this alarm during the enablement game day.",
  },
  "customize.g3.symptom": {
    tag: "ALERT TRIGGER",
    title: "Trigger Symptom Summary",
    body: "Plain-English description of the P1 alert symptom paged to the on-call engineer when the drill starts.",
  },
  "customize.g3.logLines": {
    tag: "ERROR STREAM",
    title: "Live Incident Error Log Lines",
    body: "Realistic log lines (one per line) streamed into Gate 3's incident terminal so on-call engineers diagnose from real evidence.",
  },
  "customize.g3.remLabel": {
    tag: "RUNBOOK ACTION",
    title: "Remediation Action Label",
    body: "Short action name shown on the Gate 3 remediation checklist toggle that engineers execute to stabilize the alarm.",
  },
  "customize.g3.proof": {
    tag: "VERIFICATION",
    title: "Live Verification Proof",
    body: "Exact green probe output logged once the remediation succeeds and 3/3 SLA ticks turn green.",
  },
  "customize.g3.remDetail": {
    tag: "RUNBOOK DETAIL",
    title: "Remediation Playbook Detail",
    body: "Exact operational instruction telling the customer's on-call SRE what configuration or failover action to perform during the drill.",
  },
  "customize.yaml.apply": {
    tag: "VALIDATE & APPLY",
    title: "Apply nominalx.yaml Live",
    body: "Parses and validates your YAML against NominalX's strict schema (including Hard Stop waiver bans) and immediately updates Gate 1, Gate 2, Gate 3, and Reports if valid.",
  },
  "customize.yaml.loadExample": {
    tag: "DEMO PRESET",
    title: "Load Custom Payments API Example",
    body: "Loads a complete end-to-end payments configuration featuring a custom PCI_TOKEN_VAULT Hard Stop, a Malformed Idempotency Key chaos vector, and a Webhook DLQ Backlog Spike alarm.",
  },
  "customize.yaml.download": {
    tag: "EXPORT FILE",
    title: "Download nominalx.yaml",
    body: "Downloads the exact YAML contract shown below so you can commit it to Git and run the same checks headlessly via the nominalx CLI in CI/CD.",
  },
  "customize.yaml.reset": {
    tag: "RESET",
    title: "Reset All Customizations",
    body: "Clears all custom stations, disabled/custom vectors, disabled/custom alarms, and YAML overrides for this account, restoring clean preset defaults.",
  },
  "customize.yaml.editor": {
    tag: "SCHEMA VALIDATED",
    title: "Live 2-Way Synced nominalx.yaml Editor",
    body: "Edit the raw YAML contract directly. Validation catches missing fields, invalid station/vector/alarm slugs, expired waivers, and any attempt to waive a Hard Stop station.",
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpCopyKey = keyof typeof HELP_COPY;

export function getStageHelp(stageNumber: StageNumber): HelpEntry {
  const key = `pipeline.stage.${stageNumber}` as HelpCopyKey;
  return HELP_COPY[key];
}

export function getStationHelp(station: StationResult): HelpEntry {
  const builtInKey = `station.${station.stationCode}` as HelpCopyKey;
  if (builtInKey in HELP_COPY) {
    return HELP_COPY[builtInKey];
  }
  const policyText = station.isHardStop
    ? "Enforced as a non-waivable Hard Stop—live staging telemetry must pass before launch can unlock."
    : "Operational custom station—fix staging telemetry or issue a bounded ≤ 30-day Risk Waiver.";
  return {
    tag: station.isHardStop ? "CUSTOM · HARD STOP" : "CUSTOM · OPERATIONAL",
    title: `${station.subStage}: ${station.stationLabel} (${station.stationCode})`,
    body: `Custom Gate 1 telemetry probe targeting ${station.evidence.method} ${station.evidence.endpoint} (owned by ${station.accountableOwner}). ${policyText}`,
  };
}

export function getVectorHelp(
  vector: StaticFireResult["vectors"][number],
): HelpEntry {
  const builtInKey = `vector.${vector.vectorId}` as HelpCopyKey;
  if (builtInKey in HELP_COPY) {
    return HELP_COPY[builtInKey];
  }
  return {
    tag: "CUSTOM · CHAOS VECTOR",
    title: `${vector.subStage}: ${vector.vectorName}`,
    body: `Custom Gate 2 failure test (${vector.vectorId}) checking resilient staging error handling. Toggle its handler patch in the switchboard above and re-fire until corruption hits 0.0%.`,
  };
}

export function getAlarmHelp(alarm: CrewAlarmState): HelpEntry {
  const builtInKey = `alarm.${alarm.alarmId}` as HelpCopyKey;
  if (builtInKey in HELP_COPY) {
    return HELP_COPY[builtInKey];
  }
  const owner = alarm.owner ? `Owned by ${alarm.owner}. ` : "";
  return {
    tag: `CUSTOM · ${alarm.timeLimitSeconds}s DRILL`,
    title: `${alarm.subStage}: ${alarm.alarmName}`,
    body: `${owner}Custom Day-30 P1 game-day drill monitoring ${alarm.scenario.metricLabel}. Start the clock, apply the playbook remediation in the console, and confirm 3/3 green SLA ticks.`,
  };
}
