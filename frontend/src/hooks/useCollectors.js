import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../api/collectors";
import { useApp } from "../context/AppContext";

const SYNC_CHANNEL = "app:neo-opcua-collector:sync";

export default function useCollectors() {
    const [collectors, setCollectors] = useState([]);
    const [loading, setLoading] = useState(true);
    const { notify, setSelectedCollectorId } = useApp();
    const intervalRef = useRef(null);
    const lastErrorRef = useRef(null);
    const initialSelectedRef = useRef(false);
    const syncChannelRef = useRef(null);

    const fetchCollectors = useCallback(async () => {
        try {
            const data = await api.listCollectors();
            setCollectors(data);
            if (!initialSelectedRef.current && data.length > 0) {
                initialSelectedRef.current = true;
                setSelectedCollectorId(data[0].id);
            }
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
    }, [notify, setSelectedCollectorId]);

    const broadcastRefresh = useCallback(() => {
        syncChannelRef.current?.postMessage({ type: "refreshCollectors" });
    }, []);

    const refreshCollectors = useCallback(async () => {
        await fetchCollectors();
        broadcastRefresh();
    }, [fetchCollectors, broadcastRefresh]);

    useEffect(() => {
        const ch = new BroadcastChannel(SYNC_CHANNEL);
        syncChannelRef.current = ch;

        ch.onmessage = (e) => {
            if (e.data?.type === "refreshCollectors") {
                fetchCollectors();
            }
        };

        return () => ch.close();
    }, [fetchCollectors]);

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
                broadcastRefresh();
            } catch (e) {
                notify(e.reason || e.message, "error");
            }
        },
        [fetchCollectors, broadcastRefresh, notify]
    );

    const removeCollector = useCallback(
        async (id) => {
            try {
                await api.deleteCollector(id);
                notify(`Collector '${id}' deleted`, "success");
                await fetchCollectors();
                broadcastRefresh();
            } catch (e) {
                notify(e.reason || e.message, "error");
            }
        },
        [fetchCollectors, broadcastRefresh, notify]
    );

    const installCollector = useCallback(
        async (collector) => {
            try {
                await api.installCollector(collector.id);
                notify(`Collector '${collector.id}' installed`, "success");
                await fetchCollectors();
                broadcastRefresh();
            } catch (e) {
                notify(e.reason || e.message, "error");
            }
        },
        [fetchCollectors, broadcastRefresh, notify]
    );

    return { collectors, loading, toggleCollector, installCollector, removeCollector, refreshCollectors };
}
