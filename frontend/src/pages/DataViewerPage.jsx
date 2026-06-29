import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import * as echarts from "echarts";
import Icon from "../components/common/Icon";
import { useApp } from "../context/AppContext";
import { listTableTags, queryTagChartData, queryTagData, queryTagDataTotal } from "../api/dataViewer";
import ZoomInTwo from "../assets/image/btn_zoom in x2@3x.png";
import ZoomInFour from "../assets/image/btn_zoom in x4@3x.png";
import ZoomOutTwo from "../assets/image/btn_zoom out x2@3x.png";
import ZoomOutFour from "../assets/image/btn_zoom out x4@3x.png";
import {
    DATA_VIEWER_BACK_PATH,
    DEFAULT_TIME_FORMAT,
    DEFAULT_TIME_ZONE,
    QUICK_TIME_RANGE_GROUPS,
    TIME_FORMATS,
    TIME_ZONE_OPTIONS,
    buildAssetRows,
    buildDataViewerChartGroups,
    buildDataViewerEChartOption,
    buildDataViewerGlobalTimeUpdate,
    buildDataViewerHeaderLabels,
    buildDataViewerSplitGroups,
    buildDataViewerWheelZoomRange,
    buildDataViewerZoomControlRange,
    buildNeoWebTagAnalyzerMessage,
    buildRawResultColumns,
    buildTagRows,
    extractDataViewerDataZoomRange,
    formatDataViewerTime,
    formatTimeRangeInput,
    formatTimeRangeLabel,
    getDataViewerChartRangeMs,
    getResultHeading,
    getScanDirectionLabel,
    getTimeFormatLabel,
    getTimeZoneLabel,
    getVisibleTagRows,
    hasExplicitDataViewerDataZoomEventRange,
    hasAssetHierarchy,
    isSameDataViewerChartRange,
    normalizeSelectedTagNames,
    resolveTimeRangeInput,
    resolveTagNodes,
    sendNeoWebTagAnalyzerMessage,
    showsDataViewerTimeControls,
    toggleSelectedTagName,
} from "./dataViewerModel";

const RESULT_PAGE_SIZE = 100;
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
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

