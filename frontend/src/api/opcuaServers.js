import { request } from "./client.js";
import {
    buildOpcuaConnectionTarget,
    buildOpcuaDirectConnectionRequest,
    buildOpcuaServerPayload,
    mapOpcuaServerListItem,
} from "./opcuaServerModel.js";

export {
    buildOpcuaConnectionTarget,
    buildOpcuaDirectConnectionRequest,
    buildOpcuaServerPayload,
    mapOpcuaServerListItem,
};

const BASE = "/cgi-bin/api/opcua/server";

export const listOpcuaServers = async () => {
    const data = await request("GET", `${BASE}/list`);
    return (data || []).map(mapOpcuaServerListItem);
};

export const getOpcuaServer = async (name) => {
    const data = await request("GET", `${BASE}?name=${encodeURIComponent(name)}`);
    return mapOpcuaServerListItem(data);
};

export const createOpcuaServer = (form) => {
    const payload = buildOpcuaServerPayload(form);
    return request("POST", BASE, payload);
};

export const updateOpcuaServer = (name, form) => {
    const payload = buildOpcuaServerPayload({ ...form, name });
    const { name: _name, ...body } = payload;
    return request("PUT", `${BASE}?name=${encodeURIComponent(name)}`, body);
};

export const deleteOpcuaServer = (name) =>
    request("DELETE", `${BASE}?name=${encodeURIComponent(name)}`);

export const checkOpcuaConnection = (target, readRetryInterval) =>
    request("POST", "/cgi-bin/api/opcua/connect", {
        ...buildOpcuaConnectionTarget(target),
        readRetryInterval,
    });

export const checkOpcuaFormConnection = (form, readRetryInterval) =>
    request("POST", "/cgi-bin/api/opcua/connect", {
        ...buildOpcuaDirectConnectionRequest(form),
        readRetryInterval,
    });
