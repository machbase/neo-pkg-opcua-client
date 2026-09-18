---
title: 모니터링과 로그
weight: 40
---

## Dashboard 확인

좌측에서 Job을 선택하면 메인 화면에 현재 설정과 상태가 표시됩니다.

![실제 데이터를 수집 중인 Job Dashboard](/images/job-detail-running.png)

상단에서는 다음을 확인합니다.

- Job 이름과 `Running` 또는 `Stopped` 상태
- OPC UA Server, Interval, Read Retry Interval
- 원본 `Nodes` 수와 `Derived` Tag 수
- 마지막 수집 시각
- Database Server, Table, Value Column

아래쪽에는 다음 상세 정보가 나옵니다.

- Monitored Nodes: Tag Name, Node ID/Path, Data Type, Transform
- Derived Tags: 식, 변수, Base Time, 오류 처리
- Collection Policy: Time Policy와 Bad Status Policy
- Logging Controls: Log Level, File Limit, `View Logs`

## 상태 해석

- `Running`: 데이터를 수집 중입니다.
- `Stopped`: 수집을 멈춘 상태입니다.
- `Disconnected`: 실행 중인데 최근 수집이 없고 OPC UA 연결 시험도 실패했습니다.
- `Stale`: OPC UA Server에는 연결되지만 최근 수집 시각이 오래되었습니다.

`Disconnected`와 `Stale`은 Job이 실행 중인데 설정된 Interval의 3배보다 오래 수집되지 않았을 때 연결을 확인한 뒤 표시될 수 있습니다.

## Job 조작 제한

Job이 `Running`이면 `Edit`과 `Delete`가 비활성화됩니다. 설정을 바꾸거나 Job을 지우려면 좌측 사이드바의 스위치로 먼저 중지하세요.

`Data Viewer`는 JSON Value Column을 사용하는 Job에서 비활성화됩니다. 이유는 [Data Viewer]({{< relref "data-viewer" >}}) 문서에서 설명합니다.

## Live Logs

Live Logs는 Dashboard 아래쪽에 고정된 카드가 아닙니다. **화면 상단의 `Live Logs` 버튼**으로 실시간 로그 창을 열고 닫습니다.

![실제 수집 로그가 표시된 Live Logs 창](/images/live-logs-running.png)

- `CONNECTED`: 실시간 로그 연결이 열린 상태
- `Pause`: 새 로그 표시를 잠시 멈춤
- `Clear`: 현재 창에 표시된 줄을 지움

Live Logs는 연결한 뒤 새로 생기는 로그를 따라갑니다. 과거 로그 전체를 다시 보여 주는 기능이 아닙니다. 새 로그가 없거나 Log Level이 `WARN` 또는 `ERROR`이면 창이 비어 있을 수 있습니다.

## 저장 로그 보기

Dashboard의 Logging Controls에서 `View Logs`를 누릅니다.

![저장된 로그 파일과 내용을 확인하는 화면](/images/saved-log-viewer.png)

1. 현재 Job의 로그 파일 목록에서 파일 이름과 크기를 확인합니다.
2. 파일을 선택해 내용을 읽습니다.
3. 회전된 이전 로그 파일이 남아 있으면 같은 목록에서 확인합니다.

오래된 오류 원인을 찾을 때는 Live Logs보다 저장 로그가 더 알맞습니다.

## 권장 확인 순서

1. Job이 `Running`인지 확인합니다.
2. 마지막 수집 시각이 최근인지 확인합니다.
3. OPC UA 카드에 `Disconnected`나 `Stale`이 있는지 확인합니다.
4. Nodes와 Derived 개수가 예상과 맞는지 확인합니다.
5. Database, Table, Column과 Collection Policy를 확인합니다.
6. 상단 `Live Logs`를 열어 현재 동작을 봅니다.
7. 필요한 경우 `View Logs`에서 과거 오류를 찾습니다.

## 문서 이동

- [이전: Job 생성과 실행]({{< relref "create-and-run-job" >}})
- [목차로 돌아가기]({{< relref "/" >}})
- [다음: Data Viewer]({{< relref "data-viewer" >}})
