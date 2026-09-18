---
title: OPC UA Client 사용자 매뉴얼
weight: 10
---

이 문서는 **Machbase Neo OPC UA Client 패키지**로 OPC UA 값을 읽어 Machbase Database에 저장하고 확인하는 방법을 설명합니다.

## 설치

Machbase Neo의 패키지 화면에서 OPC UA Client를 선택하고 `Install`을 누릅니다. 설치가 끝난 뒤 패키지를 열어 설정을 시작합니다.

> 패키지 이름과 설치 상태를 확인하세요. 화면에 보이는 정확한 버전 번호는 배포 시점에 따라 달라질 수 있습니다.

## 기본 작업 순서

1. OPC UA Client 패키지를 설치합니다.
2. 수집 값을 저장할 **Database Server**를 등록하고 연결을 시험합니다.
3. 값을 읽을 **OPC UA Server**를 등록하고 연결을 시험합니다.
4. `New Job`에서 새 Job을 만듭니다.
5. 기존 시간 기준 TAG 테이블을 선택하거나 새 테이블 이름을 입력합니다.
6. 수집할 Node를 직접 추가하거나 Node Browser에서 선택합니다.
7. 필요하면 Transform, Derived Tag, Collection Policy를 설정합니다.
8. Job을 시작하고 Dashboard와 로그를 확인합니다.
9. `Data Viewer`에서 저장된 값을 Raw 표나 Chart로 확인합니다.

## 화면 구성

![실제 데이터를 수집 중인 OPC UA Client 화면](/images/app-overview-running.png)

- 좌측 사이드바
  - Job 목록과 실행 스위치
  - `New Job`
  - `Server Settings`: Database Server 관리
  - `OPC UA Servers`: OPC UA 연결 프로필 관리
- 메인 화면
  - 선택한 Job의 상태, Node, Derived Tag, 저장 위치와 정책
  - `Live Logs`, `Data Viewer`, `Edit`, `Delete`
- 설정 창
  - Database Server, OPC UA Server, 인증서와 저장 로그 관리

## 문서 목록

- [Server 설정]({{< relref "server-settings" >}})
- [Job 생성과 실행]({{< relref "create-and-run-job" >}})
- [모니터링과 로그]({{< relref "monitoring-and-logs" >}})
- [Data Viewer]({{< relref "data-viewer" >}})
- [문제 해결]({{< relref "troubleshooting" >}})

## 문서 이동

- [다음: Server 설정]({{< relref "server-settings" >}})
