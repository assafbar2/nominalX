import { useEffect, useRef, useState } from "react";
import { listAccountPresets, type AccountPresetId } from "@nominalx/core";
import { computeReadinessScore } from "../state/missionState";
import {
  buildCustomerCockpitModel,
  type AccountKind,
  type ActiveScreen,
  type CustomerWorkspaceRecord,
} from "../state/workspaceState";
import { HelpTip } from "./HelpTip";
import {
  CompassIcon,
  MoonIcon,
  NominalXLogo,
  SlidersIcon,
  SunIcon,
  WireIcon,
} from "./Icons";

interface TopMissionBarProps {
  activeScreen: ActiveScreen;
  accountKind: AccountKind;
  activeCustomerId: string | null;
  activeSampleId: AccountPresetId;
  myCustomers: readonly CustomerWorkspaceRecord[];
  onOpenLaunchpad: () => void;
  onStartNewCustomer: () => void;
  onSelectCustomer: (customerId: string) => void;
  onShowEmptyCustomers: () => void;
  onDuplicateCustomer: (customerId: string) => void;
  onEditCustomer: (customerId: string) => void;
  onDeleteCustomer: (customerId: string) => void;
  onSelectSample: (id: AccountPresetId) => void;
  onOpenExportImport: (initialTab: "import" | "export") => void;
  onResetSample: () => void;
  onOpenCustomize: () => void;
  customCount: number;
  onOpenWireLog: () => void;
  wireLogCount: number;
  onOpenTour: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function TopMissionBar({
  activeScreen,
  accountKind,
  activeCustomerId,
  activeSampleId,
  myCustomers,
  onOpenLaunchpad,
  onStartNewCustomer,
  onSelectCustomer,
  onShowEmptyCustomers,
  onDuplicateCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onSelectSample,
  onOpenExportImport,
  onResetSample,
  onOpenCustomize,
  customCount,
  onOpenWireLog,
  wireLogCount,
  onOpenTour,
  theme,
  onToggleTheme,
}: TopMissionBarProps) {
  const presets = listAccountPresets();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [switcherOpen]);

  const activeCustomer =
    accountKind === "customer" && activeCustomerId
      ? myCustomers.find((c) => c.id === activeCustomerId) ?? null
      : null;
  const activeSample = presets.find((p) => p.id === activeSampleId) ?? presets[0]!;

  const activeLabel =
    activeScreen === "launchpad"
      ? myCustomers.length > 0
        ? `My Customers (${myCustomers.length})`
        : "Choose Workspace"
      : activeScreen === "empty_customers"
        ? "My Customers (0)"
        : activeCustomer
          ? activeCustomer.config.account.name
          : activeSample.config.account.name;

  const activeBadge =
    activeScreen === "launchpad"
      ? "LAUNCHPAD"
      : activeScreen === "empty_customers" || activeCustomer
        ? "MY CUSTOMER"
        : "SAMPLE";

