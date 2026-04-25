---
title: 문제 해결
weight: 50
---

# 문제 해결

## OPC UA 서버에 연결되지 않음

다음을 확인합니다.

- Endpoint URL이 정확한지
- OPC UA 서버가 실제로 실행 중인지
- 네트워크 접근이 가능한지

대시보드에서 `Disconnected`가 보이면 endpoint와 서버 상태를 먼저 점검합니다.

## Job은 running인데 값이 들어오지 않음

가능한 원인:

- Node ID가 잘못됨
- 읽기 권한이 없는 Node
- Interval은 정상인데 실제 값 갱신이 없음
- Database Column 선택이 맞지 않음

먼저 Node Mapping과 Database Column 구성을 다시 확인합니다.

## Table 또는 Column 선택이 비어 있음

다음을 확인합니다.

- Database Server 연결이 정상인지
- 해당 계정으로 Table 조회 권한이 있는지
- 실제 테이블 구조가 준비되어 있는지

## 문자열 값이 저장되지 않음

- `String Value Column`이 필요한 구조인지 확인합니다.
- 선택한 테이블에 문자열용 컬럼이 있는지 확인합니다.
- JSON 모드인지 string-only 모드인지 현재 저장 방식을 확인합니다.

## 마지막 수집 시간이 오래됨

- Job이 실제로 `running`인지 확인합니다.
- OPC UA 카드에 `Stale` 또는 `Disconnected`가 표시되는지 확인합니다.
- 필요하면 로그 파일을 열어 반복 오류가 있는지 봅니다.

## 운영 권장 사항

- 처음에는 Node 몇 개만 등록해 동작을 확인합니다.
- Interval을 너무 짧게 시작하지 않습니다.
- Transform은 기본 수집이 안정된 뒤에 추가합니다.

## 문서 이동

- [이전: 모니터링과 로그](./monitoring-and-logs.kr.md)
- [목차로 돌아가기](./index.kr.md)
