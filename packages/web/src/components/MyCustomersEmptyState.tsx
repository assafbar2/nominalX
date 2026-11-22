import { HelpTip } from "./HelpTip";
import { NominalXLogo } from "./Icons";

interface MyCustomersEmptyStateProps {
  onAddFirstCustomer: () => void;
  onImportYaml: () => void;
  onExploreSamples: () => void;
}

export function MyCustomersEmptyState({
  onAddFirstCustomer,
  onImportYaml,
  onExploreSamples,
}: MyCustomersEmptyStateProps) {
  return (
    <section
      className="panel empty-customers-card"
      aria-label="My Customers Empty State"
      data-testid="my-customers-empty-state"
    >
      <NominalXLogo size={52} />
      <div className="help-inline" style={{ justifyContent: "center" }}>
        <span className="eyebrow">MY CUSTOMERS · 0 LAUNCHES SAVED YET</span>
        <HelpTip copyKey="workspace.emptyState" />
      </div>
      <h2 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
        Set up your first real customer launch in 60 seconds
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth: 620,
          fontSize: "0.94rem",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        Generate a deterministic Gate 1–3 launch blueprint tailored to your customer&apos;s security,
        data flows, and on-call SLAs—or import an existing <code className="mono">nominalx.yaml</code>{" "}
        contract file. Saved privately in your browser&apos;s localStorage.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onAddFirstCustomer}
          data-testid="empty-add-first-customer-btn"
        >
          + Add Your First Customer
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={onImportYaml}
          data-testid="empty-import-yaml-btn"
        >
          Import nominalx.yaml
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={onExploreSamples}
          data-testid="empty-explore-samples-btn"
        >
          Explore Sample Accounts
        </button>
      </div>
    </section>
  );
}
