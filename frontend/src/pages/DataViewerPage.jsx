import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as echarts from "echarts";
import Icon from "../components/common/Icon";
import { useApp } from "../context/AppContext";
import { listTableTags, queryTagBoundaryTime, queryTagData, queryTagDataTotal } from "../api/dataViewer";
import ZoomInTwo from "../assets/image/btn_zoom in x2@3x.png";
import ZoomInFour from "../assets/image/btn_zoom in x4@3x.png";
import ZoomOutTwo from "../assets/image/btn_zoom out x2@3x.png";
import ZoomOutFour from "../assets/image/btn_zoom out x4@3x.png";
import {
    DATA_VIEWER_BACK_PATH,
    DEFAULT_DATA_VIEWER_ROWS_PER_TAG,
    DEFAULT_TIME_FORMAT,
    DEFAULT_TIME_ZONE,
    QUICK_TIME_RANGE_GROUPS,
    TIME_FORMATS,
    TIME_ZONE_OPTIONS,
    buildAssetRows,
    buildDataViewerChartGroups,
    buildDataViewerChartResultsFromRawRows,
    buildDataViewerEChartOption,
    buildDataViewerGlobalTimeUpdate,
    buildDataViewerHeaderLabels,
    buildDataViewerDefaultChartShiftRawPageUpdate,
    buildDataViewerRawPageBounds,
    buildDataViewerRawPageRequest,
    buildDataViewerRawRowsPerTagChange,
    buildDataViewerSplitRangeUpdate,
    buildDataViewerSplitGroups,
    buildDataViewerShiftMainRangeUpdate,
    buildDataViewerDragRangeUpdate,
    buildDataViewerTagSelectionUpdate,
    buildDataViewerWheelZoomRange,
    buildDataViewerZoomControlRange,
    buildDerivedTagRows,
    buildNeoWebTagAnalyzerMessage,
    buildRawColumnWidths,
    buildRawResultColumns,
    buildRawRowNameColors,
    buildSeriesColorMap,
    buildTagRows,
    DEFAULT_DATA_VIEWER_TIME_RANGE,
    extractDataViewerDataZoomRange,
    formatDataViewerNavigatorRangeLabels,
    formatDataViewerTime,
    formatTimeRangeInput,
    formatTimeRangeLabel,
    getDataViewerChartRangeMs,
    getDataViewerRawPageSize,
    usesLastDataAnchor,
    getResultHeading,
    getScanDirectionLabel,
    getTimeFormatLabel,
    getTimeZoneLabel,
    getVisibleTagRows,
    hasDataViewerRawNextPage,
    hasExplicitDataViewerDataZoomEventRange,
    hasAssetHierarchy,
    isSameDataViewerChartRange,
    normalizeSelectedTagNames,
    resolveTimeRangeInput,
    resolveTagNodes,
    sendNeoWebTagAnalyzerMessage,
    showsDataViewerTimeControls,
    JSON_VALUE_COLUMN_BLOCK_REASON,
} from "./dataViewerModel";
import useJsonValueColumn from "../hooks/useJsonValueColumn";
import useModalDismiss from "../hooks/useModalDismiss";

// Must match `.data-viewer-raw-table th, td { height: 25px }` — the virtualizer trusts it
// instead of measuring, which is what keeps scrolling allocation-free.
const RAW_ROW_HEIGHT = 25;
// The name cell's colour dot plus its margin, which the column has to fit alongside the text.
const RAW_NAME_DOT_SPACE = 15;

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

function ResultPagination({ page, pageSize, rowCount, loading, endLoading, forceNextPage = false, rowsPerTag, onRowsPerTagChange, onPage, onEndPage }) {
    const [value, setValue] = useState(String(page));
    const [rowsPerTagValue, setRowsPerTagValue] = useState(String(rowsPerTag));
    const hasNextPage = hasDataViewerRawNextPage({ rowCount, pageSize, forceOpen: forceNextPage });

    useEffect(() => {
        setValue(String(page));
    }, [page]);

    useEffect(() => {
        setRowsPerTagValue(String(rowsPerTag));
    }, [rowsPerTag]);

    const go = (next) => {
        onPage(Math.max(1, next));
    };

    const commit = () => {
        const n = Number(value);
        if (Number.isFinite(n)) go(Math.floor(n));
        else setValue(String(page));
    };

    const commitRowsPerTag = () => {
        const next = onRowsPerTagChange?.(rowsPerTagValue);
        setRowsPerTagValue(String(next || rowsPerTag));
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
            <button type="button" className="btn btn-sm btn-ghost" disabled={!hasNextPage || loading || endLoading} onClick={onEndPage} title="Move to end page">
                <Icon name="keyboard_double_arrow_right" className="icon-sm" />
            </button>
            <label className="pagination-page-size">
                <span>Rows / tag</span>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={rowsPerTagValue}
                    onChange={(e) => setRowsPerTagValue(e.target.value)}
                    onBlur={commitRowsPerTag}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitRowsPerTag();
                    }}
                    className="pagination-input pagination-page-size-input"
                    aria-label="Rows per tag"
                    disabled={loading || endLoading}
                />
            </label>
        </div>
    );
}

