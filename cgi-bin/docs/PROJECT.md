# PROJECT

## Collector (`src/collector.js`)
OPC UA 노드 값을 주기적으로 읽어 Machbase TAG 테이블에 저장. 연결 실패 시 다음 주기에 자동 재연결. `setInterval` 콜백 전체가 `try/catch`로 감싸져 루프 중단 없음.

**값 정규화 (`_normalizeValue`):** `boolean` → 1/0, 그 외 → `Number(value)` 강제 변환 후 `(num + add) * multiply` 적용.

**로그 레벨:** DB open/close 실패는 일시 장애이므로 `warn` 레벨 사용 (error 아님).

## OpcuaClient (`src/opcua/opcua-client.js`)
OPC UA 서버 연결·읽기·쓰기·노드 탐색 클라이언트. `open()` 실패 시 `false` 반환, 나머지 메소드는 실패 시 예외 throw.

## Logger (`src/lib/logger.js`)
크기 기반 로테이션 파일 로거. 10 MB 초과 시 현재 파일을 datetime으로 rename(`repli_20260415_034234.log`)하고 새 `repli.log` 에 이어씀. `maxFiles` 초과 시 오래된 파일부터 삭제.

출력 형식: `[LEVEL] YYYY-MM-DD HH:MM:SS.sss  stage  msg  (key=value ...)`

## 설정 (`conf.d/{name}.json`) 주요 항목

| 항목 | 설명 |
|------|------|
| `opcua.endpoint` | OPC UA 서버 주소 |
| `opcua.interval` | 수집 주기 (ms) |
| `opcua.nodes[].nodeId` | 수집 노드 ID |
| `opcua.nodes[].name` | Machbase TAG 이름 |
| `opcua.nodes[].bias` / `multiplier` | 값 변환 오프셋·배율 |
| `opcua.nodes[].calcOrder` | 계산 순서. `"bm"` (기본): `(value+bias)*multiplier` / `"mb"`: `value*multiplier+bias` |
| `opcua.nodes[].onChanged` | `true`이면 이전 값과 달라졌을 때만 append (기본 false) |
| `db` | 등록된 DB 서버 이름 |
| `dbTable` | 저장 테이블명 |
| `log.level` | trace·debug·info·warn·error (기본 info) |
| `log.maxFiles` | 보관 최대 파일 수 (기본 10) |
