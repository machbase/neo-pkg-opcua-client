# OpcuaClient

`cgi-bin/src/opcua/opcua-client.js`

OPC UA 서버에 연결하여 노드 값을 읽고 쓰거나 노드 트리를 탐색하는 클라이언트입니다. 연결 관리와 에러 처리는 호출부에서 담당합니다.

API 레퍼런스는 [API.md — OpcuaClient API](API.md#opcuaclient-api)를 참조하세요.

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
