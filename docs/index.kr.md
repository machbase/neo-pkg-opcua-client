---
title: OPC UA Client 사용자 매뉴얼
weight: 10
---

# OPC UA Client 사용자 매뉴얼

이 문서는 **Machbase Neo OPC UA Client 패키지**의 설치, Database Server 등록, Job 생성, 상태 확인, 로그 조회 방법을 설명합니다.

## 설치

Machbase Neo 좌측 사이드 패널에는 사용 가능한 패키지 목록이 표시됩니다.  
여기서 OPC UA Client 패키지를 선택하고 `Install` 버튼을 누르면 설치할 수 있습니다.

설치에는 약간의 시간이 걸릴 수 있으므로, 완료될 때까지 잠시 기다립니다.

> 스크린샷 위치: `package-install.png`
>
> 권장 장면: Neo 좌측 사이드 패널의 패키지 목록과 선택한 패키지의 Install 버튼이 같이 보이는 화면

## 이 문서에서 다루는 내용

- 패키지 설치
- Database Server 등록
- OPC UA 수집 Job 생성
- Node Mapping과 Transform 설정
- Job 시작/중지와 상태 확인
- 로그 파일 조회

## 기본 작업 순서

1. Neo에서 OPC UA Client 패키지를 설치합니다.
2. Database Server를 등록합니다.
3. 새 Job을 생성합니다.
4. OPC UA Endpoint와 Database Table을 선택합니다.
5. 수집할 Node를 매핑합니다.
6. Job을 시작하고 대시보드에서 상태를 확인합니다.

## 화면 구성

- 좌측 사이드바: Job 목록, 새 Job 생성, Server Settings
- 메인 화면: 선택한 Job 상세 정보 또는 생성/수정 폼
- 모달 창: Database Server 관리, 로그 보기

> 스크린샷 위치: `opcua-dashboard-main.png`
>
> 권장 장면: 좌측 Job 목록과 우측 Job 상세 카드가 함께 보이는 메인 화면

## 문서 목록

- [Server 설정](./server-settings.kr.md)
- [Job 생성과 실행](./create-and-run-job.kr.md)
- [모니터링과 로그](./monitoring-and-logs.kr.md)
- [문제 해결](./troubleshooting.kr.md)

## 문서 이동

- [다음: Server 설정](./server-settings.kr.md)
