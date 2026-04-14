# 설정

설정 파일은 JSON 형식이며 `cgi-bin/conf.d/` 디렉토리에 `{name}.json`으로 저장됩니다. 데몬 실행 시 경로를 직접 지정합니다.

## 전체 예시

```json
{
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
    "readRetryInterval": 100,
    "interval": 5000,
    "nodes": [
      { "nodeId": "ns=3;i=1001", "name": "sensor.tag1" },
      { "nodeId": "ns=3;i=1002", "name": "sensor.tag2" }
    ]
  },
  "db": "my-server",
  "dbTable": "TAG",
  "valueColumn": "VALUE",
  "log": {
    "level": "info",
    "maxFiles": 7
  }
}
```

## opcua

| 항목 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `endpoint` | string | - | OPC UA 서버 주소 |
| `readRetryInterval` | number | `100` | 읽기 재시도 간격 (ms) |
| `interval` | number | - | 수집 주기 (ms) |
| `nodes` | array | - | 수집할 노드 목록 |
| `nodes[].nodeId` | string | - | OPC UA 노드 ID |
| `nodes[].name` | string | - | Machbase TAG 이름 |
참고:
- OPC UA 값이 boolean이면 `true → 1`, `false → 0` 으로 변환합니다.

## db

| 항목 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `db` | string | - | 등록된 DB 서버 이름 (`/cgi-bin/api/db/server` 로 관리) |
| `dbTable` | string | - | 저장할 테이블명 |
| `valueColumn` | string | `"VALUE"` | 값을 저장할 컬럼명 |

## log

| 항목 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `disable` | boolean | `false` | `true`이면 모든 로그 출력 비활성화 |
| `level` | string | `"info"` | 최소 로그 레벨. `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `maxFiles` | number | `10` | 보관할 최대 로그 파일 개수 |

로그는 `$HOME/public/logs/{패키지명}/repli.log` 에 출력됩니다. 파일이 10 MB를 초과하면 `repli_0001.log`, `repli_0002.log` 순으로 순환합니다.
