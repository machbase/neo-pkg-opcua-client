# OPC UA Collector 사용자 매뉴얼

> OPC UA 데이터 수집 및 Machbase Neo 연동 솔루션

---

## 목차

1. [개요](#1-개요)
2. [메인 화면 (Collector 상세 보기)](#2-메인-화면-collector-상세-보기)
3. [새 Collector 생성](#3-새-collector-생성)
4. [Collector 관리](#4-collector-관리)
5. [로그 관리](#5-로그-관리)
6. [데이터 변환 (Transform)](#6-데이터-변환-transform)
7. [사용 시나리오](#7-사용-시나리오)
8. [문제 해결](#8-문제-해결)
9. [용어 정리](#9-용어-정리)

---

## 1. 개요

OPC UA Collector는 OPC UA 프로토콜을 통해 산업 장비 및 센서의 데이터를 실시간으로 수집하고, 이를 Machbase Neo 데이터베이스에 자동으로 저장하는 웹 기반 데이터 수집 애플리케이션입니다.

### 1.1 주요 기능

- OPC UA 서버에 접속하여 지정된 노드의 데이터를 주기적으로 수집
- 수집된 데이터를 Machbase Neo 데이터베이스의 TAG 테이블에 저장
- 노드 데이터에 수식(Transform)을 적용하여 변환된 값으로 저장
- 여러 개의 Collector를 독립적으로 생성, 관리 및 실행
- 실시간 로그 모니터링 및 로그 레벨 제어
- OPC UA 서버 브라우징을 통한 노드 탐색 및 선택

### 1.2 화면 구성

애플리케이션은 좌측 사이드바와 우측 메인 콘텐츠 영역으로 구성됩니다.

| 영역 | 설명 |
|------|------|
| 좌측 사이드바 | 생성된 Collector 목록 표시, 새 Collector 추가, 목록 새로고침 버튼 제공 |
| 메인 콘텐츠 | 선택된 Collector의 상세 정보 및 설정 표시 |

---

## 2. 메인 화면 (Collector 상세 보기)

사이드바에서 Collector를 선택하면 해당 Collector의 상세 정보가 메인 화면에 표시됩니다.

### 2.1 상태 표시

화면 상단에는 Collector의 이름과 현재 동작 상태가 표시됩니다.

| 상태 | 설명 |
|------|------|
| `STOPPED` | Collector가 현재 중지된 상태입니다. (빨간색 배지) |
| `RUNNING` | Collector가 현재 실행 중인 상태입니다. (초록색 배지) |

### 2.2 우측 상단 버튼

| 버튼 | 기능 |
|------|------|
| **Edit** (파란색) | 선택된 Collector의 설정을 수정하는 편집 화면으로 이동합니다. |
| **Delete** (빨간색) | 선택된 Collector를 삭제합니다. 삭제 전 확인이 필요합니다. |

### 2.3 정보 카드

메인 화면은 세 개의 정보 카드로 구성됩니다.

#### OPC UA 카드

- **SERVER**: 연결된 OPC UA 서버의 엔드포인트 URL
- **INTERVAL**: 데이터 수집 주기 (밀리초 단위)
- **READ RETRY**: 읽기 실패 시 재시도 간격 (밀리초 단위)

#### Nodes Monitored 카드

- 현재 모니터링 중인 노드의 총 개수를 크게 표시
- **LAST UPDATED AT**: 마지막으로 데이터가 수집된 시각

#### DATABASE 카드

- **SERVER**: 데이터를 저장할 Machbase Neo 서버
- **TABLE**: 데이터가 저장되는 테이블 이름
- **COLUMN**: 값이 저장되는 컬럼 이름

### 2.4 Monitored Nodes 테이블

현재 수집 중인 노드 목록을 테이블 형식으로 보여줍니다.

| 컬럼 | 설명 | 비고 |
|------|------|------|
| TAG NAME | 노드에 부여된 태그 이름 | 클릭하여 정렬 가능 |
| NODE ID | OPC UA 서버에서의 노드 식별자 | 클릭하여 정렬 가능 |
| TRANSFORM | 적용된 데이터 변환 수식 | 예: `(value + 100) × 10` |

> 💡 우측 상단의 **Filter nodes...** 입력창을 이용하여 TAG NAME 또는 NODE ID로 노드를 필터링할 수 있습니다.

### 2.5 Logging Controls

화면 하단에 위치하며, 로그 수집 설정을 표시합니다.

| 항목 | 설명 |
|------|------|
| LOG LEVEL | 현재 설정된 로그 레벨 (TRACE / DEBUG / INFO / WARN / ERROR) |
| FILE LIMIT | 보관할 최대 로그 파일 수 |
| **View Logs** 버튼 | 현재 Collector의 로그 파일 목록을 확인하는 다이얼로그 오픈 |

---

## 3. 새 Collector 생성

좌측 사이드바 상단의 **`+`** 버튼을 클릭하면 새 Collector 생성 화면(`New Collector Configuration`)으로 이동합니다.

### 3.1 COLLECTOR 섹션

| 항목 | 설명 | 예시 |
|------|------|------|
| **NAME** | Collector의 고유 이름 (필수) | `FLOW-WEST-001` |

### 3.2 OPC UA SERVER 섹션

| 항목 | 설명 | 기본값 |
|------|------|--------|
| **ENDPOINT URL** | OPC UA 서버의 접속 주소 (필수) | `opc.tcp://192.168.1.100:4840` |
| **INTERVAL (MS)** | 데이터 수집 주기 (밀리초) | `5000` |
| **READ RETRY LIMIT** | 읽기 실패 시 재시도 횟수 제한 | `100` |

> ℹ️ INTERVAL은 밀리초(ms) 단위입니다. 예를 들어 `1000ms = 1초`, `5000ms = 5초` 주기로 데이터를 수집합니다.

### 3.3 DATABASE 섹션

| 항목 | 설명 | 비고 |
|------|------|------|
| **DATABASE SERVER** | 연결할 Machbase Neo 서버 | 드롭다운에서 선택. `+` 버튼으로 새 서버 추가 가능 |
| **TABLE** | 데이터를 저장할 테이블 | Database Server 선택 후 활성화됨 |
| **VALUE COLUMN** | 값을 저장할 컬럼 | Table 선택 후 활성화됨. 선택한 컬럼에 모든 노드 값 저장 |

> ℹ️ "All node values will be written to the selected column." — 모든 모니터링 노드의 값은 선택한 단일 컬럼에 기록됩니다.

### 3.4 NODE MAPPING 섹션

OPC UA 서버의 어떤 노드(센서)를 어떤 태그 이름으로 수집할지 매핑합니다.

#### 노드 직접 추가

- **TAG NAME**: 수집 데이터에 부여할 사용자 정의 태그 이름 (예: `Tank_Temp_01`)
- **NODE ID**: OPC UA 서버에서의 노드 식별자 (예: `ns=2;s=Device.Sensor1`)
- TAG NAME과 NODE ID를 입력한 후 **Add** 버튼을 클릭하면 목록에 추가됩니다.

#### Browse를 통한 노드 탐색

- **Browse** 버튼을 클릭하면 OPC UA 서버에 접속하여 노드 트리를 탐색할 수 있습니다.
- 서버의 노드 계층 구조를 직접 탐색하며 원하는 노드를 선택할 수 있습니다.

#### 매핑된 노드 목록

| 컬럼 | 설명 | 비고 |
|------|------|------|
| TAG NAME | 매핑된 태그 이름 | 정렬 가능 |
| NODE ID | 노드 식별자 | 정렬 가능 |
| **Bias** | 수식의 더하기 오프셋 값 | Transform: `value + Bias` |
| **Multiplier** | 수식의 곱하기 계수 | Transform: `× Multiplier` |
| Actions | 노드 삭제 버튼 (휴지통 아이콘) | 해당 노드 매핑 제거 |

> 💡 Transform 수식은 **(value + Bias) × Multiplier** 형식으로 계산됩니다.  
> 예: Bias=100, Multiplier=10 → `(value + 100) × 10`

### 3.5 LOGGING CONTROLS 섹션 (생성/편집 화면)

편집 화면에서는 각 로그 레벨 버튼을 클릭하여 원하는 레벨을 선택할 수 있으며, FILE LIMIT 값을 직접 입력할 수 있습니다.

| 로그 레벨 | 설명 |
|-----------|------|
| **TRACE** | 가장 상세한 로그. TRACE, DEBUG, INFO, WARN, ERROR 메시지를 모두 기록 |
| **DEBUG** | DEBUG, INFO, WARN, ERROR 메시지 기록 |
| **INFO** | INFO, WARN, ERROR 메시지 기록 |
| **WARN** | WARN, ERROR 메시지만 기록 |
| **ERROR** | ERROR 메시지만 기록 |

> ⚠️ 운영 환경에서는 **INFO** 또는 **WARN** 레벨을 권장합니다. TRACE/DEBUG 레벨은 대량의 로그를 생성하여 성능에 영향을 줄 수 있습니다.

### 3.6 생성/편집 완료

| 버튼 | 동작 |
|------|------|
| **Create** | 설정을 저장하고 새 Collector를 생성합니다. 사이드바에 추가됩니다. |
| **Update** | 변경된 설정을 저장합니다. |
| **Cancel** | 변경 사항을 저장하지 않고 이전 화면으로 돌아갑니다. |

---

## 4. Collector 관리

### 4.1 사이드바 기능

| UI 요소 | 기능 |
|---------|------|
| **`+` 버튼** | 새 Collector 생성 화면으로 이동합니다. |
| **새로고침(↻) 버튼** | Collector 목록을 서버에서 다시 불러옵니다. |
| **Collector 이름 클릭** | 해당 Collector의 상세 정보를 메인 화면에 표시합니다. |
| **토글 스위치** | Collector의 실행/중지 상태를 전환합니다. (활성화 시 파란색) |

> ✅ 토글 스위치로 Collector를 시작하면 설정된 INTERVAL 주기마다 OPC UA 서버에서 데이터를 수집하여 데이터베이스에 저장합니다.

### 4.2 Collector 실행 및 중지

사이드바의 Collector 이름 우측에 있는 **토글 스위치**를 클릭하여 Collector를 시작하거나 중지할 수 있습니다.

- 토글이 **활성화(파란색)** 되면 Collector가 `RUNNING` 상태로 전환됩니다.
- 토글이 **비활성화(회색)** 되면 Collector가 `STOPPED` 상태로 전환됩니다.
- 메인 화면 상단의 상태 배지가 실시간으로 업데이트됩니다.

### 4.3 Collector 삭제

Collector 상세 화면 우측 상단의 **Delete** 버튼(빨간색)을 클릭하여 Collector를 삭제할 수 있습니다.

> ⚠️ 삭제된 Collector는 복구할 수 없습니다. 삭제 전 중요한 설정 정보를 백업하는 것을 권장합니다.

---

## 5. 로그 관리

### 5.1 로그 파일 보기

Collector 상세 화면 하단의 **View Logs** 버튼을 클릭하면 해당 Collector의 로그 파일 목록을 확인할 수 있는 다이얼로그가 열립니다.

> ℹ️ 로그 파일은 `Log Files · [Collector 이름]` 형식의 다이얼로그에서 확인할 수 있습니다.

### 5.2 로그 레벨 설명

| 레벨 | 포함 메시지 |
|------|------------|
| **TRACE** | TRACE, DEBUG, INFO, WARN, ERROR (모든 메시지) |
| **DEBUG** | DEBUG, INFO, WARN, ERROR |
| **INFO** | INFO, WARN, ERROR |
| **WARN** | WARN, ERROR |
| **ERROR** | ERROR 만 |

### 5.3 FILE LIMIT

FILE LIMIT는 보관할 최대 로그 파일의 수를 설정합니다. 기본값은 **7개**이며, 로그 파일이 이 숫자를 초과하면 가장 오래된 파일부터 자동 삭제됩니다.

---

## 6. 데이터 변환 (Transform)

### 6.1 Transform 개요

OPC UA 서버에서 수신한 원시 값에 수학적 변환을 적용하여 데이터베이스에 저장할 수 있습니다. 이를 통해 단위 변환, 보정 등의 처리가 가능합니다.

### 6.2 Transform 수식

```
(value + Bias) × Multiplier
```

- **Bias**: 원시 값에 더하는 오프셋
- **Multiplier**: `(value + Bias)` 결과에 곱하는 계수

### 6.3 Transform 예시

| Bias | Multiplier | Transform 표시 | 설명 |
|------|------------|---------------|------|
| `100` | `10` | `(value + 100) × 10` | 원시 값에 100을 더하고 10을 곱함 |
| `0` | `1` | `(value + 0) × 1` | 변환 없음 (원시 값 그대로 저장) |
| `0` | `0.001` | `(value + 0) × 0.001` | 단위 변환 (예: mm → m) |
| `-273.15` | `1` | `(value + (-273.15)) × 1` | 켈빈에서 섭씨로 변환 |

---

## 7. 사용 시나리오

### 7.1 기본 데이터 수집 설정

다음 절차에 따라 기본 데이터 수집을 설정합니다:

1. 좌측 사이드바의 **`+`** 버튼을 클릭하여 새 Collector 생성 화면을 엽니다.
2. **COLLECTOR** 섹션에서 고유한 NAME을 입력합니다. (예: `Factory-Line1`)
3. **OPC UA SERVER** 섹션에서 ENDPOINT URL을 입력합니다. (예: `opc.tcp://192.168.1.100:4840`)
4. INTERVAL을 설정합니다. (예: `1000` = 1초마다 수집)
5. **DATABASE** 섹션에서 연결할 Machbase Neo 서버, 테이블, 컬럼을 선택합니다.
6. **NODE MAPPING** 섹션에서 TAG NAME과 NODE ID를 입력하고 **Add**를 클릭하거나 **Browse**로 탐색합니다.
7. 필요한 경우 Bias와 Multiplier 값을 설정합니다.
8. **Create** 버튼을 클릭하여 Collector를 생성합니다.
9. 사이드바의 토글 스위치를 활성화하여 데이터 수집을 시작합니다.

### 7.2 다수의 센서 모니터링

여러 OPC UA 노드를 하나의 Collector에서 동시에 수집하려면 NODE MAPPING 섹션에서 각 센서에 대한 TAG NAME과 NODE ID를 추가하면 됩니다.

- 하나의 Collector는 여러 개의 Node를 동시에 모니터링할 수 있습니다.
- 각 Node마다 독립적인 Bias/Multiplier(Transform) 값을 설정할 수 있습니다.
- Filter 기능으로 특정 노드를 빠르게 찾을 수 있습니다.

---

## 8. 문제 해결

| 증상 | 확인 사항 및 해결 방법 |
|------|----------------------|
| Collector가 RUNNING으로 전환되지 않음 | OPC UA 서버 주소(Endpoint URL)가 올바른지 확인하고, 서버가 실행 중인지 확인하세요. |
| 데이터베이스에 데이터가 저장되지 않음 | DATABASE 섹션의 서버, 테이블, 컬럼 설정이 올바른지 확인하세요. View Logs에서 오류 로그를 확인하세요. |
| Browse 버튼 클릭 후 노드가 표시되지 않음 | Endpoint URL이 정확히 입력되었는지, OPC UA 서버가 접근 가능한 상태인지 확인하세요. |
| 저장되는 값이 예상과 다름 | Transform 수식(Bias, Multiplier)을 확인하세요. Bias=0, Multiplier=1로 설정하면 원시 값이 그대로 저장됩니다. |
| 로그 파일이 너무 많이 쌓임 | FILE LIMIT 값을 줄이거나 LOG LEVEL을 WARN 또는 ERROR로 높이세요. |

---

## 9. 용어 정리

| 용어 | 설명 |
|------|------|
| **OPC UA** | 산업용 기기 간 데이터 통신 표준 프로토콜 (IEC 62541) |
| **Collector** | OPC UA 서버에서 데이터를 수집하는 설정 단위 |
| **Node ID** | OPC UA 서버에서 특정 데이터 포인트를 식별하는 고유 식별자 |
| **Tag Name** | 수집 데이터에 부여하는 사용자 정의 이름 |
| **Transform** | 수집된 원시 데이터에 적용하는 수학적 변환 수식 |
| **Endpoint URL** | OPC UA 서버의 접속 주소 (예: `opc.tcp://host:4840`) |
| **Interval** | 데이터 수집 주기 (밀리초 단위) |
| **Bias** | Transform 수식에서 원시 값에 더하는 오프셋 |
| **Multiplier** | Transform 수식에서 `(value + Bias)` 결과에 곱하는 계수 |
| **Machbase Neo** | 시계열 데이터 저장에 최적화된 데이터베이스 플랫폼 |

---

*Machbase Neo — OPC UA Collector User Manual*
