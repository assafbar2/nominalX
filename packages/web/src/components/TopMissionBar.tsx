import { listAccountPresets, type AccountPresetId } from "@nominalx/core";
import { MoonIcon, NominalXLogo, SlidersIcon, SunIcon, WireIcon } from "./Icons";

interface TopMissionBarProps {
  activePresetId: AccountPresetId;
  onSelectPreset: (id: AccountPresetId) => void;
  onReset: () => void;
  onOpenCustomize: () => void;
  customCount: number;
  onOpenWireLog: () => void;
  wireLogCount: number;
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
  theme,
  onToggleTheme,
}: TopMissionBarProps) {
  const presets = listAccountPresets();

  return (
    <header className="mission-bar">
      <div className="mission-bar-inner">
        <div className="brand-group">
          <NominalXLogo size={36} />
          <div>
            <div className="brand-title">NOMINALX</div>
            <div className="brand-tagline">
              Nothing is nominal until telemetry proves it.
            </div>
          </div>
        </div>

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
                      fontSize: "0.68rem",
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

        <div className="mission-actions">
          <button
            type="button"
            className={`btn ${customCount > 0 ? "btn-primary" : ""}`}
            onClick={onOpenCustomize}
            title="Customize Gate 1 stations, Gate 2 chaos vectors, Gate 3 alarms, or edit nominalx.yaml live"
            data-testid="customize-btn"
          >
            <SlidersIcon />
            <span>Customize</span>
            {customCount > 0 && (
              <span
                className="mono"
                style={{
                  padding: "1px 6px",
                  borderRadius: 6,
                  background: "rgba(4, 17, 29, 0.28)",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                }}
              >
                +{customCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className="btn"
            onClick={onReset}
            title="Reset active account telemetry to initial pre-fix baseline"
            data-testid="reset-scenario-btn"
          >
            Reset Scenario
          </button>

          <button
            type="button"
            className="btn"
            onClick={onOpenWireLog}
            data-testid="wire-log-btn"
          >
            <WireIcon />
            <span>Live Wire Log</span>
            <span
              className="mono"
              style={{
                padding: "2px 6px",
                borderRadius: 6,
                background: "var(--bg-inset)",
                color: "var(--active-text)",
                fontSize: "0.72rem",
              }}
            >
              {wireLogCount}
            </span>
          </button>

          <button
            type="button"
            className="btn theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            data-testid="theme-toggle-btn"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
