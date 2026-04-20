import Icon from "../common/Icon";
import CollectorListItem from "../collectors/CollectorListItem";

export default function Sidebar({
    collectors,
    selectedCollectorId,
    onSelectCollector,
    onNewCollector,
    onToggleCollector,
    onInstallCollector,
    onRefresh,
    onServerSettings,
    className = "side h-screen",
}) {
    return (
        <aside className={className}>
            <div className="side-header">
                <Icon name="sensors" className="text-primary shrink-0" />
                <span className="truncate flex-1">OPC UA Collector</span>
                <button
                    onClick={onNewCollector}
                    className="side-header-action tooltip"
                    data-tooltip="New Job"
                >
                    <Icon name="add" />
                </button>
                {onServerSettings && (
                    <button
                        onClick={onServerSettings}
                        className="side-header-action tooltip"
                        data-tooltip="Server Settings"
                    >
                        <Icon name="dns" />
                    </button>
                )}
            </div>

            <div className="side-body">
                <div className="side-section-title">
                    <span className="flex-1">Jobs</span>
                    <button
                        onClick={onRefresh}
                        className="side-section-action tooltip"
                        data-tooltip="Refresh"
                    >
                        <Icon name="refresh" />
                    </button>
                </div>
                <nav className="side-list">
                    {collectors.map((c) => (
                        <CollectorListItem
                            key={c.id}
                            collector={c}
                            selected={selectedCollectorId === c.id}
                            onSelect={() => onSelectCollector(c.id)}
                            onToggle={() => onToggleCollector(c)}
                            onInstall={() => onInstallCollector(c)}
                        />
                    ))}
                    {collectors.length === 0 && <p className="side-empty">No jobs</p>}
                </nav>
            </div>
        </aside>
    );
}
