export default function CollectorListItem({ collector, selected, onSelect, onToggle }) {
    const isRunning = collector.status === "running";

    return (
        <div
            onClick={onSelect}
            className={`side-item ${selected ? "active" : ""}`}
        >
            <span className="flex-1 truncate min-w-0">{collector.id}</span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                className={`switch shrink-0 ml-3 ${isRunning ? "active" : ""}`}
            >
                <div className="switch-thumb" />
            </button>
        </div>
    );
}
