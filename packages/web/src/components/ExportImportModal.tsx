import { useEffect, useState, type ChangeEvent } from "react";
import type { ConfigValidationError } from "@nominalx/core";
import { downloadTextFile } from "../state/missionState";
import {
  exportCustomerToYaml,
  exportWorkspaceBackupJson,
  type CustomerWorkspaceRecord,
} from "../state/workspaceState";
import { HelpTip } from "./HelpTip";

export type ExportImportInitialTab = "import" | "export";

interface ExportImportModalProps {
  open: boolean;
  initialTab: ExportImportInitialTab;
  activeCustomerName: string;
  activeCustomerSlug: string;
  activeCustomerYaml: string;
  myCustomers: readonly CustomerWorkspaceRecord[];
  onClose: () => void;
  onImportYaml: (yamlText: string) => {
    ok: boolean;
    errors?: ConfigValidationError[];
    importedName?: string;
  };
  onImportWorkspaceJson: (jsonText: string) => {
    ok: boolean;
    errors?: ConfigValidationError[];
    importedCount?: number;
  };
}

export function ExportImportModal({
  open,
  initialTab,
  activeCustomerName,
  activeCustomerSlug,
  activeCustomerYaml,
  myCustomers,
  onClose,
  onImportYaml,
  onImportWorkspaceJson,
}: ExportImportModalProps) {
  const [tab, setTab] = useState<ExportImportInitialTab>(initialTab);
  const [importKind, setImportKind] = useState<"yaml" | "json">("yaml");
  const [pasteText, setPasteText] = useState("");
  const [errors, setErrors] = useState<ConfigValidationError[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedExportId, setSelectedExportId] = useState<string>("__active__");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setErrors([]);
      setNotice(null);
      setCopied(false);
      setSelectedExportId("__active__");
    }
  }, [open, initialTab]);

  if (!open) return null;

  const selectedCustomerRecord =
    selectedExportId === "__active__"
      ? null
      : myCustomers.find((c) => c.id === selectedExportId) ?? null;

  const currentExportName = selectedCustomerRecord
    ? selectedCustomerRecord.config.account.name
    : activeCustomerName;
  const currentExportSlug = selectedCustomerRecord
    ? selectedCustomerRecord.id
    : activeCustomerSlug;
  const currentExportYaml = selectedCustomerRecord
    ? exportCustomerToYaml(selectedCustomerRecord)
    : activeCustomerYaml;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors([]);
    setNotice(null);
    if (file.name.toLowerCase().endsWith(".json")) {
      setImportKind("json");
    } else if (
      file.name.toLowerCase().endsWith(".yaml") ||
      file.name.toLowerCase().endsWith(".yml")
    ) {
      setImportKind("yaml");
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPasteText(reader.result);
        setNotice(`Loaded "${file.name}" — review below and click Import.`);
      }
    };
    reader.readAsText(file);
  };

  const handleRunImport = () => {
    setErrors([]);
    setNotice(null);
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setErrors([
        {
          path: "(input)",
          message:
            importKind === "yaml"
              ? "Paste a nominalx.yaml contract or upload a .yaml file first."
              : "Paste a NominalX workspace backup JSON or upload a .json file first.",
        },
      ]);
      return;
    }

    if (importKind === "yaml") {
      const res = onImportYaml(trimmed);
      if (!res.ok) {
        setErrors(res.errors ?? [{ path: "(yaml)", message: "Invalid YAML contract." }]);
      } else {
        setPasteText("");
        onClose();
      }
    } else {
      const res = onImportWorkspaceJson(trimmed);
      if (!res.ok) {
        setErrors(
          res.errors ?? [{ path: "(json)", message: "Invalid workspace JSON backup." }],
        );
      } else {
        setPasteText("");
        onClose();
      }
    }
  };

  const handleCopyYaml = async () => {
    try {
      await navigator.clipboard.writeText(currentExportYaml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setNotice("Copy blocked by browser — select YAML below or click Download .yaml.");
    }
  };

  const handleDownloadYaml = () => {
    downloadTextFile(
      `${currentExportSlug}.nominalx.yaml`,
      currentExportYaml,
      "text/yaml",
    );
    setNotice(`Downloaded ${currentExportSlug}.nominalx.yaml`);
  };

  const handleDownloadWorkspaceJson = () => {
    const json = exportWorkspaceBackupJson(myCustomers);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `nominalx-my-customers-backup-${dateStamp}.json`,
      json,
      "application/json",
    );
    setNotice(
      `Downloaded full My Customers backup (${myCustomers.length} customer${myCustomers.length === 1 ? "" : "s"}).`,
    );
  };

  return (
    <div
      className="overlay-modal-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Export and Import NominalX Files"
      data-testid="export-import-modal"
    >
      <div
        className="modal-card modal-card-wide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="help-inline">
              <div className="eyebrow">PORTABLE CONTRACTS &amp; BROWSER WORKSPACE BACKUPS</div>
              <HelpTip copyKey="exportImport.modal" />
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 800 }}>
              Export &amp; Import (<code className="mono">nominalx.yaml</code> + Workspace{" "}
              <code className="mono">.json</code>)
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            data-testid="close-export-import-btn"
          >
            Close
          </button>
        </div>

        {/* Mode Switcher */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            type="button"
            className={`customize-tab ${tab === "import" ? "active" : ""}`}
            onClick={() => {
              setTab("import");
              setErrors([]);
              setNotice(null);
            }}
            data-testid="export-import-tab-import"
          >
            <span className="eyebrow">UPLOAD OR PASTE</span>
            <strong>Import Customer YAML / Workspace JSON</strong>
          </button>
          <button
            type="button"
            className={`customize-tab ${tab === "export" ? "active" : ""}`}
            onClick={() => {
              setTab("export");
              setErrors([]);
              setNotice(null);
            }}
            data-testid="export-import-tab-export"
          >
            <span className="eyebrow">DOWNLOAD &amp; CLI HANDOFF</span>
            <strong>Export nominalx.yaml &amp; Workspace Backup</strong>
          </button>
        </div>

        {notice && errors.length === 0 && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 11,
              background: "var(--nominal-bg)",
              border: "1.5px solid var(--nominal-border)",
              color: "var(--nominal-text)",
              fontSize: "0.82rem",
              fontWeight: 700,
            }}
          >
            {notice}
          </div>
        )}

        {errors.length > 0 && (
          <div
            className="validation-alert"
            role="alert"
            data-testid="export-import-errors"
          >
            <div className="eyebrow" style={{ color: "var(--nogo-text)", marginBottom: 6 }}>
              VALIDATION ERRORS ({errors.length})
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {errors.map((err, idx) => (
                <li key={`${err.path}-${idx}`}>
                  <code className="mono">{err.path}</code>: {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* IMPORT TAB */}
        {tab === "import" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn ${importKind === "yaml" ? "btn-primary" : ""}`}
                  onClick={() => {
                    setImportKind("yaml");
                    setErrors([]);
                  }}
                  data-testid="import-kind-yaml"
                >
                  Customer nominalx.yaml
                </button>
                <button
                  type="button"
                  className={`btn ${importKind === "json" ? "btn-primary" : ""}`}
                  onClick={() => {
                    setImportKind("json");
                    setErrors([]);
                  }}
                  data-testid="import-kind-json"
                >
                  Workspace Backup (.json)
                </button>
                <HelpTip copyKey="exportImport.import" />
              </div>

              <label className="btn" style={{ cursor: "pointer" }}>
                <span>Upload File ({importKind === "yaml" ? ".yaml / .yml" : ".json"})</span>
                <input
                  type="file"
                  accept=".yaml,.yml,.json,text/yaml,application/json"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                  data-testid="import-file-input"
                />
              </label>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="export-import-textarea">
                {importKind === "yaml"
                  ? "Paste nominalx.yaml Content (Validated by @nominalx/core)"
                  : "Paste NominalX Workspace Backup JSON"}
              </label>
              <textarea
                id="export-import-textarea"
                className="yaml-editor-textarea mono"
                style={{ minHeight: 240 }}
                placeholder={
                  importKind === "yaml"
                    ? 'schema_version: "1.0"\naccount:\n  id: acme-cloud\n  name: Acme Cloud\n...'
                    : '{\n  "format": "nominalx-workspace-backup",\n  "schemaVersion": "1.0",\n  "customers": [...]\n}'
                }
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                spellCheck={false}
                data-testid="import-paste-textarea"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleRunImport}
                data-testid="confirm-import-btn"
              >
                {importKind === "yaml"
                  ? "Validate & Import Customer"
                  : "Validate & Restore Workspace"}
              </button>
            </div>
          </div>
        )}

        {/* EXPORT TAB */}
        {tab === "export" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Single Customer YAML Export */}
            <div className="customize-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="help-inline">
                    <span className="eyebrow">SINGLE CUSTOMER CONTRACT (CLI COMPATIBLE)</span>
                    <HelpTip copyKey="exportImport.yamlExport" />
                  </div>
                  <strong style={{ fontSize: "1rem" }}>
                    Export {currentExportName} as <code className="mono">{currentExportSlug}.nominalx.yaml</code>
                  </strong>
                </div>

                {myCustomers.length > 0 && (
                  <select
                    className="field-input mono"
                    style={{ width: "auto", padding: "6px 10px", fontSize: "0.78rem" }}
                    value={selectedExportId}
                    onChange={(e) => setSelectedExportId(e.target.value)}
                    aria-label="Choose customer to export"
                  >
                    <option value="__active__">Active: {activeCustomerName}</option>
                    {myCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        My Customer: {c.config.account.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="wire-terminal" style={{ maxHeight: 200, overflowY: "auto", fontSize: "0.74rem", whiteSpace: "pre" }}>
                {currentExportYaml}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <code className="mono" style={{ fontSize: "0.74rem", color: "var(--active-text)" }}>
                  $ nominalx check --config {currentExportSlug}.nominalx.yaml
                </code>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleCopyYaml()}
                    data-testid="copy-export-yaml-btn"
                  >
                    {copied ? "Copied YAML ✓" : "Copy YAML"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDownloadYaml}
                    data-testid="download-export-yaml-btn"
                  >
                    Download .yaml
                  </button>
                </div>
              </div>
            </div>

            {/* Full Workspace JSON Backup */}
            <div className="customize-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div className="help-inline">
                  <span className="eyebrow">FULL BROWSER WORKSPACE BACKUP (.JSON)</span>
                  <HelpTip copyKey="exportImport.jsonExport" />
                </div>
                <strong style={{ fontSize: "1rem" }}>
                  My Customers Workspace ({myCustomers.length} saved customer{myCustomers.length === 1 ? "" : "s"})
                </strong>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Includes all blueprints, manual Pass/Fail/Waived statuses, active waivers, and Evidence Notes.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-nominal"
                disabled={myCustomers.length === 0}
                onClick={handleDownloadWorkspaceJson}
                data-testid="download-workspace-json-btn"
              >
                Download Workspace .json
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
