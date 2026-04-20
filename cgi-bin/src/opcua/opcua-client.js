const opcua = require("opcua");

class OpcuaClient {
    /**
     * @param {string} endpoint - OPC UA 서버 주소 (예: opc.tcp://localhost:4840)
     * @param {number} readRetryInterval - 읽기 재시도 간격 (ms). 기본값 100
     */
    constructor(endpoint, readRetryInterval) {
        this.endpoint = endpoint;
        this.readRetryInterval = readRetryInterval || 100;
        this.client = null;
    }

    open() {
        if (this.client !== null) {
            return true;
        }
        try {
            this.client = new opcua.Client({
                endpoint: this.endpoint,
                readRetryInterval: this.readRetryInterval,
            });
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
    read(nodeIds) {
        if (this.client === null) {
            throw new Error("not connected");
        }
        return this.client.read({
            nodes: nodeIds,
            timestampsToReturn: opcua.TimestampsToReturn.Both,
        });
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
