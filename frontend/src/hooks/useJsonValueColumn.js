import { useState, useEffect } from "react";
import * as serversApi from "../api/servers";
import { isJsonValueColumn } from "../pages/dataViewerModel";

/**
 * Reports whether the collector's value column is a JSON column.
 *
 * The collector config only stores the column NAME, so the type has to come from the table
 * schema. Used to flag the time-policy conflict on the dashboard: a JSON value column merges
 * every node into one row per cycle, so it can only carry requestTime, and nothing on the
 * backend rejects a config that says otherwise.
 *
 * `checked` stays false until the lookup settles, so callers can avoid flashing a verdict
 * before the answer is known. A failed lookup reports not-JSON, since warning on an unrelated
 * failure would be worse than staying quiet.
 *
 * @param {{ server?: string, table?: string, valueColumn?: string }} params
 * @returns {{ isJson: boolean, checked: boolean }}
 */
export default function useJsonValueColumn({ server, table, valueColumn }) {
    const [isJson, setIsJson] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!server || !table || !valueColumn) {
            setIsJson(false);
            setChecked(Boolean(server && table));
            return undefined;
        }

        let cancelled = false;
        setChecked(false);
        (async () => {
            try {
                const data = await serversApi.listColumns(server, table);
                if (cancelled) return;
                setIsJson(isJsonValueColumn(data?.columns, valueColumn));
            } catch {
                if (!cancelled) setIsJson(false);
            } finally {
                if (!cancelled) setChecked(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [server, table, valueColumn]);

    return { isJson, checked };
}
