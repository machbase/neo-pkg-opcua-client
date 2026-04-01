# OpcuaClient

`cgi-bin/src/opcua/opcua-client.js`

OPC UA 서버에 연결하여 노드 값을 읽고 쓰거나 노드 트리를 탐색하는 클라이언트입니다. 연결 관리와 에러 처리는 호출부에서 담당합니다.

## API

### `new OpcuaClient(endpoint, readRetryInterval)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `endpoint` | string | OPC UA 서버 주소 (예: `opc.tcp://localhost:4840`) |
| `readRetryInterval` | number | 읽기 재시도 간격 (ms). 기본값 `100` |

### `open()`

OPC UA 서버에 연결합니다. 이미 연결된 경우 아무것도 하지 않습니다.

**반환값:** 연결 성공(또는 이미 연결됨) 시 `true`, 실패 시 `false`. 예외를 던지지 않습니다.

### `read(nodeIds)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `nodeIds` | string[] | OPC UA 노드 ID 목록 |

**반환값:** `ReadResult[]`

**throws:** 미연결 시 `"not connected"`, 읽기 실패 시 원본 예외

#### ReadResult 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `value` | any | 읽은 값 |
| `type` | string | 값 타입 이름 (예: `Boolean`, `Int32`, `Double`) |
| `status` | number | OPC UA 상태 코드 (uint32) |
| `statusText` | string | 상태 텍스트 |
| `statusCode` | string | 상태 코드 이름 (예: `StatusGood`) |
| `sourceTimestamp` | number | 소스 타임스탬프 (Unix epoch ms). 없으면 `null` |
| `serverTimestamp` | number | 서버 타임스탬프 (Unix epoch ms) |

### `write(...writes)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `writes[].node` | string | 쓸 OPC UA 노드 ID |
| `writes[].value` | any | 쓸 값 |

**반환값:** `WriteResult`

**throws:** 미연결 시 `"not connected"`, 쓰기 실패 시 원본 예외

### `browse(request)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `request.nodes` | string[] | 브라우즈할 OPC UA 노드 ID 목록 |
| `request.browseDirection` | number | 탐색 방향 (`opcua.BrowseDirection`). 기본값 `Forward` |
| `request.referenceTypeId` | string | 따라갈 참조 타입 노드 ID (예: `"ns=0;i=31"`) |
| `request.includeSubtypes` | boolean | 하위 타입 포함 여부. 기본값 `true` |
| `request.nodeClassMask` | number | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |
| `request.resultMask` | number | 반환할 필드 비트마스크 (`opcua.BrowseResultMask`). 기본값 `All` |
| `request.requestedMaxReferencesPerNode` | number | 노드당 최대 반환 참조 수. `0`이면 무제한 |

**반환값:** `BrowseResult[]`

**throws:** 미연결 시 `"not connected"`, 조회 실패 시 원본 예외

### `browseNext(request)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `request.continuationPoints` | string[] | 이전 결과의 `continuationPoint` 목록 (base64) |
| `request.releaseContinuationPoints` | boolean | `true`면 서버 측 continuation point 해제. 기본값 `false` |

**반환값:** `BrowseResult[]`

**throws:** 미연결 시 `"not connected"`, 조회 실패 시 원본 예외

### `children(request)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `request.node` | string | 자식을 조회할 OPC UA 노드 ID |
| `request.nodeClassMask` | number | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |

**반환값:** `ChildrenResult[]`

**throws:** 미연결 시 `"not connected"`, 조회 실패 시 원본 예외

### `close()`

서버 연결을 종료합니다. 이미 닫혀 있으면 아무것도 하지 않습니다.

## 예시

```js
const OpcuaClient = require("./src/opcua/opcua-client.js");  // cgi-bin/ 기준 경로

const client = new OpcuaClient("opc.tcp://localhost:4840", 100);

if (!client.open()) {
    console.println("connect failed");
    return;
}

try {
    // 노드 값 읽기
    const results = client.read(["ns=3;i=1001", "ns=3;i=1002"]);
    results.forEach((r, i) => {
        console.println(i, r.value, r.sourceTimestamp);
    });

    // 자식 노드 탐색
    const children = client.children({ node: "ns=0;i=85" });
    children.forEach(c => console.println(c.nodeId, c.displayName));
} catch (e) {
    console.println("error:", e.message);
    client.close();
}

client.close();
```

## 동작 원칙

- `open()` — 연결 시도. 이미 연결된 경우 no-op. 실패 시 `false` 반환 (예외 없음)
- 각 메소드 — 미연결 또는 작업 실패 시 예외 throw. 연결 close는 호출부에서 판단
