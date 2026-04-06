import { useNavigate, useLocation } from "react-router";
import { useApp } from "../../context/AppContext";
import Icon from "../common/Icon";
import CollectorListItem from "../collectors/CollectorListItem";

export default function Sidebar({ collectors, onToggleCollector }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { selectedCollectorId, setSelectedCollectorId } = useApp();

    return (
        <aside className="side fixed left-0 top-0 w-64 z-40 border-r border-border max-lg:relative max-lg:w-full max-lg:border-r-0 max-lg:border-b max-lg:h-auto">
            <div className="side-header">
                <Icon name="sensors" className="text-primary shrink-0" />
                <span className="truncate flex-1">OPC UA Collector</span>
                <button
                    onClick={() => navigate("/collectors/new")}
                    className="side-header-action"
                    title="New Collector"
                >
                    <Icon name="add" className="icon-sm" />
                </button>
            </div>

            <div className="side-body max-lg:flex-none">
                <div className="side-section-title">Collectors</div>
                <nav className="side-list max-lg:flex max-lg:gap-1 max-lg:overflow-x-auto">
                    {collectors.map((c) => (
                        <CollectorListItem
                            key={c.id}
                            collector={c}
                            selected={selectedCollectorId === c.id}
                            onSelect={() => {
                                setSelectedCollectorId(c.id);
                                if (location.pathname !== "/") navigate("/");
                            }}
                            onToggle={() => onToggleCollector(c)}
                        />
                    ))}
                    {collectors.length === 0 && <p className="side-empty">No collectors</p>}
                </nav>
            </div>
        </aside>
    );
}
