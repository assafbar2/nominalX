import { DEPLOYMENT_MODEL_LABELS } from "@nominalx/core";
import { computeReadinessScore } from "../state/missionState";
import {
  buildCustomerCockpitModel,
  type CustomerWorkspaceRecord,
} from "../state/workspaceState";
import { HelpTip } from "./HelpTip";
import { NominalXLogo, ShieldLockIcon } from "./Icons";

interface FirstRunLaunchpadProps {
  myCustomers: readonly CustomerWorkspaceRecord[];
  onStartSetupWizard: () => void;
  onExploreSamples: () => void;
  onOpenImport: () => void;
  onSelectCustomer: (customerId: string) => void;
}

export function FirstRunLaunchpad({
  myCustomers,
  onStartSetupWizard,
  onExploreSamples,
  onOpenImport,
  onSelectCustomer,
}: FirstRunLaunchpadProps) {
  const hasCustomers = myCustomers.length > 0;

  return (
    <section
      className="launchpad-shell"
      aria-label="NominalX First-Run Launchpad"
      data-testid="first-run-launchpad"
    >
      {/* Hero Launchpad Block */}
      <div className="panel launchpad-hero">
        <div className="launchpad-hero-top">
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <NominalXLogo size={46} />
            <div>
              <div className="help-inline">
                <span className="gap-chip">
                  LIVE CUSTOMER READINESS · ZERO-LLM DETERMINISTIC ENGINE
                </span>
                <HelpTip copyKey="launchpad.overview" />
              </div>
              <h1 className="launchpad-headline">
                Prove every customer launch is ready before Day 1.
              </h1>
            </div>
          </div>

          <div className="launchpad-quote-pill">
            <span className="mono" style={{ color: "var(--active-text)", fontWeight: 800 }}>
              NO MORE SPREADSHEET SIGN-OFFS:
            </span>{" "}
            <span>Sales says the account is green. Nothing is nominal until telemetry proves it.</span>
          </div>
        </div>

        {/* 3 Clear Entry Actions */}
        <div className="launchpad-actions-row">
          <div className="help-control-wrap">
            <button
              type="button"
              className="btn btn-primary btn-lg launchpad-cta-primary"
              onClick={onStartSetupWizard}
              data-testid="launchpad-setup-btn"
            >
              <span>
                {hasCustomers
                  ? "+ Add Another Customer"
                  : "Set Up Your First Customer"}
              </span>
              <span className="launchpad-cta-sub mono">FREE · 60s WIZARD</span>
            </button>
            <HelpTip copyKey="launchpad.action.setup" size="md" />
          </div>

          <div className="help-control-wrap">
            <button
              type="button"
              className="btn btn-lg"
              onClick={onExploreSamples}
              data-testid="launchpad-samples-btn"
            >
              <span>Explore 4 Sample Customers</span>
              <span className="launchpad-cta-sub-muted mono">MERIDIAN + TOUR</span>
            </button>
            <HelpTip copyKey="launchpad.action.samples" size="md" />
          </div>

          <div className="help-control-wrap">
            <button
              type="button"
              className="btn btn-lg"
              onClick={onOpenImport}
              data-testid="launchpad-import-btn"
            >
              <span>Import nominalx.yaml</span>
            </button>
            <HelpTip copyKey="launchpad.action.import" size="md" />
          </div>
        </div>
      </div>

      {/* Visual In-Between Journey Strip: Deal Close -> [Gate 1 · Gate 2 · Gate 3] -> Support & Renewal */}
      <div
        className="panel launchpad-journey-strip"
        aria-label="Customer Engineering Journey from Deal Close through NominalX Gates 1 to 3 to Support and Renewal"
        data-testid="launchpad-journey-strip"
      >
        <div className="launchpad-bookend">
          <span className="mono launchpad-bookend-tag">BEFORE NOMINALX</span>
          <strong className="launchpad-bookend-title">Deal Close</strong>
          <span className="launchpad-bookend-sub">CRM Handoff · Before Launch Readiness</span>
        </div>

        <span className="launchpad-journey-arrow" aria-hidden="true">→</span>

        <div className="launchpad-gap-bracket">
          <div className="launchpad-gap-bracket-label mono">
            THE IN-BETWEEN GAP · NOMINALX LAUNCH READINESS
          </div>
          <div className="launchpad-gap-pills">
            <span className="launchpad-gap-pill">
              <strong className="mono">GATE 1</strong>
              <span>Flight Check · Setup Check</span>
            </span>
            <span className="launchpad-gap-pill-arrow" aria-hidden="true">→</span>
            <span className="launchpad-gap-pill">
              <strong className="mono">GATE 2</strong>
              <span>Static Fire · Fault Injection</span>
            </span>
            <span className="launchpad-gap-pill-arrow" aria-hidden="true">→</span>
            <span className="launchpad-gap-pill">
              <strong className="mono">GATE 3</strong>
              <span>Crew Drill · Live Incident Drill</span>
            </span>
          </div>
        </div>

        <span className="launchpad-journey-arrow" aria-hidden="true">→</span>

        <div className="launchpad-bookend-pair">
          <div className="launchpad-bookend">
            <span className="mono launchpad-bookend-tag">AFTER NOMINALX</span>
            <strong className="launchpad-bookend-title">Support</strong>
            <span className="launchpad-bookend-sub">Live Operations</span>
          </div>
          <div className="launchpad-bookend">
            <span className="mono launchpad-bookend-tag">AFTER NOMINALX</span>
            <strong className="launchpad-bookend-title">Renewal &amp; Expansion</strong>
            <span className="launchpad-bookend-sub">Customer Growth</span>
          </div>
        </div>
      </div>

      {/* 20-Second Explainer: 3 Bold Scannable Gate Cards */}
      <div className="launchpad-gates-grid">
        <article className="panel launchpad-gate-card gate-accent-1">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span className="mono launchpad-gate-chip">GATE 1</span>
            <HelpTip copyKey="launchpad.gate1" />
          </div>
          <h2 className="launchpad-gate-title">
            Flight Check{" "}
            <span style={{ color: "var(--active-text)" }}>· Setup Check</span>
          </h2>
          <p className="launchpad-gate-promise">
            Prove staging matches what Sales sold.
          </p>
          <div className="launchpad-gate-footer">
            <span className="stack-chip">OWNER: LEAD FDE</span>
            <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              SALES-TO-FDE HANDOFF
            </span>
          </div>
        </article>

        <article className="panel launchpad-gate-card gate-accent-2">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span className="mono launchpad-gate-chip">GATE 2</span>
            <HelpTip copyKey="launchpad.gate2" />
          </div>
          <h2 className="launchpad-gate-title">
            Static Fire{" "}
            <span style={{ color: "var(--active-text)" }}>· Fault Injection</span>
          </h2>
          <p className="launchpad-gate-promise">
            Break things safely to prove zero data corruption.
          </p>
          <div className="launchpad-gate-footer">
            <span className="stack-chip">OWNER: LEAD FDE</span>
            <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              TARGET: 0.0% · GRADE A
            </span>
          </div>
        </article>

        <article className="panel launchpad-gate-card gate-accent-3">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span className="mono launchpad-gate-chip">GATE 3</span>
            <HelpTip copyKey="launchpad.gate3" />
          </div>
          <h2 className="launchpad-gate-title">
            Crew Drill{" "}
            <span style={{ color: "var(--active-text)" }}>· Live Incident Drill</span>
          </h2>
          <p className="launchpad-gate-promise">
            Rehearse a real 2 AM outage before go-live.
          </p>
          <div className="launchpad-gate-footer">
            <span className="stack-chip">OWNER: LEAD CSE + SUPPORT</span>
            <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              90s DRILL + LIVE DELIVERABLES
            </span>
          </div>
        </article>
      </div>

      {/* One-Line Plain Governance Rule Strip */}
      <div className="panel launchpad-governance-strip" data-testid="launchpad-governance-rule">
        <div className="launchpad-governance-icon">
          <ShieldLockIcon size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="help-inline" style={{ marginBottom: 4 }}>
            <span className="eyebrow" style={{ color: "var(--active-text)" }}>
              PLAIN GOVERNANCE RULE
            </span>
            <HelpTip copyKey="launchpad.governanceRule" />
          </div>
          <div className="launchpad-governance-text">
            <strong>Hard Stops</strong> (security, residency, data integrity) can never be waived;{" "}
            <strong>operational gaps</strong> can ship with a time-boxed Risk Waiver, named owner, and rollback plan;{" "}
            <strong>ownership</strong> shifts from Lead FDE (Gates 1 and 2) to Lead CSE and Support Engineers (Gate 3).
          </div>
        </div>
      </div>

      {/* Quick Jump Back into My Customers when Returning Users Revisit Launchpad */}
      {hasCustomers && (
        <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div className="help-inline">
              <span className="eyebrow">MY CUSTOMERS ({myCustomers.length} SAVED IN BROWSER)</span>
              <HelpTip copyKey="workspace.emptyState" />
            </div>
            <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              CLICK ANY CUSTOMER TO RESUME LIVE TRACKING
            </span>
          </div>

          <div className="launchpad-customer-grid">
            {myCustomers.map((customer) => {
              const { mission } = buildCustomerCockpitModel(customer);
              const score = computeReadinessScore(mission);
              const hardStopBlocked = mission.flightCheck.counts.hardStopFailures > 0;
              return (
                <button
                  key={customer.id}
                  type="button"
                  className="launchpad-customer-tile"
                  onClick={() => onSelectCustomer(customer.id)}
                  data-testid={`launchpad-resume-${customer.id}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%" }}>
                    <strong style={{ fontSize: "1.02rem" }}>{customer.config.account.name}</strong>
                    <span
                      className={`status-pill ${
                        hardStopBlocked
                          ? "status-nogo"
                          : score === 100
                            ? "status-nominal"
                            : "status-active"
                      }`}
                    >
                      {score}%
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {DEPLOYMENT_MODEL_LABELS[customer.blueprint.input.deploymentModel]} · GO-LIVE{" "}
                    {customer.config.account.target_go_live}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
