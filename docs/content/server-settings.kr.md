---
title: Server 설정
weight: 20
---

Job은 두 종류의 연결 정보를 사용합니다.

- **Database Server**: 수집한 값을 저장할 Machbase Database
- **OPC UA Server**: 값을 읽을 OPC UA Endpoint와 보안 설정

둘 중 어느 것을 먼저 등록해도 되지만, Job을 만들기 전에는 두 서버를 모두 준비하는 것이 좋습니다.

## Database Server 등록

좌측 사이드바의 `Server Settings`를 열고 `Add Server`를 누릅니다.

![저장된 Database Server 설정을 다시 확인하는 입력 화면](/images/database-server-form.png)

입력 항목은 다음과 같습니다.

- `Name`: Job에서 선택할 프로필 이름
- `Host`, `Port`
- `Database`
- `User`, `Password`

`Database` 입력란의 목록 버튼을 누르면 현재 계정으로 접근할 수 있는 Database를 조회합니다. 새 서버에서는 먼저 `User`와 `Password`를 입력해야 합니다. `READ_WRITE` Database만 선택하고 저장할 수 있습니다.

입력이 끝나면 `Create`를 누릅니다. 등록 폼 안에는 별도의 Connection Test 버튼이 없습니다.

## Database 연결 시험

![연결 시험에 성공한 Database Server 목록](/images/database-servers-tested.png)

1. `Database Servers` 목록으로 돌아갑니다.
2. 등록한 서버의 `Connection Test` 아이콘을 누릅니다.
3. `Connected`가 표시되는지 확인합니다.

`Edit`은 연결 정보를 바꾸고 `Delete`는 프로필을 지웁니다. Job이 사용하는 프로필을 삭제하면 그 Job의 수정이나 재시작에 문제가 생길 수 있습니다.

## OPC UA Server 등록

좌측 사이드바의 `OPC UA Servers`를 열고 `Add OPC UA Server`를 누릅니다. 폼은 `Server Input`과 `Security` 탭으로 나뉩니다.

### Server Input

![연결 시험을 마친 OPC UA Server 설정 편집 화면](/images/opcua-server-input-tested.png)

- `Name`: Job에서 선택할 프로필 이름
- `Endpoint URL`: 예: `opc.tcp://127.0.0.1:4840`
- `Read Batch Size`: 한 번에 읽을 Node 수

새 프로필은 먼저 `Connection Test`에 성공해야 `Read Batch Size`를 입력하고 `Create`할 수 있습니다. 연결 시험 결과에서 서버의 `Max Nodes Per Read` 값을 확인하며, 입력 가능한 Batch Size도 이 제한을 따릅니다. 서버가 제한을 알려 주지 않으면 화면에 Unlimited로 표시될 수 있습니다.

### Security

![OPC UA Server Security 설정 화면](/images/opcua-server-security.png)

`Security Mode`는 다음 두 가지입니다.

- `None`
- `Sign & Encrypt`

`Sign & Encrypt`를 선택하면 다음 Security Policy 중 하나를 선택합니다.

- `Basic256Sha256`
- `Basic256`
- `Aes128_Sha256_RsaOaep`
- `Aes256_Sha256_RsaPss`

`Auth Mode`는 `Anonymous` 또는 `UserName`입니다. `UserName`을 선택하면 Username과 Password를 입력합니다.

암호화 연결에는 Client Certificate와 Private Key가 필요합니다. `Cert PEM`과 `Key PEM`에 내용을 붙여 넣거나 파일을 선택해 넣을 수 있습니다. 개인키는 다른 사람에게 공개하지 마세요.

## 자체 서명 인증서 만들기

`OPC UA Servers` 목록 아래의 열쇠 아이콘은 자체 서명 인증서를 만드는 기능입니다.

1. 인증서 이름과 유효 기간을 입력합니다.
2. `Generate`를 누릅니다.
3. 생성 결과를 ZIP으로 내려받아 안전한 곳에 보관합니다.
4. 필요한 경우 인증서와 키를 OPC UA Server 프로필에 등록합니다.

생성 결과에는 Private Key가 포함되므로 화면 공유나 스크린샷에 노출하지 마세요.

## OPC UA 연결 시험

![연결 시험에 성공한 OPC UA Server 목록](/images/opcua-servers-tested.png)

- 등록 전: 폼 아래의 `Connection Test`를 사용합니다.
- 등록 후: `OPC UA Servers` 목록의 `Connection Test` 아이콘을 사용합니다.

Endpoint, 보안 방식, 사용자 인증, 인증서 중 하나라도 서버 설정과 다르면 시험이 실패할 수 있습니다.

## 문서 이동

- [목차로 돌아가기]({{< relref "/" >}})
- [다음: Job 생성과 실행]({{< relref "create-and-run-job" >}})
