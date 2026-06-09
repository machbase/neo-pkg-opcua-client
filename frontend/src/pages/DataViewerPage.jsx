import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Highcharts from "highcharts/highstock";
import HighchartsBoost from "highcharts/modules/boost";
import HighchartsReact from "highcharts-react-official";
import Icon from "../components/common/Icon";
import { useApp } from "../context/AppContext";
import { listTableTags, queryTagData, queryTagDataTotal } from "../api/dataViewer";
import {
    DATA_VIEWER_BACK_PATH,
    DEFAULT_TIME_FORMAT,
    DEFAULT_TIME_ZONE,
    QUICK_TIME_RANGE_GROUPS,
    TIME_FORMATS,
    TIME_ZONE_OPTIONS,
    buildTagChartSeries,
    buildTagRows,
    defaultSelectedTag,
    formatDataViewerTime,
    formatTimeRangeInput,
    formatTimeRangeLabel,
    getTimeFormatLabel,
    getTimeZoneLabel,
    getVisibleTagRows,
    resolveTimeRangeInput,
    resolveTagNodes,
} from "./dataViewerModel";

if (typeof HighchartsBoost === "function") {
    HighchartsBoost(Highcharts);
}

const RESULT_PAGE_SIZE = 100;
const MIN_CHART_HEIGHT = 260;
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function selectedValueColumn(config) {
    if (config?.stringOnly) return config?.stringValueColumn || "VALUE";
    return config?.valueColumn || "VALUE";
}

function padDatePart(value) {
    return String(value).padStart(2, "0");
}

function clampTimePart(value, min, max) {
    const next = Number(value);
    if (!Number.isFinite(next)) return min;
    return Math.min(Math.max(Math.floor(next), min), max);
}

function getPickerParts(value) {
    const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/) : null;
    if (match) {
        return {
            year: Number(match[1]),
            month: Number(match[2]) - 1,
            day: Number(match[3]),
            hour: Number(match[4]),
            minute: Number(match[5]),
            second: Number(match[6] || "0"),
        };
    }

    const fallback = new Date();
    return {
        year: fallback.getFullYear(),
        month: fallback.getMonth(),
        day: fallback.getDate(),
        hour: fallback.getHours(),
        minute: fallback.getMinutes(),
        second: fallback.getSeconds(),
    };
}

function formatPickerParts(parts) {
    return `${parts.year}-${padDatePart(parts.month + 1)}-${padDatePart(parts.day)} ${padDatePart(parts.hour)}:${padDatePart(parts.minute)}:${padDatePart(parts.second)}`;
}

function buildCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array(firstDay).fill(null);

    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(day);
    }

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return cells;
}

function ResultPagination({ page, pageSize, rowCount, loading, endLoading, onPage, onEndPage }) {
    const [value, setValue] = useState(String(page));
    const hasNextPage = rowCount >= pageSize;

    useEffect(() => {
        setValue(String(page));
    }, [page]);

    const go = (next) => {
        onPage(Math.max(1, next));
    };

    const commit = () => {
        const n = Number(value);
        if (Number.isFinite(n)) go(Math.floor(n));
        else setValue(String(page));
    };

    return (
        <div className="pagination">
            <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1 || loading} onClick={() => go(1)}>
                <Icon name="keyboard_double_arrow_left" className="icon-sm" />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1 || loading} onClick={() => go(page - 1)}>
                <Icon name="chevron_left" className="icon-sm" />
            </button>
            <input
                type="number"
                min="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                }}
                className="pagination-input"
                aria-label="Current result page"
            />
            <button type="button" className="btn btn-sm btn-ghost" disabled={!hasNextPage || loading || endLoading} onClick={() => go(page + 1)}>
                <Icon name="chevron_right" className="icon-sm" />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={loading || endLoading} onClick={onEndPage} title="Move to end page">
                <Icon name="keyboard_double_arrow_right" className="icon-sm" />
            </button>
        </div>
    );
}

