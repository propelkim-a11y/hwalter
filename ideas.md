# 활터 있소 - 디자인 아이디어

## 앱 개요
국궁 시수 기록 웹 앱 - 사대 위에서 한 손으로 조작 가능한 모바일 최적화 앱

---

<response>
<probability>0.07</probability>
<text>

## 아이디어 1: 전통 서예 미니멀리즘 (Traditional Ink Minimalism)

**Design Movement**: 한국 전통 서예 + 일본 와비사비(Wabi-sabi) 미학

**Core Principles**:
- 먹(墨)의 농담(濃淡)으로 계층 구조 표현 - 검정, 회색, 흰색의 절제된 팔레트
- 여백(餘白)을 적극적 디자인 요소로 활용
- 붓 터치를 연상시키는 유기적 선과 형태
- 기능 중심의 극도로 절제된 UI

**Color Philosophy**:
- 배경: 순백(#FFFFFF) - 한지(韓紙)의 순결함
- 주조색: 먹색(#1A1A1A) - 전통 먹의 깊이
- 보조색: 연묵(#888888) - 먹이 번진 중간 톤
- 강조색: 주홍(#C0392B) - 낙관(落款)의 붉은 인장

**Layout Paradigm**:
- 세로 스크롤 단일 컬럼, 최대 너비 420px
- 섹션 간 넓은 여백으로 호흡감 부여
- 버튼은 크고 터치하기 쉬운 사각형 형태

**Signature Elements**:
- 섹션 구분선: 붓으로 그린 듯한 가는 수평선
- 숫자 표시: 한자 느낌의 고딕 폰트
- O/X 버튼: 먹으로 쓴 듯한 굵은 글씨체

**Interaction Philosophy**:
- 탭 시 즉각적인 색상 반전 (흰↔검)
- 저장 시 잉크가 번지는 듯한 ripple 효과
- 스크롤 시 섹션이 부드럽게 페이드인

**Animation**:
- 버튼 활성화: 150ms ease-out 색상 전환
- 페이지 로드: 요소들이 위에서 아래로 20px 슬라이드인 (stagger 50ms)
- 저장 완료: 0.3s scale(1.05) → scale(1) 바운스

**Typography System**:
- 헤더: Noto Serif KR Bold - 전통적 권위감
- 본문: Noto Sans KR Regular - 가독성
- 숫자: Noto Serif KR Bold - 명확한 수치 표현

</text>
</response>

<response>
<probability>0.06</probability>
<text>

## 아이디어 2: 군사 전술 대시보드 (Tactical Field Dashboard)

**Design Movement**: 밀리터리 HUD + 다크 테크 미학

**Core Principles**:
- 어두운 배경에 형광 녹색/앰버 색상으로 데이터 강조
- 격자(Grid) 패턴과 스캔라인 텍스처로 군사 장비 느낌
- 모노스페이스 폰트로 정밀도와 신뢰감 표현
- 최소한의 장식, 최대한의 정보 밀도

**Color Philosophy**:
- 배경: 짙은 올리브(#1C2B1A) - 군복의 색
- 주조색: 형광 녹색(#39FF14) - 야간 조준경
- 보조색: 앰버(#FFB300) - 경고 표시
- 위험색: 빨강(#FF3333) - 실패/X 표시

**Layout Paradigm**:
- HUD 스타일 - 모서리에 장식적 코너 브래킷
- 데이터 패널들이 격자로 배치
- 스캔라인 오버레이로 레트로 디지털 느낌

**Signature Elements**:
- 코너 브래킷 장식 (┌ ┐ └ ┘)
- 점선 구분선
- 숫자 카운터 애니메이션

**Interaction Philosophy**:
- 클릭 시 비프음 느낌의 즉각적 피드백
- 데이터 업데이트 시 숫자 롤업 애니메이션
- 로딩 시 스캔 효과

**Animation**:
- 숫자 카운트업: 500ms ease-out
- 버튼 클릭: 100ms 색상 플래시
- 섹션 진입: 좌측에서 슬라이드인

**Typography System**:
- 모든 텍스트: JetBrains Mono
- 헤더: 대문자, 자간 넓게
- 숫자: 모노스페이스 굵게

</text>
</response>

<response>
<probability>0.08</probability>
<text>

## 아이디어 3: 대나무 숲 자연주의 (Bamboo Forest Naturalism) ← 선택

**Design Movement**: 한국 전통 자연미 + 현대적 클린 UI

**Core Principles**:
- 대나무와 흙의 자연 색조 팔레트로 활터의 야외 분위기 표현
- 모바일 우선 단일 컬럼 레이아웃 - 한 손 조작 최적화
- 카드 기반 섹션 구분으로 명확한 정보 계층
- 충분한 터치 타겟 크기 (최소 48px)

**Color Philosophy**:
- 배경: 따뜻한 크림(#FAFAF7) - 한지의 온기
- 주조색: 대나무 녹색(#2D5016) - 활터 주변 자연
- 보조색: 황토(#8B6914) - 흙과 나무
- 강조색: 진홍(#8B1A1A) - 과녁의 붉은 중심
- 텍스트: 짙은 먹색(#1A1A1A)

**Layout Paradigm**:
- 최대 너비 480px 중앙 정렬 단일 컬럼
- 섹션 카드에 미세한 그림자와 둥근 모서리
- 상단 헤더는 고정(sticky)으로 앱 정체성 유지

**Signature Elements**:
- 섹션 헤더에 작은 아이콘 + 한글 레이블
- O/X 버튼: 크고 명확한 토글 - 활성 시 진홍/먹색
- 통계 그리드: 배경색 변화로 중수별 시각적 구분

**Interaction Philosophy**:
- 버튼 탭 시 scale(0.96) 피드백으로 물리적 느낌
- 저장 성공 시 토스트 알림
- 탭 전환 시 부드러운 슬라이드

**Animation**:
- 버튼 활성화: 150ms ease-out 배경색 전환
- 카드 진입: opacity 0→1, translateY 12px→0 (200ms)
- 저장 버튼: active 시 scale(0.97) 100ms

**Typography System**:
- 헤더: Noto Serif KR 700 - 전통적 권위
- 본문/레이블: Noto Sans KR 400/500 - 가독성
- 숫자/점수: Noto Serif KR Bold - 명확한 수치

</text>
</response>

---

## 선택: 아이디어 3 - 대나무 숲 자연주의
활터의 야외 자연 분위기를 담으면서도 현대적 모바일 UI의 사용성을 갖춘 디자인.
