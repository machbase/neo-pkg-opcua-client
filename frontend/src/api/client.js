class ApiError extends Error {
    constructor(status, reason) {
        super(reason);
        this.status = status;
        this.reason = reason;
    }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/public/neo-pkg-opcua-client";

async function request(method, path, body) {
    const opts = {
        method,
        headers: {
            "Content-Type": "application/json",
        },
    };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(API_BASE + path, opts);

    if (res.status === 204) return null;

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new ApiError(res.status, `Server returned non-JSON response (${res.status})`);
    }
    if (!json.ok) throw new ApiError(res.status, json.reason || 'Unknown error');
    return json.data;
}

export { request, ApiError };