function TimeRangeModal({ range, onApply, onClose }) {
    const [from, setFrom] = useState(formatTimeRangeInput(range.from));
    const [to, setTo] = useState(formatTimeRangeInput(range.to));
    const [error, setError] = useState("");
    const [picker, setPicker] = useState(null);

    const handleQuickRange = (option) => {
        setFrom(option.value[0]);
        setTo(option.value[1]);
        setError("");
        setPicker(null);
    };

    const openDatePicker = (target, event) => {
        const sourceValue = target === "from" ? from : to;
        const parts = getPickerParts(sourceValue);
        const rect = event.currentTarget.parentElement.getBoundingClientRect();
        const popoverWidth = 560;
        const popoverHeight = 420;
        const top = Math.min(Math.max(16, rect.bottom + 32), Math.max(16, window.innerHeight - popoverHeight - 16));
        const left = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - popoverWidth - 16));

        setPicker({
            target,
            ...parts,
            position: { top, left },
        });
    };

    const setPickerPart = (key, value) => {
        setPicker((prev) => {
            if (!prev) return prev;
            const next = { ...prev };

            if (key === "hour") next.hour = clampTimePart(value, 0, 23);
            if (key === "minute") next.minute = clampTimePart(value, 0, 59);
            if (key === "second") next.second = clampTimePart(value, 0, 59);

            return next;
        });
    };

    const movePickerMonth = (amount) => {
        setPicker((prev) => {
            if (!prev) return prev;
            const nextDate = new Date(prev.year, prev.month + amount, 1);
            const daysInNextMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
            return {
                ...prev,
                year: nextDate.getFullYear(),
                month: nextDate.getMonth(),
                day: Math.min(prev.day, daysInNextMonth),
            };
        });
    };

    const choosePickerDay = (day) => {
        setPicker((prev) => (prev ? { ...prev, day } : prev));
    };

    const applyPicker = () => {
        if (!picker) return;
        const nextValue = formatPickerParts(picker);

        if (picker.target === "from") setFrom(nextValue);
        else setTo(nextValue);

        setError("");
        setPicker(null);
    };

    const handleApply = () => {
        const baseDate = new Date();
        const nextFrom = resolveTimeRangeInput(from, baseDate);
        const nextTo = resolveTimeRangeInput(to, baseDate);

        if (nextFrom === null || nextTo === null) {
            setError("Please check the entered time.");
            return;
        }
        if (nextFrom && nextTo && new Date(nextFrom).getTime() > new Date(nextTo).getTime()) {
            setError("From should be earlier than To.");
            return;
        }

        onApply({ from: from.trim(), to: to.trim() });
    };

    return (
        <div className="modal-overlay data-viewer-time-overlay">
            <div className="modal modal-md data-viewer-time-modal animate-fade-in">
                <div className="modal-header">
                    <div className="modal-header-title">
                        <Icon name="calendar_month" className="icon-sm text-primary" />
                        <span>Time Range</span>
                    </div>
                    <button type="button" className="btn-icon-sm" onClick={onClose}>
                        <Icon name="close" className="icon-sm" />
                    </button>
                </div>

                <div className="modal-body data-viewer-time-body">
                    <div className="data-viewer-time-fields">
                        <label className="data-viewer-time-field">
                            <span>From</span>
                            <div className="input-icon-wrap">
                                <input
                                    type="text"
                                    value={from}
                                    onChange={(e) => {
                                        setFrom(e.target.value);
                                        setError("");
                                    }}
                                    placeholder="YYYY-MM-DD HH:mm:ss"
                                />
                                <button type="button" className="data-viewer-date-icon-button" aria-label="Open date picker" onClick={(event) => openDatePicker("from", event)}>
                                    <Icon name="calendar_month" className="icon-sm" />
                                </button>
                            </div>
                        </label>
                        <label className="data-viewer-time-field">
                            <span>To</span>
                            <div className="input-icon-wrap">
                                <input
                                    type="text"
                                    value={to}
                                    onChange={(e) => {
                                        setTo(e.target.value);
                                        setError("");
                                    }}
                                    placeholder="YYYY-MM-DD HH:mm:ss"
                                />
                                <button type="button" className="data-viewer-date-icon-button" aria-label="Open date picker" onClick={(event) => openDatePicker("to", event)}>
                                    <Icon name="calendar_month" className="icon-sm" />
                                </button>
                            </div>
                        </label>
                    </div>
                    {error && <div className="error-box">{error}</div>}
                    <div className="data-viewer-quick-range">
                        <div className="data-viewer-quick-range-title">Quick Range</div>
                        <div className="data-viewer-quick-range-grid">
                            {QUICK_TIME_RANGE_GROUPS.map((group, groupIndex) => (
                                <div key={groupIndex} className="data-viewer-quick-range-group">
                                    {group.map((option) => (
                                        <button key={option.key} type="button" className="data-viewer-quick-range-button" onClick={() => handleQuickRange(option)}>
                                            {option.name}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    {picker && (
                        <div className="data-viewer-date-picker-popover" style={{ top: picker.position.top, left: picker.position.left }}>
                            <div className="data-viewer-date-picker-content">
                                <div className="data-viewer-date-picker-form">
                                    <div className="data-viewer-date-picker-calendar">
                                        <div className="data-viewer-date-picker-calendar-header">
                                            <button type="button" className="btn-icon-sm" onClick={() => movePickerMonth(-1)}>
                                                <Icon name="chevron_left" className="icon-sm" />
                                            </button>
                                            <span>{`${MONTH_LABELS[picker.month]} ${picker.year}`}</span>
                                            <button type="button" className="btn-icon-sm" onClick={() => movePickerMonth(1)}>
                                                <Icon name="chevron_right" className="icon-sm" />
                                            </button>
                                        </div>
                                        <div className="data-viewer-date-picker-weekdays">
                                            {WEEKDAY_LABELS.map((label, index) => (
                                                <span key={`${label}-${index}`}>{label}</span>
                                            ))}
                                        </div>
                                        <div className="data-viewer-date-picker-days">
                                            {buildCalendarDays(picker.year, picker.month).map((day, index) =>
                                                day ? (
                                                    <button
                                                        key={`${picker.year}-${picker.month}-${day}`}
                                                        type="button"
                                                        className={`data-viewer-date-picker-day${day === picker.day ? " is-selected" : ""}`}
                                                        onClick={() => choosePickerDay(day)}
                                                    >
                                                        {day}
                                                    </button>
                                                ) : (
                                                    <span key={`empty-${index}`} />
                                                )
                                            )}
                                        </div>
                                    </div>
                                    <div className="data-viewer-date-picker-time">
                                        <label>
                                            <span>Hour</span>
                                            <input type="number" min="0" max="23" value={padDatePart(picker.hour)} onChange={(event) => setPickerPart("hour", event.target.value)} />
                                        </label>
                                        <label>
                                            <span>Minute</span>
                                            <input type="number" min="0" max="59" value={padDatePart(picker.minute)} onChange={(event) => setPickerPart("minute", event.target.value)} />
                                        </label>
                                        <label>
                                            <span>Second</span>
                                            <input type="number" min="0" max="59" value={padDatePart(picker.second)} onChange={(event) => setPickerPart("second", event.target.value)} />
                                        </label>
                                    </div>
                                </div>
                                <div className="data-viewer-date-picker-actions">
                                    <button type="button" className="btn btn-primary" onClick={applyPicker}>
                                        Apply
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setPicker(null)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-primary" onClick={handleApply}>
                        Apply
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function FormatTimezoneModal({ timeFormat, timeZone, onApply, onClose }) {
    const [nextFormat, setNextFormat] = useState(timeFormat || DEFAULT_TIME_FORMAT);
    const [nextZone, setNextZone] = useState(timeZone || DEFAULT_TIME_ZONE);

    return (
        <div className="modal-overlay data-viewer-time-overlay">
            <div className="modal modal-md data-viewer-time-modal data-viewer-format-modal animate-fade-in">
                <div className="modal-header">
                    <div className="modal-header-title">
                        <Icon name="public" className="icon-sm text-primary" />
                        <span>Format &amp; Timezone</span>
                    </div>
                    <button type="button" className="btn-icon-sm" onClick={onClose}>
                        <Icon name="close" className="icon-sm" />
                    </button>
                </div>

                <div className="modal-body data-viewer-format-body">
                    <div className="data-viewer-format-fields">
                        <label className="data-viewer-select-field">
                            <span>Time format</span>
                            <select value={nextFormat} onChange={(event) => setNextFormat(event.target.value)}>
                                {TIME_FORMATS.map((format) => (
                                    <option key={format.value} value={format.value}>
                                        {format.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="data-viewer-select-field">
                            <span>Time zone</span>
                            <select value={nextZone} onChange={(event) => setNextZone(event.target.value)}>
                                {TIME_ZONE_OPTIONS.map((zone) => (
                                    <option key={zone.value} value={zone.value}>
                                        {zone.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-primary" onClick={() => onApply({ timeFormat: nextFormat, timeZone: nextZone })}>
                        Apply
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function TagLineChart({ rows }) {
    const chartRef = useRef(null);
    const containerRef = useRef(null);
    const [chartSize, setChartSize] = useState({ width: 0, height: MIN_CHART_HEIGHT });
    const series = useMemo(() => buildTagChartSeries(rows), [rows]);
    const allPoints = useMemo(() => series.flatMap((item) => item.data), [series]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === "undefined") return undefined;

        const updateSize = (entry) => {
            const rect = entry?.contentRect || container.getBoundingClientRect();
            const width = Math.floor(rect.width);
            const height = Math.max(MIN_CHART_HEIGHT, Math.floor(rect.height));

            setChartSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        };

        const observer = new ResizeObserver((entries) => {
            updateSize(entries[0]);
        });

        observer.observe(container);
        updateSize();

        return () => observer.disconnect();
    }, []);

    const options = useMemo(() => {
        if (allPoints.length === 0) return null;

        const xValues = allPoints.map((point) => point[0]);
        const yValues = allPoints.map((point) => point[1]);
        const yMin = Math.floor(Math.min(...yValues) * 1000) / 1000;
        const yMax = Math.ceil(Math.max(...yValues) * 1000) / 1000;
        const yPadding = yMin === yMax ? Math.max(1, Math.abs(yMin) * 0.1) : 0;

        return {
            accessibility: { enabled: false },
            chart: {
                backgroundColor: "#252525",
                height: chartSize.height,
                width: chartSize.width || undefined,
                spacing: [10, 10, 15, 10],
                type: "line",
                zoomType: "x",
                animation: false,
                style: {
                    fontFamily: "Open Sans, Helvetica, Arial, sans-serif",
                },
            },
            time: {
                useUTC: false,
            },
            series: series.map((item) => ({
                name: item.name,
                data: item.data,
                yAxis: 0,
                marker: { symbol: "circle", lineColor: null, lineWidth: 1 },
            })),
            plotOptions: {
                boost: {
                    useGPUTranslations: true,
                    seriesThreshold: 5,
                },
                series: {
                    boostThreshold: 5000,
                    showInNavigator: false,
                    lineWidth: 1,
                    fillOpacity: 0,
                    cursor: "pointer",
                    marker: {
                        enabled: false,
                        radius: 0,
                    },
                    states: {
                        hover: {
                            enabled: true,
                            lineWidthPlus: 0,
                            lineWidth: 0,
                        },
                    },
                    dataGrouping: {
                        enabled: false,
                    },
                },
            },
            scrollbar: {
                liveRedraw: false,
                enabled: false,
            },
            rangeSelector: {
                buttons: [],
                allButtonsEnabled: false,
                selected: 1,
                inputEnabled: false,
            },
            navigator: {
                enabled: false,
            },
            xAxis: {
                type: "datetime",
                ordinal: false,
                gridLineWidth: 1,
                gridLineColor: "#323333",
                lineColor: "#323333",
                min: Math.min(...xValues),
                max: Math.max(...xValues),
                crosshair: {
                    snap: false,
                    width: 0.5,
                    color: "red",
                },
                labels: {
                    align: "center",
                    style: {
                        color: "#f8f8f8",
                        fontSize: "10px",
                    },
                    y: 35,
                },
                tickColor: "#323333",
            },
            yAxis: [
                {
                    tickAmount: 5,
                    min: yMin - yPadding,
                    max: yMax + yPadding,
                    gridLineWidth: 1,
                    gridLineColor: "#323333",
                    lineColor: "#323333",
                    startOnTick: true,
                    endOnTick: true,
                    labels: {
                        align: "center",
                        style: {
                            color: "#afb5bc",
                            fontSize: "10px",
                        },
                        x: -5,
                        y: 3,
                    },
                    opposite: false,
                },
            ],
            tooltip: {
                split: false,
                shared: true,
                followPointer: true,
                backgroundColor: "#1f1d1d",
                borderColor: "#292929",
                borderWidth: 1,
                xDateFormat: "%Y-%m-%d %H:%M:%S",
            },
            legend: {
                enabled: true,
                align: "left",
                itemDistance: 15,
                squareSymbol: true,
                symbolRadius: 1,
                itemHoverStyle: {
                    color: "#23527c",
                    textDecoration: "underline",
                },
                itemStyle: {
                    color: "#e7e8ea",
                    cursor: "pointer",
                    fontSize: "10px",
                    fontWeight: "normal",
                    fontFamily: "Open Sans, Helvetica, Arial, sans-serif",
                    textOverflow: "ellipsis",
                    textDecoration: "none",
                },
                margin: 20,
            },
            credits: {
                enabled: false,
            },
        };
    }, [allPoints, chartSize.height, chartSize.width, series]);

    if (!options) {
        return <div className="empty-state">No numeric data on this page</div>;
    }

    return (
        <div ref={containerRef} className="data-viewer-chart">
            <HighchartsReact ref={chartRef} highcharts={Highcharts} constructorType="stockChart" options={options} />
        </div>
    );
}

export default function DataViewerPage({ collectors, detail, embedded = false }) {
    const navigate = useNavigate();
    const { selectedCollectorId, notify } = useApp();
    const collector = collectors.find((c) => c.id === selectedCollectorId);
    const config = detail?.config || {};
    const configuredNodes = useMemo(
        () => (Array.isArray(config?.opcua?.nodes) ? config.opcua.nodes : []),
        [config]
    );
    const dbServer = typeof config.db === "string" ? config.db : "";
    const dbTable = config.dbTable || "";
    const valueColumn = selectedValueColumn(config);
    const stringValueColumn = config.stringOnly ? "" : (config.stringValueColumn || "");

    const [tableTags, setTableTags] = useState([]);
    const [tagsLoading, setTagsLoading] = useState(false);
    const [tagError, setTagError] = useState("");
    const nodes = useMemo(() => resolveTagNodes(configuredNodes, tableTags), [configuredNodes, tableTags]);
    const tagRows = useMemo(() => buildTagRows(nodes), [nodes]);
    const [tagFilter, setTagFilter] = useState("");
    const [collapsedTagFolders, setCollapsedTagFolders] = useState(() => new Set());
    const [selectedTagName, setSelectedTagName] = useState("");
    const [mode, setMode] = useState("raw");
    const [resultPage, setResultPage] = useState(1);
    const [range, setRange] = useState({ from: "", to: "" });
    const [rangeOpen, setRangeOpen] = useState(false);
    const [latestFirst, setLatestFirst] = useState(true);
    const [timeFormat, setTimeFormat] = useState(DEFAULT_TIME_FORMAT);
    const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
    const [formatOpen, setFormatOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [endLoading, setEndLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: RESULT_PAGE_SIZE });

    const selectedTag = useMemo(
        () => nodes.find((node) => node.name === selectedTagName) || null,
        [nodes, selectedTagName]
    );

    useEffect(() => {
        let alive = true;
        setTableTags([]);
        setTagError("");

        if (configuredNodes.length > 0 || !dbServer || !dbTable) {
            setTagsLoading(false);
            return () => {
                alive = false;
            };
        }

        setTagsLoading(true);
        listTableTags({ server: dbServer, table: dbTable })
            .then((data) => {
                if (!alive) return;
                setTableTags(data?.tags || []);
            })
            .catch((e) => {
                if (!alive) return;
                const message = e.reason || e.message || "Failed to load tags";
                setTagError(message);
                notify(message, "error");
            })
            .finally(() => {
                if (alive) setTagsLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [configuredNodes, dbServer, dbTable, notify]);

    useEffect(() => {
        const fallback = defaultSelectedTag(tagRows);
        if (!selectedTagName || !nodes.some((node) => node.name === selectedTagName)) {
            setSelectedTagName(fallback?.name || "");
        }
    }, [nodes, selectedTagName, tagRows]);

    useEffect(() => {
        setCollapsedTagFolders(new Set());
    }, [selectedCollectorId, tagRows]);

    useEffect(() => {
        setResultPage(1);
    }, [selectedTagName, range.from, range.to, selectedCollectorId]);

    const filteredTagRows = useMemo(() => {
        const q = tagFilter.trim().toLowerCase();
        if (!q) return tagRows;
        return tagRows.filter((row) => {
            if (row.type === "folder") return row.label.toLowerCase().includes(q);
            return (
                (row.tag?.name || "").toLowerCase().includes(q) ||
                (row.tag?.nodeId || "").toLowerCase().includes(q) ||
                row.label.toLowerCase().includes(q)
            );
        });
    }, [tagFilter, tagRows]);

    const visibleTagRows = useMemo(
        () => getVisibleTagRows(filteredTagRows, collapsedTagFolders),
        [collapsedTagFolders, filteredTagRows]
    );
    const canQuery = Boolean(dbServer && dbTable && selectedTagName);
    const toggleTagFolder = useCallback((key) => {
        setCollapsedTagFolders((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const fetchRows = useCallback(async () => {
        if (!canQuery) {
            setResult({ rows: [], total: 0, page: 1, pageSize: RESULT_PAGE_SIZE });
            return;
        }
        setLoading(true);
        setError("");
        try {
            const baseDate = new Date();
            const queryFrom = resolveTimeRangeInput(range.from, baseDate);
            const queryTo = resolveTimeRangeInput(range.to, baseDate);
            if (queryFrom === null || queryTo === null) {
                setError("Please check the entered time.");
                setResult({ rows: [], total: 0, page: resultPage, pageSize: RESULT_PAGE_SIZE });
                return;
            }

            const data = await queryTagData({
                server: dbServer,
                table: dbTable,
                name: selectedTagName,
                valueColumn,
                stringValueColumn,
                direction: latestFirst ? "latest" : "oldest",
                from: queryFrom,
                to: queryTo,
                page: resultPage,
                pageSize: RESULT_PAGE_SIZE,
            });
            setResult(data || { rows: [], total: 0, page: resultPage, pageSize: RESULT_PAGE_SIZE });
        } catch (e) {
            const message = e.reason || e.message || "Failed to load data";
            setError(message);
            notify(message, "error");
            setResult({ rows: [], total: 0, page: resultPage, pageSize: RESULT_PAGE_SIZE });
        } finally {
            setLoading(false);
        }
    }, [canQuery, dbServer, dbTable, latestFirst, notify, range.from, range.to, resultPage, selectedTagName, stringValueColumn, valueColumn]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    if (!collector) {
        return (
            <div className="empty-state flex flex-col items-center justify-center h-full">
                <Icon name="query_stats" className="icon-lg opacity-30 mb-12" />
                <p className="text-md font-medium text-on-surface-tertiary">Select a job from the sidebar</p>
            </div>
        );
    }

    const timeRangeButtonText = formatTimeRangeLabel(range.from, range.to);
    const timeFormatButtonText = `${getTimeFormatLabel(timeFormat)} / ${getTimeZoneLabel(timeZone)}`;
    const handleLatestFirstChange = (event) => {
        setLatestFirst(event.target.checked);
        setResultPage(1);
    };
    const handleEndPage = async () => {
        if (!canQuery || endLoading) return;
        setEndLoading(true);
        setError("");
        try {
            const baseDate = new Date();
            const queryFrom = resolveTimeRangeInput(range.from, baseDate);
            const queryTo = resolveTimeRangeInput(range.to, baseDate);
            if (queryFrom === null || queryTo === null) {
                setError("Please check the entered time.");
                return;
            }
            const data = await queryTagDataTotal({
                server: dbServer,
                table: dbTable,
                name: selectedTagName,
                valueColumn,
                stringValueColumn,
                direction: latestFirst ? "latest" : "oldest",
                from: queryFrom,
                to: queryTo,
                pageSize: RESULT_PAGE_SIZE,
            });
            const lastPage = Number(data?.lastPage || 1);
            setResultPage(Number.isFinite(lastPage) ? Math.max(1, Math.floor(lastPage)) : 1);
        } catch (e) {
            const message = e.reason || e.message || "Failed to calculate end page";
            setError(message);
            notify(message, "error");
        } finally {
            setEndLoading(false);
        }
    };

    return (
        <div className={embedded ? "data-viewer-embedded" : "page"}>
            {!embedded && (
            <header className="page-header">
                <div className="page-header-inner">
                    <div className="flex items-center gap-8 min-w-0">
                        <button
                            type="button"
                            onClick={() => navigate(DATA_VIEWER_BACK_PATH)}
                            className="p-4 hover:bg-surface-hover rounded-base transition-colors shrink-0 tooltip"
                            data-tooltip="Back"
                            aria-label="Back"
                        >
                            <Icon name="arrow_back" />
                        </button>
                        <Icon name="query_stats" className="text-primary" />
                        <h2 className="page-title truncate">Data Viewer</h2>
                        <span className="badge badge-muted truncate">{collector.id}</span>
                    </div>
                </div>
            </header>
            )}

            <div className={embedded ? "data-viewer-embedded-body" : "page-body-full data-viewer-body"}>
                <div className={embedded ? "data-viewer-embedded-inner" : "page-body-inner"}>
                    <div className="data-viewer-layout">
                        <aside className="form-card data-viewer-tags">
                            <div className="form-card-header !mb-0">
                                <span className="section-dot" />
                                Tags
                            </div>
                            <div className="data-viewer-tag-search">
                                <input
                                    type="text"
                                    value={tagFilter}
                                    onChange={(e) => setTagFilter(e.target.value)}
                                    placeholder="Filter tags..."
                                    className="w-full"
                                />
                            </div>
                            {tagError && <div className="error-box">{tagError}</div>}
                            <div className="data-viewer-tag-list">
                                {visibleTagRows.map((row) => {
                                    if (row.type === "folder") {
                                        const collapsed = collapsedTagFolders.has(row.key);
                                        return (
                                            <div key={row.key} className="node-tree-row node-tree-row-folder" style={{ paddingLeft: row.depth * 16 }}>
                                                <button
                                                    type="button"
                                                    className="node-tree-toggle"
                                                    onClick={() => toggleTagFolder(row.key)}
                                                    aria-label={`${row.label} ${collapsed ? "expand" : "collapse"}`}
                                                >
                                                    <Icon name={collapsed ? "chevron_right" : "expand_more"} className="icon-sm" />
                                                </button>
                                                <span className="node-tree-label truncate">{row.label}</span>
                                            </div>
                                        );
                                    }
                                    const checked = selectedTagName === row.tag.name;
                                    return (
                                        <label
                                            key={row.key}
                                            className={`data-viewer-tag-row ${checked ? "is-active" : ""}`}
                                            style={{ paddingLeft: row.depth * 16 }}
                                            title={row.tag.nodeId || row.tag.name}
                                        >
                                            <span className="node-tree-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => setSelectedTagName(row.tag.name)}
                                                    aria-label={`${row.tag.name} select`}
                                                />
                                            </span>
                                            <span className="node-tree-label truncate">{row.label}</span>
                                            {row.tag.dataType && <span className="badge badge-success">{row.tag.dataType}</span>}
                                        </label>
                                    );
                                })}
                                {tagsLoading && <div className="empty-state">Loading tags...</div>}
                                {!tagsLoading && visibleTagRows.length === 0 && <div className="empty-state">No tags</div>}
                            </div>
                        </aside>

                        <section className="form-card data-viewer-results">
                            <div className="data-viewer-toolbar">
                                <div className="data-viewer-title-row">
                                    <div className="form-card-header !mb-0">
                                        <span className="section-dot" />
                                        {mode === "raw" ? "Raw Result" : "Chart Result"}
                                    </div>
                                    <div className="data-viewer-title-actions">
                                        {mode === "raw" && (
                                            <label className="checkbox-label data-viewer-scan-toggle">
                                                <input type="checkbox" checked={latestFirst} onChange={handleLatestFirstChange} />
                                                <span>Latest first</span>
                                            </label>
                                        )}
                                        {mode === "raw" && (
                                            <div className="data-viewer-query-controls">
                                                <button
                                                    type="button"
                                                    aria-label="Set time format and timezone"
                                                    title={timeFormatButtonText}
                                                    className="btn btn-sm btn-ghost data-viewer-format-button"
                                                    onClick={() => setFormatOpen(true)}
                                                >
                                                    <Icon name="public" className="icon-sm" />
                                                </button>
                                                <button type="button" aria-label="Set time range" title={timeRangeButtonText} className="btn btn-sm btn-ghost data-viewer-time-range-button" onClick={() => setRangeOpen(true)}>
                                                    <Icon name="calendar_month" className="icon-sm" />
                                                    <span>{timeRangeButtonText}</span>
                                                </button>
                                            </div>
                                        )}
                                        <div className="log-level-group" role="tablist" aria-label="Result mode">
                                            <button type="button" className={`log-level-item ${mode === "raw" ? "is-included" : "is-excluded"}`} onClick={() => setMode("raw")}>
                                                Raw
                                            </button>
                                            <button type="button" className={`log-level-item ${mode === "chart" ? "is-included" : "is-excluded"}`} onClick={() => setMode("chart")}>
                                                Chart
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {error && <div className="error-box">{error}</div>}
                            {!canQuery && <div className="empty-state">Database table and tag are required</div>}
                            {canQuery && mode === "raw" && (
                                <div className="table-card">
                                    <div className="table-card-body">
                                        <table className="table-clean">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Name</th>
                                                    <th>Value</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.rows.map((row, i) => (
                                                    <tr key={`${row.name}-${row.time}-${i}`}>
                                                        <td className="mono">{formatDataViewerTime(row.time, timeFormat, timeZone)}</td>
                                                        <td className="mono">{row.name}</td>
                                                        <td className="mono">{String(row.value ?? "")}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {loading && <div className="empty-state">Loading...</div>}
                                        {!loading && result.rows.length === 0 && <div className="empty-state">No data</div>}
                                    </div>
                                    <ResultPagination page={resultPage} pageSize={RESULT_PAGE_SIZE} rowCount={result.rows.length} loading={loading} endLoading={endLoading} onPage={setResultPage} onEndPage={handleEndPage} />
                                </div>
                            )}
                            {canQuery && mode === "chart" && (
                                <div className="table-card data-viewer-chart-card">
                                    <div className="table-card-body">
                                        {loading ? <div className="empty-state">Loading...</div> : <TagLineChart rows={result.rows} />}
                                    </div>
                                    <ResultPagination page={resultPage} pageSize={RESULT_PAGE_SIZE} rowCount={result.rows.length} loading={loading} endLoading={endLoading} onPage={setResultPage} onEndPage={handleEndPage} />
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
            {rangeOpen && (
                <TimeRangeModal
                    range={range}
                    onClose={() => setRangeOpen(false)}
                    onApply={(next) => {
                        setRange(next);
                        setRangeOpen(false);
                    }}
                />
            )}
            {formatOpen && (
                <FormatTimezoneModal
                    timeFormat={timeFormat}
                    timeZone={timeZone}
                    onClose={() => setFormatOpen(false)}
                    onApply={(next) => {
                        setTimeFormat(next.timeFormat);
                        setTimeZone(next.timeZone);
                        setFormatOpen(false);
                    }}
                />
            )}
        </div>
    );
}
