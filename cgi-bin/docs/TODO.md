# TODO

## `onChanged` 옵션 — 값 변경 시에만 append

### 배경

현재 Collector는 매 polling 주기마다 모든 노드 값을 무조건 DB에 append한다.
값이 바뀌지 않았어도 동일한 데이터가 계속 쌓이는 문제가 있다.
노드별로 `onChanged: true`를 설정하면 이전 값과 달라졌을 때만 append되도록 한다.

### Config 스키마 변경

`config.opcua.nodes[]`에 선택 필드 추가:

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `onChanged` | boolean | `false` | `true`이면 이전 값과 다를 때만 append |

필드가 없거나 `false`이면 기존 동작 그대로 (역호환).

### 동작 정의

| 상황 | 동작 |
|------|------|
| `onChanged` 없음 / `false` | 매 주기마다 항상 append |
| `onChanged: true`, 첫 수집 | append (이전 값 없음) |
| `onChanged: true`, 값 동일 | 해당 노드 skip, trace 로그 기록 |
| `onChanged: true`, 값 변경 | `_previousValues` 갱신 후 append |
| 모든 노드 skip → matrix 비어있음 | `append()` 및 `_recordLastCollectedAt()` 미호출 |

---

### 작업 목록

**`src/collector.js`**

- constructor (`line 27` 근처): `this._previousValues = {}` 초기화
- `collect()` — `nodes.forEach` 루프 내, `_normalizeValue()` 호출 직후:
  - `node.onChanged`가 `true`이면 `this._previousValues[node.name]`과 비교
  - 값이 같으면 trace 로그 후 `return` (forEach 콜백이므로 continue 대신 return)
  - 값이 다르면 `_previousValues` 갱신 후 기존 흐름(lastTs 갱신 → matrix.push) 진행
- `collect()` — `append()` 호출 직전:
  - `matrix.length === 0`이면 trace 로그 후 return (append / lastCollectedAt 미호출)

**`test/collector.test.js`**

- `onChanged: true` 노드에서 값이 동일할 때 matrix에 포함되지 않는지 확인
- `onChanged: true` 노드에서 값이 달라지면 matrix에 포함되는지 확인
- `onChanged` 없는 노드는 기존대로 항상 포함되는지 확인
- 모든 노드가 skip되어 matrix가 빌 때 `_dbStream.append` 미호출 확인
- `onChanged: true` 첫 수집 시 (이전 값 없음) 정상 append 확인

**`docs/API.md`**

- `POST /collector` 요청 본문 필드 표에 `config.opcua.nodes[].onChanged` 행 추가
- `PUT /collector` 설명에도 동일하게 반영

**`CLAUDE.md`**

- Collector API 규칙 내 nodes 필드 목록에 `onChanged` 항목 추가

---

### 체크리스트

- [ ] `collector.js` — `_previousValues` 초기화
- [ ] `collector.js` — `onChanged` 필터링 로직
- [ ] `collector.js` — 빈 matrix 처리
- [ ] `collector.test.js` — 값 동일 시 skip 테스트
- [ ] `collector.test.js` — 값 변경 시 append 테스트
- [ ] `collector.test.js` — `onChanged` 없는 노드 기존 동작 테스트
- [ ] `collector.test.js` — 빈 matrix append 미호출 테스트
- [ ] `collector.test.js` — 첫 수집 append 테스트
- [ ] `docs/API.md` — `onChanged` 필드 문서 추가
- [ ] `CLAUDE.md` — nodes 필드 목록 업데이트