function TagEChart({ series, timeFormat, timeZone, timeRange, displayRange, onDisplayRangeChange }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const rangeRef = useRef({ currentRange: {}, navigatorRange: {}, onDisplayRangeChange });
    const allPoints = useMemo(() => series.flatMap((item) => item.data), [series]);
    const options = useMemo(
        () => buildDataViewerEChartOption({ series, timeFormat, timeZone, timeRange, displayRange }),
        [displayRange, series, timeFormat, timeRange, timeZone]
    );
    const currentRange = useMemo(
        () => getDataViewerChartRangeMs(allPoints, displayRange || timeRange),
        [allPoints, displayRange, timeRange]
    );
    const navigatorRange = useMemo(
        () => getDataViewerChartRangeMs(allPoints, timeRange),
        [allPoints, timeRange]
    );

    useEffect(() => {
        rangeRef.current = { currentRange, navigatorRange, onDisplayRangeChange };
    }, [currentRange, navigatorRange, onDisplayRangeChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const chart = echarts.init(container, null, { renderer: "canvas" });
        chartRef.current = chart;
        const getDataZoomEventState = (params = {}) => {
            const eventState = Array.isArray(params.batch) ? params.batch[0] : params;
            const dataZoomOptions = chart.getOption?.()?.dataZoom || [];
            const dataZoomIndex = Number(eventState?.dataZoomIndex);
            const dataZoomId = eventState?.dataZoomId;
            const optionState = dataZoomId
                ? dataZoomOptions.find((item) => item?.id === dataZoomId)
                : (Number.isFinite(dataZoomIndex) ? dataZoomOptions[dataZoomIndex] : undefined);

            return {
                ...(optionState || dataZoomOptions[1] || dataZoomOptions[0] || {}),
                ...(eventState || {}),
            };
        };
        const convertMouseEventToTimestamp = (event) => {
            const rect = container.getBoundingClientRect?.();
            if (!rect) return undefined;

            const pixel = [event.clientX - rect.left, event.clientY - rect.top];
            if (!chart.containPixel?.({ gridIndex: 0 }, pixel)) return undefined;

            const fromAxis = chart.convertFromPixel?.({ xAxisIndex: 0 }, pixel);
            const fromGrid = chart.convertFromPixel?.({ gridIndex: 0 }, pixel);
            const axisTime = Array.isArray(fromAxis) ? Number(fromAxis[0]) : Number(fromAxis);
            if (Number.isFinite(axisTime)) return axisTime;

            const gridTime = Array.isArray(fromGrid) ? Number(fromGrid[0]) : Number(fromGrid);
            if (Number.isFinite(gridTime)) return gridTime;

            const { currentRange: activeRange } = rangeRef.current;
            const start = Number(activeRange?.startTime);
            const end = Number(activeRange?.endTime);
            return Number.isFinite(start) && Number.isFinite(end) ? start + (end - start) / 2 : undefined;
        };
        const handleMouseWheelZoom = (event) => {
            if (event.deltaY === 0) return;
            const { currentRange: activeRange, navigatorRange: activeNavigatorRange, onDisplayRangeChange: activeRangeChange } = rangeRef.current;
            const anchorTime = convertMouseEventToTimestamp(event);
            const nextRange = buildDataViewerWheelZoomRange(event.deltaY, anchorTime, activeRange, activeNavigatorRange);
            if (!nextRange || isSameDataViewerChartRange(nextRange, activeRange)) return;

            event.preventDefault();
            event.stopPropagation();
            activeRangeChange?.({
                from: new Date(nextRange.startTime).toISOString(),
                to: new Date(nextRange.endTime).toISOString(),
            }, {
                from: new Date(activeNavigatorRange.startTime).toISOString(),
                to: new Date(activeNavigatorRange.endTime).toISOString(),
            });
        };
        const handleDataZoom = (params) => {
            const { currentRange: activeRange, navigatorRange: activeNavigatorRange, onDisplayRangeChange: activeRangeChange } = rangeRef.current;
            const dataZoomState = getDataZoomEventState(params);
            const nextRange = hasExplicitDataViewerDataZoomEventRange(params)
                ? extractDataViewerDataZoomRange(params, activeRange, activeNavigatorRange)
                : extractDataViewerDataZoomRange(dataZoomState, activeRange, activeNavigatorRange);

            if (!nextRange || isSameDataViewerChartRange(nextRange, activeRange)) return;
            activeRangeChange?.({
                from: new Date(nextRange.startTime).toISOString(),
                to: new Date(nextRange.endTime).toISOString(),
            }, {
                from: new Date(activeNavigatorRange.startTime).toISOString(),
                to: new Date(activeNavigatorRange.endTime).toISOString(),
            });
        };
        chart.on("datazoom", handleDataZoom);
        container.addEventListener("wheel", handleMouseWheelZoom, { passive: false, capture: true });

        const resize = () => chart.resize();
        let observer;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(resize);
            observer.observe(container);
        } else {
            window.addEventListener("resize", resize);
        }
        resize();

        return () => {
            chart.off("datazoom", handleDataZoom);
            container.removeEventListener("wheel", handleMouseWheelZoom, true);
            if (observer) observer.disconnect();
            else window.removeEventListener("resize", resize);
            chart.dispose();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!chartRef.current) return;
        chartRef.current.setOption(options, true);
        if (Number.isFinite(currentRange.startTime) && Number.isFinite(currentRange.endTime)) {
            chartRef.current.dispatchAction?.({
                type: "dataZoom",
                dataZoomId: "panel-inside-data-zoom",
                startValue: currentRange.startTime,
                endValue: currentRange.endTime,
            });
            chartRef.current.dispatchAction?.({
                type: "dataZoom",
                dataZoomId: "panel-slider-data-zoom",
                startValue: currentRange.startTime,
                endValue: currentRange.endTime,
            });
        }
        chartRef.current.resize();
    }, [currentRange, options]);

    const applyZoomControl = useCallback((action, zoom) => {
        const nextRange = buildDataViewerZoomControlRange(action, currentRange, navigatorRange, zoom);
        if (!nextRange || isSameDataViewerChartRange(nextRange, currentRange)) return;
        onDisplayRangeChange?.({
            from: new Date(nextRange.startTime).toISOString(),
            to: new Date(nextRange.endTime).toISOString(),
        }, {
            from: new Date(navigatorRange.startTime).toISOString(),
            to: new Date(navigatorRange.endTime).toISOString(),
        });
    }, [currentRange, navigatorRange, onDisplayRangeChange]);

    const zoomControlsDisabled = !Number.isFinite(currentRange.startTime) ||
        !Number.isFinite(currentRange.endTime) ||
        !Number.isFinite(navigatorRange.startTime) ||
        !Number.isFinite(navigatorRange.endTime);

    if (allPoints.length === 0) {
        return <div className="empty-state">No chart data</div>;
    }

    return (
        <div className="data-viewer-chart-shell">
            <div className="data-viewer-chart-footer-form" aria-label="Chart zoom controls">
                <div className="data-viewer-chart-toolbar-controls">
                    <div className="data-viewer-chart-toolbar-group">
                        {[
                            ["zoom-in", ZoomInFour, "Zoom in", 0.4],
                            ["zoom-in", ZoomInTwo, "Zoom in", 0.2],
                            ["focus", undefined, "Focus", undefined],
                            ["zoom-out", ZoomOutTwo, "Zoom out", 0.2],
                            ["zoom-out", ZoomOutFour, "Zoom out", 0.4],
                        ].map(([action, image, label, zoom], index) => (
                            <button
                                key={`${action}-${index}`}
                                type="button"
                                className="data-viewer-chart-toolbar-button"
                                title={label}
                                aria-label={label}
                                disabled={zoomControlsDisabled}
                                onClick={() => applyZoomControl(action, zoom)}
                            >
                                {image ? (
                                    <img src={image} alt="" className="data-viewer-chart-toolbar-image" />
                                ) : (
                                    <Icon name="center_focus_strong" className="data-viewer-chart-toolbar-icon" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div
                ref={containerRef}
                className="data-viewer-chart"
                data-display-from={Number.isFinite(currentRange.startTime) ? String(Math.floor(currentRange.startTime)) : ""}
                data-display-to={Number.isFinite(currentRange.endTime) ? String(Math.ceil(currentRange.endTime)) : ""}
                data-navigator-from={Number.isFinite(navigatorRange.startTime) ? String(Math.floor(navigatorRange.startTime)) : ""}
                data-navigator-to={Number.isFinite(navigatorRange.endTime) ? String(Math.ceil(navigatorRange.endTime)) : ""}
            />
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
    const [assetHierarchy, setAssetHierarchy] = useState(null);
    const [assetHierarchyChecked, setAssetHierarchyChecked] = useState(false);
    const [tagsLoading, setTagsLoading] = useState(false);
    const [tagError, setTagError] = useState("");
    const nodes = useMemo(() => resolveTagNodes(configuredNodes, tableTags), [configuredNodes, tableTags]);
    const tagRows = useMemo(() => buildTagRows(nodes), [nodes]);
    const showAssetTab = hasAssetHierarchy(assetHierarchy);
    const assetHierarchyPending = Boolean(dbServer && dbTable && !assetHierarchyChecked && tagsLoading);
    const assetRows = useMemo(() => buildAssetRows(assetHierarchy, tableTags), [assetHierarchy, tableTags]);
    const [activeTagTab, setActiveTagTab] = useState("tags");
    const [tagFilter, setTagFilter] = useState("");
    const [collapsedTagFolders, setCollapsedTagFolders] = useState(() => new Set());
    const [selectedTagNames, setSelectedTagNames] = useState([]);
    const [mode, setMode] = useState("raw");
    const [resultPage, setResultPage] = useState(1);
    const [range, setRange] = useState({ from: "", to: "" });
    const [rangeEditor, setRangeEditor] = useState(null);
    const [splitChartGroups, setSplitChartGroups] = useState([]);
    const [splitChartRanges, setSplitChartRanges] = useState({});
    const [chartViewRanges, setChartViewRanges] = useState({});
    const [chartNavigatorRanges, setChartNavigatorRanges] = useState({});
    const [chartResults, setChartResults] = useState({});
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState("");
    const [backwardScan, setBackwardScan] = useState(true);
    const [timeFormat, setTimeFormat] = useState(DEFAULT_TIME_FORMAT);
    const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
    const [formatOpen, setFormatOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [endLoading, setEndLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: RESULT_PAGE_SIZE });
    const rowsRequestRef = useRef(0);
    const chartRequestRef = useRef(0);
    const endPageRequestRef = useRef(0);
    const selectedTagKey = selectedTagNames.join("\n");

    useEffect(() => {
        let alive = true;
        setTableTags([]);
        setAssetHierarchy(null);
        setAssetHierarchyChecked(false);
        setTagError("");

        if (!dbServer || !dbTable) {
            setTagsLoading(false);
            setAssetHierarchyChecked(true);
            return () => {
                alive = false;
            };
        }

        setTagsLoading(true);
        listTableTags({ server: dbServer, table: dbTable })
            .then((data) => {
                if (!alive) return;
                setTableTags(data?.tags || []);
                setAssetHierarchy(data?.assetHierarchy || null);
                setAssetHierarchyChecked(true);
            })
            .catch((e) => {
                if (!alive) return;
                const message = e.reason || e.message || "Failed to load tags";
                setTagError(message);
                setAssetHierarchyChecked(true);
                notify(message, "error");
            })
            .finally(() => {
                if (alive) setTagsLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [dbServer, dbTable, notify]);

    const selectableRows = useMemo(
        () => [...tagRows, ...assetRows].filter((row) => row.type === "tag" && row.tag?.name),
        [assetRows, tagRows]
    );
    const activeTagRows = activeTagTab === "asset" && showAssetTab ? assetRows : tagRows;

    useEffect(() => {
        if (activeTagTab === "asset" && !showAssetTab) {
            setActiveTagTab("tags");
        }
    }, [activeTagTab, showAssetTab]);

    useEffect(() => {
        const next = normalizeSelectedTagNames(selectedTagNames, selectableRows);
        if (next.join("\n") !== selectedTagKey) {
            rowsRequestRef.current += 1;
            chartRequestRef.current += 1;
            endPageRequestRef.current += 1;
            setSelectedTagNames(next);
            setResultPage(1);
        }
    }, [selectableRows, selectedTagKey, selectedTagNames]);

    useEffect(() => {
        const selected = new Set(selectedTagNames);
        setSplitChartGroups((current) => {
            const next = current
                .map((group) => ({
                    ...group,
                    tagNames: (group.tagNames || []).filter((name) => selected.has(name)),
                }))
                .filter((group) => group.tagNames.length > 0);
            const same = next.length === current.length && next.every((group, index) => (
                group.id === current[index].id &&
                group.tagNames.join("\n") === (current[index].tagNames || []).join("\n")
            ));
            return same ? current : next;
        });
    }, [selectedTagNames]);

    useEffect(() => {
        setCollapsedTagFolders((prev) => (prev.size === 0 ? prev : new Set()));
    }, [selectedCollectorId, activeTagRows]);

    useEffect(() => {
        rowsRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setResultPage(1);
    }, [selectedCollectorId]);

    const filteredTagRows = useMemo(() => {
        const q = tagFilter.trim().toLowerCase();
        if (!q) return activeTagRows;
        return activeTagRows.filter((row) => {
            if (row.type === "folder") return row.label.toLowerCase().includes(q);
            return (
                (row.tag?.name || "").toLowerCase().includes(q) ||
                (row.tag?.nodeId || "").toLowerCase().includes(q) ||
                row.label.toLowerCase().includes(q)
            );
        });
    }, [activeTagRows, tagFilter]);

    const visibleTagRows = useMemo(
        () => getVisibleTagRows(filteredTagRows, collapsedTagFolders),
        [collapsedTagFolders, filteredTagRows]
    );
    const canQuery = Boolean(dbServer && dbTable && selectedTagNames.length > 0);
    const chartGroups = useMemo(
        () => buildDataViewerChartGroups({
            selectedTagNames,
            splitGroups: splitChartGroups,
            globalRange: range,
            splitRanges: splitChartRanges,
        }),
        [range, selectedTagNames, splitChartGroups, splitChartRanges]
    );
    const splitAssignedNames = useMemo(() => new Set(splitChartGroups.flatMap((group) => group.tagNames || [])), [splitChartGroups]);
    useEffect(() => {
        const validGroupIds = new Set(chartGroups.map((group) => group.id));
        setChartViewRanges((current) => {
            const next = {};
            for (const [id, value] of Object.entries(current)) {
                if (validGroupIds.has(id)) next[id] = value;
            }
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
        setSplitChartRanges((current) => {
            const next = {};
            for (const [id, value] of Object.entries(current)) {
                if (validGroupIds.has(id)) next[id] = value;
            }
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
    }, [chartGroups]);
    const toggleTagFolder = useCallback((key) => {
        setCollapsedTagFolders((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);
    const handleTagSelectionChange = useCallback((tagName) => {
        rowsRequestRef.current += 1;
        chartRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setChartViewRanges({});
        setChartNavigatorRanges({});
        setSelectedTagNames((current) => toggleSelectedTagName(current, tagName));
        setResultPage(1);
    }, []);

    const handleCreateSplitChart = useCallback((tagNames) => {
        const nextGroups = buildDataViewerSplitGroups({
            tagNames,
            selectedTagNames,
            assignedTagNames: Array.from(splitAssignedNames),
        });
        if (nextGroups.length === 0) return;
        chartRequestRef.current += 1;
        setChartViewRanges({});
        setChartNavigatorRanges({});
        setSplitChartGroups((current) => ([...current, ...nextGroups]));
    }, [selectedTagNames, splitAssignedNames]);

    const handleMergeSplitChart = useCallback((groupId) => {
        chartRequestRef.current += 1;
        setChartViewRanges({});
        setChartNavigatorRanges({});
        setSplitChartGroups((current) => current.filter((group) => group.id !== groupId));
        setSplitChartRanges((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
    }, []);

    const fetchRows = useCallback(async () => {
        const requestId = rowsRequestRef.current + 1;
        rowsRequestRef.current = requestId;
        if (!canQuery || mode !== "raw") {
            setResult({ rows: [], total: 0, page: 1, pageSize: RESULT_PAGE_SIZE });
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const baseDate = new Date();
            const queryFrom = resolveTimeRangeInput(range.from, baseDate);
            const queryTo = resolveTimeRangeInput(range.to, baseDate);
            if (queryFrom === null || queryTo === null) {
                if (rowsRequestRef.current !== requestId) return;
                setError("Please check the entered time.");
                setResult({ rows: [], total: 0, page: resultPage, pageSize: RESULT_PAGE_SIZE });
                return;
            }

            const data = await queryTagData({
                server: dbServer,
                table: dbTable,
                names: selectedTagNames,
                valueColumn,
                stringValueColumn,
                direction: backwardScan ? "latest" : "oldest",
                from: queryFrom,
                to: queryTo,
                page: resultPage,
                pageSize: RESULT_PAGE_SIZE,
            });
            if (rowsRequestRef.current !== requestId) return;
            setResult(data || { rows: [], total: 0, page: resultPage, pageSize: RESULT_PAGE_SIZE });
        } catch (e) {
            if (rowsRequestRef.current !== requestId) return;
            const message = e.reason || e.message || "Failed to load data";
            setError(message);
            notify(message, "error");
            setResult({ rows: [], total: 0, page: resultPage, pageSize: RESULT_PAGE_SIZE });
        } finally {
            if (rowsRequestRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [backwardScan, canQuery, dbServer, dbTable, mode, notify, range.from, range.to, resultPage, selectedTagNames, stringValueColumn, valueColumn]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        const requestId = chartRequestRef.current + 1;
        chartRequestRef.current = requestId;

        if (!canQuery || mode !== "chart") {
            setChartResults({});
            setChartError("");
            setChartLoading(false);
            return undefined;
        }

        let alive = true;
        const fetchCharts = async () => {
            setChartLoading(true);
            setChartError("");
            try {
                const baseDate = new Date();
                const nextResults = {};
                await Promise.all(chartGroups.map(async (group) => {
                    const queryFrom = resolveTimeRangeInput(group.range?.from, baseDate);
                    const queryTo = resolveTimeRangeInput(group.range?.to, baseDate);
                    if (queryFrom === null || queryTo === null) {
                        throw new Error("Please check the entered time.");
                    }
                    const data = await queryTagChartData({
                        server: dbServer,
                        table: dbTable,
                        names: group.tagNames,
                        valueColumn,
                        stringValueColumn,
                        from: queryFrom,
                        to: queryTo,
                    });
                    nextResults[group.id] = {
                        range: { from: queryFrom || "", to: queryTo || "" },
                        series: data?.series || [],
                    };
                }));
                if (!alive || chartRequestRef.current !== requestId) return;
                setChartResults(nextResults);
                setChartNavigatorRanges((current) => {
                    const next = {};
                    for (const group of chartGroups) {
                        next[group.id] = current[group.id] || nextResults[group.id]?.range || group.range;
                    }
                    return next;
                });
            } catch (e) {
                if (!alive || chartRequestRef.current !== requestId) return;
                const message = e.reason || e.message || "Failed to load chart data";
                setChartError(message);
                notify(message, "error");
                setChartResults({});
            } finally {
                if (alive && chartRequestRef.current === requestId) {
                    setChartLoading(false);
                }
            }
        };

        fetchCharts();
        return () => {
            alive = false;
        };
    }, [canQuery, chartGroups, dbServer, dbTable, mode, notify, stringValueColumn, valueColumn]);

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
    const headerLabels = buildDataViewerHeaderLabels(collector.id, dbTable);
    const resultHeading = getResultHeading(mode);
    const rawColumns = buildRawResultColumns(result.rows, {
        hiddenKeys: showAssetTab ? [assetHierarchy?.column || "asset"] : [],
    });
    const handleScanDirectionChange = (nextBackwardScan) => {
        rowsRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setBackwardScan(nextBackwardScan);
        setResultPage(1);
    };
    const handleRangeApply = (next) => {
        rowsRequestRef.current += 1;
        chartRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setChartViewRanges({});
        setChartNavigatorRanges({});
        if (rangeEditor?.type === "split" && rangeEditor.groupId) {
            setSplitChartRanges((current) => ({
                ...current,
                [rangeEditor.groupId]: next,
            }));
        } else {
            setRange(next);
        }
        setResultPage(1);
        setRangeEditor(null);
    };
    const handleEndPage = async () => {
        if (!canQuery || endLoading) return;
        const requestId = endPageRequestRef.current + 1;
        endPageRequestRef.current = requestId;
        setEndLoading(true);
        setError("");
        try {
            const baseDate = new Date();
            const queryFrom = resolveTimeRangeInput(range.from, baseDate);
            const queryTo = resolveTimeRangeInput(range.to, baseDate);
            if (queryFrom === null || queryTo === null) {
                if (endPageRequestRef.current !== requestId) return;
                setError("Please check the entered time.");
                return;
            }
            const data = await queryTagDataTotal({
                server: dbServer,
                table: dbTable,
                names: selectedTagNames,
                valueColumn,
                stringValueColumn,
                direction: backwardScan ? "latest" : "oldest",
                from: queryFrom,
                to: queryTo,
                pageSize: RESULT_PAGE_SIZE,
            });
            if (endPageRequestRef.current !== requestId) return;
            const lastPage = Number(data?.lastPage || 1);
            setResultPage(Number.isFinite(lastPage) ? Math.max(1, Math.floor(lastPage)) : 1);
        } catch (e) {
            if (endPageRequestRef.current !== requestId) return;
            const message = e.reason || e.message || "Failed to calculate end page";
            setError(message);
            notify(message, "error");
        } finally {
            if (endPageRequestRef.current === requestId) {
                setEndLoading(false);
            }
        }
    };
    const handleOpenTagAnalyzer = (group, chartData) => {
        const built = buildNeoWebTagAnalyzerMessage({
            title: group.title || "OPC UA Data Viewer",
            table: dbTable,
            tagNames: group.tagNames,
            range: chartViewRanges[group.id] || chartData?.range || group.range,
            valueColumn,
            stringOnly: Boolean(config.stringOnly),
        });
        if (!built.ok) {
            notify(built.reason || "Cannot open Tag Analyzer.", "error");
            return;
        }

        const targetWindow = typeof window !== "undefined" ? window.parent : null;
        if (!targetWindow || targetWindow === window) {
            notify("Open this Data Viewer inside neo-web to use Tag Analyzer.", "error");
            return;
        }
        const sent = sendNeoWebTagAnalyzerMessage(built.message, targetWindow, window.location.origin);
        if (!sent) {
            notify("Cannot send Tag Analyzer request to neo-web.", "error");
        }
    };
    const handleSetGlobalTime = (groupId) => {
        const update = buildDataViewerGlobalTimeUpdate({
            sourceGroupId: groupId,
            chartGroups,
            chartViewRanges,
            chartNavigatorRanges,
            chartResults,
        });
        if (!update) {
            notify("Cannot set global time from this chart.", "error");
            return;
        }

        rowsRequestRef.current += 1;
        chartRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setChartViewRanges(update.viewRanges);
        setChartNavigatorRanges(update.navigatorRanges);
        setRange(update.range);
        setSplitChartRanges(update.splitRanges);
        setResultPage(1);
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
                        <h2 className="page-title truncate">{headerLabels.title}</h2>
                        {headerLabels.detail && <span className="badge badge-muted truncate">{headerLabels.detail}</span>}
                    </div>
                </div>
            </header>
            )}

            <div className={embedded ? "data-viewer-embedded-body" : "page-body-full data-viewer-body"}>
                <div className={embedded ? "data-viewer-embedded-inner" : "page-body-inner"}>
                    <div className="data-viewer-layout">
                        <aside className="form-card data-viewer-tags">
                            {!showAssetTab && !assetHierarchyPending && (
                                <div className="form-card-header !mb-0">
                                    <span className="section-dot" />
                                    Tags
                                </div>
                            )}
                            {showAssetTab && (
                                <div className="data-viewer-tag-tabs" role="tablist" aria-label="Tag source">
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={activeTagTab === "tags"}
                                        className={`data-viewer-tag-tab${activeTagTab === "tags" ? " is-active" : ""}`}
                                        onClick={() => setActiveTagTab("tags")}
                                    >
                                        Tags
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={activeTagTab === "asset"}
                                        className={`data-viewer-tag-tab${activeTagTab === "asset" ? " is-active" : ""}`}
                                        onClick={() => setActiveTagTab("asset")}
                                    >
                                        Hierarchy
                                    </button>
                                </div>
                            )}
                            <div className="data-viewer-tag-search">
                                <input
                                    type="text"
                                    value={tagFilter}
                                    onChange={(e) => setTagFilter(e.target.value)}
                                    placeholder="Filter tags..."
                                    className="w-full"
                                    disabled={assetHierarchyPending}
                                />
                            </div>
                            {tagError && <div className="error-box">{tagError}</div>}
                            <div className="data-viewer-tag-list">
                                {!assetHierarchyPending && visibleTagRows.map((row) => {
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
                                    const checked = selectedTagNames.includes(row.tag.name);
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
                                                    onChange={() => handleTagSelectionChange(row.tag.name)}
                                                    aria-label={`${row.tag.name} select`}
                                                />
                                            </span>
                                            <span className="node-tree-label truncate">{row.label}</span>
                                            {row.tag.dataType && <span className="badge badge-success">{row.tag.dataType}</span>}
                                        </label>
                                    );
                                })}
                                {(tagsLoading || assetHierarchyPending) && <div className="empty-state">Loading tags...</div>}
                                {!tagsLoading && !assetHierarchyPending && visibleTagRows.length === 0 && <div className="empty-state">No tags</div>}
                            </div>
                        </aside>

                        <section className="form-card data-viewer-results">
                            <div className="data-viewer-toolbar">
                                <div className="data-viewer-title-row">
                                    {resultHeading && (
                                        <div className="form-card-header !mb-0">
                                            <span className="section-dot" />
                                            {resultHeading}
                                        </div>
                                    )}
                                    <div className="data-viewer-title-actions">
                                        {mode === "raw" && (
                                            <div className="data-viewer-segmented data-viewer-scan-control" role="group" aria-label="Scan direction">
                                                <button
                                                    type="button"
                                                    className={`data-viewer-segmented-item ${backwardScan ? "is-active" : ""}`}
                                                    onClick={() => handleScanDirectionChange(true)}
                                                    aria-pressed={backwardScan}
                                                >
                                                    Backward
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`data-viewer-segmented-item ${!backwardScan ? "is-active" : ""}`}
                                                    onClick={() => handleScanDirectionChange(false)}
                                                    aria-pressed={!backwardScan}
                                                >
                                                    Forward
                                                </button>
                                            </div>
                                        )}
                                        {showsDataViewerTimeControls(mode) && (
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
                                                <button type="button" aria-label="Set time range" title={timeRangeButtonText} className="btn btn-sm btn-ghost data-viewer-time-range-button" onClick={() => setRangeEditor({ type: "global" })}>
                                                    <Icon name="calendar_month" className="icon-sm" />
                                                    <span>{timeRangeButtonText}</span>
                                                </button>
                                            </div>
                                        )}
                                        <div className="data-viewer-segmented data-viewer-mode-control" role="tablist" aria-label="Result mode">
                                            <button type="button" role="tab" aria-selected={mode === "raw"} className={`data-viewer-segmented-item ${mode === "raw" ? "is-active" : ""}`} onClick={() => setMode("raw")}>
                                                Raw
                                            </button>
                                            <button type="button" role="tab" aria-selected={mode === "chart"} className={`data-viewer-segmented-item ${mode === "chart" ? "is-active" : ""}`} onClick={() => setMode("chart")}>
                                                Chart
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {error && <div className="error-box">{error}</div>}
                            {!canQuery && <div className="empty-state">Database table and tag are required</div>}
                            {canQuery && mode === "raw" && (
                                <div className="table-card data-viewer-raw-card">
                                    <div className="table-card-body">
                                        <table className="table-clean data-viewer-raw-table">
                                            <thead>
                                                <tr>
                                                    {rawColumns.map((column) => (
                                                        <th key={column.key}>{column.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.rows.map((row, i) => (
                                                    <tr key={`${row.name}-${row.time}-${i}`}>
                                                        {rawColumns.map((column) => (
                                                            <td key={column.key} className="mono">
                                                                {column.key === "time"
                                                                    ? formatDataViewerTime(row[column.key], timeFormat, timeZone)
                                                                    : String(row[column.key] ?? "")}
                                                            </td>
                                                        ))}
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
                                <div className="data-viewer-chart-stack">
                                    {chartError && <div className="error-box">{chartError}</div>}
                                    {chartLoading && <div className="empty-state">Loading...</div>}
                                    {!chartLoading && chartGroups.map((group) => {
                                        const chartData = chartResults[group.id] || { series: [], range: group.range };
                                        const globalTimeUpdate = buildDataViewerGlobalTimeUpdate({
                                            sourceGroupId: group.id,
                                            chartGroups,
                                            chartViewRanges,
                                            chartNavigatorRanges,
                                            chartResults,
                                        });
                                        return (
                                            <div key={group.id} className="table-card data-viewer-chart-card">
                                                <div className="data-viewer-chart-panel-header">
                                                    <div className="data-viewer-chart-panel-title">
                                                        <Icon name={group.split ? "call_split" : "query_stats"} className="icon-sm text-primary" />
                                                        <span className="truncate">{group.title}</span>
                                                        <span className="badge badge-muted">{group.tagNames.length}</span>
                                                    </div>
                                                    {!group.split && group.tagNames.length > 0 && (group.tagNames.length > 1 || splitChartGroups.length > 0) && (
                                                        <div
                                                            className="data-viewer-chart-tag-actions"
                                                            aria-label="Split individual tags"
                                                            onWheel={(event) => {
                                                                const target = event.currentTarget;
                                                                if (target.scrollWidth <= target.clientWidth) return;

                                                                event.preventDefault();
                                                                target.scrollLeft += event.deltaX || event.deltaY;
                                                            }}
                                                        >
                                                            {group.tagNames.map((tagName) => (
                                                                <button
                                                                    key={tagName}
                                                                    type="button"
                                                                    className="data-viewer-chart-tag-chip"
                                                                    title={`Split ${tagName}`}
                                                                    onClick={() => handleCreateSplitChart([tagName])}
                                                                >
                                                                    <span className="truncate">{tagName}</span>
                                                                    <Icon name="call_split" className="icon-sm" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="data-viewer-chart-panel-actions">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-ghost"
                                                            title="Open in Tag Analyzer"
                                                            onClick={() => handleOpenTagAnalyzer(group, chartData)}
                                                        >
                                                            <Icon name="monitoring" className="icon-sm" />
                                                            <span>Tag Analyzer</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-ghost"
                                                            title="Apply this chart time to all charts"
                                                            disabled={!globalTimeUpdate}
                                                            onClick={() => handleSetGlobalTime(group.id)}
                                                        >
                                                            <Icon name="schedule" className="icon-sm" />
                                                            <span>Global Time</span>
                                                        </button>
                                                        {group.split && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-ghost"
                                                                    title="Group"
                                                                    onClick={() => handleMergeSplitChart(group.id)}
                                                                >
                                                                    <Icon name="join_inner" className="icon-sm" />
                                                                    <span>Group</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-ghost data-viewer-time-range-button"
                                                                    title={formatTimeRangeLabel(group.range?.from, group.range?.to)}
                                                                    onClick={() => setRangeEditor({ type: "split", groupId: group.id })}
                                                                >
                                                                    <Icon name="calendar_month" className="icon-sm" />
                                                                    <span>{formatTimeRangeLabel(group.range?.from, group.range?.to)}</span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="table-card-body">
                                                    <TagEChart
                                                        series={chartData.series}
                                                        timeFormat={timeFormat}
                                                        timeZone={timeZone}
                                                        timeRange={chartData.range}
                                                        displayRange={chartViewRanges[group.id]}
                                                        onDisplayRangeChange={(nextRange, nextNavigatorRange) => {
                                                            setChartViewRanges((current) => ({
                                                                ...current,
                                                                [group.id]: nextRange,
                                                            }));
                                                            if (nextNavigatorRange) {
                                                                setChartNavigatorRanges((current) => ({
                                                                    ...current,
                                                                    [group.id]: nextNavigatorRange,
                                                                }));
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
            {rangeEditor && (
                <TimeRangeModal
                    range={rangeEditor.type === "split" ? (splitChartRanges[rangeEditor.groupId] || range) : range}
                    onClose={() => setRangeEditor(null)}
                    onApply={handleRangeApply}
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
