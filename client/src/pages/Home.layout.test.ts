import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  fileURLToPath(new URL("./Home.tsx", import.meta.url)),
  "utf8",
);

describe("활터 선택 UI 배치", () => {
  it("현재 활터 섹션 마지막 영역에 현황 조회 활터 선택기를 둔다", () => {
    const currentRangeStart = homeSource.indexOf('icon="📍" title="현재 활터"');
    const statusStart = homeSource.indexOf('icon="📊" title="왔소 현황"');
    const currentRangeSection = homeSource.slice(currentRangeStart, statusStart);

    expect(currentRangeStart).toBeGreaterThanOrEqual(0);
    expect(statusStart).toBeGreaterThan(currentRangeStart);
    expect(currentRangeSection).toContain("활터 조회");
    expect(currentRangeSection).toContain("🔍");
    expect(currentRangeSection).toContain("ref={clubSearchRef}");
    expect(currentRangeSection).toContain("현재원 {clubCount}명");
    expect(currentRangeSection).toContain("selectedDistance");
    expect(currentRangeSection).toContain("bearingLabel(selectedBearing)");
    expect(currentRangeSection).toContain("지도에서 보기");
    expect(currentRangeSection).toContain("getVisibleClubComment(selectedClub?.comment)");
    expect(currentRangeSection).toContain("위치 권한을 허용하면 가까운 활터 5곳과 거리·방향을 보여드립니다.");
    expect(currentRangeSection).not.toContain("GPS 수신 중");
  });

  it("왔소 현황 섹션에는 중복된 활터 선택기가 없다", () => {
    const statusStart = homeSource.indexOf('icon="📊" title="왔소 현황"');
    const statsStart = homeSource.indexOf('icon="📊" title="시수 통계"', statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(statusSection).not.toContain("ref={clubSearchRef}");
    expect(statusSection).not.toContain('label="활터 현재원"');
    expect(statusSection).not.toContain("selectedClub.name} 지도에서 보기");
    expect(statusSection).not.toContain("selectedClub?.comment");
  });

  it("왔소 현황에 전체 활터 현재원과 현재원이 있는 소속정 이름을 표시한다", () => {
    const statusStart = homeSource.indexOf('icon="📊" title="왔소 현황"');
    const statsStart = homeSource.indexOf('icon="📊" title="시수 통계"', statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(homeSource).toContain("activeClubStatuses");
    expect(statusSection).toContain("활터 전체 현재원");
    expect(statusSection).toContain("현재원이 있는 소속정이 없습니다.");
    expect(statusSection).toContain("{club.name}");
    expect(statusSection).toContain("{club.count}명");
  });

  it("상단 공지를 카드 형태로 표시하고 접기와 닫기 조작을 제공한다", () => {
    expect(homeSource).toContain("NOTICE_COLLAPSED_KEY");
    expect(homeSource).toContain("NOTICE_DISMISSED_KEY");
    expect(homeSource).toContain("공지 카드");
    expect(homeSource).toContain("공지</span>");
    expect(homeSource).toContain("notice-card-content");
    expect(homeSource).toContain("rounded-2xl border p-3 shadow-sm");
    expect(homeSource).toContain("공지 접기");
    expect(homeSource).toContain("공지 닫기");
    expect(homeSource).toContain("탭하여 펼치기");
  });

  it("시수 기록 카드를 접고 펼치며 마지막 상태를 저장한다", () => {
    expect(homeSource).toContain("RECORD_OPEN_KEY");
    expect(homeSource).toContain('"section_record_open"');
    expect(homeSource).toContain("recordOpen");
    expect(homeSource).toContain("시수 기록 접기");
    expect(homeSource).toContain("시수 기록 펼치기");
    expect(homeSource).toContain("collapsible");
  });

  it("메인 카드에 점 표시 없이 드래그앤드롭 순서와 저장된 순서를 적용한다", () => {
    expect(homeSource).toContain("MAIN_CARD_ORDER_KEY");
    expect(homeSource).toContain("mainCardOrder");
    expect(homeSource).toContain("moveMainCard");
    expect(homeSource).toContain("SortableMainCard");
    expect(homeSource).toContain('cardId="tree"');
    expect(homeSource).toContain('cardId="location"');
    expect(homeSource).toContain('cardId="status"');
    expect(homeSource).toContain('cardId="record"');
    expect(homeSource).toContain('cardId="stats"');
    expect(homeSource).toContain('cardId="journal"');
    expect(homeSource).toContain("카드의 빈 여백을 길게 누른 뒤 위·아래로 끌어 원하는 순서로 바꿀 수 있습니다.");
    expect(homeSource).not.toContain("⠿ 손잡이");
    expect(homeSource).toContain("카드 순서 기본값으로 되돌리기");
  });

  it("메인 카드는 정돈된 테두리·그림자·오버플로우 스타일을 공유한다", () => {
    expect(homeSource).toContain("shadow-[0_4px_14px_rgba(61,90,62,0.08)]");
    expect(homeSource).toContain("border: \"1px solid #E6DED0\"");
    expect(homeSource).toContain("rounded-2xl overflow-hidden");
    expect(homeSource).toContain('rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)] ${collapsible ? "p-0" : "p-4"}');
  });

  it("공지와 메인 카드의 접힘 화살표를 공통 Chevron UI로 통일한다", () => {
    expect(homeSource).toContain("function CollapseChevron");
    expect(homeSource).toContain("<CollapseChevron open={treeOpen} />");
    expect(homeSource).toContain("<CollapseChevron open={locationOpen} />");
    expect(homeSource).toContain("<CollapseChevron open={statusOpen} />");
    expect(homeSource).toContain("<CollapseChevron open={open} />");
    expect(homeSource).toContain("<CollapseChevron open={statOpen} />");
    expect(homeSource).toContain("<CollapseChevron open={journalOpen} />");
  });

  it("접힌 메인 카드의 헤더 높이와 제목·화살표 정렬을 통일한다", () => {
    expect(homeSource).toContain("flex h-14 items-center justify-between px-4");
    expect(homeSource).toContain("flex h-14 w-full items-center justify-between px-4");
    expect(homeSource).toContain('collapsible ? "p-0" : "p-4"');
    expect(homeSource).toContain('className="flex h-14 w-full items-center justify-between px-4 text-left');
  });

  it("접힌 카드에 설명 없이 핵심 요약 값을 표시한다", () => {
    expect(homeSource).toContain("collapsedLocationSummary");
    expect(homeSource).toContain("latestRecordSummary");
    expect(homeSource).toContain("totalMollgiSummary");
    expect(homeSource).toContain("summary={latestRecordSummary}");
    expect(homeSource).toContain("{totalMollgiSummary}회");
    expect(homeSource).toContain("{records.length}순");
  });

  it("메인 카드 헤더의 아이콘·제목·요약을 공통 형식으로 정돈한다", () => {
    expect(homeSource).toContain("function CardHeaderContent");
    expect(homeSource).toContain('icon="📍" title="현재 활터"');
    expect(homeSource).toContain('icon="📊" title="왔소 현황"');
    expect(homeSource).toContain('icon="🎯"');
    expect(homeSource).toContain('icon="📋" title="시수 일지"');
    expect(homeSource).toContain("text-[15px] font-bold tracking-[-0.02em]");
    expect(homeSource).toContain("text-[11px] font-semibold tabular-nums");
  });

  it("설정에서 카드별 표시·숨김 상태를 바꾸고 다시 모두 표시할 수 있다", () => {
    expect(homeSource).toContain("MAIN_CARD_VISIBILITY_KEY");
    expect(homeSource).toContain("mainCardVisibility");
    expect(homeSource).toContain("toggleMainCardVisibility");
    expect(homeSource).toContain("카드 표시");
    expect(homeSource).toContain("모든 카드 다시 표시");
    expect(homeSource).toContain("visible={mainCardVisibility.record}");
  });

  it("설정 메뉴에서 최근 닫은 공지를 확인하고 배너를 다시 표시할 수 있다", () => {
    expect(homeSource).toContain("PastNoticePanel");
    expect(homeSource).toContain("activeNotice={activeNotice}");
    expect(homeSource).toContain("dismissedNotice={dismissedNotice}");
    expect(homeSource).toContain("restoreDismissedNotice");
  });

  it("일반 사용자가 헤더 설정 메뉴에서 지난 공지를 확인할 수 있다", () => {
    expect(homeSource).toContain("showUserSettings");
    expect(homeSource).toContain("설정 열기");
    expect(homeSource).toContain("⚙️ 설정");
    expect(homeSource).toContain("PastNoticePanel");
  });

  it("휴대폰 설정 창은 화면 높이에 맞춰 내부 내용을 스크롤할 수 있다", () => {
    expect(homeSource).toContain("fixed inset-0 z-[60] flex items-start sm:items-center justify-center overflow-y-auto p-4");
    expect(homeSource).toContain("max-h-[calc(100dvh-2rem)]");
    expect(homeSource).toContain("touch-pan-y overflow-y-auto overscroll-contain");
    expect(homeSource).toContain('WebkitOverflowScrolling: "touch"');
  });

  it("소속정 배지를 누르면 지도 자동 열기 없이 해당 활터 조회를 실행한다", () => {
    const selectionStart = homeSource.indexOf("const selectActiveClub =");
    const selectionEnd = homeSource.indexOf("  };", selectionStart);
    const selectionHandler = homeSource.slice(selectionStart, selectionEnd);

    expect(homeSource).toContain("selectActiveClub");
    expect(homeSource).toContain("setSelectedClubId(club.id)");
    expect(homeSource).toContain('getElementById("section-location")');
    expect(selectionHandler).not.toContain("window.open(");
    expect(homeSource).toContain("활터 조회`}");
  });

  it("현황 통계와 전체 활터 현재원은 10분 간격으로 갱신한다", () => {
    expect(homeSource).toContain("const STATS_REFRESH_INTERVAL_MS = 600_000");
    expect(homeSource).toContain("setInterval(fetchStats, STATS_REFRESH_INTERVAL_MS)");
    expect(homeSource).toContain("현황판 조회 (10분마다)");
  });

  it("현황판 연결이 복구되어도 성공 토스트를 표시하지 않는다", () => {
    expect(homeSource).not.toContain("현황판 연결이 복구되었습니다");
    expect(homeSource).not.toContain("statsHadError");
  });

  it("현황판의 마지막 갱신 시각을 간결하게 표시한다", () => {
    expect(homeSource).toContain("statsUpdatedAt");
    expect(homeSource).toContain("setStatsUpdatedAt(new Date().toISOString())");
    expect(homeSource).toContain("`갱신 ${formatTime(statsUpdatedAt)}`");
    expect(homeSource).toContain("실시간 5분 기준 · 누적 전체");
  });

  it("현황판 헤더에서 수동 새로고침을 실행할 수 있다", () => {
    expect(homeSource).toContain('aria-label="왔소 현황 새로고침"');
    expect(homeSource).toContain("<RefreshCw");
    expect(homeSource).toContain("onClick={() => handleRetryStats()}");
    const headerStart = homeSource.indexOf('<div id="section-status"');
    const contentStart = homeSource.indexOf('maxHeight: statusOpen ? 2000', headerStart);
    const refreshButton = homeSource.indexOf('aria-label="왔소 현황 새로고침"');
    expect(refreshButton).toBeGreaterThan(contentStart);
    expect(homeSource).toContain('className="flex h-14 w-full items-center justify-between px-4 transition-all active:scale-[0.99]"');
  });

  it("GPS 위치 변화만으로 현황 새로고침이 반복 시작되지 않는다", () => {
    const fetchStatsStart = homeSource.indexOf("const fetchStats = useCallback");
    const fetchStatsEnd = homeSource.indexOf("// 수동 재시도", fetchStatsStart);
    const fetchStatsSource = homeSource.slice(fetchStatsStart, fetchStatsEnd);
    expect(fetchStatsSource).toContain("}, [selectedClub, radius, clubs]);");
    expect(fetchStatsSource).not.toContain("[selectedClub, radius, clubs, myLat]");
  });

  it("페이지가 숨겨지면 반복 갱신을 멈추고 다시 보일 때 재개한다", () => {
    expect(homeSource).toContain("usePageVisibility");
    expect(homeSource).toContain("const isPageVisible = usePageVisibility()");
    expect(homeSource).toContain("if (!isPageVisible) return;");
    expect(homeSource).toContain("[loadSettings, isPageVisible]");
    expect(homeSource).toContain("[sessionId, selectedClub, isPageVisible]");
    expect(homeSource).toContain("[fetchStats, isPageVisible]");
  });

  it("관리자가 새 공지를 저장하면 이전 공지가 이력으로 보존된다", () => {
    expect(homeSource).toContain("NOTICE_HISTORY_KEY");
    expect(homeSource).toContain("지난 공지 이력");
    expect(homeSource).toContain("noticeHistory");
    expect(homeSource).toContain("updatedHistory");
    expect(homeSource).toContain("이력 전체 삭제");
  });
});
