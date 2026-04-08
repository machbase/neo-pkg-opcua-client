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
  "db": {
    "table": "TAG",
    "host": "127.0.0.1",
    "port": 5656,
    "user": "sys",
    "password": "manager"
  },
  "log": {
    "level": "INFO",
    "output": "both",
    "format": "json",
    "file": {
      "path": "./logs",
      "maxSize": "10MB",
      "maxFiles": 7,
      "rotate": "daily"
    }
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

## db

| 항목 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `table` | string | - | 저장할 테이블명 |
| `host` | string | `"127.0.0.1"` | Machbase 호스트 |
| `port` | number | `5656` | Machbase 포트 |
| `user` | string | `"sys"` | 사용자명 |
| `password` | string | `"manager"` | 비밀번호 |

`db`를 생략하면 기본값(`127.0.0.1:5656`, sys/manager)으로 연결합니다.

## log

| 항목 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `level` | string | `"INFO"` | 최소 로그 레벨. `DEBUG` \| `INFO` \| `WARN` \| `ERROR` |
| `output` | string | `"console"` | 출력 대상. `console` \| `file` \| `both` |
| `format` | string | `"json"` | 출력 형식. `json` \| `text` |
| `file.path` | string | - | 로그 디렉토리 경로. collector 실행 시 실제 파일명은 `{설정이름}.log` |
| `file.maxSize` | string | `"10MB"` | 파일 최대 크기. 단위: `B` \| `KB` \| `MB` \| `GB` |
| `file.maxFiles` | number | `7` | 보관할 로그 파일 최대 개수 |
| `file.rotate` | string | `"size"` | 로테이션 방식. `size` \| `daily` |

`output`이 `console`이면 `file` 섹션은 무시됩니다.
`file.path`에 `${CWD}`가 포함되면 `cgi-bin`의 parent, 즉 패키지 루트 경로로 치환됩니다.
예: collector 설정 이름이 `collector-a` 이고 `${CWD}/log` 를 입력하면 `<package_root>/log/collector-a.log` 가 생성됩니다.

하위 호환:
- 기존처럼 `file.path` 에 `.../name.log` 형태의 파일 경로를 넣으면 그대로 사용합니다.
