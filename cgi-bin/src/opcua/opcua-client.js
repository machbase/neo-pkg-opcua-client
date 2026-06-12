const opcua = require("opcua");
const path = require("path");
const process = require("process");

const DEFAULT_READ_BATCH_SIZE = 100;

function _asText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

function _enumValue(group, key, label) {
    if (!group || group[key] === undefined) {
        throw new Error(`${label} is invalid: ${key}`);
    }
    return group[key];
}

function _nativeFilePathSpec(filePath) {
    const text = _asText(filePath);
    if (!text || text[0] === "@") {
        return text;
    }
    if (text === "/work" || text.indexOf("/work/") === 0) {
        const exePath = process.argv && process.argv[0] ? String(process.argv[0]) : "";
        if (path.isAbsolute(exePath)) {
            const workDir = path.dirname(exePath);
            const rel = text === "/work" ? "" : text.slice("/work/".length);
            return "@" + path.join(workDir, rel);
        }
    }
    return text;
}

function _positiveInteger(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num) || Math.floor(num) !== num || num < 1) {
        return fallback;
    }
    return num;
}

class OpcuaClient {
    /**
     * @param {string|object} endpointOrConfig - OPC UA 서버 주소 또는 server profile config.
     * @param {number} readRetryInterval - 읽기 재시도 간격 (ms). 기본값 100
     */
    constructor(endpointOrConfig, readRetryInterval) {
        const config = endpointOrConfig && typeof endpointOrConfig === "object"
            ? endpointOrConfig
            : { endpoint: endpointOrConfig };
        this.endpoint = _asText(config.endpoint);
        this.security = config.security && typeof config.security === "object" ? { ...config.security } : { enabled: false };
        this.readRetryInterval = readRetryInterval || config.readRetryInterval || 100;
        this.readBatchSize = _positiveInteger(config.readBatchSize, DEFAULT_READ_BATCH_SIZE);
        this.client = null;
    }

    _clientOptions() {
        const options = {
            endpoint: this.endpoint,
            readRetryInterval: this.readRetryInterval,
        };
        const security = this.security || {};
        if (security.enabled !== true) {
            return options;
        }

        const securityPolicy = _asText(security.securityPolicy) || "None";
        const messageSecurityMode = _asText(security.messageSecurityMode) || "None";
        const authMode = _asText(security.authMode) || "Anonymous";

        options.securityPolicy = securityPolicy;
        options.messageSecurityMode = _enumValue(opcua.MessageSecurityMode, messageSecurityMode, "messageSecurityMode");
        options.authMode = _enumValue(opcua.AuthMode, authMode, "authMode");

        if (security.username !== undefined && security.username !== null) {
            options.username = String(security.username);
        }
        if (security.password !== undefined && security.password !== null) {
            options.password = String(security.password);
        }
        if (security.certificateFile) {
            options.certificateFile = _nativeFilePathSpec(security.certificateFile);
        }
        if (security.keyFile) {
            options.keyFile = _nativeFilePathSpec(security.keyFile);
        }
        return options;
    }

    open() {
        if (this.client !== null) {
            return true;
        }
        try {
            this.client = new opcua.Client(this._clientOptions());
            return true;
        } catch (e) {
            this.client = null;
            return false;
        }
    }

    /**
     * @param {string[]} nodeIds - 읽을 OPC UA 노드 ID 목록
     * @returns {ReadResult[]}
     * @throws {Error} 미연결 또는 읽기 실패 시
     */
    _readNodes(nodeIds) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.read({
            nodes: nodeIds,
            timestampsToReturn: opcua.TimestampsToReturn.Both,
        });
    }

    read(nodeIds) {
        if (!Array.isArray(nodeIds) || nodeIds.length <= this.readBatchSize) {
            return this._readNodes(nodeIds);
        }
        const results = [];
        for (let i = 0; i < nodeIds.length; i += this.readBatchSize) {
            const batch = nodeIds.slice(i, i + this.readBatchSize);
            const batchResults = this._readNodes(batch);
            for (const result of batchResults) {
                results.push(result);
            }
        }
        return results;
    }

    /**
     * @param {...{node: string, value: any}} writes - 쓸 노드와 값 목록
     * @returns {WriteResult}
     * @throws {Error} 미연결 또는 쓰기 실패 시
     */
    write(...writes) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.write(...writes);
    }

    /**
     * @param {object} request
     * @param {string} request.node - 자식 노드를 조회할 OPC UA 노드 ID
     * @param {number} [request.nodeClassMask] - 반환할 노드 클래스 비트마스크 (opcua.NodeClass)
     * @returns {ChildrenResult[]}
     * @throws {Error} 미연결 또는 조회 실패 시
     */
    children(request) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.children(request);
    }

    /**
     * @param {object} request
     * @param {string[]} request.nodes - 브라우즈할 OPC UA 노드 ID 목록
     * @param {number} [request.browseDirection] - 탐색 방향 (opcua.BrowseDirection). 기본값 Forward
     * @param {string} [request.referenceTypeId] - 따라갈 참조 타입 노드 ID (예: "ns=0;i=31")
     * @param {boolean} [request.includeSubtypes] - 하위 타입 포함 여부. 기본값 true
     * @param {number} [request.nodeClassMask] - 반환할 노드 클래스 비트마스크 (opcua.NodeClass)
     * @param {number} [request.resultMask] - 반환할 필드 비트마스크 (opcua.BrowseResultMask). 기본값 All
     * @param {number} [request.requestedMaxReferencesPerNode] - 노드당 최대 반환 참조 수. 0이면 무제한
     * @returns {BrowseResult[]}
     * @throws {Error} 미연결 또는 조회 실패 시
     */
    browse(request) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.browse(request);
    }

    /**
     * @param {object} request
     * @param {string[]} request.continuationPoints - 이전 browse/browseNext 결과의 continuationPoint 목록 (base64)
     * @param {boolean} [request.releaseContinuationPoints] - true면 서버 측 continuationPoint 해제. 기본값 false
     * @returns {BrowseResult[]}
     * @throws {Error} 미연결 또는 조회 실패 시
     */
    browseNext(request) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.browseNext(request);
    }

    /**
     * @param {object} request
     * @param {Array<{node: string, attributeId: number}>} request.requests - 조회할 노드/속성 목록
     * @returns {Array<{Status: number, Value: string}>}
     * @throws {Error} 미연결 또는 조회 실패 시
     */
    attributes(request) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.attributes(request);
    }

    close() {
        if (this.client !== null) {
            try {
                this.client.close();
            } catch (_) {}
            this.client = null;
        }
    }
}

module.exports = OpcuaClient;
