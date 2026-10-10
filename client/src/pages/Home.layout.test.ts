import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  fileURLToPath(new URL("./Home.tsx", import.meta.url)),
  "utf8",
);
const globalStyles = readFileSync(
  fileURLToPath(new URL("../index.css", import.meta.url)),
  "utf8",
);

describe("활터 선택 UI 배치", () => {
  it("당근 활터 섹션 최상단에 활터 검색 선택기를 둔다", () => {
    const currentRangeStart = homeSource.indexOf('icon="location" title="당근 활터"');
    const statusStart = homeSource.indexOf('icon="status" title="왔소 현황"');
    const currentRangeSection = homeSource.slice(currentRangeStart, statusStart);

    expect(currentRangeStart).toBeGreaterThanOrEqual(0);
    expect(statusStart).toBeGreaterThan(currentRangeStart);
    expect(currentRangeSection).toContain("활터 검색");
    expect(currentRangeSection).toContain("🔍");
    expect(currentRangeSection).toContain("ref={clubSearchRef}");
    expect(currentRangeSection).toContain('className="relative order-first mb-3" ref={clubSearchRef}');
    expect(currentRangeSection).toContain("현재원 {clubCount}명");
    expect(currentRangeSection).toContain("selectedDistance");
    expect(currentRangeSection).toContain("bearingLabel(selectedBearing)");
    expect(currentRangeSection).toContain("지도에서 보기");
    expect(currentRangeSection).toContain("getVisibleClubComment(selectedClub?.comment)");
    expect(currentRangeSection).toContain("위치 권한을 허용하면 가까운 활터 5곳과 거리·방향을 보여드립니다.");
    expect(currentRangeSection).not.toContain("GPS 수신 중");
    expect(currentRangeSection).toContain('className="flex flex-col px-4 pb-4"');
  });

  it("고대비 모드에서 당근 활터 검색의 선택기·입력·결과를 선명하게 구분한다", () => {
    expect(homeSource).toContain("data-club-search");
    expect(homeSource).toContain("data-club-search-trigger");
    expect(homeSource).toContain("data-club-search-menu");
    expect(homeSource).toContain("data-club-search-input");
    expect(homeSource).toContain("data-club-search-option");
    expect(homeSource).toContain("data-club-map-link");
    expect(globalStyles).toContain("button[data-club-search-trigger]");
    expect(globalStyles).toContain("button[data-club-search-option][data-active=\"true\"]");
    expect(globalStyles).toContain("a[data-club-map-link]");
  });

  it("가까운 활터 순서는 메달·꽃 대신 숫자 배지로 표시한다", () => {
    const currentRangeStart = homeSource.indexOf('icon="location" title="당근 활터"');
    const statusStart = homeSource.indexOf('icon="status" title="왔소 현황"');
    const currentRangeSection = homeSource.slice(currentRangeStart, statusStart);

    expect(currentRangeSection).toContain('aria-label={`가까운 활터 ${idx + 1}위`}');
    expect(currentRangeSection).toContain("{idx + 1}</span>");
    expect(currentRangeSection).not.toContain("🥇");
    expect(currentRangeSection).not.toContain("🥈");
    expect(currentRangeSection).not.toContain("🥉");
    expect(currentRangeSection).not.toContain("🌹");
  });

  it("습사 일지 활터 목록 카드 오른쪽에 방문 날짜와 누적 방문일을 표시한다", () => {
    const journalStart = homeSource.indexOf('icon="journal" title="습사 일지"');
    const statsStart = homeSource.indexOf('icon="support" title="기타 안내"', journalStart);
    const journalSection = homeSource.slice(journalStart, statsStart > journalStart ? statsStart : undefined);

    expect(journalSection).toContain("latestVisitDate");
    expect(journalSection).toContain("{formatDate(group.latestVisitDate)} · 누적 {group.visitDays}일");
    expect(journalSection).not.toContain("최근 방문 {formatDate(group.latestVisitDate)}");
    expect(journalSection).toContain("visitDays");
    expect(journalSection).toContain("· 누적 {group.visitDays}일");
    expect(journalSection).toContain('className="shrink-0 text-[11px] font-medium"');
  });

  it("왔소 현황 섹션에는 중복된 활터 선택기가 없다", () => {
    const statusStart = homeSource.indexOf('icon="status" title="왔소 현황"');
    const statsStart = homeSource.indexOf('icon="statistics" title="시수 통계"', statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(statusSection).not.toContain("ref={clubSearchRef}");
    expect(statusSection).not.toContain('label="활터 현재원"');
    expect(statusSection).not.toContain("selectedClub.name} 지도에서 보기");
    expect(statusSection).not.toContain("selectedClub?.comment");
  });

  it("왔소 현황에 전체 활터 현재원과 현재원이 있는 소속정 이름을 표시한다", () => {
    const statusStart = homeSource.indexOf('icon="status" title="왔소 현황"');
    const statsStart = homeSource.indexOf('icon="statistics" title="시수 통계"', statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(homeSource).toContain("activeClubStatuses");
    expect(statusSection).toContain("전체 활터 현재원");
    expect(statusSection).toContain("현재원이 있는 소속정이 없습니다.");
    expect(statusSection).toContain("{club.name}");
    expect(statusSection).toContain("{club.count}명");
  });

  it("현재원 안내는 전체 활터 현재원 아래에 두고 실시간 기준 안내는 삭제한다", () => {
    const locationStart = homeSource.indexOf('icon="location" title="당근 활터"');
    const statusStart = homeSource.indexOf('icon="status" title="왔소 현황"');
    const statsStart = homeSource.indexOf('icon="statistics" title="시수 통계"', statusStart);
    const locationSection = homeSource.slice(locationStart, statusStart);
    const statusSection = homeSource.slice(statusStart, statsStart);

    expect(locationSection).not.toContain("현재원: 반경");
    expect(statusSection).toContain("현재원: 반경");
    expect(statusSection.indexOf("전체 활터 현재원")).toBeLessThan(statusSection.indexOf("현재원: 반경"));
    expect(statusSection).not.toContain("실시간 5분 기준 · 누적 전체");
  });

  it("왔소 현황의 실시간 접속자와 전체 누적 카드를 같은 높이로 정렬한다", () => {
    expect(homeSource).toContain('className="grid grid-cols-2 items-stretch gap-2 mb-3"');
    expect(homeSource).toContain('mobile-stat-box relative flex h-full min-h-[92px] flex-col items-center justify-center rounded-xl p-3 text-center');
    expect(homeSource).toContain('label="실시간 접속자"');
    expect(homeSource).toContain('label="전체 누적"');
  });

  it("전체 활터 현재원에 겹친 사람 선형 아이콘을 표시한다", () => {
    expect(homeSource).toContain("Users");
    expect(homeSource).toContain('<Users size={15} strokeWidth={2.2} aria-hidden="true" />');
    expect(homeSource).not.toContain("🏹 전체 활터 현재원");
  });

  it("왔소 현황에 도착·이동을 뜻하는 발자국 선형 아이콘을 사용한다", () => {
    expect(homeSource).toContain("Footprints");
    expect(homeSource).toContain("status: Footprints");
    expect(homeSource).not.toContain("status: BarChart3");
  });

  it("기타 안내에 느낌표가 포함된 원형 알림 선형 아이콘을 사용한다", () => {
    expect(homeSource).toContain("CircleAlert");
    expect(homeSource).toContain("support: CircleAlert");
    expect(homeSource).not.toContain("support: HandHeart");
  });

  it("상단 공지를 카드 형태로 표시하고 접기와 닫기 조작을 제공한다", () => {
    expect(homeSource).toContain("NOTICE_COLLAPSED_KEY");
    expect(homeSource).toContain("NOTICE_DISMISSED_KEY");
    expect(homeSource).toContain("공지 카드");
    expect(homeSource).toContain("공지</span>");
    expect(homeSource).toContain("notice-card-content");
    expect(homeSource).toContain("mx-auto max-w-2xl rounded-2xl border shadow-sm");
    expect(homeSource).toContain("공지 접기");
    expect(homeSource).toContain("공지 닫기");
    expect(homeSource).toContain("탭하여 펼치기");
    expect(homeSource).toContain('className={`flex h-14 items-center justify-between ${noticeCollapsed ? "px-4" : "px-0"}`}');
    expect(homeSource).toContain("✕ 닫기");
  });

  it("상단 헤더에 전용 브랜드 마크와 선형 설정 아이콘을 표시한다", () => {
    expect(homeSource).toContain('import { BrandMark } from "@/components/BrandMark"');
    expect(homeSource).toContain('import { HomeScreenInstallCard } from "@/components/HomeScreenInstallCard"');
    expect(homeSource).toContain("<BrandMark size={40}");
    expect(homeSource).toContain('className={`samjoko-brand-mark shrink-0 mix-blend-screen${brandPulse ? " samjoko-brand-mark--active" : ""}`}');
    expect(homeSource).toContain("triggerBrandPulse");
    expect(homeSource).toContain('role="button"');
    expect(homeSource).toContain("tabIndex={0}");
    expect(homeSource).toContain('aria-label="활터 왔소 브랜드, 활성화하려면 Enter 또는 Space"');
    expect(homeSource).toContain("isBrandActivationKey");
    expect(homeSource).toContain("event.preventDefault()");
    expect(homeSource).toContain("inline-flex items-center gap-1.5 text-xl");
    expect(homeSource).toContain("absolute right-4 grid size-9 place-items-center");
    expect(homeSource).toContain('background: "#294B31"');
    expect(homeSource).toContain("<Settings size={17}");
    expect(homeSource).toContain("sticky top-0 z-50 relative flex items-center justify-center");
    expect(homeSource).not.toContain("🏹 활터 왔소");
  });

  it("헤더 아래에 기기별 홈 화면 추가 안내 카드를 배치한다", () => {
    expect(homeSource).toContain("<HomeScreenInstallCard />");
    expect(homeSource.indexOf("<HomeScreenInstallCard />")).toBeLessThan(homeSource.indexOf("{/* 공지 카드 */}"));
  });

  it("설정 화면은 아이콘 선택 목록 없이 기존 사용자 설정만 표시한다", () => {
    expect(homeSource).not.toContain('LinearIconMenu');
    expect(homeSource).not.toContain("선형 아이콘 메뉴");
  });

  it("위치 권한은 사용자가 내 위치 확인을 선택한 이후에만 요청한다", () => {
    expect(homeSource).toContain("LOCATION_PERMISSION_REQUEST_KEY");
    expect(homeSource).toContain("if (!isPageVisible || !locationRequested || !navigator.geolocation) return;");
    expect(homeSource).toContain('localStorage.setItem(LOCATION_PERMISSION_REQUEST_KEY, "true")');
    expect(homeSource).toContain("내 위치 확인");
  });

  it("접힌 공지 카드는 다른 접힌 카드와 같은 56px 높이를 유지한다", () => {
    expect(homeSource).toContain('noticeCollapsed ? "h-14 p-0" : "p-4"');
    expect(homeSource).toContain('noticeCollapsed ? "px-4" : "px-0"');
  });

  it("습사 기록 카드를 접고 펼치며 마지막 상태를 저장한다", () => {
    expect(homeSource).toContain("RECORD_OPEN_KEY");
    expect(homeSource).toContain('"section_record_open"');
    expect(homeSource).toContain("recordOpen");
    expect(homeSource).toContain("습사 기록 접기");
    expect(homeSource).toContain("습사 기록 펼치기");
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
    expect(homeSource).toContain('cardId="support"');
    expect(homeSource).toContain("카드의 빈 여백을 길게 누른 뒤 위·아래로 끌어 원하는 순서로 바꿀 수 있습니다.");
    expect(homeSource).not.toContain("⠿ 손잡이");
    expect(homeSource).toContain("카드 순서 기본값으로 되돌리기");
  });

  it("첫 카드 이동 전에는 방법을, 이동 중에는 놓기 안내를 표시하고 완료 뒤 저장한다", () => {
    expect(homeSource).toContain("MAIN_CARD_MOVE_GUIDE_DONE_KEY");
    expect(homeSource).toContain("showMainCardMoveGuide");
    expect(homeSource).toContain("빈 곳을 길게 누른 뒤 위아래로 움직여 순서를 바꿔보세요.");
    expect(homeSource).toContain("원하는 위치에 놓으세요.");
    expect(homeSource).toContain('localStorage.setItem(MAIN_CARD_MOVE_GUIDE_DONE_KEY, "true")');
    expect(homeSource).toContain("onDragStateChange={setMainCardMoveActive}");
  });

  it("기타 안내 카드는 접기·닫기 상태를 기기별로 저장하고 다시 표시할 수 있다", () => {
    expect(homeSource).toContain("SUPPORT_EVENT_OPEN_KEY");
    expect(homeSource).toContain("SUPPORT_EVENT_DISMISSED_KEY");
    expect(homeSource).toContain("기타 안내");
    expect(homeSource).toContain("기타 안내 내용이 등록되면 이곳에 표시됩니다.");
    expect(homeSource).toContain("기타 안내 닫기");
    expect(homeSource).toContain("기타 안내 다시 표시");
    expect(homeSource).toContain('cardId="support"');
  });

  it("관리자가 기타 안내를 최대 5건까지 저장하면 사용자 카드에 최신순으로 표시한다", () => {
    expect(homeSource).toContain("SUPPORT_EVENTS_KEY");
    expect(homeSource).toContain("supportEventsInput");
    expect(homeSource).toContain("displaySupportEvents");
    expect(homeSource).toContain("MAX_SUPPORT_EVENTS");
    expect(homeSource).toContain("normalizeSupportEvents(supportEventsInput)");
    expect(homeSource).toContain("기타 안내 추가");
    expect(homeSource).toContain("날짜가 최신인 순서로 표시됩니다.");
  });

  it("관리자가 기타 안내에 JPEG 이미지를 첨부하고 사용자 카드에서 함께 볼 수 있다", () => {
    expect(homeSource).toContain('const SUPPORT_IMAGE_BUCKET = "support-images"');
    expect(homeSource).toContain("SUPPORT_IMAGE_MAX_BYTES");
    expect(homeSource).toContain('accept="image/jpeg"');
    expect(homeSource).toContain("uploadSupportEventImage");
    expect(homeSource).toContain("supabase.storage.from(SUPPORT_IMAGE_BUCKET).upload");
    expect(homeSource).toContain("이미지 첨부에 실패했습니다");
    expect(homeSource).toContain("이미지 해제");
    expect(homeSource).toContain("safeSupportImageUrl");
    expect(homeSource).toContain("<SupportEventImage imageUrl={event.imageUrl}");
  });

  it("관리자는 행사 날짜와 장소 링크를 저장하고 사용자 카드는 안전한 웹 링크만 표시한다", () => {
    expect(homeSource).toContain('key: SUPPORT_EVENTS_KEY');
    expect(homeSource).toContain("event.date");
    expect(homeSource).toContain("event.locationUrl");
    expect(homeSource).toContain("safeExternalUrl(event.locationUrl)");
    expect(homeSource).toContain("📅 {formatDate(event.date)}");
    expect(homeSource).toContain("📍 장소 보기");
    expect(homeSource).toContain('target="_blank"');
  });

  it("관리자는 후원·행사 안내 카드를 전체 사용자에게 보여주거나 숨길 수 있다", () => {
    expect(homeSource).toContain("SUPPORT_EVENT_ENABLED_KEY");
    expect(homeSource).toContain("supportEventEnabledInput");
    expect(homeSource).toContain("전체 사용자에게 기타 안내 표시");
    expect(homeSource).toContain('key: SUPPORT_EVENT_ENABLED_KEY, value: String(supportEventEnabledInput)');
    expect(homeSource).toContain("mainCardVisibility.support && supportEventEnabled && !supportEventDismissed");
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
    expect(homeSource).toContain("visitedClubSummary");
    expect(homeSource).toContain("summary={latestRecordSummary}");
    expect(homeSource).toContain("summary={!statOpen ? `방문 ${visitedClubSummary}곳` : undefined}");
    expect(homeSource).not.toContain("totalMollgiSummary");
    expect(homeSource).toContain("{practiceRounds.length}순");
    expect(homeSource).toContain("메모 ${memoRecordCount}건");
  });

  it("시수 통계의 방문 활터 수는 메모 전용·0중 기록도 포함한다", () => {
    expect(homeSource).toContain("const visitedClubRecords = useMemo(");
    expect(homeSource).toContain("records.filter((record) => isValidDate(record.date) && Boolean(record.clubName?.trim()))");
    expect(homeSource).toContain("visitedClubRecords.map((record) => record.clubName?.trim())");
    expect(homeSource).not.toContain("practiceRounds.map((record) => record.clubName?.trim())");
  });

  it("메인 카드를 펼치면 해당 카드가 보이도록 부드럽게 자동 스크롤한다", () => {
    expect(homeSource).toContain("previousMainCardOpenRef");
    expect(homeSource).toContain('data-main-card-id="${openedCardId}"');
    expect(homeSource).toContain('querySelector<HTMLElement>("header.sticky")');
    expect(homeSource).toContain("getBoundingClientRect().height");
    expect(homeSource).toContain("window.scrollTo({ top: Math.max(0, top), behavior: \"smooth\" })");
    expect(homeSource).toContain("- headerHeight - 12");
    expect(homeSource).toContain("}, 380);");
  });

  it("메인 카드 헤더의 아이콘·제목·요약을 공통 형식으로 정돈한다", () => {
    expect(homeSource).toContain("function CardHeaderContent");
    expect(homeSource).toContain('icon="location" title="당근 활터"');
    expect(homeSource).toContain('icon="status" title="왔소 현황"');
    expect(homeSource).toContain('icon="record"');
    expect(homeSource).toContain('icon="journal" title="습사 일지"');
    expect(homeSource).toContain("function CardIcon");
    expect(homeSource).toContain("CARD_ICON_MAP");
    expect(homeSource).toContain("grid-cols-[1.75rem_5rem_minmax(0,1fr)]");
    expect(homeSource).toContain("mobile-card-heading min-w-0 truncate text-base font-bold leading-tight");
    expect(homeSource).toContain("mobile-card-summary justify-self-start max-w-full truncate rounded-full px-2 py-0.5 text-center text-xs font-semibold leading-4 tabular-nums");
  });

  it("휴대폰에서 카드 제목·보조 문구·통계 수치를 읽기 쉬운 공통 스타일로 표시한다", () => {
    expect(globalStyles).toContain("@media (max-width: 480px)");
    expect(globalStyles).toContain(".text-xs");
    expect(globalStyles).toContain("font-size: 0.8125rem");
    expect(globalStyles).toContain("line-height: 1.45");
    expect(globalStyles).toContain("text-rendering: optimizeLegibility");
  });

  it("습사 일지 도구 버튼도 공통 선형 아이콘 체계를 사용한다", () => {
    expect(homeSource).toContain("RecordToolIconButton");
    expect(homeSource).toContain('data-testid={id === "recordTools" ? "journal-record-tools" : undefined}');
    expect(homeSource).toContain('id="recordTools"');
    expect(homeSource).toContain("JOURNAL_RECORD_TOOLS_OPEN_KEY");
    expect(homeSource).toContain("userSettingsOpen.recordTools");
    expect(homeSource).toContain('toggleUserSettingsSection("recordTools")');
    expect(homeSource).toContain("기록 관리");
    expect(homeSource).toContain("백업 · CSV · 초기화");
    expect(homeSource).toContain("기기 변경 전에는 <strong");
    expect(homeSource).toContain('className="grid grid-cols-2 gap-2"');
    expect(homeSource).toContain('className="grid grid-cols-3 gap-2"');
    expect(homeSource).toContain(">보기</span>");
    expect(homeSource).toContain('icon="backup" label="전체 ZIP 백업"');
    expect(homeSource).toContain('icon="restore" label="전체 ZIP 복원"');
    expect(homeSource).toContain('icon="import" label="CSV 불러오기"');
    expect(homeSource).toContain('icon="delete" label="전체 기록 초기화"');
    expect(homeSource).toContain('icon="download" label="CSV 저장"');
    expect(homeSource).toContain('<CardIcon name="backup" />');
    expect(homeSource).toContain('<CardIcon name="record" />');
    const settingsIndex = homeSource.indexOf('aria-labelledby="user-settings-title"');
    const recordToolsIndex = homeSource.indexOf('id="recordTools"');
    const mainIndex = homeSource.indexOf('<main');
    expect(settingsIndex).toBeGreaterThanOrEqual(0);
    expect(recordToolsIndex).toBeGreaterThan(settingsIndex);
    expect(recordToolsIndex).toBeLessThan(mainIndex);
    expect(recordToolsIndex).toBeLessThan(homeSource.indexOf('id="pastNotice"'));
    expect(homeSource).toContain('ref={importFileRef}');
    expect(homeSource).toContain('ref={portableBackupFileRef}');
  });

  it("고대비 모드에서 기록 관리의 안내와 백업·CSV 도구를 선명하게 구분한다", () => {
    expect(homeSource).toContain("data-record-tools");
    expect(homeSource).toContain("data-record-tools-toggle");
    expect(homeSource).toContain("data-record-tools-description");
    expect(globalStyles).toContain("[data-record-tools] button[data-record-tools-toggle]");
    expect(globalStyles).toContain("[data-record-tools] button[data-record-tool]");
    expect(globalStyles).toContain("[data-record-tool][data-danger=\"true\"]");
  });

  it("설정 카드는 각각 접고 펼칠 수 있으며 마지막 상태를 저장한다", () => {
    expect(homeSource).toContain("USER_SETTINGS_SECTIONS_KEY");
    expect(homeSource).toContain("type UserSettingsSectionId");
    expect(homeSource).toContain("function UserSettingsSection");
    expect(homeSource).toContain("setUserSettingsOpen");
    expect(homeSource).toContain('aria-controls={`user-settings-${id}`}');
    expect(homeSource).toContain('data-settings-section={id}');
    expect(homeSource).toContain('id="pastNotice"');
    expect(homeSource).toContain('id="textScale"');
    expect(homeSource).toContain('id="contrast"');
    expect(homeSource).toContain('id="cardOrder"');
    expect(homeSource).toContain('id="cardVisibility"');
  });

  it("기존 습사 기록에도 로컬 미디어를 추가할 수 있다", () => {
    expect(homeSource).toContain("const addMediaToRecord = async");
    expect(homeSource).toContain("saveRecordMedia(id, accepted)");
    expect(homeSource).toContain("media: [...(item.media ?? []), ...savedMedia]");
    expect(homeSource).toContain('data-testid={`record-media-input-${record.id}`}');
    expect(homeSource).toContain('aria-label={`이 기록에 사진, 동영상 또는 음성 첨부');
    expect(homeSource).toContain("미디어 첨부");
    expect(homeSource).toContain("이 기기에 저장");
  });

  it("기록의 첨부 파일은 개별 삭제 확인 후 기기 저장소와 기록 정보에서 제거한다", () => {
    expect(homeSource).toContain("const deleteMediaFromRecord = async");
    expect(homeSource).toContain("await deleteRecordMedia([mediaId])");
    expect(homeSource).toContain("media: (item.media ?? []).filter((media) => media.id !== mediaId)");
    expect(homeSource).toContain('aria-label={`${attachment.name} 첨부 삭제`}');
    expect(homeSource).toContain('role="alertdialog"');
    expect(homeSource).toContain("파일만 삭제합니다. 이 작업은 되돌릴 수 없습니다.");
    expect(homeSource).toContain("첨부 삭제");
  });

  it("기기 이전용 ZIP은 기록·첨부·설정을 백업하고 병합 또는 전체 복원을 선택하게 한다", () => {
    expect(homeSource).toContain("createPortableBackup({ records, settings: getPortableSettings(), media })");
    expect(homeSource).toContain("readPortableBackup(file)");
    expect(homeSource).toContain("mergePortableBackup(records, currentMedia, pendingPortableBackup)");
    expect(homeSource).toContain("restoreRecordMedia(pendingPortableBackup.media, { replace: true })");
    expect(homeSource).toContain("병합 복원 · 권장");
    expect(homeSource).toContain("전체 복원 · 현재 데이터 덮어쓰기");
    expect(homeSource).toContain("PORTABLE_SETTING_KEYS");
  });

  it("전체 복원 직전에는 현재 상태를 자동 안전 ZIP으로 보관하고 실패 시 덮어쓰기를 시작하지 않는다", () => {
    expect(homeSource).toContain("createSafetyBackupBeforeReplace");
    expect(homeSource).toContain("saveLatestSafetyBackup(archive");
    expect(homeSource).toContain("await createSafetyBackupBeforeReplace()");
    expect(homeSource).toContain("현재 상태를 안전하게 보관하지 못해 전체 복원을 시작하지 않았습니다");
    expect(homeSource).toContain('data-testid="replace-safety-backup-notice"');
    expect(homeSource).toContain("자동 안전 백업 후 전체 복원");
    expect(homeSource).toContain("최근 안전 백업 보관됨");
  });

  it("접힌 카드 요약은 나의 나무 수령 배지와 같은 시작선에 정렬한다", () => {
    expect(homeSource).toContain('className="relative flex w-20 shrink-0 items-center group"');
    expect(homeSource).toContain("grid-cols-[1.75rem_5rem_minmax(0,1fr)]");
    expect(homeSource).toContain("justify-self-start max-w-full truncate rounded-full");
  });

  it("나의 나무 제목은 고정 폭 기준선에서도 편집 아이콘 때문에 잘리지 않는다", () => {
    expect(homeSource).toContain("min-w-0 flex-1 truncate pr-3 text-base");
    expect(homeSource).toContain("pointer-events-none absolute right-0 text-xs");
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

  it("설정에서 네 단계 글자 크기를 선택하고 기기별로 저장해 앱 전체에 적용한다", () => {
    expect(homeSource).toContain("TEXT_SCALE_STORAGE_KEY");
    expect(homeSource).toContain("normalizeTextScale(localStorage.getItem(TEXT_SCALE_STORAGE_KEY))");
    expect(homeSource).toContain("document.documentElement.style.fontSize");
    expect(homeSource).toContain('aria-label="글자 크기 선택"');
    expect(homeSource).toContain('role="radio"');
    expect(homeSource).toContain("글자 크기");
    expect(homeSource).toContain("눈에 편한 크기를 선택하세요. 이 기기에서 계속 유지됩니다.");
    expect(homeSource).toContain("selectTextScale(option.value)");
    expect(homeSource).toContain("기본 크기로 되돌리기");
  });

  it("설정에서 고대비 색상 모드를 켜고 끌 수 있다", () => {
    expect(homeSource).toContain("HIGH_CONTRAST_STORAGE_KEY");
    expect(homeSource).toContain("isHighContrastEnabled(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY))");
    expect(homeSource).toContain('role="switch"');
    expect(homeSource).toContain('aria-label="고대비 색상 모드"');
    expect(homeSource).toContain("고대비 모드 사용 중");
    expect(homeSource).toContain("일반 대비 모드 사용 중");
    expect(homeSource).toContain('{highContrast ? "켜짐" : "꺼짐"}');
    expect(homeSource).toContain('absolute left-1 top-1 size-5');
    expect(homeSource).toContain('highContrast ? "translate-x-9" : "translate-x-0"');
    expect(homeSource).toContain("toggleHighContrast");
  });

  it("고대비 모드에서는 습사 일지의 날짜 탭·목록·입력 글자를 선명하게 구분한다", () => {
    expect(homeSource).toContain("data-journal-tabs");
    expect(homeSource).toContain("data-journal-tab");
    expect(homeSource).toContain('data-active={journalView === value}');
    expect(homeSource).toContain("data-journal-input");
    expect(homeSource).toContain("data-journal-list-item");
    expect(globalStyles).toContain('[data-journal-tab][data-active="true"]');
    expect(globalStyles).toContain('[data-journal-list-item] :is(p, span, svg)');
    expect(globalStyles).toContain("color: #FFFFFF !important;");
    expect(globalStyles).toContain("color: #17251A !important;");
  });

  it("습사 일지는 전체·날짜·몰기·활터 순서 탭과 선택형 날짜·활터 상세 보기를 제공한다", () => {
    expect(homeSource).toContain('const [journalView, setJournalView] = useState<"날짜별" | "전체" | "몰기" | "활터별">');
    expect(homeSource).toContain('const [selectedJournalDate, setSelectedJournalDate] = useState<string | null>(null)');
    expect(homeSource).toContain('const [selectedJournalClub, setSelectedJournalClub] = useState<string | null>(null)');
    expect(homeSource).toContain('{ value: "전체", label: "전체" }');
    expect(homeSource).toContain('{ value: "날짜별", label: "날짜" }');
    expect(homeSource).toContain('{ value: "몰기", label: "몰기" }');
    expect(homeSource).toContain('{ value: "활터별", label: "활터" }');
    expect(homeSource).toContain('journalView === "활터별"');
    expect(homeSource).toContain('const journalClubGroups = Array.from');
    expect(homeSource).toContain('record.clubName?.trim() || "활터 미지정"');
    expect(homeSource).toContain('data-testid="journal-date-list"');
    expect(homeSource).toContain('data-testid="journal-date-detail"');
    expect(homeSource).toContain('data-testid="journal-club-list"');
    expect(homeSource).toContain('data-testid="journal-club-detail"');
    expect(homeSource).toContain("날짜 목록으로");
    expect(homeSource).toContain("활터 목록으로");
    expect(homeSource).not.toContain('총 {records.length}순 기록');
  });

  it("습사 일지는 열린 상태에서 전체 날짜를 표시하고 긴 내용은 터치 스크롤할 수 있다", () => {
    expect(homeSource).toContain('maxHeight: journalOpen ? "min(74dvh, 880px)" : 0');
    expect(homeSource).toContain('overflowY: journalOpen ? "auto" : "hidden"');
    expect(homeSource).toContain('className="touch-pan-y overscroll-contain"');
    expect(homeSource).toContain('WebkitOverflowScrolling: "touch"');
    expect(homeSource).toContain("{dateGroups.map((group) => (");
    expect(homeSource).not.toContain("dateGroups.slice(0, visibleDays)");
    expect(homeSource).not.toContain("이전 기록 5일 더보기");
  });

  it("습사 일지는 메모·활터·날짜 검색과 검색어 초기화를 제공한다", () => {
    expect(homeSource).toContain('useState("")');
    expect(homeSource).toContain('aria-label="습사 일지 검색"');
    expect(homeSource).toContain('placeholder="메모 · 활터 · 날짜 검색"');
    expect(homeSource).toContain('aria-label="일지 검색어 지우기"');
    expect(homeSource).toContain("const journalRecords = filterJournalRecords(records, journalSearch, {");
    expect(homeSource).toContain("선택한 검색·기간 조건의 기록이 없습니다");
  });

  it("습사 일지는 시작일·종료일로 기간을 제한하고 조건을 한 번에 초기화할 수 있다", () => {
    expect(homeSource).toContain('aria-label="습사 일지 시작일"');
    expect(homeSource).toContain('aria-label="습사 일지 종료일"');
    expect(homeSource).toContain('data-testid="journal-period-filter"');
    expect(homeSource).toContain("updateJournalStartDate");
    expect(homeSource).toContain("updateJournalEndDate");
    expect(homeSource).toContain("clearJournalFilters");
    expect(homeSource).toContain("검색·기간 조건 지우기");
    expect(homeSource).toContain("filterJournalRecords(records, journalSearch, {");
  });

  it("CSV 내보내기에서 전문가 과녁 위치를 보존하며 기존 헤더도 계속 읽는다", () => {
    expect(homeSource).toContain('"순번,날짜(KST),관중수,습사내역,메모,활터명,위도,경도,기록유형,첨부수,전문가과녁위치\\n"');
    expect(homeSource).toContain("활터왔소_습사일지_${todayKST()}.csv");
    expect(homeSource).toContain('!/^순번,/.test(l)');
    expect(homeSource).toContain('cols[8]?.trim() === "메모" ? "memo" : "round"');
    expect(homeSource).toContain("serializeExpertTargetPositions(r.positions)");
    expect(homeSource).toContain("parseExpertTargetPositions(cols[10])");
    expect(homeSource).toContain("createCSVRow([");
    expect(homeSource).toContain("parseCSVRow(dataLines[i])");
  });

  it("전문가 기록은 모바일에서 1시부터 5시와 초기화를 한 줄에 배치하고 미입력 안내를 표시하지 않는다", () => {
    const recordStart = homeSource.indexOf('title="습사 기록"');
    const journalStart = homeSource.indexOf('title="습사 일지"', recordStart);
    const recordSection = homeSource.slice(recordStart, journalStart > recordStart ? journalStart : undefined);

    expect(recordSection).toContain("grid w-full grid-cols-6 gap-1.5");
    expect(recordSection).toContain("min-w-0 w-full rounded-lg px-1 text-xs font-bold");
    expect(recordSection).not.toContain("미입력");
    expect(recordSection).not.toContain("현재 입력 현황");
  });

  it("습사 기록에서 기기 내 미디어를 첨부하고 시수 없이 메모 기록을 저장할 수 있다", () => {
    expect(homeSource).toContain('accept={RECORD_MEDIA_ACCEPT}');
    expect(homeSource).toContain("onChange={addRecordMedia}");
    expect(homeSource).toContain("사진·동영상·음성 첨부");
    expect(homeSource).toContain("getPracticeRecordSaveMode({");
    expect(homeSource).toContain("kind: saveMode");
    expect(homeSource).toContain("메모 기록 저장 완료");
    expect(homeSource).toContain("saveRecordMedia(recordId");
    expect(homeSource).toContain("<RecordMediaList media={record.media} onRequestDelete={setPendingMediaDelete} />");
    expect(homeSource).toContain("clearRecordMedia()");
  });

  it("접힌 기타 안내 카드에 현재 표시 중인 안내 메시지 수를 요약으로 표시한다", () => {
    expect(homeSource).toContain('title="기타 안내"');
    expect(homeSource).toContain('summary={!supportEventOpen ? `${getVisibleSupportEventCount(displaySupportEvents)}건` : undefined}');
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
    expect(homeSource).not.toContain("실시간 5분 기준 · 누적 전체");
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

  it("관리자 공지 입력란이 비어 있으면 기존 공지를 유지한다", () => {
    expect(homeSource).toContain("resolveNoticeSaveValues(notice, noticeExpiry, displayNotice, displayNoticeExpiry)");
    expect(homeSource).toContain("setNotice(displayNotice)");
    expect(homeSource).toContain("비우면 기존 공지 유지");
    expect(homeSource).toContain("기존 공지 유지");
  });

  it("관리자 활터 CSV에 메모를 함께 저장하고 기존 3열 파일도 불러온다", () => {
    expect(homeSource).toContain("name,latitude,longitude,comment");
    expect(homeSource).toContain("escapeCsvField");
    expect(homeSource).toContain("parseCsvLine");
    expect(homeSource).toContain("comment: cols[3] ?? \"\"");
    expect(homeSource).toContain("기존 3열 CSV도 지원");
  });

  it("관리자 활터 전체 삭제는 확인 절차와 진행 상태를 제공한다", () => {
    expect(homeSource).toContain("deleteAllClubs");
    expect(homeSource).toContain("등록된 활터 ${clubs.length}개를 모두 삭제하시겠습니까?");
    expect(homeSource).toContain('.from("clubs").delete().not("id", "is", null)');
    expect(homeSource).toContain("활터 전체 삭제");
    expect(homeSource).toContain("전체 삭제 중...");
  });
});
