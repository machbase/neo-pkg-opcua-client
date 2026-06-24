function getAccessToken() {
    try {
        return globalThis.localStorage?.getItem?.("accessToken") || "";
    } catch {
        return "";
    }
}

async function parseWebResponse(res) {
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`Web API returned non-JSON response (${res.status})`);
    }

    if (!res.ok || json.success === false) {
        throw new Error(json.reason || json.message || text || `Web API request failed (${res.status})`);
    }

    return json.data;
}

export async function webRequest(path) {
    const headers = {
        "Content-Type": "application/json",
    };
    const token = getAccessToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`/web${path}`, {
        method: "GET",
        headers,
    });

    return parseWebResponse(res);
}
