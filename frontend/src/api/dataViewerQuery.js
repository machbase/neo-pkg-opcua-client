export function encodeDataViewerQuery(params) {
    return Object.entries(params)
        .flatMap(([key, value]) => {
            if (Array.isArray(value)) {
                return value
                    .map((item) => String(item ?? "").trim())
                    .filter(Boolean)
                    .map((item) => [key, item]);
            }
            return [[key, value]];
        })
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}
