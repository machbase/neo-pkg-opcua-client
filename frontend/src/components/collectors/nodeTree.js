const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function normalizeNodeTree(nodeTree) {
    if (!nodeTree || typeof nodeTree !== "object" || Array.isArray(nodeTree)) {
        return null;
    }
    return nodeTree;
}

export function normalizeCollectorNode(node) {
    return {
        ...(node || {}),
        nodeTree: normalizeNodeTree(node?.nodeTree),
    };
}

export function normalizeCollectorNodes(nodes) {
    return Array.isArray(nodes) ? nodes.map(normalizeCollectorNode) : [];
}

export function nodeTreeKey(value, fallback = "node") {
    const raw = value === undefined || value === null ? "" : String(value).trim();
    const key = raw || String(fallback || "node");
    return DANGEROUS_KEYS.has(key) ? `_${key}` : key;
}

export function nodeTreeRootLabel(rootNodeId, defaultRootNodeId = "ns=0;i=85") {
    const root = rootNodeId === undefined || rootNodeId === null ? "" : String(rootNodeId).trim();
    if (!root || root === defaultRootNodeId) {
        return "Objects";
    }
    return root;
}

export function buildNodeTree({ rootNodeId, pathLabels, node, defaultRootNodeId = "ns=0;i=85" }) {
    const target = node || {};
    const labels = Array.isArray(pathLabels) && pathLabels.length > 0
        ? pathLabels
        : [target.displayName || target.browseName || target.nodeId || "node"];
    const tree = {};
    const rootKey = nodeTreeKey(nodeTreeRootLabel(rootNodeId, defaultRootNodeId), rootNodeId);
    tree[rootKey] = {};

    let cursor = tree[rootKey];
    labels.forEach((label, idx) => {
        const isLeaf = idx === labels.length - 1;
        const key = nodeTreeKey(label, target.nodeId);
        if (isLeaf) {
            cursor[key] = {
                label: String(label || target.nodeId || ""),
                nodeId: target.nodeId || "",
                dataType: target.dataType || "",
            };
            return;
        }
        if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    });

    return tree;
}
