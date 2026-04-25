---
title: Job 생성과 실행
weight: 30
---

# Job 생성과 실행

## 새 Job 생성

좌측 사이드바에서 **New Job**을 열면 Job 생성 화면으로 이동합니다.

화면은 보통 다음 순서로 구성됩니다.

- Job
- OPC UA
- Database
- Node Mapping
- Logging Controls

> 스크린샷 위치: `opcua-job-form.png`
>
> 권장 장면: Job, OPC UA, Database, Node Mapping 섹션이 한 화면에 이어서 보이는 생성 폼

## Job 섹션

- `Name`
  - Job을 구분하는 이름입니다.

Job 이름은 영문, 숫자, `_`, `-` 중심으로 짓는 것이 좋습니다.

## OPC UA 섹션

주요 입력 항목:

- `Endpoint URL`
- `Interval (ms)`
- `Read Retry Interval`

설명:

- `Endpoint URL`
  - OPC UA 서버 주소입니다.
- `Interval`
  - 데이터 수집 주기입니다.
- `Read Retry Interval`
  - 읽기 실패 시 재시도 간격입니다.

처음에는 너무 짧은 주기보다 안정적인 값으로 시작하는 편이 좋습니다.

## Database 섹션

이 섹션에서는 데이터를 어느 서버, 어느 테이블, 어느 컬럼에 저장할지 정합니다.

주요 항목:

- `Database Server`
- `Table`
- `Value Column`
- `String Value Column`

동작 방식:

- 숫자나 boolean 값은 `Value Column`에 저장할 수 있습니다.
- 문자열 값은 `String Value Column`로 분리 저장할 수 있습니다.
- 선택한 컬럼이 `JSON` 타입이면 한 주기 데이터를 JSON payload로 저장하는 방식이 사용될 수 있습니다.
- 테이블에 숫자/JSON 컬럼이 없으면 화면이 string-only 모드로 전환될 수 있습니다.

## Node Mapping 섹션

이 섹션에서 실제로 수집할 Node를 지정합니다.

입력 방식은 두 가지입니다.

### 직접 입력

- `Tag Name`
- `Node ID`

입력 후 **Add**를 누르면 목록에 추가됩니다.

### Browse 사용

OPC UA Endpoint가 입력되어 있으면 **Browse** 버튼으로 서버의 Node를 탐색할 수 있습니다.

> 스크린샷 위치: `opcua-node-browser.png`
>
> 권장 장면: Node Browser가 열려 있고 Node 선택 결과가 목록에 반영되는 화면

## Transform 설정

Node 목록에서는 각 항목에 대해 Transform을 줄 수 있습니다.

기본 개념:

- `Bias`
- `Multiplier`
- 계산 순서 변경

예를 들어 값을 보정하거나 배율을 적용할 때 사용합니다.

처음에는 Transform 없이 동작 확인을 먼저 하고, 이후 필요한 Node만 조정하는 것이 안전합니다.

## Logging Controls

생성 화면 하단에서는 로그 정책을 정할 수 있습니다.

- `Log Level`
- `File Limit`

일반 운영에서는 `INFO`나 `WARN`이 적당합니다.

## 생성과 수정 완료

- `Create`
  - 새 Job 생성
- `Update`
  - 기존 Job 수정
- `Cancel`
  - 저장하지 않고 돌아가기

생성 후에는 사이드바에서 Job을 선택하고 상태를 확인합니다.

## 문서 이동

- [이전: Server 설정](./server-settings.kr.md)
- [목차로 돌아가기](./index.kr.md)
- [다음: 모니터링과 로그](./monitoring-and-logs.kr.md)
