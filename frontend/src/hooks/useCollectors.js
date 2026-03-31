import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../api/collectors";
import { useApp } from "../context/AppContext";

export default function useCollectors() {
    const [collectors, setCollectors] = useState([]);
    const [loading, setLoading] = useState(true);
    const { notify } = useApp();
    const intervalRef = useRef(null);
    const lastErrorRef = useRef(null);

    const fetchCollectors = useCallback(async () => {
        try {
            const data = await api.listCollectors();
            setCollectors(data);
            lastErrorRef.current = null;
        } catch (e) {
            const msg = e.reason || e.message;
            if (lastErrorRef.current !== msg) {
                lastErrorRef.current = msg;
                notify(msg, "error");
            }
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        fetchCollectors();
        intervalRef.current = setInterval(fetchCollectors, 5000);
        return () => clearInterval(intervalRef.current);
    }, [fetchCollectors]);

    const toggleCollector = useCallback(
        async (collector) => {
            try {
                if (collector.status === "running") {
                    await api.stopCollector(collector.id);
                    notify(`Collector '${collector.id}' stopped`, "success");
                } else {
                    await api.startCollector(collector.id);
                    notify(`Collector '${collector.id}' started`, "success");
                }
                await fetchCollectors();
            } catch (e) {
                notify(e.reason || e.message, "error");
            }
        },
        [fetchCollectors, notify]
    );

    const removeCollector = useCallback(
        async (id) => {
            try {
                await api.deleteCollector(id);
                notify(`Collector '${id}' deleted`, "success");
                await fetchCollectors();
            } catch (e) {
                notify(e.reason || e.message, "error");
            }
        },
        [fetchCollectors, notify]
    );

    return { collectors, loading, toggleCollector, removeCollector, refreshCollectors: fetchCollectors };
}
