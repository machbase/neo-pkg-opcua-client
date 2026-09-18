---
title: Data Viewer
weight: 50
---

Data Viewer는 Job이 Machbase Database에 저장한 값을 표와 차트로 확인하는 화면입니다.

## 열기

1. Dashboard에서 Job을 선택합니다.
2. 화면 상단의 `Data Viewer`를 누릅니다.

선택한 Job의 Database, Table, Node와 Derived Tag 정보를 사용합니다. JSON Value Column을 사용하는 Job에서는 버튼이 비활성화됩니다. 현재 Data Viewer가 JSON payload를 표와 숫자 차트로 안전하게 나누어 표시하지 못하기 때문입니다.

## Tag 선택

왼쪽 `Tags` 목록에서 하나 이상의 Tag를 선택합니다.

- 원본 Node와 Derived Tag를 함께 선택할 수 있습니다.
- 검색창에서 Tag 이름을 찾을 수 있습니다.
- Derived Tag에는 `derived` 표시가 붙습니다.
- 테이블에 Asset Hierarchy 정보가 있을 때만 `Hierarchy` 탭이 나타납니다.

## 시간 범위

달력 버튼에서 조회 범위를 정합니다. 예를 들어 `Last 10 minutes`는 현재 시각까지 최근 10분을 조회합니다. `Last 10 minutes of data`처럼 마지막 데이터 시각을 기준으로 하는 범위도 선택할 수 있습니다.

새로 고침 버튼은 상대 시간 범위를 현재 시점 또는 마지막 데이터 시점에 다시 고정하고 데이터를 읽습니다. 화면에는 실제로 고정된 시작과 끝 시각이 표시됩니다.

시간 표시 형식과 Time Zone도 바꿀 수 있습니다.

## Raw 보기

`Raw`는 저장된 행을 표로 보여 줍니다.

![실제 저장 데이터를 보여 주는 Data Viewer Raw 화면](/images/data-viewer-raw.png)

- `Backward`: 최신 쪽에서 과거 방향으로 읽음
- `Forward`: 과거 쪽에서 최신 방향으로 읽음
- 페이지 이동 버튼: 이전·다음·처음·끝 페이지로 이동
- `Rows / tag`: Tag 하나당 한 페이지에 읽을 행 수

Tag를 여러 개 선택하면 페이지 크기는 선택한 Tag 수와 `Rows / tag` 값을 함께 반영합니다.

## Chart 보기

`Chart`는 선택한 Tag의 숫자 값을 시간축 선 그래프로 보여 줍니다.

![원본 Tag와 Derived Tag를 함께 표시한 Chart 화면](/images/data-viewer-chart.png)

- 마우스 왼쪽 버튼으로 그래프를 끌면 선택한 구간을 확대합니다.
- 마우스 가운데 버튼으로 끌면 표시 구간을 이동합니다.
- 마우스 오른쪽 버튼으로 끌면 표시 구간을 축소합니다.
- 아래의 미니 차트와 범위 조절 영역으로 확대하거나 축소할 수 있습니다.
- Tag 칩의 분리 버튼으로 개별 Tag 차트를 만들 수 있습니다.
- 분리 차트는 자체 `Time Range`를 가질 수 있습니다.
- `Global Time`은 한 차트의 시간 범위를 다른 차트에도 적용합니다.

## Tag Analyzer로 열기

Chart의 작업 메뉴에서 `Tag Analyzer`를 선택할 수 있습니다. 이 기능은 OPC UA Client를 **neo-web 안에서 열었을 때** 동작합니다.

다음 조건을 만족해야 합니다.

- 숫자 Value Column을 사용해야 합니다.
- 하나 이상의 Tag가 선택되어야 합니다.
- Table의 Tag 이름, 시간, 값 컬럼 정보를 확인할 수 있어야 합니다.

문자열 전용 Job은 Raw에서 값을 확인할 수 있지만 Tag Analyzer에는 보낼 수 없습니다.

## 문서 이동

- [이전: 모니터링과 로그]({{< relref "monitoring-and-logs" >}})
- [목차로 돌아가기]({{< relref "/" >}})
- [다음: 문제 해결]({{< relref "troubleshooting" >}})
