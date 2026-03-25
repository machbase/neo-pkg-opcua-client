# OpcuaClient

`cgi-bin/src/opcua/opcua-client.js`

OPC UA 서버에 연결하여 노드 값을 읽는 클라이언트입니다. 연결 실패 또는 읽기 실패 시 자동으로 재연결을 시도합니다.

## API

### `new OpcuaClient(endpoint, readRetryInterval, options?)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `endpoint` | string | OPC UA 서버 주소 (예: `opc.tcp://localhost:4840`) |
| `readRetryInterval` | number | 읽기 재시도 간격 (ms). 기본값 `100` |
| `options.clientFactory` | function | (테스트용) 내부 클라이언트 생성 팩토리 |

### `open()`

OPC UA 서버에 연결합니다. 실패하면 `client`를 `null`로 유지하고 로그를 출력합니다. 예외를 던지지 않습니다.

### `read(nodeIds)`

노드 ID 배열을 받아 값을 읽어 `ReadResult[]`를 반환합니다.

- 연결이 없으면 `open()`을 먼저 호출합니다.
- 읽기 실패 시 내부 클라이언트를 닫고 `null`을 반환합니다. (다음 호출 시 재연결)

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `nodeIds` | string[] | OPC UA 노드 ID 목록 |

**반환값:** `ReadResult[]` 또는 연결/읽기 실패 시 `null`

#### ReadResult 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `value` | any | 읽은 값 |
| `sourceTimestamp` | number | 소스 타임스탬프 (ms). 없으면 `null` |
| `status` | number | 상태 코드 |
| `statusCode` | string | 상태 코드 문자열 |

### `close()`

서버 연결을 종료합니다. 이미 닫혀 있으면 아무것도 하지 않습니다.

## 예시

```js
const OpcuaClient = require("./src/opcua/opcua-client.js");  // cgi-bin/ 기준 경로

const client = new OpcuaClient("opc.tcp://localhost:4840", 100);
client.open();

const results = client.read(["ns=3;i=1001", "ns=3;i=1002"]);
if (results !== null) {
    results.forEach((r, i) => {
        console.log(i, r.value, r.sourceTimestamp);
    });
}

client.close();
```

## 재연결 동작

```
read() 호출
  └─ client가 null이면 open() 호출
       ├─ 성공: client 설정 후 read 진행
       └─ 실패: null 반환 (다음 주기에 재시도)
  └─ read 중 예외 발생
       ├─ client.close() 호출
       ├─ client = null 설정
       └─ null 반환 (다음 주기에 재연결)
```
