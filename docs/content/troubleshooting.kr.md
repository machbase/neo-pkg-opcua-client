---
title: 문제 해결
weight: 60
---

## 빠른 확인표

| 증상 | 먼저 확인할 것 |
|---|---|
| Database Server 연결 실패 | Host, Port, 계정, Database의 `READ_WRITE` 여부 |
| OPC UA Server 연결 실패 | Endpoint, Security Mode/Policy, Auth Mode, 인증서와 키 |
| Table이 목록에 없음 | DB 연결과 권한, 시간 기준 TAG 테이블인지 여부 |
| Job은 Running인데 저장되지 않음 | Node ID, 읽기 권한, 컬럼, Bad Status Policy, 로그 |
| Derived Tag가 저장되지 않음 | 식 검증, 변수 연결, ON ERROR, 문자열 전용 모드 |
| Data Viewer 버튼이 꺼져 있음 | Value Column이 JSON인지 확인 |
| Edit/Delete 버튼이 꺼져 있음 | Job이 Running인지 확인하고 먼저 중지 |

## Database Server가 연결되지 않음

- Host와 Port가 맞는지 확인합니다.
- User와 Password를 다시 확인합니다.
- Database 목록은 입력 폼의 Database 드롭다운을 열 때 조회됩니다.
- 등록 폼에는 Connection Test 버튼이 없습니다. 먼저 저장한 뒤 Database Servers 목록에서 시험합니다.
- 쓰기 작업이 필요하므로 `READ_WRITE` Database만 사용할 수 있습니다.

## OPC UA Server가 연결되지 않음

- Endpoint URL과 서버 실행 상태를 확인합니다.
- 서버와 같은 Security Mode와 Security Policy를 골랐는지 확인합니다.
- `UserName` 인증이면 Username과 Password를 확인합니다.
- `Sign & Encrypt`이면 Client Certificate와 Private Key가 한 쌍인지, 서버가 인증서를 신뢰하는지 확인합니다.
- 설정값을 바꾸면 이전 연결 성공 상태가 초기화되므로 다시 `Connection Test`를 실행합니다.

## Read Batch Size를 입력할 수 없음

새 OPC UA Server는 연결 시험 전까지 Read Batch Size가 비활성화됩니다. 먼저 `Connection Test`를 실행하세요. Batch Size는 1 이상의 정수여야 합니다. 서버가 알려 준 `Max Nodes Per Read`가 양수이면 그 값을 초과할 수 없습니다. 서버 값이 `0`이거나 값을 제공하지 않으면 화면에 `Unlimited`로 표시되며 Batch Size 상한 검사를 하지 않습니다.

## Table 또는 Column이 보이지 않음

- Database Server 연결과 테이블 조회 권한을 확인합니다.
- 거리 기준 TAG 테이블은 의도적으로 목록에서 제외됩니다. Collector는 수집 시각을 기준 컬럼에 쓰므로 시간 기준 TAG 테이블만 지원합니다.
- 기존 테이블의 Value Column은 숫자 또는 JSON 타입이어야 합니다.
- String Value Column은 VARCHAR 타입이어야 합니다.

## 새 테이블이 자동 생성되지 않음

자동 생성은 다음 조건에서만 동작합니다.

- 새 Job을 만들고 있음
- 입력한 테이블이 실제로 없음
- 테이블 이름에 점(`.`)이 없음

기존 Job 수정, `USER.TABLE` 형식, 연결 실패처럼 “없는 테이블”임을 확인하지 못한 경우에는 자동 생성되지 않습니다.

## 문자열 값이 저장되지 않음

- 숫자 Value Column만 설정하면 문자열 값은 저장되지 않습니다.
- `String Value Column`을 선택하거나 JSON Value Column을 사용합니다.
- 숫자/JSON 컬럼이 없는 테이블은 문자열 전용 모드가 되며 VARCHAR 컬럼 선택이 필수입니다.
- 문자열 전용 모드에서는 모든 값을 문자열로 저장하며 Derived Tag는 수집하지 않습니다.

## JSON을 선택하니 sourceTime을 사용할 수 없음

JSON 모드는 여러 Node를 한 payload 행에 저장합니다. 한 행에는 시각을 하나만 기록할 수 있으므로 `requestTime`만 사용할 수 있습니다. 화면이 Time Policy를 `requestTime`으로 바꾸고 `sourceTime`을 비활성화하는 것은 정상입니다.

## Data Viewer를 열 수 없음

JSON Value Column을 사용하는 Job은 현재 Data Viewer를 지원하지 않습니다. Dashboard의 버튼이 비활성화되며, 일반 숫자 컬럼 또는 문자열 전용 컬럼을 사용하는 Job에서 Data Viewer를 사용해야 합니다.

문자열 전용 Job은 Raw 표에서 확인할 수 있지만, 숫자 컬럼이 필요한 Chart나 Tag Analyzer에서는 사용할 수 있는 기능이 제한됩니다. Tag Analyzer는 neo-web 안에서 열었을 때만 동작합니다.

## Derived Tag를 추가하거나 저장할 수 없음

- 원본 Node를 변수에 연결했는지 확인합니다.
- 식에서 사용한 대문자 변수와 등록한 Alias가 같은지 확인합니다.
- 식 검증이 성공해야 `Add derived tag`가 활성화됩니다.
- Derived Tag 이름이 원본 Node나 다른 Derived Tag 이름과 겹치면 안 됩니다.
- SUMMARIZED Value Column에서는 `write null`을 사용할 수 없습니다.
- 문자열 전용 모드에서는 Derived Tag가 수집되지 않습니다.

## Bad Status 뒤 값이 빠짐

`Bad Status Policy`가 `skip`이면 Bad Status 원본 값은 저장하지 않습니다. 그 값을 사용하는 Derived Tag는 자신의 `ON ERROR` 정책을 따릅니다. 품질 상태를 무시하고 값이 있을 때 저장하려면 위험을 이해한 뒤 `ignore`를 선택합니다.

## Job은 Running인데 값이 저장되지 않음

1. 마지막 수집 시각과 `Disconnected` 또는 `Stale` 표시를 봅니다.
2. Node ID와 서버의 읽기 권한을 확인합니다.
3. 선택한 Table과 Column이 실제 설정과 맞는지 확인합니다.
4. 문자열 Node에 String Value Column 또는 JSON 컬럼이 있는지 확인합니다.
5. Bad Status Policy를 확인합니다.
6. 상단 `Live Logs`와 `View Logs`에서 반복 오류를 찾습니다.

## 문서 이동

- [이전: Data Viewer]({{< relref "data-viewer" >}})
- [목차로 돌아가기]({{< relref "/" >}})
