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
  it("당근 활터 섹션 마지막 영역에 현황 조회 활터 선택기를 둔다", () => {
    const currentRangeStart = homeSource.indexOf('icon="location" title="당근 활터"');
    const statusStart = homeSource.indexOf('icon="status" title="왔소 현황"');
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
    expect(statusSection).toContain("활터 전체 현재원");
    expect(statusSection).toContain("현재원이 있는 소속정이 없습니다.");
    expect(statusSection).toContain("{club.name}");
    expect(statusSection).toContain("{club.count}명");
  });

  it("활터 전체 현재원에 겹친 사람 선형 아이콘을 표시한다", () => {
    expect(homeSource).toContain("Users");
    expect(homeSource).toContain('<Users size={15} strokeWidth={2.2} aria-hidden="true" />');
    expect(homeSource).not.toContain("🏹 활터 전체 현재원");
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
    expect(homeSource).toContain('className="samjoko-brand-mark shrink-0 invert mix-blend-screen"');
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
    expect(homeSource).toContain("totalMollgiSummary");
    expect(homeSource).toContain("summary={latestRecordSummary}");
    expect(homeSource).toContain("{totalMollgiSummary}회");
    expect(homeSource).toContain("{records.length}순");
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
    expect(homeSource).toContain('icon="import" label="CSV 불러오기"');
    expect(homeSource).toContain('icon="delete" label="전체 기록 초기화"');
    expect(homeSource).toContain('icon="download" label="CSV 저장"');
    expect(homeSource).toContain('<CardIcon name="backup" />');
    expect(homeSource).toContain('<CardIcon name="record" />');
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

  it("습사 일지는 전체·날짜·몰기·활터 순서 탭과 활터별 기록 보기를 제공한다", () => {
    expect(homeSource).toContain('const [journalView, setJournalView] = useState<"날짜별" | "전체" | "몰기" | "활터별">');
    expect(homeSource).toContain('{ value: "전체", label: "전체" }');
    expect(homeSource).toContain('{ value: "날짜별", label: "날짜" }');
    expect(homeSource).toContain('{ value: "몰기", label: "몰기" }');
    expect(homeSource).toContain('{ value: "활터별", label: "활터" }');
    expect(homeSource).toContain('journalView === "활터별"');
    expect(homeSource).toContain('const journalClubGroups = Array.from');
    expect(homeSource).toContain('record.clubName?.trim() || "활터 미지정"');
    expect(homeSource).not.toContain('총 {records.length}순 기록');
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

  it("CSV 내보내기에서도 습사 일지와 습사 내역 표기를 사용하며 기존 헤더를 계속 읽는다", () => {
    expect(homeSource).toContain('"순번,날짜(KST),관중수,습사내역,메모,활터명,위도,경도\\n"');
    expect(homeSource).toContain("활터왔소_습사일지_${todayKST()}.csv");
    expect(homeSource).toContain('!/^순번,/.test(l)');
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

  it("관리자 공지 입력란이 비어 있으면 기존 공지를 유지한다", () => {
    expect(homeSource).toContain("resolveNoticeSaveValues(notice, noticeExpiry, displayNotice, displayNoticeExpiry)");
    expect(homeSource).toContain("setNotice(displayNotice)");
    expect(homeSource).toContain("비우면 기존 공지 유지");
    expect(homeSource).toContain("기존 공지 유지");
  });
});
