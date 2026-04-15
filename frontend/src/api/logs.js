import { request } from "./client";

export const listLogFiles = async () => {
    const data = await request("GET", "/cgi-bin/api/log/list");
    return data?.files ?? [];
};

export const fetchLogContent = async (name) => {
    const params = new URLSearchParams({ name });
    return request("GET", `/cgi-bin/api/log/content/all?${params.toString()}`);
};
