# 활터 왔소 🏹

국궁인을 위한 시수 기록 앱입니다.

**라이브 데모:** [hwalter.manus.space](https://hwalter.manus.space)

---

## 주요 기능

- **시수 기록** — 1순(5시) O/X 입력, GPS 기반 활터 자동 인식
- **성장형 나무** — 누적 관중에 따라 🌱→🌿→🌲→🌳 성장, 몰기 달성 시 특수 오브젝트 해금
- **시수 통계** — 일별/주별/월별/활터별/전체 통계
- **시수 일지** — 날짜별 기록 조회, CSV 내보내기/가져오기 (나무 이름 포함)
- **CSV 백업 알림** — 7일마다 백업 권장 알림 배너
- **현재 활터** — GPS 기반 가까운 활터 5곳 거리순 표시
- **왔소앱 현황** — 활터 현재원 / 실시간 접속자 / 전체 누적 현황판
- **관리자 모드** — 활터 등록(CSV 일괄 등록 포함), 공지사항, 반경 설정

---

## 기술 스택

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend:** Supabase (활터 목록, 실시간 현황판)
- **빌드:** Vite 7 + pnpm

---

## 로컬 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 시작
pnpm dev
# → http://localhost:3000
```

---

## 환경 변수

`client/src/lib/supabase.ts` 파일에 Supabase 연결 정보가 포함되어 있습니다.  
공개 저장소로 운영할 경우 환경 변수로 분리하는 것을 권장합니다.

```ts
// client/src/lib/supabase.ts
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
```

---

## 라이선스

개인 프로젝트 — 비상업적 사용에 한해 자유롭게 참고하실 수 있습니다.
