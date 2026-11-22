import { listAccountPresets, type AccountPresetId } from "@nominalx/core";
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
  activePresetId: AccountPresetId;
  onSelectPreset: (id: AccountPresetId) => void;
  onReset: () => void;
  onOpenCustomize: () => void;
  customCount: number;
  onOpenWireLog: () => void;
  wireLogCount: number;
  onOpenTour: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function TopMissionBar({
  activePresetId,
  onSelectPreset,
  onReset,
  onOpenCustomize,
  customCount,
  onOpenWireLog,
  wireLogCount,
  onOpenTour,
  theme,
  onToggleTheme,
}: TopMissionBarProps) {
  const presets = listAccountPresets();

  return (
    <header className="mission-bar" data-tour="mission-bar">
      <div className="mission-bar-inner">
        <div className="brand-group">
          <NominalXLogo size={30} />
          <div>
            <div className="help-inline">
              <div className="brand-title">NOMINALX</div>
              <HelpTip copyKey="brand.mission" />
            </div>
            <div className="brand-tagline">
              Nothing is nominal until telemetry proves it.
            </div>
          </div>
        </div>

        <div className="help-control-wrap">
          <nav className="account-switcher" aria-label="Enterprise Account Presets">
            {presets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`account-pill ${isActive ? "active" : ""}`}
                  onClick={() => onSelectPreset(preset.id)}
                  data-testid={`account-pill-${preset.shortSlug}`}
                >
                  <span>{preset.config.account.name}</span>
                  {preset.config.account.arr_band && (
                    <span
                      className="mono"
                      style={{
                        fontSize: "0.66rem",
                        color: isActive ? "var(--active-text)" : "var(--text-dim)",
                      }}
                    >
                      {preset.config.account.arr_band.replace(" ARR", "")}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <HelpTip copyKey="header.accountSwitcher" />
        </div>

        <div className="mission-actions">
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
                    fontSize: "0.68rem",
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
              onClick={onReset}
              data-testid="reset-scenario-btn"
            >
              Reset Scenario
            </button>
            <HelpTip copyKey="header.resetScenario" />
          </div>

          <div className="help-control-wrap">
            <button
              type="button"
              className="btn"
              onClick={onOpenWireLog}
              data-testid="wire-log-btn"
            >
              <WireIcon />
              <span>Wire Log</span>
              <span
                className="mono"
                style={{
                  padding: "1px 5px",
                  borderRadius: 6,
                  background: "var(--bg-inset)",
                  color: "var(--active-text)",
                  fontSize: "0.68rem",
                }}
              >
                {wireLogCount}
              </span>
            </button>
            <HelpTip copyKey="header.liveWireLog" />
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
