// Adapted from neo-web PR #737 (JSON value key exploration).
import { useEffect, useMemo, useState } from 'react';
import { VscArrowLeft, VscClose } from './JsonKeyIcons';
import { MuiTagAnalyzer } from './JsonKeyIcons';
import Modal from './JsonKeyModal';
import DataViewerModalPortal from './DataViewerModalPortal';
import useModalDialog from '../../hooks/useModalDialog';
import { queryTagJsonKeyData } from '../../api/dataViewer';
import { DEFAULT_TIME_FORMAT, DEFAULT_TIME_ZONE, PANEL_COLORS, toDataViewerDate, } from '../../pages/dataViewerModel';
import TagEChart from './TagEChart';
import { MAX_JSON_KEY_SERIES, shortJsonKeyNames } from './jsonKeyTree';
const PANEL_TAG_LIMIT = 12;
import { jsonKeyPathLabel } from '../../utils/jsonKeyCatalog.js';
import { jsonChartNumber } from '../../utils/jsonChartNumber.js';
const LONG_DECIMAL = /^-?\d+\.\d+$/;
const readableJsonValue = (value) => {
    const text = String(value);
    if (!LONG_DECIMAL.test(text))
        return text;
    if (text.replace(/[-.]/g, '').length < 16)
        return text;
    const round = String(Number(text));
    return round.length < text.length ? round : text;
};
const PAGE_SIZES = [25, 50, 100];
const baseAt = (value, baseKind) => baseKind === 'distance' ? Number(value) : (toDataViewerDate(value)?.getTime() ?? null);
export const JsonKeyDetailModal = ({ server, table, tagName, paths, from, to, tagColumn, timeColumn, valueColumn, baseKind = 'time', baseLabel = 'TIME', formatBase, timeFormat = DEFAULT_TIME_FORMAT, timeZone = DEFAULT_TIME_ZONE, onBack, onOpenTagAnalyzer, onClose, }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const [page, setPage] = useState(0);
    const closeOnOutside = onClose;
    const dialogRef = useModalDialog(`Key detail for ${tagName}`);
    const [zoomRange, setZoomRange] = useState(undefined);
    useEffect(() => setZoomRange(undefined), [from, to]);
    useEffect(() => {
        let alive = true;
        const abort = new AbortController();
        setLoading(true);
        setError('');
        queryTagJsonKeyData({
            server,
            table,
            tagName,
            paths,
            from,
            to,
            tagColumn,
            timeColumn,
            valueColumn,
            baseKind,
            signal: abort.signal,
        })
            .then((result) => {
            if (!alive)
                return;
            setRows(result.rows);
            setPage(0);
        })
            .catch((reason) => {
            if (!alive)
                return;
            setError(reason instanceof Error ? reason.message : 'Failed to load data');
            setRows([]);
        })
            .finally(() => {
            if (alive)
                setLoading(false);
        });
        return () => {
            alive = false;
            abort.abort();
        };
    }, [baseKind, server, from, paths, tagColumn, tagName, table, timeColumn, to, valueColumn]);
    const columnNames = useMemo(() => shortJsonKeyNames(paths).map((name, index) => name || valueColumn || paths[index]), [paths, valueColumn]);
    const { series, chartableCount, chartableIndexes } = useMemo(() => {
        const chartable = [];
        paths.forEach((_path, index) => {
            if (rows.some((row) => jsonChartNumber(row.values[index]) !== null))
                chartable.push(index);
        });
        const drawn = chartable.slice(0, MAX_JSON_KEY_SERIES);
        return {
            chartableIndexes: chartable,
            chartableCount: chartable.length,
            series: drawn.map((index) => ({
                index,
                name: columnNames[index] ?? paths[index],
                data: rows
                    .map((row) => [baseAt(row.base, baseKind), jsonChartNumber(row.values[index])])
                    .filter((point) => point[0] !== null && point[1] !== null)
                    .sort((left, right) => left[0] - right[0]),
            })),
        };
    }, [baseKind, columnNames, paths, rows]);
    const baseValues = useMemo(() => rows.map((row) => (formatBase ? formatBase(row.base) : String(row.base ?? ''))), [formatBase, rows]);
    const valueRows = useMemo(() => {
        const out = [];
        rows.forEach((row, rowIndex) => {
            paths.forEach((path, keyIndex) => {
                const value = row.values[keyIndex];
                if (value === null || value === undefined)
                    return;
                out.push({ base: baseValues[rowIndex], raw: row.base, name: columnNames[keyIndex] ?? path, path, value });
            });
        });
        return out;
    }, [baseValues, columnNames, paths, rows]);
    const seriesColorByPath = useMemo(() => {
        const colors = {};
        series.forEach((entry, slot) => {
            colors[paths[entry.index]] = PANEL_COLORS[slot % PANEL_COLORS.length];
        });
        return colors;
    }, [paths, series]);
    const pageCount = Math.max(1, Math.ceil(valueRows.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const firstRow = currentPage * pageSize;
    const pageRows = valueRows.slice(firstRow, firstRow + pageSize);
    const displayRange = useMemo(() => {
        if (zoomRange)
            return zoomRange;
        if (pageRows.length === 0)
            return undefined;
        const first = pageRows[0].raw;
        const last = pageRows[pageRows.length - 1].raw;
        if (String(first) === String(last)) {
            const before = valueRows[firstRow - 1]?.raw;
            const after = valueRows[firstRow + pageRows.length]?.raw;
            if (before !== undefined && String(before) !== String(first))
                return { from: before, to: last };
            if (after !== undefined && String(after) !== String(first))
                return { from: first, to: after };
            return undefined;
        }
        return { from: first, to: last };
    }, [firstRow, pageRows, valueRows, zoomRange]);
    const goToPage = (next) => {
        const target = Math.min(Math.max(next, 0), pageCount - 1);
        if (target === currentPage)
            return;
        setZoomRange(undefined);
        setPage(target);
    };
    const fullNames = useMemo(() => paths.map((path) => jsonKeyPathLabel(path) || valueColumn || path), [paths, valueColumn]);
    const title = paths.length > 1 ? `${fullNames[0]} +${paths.length - 1}` : fullNames[0] || tagName;
    const seriesLabel = chartableCount > series.length ? `${series.length} of ${chartableCount} series` : `${series.length} series`;
    const meta = [tagName, `${valueRows.length} rows`, seriesLabel, zoomRange ? 'zoomed' : ''].filter(Boolean).join(' · ');
    const windowLabel = useMemo(() => {
        const start = formatBase ? formatBase(from) : `${from ?? ''}`;
        const end = formatBase ? formatBase(to) : `${to ?? ''}`;
        const full = `${start} → ${end}`;
        const day = /^(\d{4}-\d{2}-\d{2}) /.exec(start);
        const sameDay = day && end.startsWith(day[1] + ' ');
        return { text: sameDay ? `${start} → ${end.slice(day[1].length + 1)}` : full, full };
    }, [formatBase, from, to]);
    const analyzableAll = chartableIndexes.map((index) => paths[index]);
    const analyzeWindow = displayRange ?? { from, to };
    const openTagAnalyzer = () => {
        if (analyzableAll.length > PANEL_TAG_LIMIT) {
            setError(`Tag Analyzer supports up to ${PANEL_TAG_LIMIT} keys. Reduce the selection and try again.`);
            return;
        }
        const handoffError = onOpenTagAnalyzer?.(analyzableAll, analyzeWindow);
        if (handoffError)
            setError(handoffError);
    };
    return (<DataViewerModalPortal>
            <Modal pIsDarkMode className="json-key-modal json-key-detail-modal" onOutSideClose={closeOnOutside}>
                <div ref={dialogRef} className="modal-header json-key-detail-head">
                    <div className="modal-header-title json-key-modal-title">
                        <span title={fullNames.join(', ')}>{title}</span>
                        <span className="json-key-modal-sub">{meta}</span>
                    </div>

                    <span className="json-key-detail-window" title={windowLabel.full}>
                        {windowLabel.text}
                    </span>
                    <div className="json-key-detail-head-actions">
                        {onOpenTagAnalyzer ? (<button type="button" className="json-key-detail-handoff" onClick={openTagAnalyzer} disabled={analyzableAll.length === 0} title={analyzableAll.length === 0
                ? 'Nothing numeric to analyze'
                : analyzableAll.length > PANEL_TAG_LIMIT
                    ? `Tag Analyzer supports up to ${PANEL_TAG_LIMIT} keys`
                    : 'Open in Tag Analyzer'} aria-label="Open in Tag Analyzer">
                                <MuiTagAnalyzer width={18} height={18}/>
                            </button>) : null}
                        <button type="button" className="btn-icon-sm" onClick={onClose} aria-label="Close">
                            <VscClose />
                        </button>
                    </div>
                </div>

                <div className="modal-body json-key-modal-body">
                    {error ? <div className="json-key-detail-error">{error}</div> : null}


                    <div className="json-key-detail-split">
                        <div className="json-key-detail-chart-col">

                            <div className="json-key-detail-chart">
                                <TagEChart series={series.map((entry) => ({ name: entry.name, data: entry.data }))} timeFormat={timeFormat} timeZone={timeZone} timeRange={{ from, to }} displayRange={displayRange} baseKind={baseKind} pending={loading} onDisplayRangeChange={(range) => setZoomRange(range)} onShiftMainRange={(direction) => goToPage(currentPage + (direction === 'forward' ? 1 : -1))}/>
                            </div>

                        </div>

                        <div className="json-key-detail-grid-col">
                            <div className="json-key-detail-grid">
                                {loading ? <div className="empty-state">Loading...</div> : null}
                                {!loading && valueRows.length === 0 && !error ? <div className="empty-state">No data in this range.</div> : null}
                                {!loading && valueRows.length > 0 ? (<table>
                                        <thead>
                                            <tr>
                                                <th>{baseLabel}</th>
                                                <th>KEY</th>
                                                <th className="is-numeric">VALUE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageRows.map((row, index) => (<tr key={`${firstRow + index}`}>
                                                    <td className="mono">{row.base}</td>
                                                    <td className="mono json-key-detail-name" style={{ '--raw-dot': seriesColorByPath[row.path] }} title={jsonKeyPathLabel(row.path) || valueColumn}>
                                                        {row.name}
                                                    </td>
                                                    <td className="mono is-numeric">{readableJsonValue(row.value)}</td>
                                                </tr>))}
                                        </tbody>
                                    </table>) : null}
                            </div>

                            <div className="json-key-detail-pager">
                                <span className="json-key-modal-count">
                                    {valueRows.length === 0
            ? '0 rows'
            : `${firstRow + 1}–${Math.min(firstRow + pageSize, valueRows.length)} of ${valueRows.length} rows`}
                                </span>
                                <div className="json-key-detail-pager-controls">
                                    <button type="button" className="json-key-detail-step" onClick={() => goToPage(0)} disabled={currentPage === 0} aria-label="First page">
                                        «
                                    </button>
                                    <button type="button" className="json-key-detail-step" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous page">
                                        ‹
                                    </button>
                                    <span className="json-key-detail-page">
                                        {currentPage + 1} / {pageCount}
                                    </span>
                                    <button type="button" className="json-key-detail-step" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next page">
                                        ›
                                    </button>
                                    <button type="button" className="json-key-detail-step" onClick={() => goToPage(pageCount - 1)} disabled={currentPage >= pageCount - 1} aria-label="Last page">
                                        »
                                    </button>
                                </div>
                                <div className="json-key-detail-sizes" role="group" aria-label="Rows per page">
                                    {PAGE_SIZES.map((size) => (<button key={size} type="button" className={`json-key-detail-chip${pageSize === size ? ' is-active' : ''}`} onClick={() => {
                setPageSize(size);
                setPage(0);
                setZoomRange(undefined);
            }} aria-pressed={pageSize === size}>
                                            {size}
                                        </button>))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer json-key-detail-foot">

                    <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
                        Close
                    </button>
                    {onBack ? (<button type="button" className="btn btn-sm btn-primary" onClick={onBack}>
                            <VscArrowLeft className="icon-sm"/> Back to keys
                        </button>) : null}
                </div>
            </Modal>
        </DataViewerModalPortal>);
};
export default JsonKeyDetailModal;
