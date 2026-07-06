import { useCallback, useEffect, useState } from "react";
import * as opcuaServersApi from "../api/opcuaServers";
import { useApp } from "../context/AppContext";

export default function useOpcuaServers() {
    const [opcuaServers, setOpcuaServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const { notify } = useApp();

    const fetchOpcuaServers = useCallback(async () => {
        try {
            const data = await opcuaServersApi.listOpcuaServers();
            setOpcuaServers(data || []);
        } catch (e) {
            notify(e.reason || e.message, "error");
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        fetchOpcuaServers();
    }, [fetchOpcuaServers]);

    const addOpcuaServer = useCallback(
        async (data) => {
            try {
                await opcuaServersApi.createOpcuaServer(data);
                notify(`OPC UA server '${data.name}' created`, "success");
                await fetchOpcuaServers();
            } catch (e) {
                notify(e.reason || e.message, "error");
                throw e;
            }
        },
        [fetchOpcuaServers, notify]
    );

    const editOpcuaServer = useCallback(
        async (name, data) => {
            try {
                await opcuaServersApi.updateOpcuaServer(name, data);
                notify(`OPC UA server '${name}' updated`, "success");
                await fetchOpcuaServers();
            } catch (e) {
                notify(e.reason || e.message, "error");
                throw e;
            }
        },
        [fetchOpcuaServers, notify]
    );

    const removeOpcuaServer = useCallback(
        async (name) => {
            try {
                await opcuaServersApi.deleteOpcuaServer(name);
                notify(`OPC UA server '${name}' deleted`, "success");
                await fetchOpcuaServers();
            } catch (e) {
                notify(e.reason || e.message, "error");
                throw e;
            }
        },
        [fetchOpcuaServers, notify]
    );

    const healthCheck = useCallback(
        async (name, readRetryInterval) => opcuaServersApi.checkOpcuaConnection({ server: name }, readRetryInterval),
        []
    );

    const formHealthCheck = useCallback(
        async (form, readRetryInterval) => opcuaServersApi.checkOpcuaFormConnection(form, readRetryInterval),
        []
    );

    const generateSelfSignedCertificate = useCallback(
        async (form) => {
            try {
                const certificate = await opcuaServersApi.generateOpcuaSelfSignedCertificate(form);
                notify("Certificate generated", "success");
                return certificate;
            } catch (e) {
                notify(e.reason || e.message, "error");
                throw e;
            }
        },
        [notify]
    );

    return {
        opcuaServers,
        loading,
        addOpcuaServer,
        editOpcuaServer,
        removeOpcuaServer,
        healthCheck,
        formHealthCheck,
        generateSelfSignedCertificate,
        refreshOpcuaServers: fetchOpcuaServers,
    };
}
