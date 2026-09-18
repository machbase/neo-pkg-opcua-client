---
title: Job 생성과 실행
weight: 30
---

## 새 Job 만들기

좌측 사이드바의 `New Job`을 누릅니다. 현재 폼은 다음 순서로 구성됩니다.

![Server 프로필과 기존 Table을 선택한 새 Job 설정 화면](/images/job-form-existing-table.png)

1. Job
2. OPC UA Server와 Database
3. Node Mapping
4. Derived Tags
5. Collection Policy
6. Logging Controls

## Job과 OPC UA Server

`Name`에는 Job 이름을 입력합니다. 영문, 숫자, `_`, `-`를 사용할 수 있습니다.

`OPC UA Server`에서는 [Server 설정]({{< relref "server-settings" >}})에서 등록한 프로필을 선택합니다. 예전 설정을 수정할 때만 `Legacy endpoint`가 보일 수 있습니다. 새 Job은 Endpoint URL을 직접 쓰는 대신 서버 프로필을 사용합니다.

- `Interval (ms)`: 수집 주기이며 최솟값은 1,000ms입니다.
- `Read Retry Interval (MS)`: 읽기 실패 뒤 다시 시도하기까지 기다리는 시간입니다.

## Database와 테이블

`Database Server`를 선택한 뒤 Table 이름을 선택하거나 입력합니다. Collector는 수집 시각을 TAG 테이블의 기준 컬럼에 기록하므로 **시간 기준 TAG 테이블만** 사용할 수 있습니다. 거리 기준 TAG 테이블은 목록에서 제외되며 직접 입력해도 저장할 수 없습니다.

### 기존 테이블 사용

기존 테이블을 선택하면 컬럼 정보를 불러옵니다.

- `Value Column`: 숫자 또는 JSON 컬럼
- `String Value Column`: 문자열을 저장할 VARCHAR 컬럼이며 필요할 때 선택

저장 방식은 선택한 컬럼에 따라 달라집니다.

| 방식 | 설정 | 저장 결과 |
|---|---|---|
| 숫자 저장 | 숫자 `Value Column`만 선택 | 숫자와 boolean 값을 행으로 저장 |
| 숫자·문자열 분리 | 숫자 `Value Column`과 `String Value Column` 선택 | 숫자/boolean과 문자열을 알맞은 컬럼에 저장 |
| JSON | JSON `Value Column` 선택 | 한 번의 수집 결과를 하나의 JSON payload 행으로 저장 |
| 문자열 전용 | 숫자/JSON 컬럼이 없고 VARCHAR 컬럼 선택 | 모든 값을 문자열로 바꾸어 저장 |

숫자 컬럼만 선택한 상태에서 문자열 Node를 추가하면 그 값은 저장되지 않습니다. `String Value Column`을 추가하거나 JSON 컬럼을 사용하세요.

### 새 테이블 자동 생성

새 Job에서 점(`.`)이 없는 새 Table 이름을 입력하고 존재하지 않는 테이블임이 확인되면 다음 안내가 표시됩니다.

`Table not found. It will be created automatically when the job is saved.`

Job을 저장할 때 시간 기준 TAG 테이블이 만들어지며 `VALUE`와 `STR_VALUE` 컬럼을 사용합니다. 자동 생성은 기존 Job 수정 화면이나 `USER.TABLE`처럼 점이 들어간 이름에는 적용되지 않습니다.

## Node Mapping

Node는 두 가지 방법으로 추가할 수 있습니다.

- 직접 추가: `Tag Name`과 `Node ID`를 입력하고 `Add`를 누릅니다.
- 탐색: `Browse`를 눌러 OPC UA 서버의 Node 트리를 엽니다.

Node Browser에서는 다음 순서로 작업합니다.

![실제 OPC UA Node를 선택한 Node Browser](/images/job-node-browser.png)

1. `Browse From`에 탐색 시작 Node ID를 입력합니다.
2. 폴더를 열거나 `Filter results by name or address...`로 찾습니다.
3. 수집할 Variable Node를 여러 개 선택합니다.
4. `Apply`를 눌러 Node Mapping에 반영합니다.

숫자 저장 모드에서는 숫자가 아닌 Node가 선택되지 않습니다. String Value Column, JSON 컬럼, 문자열 전용 모드를 사용하면 지원되는 문자열 Node도 선택할 수 있습니다.

Node Mapping 표에서 Tag Name, Node ID/Path, Data Type을 확인합니다. 이름 하나를 직접 고치거나 여러 행을 선택한 뒤 `Rename N selected`로 한꺼번에 바꿀 수 있습니다. 일괄 이름 변경은 Node Browser가 아니라 Mapping 표에서 합니다.

### Transform

숫자 Node에는 Bias와 Multiplier를 적용할 수 있습니다. 두 계산 조각을 끌어 순서를 바꿉니다.

- `(value + bias) × multiplier`
- `(value × multiplier) + bias`

boolean, 문자열, 문자열 전용 저장에는 Transform이 적용되지 않습니다.

## Derived Tags

`New derived tag`를 누르면 같은 수집 주기의 원본 Node로 계산한 새 Tag를 만들 수 있습니다.

![원본 Node 두 개로 Derived Tag를 만드는 화면](/images/job-derived-tag-editor.png)

1. Derived Tag 이름을 입력합니다.
2. 원본 Node를 `A`부터 `Z`까지의 변수에 연결합니다.
3. 예: `A * 1.8 + 32`와 같은 식을 입력하고 검증 결과를 확인합니다.
4. `TIME SOURCE`를 `latest` 또는 특정 변수로 정합니다.
5. `ON ERROR` 처리 방법을 선택합니다.

오류 처리 선택지는 다음과 같습니다.

- `skip`: 저장하지 않음
- `write null`: null 저장
- `use fallback value`: 지정한 숫자 저장
- `hold last value`: 마지막 정상값 유지

`write null`은 SUMMARIZED 값 컬럼에서 사용할 수 없습니다. Derived Tag는 문자열 전용 저장 모드에서 수집되지 않습니다. `requestTime` 정책에서는 모든 행이 읽은 시각을 사용하므로 `TIME SOURCE` 설정은 보관되지만 적용되지 않습니다.

## Collection Policy

### Time Policy

- `sourceTime`: Node의 `sourceTimestamp`를 우선 사용하고 없으면 요청 시각을 사용합니다. Derived Tag는 `TIME SOURCE`를 따릅니다.
- `requestTime`: 한 번의 읽기 요청에 포함된 모든 원본·Derived Tag에 같은 요청 시각을 사용합니다.

JSON은 여러 Node를 하나의 행에 합치므로 시각도 하나만 가질 수 있습니다. 따라서 JSON Value Column에서는 `requestTime`만 사용할 수 있습니다.

### Bad Status Policy

- `skip`: Bad Status 값을 저장하지 않습니다. 그 값을 쓰는 Derived Tag는 자신의 `ON ERROR` 정책을 적용합니다.
- `ignore`: 품질 상태와 관계없이 값이 있으면 저장하고 계산에 사용합니다.

## Logging Controls와 저장

- `Log Level`: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR` 중 기록을 시작할 수준
- `File Limit`: 보관할 로그 파일 수

상단의 `Create` 또는 `Update`로 저장합니다. 생성한 Job은 사이드바의 스위치로 시작하고 멈춥니다. 실행 중인 Job은 먼저 중지해야 수정하거나 삭제할 수 있습니다.

## 문서 이동

- [이전: Server 설정]({{< relref "server-settings" >}})
- [목차로 돌아가기]({{< relref "/" >}})
- [다음: 모니터링과 로그]({{< relref "monitoring-and-logs" >}})
