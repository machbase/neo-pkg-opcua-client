# OPC UA Collector Web Frontend

OPC UA 수집기를 관리하기 위한 웹 프론트엔드.

## 기술 스택

- React 19 + React Router 7
- Tailwind CSS 4
- Vite 6
- vite-plugin-singlefile (빌드 결과를 단일 HTML로 번들링)

## 멀티 엔트리 구조

| 엔트리 | HTML | 진입 컴포넌트 | 설명 |
|--------|------|---------------|------|
| index | `index.html` | `IndexApp.jsx` | 기본 페이지 |
| main | `main.html` | `App.jsx` | 메인 앱 (대시보드, 수집기 관리) |
| side | `side.html` | `SideApp.jsx` | 사이드 패널 |

각 엔트리는 `vite-plugin-singlefile`로 개별 빌드되어 단일 HTML 파일로 출력됨.

## 프로젝트 구조

```
src/
├── main.jsx / index-main.jsx / side-main.jsx   # 엔트리별 진입점
├── App.jsx / IndexApp.jsx / SideApp.jsx         # 엔트리별 루트 컴포넌트
├── api/
│   ├── client.js          # HTTP 클라이언트
│   └── collectors.js      # 수집기 API 호출
├── components/
│   ├── collectors/        # 수집기 관련 컴포넌트
│   ├── common/            # 공통 컴포넌트
│   ├── dashboard/         # 대시보드 컴포넌트
│   └── layout/            # 레이아웃 컴포넌트
├── context/
│   └── AppContext.jsx     # 앱 전역 상태
├── hooks/
│   └── useCollectors.js   # 수집기 커스텀 훅
├── pages/
│   ├── DashboardPage.jsx  # 대시보드 페이지
│   └── CollectorFormPage.jsx  # 수집기 생성/수정 폼
└── styles/
    └── index.css          # Tailwind 엔트리
```

## 개발

```bash
# 의존성 설치
npm install

# 개발 서버 (index 엔트리 기본)
npm run dev

# 특정 엔트리로 개발 서버
VITE_ENTRY=main npm run dev
```

개발 서버는 `/public/neo-pkg-opcua-client` 경로를 `http://localhost:5654`로 프록시.

## 빌드

```bash
# 전체 엔트리 빌드 (dist/ 에 출력)
npm run build

# 빌드 후 프로젝트 루트로 HTML 복사
npm run build:root
```

`build:root`는 빌드된 단일 HTML 파일들을 프로젝트 루트(`../`)로 복사하여 machbase-neo에서 직접 서빙할 수 있게 함.
