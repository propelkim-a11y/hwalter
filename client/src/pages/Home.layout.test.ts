import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  fileURLToPath(new URL("./Home.tsx", import.meta.url)),
  "utf8",
);

describe("활터 선택 UI 배치", () => {
  it("현재 활터 섹션 마지막 영역에 현황 조회 활터 선택기를 둔다", () => {
    const currentRangeStart = homeSource.indexOf("📍 현재 활터");
    const statusStart = homeSource.indexOf("📊 왔소앱 현황");
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

  it("왔소앱 현황 섹션에는 중복된 활터 선택기가 없다", () => {
    const statusStart = homeSource.indexOf("📊 왔소앱 현황");
    const statsStart = homeSource.indexOf("📊 시수 통계", statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(statusSection).not.toContain("ref={clubSearchRef}");
    expect(statusSection).not.toContain('label="활터 현재원"');
    expect(statusSection).not.toContain("selectedClub.name} 지도에서 보기");
    expect(statusSection).not.toContain("selectedClub?.comment");
  });

  it("왔소앱 현황에 전체 활터 현재원과 현재원이 있는 소속정 이름을 표시한다", () => {
    const statusStart = homeSource.indexOf("📊 왔소앱 현황");
    const statsStart = homeSource.indexOf("📊 시수 통계", statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(homeSource).toContain("activeClubStatuses");
    expect(statusSection).toContain("활터 전체 현재원");
    expect(statusSection).toContain("현재원이 있는 소속정이 없습니다.");
    expect(statusSection).toContain("{club.name}");
    expect(statusSection).toContain("{club.count}명");
  });

  it("상단 공지 배너에 접기와 닫기 조작을 제공한다", () => {
    expect(homeSource).toContain("NOTICE_COLLAPSED_KEY");
    expect(homeSource).toContain("NOTICE_DISMISSED_KEY");
    expect(homeSource).toContain("공지 접기");
    expect(homeSource).toContain("공지 닫기");
    expect(homeSource).toContain("탭하여 펼치기");
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

  it("현황 통계와 전체 활터 현재원은 60초 간격으로 갱신한다", () => {
    expect(homeSource).toContain("const STATS_REFRESH_INTERVAL_MS = 60_000");
    expect(homeSource).toContain("setInterval(fetchStats, STATS_REFRESH_INTERVAL_MS)");
    expect(homeSource).toContain("현황판 조회 (60초마다)");
  });

  it("페이지가 숨겨지면 반복 갱신을 멈추고 다시 보일 때 재개한다", () => {
    expect(homeSource).toContain("usePageVisibility");
    expect(homeSource).toContain("const isPageVisible = usePageVisibility()");
    expect(homeSource).toContain("if (!isPageVisible) return;");
    expect(homeSource).toContain("[loadSettings, isPageVisible]");
    expect(homeSource).toContain("[sessionId, selectedClub, isPageVisible]");
    expect(homeSource).toContain("[fetchStats, isPageVisible]");
  });
});
