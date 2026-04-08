import Icon from "../common/Icon";

export default function CollectorListItem({ collector, selected, onSelect, onToggle, onInstall }) {
    const isRunning = collector.status === "running";

    return (
        <div
            onClick={onSelect}
            className={`side-item ${selected ? "active" : ""}`}
        >
            <span className="flex-1 truncate min-w-0">{collector.id}</span>
            {collector.installed === false ? (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onInstall();
                    }}
                    className="btn-icon-sm shrink-0 ml-3 tooltip"
                    data-tooltip="Install"
                >
                    <Icon name="download" className="icon-sm" />
                </button>
            ) : (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                    className={`switch shrink-0 ml-3 ${isRunning ? "active" : ""}`}
                >
                    <div className="switch-thumb" />
                </button>
            )}
        </div>
    );
}
