# Collector

`cgi-bin/src/collector.js`

`OpcuaClient`와 `MachbaseClient` + `MachbaseStream`을 조합하여 주기적으로 OPC UA 노드 값을 읽고 Machbase에 저장합니다. 연결 실패 시 다음 주기에 자동으로 재연결을 시도하며, `setInterval` 루프 내 모든 예외를 처리하여 루프가 중단되지 않도록 보장합니다.

API 레퍼런스는 [API.md — Collector API](API.md#collector-api)를 참조하세요.

## 예시

```js
const Collector = require("./src/collector.js");  // cgi-bin/ 기준 경로

const config = {
  opcua: {
    endpoint: "opc.tcp://...",
    interval: 5000,
    nodes: [{ nodeId: "ns=3;i=1001", name: "sensor.tag1" }],
  },
  db: "my-server",   // CGI.getServerConfig("my-server") 로 접속 정보 로드
  dbTable: "TAG",
};

const collector = new Collector(config);

process.addShutdownHook(() => {
    collector.close();
});

collector.start();
```

## 오류 처리

| 상황 | 동작 |
|------|------|
| OPC UA 초기 연결 실패 (`start`) | 무시, 다음 주기에 재연결 시도 |
| DB 초기 연결 실패 (`start`) | 경고 로그, 다음 주기에 재연결 시도 |
| OPC UA 연결 실패 (`collect`) | 경고 로그, 주기 건너뜀 |
| OPC UA read 예외 | OpcuaClient + DB close, 주기 건너뜀 (다음 주기에 재연결) |
| DB 연결 실패 (`collect`) | 로그 출력 후 주기 건너뜀 |
| DB append 예외 | OpcuaClient + DB close, 주기 건너뜀 |
| 기타 예외 | 로그 출력, 루프 유지 |

`setInterval` 콜백 전체가 `try/catch`로 감싸져 있어 어떤 경우에도 루프가 중단되지 않습니다.

## 수집 흐름

```
start()  ← 이미 실행 중이면 즉시 반환
  ├─ _openDb()                ← 실패해도 경고 로그만, 다음 주기에 재시도
  └─ setInterval(interval)
       └─ collect()  ← 매 주기 실행
            ├─ _isDbOpen() 확인
            │    └─ false → _openDb() 재시도 → 실패 시 주기 건너뜀
            ├─ OpcuaClient.open()
            │    └─ false → 경고 로그, 주기 건너뜀
            ├─ OpcuaClient.read(nodeIds)
            │    └─ 예외 → OpcuaClient.close() + _closeDb() → 주기 건너뜀
            ├─ MachbaseStream.append(matrix)
            │    └─ 예외 → OpcuaClient.close() + _closeDb() → 주기 건너뜀
            └─ _recordLastCollectedAt(lastTs)
                 └─ Service.setValue(name, "lastCollectedAt", ts)

close()  ← 종료 시
  ├─ clearInterval()
  ├─ OpcuaClient.close()
  └─ _closeDb()
       ├─ MachbaseStream.close()
       └─ MachbaseClient.close()
```
