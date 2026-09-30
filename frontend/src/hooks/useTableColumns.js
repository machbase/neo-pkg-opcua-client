import { useState, useEffect, useCallback } from "react";
import * as serversApi from "../api/servers";

/**
 * Loads a TAG table's column list.
 *
 * The collector config only stores column NAMES, so anything that depends on the table schema
 * — whether the value column is JSON, which columns carry the PRIMARY KEY and BASETIME flags
 * — has to come from here.
 *
 * `checked` stays false until the lookup settles. A failed lookup remains an error,
 * because an empty column list cannot establish whether VALUE is JSON.
 *
 * @param {{ server?: string, table?: string }} params
 * @returns {{ columns: Array<{ name?: string, type?: string, primaryKey?: boolean, basetime?: boolean }>, checked: boolean, error: string, retry: function }}
 */
export default function useTableColumns({ server, table }) {
    const [lookup, setLookup] = useState({ server: "", table: "", columns: [], checked: false, error: "" });
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
        setLookup((current) => ({ ...current, columns: [], checked: false, error: "" }));
        setAttempt((current) => current + 1);
    }, []);

    useEffect(() => {
        if (!server || !table) {
            setLookup({ server, table, columns: [], checked: false, error: "" });
            return undefined;
        }

        let cancelled = false;
        setLookup({ server, table, columns: [], checked: false, error: "" });
        (async () => {
            try {
                const data = await serversApi.listColumns(server, table);
                if (cancelled) return;
                if (!Array.isArray(data?.columns)) throw new Error("Invalid table column response");
                setLookup({ server, table, columns: data.columns, checked: true, error: "" });
            } catch (reason) {
                if (!cancelled) setLookup({ server, table, columns: [], checked: true,
                    error: reason?.reason || reason?.message || "Failed to load table columns" });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [server, table, attempt]);

    if (lookup.server !== server || lookup.table !== table) {
        return { columns: [], checked: false, error: "", retry };
    }
    return { columns: lookup.columns, checked: lookup.checked, error: lookup.error, retry };
}
