# Collector

`cgi-bin/src/collector.js`

`OpcuaClient`와 `MachbaseAppender`를 조합하여 주기적으로 OPC UA 노드 값을 읽고 Machbase에 저장합니다. 연결 실패 시 다음 주기에 자동으로 재연결을 시도하며, `setInterval` 루프 내 모든 예외를 처리하여 루프가 중단되지 않도록 보장합니다.

## API

### `new Collector(config, deps?)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `config` | object | [설정](configuration.md) 전체 객체 |
| `deps.opcuaClient` | OpcuaClient | (테스트용) OpcuaClient 인스턴스 주입 |
| `deps.machbaseAppender` | MachbaseAppender | (테스트용) MachbaseAppender 인스턴스 주입 |

### `start()`

OpcuaClient와 MachbaseAppender를 열고 `setInterval`로 수집 루프를 시작합니다. 이미 실행 중이면 아무것도 하지 않습니다. 초기 연결 실패는 무시하며, 다음 `collect()` 주기에 재연결을 시도합니다.

### `close()`

`setInterval`을 정지하고 OpcuaClient, MachbaseAppender를 각각 `close()`합니다. 하나가 실패해도 나머지가 반드시 실행됩니다.

### `collect()`

노드 값을 읽어 DB에 저장하는 단위 작업입니다. `setInterval` 콜백에서 호출됩니다.

1. DB가 열려 있지 않으면 재연결 시도. 실패 시 주기 건너뜀
2. `OpcuaClient.open()` 호출. 실패 시 경고 로그 후 주기 건너뜀
3. `OpcuaClient.read(nodeIds)` 호출. 예외 발생 시 OpcuaClient close 후 주기 건너뜀
4. 각 노드의 `sourceTimestamp` 또는 `Date.now()`를 타임스탬프로 사용
5. `MachbaseAppender.append()` 후 `flush()`

config 참조: `config.opcua.interval`, `config.opcua.nodes`

## 예시

```js
const Collector = require("./src/collector.js");  // cgi-bin/ 기준 경로

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
| OPC UA 연결 실패 (`collect`) | 경고 로그, 주기 건너뜀 |
| OPC UA read 예외 | OpcuaClient close, 주기 건너뜀 (다음 주기에 재연결) |
| DB 연결 실패 | 로그 출력 후 다음 주기에 재연결 시도 |
| DB append/flush 예외 | OpcuaClient close, 주기 건너뜀 |
| 기타 예외 | 로그 출력, 루프 유지 |

`setInterval` 콜백 전체가 `try/catch`로 감싸져 있어 어떤 경우에도 루프가 중단되지 않습니다.

## 수집 흐름

```
start()  ← 이미 실행 중이면 즉시 반환
  ├─ OpcuaClient.open()      ← 실패해도 무시, 다음 주기에 재시도
  ├─ MachbaseAppender.open() ← 실패해도 예외 없이 로그만 출력
  └─ setInterval(interval)
       └─ collect()  ← 매 주기 실행
            ├─ db.isOpen() 확인
            │    └─ false → _openDb() 재시도 → 실패 시 주기 건너뜀
            ├─ OpcuaClient.open()
            │    └─ false → 경고 로그, 주기 건너뜀
            ├─ OpcuaClient.read(nodeIds)
            │    └─ 예외 → OpcuaClient.close() → 주기 건너뜀
            ├─ MachbaseAppender.append() × N
            │    └─ 예외 → OpcuaClient.close() → 주기 건너뜀
            └─ MachbaseAppender.flush()
                 └─ 예외 → OpcuaClient.close() → 주기 건너뜀

close()  ← 종료 시
  ├─ clearInterval()
  ├─ OpcuaClient.close()
  └─ MachbaseAppender.close()
```
