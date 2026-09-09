---
title: Server 설정
weight: 20
---

#

OPC UA Client에서 먼저 등록해야 하는 것은 **OPC UA Server**가 아니라 **Database Server**입니다.  
수집한 값을 어디에 저장할지 먼저 정해야 Job 생성 화면에서 Table과 Column을 선택할 수 있습니다.

## Server Settings 열기

좌측 사이드바에서 Server Settings를 열면 등록된 Database Server 목록이 표시됩니다.

가능한 동작:

- `Add Server`
- `Edit`
- `Delete`
- `Connection Test`

![Database Server 설정 화면]({{< asset "images/opcua-server-settings.png" >}})

## 새 Database Server 추가

일반적으로 Machbase Neo 연결 정보를 입력합니다.

주요 입력 항목:

- `Name`
- `Host`
- `Port`
- `Database`
- `User`
- `Password`

등록 순서:

1. **Add Server** 클릭
2. Name, Host, Port, 계정 정보 입력
3. **Load Databases**로 사용 가능한 Database를 불러와 선택하거나 이름을 직접 입력
4. 가능하면 **Connection Test**로 먼저 확인
5. **Save**로 저장

OPC UA Client는 수집 데이터를 기록하므로 `READ_WRITE` Database만 저장할 수 있습니다. Database 목록 조회가 실패해도 이름을 직접 입력할 수 있지만, Save 시 실제 접속 권한과 쓰기 가능 여부를 다시 확인합니다.

## 수정과 삭제

- `Edit`
  - 저장된 연결 정보를 변경합니다.
- `Delete`
  - 등록된 Database Server를 삭제합니다.

이미 Job에서 사용하는 Server를 삭제하면 해당 Job의 수정이나 재실행에 영향이 있을 수 있으므로 주의해야 합니다.

## 사용자 주의사항

- Database Server가 정상이어야 Table과 Column 목록이 정확히 보입니다.
- Job 생성 전에 먼저 Table 구조를 준비해 두는 것이 좋습니다.

## 문서 이동

- [목차로 돌아가기]({{< relref "/" >}})
- [다음: Job 생성과 실행]({{< relref "create-and-run-job" >}})