function TimeRangeModal({ range, onApply, onClose }) {
    const [from, setFrom] = useState(formatTimeRangeInput(range.from));
    const [to, setTo] = useState(formatTimeRangeInput(range.to));
    const [error, setError] = useState("");
    const [picker, setPicker] = useState(null);

    // While the date picker popover is open it owns the first dismissal, so Escape (and a click
    // on the overlay) closes the picker rather than throwing away the whole range edit.
    const dismiss = useCallback(() => {
        if (picker) {
            setPicker(null);
            return;
        }
        onClose();
    }, [onClose, picker]);
    const overlayProps = useModalDismiss(dismiss);

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
        // A one-sided range can't pin the bounded window that pagination is measured against, so reject it.
        if (!nextFrom || !nextTo) {
            setError("Both From and To are required.");
            return;
        }
        if (new Date(nextFrom).getTime() > new Date(nextTo).getTime()) {
            setError("From should be earlier than To.");
            return;
        }

        onApply({ from: from.trim(), to: to.trim() });
    };

    return (
        <div className="modal-overlay data-viewer-time-overlay" {...overlayProps}>
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
                    <button type="button" className="btn btn-primary" onClick={handleApply} disabled={!from.trim() || !to.trim()}>
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
    const overlayProps = useModalDismiss(onClose);

    return (
        <div className="modal-overlay data-viewer-time-overlay" {...overlayProps}>
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

function TagEChart({ series, timeFormat, timeZone, timeRange, displayRange, seriesColors, onDisplayRangeChange, onShiftMainRange }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const rangeRef = useRef({ currentRange: {}, navigatorRange: {}, onDisplayRangeChange });
    const dragStateRef = useRef(null);
    const [dragPreview, setDragPreview] = useState(null);
    const allPoints = useMemo(() => series.flatMap((item) => item.data), [series]);
    const hasChartData = allPoints.length > 0;
    const options = useMemo(
        () => buildDataViewerEChartOption({ series, timeFormat, timeZone, timeRange, displayRange, seriesColors }),
        [displayRange, series, seriesColors, timeFormat, timeRange, timeZone]
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
        // The axis extent the chart is drawing right now. Its two ends are the plot's left and
        // right edges expressed in axis units, so value clamping needs no pixel math.
        const getAxisExtent = () => {
            const axis = chart.getOption?.()?.xAxis?.[0] || {};
            const axisMin = Number(axis.min);
            const axisMax = Number(axis.max);
            if (Number.isFinite(axisMin) && Number.isFinite(axisMax) && axisMax > axisMin) {
                return { min: axisMin, max: axisMax };
            }
            const { currentRange: activeRange } = rangeRef.current;
            const start = Number(activeRange?.startTime);
            const end = Number(activeRange?.endTime);
            return Number.isFinite(start) && Number.isFinite(end) && end > start ? { min: start, max: end } : undefined;
        };
        // Container-relative pixel edges of the plot. `option.grid.left`/`right` cannot be used:
        // with `containLabel: true` the plot is pushed further inward by the axis label width,
        // so converting the axis ends back to pixels is the only honest source.
        const getPlotPixelBounds = () => {
            const extent = getAxisExtent();
            if (!extent) return undefined;
            const left = Number(chart.convertToPixel?.({ xAxisIndex: 0 }, extent.min));
            const right = Number(chart.convertToPixel?.({ xAxisIndex: 0 }, extent.max));
            return Number.isFinite(left) && Number.isFinite(right) && right > left ? { left, right } : undefined;
        };
        // `reject` keeps a gesture from starting on the legend / navigator / margins.
        // `clamp` lets an in-flight drag survive the pointer leaving the plot: the pointer keeps
        // reporting, and the value is pinned to the axis end it walked past.
        const convertMouseEventToTimestamp = (event, { outside = "reject" } = {}) => {
            const rect = container.getBoundingClientRect?.();
            if (!rect) return undefined;

            const pixel = [event.clientX - rect.left, event.clientY - rect.top];
            if (outside === "reject" && !chart.containPixel?.({ gridIndex: 0 }, pixel)) return undefined;

            const extent = getAxisExtent();
            const toAxisTime = (time) => {
                if (!Number.isFinite(time)) return undefined;
                if (outside !== "clamp" || !extent) return time;
                return Math.min(Math.max(time, extent.min), extent.max);
            };

            const fromAxis = chart.convertFromPixel?.({ xAxisIndex: 0 }, pixel);
            const axisTime = Array.isArray(fromAxis) ? Number(fromAxis[0]) : Number(fromAxis);
            if (Number.isFinite(axisTime)) return toAxisTime(axisTime);

            const fromGrid = chart.convertFromPixel?.({ gridIndex: 0 }, pixel);
            const gridTime = Array.isArray(fromGrid) ? Number(fromGrid[0]) : Number(fromGrid);
            if (Number.isFinite(gridTime)) return toAxisTime(gridTime);

            // Both conversions refused (unresolvable axis finder). Interpolate over the measured
            // plot bounds before falling back to the middle of the window.
            const bounds = getPlotPixelBounds();
            if (bounds && extent) {
                const ratio = (pixel[0] - bounds.left) / (bounds.right - bounds.left);
                return toAxisTime(extent.min + ratio * (extent.max - extent.min));
            }
            return extent ? (extent.min + extent.max) / 2 : undefined;
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
        const getDragMode = (button) => {
            if (button === 0) return "zoom-in";
            if (button === 1) return "pan";
            if (button === 2) return "zoom-out";
            return undefined;
        };
        const getMainGridBounds = () => {
            const grid = chart.getOption?.()?.grid?.[0] || {};
            const top = Number(grid.top);
            const height = Number(grid.height);
            return {
                top: Number.isFinite(top) ? top : 40,
                height: Number.isFinite(height) ? height : 178,
            };
        };
        // clientX -> container-relative pixel, pinned to the plot edges captured at mousedown.
        const clampToPlotPixel = (dragState, clientX) => {
            const containerX = clientX - dragState.containerLeft;
            const bounds = dragState.plotBounds;
            if (!bounds) return containerX;
            return Math.min(Math.max(containerX, bounds.left), bounds.right);
        };
        const emitDragRange = (dragState, endTime) => {
            const nextRange = buildDataViewerDragRangeUpdate({
                mode: dragState.mode,
                dragStartTime: dragState.startTime,
                dragEndTime: endTime,
                currentRange: dragState.currentRange,
                navigatorRange: dragState.navigatorRange,
            });
            if (!nextRange || isSameDataViewerChartRange(nextRange, dragState.currentRange)) return;

            dragState.onDisplayRangeChange?.({
                from: new Date(nextRange.startTime).toISOString(),
                to: new Date(nextRange.endTime).toISOString(),
            }, {
                from: new Date(dragState.navigatorRange.startTime).toISOString(),
                to: new Date(dragState.navigatorRange.endTime).toISOString(),
            });
        };
        const applyDragRange = (event) => {
            const dragState = dragStateRef.current;
            dragStateRef.current = null;
            setDragPreview(null);
            if (!dragState) return;

            const endTime = convertMouseEventToTimestamp(event, { outside: "clamp" });
            if (!Number.isFinite(endTime) || Math.abs(event.clientX - dragState.startX) < 8) return;

            emitDragRange(dragState, endTime);
        };
        const handleDragMove = (event) => {
            const dragState = dragStateRef.current;
            if (!dragState) return;
            event.preventDefault();
            event.stopPropagation();

            const endTime = convertMouseEventToTimestamp(event, { outside: "clamp" });
            if (dragState.mode === "pan") {
                if (Number.isFinite(endTime) && Math.abs(event.clientX - dragState.startX) >= 1) {
                    emitDragRange(dragState, endTime);
                }
                return;
            }
            // Both ends go through the same clamp so the guide stops exactly where the applied
            // range stops.
            const startLeft = clampToPlotPixel(dragState, dragState.startX);
            const currentLeft = clampToPlotPixel(dragState, event.clientX);
            setDragPreview({
                mode: dragState.mode,
                left: Math.min(startLeft, currentLeft),
                width: Math.abs(currentLeft - startLeft),
                ...dragState.gridBounds,
            });
        };
        const handleDragEnd = (event) => {
            if (!dragStateRef.current) return;
            event.preventDefault();
            event.stopPropagation();
            window.removeEventListener("mousemove", handleDragMove, true);
            window.removeEventListener("mouseup", handleDragEnd, true);
            applyDragRange(event);
        };
        const handleMouseDownDrag = (event) => {
            const mode = getDragMode(event.button);
            if (!mode) return;
            const startTime = convertMouseEventToTimestamp(event);
            if (!Number.isFinite(startTime)) return;

            const rect = container.getBoundingClientRect?.();
            if (!rect) return;
            event.preventDefault();
            event.stopPropagation();

            const { currentRange: activeRange, navigatorRange: activeNavigatorRange, onDisplayRangeChange: activeRangeChange } = rangeRef.current;
            dragStateRef.current = {
                mode,
                startTime,
                startX: event.clientX,
                containerLeft: rect.left,
                currentRange: activeRange,
                navigatorRange: activeNavigatorRange,
                onDisplayRangeChange: activeRangeChange,
                gridBounds: getMainGridBounds(),
                plotBounds: getPlotPixelBounds(),
            };
            setDragPreview(mode === "pan" ? null : {
                mode,
                left: clampToPlotPixel(dragStateRef.current, event.clientX),
                width: 0,
                ...dragStateRef.current.gridBounds,
            });
            window.addEventListener("mousemove", handleDragMove, true);
            window.addEventListener("mouseup", handleDragEnd, true);
        };
        const handleContextMenu = (event) => {
            const startTime = convertMouseEventToTimestamp(event);
            if (!Number.isFinite(startTime)) return;
            event.preventDefault();
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
        container.addEventListener("mousedown", handleMouseDownDrag, { capture: true });
        container.addEventListener("contextmenu", handleContextMenu, { capture: true });

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
            container.removeEventListener("mousedown", handleMouseDownDrag, true);
            container.removeEventListener("contextmenu", handleContextMenu, true);
            window.removeEventListener("mousemove", handleDragMove, true);
            window.removeEventListener("mouseup", handleDragEnd, true);
            if (observer) observer.disconnect();
            else window.removeEventListener("resize", resize);
            chart.dispose();
            chartRef.current = null;
            dragStateRef.current = null;
        };
    }, [hasChartData]);

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
    const navigatorLabels = useMemo(
        () => formatDataViewerNavigatorRangeLabels(navigatorRange, timeFormat, timeZone),
        [navigatorRange, timeFormat, timeZone]
    );

    return (
        <div className="data-viewer-chart-shell">
            <button
                type="button"
                className="data-viewer-chart-range-shift data-viewer-chart-range-shift-left"
                title="Move range backward"
                aria-label="Move range backward"
                disabled={zoomControlsDisabled}
                onClick={() => onShiftMainRange?.("backward", currentRange, navigatorRange)}
            >
                <Icon name="chevron_left" className="icon-sm" />
            </button>
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
                className={`data-viewer-chart${dragStateRef.current?.mode === "pan" ? " is-panning" : ""}`}
                data-display-from={Number.isFinite(currentRange.startTime) ? String(Math.floor(currentRange.startTime)) : ""}
                data-display-to={Number.isFinite(currentRange.endTime) ? String(Math.ceil(currentRange.endTime)) : ""}
                data-navigator-from={Number.isFinite(navigatorRange.startTime) ? String(Math.floor(navigatorRange.startTime)) : ""}
                data-navigator-to={Number.isFinite(navigatorRange.endTime) ? String(Math.ceil(navigatorRange.endTime)) : ""}
            />
            {dragPreview && (
                <div
                    className={`data-viewer-chart-drag-preview data-viewer-chart-drag-preview-${dragPreview.mode}`}
                    style={{
                        left: `${48 + Math.max(0, dragPreview.left)}px`,
                        top: `${dragPreview.top}px`,
                        width: `${dragPreview.width}px`,
                        height: `${dragPreview.height}px`,
                    }}
                />
            )}
            {!hasChartData && (
                <div className="data-viewer-chart-empty-overlay" aria-live="polite">
                    No chart data
                </div>
            )}
            {(navigatorLabels.start || navigatorLabels.end) && (
                <div className="data-viewer-chart-navigator-labels" aria-label="Mini chart time range">
                    <span title={navigatorLabels.start}>{navigatorLabels.start}</span>
                    <span title={navigatorLabels.end}>{navigatorLabels.end}</span>
                </div>
            )}
            <button
                type="button"
                className="data-viewer-chart-range-shift data-viewer-chart-range-shift-right"
                title="Move range forward"
                aria-label="Move range forward"
                disabled={zoomControlsDisabled}
                onClick={() => onShiftMainRange?.("forward", currentRange, navigatorRange)}
            >
                <Icon name="chevron_right" className="icon-sm" />
            </button>
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
    const { isJson: jsonValueColumn } = useJsonValueColumn({ server: dbServer, table: dbTable, valueColumn });
    const stringValueColumn = config.stringOnly ? "" : (config.stringValueColumn || "");

    const [tableTags, setTableTags] = useState([]);
    const [assetHierarchy, setAssetHierarchy] = useState(null);
    const [assetHierarchyChecked, setAssetHierarchyChecked] = useState(false);
    const [tagsLoading, setTagsLoading] = useState(false);
    const [tagError, setTagError] = useState("");
    const nodes = useMemo(() => resolveTagNodes(configuredNodes, tableTags), [configuredNodes, tableTags]);
    const tagRows = useMemo(() => buildTagRows(nodes), [nodes]);
    const derivedTagRows = useMemo(
        () => buildDerivedTagRows(config?.derivedTags, nodes.map((node) => node?.name)),
        [config, nodes]
    );
    const showAssetTab = hasAssetHierarchy(assetHierarchy);
    const assetHierarchyPending = Boolean(dbServer && dbTable && !assetHierarchyChecked && tagsLoading);
    const assetRows = useMemo(() => buildAssetRows(assetHierarchy, tableTags), [assetHierarchy, tableTags]);
    const [activeTagTab, setActiveTagTab] = useState("tags");
    const [tagFilter, setTagFilter] = useState("");
    const [collapsedTagFolders, setCollapsedTagFolders] = useState(() => new Set());
    const [selectedTagNames, setSelectedTagNames] = useState([]);
    const [mode, setMode] = useState("raw");
    const [resultPage, setResultPage] = useState(1);
    const [range, setRange] = useState(DEFAULT_DATA_VIEWER_TIME_RANGE);
    // range is the expression the user typed (now-1h, last-5m, ...); pinnedRange is that expression
    // resolved once into absolute timestamps. Recomputing now on every fetch would drift the window
    // and break pagination, so every query reads pinnedRange and re-pinning happens only on Apply / Refresh.
    const [pinnedRange, setPinnedRange] = useState(null);
    const [rangeRefreshToken, setRangeRefreshToken] = useState(0);
    const [rangeEditor, setRangeEditor] = useState(null);
    const [splitChartGroups, setSplitChartGroups] = useState([]);
    const [splitChartRanges, setSplitChartRanges] = useState({});
    const [resolvedSplitChartRanges, setResolvedSplitChartRanges] = useState({});
    const [chartViewRanges, setChartViewRanges] = useState({});
    const [chartNavigatorRanges, setChartNavigatorRanges] = useState({});
    const [openChartMenuId, setOpenChartMenuId] = useState(null);
    const [chartResults, setChartResults] = useState({});
    const [splitChartRows, setSplitChartRows] = useState({});
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState("");
    const [backwardScan, setBackwardScan] = useState(true);
    const [timeFormat, setTimeFormat] = useState(DEFAULT_TIME_FORMAT);
    const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
    const [formatOpen, setFormatOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [endLoading, setEndLoading] = useState(false);
    const [error, setError] = useState("");
    const [rawRowsPerTag, setRawRowsPerTag] = useState(DEFAULT_DATA_VIEWER_ROWS_PER_TAG);
    const [result, setResult] = useState({ rows: [], total: 0, page: 1, pageSize: getDataViewerRawPageSize([]) });
    const [rawPageBounds, setRawPageBounds] = useState(null);
    const [rawPageRequest, setRawPageRequest] = useState({ page: 1 });
    const rawScrollRef = useRef(null);
    const rowsRequestRef = useRef(0);
    const chartRequestRef = useRef(0);
    const endPageRequestRef = useRef(0);
    const splitRangeRequestRef = useRef(0);
    const selectedTagKey = selectedTagNames.join("\n");
    const rawPageSize = useMemo(() => getDataViewerRawPageSize(selectedTagNames, rawRowsPerTag), [rawRowsPerTag, selectedTagNames]);

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
        () => [...tagRows, ...derivedTagRows, ...assetRows].filter((row) => row.type === "tag" && row.tag?.name),
        [assetRows, derivedTagRows, tagRows]
    );
    // The asset tab is built from the server's tag list, so derived tags already appear there
    // under whatever folder their asset metadata puts them in — only the Tags tab appends them.
    const activeTagRows = useMemo(
        () => (activeTagTab === "asset" && showAssetTab ? assetRows : [...tagRows, ...derivedTagRows]),
        [activeTagTab, assetRows, derivedTagRows, showAssetTab, tagRows]
    );

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
            setRawPageRequest(buildDataViewerRawPageRequest({
                currentPage: resultPage,
                nextPage: resultPage,
                pageSize: getDataViewerRawPageSize(next, rawRowsPerTag),
                currentBounds: rawPageBounds,
                reason: "tags",
            }));
        }
    }, [rawPageBounds, rawRowsPerTag, resultPage, selectableRows, selectedTagKey, selectedTagNames]);

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
        setRawPageBounds(null);
        setRawPageRequest({ page: 1 });
        setResultPage(1);
    }, [selectedCollectorId]);

    const moveRawPage = useCallback((nextPage) => {
        const request = buildDataViewerRawPageRequest({
            currentPage: resultPage,
            nextPage,
            pageSize: rawPageSize,
            currentBounds: rawPageBounds,
            reason: "page",
        });
        rowsRequestRef.current += 1;
        setRawPageRequest(request);
        setResultPage(request.page);
    }, [rawPageBounds, rawPageSize, resultPage]);

    const handleRowsPerTagChange = useCallback((value) => {
        const update = buildDataViewerRawRowsPerTagChange({
            value,
            currentRowsPerTag: rawRowsPerTag,
            selectedTagNames,
        });
        if (!update) return rawRowsPerTag;

        rowsRequestRef.current += 1;
        chartRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setRawRowsPerTag(update.rowsPerTag);
        setRawPageBounds(null);
        setRawPageRequest(update.rawPageRequest);
        setResultPage(update.page);
        return update.rowsPerTag;
    }, [rawRowsPerTag, selectedTagNames]);

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
            globalRange: pinnedRange || { from: "", to: "" },
            splitRanges: resolvedSplitChartRanges,
        }),
        [pinnedRange, resolvedSplitChartRanges, selectedTagNames, splitChartGroups]
    );
    const splitAssignedNames = useMemo(() => new Set(splitChartGroups.flatMap((group) => group.tagNames || [])), [splitChartGroups]);

    useEffect(() => {
        if (!openChartMenuId) return undefined;

        const handlePointerDown = (event) => {
            if (event.target instanceof Element && event.target.closest(".data-viewer-chart-action-menu")) return;
            setOpenChartMenuId(null);
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape") setOpenChartMenuId(null);
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openChartMenuId]);

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
        setResolvedSplitChartRanges((current) => {
            const next = {};
            for (const [id, value] of Object.entries(current)) {
                if (validGroupIds.has(id)) next[id] = value;
            }
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
        setChartNavigatorRanges((current) => {
            const next = {};
            for (const [id, value] of Object.entries(current)) {
                if (validGroupIds.has(id)) next[id] = value;
            }
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
        setChartResults((current) => {
            const next = {};
            for (const [id, value] of Object.entries(current)) {
                if (validGroupIds.has(id)) next[id] = value;
            }
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
        setSplitChartRows((current) => {
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
        const update = buildDataViewerTagSelectionUpdate({
            selectedTagNames,
            tagName,
            currentPage: resultPage,
            currentBounds: rawPageBounds,
        });
        setSelectedTagNames(update.selectedTagNames);
        setRawPageRequest(update.rawPageRequest);
    }, [rawPageBounds, resultPage, selectedTagNames]);

    const handleCreateSplitChart = useCallback((tagNames) => {
        const nextGroups = buildDataViewerSplitGroups({
            tagNames,
            selectedTagNames,
            assignedTagNames: Array.from(splitAssignedNames),
        });
        if (nextGroups.length === 0) return;
        const rangeUpdate = buildDataViewerSplitRangeUpdate({
            nextGroups,
            chartViewRanges,
            chartNavigatorRanges,
            splitRanges: splitChartRanges,
        });
        chartRequestRef.current += 1;
        setChartViewRanges(rangeUpdate.chartViewRanges);
        setChartNavigatorRanges(rangeUpdate.chartNavigatorRanges);
        setSplitChartRanges(rangeUpdate.splitRanges);
        setSplitChartGroups((current) => ([...current, ...nextGroups]));
    }, [chartNavigatorRanges, chartViewRanges, selectedTagNames, splitAssignedNames, splitChartRanges]);

    const handleRemoveSplitChart = useCallback((groupId) => {
        chartRequestRef.current += 1;
        splitRangeRequestRef.current += 1;
        setSplitChartGroups((current) => current.filter((group) => group.id !== groupId));
        setSplitChartRanges((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
        setResolvedSplitChartRanges((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
        setChartViewRanges((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
        setChartNavigatorRanges((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
        setChartResults((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
        setSplitChartRows((current) => {
            if (!Object.prototype.hasOwnProperty.call(current, groupId)) return current;
            const next = { ...current };
            delete next[groupId];
            return next;
        });
    }, []);

    const handleToggleSplitChart = useCallback((tagName) => {
        const splitGroup = splitChartGroups.find((group) => (group.tagNames || []).includes(tagName));
        if (splitGroup) {
            handleRemoveSplitChart(splitGroup.id);
            return;
        }
        handleCreateSplitChart([tagName]);
    }, [handleCreateSplitChart, handleRemoveSplitChart, splitChartGroups]);

    const resolveRangeForTagNames = useCallback(async (targetRange, tagNames) => {
        const nowDate = new Date();
        let lastBaseDate;
        const resolveQueryRange = async (value, boundary) => {
            const text = String(value ?? "").trim();
            if (!text.startsWith("last")) return resolveTimeRangeInput(value, nowDate, boundary);

            if (lastBaseDate === undefined) {
                const latestTime = await queryTagBoundaryTime({
                    server: dbServer,
                    table: dbTable,
                    names: tagNames,
                    valueColumn,
                    stringValueColumn,
                    direction: "latest",
                });
                lastBaseDate = latestTime ? new Date(latestTime) : null;
            }

            if (!lastBaseDate || Number.isNaN(lastBaseDate.getTime())) return null;
            return resolveTimeRangeInput(value, lastBaseDate, boundary);
        };

        const from = await resolveQueryRange(targetRange.from, "from");
        const to = await resolveQueryRange(targetRange.to, "to");
        return { from, to };
    }, [dbServer, dbTable, stringValueColumn, valueColumn]);

    const selectedTagNamesRef = useRef(selectedTagNames);
    useEffect(() => {
        selectedTagNamesRef.current = selectedTagNames;
    }, [selectedTagNames]);

    // now-* is measured off the wall clock, so it stays pinned across selection changes and
    // pagination is left alone. last-* is measured off the selected tags' latest data time, so
    // the window has to follow the selection: a window still anchored to another tag's era
    // queries an empty range and the table shows no data even though the tag has plenty of it
    // (two tags whose latest rows are years apart reproduce this every time).
    const lastAnchorTagKey = usesLastDataAnchor(range) ? selectedTagNames.join("\u0000") : "";

    // Identifies the inputs a pinned window was resolved from. fetchRows compares it with
    // pinnedRange.key so it never queries using a window that belongs to an earlier selection,
    // and so the stat lookup is awaited instead of racing a row request against it.
    const pinKey = useMemo(
        () => [range.from ?? "", range.to ?? "", rangeRefreshToken, lastAnchorTagKey].join("\u0000"),
        [lastAnchorTagKey, range.from, range.to, rangeRefreshToken]
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const tagNames = selectedTagNamesRef.current;
            try {
                const next = await resolveRangeForTagNames(range, tagNames);
                if (cancelled) return;
                if (next.from === null || next.to === null) {
                    // Still stamped with pinKey, so fetchRows stops waiting and reports the problem.
                    setPinnedRange({ from: "", to: "", key: pinKey });
                    if (tagNames.length > 0) {
                        setError("Please check the entered time.");
                    }
                    return;
                }
                setPinnedRange({ from: next.from || "", to: next.to || "", key: pinKey });
            } catch (e) {
                if (cancelled) return;
                setPinnedRange({ from: "", to: "", key: pinKey });
                // With nothing selected there is no window to resolve, which is not an error.
                if (tagNames.length > 0) {
                    setError(e.reason || e.message || "Failed to resolve the time range");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [pinKey, range, resolveRangeForTagNames]);

    // A newly pinned window invalidates any carried-over page request. Toggling a tag builds one
    // with reason "tags", which carries the previous page's row bounds as from/to, and fetchRows
    // prefers those over the pinned window — so the caption would show the new window while the
    // rows came from the old one. Dropping it here keeps the two in step.
    const appliedPinKeyRef = useRef(pinKey);
    useEffect(() => {
        if (appliedPinKeyRef.current === pinKey) return;
        appliedPinKeyRef.current = pinKey;
        rowsRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setRawPageBounds(null);
        setRawPageRequest({ page: 1 });
        setResultPage(1);
    }, [pinKey]);

    const fetchRows = useCallback(async () => {
        const requestId = rowsRequestRef.current + 1;
        rowsRequestRef.current = requestId;
        if (!canQuery) {
            setResult({ rows: [], total: 0, page: 1, pageSize: rawPageSize });
            setRawPageBounds(null);
            setLoading(false);
            return;
        }
        // The window for this range/selection has not been pinned yet — the stat lookup is still
        // in flight. Querying now would use the previous window and then immediately re-query,
        // so wait; the pin effect re-runs this with a matching key.
        if (pinnedRange?.key !== pinKey) {
            setLoading(true);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const { from: queryFrom, to: queryTo } = pinnedRange;
            if (!queryFrom || !queryTo) {
                if (rowsRequestRef.current !== requestId) return;
                setError("Please check the entered time.");
                setResult({ rows: [], total: 0, page: resultPage, pageSize: rawPageSize });
                setRawPageBounds(null);
                return;
            }
            const requestPage = rawPageRequest?.page || resultPage;
            const data = await queryTagData({
                server: dbServer,
                table: dbTable,
                names: selectedTagNames,
                valueColumn,
                stringValueColumn,
                direction: backwardScan ? "latest" : "oldest",
                from: rawPageRequest?.from ?? queryFrom,
                to: rawPageRequest?.to ?? queryTo,
                page: rawPageRequest?.boundedRange ? undefined : requestPage,
                pageSize: rawPageSize,
                boundedRange: rawPageRequest?.boundedRange,
                cursorSide: rawPageRequest?.cursorSide,
                cursorTime: rawPageRequest?.cursorTime,
                cursorName: rawPageRequest?.cursorName,
                cursorOffset: rawPageRequest?.cursorOffset,
            });
            if (rowsRequestRef.current !== requestId) return;
            const nextRows = data?.rows || [];
            const nextBounds = buildDataViewerRawPageBounds(nextRows);
            setResult(data || { rows: [], total: 0, page: resultPage, pageSize: rawPageSize });
            setRawPageBounds(nextBounds);
        } catch (e) {
            if (rowsRequestRef.current !== requestId) return;
            const message = e.reason || e.message || "Failed to load data";
            setError(message);
            notify(message, "error");
            setResult({ rows: [], total: 0, page: resultPage, pageSize: rawPageSize });
            setRawPageBounds(null);
        } finally {
            if (rowsRequestRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [backwardScan, canQuery, dbServer, dbTable, notify, pinKey, pinnedRange, rawPageRequest, rawPageSize, resultPage, selectedTagNames, stringValueColumn, valueColumn]);

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

        setChartLoading(true);
        setChartError("");
        const nextResults = buildDataViewerChartResultsFromRawRows({
            rows: result.rows,
            rowsByGroup: splitChartRows,
            chartGroups,
        });
        if (chartRequestRef.current !== requestId) return undefined;
        setChartResults(nextResults);
        setChartNavigatorRanges((current) => {
            const next = {};
            for (const group of chartGroups) {
                next[group.id] = current[group.id] || nextResults[group.id]?.range || group.range;
            }
            return next;
        });
        setChartLoading(false);
        return () => {
            chartRequestRef.current += 1;
        };
    }, [canQuery, chartGroups, mode, result.rows, splitChartRows]);

    const handleModeChange = useCallback((nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
    }, [mode]);

    const activeRange = range;
    const rangeEditorRange = useMemo(() => {
        if (rangeEditor?.type !== "split") return activeRange;
        return splitChartRanges[rangeEditor.groupId] || activeRange;
    }, [activeRange, rangeEditor, splitChartRanges]);

    const assetColumnKey = assetHierarchy?.column || "asset";
    const rawColumns = useMemo(
        () => buildRawResultColumns(result.rows, { hiddenKeys: showAssetTab ? [assetColumnKey] : [] }),
        [assetColumnKey, result.rows, showAssetTab]
    );
    const rawColumnWidths = useMemo(() => buildRawColumnWidths(result.rows, rawColumns, {
        timeSample: result.rows.length ? formatDataViewerTime(result.rows[0].time, timeFormat, timeZone) : "",
        extra: { name: RAW_NAME_DOT_SPACE },
    }), [rawColumns, result.rows, timeFormat, timeZone]);
    const rawTableMinWidth = useMemo(
        () => Object.values(rawColumnWidths).reduce((total, width) => total + width, 0),
        [rawColumnWidths]
    );
    const rawNameColors = useMemo(() => buildRawRowNameColors(result.rows), [result.rows]);
    // One colour per tag for every panel. Taken from the "default" group — it always holds all
    // selected tags — so splitting a tag into its own chart keeps the colour it had in the main
    // one instead of restarting the palette. Falls back to the raw row order before any chart
    // result exists, which is the same ordering.
    const seriesColors = useMemo(() => {
        const mainSeries = chartResults.default?.series;
        if (!Array.isArray(mainSeries) || mainSeries.length === 0) return rawNameColors;
        return buildSeriesColorMap(mainSeries.map((item) => item?.name));
    }, [chartResults, rawNameColors]);
    // Only the rows in view are mounted: selecting N tags fetches N * rowsPerTag rows, so a plain
    // render grows with every tag added. Rows are a fixed 25px (.data-viewer-raw-table td), so the
    // size never has to be measured. Spacer rows above and below stand in for the rest.
    const rowVirtualizer = useVirtualizer({
        count: result.rows.length,
        getScrollElement: () => rawScrollRef.current,
        estimateSize: () => RAW_ROW_HEIGHT,
        overscan: 16,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const rawTableBody = useMemo(() => {
        const first = virtualRows[0];
        const last = virtualRows[virtualRows.length - 1];
        const padTop = first ? first.start : 0;
        const padBottom = last ? rowVirtualizer.getTotalSize() - last.end : 0;
        return (
            <tbody>
                {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
                {virtualRows.map((virtualRow) => {
                    const row = result.rows[virtualRow.index];
                    if (!row) return null;
                    return (
                        <tr key={virtualRow.key}>
                            {rawColumns.map((column) => {
                                const value = column.key === "time"
                                    ? formatDataViewerTime(row[column.key], timeFormat, timeZone)
                                    : String(row[column.key] ?? "");
                                if (column.key === "name") {
                                    return (
                                        <td key={column.key} className="mono raw-name" style={{ "--raw-dot": rawNameColors[value] }}>
                                            {value}
                                        </td>
                                    );
                                }
                                return (
                                    <td key={column.key} className={`mono${column.key === "value" ? " is-numeric" : ""}`}>
                                        {value}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
                {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
            </tbody>
        );
    }, [rawColumns, rawNameColors, result.rows, rowVirtualizer, timeFormat, timeZone, virtualRows]);

    if (!collector) {
        return (
            <div className="empty-state flex flex-col items-center justify-center h-full">
                <Icon name="query_stats" className="icon-lg opacity-30 mb-12" />
                <p className="text-md font-medium text-on-surface-tertiary">Select a job from the sidebar</p>
            </div>
        );
    }

    // The dashboard disables the entry button, but the route can still be reached by URL.
    if (jsonValueColumn) {
        return (
            <div className="empty-state flex flex-col items-center justify-center h-full">
                <Icon name="data_object" className="icon-lg opacity-30 mb-12" />
                <p className="text-md font-medium text-on-surface-tertiary">{JSON_VALUE_COLUMN_BLOCK_REASON}</p>
                <p className="text-sm text-on-surface-tertiary mt-8">{`${dbTable} · ${valueColumn}`}</p>
            </div>
        );
    }

    // The button keeps showing what the user chose (now-1h, last-5m, ...); the absolute window
    // those expressions were pinned to is shown underneath, since that is what queries and
    // pagination actually run against.
    const timeRangeButtonText = formatTimeRangeLabel(activeRange.from, activeRange.to, timeZone);
    const pinnedRangeText = pinnedRange ? formatTimeRangeLabel(pinnedRange.from, pinnedRange.to, timeZone) : "";
    const timeFormatButtonText = `${getTimeFormatLabel(timeFormat)} / ${getTimeZoneLabel(timeZone)}`;
    const headerLabels = buildDataViewerHeaderLabels(collector.id, dbTable);
    const resultHeading = getResultHeading(mode);
    const handleScanDirectionChange = (nextBackwardScan) => {
        rowsRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setBackwardScan(nextBackwardScan);
        setRawPageBounds(null);
        setRawPageRequest({ page: 1 });
        setResultPage(1);
    };
    const handleRangeApply = async (next) => {
        if (rangeEditor?.type === "split" && rangeEditor.groupId) {
            const group = chartGroups.find((chartGroup) => chartGroup.id === rangeEditor.groupId);
            if (!group) {
                setRangeEditor(null);
                return;
            }
            const currentRange = splitChartRanges[rangeEditor.groupId] || { from: "", to: "" };
            const rangeChanged = currentRange.from !== next.from || currentRange.to !== next.to;
            let nextRows = null;
            let nextResolvedRange = null;
            if (rangeChanged && canQuery) {
                const splitRequestId = splitRangeRequestRef.current + 1;
                splitRangeRequestRef.current = splitRequestId;
                setChartError("");
                try {
                    const { from: queryFrom, to: queryTo } = await resolveRangeForTagNames(next, group.tagNames);
                    if (splitRangeRequestRef.current !== splitRequestId) return;
                    if (queryFrom === null || queryTo === null) {
                        setChartError("Please check the entered time.");
                        return;
                    }
                    if (queryFrom && queryTo && new Date(queryFrom).getTime() > new Date(queryTo).getTime()) {
                        setChartError("From should be earlier than To.");
                        return;
                    }
                    const data = await queryTagData({
                        server: dbServer,
                        table: dbTable,
                        names: group.tagNames,
                        valueColumn,
                        stringValueColumn,
                        direction: backwardScan ? "latest" : "oldest",
                        from: queryFrom,
                        to: queryTo,
                        pageSize: getDataViewerRawPageSize(group.tagNames, rawRowsPerTag),
                        boundedRange: true,
                    });
                    if (splitRangeRequestRef.current !== splitRequestId) return;
                    nextRows = data?.rows || [];
                    nextResolvedRange = { from: queryFrom, to: queryTo };
                } catch (e) {
                    if (splitRangeRequestRef.current !== splitRequestId) return;
                    const message = e.reason || e.message || "Failed to update chart range";
                    setChartError(message);
                    notify(message, "error");
                    return;
                }
            }
            if (rangeChanged) {
                chartRequestRef.current += 1;
                setChartViewRanges((current) => {
                    if (!Object.prototype.hasOwnProperty.call(current, rangeEditor.groupId)) return current;
                    const { [rangeEditor.groupId]: _removed, ...rest } = current;
                    return rest;
                });
                setChartNavigatorRanges((current) => {
                    if (!Object.prototype.hasOwnProperty.call(current, rangeEditor.groupId)) return current;
                    const { [rangeEditor.groupId]: _removed, ...rest } = current;
                    return rest;
                });
            }
            setSplitChartRanges((current) => ({
                ...current,
                [rangeEditor.groupId]: next,
            }));
            if (nextRows) {
                chartRequestRef.current += 1;
                if (nextResolvedRange) {
                    setResolvedSplitChartRanges((current) => ({
                        ...current,
                        [rangeEditor.groupId]: nextResolvedRange,
                    }));
                }
                setSplitChartRows((current) => ({
                    ...current,
                    [rangeEditor.groupId]: nextRows,
                }));
            }
        } else {
            chartRequestRef.current += 1;
            setChartViewRanges({});
            setChartNavigatorRanges({});
            rowsRequestRef.current += 1;
            endPageRequestRef.current += 1;
            setRange(next);
            setRawPageBounds(null);
            setRawPageRequest({ page: 1 });
            setResultPage(1);
        }
        setRangeEditor(null);
    };
    // Re-pin the query window against the current time (now) / the latest data time (last).
    // A window given as absolute times resolves to the same values, so this effectively just re-queries.
    const handleRefreshRange = async () => {
        chartRequestRef.current += 1;
        rowsRequestRef.current += 1;
        endPageRequestRef.current += 1;
        setChartViewRanges({});
        setChartNavigatorRanges({});
        setRawPageBounds(null);
        setRawPageRequest({ page: 1 });
        setResultPage(1);
        setRangeRefreshToken((token) => token + 1);

        if (!canQuery) return;
        const splitRequestId = splitRangeRequestRef.current + 1;
        splitRangeRequestRef.current = splitRequestId;
        // Split charts hold their own pinned windows, so re-pin them against the same instant.
        for (const group of splitChartGroups) {
            const groupRange = splitChartRanges[group.id];
            if (!groupRange) continue;
            try {
                const { from: queryFrom, to: queryTo } = await resolveRangeForTagNames(groupRange, group.tagNames);
                if (splitRangeRequestRef.current !== splitRequestId) return;
                if (!queryFrom || !queryTo) continue;
                const data = await queryTagData({
                    server: dbServer,
                    table: dbTable,
                    names: group.tagNames,
                    valueColumn,
                    stringValueColumn,
                    direction: backwardScan ? "latest" : "oldest",
                    from: queryFrom,
                    to: queryTo,
                    pageSize: getDataViewerRawPageSize(group.tagNames, rawRowsPerTag),
                    boundedRange: true,
                });
                if (splitRangeRequestRef.current !== splitRequestId) return;
                setResolvedSplitChartRanges((current) => ({
                    ...current,
                    [group.id]: { from: queryFrom, to: queryTo },
                }));
                setSplitChartRows((current) => ({
                    ...current,
                    [group.id]: data?.rows || [],
                }));
            } catch (e) {
                if (splitRangeRequestRef.current !== splitRequestId) return;
                const message = e.reason || e.message || "Failed to refresh chart range";
                setChartError(message);
                notify(message, "error");
                return;
            }
        }
    };
    const handleEndPage = async () => {
        if (!canQuery || endLoading || pinnedRange?.key !== pinKey) return;
        const requestId = endPageRequestRef.current + 1;
        endPageRequestRef.current = requestId;
        setEndLoading(true);
        setError("");
        try {
            const { from: queryFrom, to: queryTo } = pinnedRange;
            if (!queryFrom || !queryTo) {
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
                pageSize: rawPageSize,
            });
            if (endPageRequestRef.current !== requestId) return;
            const lastPage = Number(data?.lastPage || 1);
            const nextPage = Number.isFinite(lastPage) ? Math.max(1, Math.floor(lastPage)) : 1;
            const request = buildDataViewerRawPageRequest({
                currentPage: resultPage,
                nextPage,
                pageSize: rawPageSize,
                currentBounds: rawPageBounds,
                reason: "page",
            });
            setRawPageRequest(request);
            setResultPage(request.page);
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
    const handleSetGlobalTime = async (groupId) => {
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
        endPageRequestRef.current += 1;
        chartRequestRef.current += 1;
        const splitRequestId = splitRangeRequestRef.current + 1;
        splitRangeRequestRef.current = splitRequestId;
        setRange(update.range);
        setRawPageBounds(null);
        setRawPageRequest({ page: 1 });
        setResultPage(1);
        setChartViewRanges(update.viewRanges);
        setChartNavigatorRanges(update.navigatorRanges);
        setSplitChartRanges(update.splitRanges);
        setResolvedSplitChartRanges(update.splitRanges);
        const splitGroupsToFetch = chartGroups.filter((group) => group.id !== "default" && update.splitRanges[group.id]);
        setSplitChartRows(Object.fromEntries(splitGroupsToFetch.map((group) => [group.id, []])));

        if (!canQuery || splitGroupsToFetch.length === 0) return;

        try {
            const nextEntries = await Promise.all(splitGroupsToFetch.map(async (group) => {
                const groupRange = update.splitRanges[group.id];
                const data = await queryTagData({
                    server: dbServer,
                    table: dbTable,
                    names: group.tagNames,
                    valueColumn,
                    stringValueColumn,
                    direction: backwardScan ? "latest" : "oldest",
                    from: groupRange.from,
                    to: groupRange.to,
                    pageSize: getDataViewerRawPageSize(group.tagNames, rawRowsPerTag),
                    boundedRange: true,
                });
                return [group.id, data?.rows || []];
            }));
            if (splitRangeRequestRef.current !== splitRequestId) return;
            chartRequestRef.current += 1;
            setSplitChartRows(Object.fromEntries(nextEntries));
        } catch (e) {
            if (splitRangeRequestRef.current !== splitRequestId) return;
            const message = e.reason || e.message || "Failed to set global time";
            setChartError(message);
            notify(message, "error");
        }
    };
    const handleShiftMainRange = async (group, direction, currentRange, navigatorRange) => {
        if (!canQuery) return;
        if (group.id === "default") {
            const update = buildDataViewerDefaultChartShiftRawPageUpdate({
                direction,
                backwardScan,
                currentPage: resultPage,
                pageSize: rawPageSize,
                rowCount: result.rows.length,
                forceNextPage: Boolean(rawPageRequest?.boundedRange),
                currentBounds: rawPageBounds,
            });
            if (!update) {
                return;
            }
            rowsRequestRef.current += 1;
            setChartError("");
            setChartViewRanges((current) => {
                const { default: _defaultRange, ...next } = current;
                return next;
            });
            setChartNavigatorRanges((current) => {
                const { default: _defaultRange, ...next } = current;
                return next;
            });
            setRawPageRequest(update.rawPageRequest);
            setResultPage(update.page);
            return;
        }

        const update = buildDataViewerShiftMainRangeUpdate({ direction, currentRange, navigatorRange });
        if (!update) {
            return;
        }

        chartRequestRef.current += 1;
        const splitRequestId = splitRangeRequestRef.current + 1;
        splitRangeRequestRef.current = splitRequestId;
        setChartError("");
        setChartViewRanges((current) => ({
            ...current,
            [group.id]: update.range,
        }));
        setChartNavigatorRanges((current) => ({
            ...current,
            [group.id]: update.navigatorRange,
        }));

        setSplitChartRanges((current) => ({
            ...current,
            [group.id]: update.navigatorRange,
        }));
        setResolvedSplitChartRanges((current) => ({
            ...current,
            [group.id]: update.navigatorRange,
        }));

        try {
            const data = await queryTagData({
                server: dbServer,
                table: dbTable,
                names: group.tagNames,
                valueColumn,
                stringValueColumn,
                direction: backwardScan ? "latest" : "oldest",
                from: update.navigatorRange.from,
                to: update.navigatorRange.to,
                pageSize: getDataViewerRawPageSize(group.tagNames, rawRowsPerTag),
                boundedRange: true,
            });
            if (splitRangeRequestRef.current !== splitRequestId) return;
            const nextRows = data?.rows || [];
            chartRequestRef.current += 1;
            setSplitChartRows((current) => ({
                ...current,
                [group.id]: nextRows,
            }));
        } catch (e) {
            if (splitRangeRequestRef.current !== splitRequestId) return;
            const message = e.reason || e.message || "Failed to move chart range";
            setChartError(message);
            notify(message, "error");
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
                                            // The whole row toggles, not just the chevron — the label is
                                            // the bigger target and reads as part of the same control.
                                            <button
                                                key={row.key}
                                                type="button"
                                                className="node-tree-row node-tree-row-folder"
                                                style={{ "--tree-indent": `${row.depth * 16}px` }}
                                                onClick={() => toggleTagFolder(row.key)}
                                                aria-expanded={!collapsed}
                                                aria-label={`${row.label} ${collapsed ? "expand" : "collapse"}`}
                                            >
                                                <span className="node-tree-toggle">
                                                    <Icon name={collapsed ? "chevron_right" : "expand_more"} className="icon-sm" />
                                                </span>
                                                <span className="node-tree-label truncate">{row.label}</span>
                                            </button>
                                        );
                                    }
                                    const checked = selectedTagNames.includes(row.tag.name);
                                    return (
                                        <label
                                            key={row.key}
                                            className={`data-viewer-tag-row ${checked ? "is-active" : ""}`}
                                            style={{ "--tree-indent": `${row.depth * 16}px` }}
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
                                            {row.derived && <span className="badge badge-primary badge-xs shrink-0">derived</span>}
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
                                    {showsDataViewerTimeControls(mode) && (
                                        <div className="data-viewer-pinned-block">
                                            <button
                                                type="button"
                                                aria-label="Refresh time range"
                                                title="Re-pin the time range and reload"
                                                className="btn btn-ghost btn-icon"
                                                disabled={loading || endLoading}
                                                onClick={handleRefreshRange}
                                            >
                                                <Icon name="refresh" className="icon-sm" />
                                            </button>
                                            {pinnedRangeText && (
                                                <div className="data-viewer-pinned-range" title={pinnedRangeText}>
                                                    {pinnedRangeText}
                                                </div>
                                            )}
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
                                            <button type="button" role="tab" aria-selected={mode === "raw"} className={`data-viewer-segmented-item ${mode === "raw" ? "is-active" : ""}`} onClick={() => handleModeChange("raw")}>
                                                Raw
                                            </button>
                                            <button type="button" role="tab" aria-selected={mode === "chart"} className={`data-viewer-segmented-item ${mode === "chart" ? "is-active" : ""}`} onClick={() => handleModeChange("chart")}>
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
                                    <div className="table-card-body" ref={rawScrollRef}>
                                        <table className="table-clean data-viewer-raw-table" style={{ minWidth: rawTableMinWidth }}>
                                            <colgroup>
                                                {rawColumns.map((column) => (
                                                    <col key={column.key} style={{ width: rawColumnWidths[column.key] }} />
                                                ))}
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    {rawColumns.map((column) => (
                                                        <th key={column.key} className={column.key === "value" ? "is-numeric" : undefined}>
                                                            {column.label}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            {rawTableBody}
                                        </table>
                                        {loading && <div className="empty-state">Loading...</div>}
                                        {!loading && result.rows.length === 0 && <div className="empty-state">No data</div>}
                                    </div>
                                    <ResultPagination page={resultPage} pageSize={rawPageSize} rowCount={result.rows.length} loading={loading} endLoading={endLoading} forceNextPage={Boolean(rawPageRequest?.boundedRange)} rowsPerTag={rawRowsPerTag} onRowsPerTagChange={handleRowsPerTagChange} onPage={moveRawPage} onEndPage={handleEndPage} />
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
                                        const chartMenuOpen = openChartMenuId === group.id;
                                        return (
                                            <div
                                                key={group.id}
                                                className={`table-card data-viewer-chart-card ${group.split ? "is-split" : "is-main"}`}
                                                style={group.split ? { "--split-accent": seriesColors[group.tagNames[0]] } : undefined}
                                            >
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
                                                            {group.tagNames.map((tagName) => {
                                                                const splitGroup = splitChartGroups.find((item) => (item.tagNames || []).includes(tagName));
                                                                const split = Boolean(splitGroup);
                                                                return (
                                                                    <button
                                                                        key={tagName}
                                                                        type="button"
                                                                        className={`data-viewer-chart-tag-chip${split ? " is-split" : ""}`}
                                                                        title={split ? `Remove split ${tagName}` : `Split ${tagName}`}
                                                                        onClick={() => handleToggleSplitChart(tagName)}
                                                                    >
                                                                        <span className="truncate">{tagName}</span>
                                                                        <Icon name={split ? "close" : "call_split"} className="icon-sm" />
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <div className="data-viewer-chart-panel-actions">
                                                        <div className="data-viewer-chart-action-menu">
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-ghost btn-icon data-viewer-chart-menu-button"
                                                                title="Chart actions"
                                                                aria-label="Chart actions"
                                                                aria-haspopup="menu"
                                                                aria-expanded={chartMenuOpen}
                                                                onClick={() => setOpenChartMenuId((current) => (current === group.id ? null : group.id))}
                                                            >
                                                                <Icon name="more_vert" className="icon-sm" />
                                                            </button>
                                                            {chartMenuOpen && (
                                                                <div className="data-viewer-chart-menu" role="menu">
                                                                    <button
                                                                        type="button"
                                                                        className="data-viewer-chart-menu-item"
                                                                        role="menuitem"
                                                                        onClick={() => {
                                                                            setOpenChartMenuId(null);
                                                                            handleOpenTagAnalyzer(group, chartData);
                                                                        }}
                                                                    >
                                                                        <Icon name="monitoring" className="icon-sm" />
                                                                        <span>Tag Analyzer</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="data-viewer-chart-menu-item"
                                                                        role="menuitem"
                                                                        disabled={!globalTimeUpdate}
                                                                        onClick={() => {
                                                                            setOpenChartMenuId(null);
                                                                            handleSetGlobalTime(group.id);
                                                                        }}
                                                                    >
                                                                        <Icon name="schedule" className="icon-sm" />
                                                                        <span>Global Time</span>
                                                                    </button>
                                                                    {group.split && (
                                                                        <button
                                                                            type="button"
                                                                            className="data-viewer-chart-menu-item"
                                                                            role="menuitem"
                                                                            onClick={() => {
                                                                                setOpenChartMenuId(null);
                                                                                setRangeEditor({ type: "split", groupId: group.id });
                                                                            }}
                                                                        >
                                                                            <Icon name="calendar_month" className="icon-sm" />
                                                                            <span>Time Range</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {group.split && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-ghost btn-icon data-viewer-chart-close-button"
                                                                title="Remove split chart"
                                                                aria-label="Remove split chart"
                                                                onClick={() => handleRemoveSplitChart(group.id)}
                                                            >
                                                                <Icon name="close" className="icon-sm" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="table-card-body">
                                                    <TagEChart
                                                        series={chartData.series}
                                                        seriesColors={seriesColors}
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
                                                        onShiftMainRange={(direction, currentRange, navigatorRange) => handleShiftMainRange(group, direction, currentRange, navigatorRange)}
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
                    range={rangeEditorRange}
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
