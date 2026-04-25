import { useEffect, useState } from "react";
import Icon from "../common/Icon";
import { listLogFiles, fetchLogContent } from "../../api/logs";

export default function LogViewerModal({ collectorId, onClose }) {
    const [files, setFiles] = useState([]);
    const [selectedName, setSelectedName] = useState("");
    const [content, setContent] = useState("");
    const [loadingFiles, setLoadingFiles] = useState(true);
    const [loadingContent, setLoadingContent] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        setLoadingFiles(true);
        setError("");
        listLogFiles(collectorId)
            .then((data) => {
                if (cancelled) {
                    return;
                }
                const nextFiles = data || [];
                setFiles(nextFiles);
                setSelectedName(nextFiles[0]?.name || "");
            })
            .catch((e) => {
                if (cancelled) {
                    return;
                }
                setFiles([]);
                setSelectedName("");
                setError(e.reason || e.message || "Failed to load log files");
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingFiles(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [collectorId]);

    useEffect(() => {
        if (!selectedName) {
            setContent("");
            return;
        }
        let cancelled = false;
        setLoadingContent(true);
        setError("");
        fetchLogContent(selectedName)
            .then((data) => {
                if (cancelled) {
                    return;
                }
                setContent(data?.content || "");
            })
            .catch((e) => {
                if (cancelled) {
                    return;
                }
                setContent("");
                setError(e.reason || e.message || "Failed to load log content");
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingContent(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [selectedName]);

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal modal-lg" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-title">
                        <Icon name="description" className="text-primary" />
                        {collectorId} Logs
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-4 hover:bg-surface-hover rounded-base tooltip"
                        data-tooltip="Close"
                    >
                        <Icon name="close" />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-16 min-h-[420px]">
                        <div className="border border-border-subtle rounded-base overflow-hidden">
                            <div className="px-12 py-10 border-b border-border-subtle text-xs font-semibold uppercase tracking-wide text-on-surface-tertiary">
                                Files
                            </div>
                            <div className="max-h-[380px] overflow-y-auto">
                                {loadingFiles ? (
                                    <div className="p-12 text-sm text-on-surface-secondary">Loading...</div>
                                ) : files.length === 0 ? (
                                    <div className="p-12 text-sm text-on-surface-secondary">No log files</div>
                                ) : (
                                    files.map((file) => (
                                        <button
                                            key={file.name}
                                            type="button"
                                            onClick={() => setSelectedName(file.name)}
                                            className={`w-full text-left px-12 py-10 border-b border-border-subtle hover:bg-surface-hover ${
                                                selectedName === file.name ? "bg-surface-hover" : ""
                                            }`}
                                        >
                                            <div className="font-mono text-sm truncate" title={file.name}>
                                                {file.name}
                                            </div>
                                            <div className="text-xs text-on-surface-tertiary">{file.size} bytes</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="border border-border-subtle rounded-base overflow-hidden min-w-0">
                            <div className="px-12 py-10 border-b border-border-subtle text-xs font-semibold uppercase tracking-wide text-on-surface-tertiary">
                                {selectedName || "Content"}
                            </div>
                            <div className="p-12">
                                {error ? (
                                    <div className="text-sm text-error">{error}</div>
                                ) : loadingContent ? (
                                    <div className="text-sm text-on-surface-secondary">Loading...</div>
                                ) : (
                                    <pre
                                        className="mono text-sm whitespace-pre-wrap break-words overflow-auto max-h-[360px] m-0"
                                        style={{ color: "var(--color-on-surface-secondary)" }}
                                    >
                                        {content || "No log content"}
                                    </pre>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button type="button" onClick={onClose} className="btn btn-ghost">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