  return (
    <header className="mission-bar" data-tour="mission-bar">
      <div className="mission-bar-inner">
        {/* Brand */}
        <div className="brand-group">
          <button
            type="button"
            className="brand-home-btn"
            onClick={onOpenLaunchpad}
            title="Open NominalX Launchpad"
          >
            <NominalXLogo size={28} />
            <div style={{ textAlign: "left" }}>
              <div className="brand-title">NOMINALX</div>
              <div className="brand-tagline">
                Nothing is nominal until telemetry proves it.
              </div>
            </div>
          </button>
          <HelpTip copyKey="brand.mission" />
        </div>

        {/* Workspace Switcher Dropdown (My Customers vs Sample Accounts) */}
        <div className="workspace-switcher-wrap" ref={switcherRef}>
          <div className="help-control-wrap">
            <button
              type="button"
              className={`workspace-trigger-btn ${switcherOpen ? "open" : ""}`}
              onClick={() => setSwitcherOpen((o) => !o)}
              aria-expanded={switcherOpen}
              aria-haspopup="menu"
              data-testid="workspace-switcher-btn"
            >
              <span
                className={`workspace-kind-badge mono ${
                  activeBadge === "MY CUSTOMER"
                    ? "kind-customer"
                    : activeBadge === "SAMPLE"
                      ? "kind-sample"
                      : "kind-launchpad"
                }`}
              >
                {activeBadge}
              </span>
              <span className="workspace-trigger-name">{activeLabel}</span>
              <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                ▾
              </span>
            </button>
            <HelpTip copyKey="header.workspaceSwitcher" />
          </div>

          {switcherOpen && (
            <div
              className="workspace-popover"
              role="menu"
              data-testid="workspace-switcher-menu"
            >
              {/* Section 1: My Customers */}
              <div className="workspace-section">
                <div className="workspace-section-header">
                  <span className="eyebrow" style={{ color: "var(--active-text)" }}>
                    MY CUSTOMERS ({myCustomers.length})
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "3px 8px", fontSize: "0.68rem" }}
                    onClick={() => {
                      setSwitcherOpen(false);
                      onStartNewCustomer();
                    }}
                    data-testid="switcher-add-customer-btn"
                  >
                    + Add Customer
                  </button>
                </div>

                {myCustomers.length === 0 ? (
                  <div className="workspace-empty-mini">
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      No custom customers yet. Create one free in 60s or import{" "}
                      <code className="mono">nominalx.yaml</code>.
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "4px 9px", fontSize: "0.72rem" }}
                        onClick={() => {
                          setSwitcherOpen(false);
                          onStartNewCustomer();
                        }}
                      >
                        + Add First Customer
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "4px 9px", fontSize: "0.72rem" }}
                        onClick={() => {
                          setSwitcherOpen(false);
                          onShowEmptyCustomers();
                        }}
                        data-testid="switcher-view-empty-my-customers"
                      >
                        View Empty Workspace
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="workspace-list">
                    {myCustomers.map((customer) => {
                      const isActive =
                        activeScreen === "cockpit" &&
                        accountKind === "customer" &&
                        customer.id === activeCustomerId;
                      const { mission } = buildCustomerCockpitModel(customer);
                      const score = computeReadinessScore(mission);
                      return (
                        <div
                          key={customer.id}
                          className={`workspace-item-row ${isActive ? "active" : ""}`}
                          data-testid={`my-customer-row-${customer.id}`}
                        >
                          <button
                            type="button"
                            className="workspace-item-main"
                            onClick={() => {
                              setSwitcherOpen(false);
                              onSelectCustomer(customer.id);
                            }}
                            data-testid={`select-my-customer-${customer.id}`}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <strong style={{ fontSize: "0.84rem" }}>
                                {customer.config.account.name}
                              </strong>
                              <span
                                className="mono"
                                style={{
                                  fontSize: "0.66rem",
                                  fontWeight: 800,
                                  color:
                                    score === 100
                                      ? "var(--nominal-text)"
                                      : "var(--active-text)",
                                }}
                              >
                                {score}%
                              </span>
                            </div>
                            <span
                              className="mono"
                              style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}
                            >
                              Go-Live {customer.config.account.target_go_live}
                            </span>
                          </button>

                          <div className="workspace-item-actions">
                            <button
                              type="button"
                              className="workspace-mini-btn"
                              title="Edit customer blueprint"
                              onClick={() => {
                                setSwitcherOpen(false);
                                onEditCustomer(customer.id);
                              }}
                              data-testid={`edit-customer-${customer.id}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="workspace-mini-btn"
                              title="Duplicate customer"
                              onClick={() => {
                                setSwitcherOpen(false);
                                onDuplicateCustomer(customer.id);
                              }}
                              data-testid={`duplicate-customer-${customer.id}`}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              className="workspace-mini-btn danger"
                              title="Delete customer"
                              onClick={() => {
                                setSwitcherOpen(false);
                                onDeleteCustomer(customer.id);
                              }}
                              data-testid={`delete-customer-${customer.id}`}
                            >
                              Del
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Sample Accounts */}
              <div className="workspace-section" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
                <div className="workspace-section-header">
                  <span className="eyebrow">SAMPLE ACCOUNTS (4 ENTERPRISE DEMOS)</span>
                  <span className="mono" style={{ fontSize: "0.64rem", color: "var(--text-dim)" }}>
                    SAFE SANDBOX
                  </span>
                </div>
                <div className="workspace-list">
                  {presets.map((preset) => {
                    const isActive =
                      activeScreen === "cockpit" &&
                      accountKind === "sample" &&
                      preset.id === activeSampleId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`workspace-sample-btn ${isActive ? "active" : ""}`}
                        onClick={() => {
                          setSwitcherOpen(false);
                          onSelectSample(preset.id);
                        }}
                        data-testid={`account-pill-${preset.shortSlug}`}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <strong style={{ fontSize: "0.84rem" }}>
                            {preset.config.account.name}
                          </strong>
                          <span className="workspace-sample-tag mono">SAMPLE</span>
                        </div>
                        <span
                          className="mono"
                          style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}
                        >
                          {preset.config.account.arr_band ?? preset.tagline}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Always-Visible Primary Actions & Cockpit Controls */}
        <div className="mission-actions">
          <div className="help-control-wrap">
            <button
              type="button"
              className={`btn ${activeScreen === "launchpad" ? "btn-primary" : ""}`}
              onClick={onOpenLaunchpad}
              data-testid="top-launchpad-btn"
            >
              <span>Launchpad</span>
            </button>
            <HelpTip copyKey="header.launchpad" />
          </div>

          <div className="help-control-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStartNewCustomer}
              data-testid="top-new-customer-btn"
            >
              <span>+ New Customer</span>
            </button>
            <HelpTip copyKey="header.newCustomer" />
          </div>

          <div className="help-control-wrap">
            <button
              type="button"
              className="btn"
              onClick={() => onOpenExportImport("export")}
              data-testid="top-export-import-btn"
            >
              <span>YAML / Backup</span>
            </button>
            <HelpTip copyKey="header.exportImport" />
          </div>

          {activeScreen === "cockpit" && accountKind === "sample" && (
            <>
              <div className="help-control-wrap">
                <button
                  type="button"
                  className={`btn ${customCount > 0 ? "btn-primary" : ""}`}
                  onClick={onOpenCustomize}
                  data-testid="customize-btn"
                >
                  <SlidersIcon />
                  <span>Customize</span>
                  {customCount > 0 && (
                    <span
                      className="mono"
                      style={{
                        padding: "1px 5px",
                        borderRadius: 6,
                        background: "rgba(4, 17, 29, 0.28)",
                        fontSize: "0.66rem",
                        fontWeight: 800,
                      }}
                    >
                      +{customCount}
                    </span>
                  )}
                </button>
                <HelpTip copyKey="header.customize" />
              </div>

              <div className="help-control-wrap">
                <button
                  type="button"
                  className="btn"
                  onClick={onResetSample}
                  data-testid="reset-scenario-btn"
                >
                  Reset Scenario
                </button>
                <HelpTip copyKey="header.resetScenario" />
              </div>
            </>
          )}

          {activeScreen === "cockpit" && accountKind === "customer" && activeCustomerId && (
            <div className="help-control-wrap">
              <button
                type="button"
                className="btn"
                onClick={() => onEditCustomer(activeCustomerId)}
                data-testid="edit-active-blueprint-btn"
              >
                <SlidersIcon />
                <span>Edit Blueprint</span>
              </button>
              <HelpTip copyKey="wizard.step5" />
            </div>
          )}

          {activeScreen === "cockpit" && (
            <div className="help-control-wrap">
              <button
                type="button"
                className="btn"
                onClick={onOpenWireLog}
                data-testid="wire-log-btn"
              >
                <WireIcon />
                <span>Log</span>
                <span
                  className="mono"
                  style={{
                    padding: "1px 5px",
                    borderRadius: 6,
                    background: "var(--bg-inset)",
                    color: "var(--active-text)",
                    fontSize: "0.66rem",
                  }}
                >
                  {wireLogCount}
                </span>
              </button>
              <HelpTip copyKey="header.liveWireLog" />
            </div>
          )}

          <div className="help-control-wrap" data-tour="tour-replay-wrap">
            <button
              type="button"
              className="btn tour-replay-btn"
              onClick={onOpenTour}
              data-testid="replay-tour-btn"
            >
              <CompassIcon />
              <span>Tour</span>
            </button>
            <HelpTip copyKey="header.tour" />
          </div>

          <div className="help-control-wrap">
            <button
              type="button"
              className="btn theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              data-testid="theme-toggle-btn"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <HelpTip copyKey="header.themeToggle" />
          </div>
        </div>
      </div>
    </header>
  );
}
