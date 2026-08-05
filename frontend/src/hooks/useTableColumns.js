import { useState, useEffect } from "react";
import * as serversApi from "../api/servers";

/**
 * Loads a TAG table's column list.
 *
 * The collector config only stores column NAMES, so anything that depends on the table schema
 * — whether the value column is JSON, which columns carry the PRIMARY KEY and BASETIME flags
 * — has to come from here.
 *
 * `checked` stays false until the lookup settles so callers can avoid acting on an empty
 * column list before the answer is known. A failed lookup reports no columns rather than an
 * error: callers treat that as "unknown" and fall back to their permissive default, and the
 * viewer surfaces the real failure on its own.
 *
 * @param {{ server?: string, table?: string }} params
 * @returns {{ columns: Array<{ name?: string, type?: string, primaryKey?: boolean, basetime?: boolean }>, checked: boolean }}
 */
export default function useTableColumns({ server, table }) {
    const [columns, setColumns] = useState([]);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!server || !table) {
            setColumns([]);
            setChecked(false);
            return undefined;
        }

        let cancelled = false;
        setChecked(false);
        (async () => {
            try {
                const data = await serversApi.listColumns(server, table);
                if (cancelled) return;
                setColumns(Array.isArray(data?.columns) ? data.columns : []);
            } catch {
                if (!cancelled) setColumns([]);
            } finally {
                if (!cancelled) setChecked(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [server, table]);

    return { columns, checked };
}
