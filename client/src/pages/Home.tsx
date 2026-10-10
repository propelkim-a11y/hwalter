/**
 * 활터 왔소 — 국궁 습사 기록 앱
 *
 * 디자인 철학: 대나무 숲 자연주의
 * - 크림 배경(#F5F0E8), 대나무 녹색(#3D5A3E), 진홍 강조(#8B2635)
 * - Noto Serif KR (제목) + Noto Sans KR (본문)
 * - 카드 기반 섹션, 부드러운 그림자, 자연스러운 전환
 *
 * 기능:
 * 1. O/X 습사 기록 (1순 5시) → LocalStorage 저장
 * 2. 일별/주별/월별/연별 통계
 * 3. 습사 일지 (날짜별 그룹 보기 + 전체 목록)
 * 4. CSV 내보내기
 * 5. Wake Lock (화면 꺼짐 방지)
 * 6. 다중 활터 드롭다운 (Supabase clubs 테이블)
 * 7. 실시간 현황판 (현재원 1시간 Grace Period / 동시접속 5분 / 누적)
 * 8. 관리자 모드 (활터 등록, 공지사항, 반경 설정)
 */

import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getVisibleClubComment } from "@/lib/clubComment";
import { canRestoreDismissedNotice, shouldShowNotice } from "@/lib/noticePreference";
import { resolveNoticeSaveValues } from "@/lib/noticeSave";
import { safeExternalUrl } from "@/lib/safeExternalUrl";
import { safeSupportImageUrl } from "@/lib/safeSupportImageUrl";
import { createSupportEvent, getVisibleSupportEventCount, MAX_SUPPORT_EVENTS, migrateLegacySupportEvent, normalizeSupportEvents, type SupportEvent } from "@/lib/supportEvents";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { ArrowLeft, BarChart3, ChevronRight, CircleAlert, ClipboardList, Download, Footprints, HandHeart, HardDriveDownload, ImagePlus, MapPin, Megaphone, Music, Paperclip, RefreshCw, Search, Settings, ShieldCheck, Sprout, Target, TreePine, Users, Video, X, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GrowingTree } from "@/components/GrowingTree";
import { HomeScreenInstallCard } from "@/components/HomeScreenInstallCard";
import { PastNoticePanel } from "@/components/PastNoticePanel";
import { RecordToolIconButton } from "@/components/RecordToolIconButton";
import { SortableMainCard } from "@/components/SortableMainCard";
import { HIGH_CONTRAST_STORAGE_KEY, isHighContrastEnabled } from "@/lib/contrastMode";
import { filterJournalRecords } from "@/lib/journalSearch";
import { DEFAULT_MAIN_CARD_ORDER, DEFAULT_MAIN_CARD_VISIBILITY, MAIN_CARD_LABELS, MainCardId, moveMainCard as moveMainCardOrder, normalizeMainCardOrder, normalizeMainCardVisibility } from "@/lib/mainCardOrder";
import { getTextScalePercent, normalizeTextScale, TEXT_SCALE_OPTIONS, TEXT_SCALE_STORAGE_KEY, type TextScale } from "@/lib/textScale";
import { isBrandActivationKey, restartBrandPulse } from "@/lib/brandInteraction";
import { formatRecordMediaSize, getPracticeRecordSaveMode, getRecordMediaKind, getRecordMediaValidationError, isPracticeRound, MAX_RECORD_MEDIA_ITEMS, RECORD_MEDIA_ACCEPT, type PracticeRecordKind } from "@/lib/practiceRecord";
import { createCSVRow, parseCSVRow, parseExpertTargetPositions, serializeExpertTargetPositions } from "@/lib/practiceCsv";
import { clearRecordMedia, deleteRecordMedia, getAllRecordMedia, getRecordMediaBlob, getRecordMediaSummary, restoreRecordMedia, saveRecordMedia, type LocalRecordMedia } from "@/lib/recordMediaStore";
import { createPortableBackup, formatPortableBackupDate, mergePortableBackup, readPortableBackup, type PortableBackup } from "@/lib/portableBackup";
import { getLatestSafetyBackupBlob, getLatestSafetyBackupInfo, saveLatestSafetyBackup, type SafetyBackupInfo } from "@/lib/safetyBackupStore";

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

interface ShotRecord {
  id: string;
  date: string; // ISO string
  shots: (boolean | null)[];
  hits: number;
  memo: string;
  kind?: PracticeRecordKind;
  media?: LocalRecordMedia[];
  lat?: number;
  lng?: number;
  clubName?: string; // 지오펜싱 매칭된 활터명 (300m 이내) 또는 undefined
  // 전문가 모드: 5×5 과녁 그리드 위치 기록 [row0~4][col0~4] = 화살 번호(1~5) 또는 0
  positions?: number[][][]; // [row][col] = 화살 번호 배열 (같은 위치 중복 허용)
}

interface Club {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  comment?: string;
}

interface DateGroup {
  date: string;
  records: ShotRecord[];
  totalEntries: number;
  totalRounds: number;
  memoEntries: number;
  totalHits: number;
  rate: number;
}

interface DraftRecordMedia {
  id: string;
  file: File;
  previewUrl: string;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bow_records_v11";
const SESSION_KEY = "bow_session_id";
const DEFAULT_ADMIN_PW = "0531";
const LAST_CLUB_KEY = "last_selected_club"; // 마지막 선택 활터 저장 키
const TREE_NAME_KEY = "tree_name"; // 나무 이름 저장 키
const LOCATION_OPEN_KEY = "section_location_open"; // 당근 활터 섹션 접힘 상태
const STATUS_OPEN_KEY = "section_status_open"; // 왔소 현황 섹션 접힘 상태
const RECORD_OPEN_KEY = "section_record_open"; // 습사 기록 섹션 접힘 상태
const STAT_OPEN_KEY = "section_stat_open"; // 시수 통계 섹션 접힘 상태
const JOURNAL_OPEN_KEY = "section_journal_open"; // 습사 일지 섹션 접힘 상태
const JOURNAL_RECORD_TOOLS_OPEN_KEY = "journal_record_tools_open"; // 습사 일지 기록 관리 접힘 상태
const USER_SETTINGS_SECTIONS_KEY = "user_settings_sections_open";
const LAST_BACKUP_KEY = "last_csv_backup_ts"; // 마지막 CSV 백업 타임스탬프
const BACKUP_REMIND_DAYS = 7; // N일마다 백업 알림
const NOTICE_COLLAPSED_KEY = "notice_banner_collapsed";
const NOTICE_DISMISSED_KEY = "notice_banner_dismissed_text";
const NOTICE_HISTORY_KEY = "notice_history"; // 공지 이력 localStorage 키
const MAIN_CARD_ORDER_KEY = "main_card_order";
const MAIN_CARD_VISIBILITY_KEY = "main_card_visibility";
const MAIN_CARD_MOVE_GUIDE_DONE_KEY = "main_card_move_guide_done";
const SUPPORT_EVENT_OPEN_KEY = "support_event_card_open";
const SUPPORT_EVENT_DISMISSED_KEY = "support_event_card_dismissed";
const SUPPORT_EVENT_DEFAULT_TITLE = "함께하는 활터";
const SUPPORT_EVENT_DEFAULT_CONTENT = "기타 안내 내용이 등록되면 이곳에 표시됩니다.";
const SUPPORT_EVENT_ENABLED_KEY = "support_event_enabled";
const SUPPORT_EVENTS_KEY = "support_events";
const SUPPORT_IMAGE_BUCKET = "support-images";
const SUPPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const SUPPORT_IMAGE_MIME_TYPE = "image/jpeg";
const STATS_REFRESH_INTERVAL_MS = 600_000;
const LOCATION_PERMISSION_REQUEST_KEY = "location_permission_requested";
const EXPERT_MODE_KEY = "hwalter_expert_mode";
const PORTABLE_SETTING_KEYS = [
  TREE_NAME_KEY,
  LAST_CLUB_KEY,
  EXPERT_MODE_KEY,
  LOCATION_OPEN_KEY,
  STATUS_OPEN_KEY,
  RECORD_OPEN_KEY,
  STAT_OPEN_KEY,
  JOURNAL_OPEN_KEY,
  NOTICE_COLLAPSED_KEY,
  NOTICE_DISMISSED_KEY,
  NOTICE_HISTORY_KEY,
  MAIN_CARD_ORDER_KEY,
  MAIN_CARD_VISIBILITY_KEY,
  MAIN_CARD_MOVE_GUIDE_DONE_KEY,
  SUPPORT_EVENT_OPEN_KEY,
  SUPPORT_EVENT_DISMISSED_KEY,
  TEXT_SCALE_STORAGE_KEY,
  HIGH_CONTRAST_STORAGE_KEY,
] as const;
const getAdminPw = () => localStorage.getItem("admin_pw") || DEFAULT_ADMIN_PW;

const FALLBACK_CLUBS: Club[] = [
  { id: 1, name: "대전 주몽정", latitude: 36.37255, longitude: 127.32041 },
  { id: 2, name: "서울 황학정", latitude: 37.57824, longitude: 126.97505 },
  { id: 3, name: "수원 연무정", latitude: 37.26378, longitude: 127.02861 },
];

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 두 좌표 사이의 방위각(bearing) 계산 — 0°=북, 90°=동, 180°=남, 270°=서 */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** 방위각 → 8방위 한글 레이블 */
function bearingLabel(deg: number): string {
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return dirs[Math.round(deg / 45) % 8];
}

/** ISO 문자열이 유효한 날짜인지 확인 */
function isValidDate(iso: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t);
}

function formatDate(iso: string): string {
  if (!isValidDate(iso)) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  if (!isValidDate(iso)) return "--:--";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** UTC ISO → KST 기준 날짜 키 (YYYY-MM-DD) */
function getDateKey(iso: string): string {
  if (!isValidDate(iso)) return "0000-00-00";
  // KST = UTC+9
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** KST 기준 날짜 문자열 (YYYY-MM-DD) — CSV 파일명용 */
function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function escapeCsvField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

function groupByDate(records: ShotRecord[]): DateGroup[] {
  // records는 이미 최신순(index 0 = 최신)으로 저장되어 있으므로 그대로 순회
  const map = new Map<string, ShotRecord[]>();
  records.forEach((r) => {
    const key = getDateKey(r.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries()).map(([date, recs]) => {
    const roundRecords = recs.filter(isPracticeRound);
    const totalHits = roundRecords.reduce((s, r) => s + r.hits, 0);
    const totalShots = roundRecords.length * 5;
    return {
      date,
      records: recs, // 각 날짜 내에서도 최신순 유지
      totalEntries: recs.length,
      totalRounds: roundRecords.length,
      memoEntries: recs.length - roundRecords.length,
      totalHits,
      rate: totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0,
    };
  });
}

type CardIconName = "tree" | "sprout" | "location" | "status" | "record" | "statistics" | "journal" | "support" | "notice" | "backup";

const CARD_ICON_MAP: Record<CardIconName, LucideIcon> = {
  tree: TreePine,
  sprout: Sprout,
  location: MapPin,
  status: Footprints,
  record: Target,
  statistics: BarChart3,
  journal: ClipboardList,
  support: CircleAlert,
  notice: Megaphone,
  backup: HardDriveDownload,
};

function CardIcon({ name, tone = "default" }: { name: CardIconName; tone?: "default" | "notice" }) {
  const Icon = CARD_ICON_MAP[name];
  const colors = tone === "notice"
    ? { background: "rgba(255,255,255,0.6)", borderColor: "#FFE08A", color: "#A66A00" }
    : { background: "#F0F6EF", borderColor: "#D5E4D2", color: "#3D5A3E" };

  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg border" style={colors} aria-hidden="true">
      <Icon size={15} strokeWidth={2} />
    </span>
  );
}

type UserSettingsSectionId = "recordTools" | "pastNotice" | "textScale" | "contrast" | "cardOrder" | "cardVisibility";

function UserSettingsSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: UserSettingsSectionId;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section data-settings-section={id} data-testid={id === "recordTools" ? "journal-record-tools" : undefined} data-record-tools={id === "recordTools" ? true : undefined} className="mt-3 overflow-hidden rounded-xl border" style={{ background: "#F5F0E8", borderColor: "#E8E0D0" }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors active:scale-[0.99]"
        aria-expanded={open}
        aria-controls={`user-settings-${id}`}
        aria-label={id === "recordTools" ? (open ? "기록 관리 접기" : "기록 관리 펼치기") : `${title} ${open ? "접기" : "펼치기"}`}
        data-record-tools-toggle={id === "recordTools" ? true : undefined}
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold" style={{ color: "#3D5A3E" }}>{title}</span>
          <span className="mt-0.5 block truncate text-[11px]" style={{ color: "#6B7280" }}>{summary}</span>
        </span>
        <CollapseChevron open={open} />
      </button>
      {open && <div id={`user-settings-${id}`} className="border-t p-3" style={{ borderColor: "#E8E0D0" }}>{children}</div>}
    </section>
  );
}

function SupportEventImage({ imageUrl, alt, className }: { imageUrl: string; alt: string; className: string }) {
  const safeImageUrl = safeSupportImageUrl(imageUrl);
  if (!safeImageUrl) return null;

  return <img src={safeImageUrl} alt={alt} className={className} loading="lazy" />;
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function Home() {
  const isPageVisible = usePageVisibility();

  // 세션 ID
  const [sessionId] = useState<string>(() => {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) { id = nanoid(); localStorage.setItem(SESSION_KEY, id); }
    return id;
  });

  // 습사 기록
  const [records, setRecords] = useState<ShotRecord[]>(() => {
    try {
      const raw: ShotRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      // 날짜가 유효하지 않은 레코드 필터링
      return raw.filter((r) => r && isValidDate(r.date));
    } catch { return []; }
  });
  const [shots, setShots] = useState<(boolean | null)[]>([null, null, null, null, null]);
  const [memo, setMemo] = useState("");
  const [draftMedia, setDraftMedia] = useState<DraftRecordMedia[]>([]);
  const draftMediaRef = useRef<DraftRecordMedia[]>([]);
  const recordMediaInputRef = useRef<HTMLInputElement>(null);
  // 전문가 모드
  const [expertMode, setExpertMode] = useState<boolean>(() => localStorage.getItem(EXPERT_MODE_KEY) === "true");
  // 5×5 그리드: [row][col] = 화살 번호 배열 (같은 위치 중복 허용)
  const [grid, setGrid] = useState<number[][][]>(() => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => [])));
  // 다음에 찍을 화살 번호 (1~5)
  const [nextArrow, setNextArrow] = useState(1);
  const [lastHitCell, setLastHitCell] = useState<string | null>(null); // 마지막 터치 셀 키 "row-col"

  // 통계 탭
  const [statTab, setStatTab] = useState<"일별" | "주별" | "월별" | "활터별" | "전체" | "히트맵">("일별");

  // 일지 보기 모드
  const [journalView, setJournalView] = useState<"날짜별" | "전체" | "몰기" | "활터별">("날짜별");
  const [selectedJournalDate, setSelectedJournalDate] = useState<string | null>(null);
  const [selectedJournalClub, setSelectedJournalClub] = useState<string | null>(null);
  const [journalSearch, setJournalSearch] = useState("");
  const [journalStartDate, setJournalStartDate] = useState("");
  const [journalEndDate, setJournalEndDate] = useState("");
  // GPS
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const myLatRef = useRef<number | null>(null);
  const myLngRef = useRef<number | null>(null);
  const [locationRequested, setLocationRequested] = useState(
    () => localStorage.getItem(LOCATION_PERMISSION_REQUEST_KEY) === "true",
  );

  // 활터 목록
  const [clubs, setClubs] = useState<Club[]>(FALLBACK_CLUBS);
  const [selectedClubId, setSelectedClubId] = useState<number | null>(() => {
    // DOMContentLoaded 시점에 localStorage에서 마지막 선택 활터 복원
    const saved = localStorage.getItem(LAST_CLUB_KEY);
    if (saved) {
      const match = FALLBACK_CLUBS.find((c) => c.name === saved);
      if (match) return match.id;
    }
    return FALLBACK_CLUBS[0].id;
  });
  const selectedClub = clubs.find((c) => c.id === selectedClubId) ?? clubs[0];

  // 현황판
  const [clubCount, setClubCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // 현재원이 있는 활터 목록 (왔소 현황용)
  const [activeClubStatuses, setActiveClubStatuses] = useState<Array<{ id: number; name: string; count: number }>>([]);
  // 당근 활터 패널용: 가까운 활터별 현재원 { [clubId]: count }
  const [nearbyClubCounts, setNearbyClubCounts] = useState<Record<number, number>>({});
  const [statsLoading, setStatsLoading] = useState(true);   // 최초 로딩
  const [statsRefreshing, setStatsRefreshing] = useState(false); // 30초 갱신 중
  const [statsError, setStatsError] = useState<string | null>(null); // 에러 메시지
  const [statsRetrying, setStatsRetrying] = useState(false); // 수동 재시도 중
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<string | null>(null);
  const statsLoadedOnce = useRef(false);

  // 섹션 토글
  const [locationOpen, setLocationOpen] = useState(
    () => localStorage.getItem(LOCATION_OPEN_KEY) !== "false"
  );
  const [recordOpen, setRecordOpen] = useState(
    () => localStorage.getItem(RECORD_OPEN_KEY) !== "false"
  );
  const [statusOpen, setStatusOpen] = useState(
    () => localStorage.getItem(STATUS_OPEN_KEY) !== "false"
  );

  const [statOpen, setStatOpen] = useState(
    () => localStorage.getItem(STAT_OPEN_KEY) !== "false"
  );
  const [journalOpen, setJournalOpen] = useState(
    () => localStorage.getItem(JOURNAL_OPEN_KEY) !== "false"
  );
  const [supportEventOpen, setSupportEventOpen] = useState(
    () => localStorage.getItem(SUPPORT_EVENT_OPEN_KEY) !== "false"
  );
  const [supportEventDismissed, setSupportEventDismissed] = useState(
    () => localStorage.getItem(SUPPORT_EVENT_DISMISSED_KEY) === "true"
  );
  const [mainCardOrder, setMainCardOrder] = useState<MainCardId[]>(() => {
    try {
      return normalizeMainCardOrder(JSON.parse(localStorage.getItem(MAIN_CARD_ORDER_KEY) || "[]"));
    } catch {
      return DEFAULT_MAIN_CARD_ORDER;
    }
  });
  const [showMainCardMoveGuide, setShowMainCardMoveGuide] = useState(
    () => localStorage.getItem(MAIN_CARD_MOVE_GUIDE_DONE_KEY) !== "true"
  );
  const [mainCardMoveActive, setMainCardMoveActive] = useState(false);
  const moveMainCard = useCallback((source: MainCardId, target: MainCardId) => {
    setMainCardOrder(current => moveMainCardOrder(current, source, target));
  }, []);
  const handleMainCardMove = useCallback((source: MainCardId, target: MainCardId) => {
    moveMainCard(source, target);
    if (showMainCardMoveGuide) {
      localStorage.setItem(MAIN_CARD_MOVE_GUIDE_DONE_KEY, "true");
      setShowMainCardMoveGuide(false);
    }
  }, [moveMainCard, showMainCardMoveGuide]);
  const [mainCardVisibility, setMainCardVisibility] = useState<Record<MainCardId, boolean>>(() => {
    try {
      return normalizeMainCardVisibility(JSON.parse(localStorage.getItem(MAIN_CARD_VISIBILITY_KEY) || "{}"));
    } catch {
      return DEFAULT_MAIN_CARD_VISIBILITY;
    }
  });
  const toggleMainCardVisibility = (cardId: MainCardId) => {
    setMainCardVisibility(current => ({ ...current, [cardId]: !current[cardId] }));
  };
  const dismissSupportEvent = () => {
    localStorage.setItem(SUPPORT_EVENT_DISMISSED_KEY, "true");
    setSupportEventDismissed(true);
  };
  const restoreSupportEvent = () => {
    localStorage.removeItem(SUPPORT_EVENT_DISMISSED_KEY);
    setSupportEventDismissed(false);
  };
  useEffect(() => {
    localStorage.setItem(MAIN_CARD_ORDER_KEY, JSON.stringify(mainCardOrder));
  }, [mainCardOrder]);
  useEffect(() => {
    localStorage.setItem(MAIN_CARD_VISIBILITY_KEY, JSON.stringify(mainCardVisibility));
  }, [mainCardVisibility]);

  // 성장형 나무 시스템
  const [treeModal, setTreeModal] = useState<{ type: "levelup" | "mollgi" | "unlock"; title: string; desc: string; emoji: string } | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const previousMainCardOpenRef = useRef<Record<MainCardId, boolean>>({
    tree: treeOpen,
    location: locationOpen,
    status: statusOpen,
    record: recordOpen,
    stats: statOpen,
    journal: journalOpen,
    support: supportEventOpen,
  });
  useEffect(() => {
    const currentOpen: Record<MainCardId, boolean> = {
      tree: treeOpen,
      location: locationOpen,
      status: statusOpen,
      record: recordOpen,
      stats: statOpen,
      journal: journalOpen,
      support: supportEventOpen,
    };
    const previousOpen = previousMainCardOpenRef.current;
    const openedCardId = (Object.keys(currentOpen) as MainCardId[]).find(
      cardId => !previousOpen[cardId] && currentOpen[cardId]
    );
    previousMainCardOpenRef.current = currentOpen;
    if (!openedCardId) return;

    const timer = window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`[data-main-card-id="${openedCardId}"]`);
      if (!card) return;
      const appHeader = document.querySelector<HTMLElement>("header.sticky");
      const headerHeight = appHeader?.getBoundingClientRect().height ?? 0;
      const top = window.scrollY + card.getBoundingClientRect().top - headerHeight - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 380);
    return () => window.clearTimeout(timer);
  }, [treeOpen, locationOpen, statusOpen, recordOpen, statOpen, journalOpen, supportEventOpen]);
  const [treeName, setTreeName] = useState(() => localStorage.getItem(TREE_NAME_KEY) || "나의 나무");
  const [treeNameEditing, setTreeNameEditing] = useState(false);
  const [treeNameInput, setTreeNameInput] = useState("");
  const treeNameInputRef = useRef<HTMLInputElement>(null);

  // 관리자
  const [adminMode, setAdminMode] = useState(false);
  const [adminTapCount, setAdminTapCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [brandPulse, setBrandPulse] = useState(false);
  const [textScale, setTextScale] = useState<TextScale>(() => normalizeTextScale(localStorage.getItem(TEXT_SCALE_STORAGE_KEY)));
  const [highContrast, setHighContrast] = useState(() => isHighContrastEnabled(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)));
  const [userSettingsOpen, setUserSettingsOpen] = useState<Record<UserSettingsSectionId, boolean>>(() => {
    const defaults: Record<UserSettingsSectionId, boolean> = {
      recordTools: localStorage.getItem(JOURNAL_RECORD_TOOLS_OPEN_KEY) === "true",
      pastNotice: false,
      textScale: true,
      contrast: true,
      cardOrder: false,
      cardVisibility: false,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(USER_SETTINGS_SECTIONS_KEY) || "null") as Partial<Record<UserSettingsSectionId, boolean>> | null;
      return saved ? { ...defaults, ...Object.fromEntries(Object.keys(defaults).map((key) => [key, saved[key as UserSettingsSectionId] === true])) } as Record<UserSettingsSectionId, boolean> : defaults;
    } catch {
      return defaults;
    }
  });
  const [adminPwInput, setAdminPwInput] = useState("");
  const adminTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.style.fontSize = `${getTextScalePercent(textScale)}%`;
  }, [textScale]);

  useEffect(() => {
    document.documentElement.dataset.hwalterContrast = highContrast ? "high" : "standard";
  }, [highContrast]);

  const selectTextScale = (nextScale: TextScale) => {
    localStorage.setItem(TEXT_SCALE_STORAGE_KEY, nextScale);
    setTextScale(nextScale);
  };

  const toggleHighContrast = () => {
    setHighContrast((current) => {
      const next = !current;
      localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(next));
      return next;
    });
  };

  const toggleUserSettingsSection = (id: UserSettingsSectionId) => {
    setUserSettingsOpen((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(USER_SETTINGS_SECTIONS_KEY, JSON.stringify(next));
      if (id === "recordTools") localStorage.setItem(JOURNAL_RECORD_TOOLS_OPEN_KEY, String(next[id]));
      return next;
    });
  };

  // 비밀번호 변경
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");

  // 관리자 설정값
  const [radius, setRadius] = useState(200);
  const [notice, setNotice] = useState("");
  const [noticeExpiry, setNoticeExpiry] = useState("");
  const [supportEventsInput, setSupportEventsInput] = useState<SupportEvent[]>([]);
  const [supportEventEnabledInput, setSupportEventEnabledInput] = useState(true);
  const [uploadingSupportEventId, setUploadingSupportEventId] = useState<string | null>(null);
  const [noticeHistory, setNoticeHistory] = useState<Array<{ text: string; expiry: string; savedAt: string }>>(() => {
    try {
      const raw = localStorage.getItem(NOTICE_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [displayNotice, setDisplayNotice] = useState("");
  const [displayNoticeExpiry, setDisplayNoticeExpiry] = useState("");
  const [displaySupportEvents, setDisplaySupportEvents] = useState<SupportEvent[]>([]);
  const [supportEventEnabled, setSupportEventEnabled] = useState(true);
  const [noticeCollapsed, setNoticeCollapsed] = useState(
    () => localStorage.getItem(NOTICE_COLLAPSED_KEY) === "true"
  );
  const [dismissedNotice, setDismissedNotice] = useState(
    () => localStorage.getItem(NOTICE_DISMISSED_KEY)
  );

  // 관리자 신규 활터 등록
  const [newClubName, setNewClubName] = useState("");
  const [newClubLat, setNewClubLat] = useState("");
  const [newClubLng, setNewClubLng] = useState("");
  const [deletingClubId, setDeletingClubId] = useState<number | null>(null);
  const [deletingAllClubs, setDeletingAllClubs] = useState(false);

  // CSV 업로드
  const [csvUploading, setCsvUploading] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // 왔소 현황 활터 검색
  const [clubSearch, setClubSearch] = useState("");
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const clubSearchRef = useRef<HTMLDivElement>(null);

  // 관리자 활터 목록 검색
  const [adminClubSearch, setAdminClubSearch] = useState("");

  // 관리자 활터 편집
  const [editingClubId, setEditingClubId] = useState<number | null>(null);
  const [editClubName, setEditClubName] = useState("");
  const [editClubLat, setEditClubLat] = useState("");
  const [editClubLng, setEditClubLng] = useState("");
  const [editClubComment, setEditClubComment] = useState("");
  const [savingClubId, setSavingClubId] = useState<number | null>(null);

  // CSV 백업 알림
  const [showBackupBanner, setShowBackupBanner] = useState(false);

  // Wake Lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ── Wake Lock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}
    };
    acquire();
    const onVisibility = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPageVisible || !locationRequested || !navigator.geolocation) return;
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        myLatRef.current = pos.coords.latitude;
        myLngRef.current = pos.coords.longitude;
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
      },
      () => {
        localStorage.removeItem(LOCATION_PERMISSION_REQUEST_KEY);
        setLocationRequested(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, [isPageVisible, locationRequested]);

  // ── Supabase: clubs 테이블 로드 ───────────────────────────────────────────
  const loadClubs = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("clubs").select("*").order("id");
      if (!error && data && data.length > 0) {
        setClubs(data as Club[]);
        setSelectedClubId((prev) => {
          // Supabase에서 로드된 활터 목록에서 localStorage 저장값 우선 적용
          const saved = localStorage.getItem(LAST_CLUB_KEY);
          if (saved) {
            const savedMatch = (data as Club[]).find((c) => c.name === saved);
            if (savedMatch) return savedMatch.id;
          }
          const exists = (data as Club[]).find((c) => c.id === prev);
          return exists ? prev : (data as Club[])[0].id;
        });
      }
    } catch {}
  }, []);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  // ── Supabase: app_settings 로드 (공지, 반경) ──────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      const { data } = await supabase.from("app_settings").select("key, value");
      if (!data) return;
      const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));
      if (map.radius_km) setRadius(Math.round(parseFloat(map.radius_km) * 1000));
      if (map.notice !== undefined) setDisplayNotice(map.notice);
      if (map.notice_expiry !== undefined) setDisplayNoticeExpiry(map.notice_expiry);
      const supportEvents = map[SUPPORT_EVENTS_KEY] !== undefined
        ? normalizeSupportEvents(JSON.parse(map[SUPPORT_EVENTS_KEY]))
        : migrateLegacySupportEvent(map.support_event_title || "", map.support_event_content || "", map.support_event_date || "", map.support_event_location_url || "");
      setDisplaySupportEvents(supportEvents);
      if (map[SUPPORT_EVENT_ENABLED_KEY] !== undefined) setSupportEventEnabled(map[SUPPORT_EVENT_ENABLED_KEY] !== "false");
    } catch {}
  }, []);

  useEffect(() => {
    if (!isPageVisible) return;
    loadSettings();
    const t = setInterval(loadSettings, 60000);
    return () => clearInterval(t);
  }, [loadSettings, isPageVisible]);

  // ── Supabase: 위치 업서트 (60초마다) ─────────────────────────────────────
  useEffect(() => {
    if (!isPageVisible) return;
    const upsert = async () => {
      const lat = myLatRef.current;
      const lng = myLngRef.current;
      if (!lat || !lng) return;
      try {
        await supabase.from("user_locations").upsert({
          session_id: sessionId,
          latitude: lat,
          longitude: lng,
          club_name: selectedClub?.name ?? "",
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id" });
      } catch {}
    };
    upsert();
    const t = setInterval(upsert, 60000);
    return () => clearInterval(t);
  }, [sessionId, selectedClub, isPageVisible]);

  // ── Supabase: 현황판 조회 (10분마다) ─────────────────────────────────────
  const fetchStats = useCallback(async () => {
    // 최초 로딩 vs 이후 갱신 구분
    if (!statsLoadedOnce.current) {
      setStatsLoading(true);
    } else {
      setStatsRefreshing(true);
    }
    setStatsError(null);
    try {
      // 전체 통계
      const { data: statsData, error: statsErr } = await supabase.rpc("get_user_stats");
      if (statsErr) throw statsErr;
      if (statsData) {
        setTotalCount(statsData.total ?? 0);
        setOnlineCount(statsData.online ?? 0);
      }
      // 모든 활터의 현재원을 한 번에 조회하여 선택 활터·가까운 활터·전체 현황에 공통 사용
      if (clubs.length > 0) {
        const clubStatuses = await Promise.all(
          clubs.map(async (c) => {
            try {
              const { data, error } = await supabase.rpc("get_club_user_count", {
                club_name_param: c.name,
                center_lat: c.latitude,
                center_lng: c.longitude,
                radius_km: radius / 1000,
              });
              if (error) throw error;
              return { id: c.id, name: c.name, count: typeof data === "number" ? data : 0 };
            } catch {
              return { id: c.id, name: c.name, count: 0 };
            }
          })
        );
        const countsByClub = Object.fromEntries(clubStatuses.map((club) => [club.id, club.count])) as Record<number, number>;
        setClubCount(selectedClub ? (countsByClub[selectedClub.id] ?? 0) : 0);
        setActiveClubStatuses(
          clubStatuses
            .filter((club) => club.count > 0)
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"))
        );

        // 당근 활터 패널에는 거리순 가까운 활터 5곳의 현재원만 표시
        if (myLatRef.current !== null && myLngRef.current !== null) {
          const nearbyCounts: Record<number, number> = {};
          [...clubs]
            .map((c) => ({ ...c, dist: haversineKm(myLatRef.current!, myLngRef.current!, c.latitude, c.longitude) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 5)
            .forEach((c) => {
              nearbyCounts[c.id] = countsByClub[c.id] ?? 0;
            });
          setNearbyClubCounts(nearbyCounts);
        }
      }
      setStatsUpdatedAt(new Date().toISOString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : (err as { message?: string })?.message ?? "알 수 없는 오류";
      // 네트워크 에러인 경우 사용자 친화적 메시지로 변환
      if (!navigator.onLine) {
        setStatsError("인터넷 연결이 끊어졌습니다. Wi-Fi 또는 데이터를 확인해 주세요.");
      } else if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network") || msg.toLowerCase().includes("failed")) {
        setStatsError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        setStatsError("현황판 데이터를 가져오지 못했습니다. ("+msg+")");
      }
    } finally {
      setStatsLoading(false);
      setStatsRefreshing(false);
      setStatsRetrying(false);
      statsLoadedOnce.current = true;
    }
  }, [selectedClub, radius, clubs]);

  // 수동 재시도
  const handleRetryStats = useCallback(() => {
    if (statsLoading || statsRefreshing || statsRetrying) return;
    setStatsRetrying(true);
    fetchStats();
  }, [fetchStats, statsLoading, statsRefreshing, statsRetrying]);

  useEffect(() => {
    if (!isPageVisible) return;
    fetchStats();
    const t = setInterval(fetchStats, STATS_REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchStats, isPageVisible]);

  // ── 공지 만료 체크 ────────────────────────────────────────────────────────
  const activeNotice = (() => {
    if (!displayNotice) return "";
    if (displayNoticeExpiry && isValidDate(displayNoticeExpiry)) {
      const exp = new Date(displayNoticeExpiry);
      exp.setHours(23, 59, 59, 999);
      if (new Date() > exp) return "";
    }
    return displayNotice;
  })();

  const visibleNotice = shouldShowNotice(activeNotice, dismissedNotice) ? activeNotice : "";
  const updateSupportEventInput = (id: string, patch: Partial<SupportEvent>) => {
    setSupportEventsInput((events) => events.map((event) => event.id === id
      ? { ...event, ...patch, updatedAt: new Date().toISOString() }
      : event));
  };
  const addSupportEvent = () => {
    if (supportEventsInput.length >= MAX_SUPPORT_EVENTS) return;
    setSupportEventsInput((events) => [...events, createSupportEvent(new Date().toISOString())]);
  };
  const removeSupportEvent = (id: string) => {
    setSupportEventsInput((events) => events.filter((event) => event.id !== id));
  };
  const uploadSupportEventImage = async (eventId: string, file: File | undefined) => {
    if (!file) return;
    if (file.type !== SUPPORT_IMAGE_MIME_TYPE) {
      toast.error("JPEG 이미지 파일만 첨부할 수 있습니다");
      return;
    }
    if (file.size > SUPPORT_IMAGE_MAX_BYTES) {
      toast.error("이미지 용량은 5MB 이하여야 합니다");
      return;
    }

    setUploadingSupportEventId(eventId);
    try {
      const filePath = `public/${eventId}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(SUPPORT_IMAGE_BUCKET).upload(filePath, file, {
        cacheControl: "31536000",
        contentType: SUPPORT_IMAGE_MIME_TYPE,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(SUPPORT_IMAGE_BUCKET).getPublicUrl(filePath);
      updateSupportEventInput(eventId, { imageUrl: data.publicUrl });
      toast.success("이미지를 첨부했습니다");
    } catch {
      toast.error("이미지 첨부에 실패했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setUploadingSupportEventId(null);
    }
  };

  const toggleNoticeCollapsed = () => {
    setNoticeCollapsed((current) => {
      const next = !current;
      localStorage.setItem(NOTICE_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const dismissNotice = () => {
    if (!activeNotice) return;
    localStorage.setItem(NOTICE_DISMISSED_KEY, activeNotice);
    setDismissedNotice(activeNotice);
  };

  const restoreDismissedNotice = () => {
    if (!canRestoreDismissedNotice(activeNotice, dismissedNotice)) return;
    localStorage.removeItem(NOTICE_DISMISSED_KEY);
    setDismissedNotice(null);
    setNoticeCollapsed(false);
    localStorage.setItem(NOTICE_COLLAPSED_KEY, "false");
    toast.success("공지를 다시 표시합니다");
  };

  const selectActiveClub = (clubId: number) => {
    const club = clubs.find((item) => item.id === clubId);
    if (!club) return;

    setSelectedClubId(club.id);
    localStorage.setItem(LAST_CLUB_KEY, club.name);
    setLocationOpen(true);
    localStorage.setItem(LOCATION_OPEN_KEY, "true");
    window.setTimeout(() => {
      document.getElementById("section-location")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  useEffect(() => {
    draftMediaRef.current = draftMedia;
  }, [draftMedia]);

  useEffect(() => () => {
    draftMediaRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
  }, []);

  const removeDraftMedia = (id: string) => {
    setDraftMedia((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  };

  const clearDraftMedia = () => {
    setDraftMedia((current) => {
      current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
    if (recordMediaInputRef.current) recordMediaInputRef.current.value = "";
  };

  const addRecordMedia = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const accepted: DraftRecordMedia[] = [];
    for (const file of files) {
      const validationError = getRecordMediaValidationError(file, draftMedia.length + accepted.length);
      if (validationError) {
        toast.error(validationError);
        continue;
      }
      accepted.push({ id: nanoid(), file, previewUrl: URL.createObjectURL(file) });
    }
    if (accepted.length > 0) setDraftMedia((current) => [...current, ...accepted]);
  };

  // ── 습사 기록 저장 ────────────────────────────────────────────────────────
  const saveRecord = async () => {
    const expertArrowCount = new Set(grid.flat(2)).size;
    const saveMode = getPracticeRecordSaveMode({
      expertMode,
      normalShotCount: shots.filter((shot) => shot !== null).length,
      expertArrowCount,
      memo,
      attachmentCount: draftMedia.length,
    });

    if (saveMode === "empty") {
      toast.error("5시를 입력하거나 메모·첨부를 추가해 주세요");
      return;
    }
    if (saveMode === "invalid-partial") {
      const enteredCount = expertMode ? expertArrowCount : shots.filter((shot) => shot !== null).length;
      toast.error(expertMode ? `과녁에 5발을 모두 찍어주세요 (${enteredCount}/5)` : "5시를 모두 입력해 주세요");
      return;
    }

    // 전문가 모드: 그리드에서 shots 동기화
    let finalShots = shots;
    let finalPositions: number[][][] | undefined;
    if (saveMode === "round" && expertMode) {
      // 그리드에 찍힌 화살들로 shots 재구성
      const arrowsInGrid = new Set<number>();
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) grid[r][c].forEach(n => arrowsInGrid.add(n));
      // 관중 여부: 중앙 3×3 (row 1~3, col 1~3)에 있으면 관중
      const hitArrows = new Set<number>();
      for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) grid[r][c].forEach(n => hitArrows.add(n));
      finalShots = [1,2,3,4,5].map((n) => arrowsInGrid.has(n) ? hitArrows.has(n) : null) as (boolean | null)[];
      finalPositions = grid.map((row) => row.map((cell) => [...cell]));
    }
    const hits = saveMode === "round" ? finalShots.filter(Boolean).length : 0;
    const curLat = myLatRef.current;
    const curLng = myLngRef.current;

    // 지오펜싱: GPS 좌표가 있으면 300m 이내 활터 자동 매칭
    let matchedClubName: string | undefined;
    if (curLat !== null && curLng !== null) {
      const GEOFENCE_M = 300;
      const nearby = clubs.find(
        (c) => haversineKm(curLat!, curLng!, c.latitude, c.longitude) * 1000 <= GEOFENCE_M
      );
      matchedClubName = nearby?.name;
    }

    const recordId = nanoid();
    let savedMedia: LocalRecordMedia[] = [];
    try {
      savedMedia = await saveRecordMedia(recordId, draftMedia.map((attachment) => attachment.file));
    } catch {
      toast.error("첨부 파일을 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요.");
      return;
    }

    const record: ShotRecord = {
      id: recordId,
      date: new Date().toISOString(),
      shots: saveMode === "round" ? finalShots as boolean[] : [],
      hits,
      memo,
      kind: saveMode,
      media: savedMedia,
      // 300m 이내 활터명이 있으면 활터명 저장, 없으면 GPS 좌표 저장
      clubName: matchedClubName,
      lat: matchedClubName ? undefined : (curLat ?? undefined),
      lng: matchedClubName ? undefined : (curLng ?? undefined),
      positions: finalPositions,
    };
    const updated = [record, ...records];
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShots([null, null, null, null, null]);
    setMemo("");
    clearDraftMedia();
    if (saveMode === "round" && expertMode) {
      setGrid(Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => [])));
      setNextArrow(1);
    }
    const locationLabel = matchedClubName ? ` · 📍${matchedClubName}` : "";
    const mediaLabel = savedMedia.length > 0 ? ` · 첨부 ${savedMedia.length}개` : "";
    toast.success(saveMode === "round"
      ? `저장 완료 — ${hits}중 / 5시${hits === 5 ? " 🎉 몰기!" : ""}${mediaLabel}${locationLabel}`
      : `메모 기록 저장 완료${mediaLabel}${locationLabel}`);

    // ── 성장형 나무: 레벨업 / 몰기 해금 감지 ────────────────────────────────
    if (saveMode !== "round") return;

    const prevTotalHits = records.filter(isPracticeRound).reduce((s, r) => s + r.hits, 0);
    const newTotalHits = prevTotalHits + hits;
    const prevMollgi = records.filter((r) => isPracticeRound(r) && r.hits === 5).length;
    const newMollgi = prevMollgi + (hits === 5 ? 1 : 0);

    // 레벨업 감지 (단계 경계 통과)
    const LEVEL_THRESHOLDS = [50, 200, 500];
    const LEVEL_NAMES = [
      { emoji: "🌿", name: "무럭무럭 묘목" },
      { emoji: "🌲", name: "든든한 소나무" },
      { emoji: "🌳", name: "풍성한 신령목" },
    ];
    const crossedLevel = LEVEL_THRESHOLDS.findIndex(
      (t) => prevTotalHits < t && newTotalHits >= t
    );
    if (crossedLevel >= 0) {
      const lvl = LEVEL_NAMES[crossedLevel];
      setTimeout(() => setTreeModal({
        type: "levelup",
        title: "나무가 성장했습니다!",
        desc: `누적 ${newTotalHits}중을 달성하여\n${lvl.emoji} ${lvl.name}으로 성장했습니다!`,
        emoji: lvl.emoji,
      }), 600);
    } else {
      // 몰기 특수 오브젝트 해금 감지
      const MOLLGI_THRESHOLDS = [
        { at: 10, emoji: "🌸", name: "붉은 꽃", desc: "몰기 10회 달성!\n나무에 붉은 꽃이 피어났습니다." },
        { at: 30, emoji: "🍎", name: "황금 열매", desc: "몰기 30회 달성!\n나무에 황금 열매가 열렸습니다." },
        { at: 50, emoji: "🐦", name: "전설의 파랑새", desc: "몰기 50회 달성!\n전설의 파랑새가 나무 위에 둥지를 틀었습니다." },
        { at: 100, emoji: "✨🌈", name: "신비로운 오로라", desc: "몰기 100회 달성!\n최고 영예의 궁사! 신비로운 오로라가 나무를 감쌌습니다." },
      ];
      const crossedUnlock = MOLLGI_THRESHOLDS.find(
        (m) => prevMollgi < m.at && newMollgi >= m.at
      );
      if (crossedUnlock) {
        setTimeout(() => setTreeModal({
          type: "unlock",
          title: `${crossedUnlock.name} 해금!`,
          desc: crossedUnlock.desc,
          emoji: crossedUnlock.emoji,
        }), 600);
      }
    }
  };

  // ── 기록 삭제 ─────────────────────────────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingDeleteRecordId, setPendingDeleteRecordId] = useState<string | null>(null);
  const pendingDeleteRecord = pendingDeleteRecordId
    ? records.find((record) => record.id === pendingDeleteRecordId) ?? null
    : null;

  const requestDeleteRecord = (id: string) => {
    setPendingDeleteRecordId(id);
  };

  const deleteRecord = (id: string) => {
    const mediaIds = records.find((record) => record.id === id)?.media?.map((attachment) => attachment.id) ?? [];
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    void deleteRecordMedia(mediaIds).catch(() => {
      toast.error("기기 내 첨부 파일 정리에 실패했습니다");
    });
    toast.success("기록이 삭제되었습니다");
  };

  const confirmDeleteRecord = () => {
    if (!pendingDeleteRecord) return;
    deleteRecord(pendingDeleteRecord.id);
    setPendingDeleteRecordId(null);
  };

  // ── 메모 편집 ──────────────────────────────────────────────────────────────
  const updateMemo = (id: string, newMemo: string) => {
    const updated = records.map((r) => r.id === id ? { ...r, memo: newMemo } : r);
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addMediaToRecord = async (id: string, files: File[]) => {
    const record = records.find((item) => item.id === id);
    if (!record || files.length === 0) return;

    const existingCount = record.media?.length ?? 0;
    const accepted: File[] = [];
    for (const file of files) {
      const validationError = getRecordMediaValidationError(file, existingCount + accepted.length);
      if (validationError) {
        toast.error(validationError);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    let savedMedia: LocalRecordMedia[];
    try {
      savedMedia = await saveRecordMedia(id, accepted);
    } catch {
      toast.error("첨부 파일을 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요.");
      return;
    }

    const updated = records.map((item) => item.id === id
      ? { ...item, media: [...(item.media ?? []), ...savedMedia] }
      : item);
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success(`첨부 ${savedMedia.length}개를 기록에 추가했습니다`);
  };

  const deleteMediaFromRecord = async (recordId: string, mediaId: string): Promise<boolean> => {
    const record = records.find((item) => item.id === recordId);
    const attachment = record?.media?.find((item) => item.id === mediaId);
    if (!record || !attachment) return false;

    try {
      await deleteRecordMedia([mediaId]);
    } catch {
      toast.error("기기 내 첨부 파일을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }

    const updated = records.map((item) => item.id === recordId
      ? { ...item, media: (item.media ?? []).filter((media) => media.id !== mediaId) }
      : item);
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success(`첨부 파일을 삭제했습니다 · ${attachment.name}`);
    return true;
  };

  const clearAllRecords = () => {
    setRecords([]);
    localStorage.removeItem(STORAGE_KEY);
    void clearRecordMedia().catch(() => {
      toast.error("기기 내 첨부 파일 정리에 실패했습니다");
    });
    setShowClearConfirm(false);
    toast.success("모든 기록이 삭제되었습니다");
  };

  // ── CSV 내보내기 ──────────────────────────────────────────────────────────
  const exportCSV = (fromBanner = false) => {
    if (records.length === 0) { toast.error("저장된 기록이 없습니다"); return; }
    const BOM = "\uFEFF";
    // 첫 줄에 나무 이름을 주석으로 포함 (가져오기 시 복원용)
    const currentTreeName = localStorage.getItem(TREE_NAME_KEY) || "나의 나무";
    const metaLine = `#나무이름:${currentTreeName}\n`;
    const header = "순번,날짜(KST),관중수,습사내역,메모,활터명,위도,경도,기록유형,첨부수,전문가과녁위치\n";
    const rows = [...records].reverse().map((r, i) => createCSVRow([
      i + 1,
      `${formatDate(r.date)} ${formatTime(r.date)}`,
      r.hits,
      r.shots.map((s) => (s ? "O" : "X")).join(" "),
      r.memo ?? "",
      r.clubName ?? "",
      r.clubName ? "" : (r.lat ?? ""),
      r.clubName ? "" : (r.lng ?? ""),
      isPracticeRound(r) ? "습사" : "메모",
      r.media?.length ?? 0,
      serializeExpertTargetPositions(r.positions),
    ])).join("\n");
    const blob = new Blob([BOM + metaLine + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `활터왔소_습사일지_${todayKST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // 마지막 백업 시간 기록
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    setShowBackupBanner(false);
    if (fromBanner) toast.success("CSV 백업 완료! 첨부 파일은 이 기기에 남아 있습니다.");
  };

  // ── CSV 가져오기 ──────────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);
  const portableBackupFileRef = useRef<HTMLInputElement>(null);
  const [portableBackupLoading, setPortableBackupLoading] = useState(false);
  const [portableRestoreLoading, setPortableRestoreLoading] = useState(false);
  const [portableRestoreStage, setPortableRestoreStage] = useState<"idle" | "safety" | "restore">("idle");
  const [pendingPortableBackup, setPendingPortableBackup] = useState<PortableBackup | null>(null);
  const [portableRestoreMode, setPortableRestoreMode] = useState<"merge" | "replace">("merge");
  const [latestSafetyBackup, setLatestSafetyBackup] = useState<SafetyBackupInfo | null>(null);
  const [safetyBackupDownloadLoading, setSafetyBackupDownloadLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void getLatestSafetyBackupInfo()
      .then((backup) => { if (active) setLatestSafetyBackup(backup); })
      .catch(() => { /* 안전 백업 저장소가 없는 브라우저에서는 안내만 생략 */ });
    return () => { active = false; };
  }, []);

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 파일 input 초기화 (같은 파일 재선택 허용)
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = (ev.target?.result as string) || "";
        // BOM 제거
        const clean = text.replace(/^\uFEFF/, "");
        const lines = clean.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) { toast.error("불러올 기록이 없습니다"); return; }

        // 나무 이름 주석 행 복원 (#나무이름:...)
        let restoredTreeName: string | null = null;
        for (const line of lines) {
          const match = line.match(/^#나무이름:(.+)$/);
          if (match) { restoredTreeName = match[1].trim(); break; }
        }

        // 주석 행(‘#’ 시작) 및 헤더 행 제외한 데이터 행만 파싱
        const dataLines = lines.filter((l) => !l.startsWith("#") && !/^순번,/.test(l));
        if (dataLines.length === 0) { toast.error("불러올 기록이 없습니다"); return; }

        // 헤더 건너뛰고 파싱
        const imported: ShotRecord[] = [];
        for (let i = 0; i < dataLines.length; i++) {
          const cols = parseCSVRow(dataLines[i]);

          // 컬럼: 순번, 날짜(KST), 관중수, 습사내역, 메모, 활터명, 위도, 경도, 기록유형, 첨부수, 전문가과녁위치
          if (cols.length < 4) continue;
          const dateStr = cols[1]?.trim(); // "YYYY.MM.DD HH:MM"
          const hitsStr = cols[2]?.trim();
          const shotsStr = cols[3]?.trim(); // "O X O X O"
          const memo = cols[4]?.trim() ?? "";
          // 활터명 컬럼이 없는 이전 CSV도 호환 지원 (컬럼 수에 따라 분기)
          const hasClubCol = cols.length >= 7;
          const clubName = hasClubCol ? (cols[5]?.trim() || undefined) : undefined;
          const lat = hasClubCol ? (cols[6] ? parseFloat(cols[6]) : undefined) : (cols[5] ? parseFloat(cols[5]) : undefined);
          const lng = hasClubCol ? (cols[7] ? parseFloat(cols[7]) : undefined) : (cols[6] ? parseFloat(cols[6]) : undefined);
          const kind: PracticeRecordKind = cols[8]?.trim() === "메모" ? "memo" : "round";
          const positions = kind === "round" ? parseExpertTargetPositions(cols[10]) : undefined;

          // 날짜 파싱 (YYYY.MM.DD HH:MM → ISO)
          const dateParts = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
          if (!dateParts) continue;
          const isoDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}T${dateParts[4]}:${dateParts[5]}:00`;
          if (!isValidDate(isoDate)) continue;

          // 습사내역 파싱 ("O X O X O")
          const shots = kind === "memo" ? [] : shotsStr.split(" ").map((s) => s === "O" ? true : s === "X" ? false : null);
          const hits = kind === "memo" ? 0 : parseInt(hitsStr, 10);
          if (isNaN(hits)) continue;

          imported.push({
            id: nanoid(),
            date: isoDate,
            shots,
            hits,
            memo,
            kind,
            clubName,
            lat: isNaN(lat as number) ? undefined : lat,
            lng: isNaN(lng as number) ? undefined : lng,
            positions,
          });
        }

        if (imported.length === 0) { toast.error("파싱 가능한 기록이 없습니다"); return; }

        // 나무 이름 복원 (현재 이름이 기본값일 때만)
        let treeNameRestored = false;
        if (restoredTreeName) {
          const currentName = localStorage.getItem(TREE_NAME_KEY) || "나의 나무";
          const isDefault = currentName === "나의 나무" || currentName === "나의 나무";
          if (isDefault) {
            localStorage.setItem(TREE_NAME_KEY, restoredTreeName);
            setTreeName(restoredTreeName);
            treeNameRestored = true;
          }
        }

        // 중복 제거: 날짜+습사내역이 동일한 기록 건너뛰
        setRecords((prev) => {
          const recordKey = (record: ShotRecord) => `${record.date}|${record.kind ?? "round"}|${record.shots.join(",")}|${record.memo}|${serializeExpertTargetPositions(record.positions)}`;
          const existingKeys = new Set(prev.map(recordKey));
          const newOnes = imported.filter((record) => !existingKeys.has(recordKey(record)));
          if (newOnes.length === 0) {
            toast.info("이미 동일한 기록이 모두 존재합니다");
            return prev;
          }
          // 병합 후 최신순 정렬
          const merged = [...prev, ...newOnes].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          const treeMsg = treeNameRestored ? ` · 나무 이름 "${restoredTreeName}" 복원` : "";
          toast.success(`${newOnes.length}개 기록을 복원했습니다 🎉${treeMsg}`);
          return merged;
        });
      } catch (err) {
        toast.error("CSV 파일을 읽는 중 오류가 발생했습니다");
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const getPortableSettings = (): Record<string, string> => Object.fromEntries(
    PORTABLE_SETTING_KEYS.flatMap((key) => {
      const value = localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );

  const restorePortableSettings = (settings: Record<string, string>, mode: "merge" | "replace") => {
    if (mode === "replace") {
      PORTABLE_SETTING_KEYS.forEach((key) => localStorage.removeItem(key));
    }
    PORTABLE_SETTING_KEYS.forEach((key) => {
      const value = settings[key];
      if (value !== undefined) {
        localStorage.setItem(key, value);
      }
    });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createSafetyBackupBeforeReplace = async () => {
    const currentMedia = await getAllRecordMedia();
    const archive = await createPortableBackup({ records, settings: getPortableSettings(), media: currentMedia });
    const safetyInfo = await saveLatestSafetyBackup(archive, {
      recordCount: records.length,
      mediaCount: currentMedia.length,
    });
    setLatestSafetyBackup(safetyInfo);
    downloadBlob(archive, `활터왔소_전체복원전_안전백업_${todayKST()}.zip`);
    return currentMedia;
  };

  const downloadLatestSafetyBackup = async () => {
    setSafetyBackupDownloadLoading(true);
    try {
      const archive = await getLatestSafetyBackupBlob();
      if (!archive || !latestSafetyBackup) {
        toast.info("보관된 안전 백업이 없습니다.");
        return;
      }
      downloadBlob(archive, `활터왔소_전체복원전_안전백업_${latestSafetyBackup.createdAt.slice(0, 10)}.zip`);
      toast.success("최근 안전 백업 ZIP을 저장했습니다.");
    } catch (error) {
      console.error(error);
      toast.error("안전 백업 ZIP을 저장하지 못했습니다.");
    } finally {
      setSafetyBackupDownloadLoading(false);
    }
  };

  const exportPortableBackup = async () => {
    setPortableBackupLoading(true);
    try {
      const media = await getAllRecordMedia();
      const archive = await createPortableBackup({ records, settings: getPortableSettings(), media });
      downloadBlob(archive, `활터왔소_전체백업_${todayKST()}.zip`);
      localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
      setShowBackupBanner(false);
      toast.success(`전체 ZIP 백업 완료 · 기록 ${records.length}건 · 첨부 ${media.length}개`);
    } catch (error) {
      console.error(error);
      toast.error("전체 ZIP 백업을 만들지 못했습니다. 저장 공간을 확인해 주세요.");
    } finally {
      setPortableBackupLoading(false);
    }
  };

  const preparePortableRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPortableRestoreLoading(true);
    try {
      const backup = await readPortableBackup(file);
      setPendingPortableBackup(backup);
      setPortableRestoreMode("merge");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ZIP 백업 파일을 읽지 못했습니다.");
    } finally {
      setPortableRestoreLoading(false);
    }
  };

  const applyPortableRestore = async () => {
    if (!pendingPortableBackup) return;
    let activeRestoreStage: "safety" | "restore" | null = null;
    setPortableRestoreLoading(true);
    try {
      const isReplace = portableRestoreMode === "replace";
      if (isReplace) {
        activeRestoreStage = "safety";
        setPortableRestoreStage("safety");
        await createSafetyBackupBeforeReplace();
        activeRestoreStage = "restore";
        setPortableRestoreStage("restore");
        await restoreRecordMedia(pendingPortableBackup.media, { replace: true });
        const restoredRecords = pendingPortableBackup.manifest.records as ShotRecord[];
        setRecords(restoredRecords);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredRecords));
        restorePortableSettings(pendingPortableBackup.manifest.settings, "replace");
        toast.success(`전체 복원 완료 · 기록 ${restoredRecords.length}건 · 첨부 ${pendingPortableBackup.media.length}개 · 이전 상태 안전 백업 완료`);
      } else {
        activeRestoreStage = "restore";
        setPortableRestoreStage("restore");
        const currentMedia = await getAllRecordMedia();
        const merged = mergePortableBackup(records, currentMedia, pendingPortableBackup);
        await restoreRecordMedia(merged.media);
        setRecords(merged.records as ShotRecord[]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.records));
        restorePortableSettings(pendingPortableBackup.manifest.settings, "merge");
        toast.success(`병합 복원 완료 · 새 기록 ${merged.addedRecordCount}건${merged.skippedRecordCount > 0 ? ` · 중복 ${merged.skippedRecordCount}건 건너뜀` : ""}`);
      }
      setPendingPortableBackup(null);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      console.error(error);
      if (portableRestoreMode === "replace" && activeRestoreStage === "safety") {
        toast.error("현재 상태를 안전하게 보관하지 못해 전체 복원을 시작하지 않았습니다. 기기 저장 공간을 확인해 주세요.");
      } else {
        toast.error("ZIP 복원에 실패했습니다. 백업 파일과 기기 저장 공간을 확인해 주세요.");
      }
    } finally {
      setPortableRestoreLoading(false);
      setPortableRestoreStage("idle");
    }
  };

  // ── 통계 계산 ─────────────────────────────────────────────────────────────
  const computeStats = () => {
    const now = new Date();
    const filtered = records.filter((r) => {
      if (!isPracticeRound(r)) return false;
      if (!isValidDate(r.date)) return false;
      const d = new Date(r.date);
      if (statTab === "일별") return d.toDateString() === now.toDateString();
      if (statTab === "주별") {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      }
      if (statTab === "월별") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (statTab === "전체") return true;
      return d.getFullYear() === now.getFullYear();
    });
    const totalRounds = filtered.length;
    const totalHits = filtered.reduce((s, r) => s + r.hits, 0);
    const totalShots = totalRounds * 5;
    const avgHits = totalRounds > 0 ? (totalHits / totalRounds).toFixed(1) : "0.0";
    const best = filtered.reduce((max, r) => Math.max(max, r.hits), 0);
    // 몰기: 5시 전수 명중 횟수
    const mollgi = filtered.filter((r) => r.hits === 5).length;
    return { totalRounds, totalHits, totalShots, avgHits, best, mollgi };
  };
  const stats = computeStats();
  const practiceRounds = useMemo(() => records.filter(isPracticeRound), [records]);
  const memoRecordCount = records.length - practiceRounds.length;
  const collapsedLocationSummary = useMemo(() => {
    if (myLat !== null && myLng !== null && clubs.length > 0) {
      return [...clubs]
        .map((club) => ({ club, distance: haversineKm(myLat, myLng, club.latitude, club.longitude) }))
        .sort((a, b) => a.distance - b.distance)[0]?.club.name ?? "";
    }
    return selectedClub?.name ?? "";
  }, [clubs, myLat, myLng, selectedClub]);
  const latestRecordSummary = useMemo(() => {
    if (records.length === 0) return "-";
    const latest = records.reduce((current, record) =>
      new Date(record.date).getTime() > new Date(current.date).getTime() ? record : current
    );
    return formatDate(latest.date);
  }, [records]);
  const visitedClubRecords = useMemo(
    () => records.filter((record) => isValidDate(record.date) && Boolean(record.clubName?.trim())),
    [records]
  );
  const visitedClubSummary = useMemo(
    () => new Set(
      visitedClubRecords.map((record) => record.clubName?.trim()).filter((name): name is string => Boolean(name))
    ).size,
    [visitedClubRecords]
  );

  // ── 활터별 통계 계산 ───────────────────────────────────────────────────────
  const computeClubStats = () => {
    // clubName이 있는 기록만 집계 (지오펜싱 매칭된 기록)
    const clubRecords = records.filter((r) => isPracticeRound(r) && r.clubName && isValidDate(r.date));
    // 활터명별로 그룹핑
    const map = new Map<string, { rounds: number; hits: number; mollgi: number; days: Set<string> }>();
    for (const r of clubRecords) {
      const name = r.clubName!;
      const prev = map.get(name) ?? { rounds: 0, hits: 0, mollgi: 0, days: new Set<string>() };
      prev.days.add(getDateKey(r.date));
      map.set(name, {
        rounds: prev.rounds + 1,
        hits: prev.hits + r.hits,
        mollgi: prev.mollgi + (r.hits === 5 ? 1 : 0),
        days: prev.days,
      });
    }
    // 순수 많은 순으로 내림차순 정렬
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        rounds: v.rounds,
        hits: v.hits,
        avgHits: v.rounds > 0 ? (v.hits / v.rounds).toFixed(1) : "0.0",
        rate: v.rounds > 0 ? Math.round((v.hits / (v.rounds * 5)) * 100) : 0,
        mollgi: v.mollgi,
        visitDays: v.days.size,
      }))
      .sort((a, b) => b.rounds - a.rounds);
  };
  const clubStats = computeClubStats();

  // ── 관리자 헤더 탭 ────────────────────────────────────────────────────────
  const triggerBrandPulse = () => {
    restartBrandPulse(setBrandPulse, (callback) => window.requestAnimationFrame(callback));
    if (brandPulseTimer.current) clearTimeout(brandPulseTimer.current);
    brandPulseTimer.current = setTimeout(() => setBrandPulse(false), 650);
  };

  const handleBrandInteraction = () => {
    handleHeaderTap();
    triggerBrandPulse();
  };

  const handleHeaderTap = () => {
    const next = adminTapCount + 1;
    setAdminTapCount(next);
    if (adminTapTimer.current) clearTimeout(adminTapTimer.current);
    if (next >= 5) {
      setAdminTapCount(0);
      if (adminMode) { setAdminMode(false); toast.success("관리자 모드 종료"); }
      else setShowAdminLogin(true);
    } else {
      adminTapTimer.current = setTimeout(() => setAdminTapCount(0), 2000);
    }
  };

  const handleAdminLogin = () => {
    if (adminPwInput === getAdminPw()) {
      setNotice(displayNotice);
      setNoticeExpiry(displayNoticeExpiry);
      setSupportEventsInput(displaySupportEvents);
      setSupportEventEnabledInput(supportEventEnabled);
      setAdminMode(true);
      setShowAdminLogin(false);
      setAdminPwInput("");
      toast.success("관리자 모드 활성화");
    } else {
      toast.error("비밀번호가 틀렸습니다");
      setAdminPwInput("");
    }
  };

  // ── 관리자 설정 저장 ──────────────────────────────────────────────────────
  const saveAdminSettings = async () => {
    try {
      const savedNotice = resolveNoticeSaveValues(notice, noticeExpiry, displayNotice, displayNoticeExpiry);
      const savedSupportEvents = normalizeSupportEvents(supportEventsInput);
      const legacySupportEvent = savedSupportEvents[0];
      // 이전 공지가 있고, 새 공지와 다르면 이력에 보존
      if (displayNotice && displayNotice !== savedNotice.notice) {
        const entry = { text: displayNotice, expiry: displayNoticeExpiry || "", savedAt: new Date().toISOString() };
        const updatedHistory = [entry, ...noticeHistory].slice(0, 20); // 최대 20개 보존
        setNoticeHistory(updatedHistory);
        localStorage.setItem(NOTICE_HISTORY_KEY, JSON.stringify(updatedHistory));
      }
      const items = [
        { key: "radius_km", value: String(radius / 1000) },
        { key: "notice", value: savedNotice.notice },
        { key: "notice_expiry", value: savedNotice.expiry },
        { key: SUPPORT_EVENTS_KEY, value: JSON.stringify(savedSupportEvents) },
        { key: "support_event_title", value: legacySupportEvent?.title || "" },
        { key: "support_event_content", value: legacySupportEvent?.content || "" },
        { key: "support_event_date", value: legacySupportEvent?.date || "" },
        { key: "support_event_location_url", value: legacySupportEvent?.locationUrl || "" },
        { key: SUPPORT_EVENT_ENABLED_KEY, value: String(supportEventEnabledInput) },
      ];
      for (const item of items) {
        await supabase.from("app_settings").upsert(
          { key: item.key, value: item.value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }
      setNotice(savedNotice.notice);
      setNoticeExpiry(savedNotice.expiry);
      setDisplayNotice(savedNotice.notice);
      setDisplayNoticeExpiry(savedNotice.expiry);
      setSupportEventsInput(savedSupportEvents);
      setDisplaySupportEvents(savedSupportEvents);
      setSupportEventEnabled(supportEventEnabledInput);
      localStorage.removeItem(SUPPORT_EVENT_DISMISSED_KEY);
      setSupportEventDismissed(false);
      toast.success(savedNotice.preserved ? "설정이 저장되었습니다 · 기존 공지 유지" : "설정이 저장되었습니다");
    } catch {
      toast.error("저장 실패 — 네트워크를 확인해 주세요");
    }
  };

  // ── 관리자: 신규 활터 등록 ────────────────────────────────────────────────
  const registerClub = async () => {
    if (!newClubName.trim() || !newClubLat || !newClubLng) {
      toast.error("활터 이름, 위도, 경도를 모두 입력해 주세요");
      return;
    }
    const lat = parseFloat(newClubLat);
    const lng = parseFloat(newClubLng);
    if (isNaN(lat) || isNaN(lng)) { toast.error("위도/경도는 숫자로 입력해 주세요"); return; }
    try {
      const { error } = await supabase.from("clubs").insert({ name: newClubName.trim(), latitude: lat, longitude: lng });
      if (error) throw error;
      toast.success(`${newClubName} 등록 완료`);
      setNewClubName(""); setNewClubLat(""); setNewClubLng("");
      await loadClubs();
    } catch {
      toast.error("활터 등록 실패 — 네트워크를 확인해 주세요");
    }
  };

  // ── 관리자: 활터 삭제 ──────────────────────────────────────────────────────
  const deleteClub = async (id: number, name: string) => {
    if (!window.confirm(`"${name}" 활터를 삭제하시겠습니까?`)) return;
    setDeletingClubId(id);
    try {
      const { error } = await supabase.from("clubs").delete().eq("id", id);
      if (error) throw error;
      toast.success(`${name} 삭제 완료`);
      await loadClubs();
    } catch {
      toast.error("활터 삭제 실패 — 네트워크를 확인해 주세요");
    } finally {
      setDeletingClubId(null);
    }
  };

  const deleteAllClubs = async () => {
    if (clubs.length === 0) {
      toast.error("삭제할 활터가 없습니다");
      return;
    }
    if (!window.confirm(`등록된 활터 ${clubs.length}개를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingAllClubs(true);
    try {
      const { error } = await supabase.from("clubs").delete().not("id", "is", null);
      if (error) throw error;
      setEditingClubId(null);
      await loadClubs();
      toast.success(`${clubs.length}개 활터를 모두 삭제했습니다`);
    } catch {
      toast.error("활터 전체 삭제 실패 — 네트워크와 권한을 확인해 주세요");
    } finally {
      setDeletingAllClubs(false);
    }
  };


  // ── 관리자: 활터 편집 저장 ────────────────────────────────────────────────
  const updateClub = async () => {
    if (!editingClubId) return;
    const name = editClubName.trim();
    const lat = parseFloat(editClubLat);
    const lng = parseFloat(editClubLng);
    if (!name) { toast.error("활터 이름을 입력해 주세요"); return; }
    if (isNaN(lat) || lat < -90 || lat > 90) { toast.error("위도가 올바르지 않습니다 (-90 ~ 90)"); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { toast.error("경도가 올바르지 않습니다 (-180 ~ 180)"); return; }
    setSavingClubId(editingClubId);
    try {
      const { error } = await supabase
        .from("clubs")
        .update({ name, latitude: lat, longitude: lng, comment: editClubComment.trim() })
        .eq("id", editingClubId);
      if (error) throw error;
      toast.success(`"${name}" 편집 완료`);
      setEditingClubId(null);
      await loadClubs();
    } catch {
      toast.error("활터 편집 실패 — 네트워크를 확인해 주세요");
    } finally {
      setSavingClubId(null);
    }
  };

  // ── 관리자: 현재 위치로 신규 활터 좌표 채우기 ────────────────────────────
  const fillCurrentLocation = () => {
    if (myLatRef.current && myLngRef.current) {
      setNewClubLat(myLatRef.current.toFixed(5));
      setNewClubLng(myLngRef.current.toFixed(5));
    } else {
      toast.error("GPS 위치를 아직 받지 못했습니다");
    }
  };

  // ── CSV 백업 알림 체크 (앱 시작 시) ──────────────────────────────
  useEffect(() => {
    if (records.length === 0) return;
    const lastTs = localStorage.getItem(LAST_BACKUP_KEY);
    if (!lastTs) {
      // 한 번도 백업 안 한 경우
      setShowBackupBanner(true);
      return;
    }
    const daysSince = (Date.now() - Number(lastTs)) / (1000 * 60 * 60 * 24);
    if (daysSince >= BACKUP_REMIND_DAYS) {
      setShowBackupBanner(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 활터 검색 드롭다운 외부 클릭 닫기 ─────────────────────────────────
  useEffect(() => {
    if (!clubDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (clubSearchRef.current && !clubSearchRef.current.contains(e.target as Node)) {
        setClubDropdownOpen(false);
        setClubSearch("");
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [clubDropdownOpen]);

  // ── 관리자: CSV 다운로드 ────────────────────────────────────────────
  const downloadClubsCsv = () => {
    if (clubs.length === 0) { toast.error("다운로드할 활터가 없습니다"); return; }
    const header = "name,latitude,longitude,comment";
    const rows = clubs.map((c) => [c.name, c.latitude, c.longitude, c.comment ?? ""].map(escapeCsvField).join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `활터목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${clubs.length}개 활터 CSV 다운로드 완료`);
  };

  // ── 관리자: CSV 업로드 ────────────────────────────────────────────
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 입력값 전달리셋 (동일 파일 재선택 허용)
    e.target.value = "";
    setCsvUploading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // 첫 줄이 헤더인지 확인
      const firstLower = lines[0]?.toLowerCase() ?? "";
      const startIdx = firstLower.includes("name") || firstLower.includes("이름") ? 1 : 0;
      const parsed: { name: string; latitude: number; longitude: number; comment: string }[] = [];
      const errors: string[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 3) { errors.push(`${i + 1}줄: 컴마 3개 미만`); continue; }
        const name = cols[0];
        const lat = parseFloat(cols[1]);
        const lng = parseFloat(cols[2]);
        if (!name) { errors.push(`${i + 1}줄: 이름 비었음`); continue; }
        if (isNaN(lat) || isNaN(lng)) { errors.push(`${i + 1}줄: 좌표 오류`); continue; }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { errors.push(`${i + 1}줄: 좌표 범위 초과`); continue; }
        parsed.push({ name, latitude: lat, longitude: lng, comment: cols[3] ?? "" });
      }
      if (parsed.length === 0) {
        toast.error("유효한 활터 데이터가 없습니다. CSV 형식을 확인해 주세요.");
        return;
      }
      // Supabase 일괄 삽입
      const { error } = await supabase.from("clubs").insert(parsed);
      if (error) throw error;
      await loadClubs();
      const msg = errors.length > 0
        ? `${parsed.length}개 등록 완료 (${errors.length}개 오류 건 건너뜀)`
        : `${parsed.length}개 활터 등록 완료`;
      toast.success(msg);
      if (errors.length > 0) toast.error("오류: " + errors.slice(0, 3).join(" / ") + (errors.length > 3 ? " ..." : ""));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      toast.error("CSV 업로드 실패: " + msg);
    } finally {
      setCsvUploading(false);
    }
  };

  // ── 활터까지 거리 ─────────────────────────────────────────────────────────
  const distanceToClub = myLat && myLng && selectedClub
    ? haversineKm(myLat, myLng, selectedClub.latitude, selectedClub.longitude) * 1000
    : null;

  const distanceLabel = distanceToClub !== null
    ? distanceToClub < 1000
      ? `${Math.round(distanceToClub)}m`
      : `${(distanceToClub / 1000).toFixed(1)}km`
    : null;

  const isInsideRadius = distanceToClub !== null && distanceToClub <= radius;

  // ── 날짜별 그룹 ───────────────────────────────────────────────────────────
  const journalRecords = filterJournalRecords(records, journalSearch, {
    startDate: journalStartDate,
    endDate: journalEndDate,
  });
  const journalPracticeRounds = journalRecords.filter(isPracticeRound);
  const dateGroups = groupByDate(journalRecords);
  const journalClubGroups = Array.from(
    journalRecords.reduce((groups, record) => {
      const clubName = record.clubName?.trim() || "활터 미지정";
      const existing = groups.get(clubName) ?? [];
      existing.push(record);
      groups.set(clubName, existing);
      return groups;
    }, new Map<string, ShotRecord[]>())
  ).map(([clubName, clubRecords]) => {
    const roundRecords = clubRecords.filter(isPracticeRound);
    const totalHits = roundRecords.reduce((sum, record) => sum + record.hits, 0);
    const latestVisitDate = clubRecords.reduce((latest, record) => (
      !latest || record.date > latest ? record.date : latest
    ), "");
    const visitDays = new Set(clubRecords.map((record) => getDateKey(record.date))).size;
    return {
      clubName,
      records: clubRecords,
      latestVisitDate,
      visitDays,
      totalHits,
      totalRounds: roundRecords.length,
      memoEntries: clubRecords.length - roundRecords.length,
      rate: roundRecords.length > 0 ? Math.round((totalHits / (roundRecords.length * 5)) * 100) : 0,
    };
  });
  const selectedJournalDateGroup = selectedJournalDate
    ? dateGroups.find((group) => group.date === selectedJournalDate) ?? null
    : null;
  const selectedJournalClubGroup = selectedJournalClub
    ? journalClubGroups.find((group) => group.clubName === selectedJournalClub) ?? null
    : null;

  const updateJournalStartDate = (nextStartDate: string) => {
    setJournalStartDate(nextStartDate);
    if (journalEndDate && nextStartDate > journalEndDate) setJournalEndDate(nextStartDate);
  };

  const updateJournalEndDate = (nextEndDate: string) => {
    setJournalEndDate(nextEndDate);
    if (journalStartDate && nextEndDate < journalStartDate) setJournalStartDate(nextEndDate);
  };

  const clearJournalFilters = () => {
    setJournalSearch("");
    setJournalStartDate("");
    setJournalEndDate("");
  };

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen mobile-readable" style={{ background: "#F5F0E8", fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* 헤더 */}
      <header
        className="sticky top-0 z-50 relative flex items-center justify-center py-3 px-4 cursor-pointer select-none"
        style={{ background: "#294B31", boxShadow: "0 2px 8px rgba(0,0,0,0.22)" }}
        role="button"
        tabIndex={0}
        aria-label="활터 왔소 브랜드, 활성화하려면 Enter 또는 Space"
        onClick={handleBrandInteraction}
        onKeyDown={(event) => {
          if (!isBrandActivationKey(event.key)) return;
          event.preventDefault();
          handleBrandInteraction();
        }}
      >
        <span className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[0.01em]" style={{ color: "#F7F0DF", fontFamily: "'Noto Serif KR', serif" }}>
          <BrandMark size={40} className={`samjoko-brand-mark shrink-0 mix-blend-screen${brandPulse ? " samjoko-brand-mark--active" : ""}`} />
          <span>활터 왔소</span>
        </span>
        {adminMode && (
          <span className="ml-3 text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#8B2635", color: "#fff" }}>
            관리자
          </span>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowUserSettings(true);
          }}
          className="absolute right-4 grid size-9 place-items-center rounded-lg border transition-colors active:scale-95"
          style={{ color: "#F7F0DF", background: "rgba(255,255,255,0.08)", borderColor: "rgba(247,240,223,0.16)" }}
          aria-label="설정 열기"
          title="설정"
        >
          <Settings size={17} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="px-4">
        <HomeScreenInstallCard />
      </div>

      {/* 공지 카드 */}
      {visibleNotice && (
        <div className="px-4 pt-3">
          <article
            className={`mx-auto max-w-2xl rounded-2xl border shadow-sm ${noticeCollapsed ? "h-14 p-0" : "p-4"}`}
            style={{ background: "#FFF8DD", color: "#856404", borderColor: "#FFE08A" }}
            aria-live="polite"
          >
            <div className={`flex h-14 items-center justify-between ${noticeCollapsed ? "px-4" : "px-0"}`}>
              <button
                type="button"
                onClick={toggleNoticeCollapsed}
                className="min-w-0 flex-1 text-left transition-colors active:scale-[0.99]"
                aria-expanded={!noticeCollapsed}
                aria-controls="notice-card-content"
              >
                  <span className="flex items-center gap-2.5">
                  <CardIcon name="notice" tone="notice" />
                  <span className="text-base font-bold leading-tight tracking-[-0.02em]">공지</span>
                  {noticeCollapsed && <span className="text-xs font-medium leading-none opacity-80">탭하여 펼치기</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={toggleNoticeCollapsed}
                className="grid size-7 shrink-0 place-items-center transition-transform active:scale-95"
                aria-label={noticeCollapsed ? "공지 펼치기" : "공지 접기"}
                title={noticeCollapsed ? "공지 펼치기" : "공지 접기"}
              >
                <CollapseChevron open={!noticeCollapsed} color="#856404" background="rgba(255,255,255,0.55)" borderColor="#FFE08A" />
              </button>
            </div>
            {!noticeCollapsed && (
              <div id="notice-card-content" className="mt-3 border-t pt-3" style={{ borderColor: "#FFE08A" }}>
                <p className="whitespace-pre-wrap text-sm font-medium leading-6">{visibleNotice}</p>
                {displayNoticeExpiry && <p className="mt-1 text-xs opacity-70">{displayNoticeExpiry} 까지</p>}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={dismissNotice}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors active:scale-95"
                    style={{ color: "#856404", background: "rgba(255,255,255,0.55)", border: "1px solid #FFE08A" }}
                    aria-label="공지 닫기"
                    title="공지 닫기"
                  >
                    ✕ 닫기
                  </button>
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      {/* 관리자 로그인 모달 */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-2xl p-6 w-80 shadow-2xl" style={{ background: "#fff" }}>
            <h3 className="text-lg font-bold mb-4 text-center" style={{ color: "#3D5A3E" }}>관리자 로그인</h3>
            <input
              type="password"
              placeholder="비밀번호 입력"
              value={adminPwInput}
              onChange={(e) => setAdminPwInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
              className="w-full border rounded-xl px-4 py-3 text-center text-lg mb-4 outline-none"
              style={{ borderColor: "#3D5A3E" }}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowAdminLogin(false); setAdminPwInput(""); }}
                className="flex-1 py-2 rounded-xl font-medium" style={{ background: "#e5e7eb", color: "#374151" }}>
                취소
              </button>
              <button onClick={handleAdminLogin}
                className="flex-1 py-2 rounded-xl font-bold text-white" style={{ background: "#3D5A3E" }}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일반 사용자 설정 */}
      {showUserSettings && (
        <div
          className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center overflow-y-auto p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          role="presentation"
          onClick={() => setShowUserSettings(false)}
        >
          <section
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md touch-pan-y overflow-y-auto overscroll-contain rounded-2xl p-5 shadow-2xl card-enter"
            style={{ background: "#fff", WebkitOverflowScrolling: "touch" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 id="user-settings-title" className="text-lg font-bold" style={{ color: "#3D5A3E" }}>⚙️ 설정</h2>
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>내 기기에서 저장된 표시 설정을 관리합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowUserSettings(false)}
                className="w-8 h-8 rounded-lg text-lg active:scale-95"
                style={{ color: "#6B7280", background: "#F5F0E8" }}
                aria-label="설정 닫기"
              >
                ✕
              </button>
            </div>
            <UserSettingsSection
              id="recordTools"
              title="기록 관리"
              summary="백업 · CSV · 초기화"
              open={userSettingsOpen.recordTools}
              onToggle={() => toggleUserSettingsSection("recordTools")}
            >
              <p data-record-tools-description className="mb-2.5 text-xs leading-5" style={{ color: "#6B7280" }}>기기 변경 전에는 <strong style={{ color: "#3D5A3E" }}>전체 ZIP 백업</strong>을 저장하세요. ZIP 복원은 첨부 파일과 기기 설정까지 함께 옮깁니다.</p>
              <div className="grid grid-cols-2 gap-2">
                <RecordToolIconButton icon="backup" label="전체 ZIP 백업" onClick={() => void exportPortableBackup()} />
                <RecordToolIconButton icon="restore" label="전체 ZIP 복원" onClick={() => portableBackupFileRef.current?.click()} />
              </div>
              <div className="my-2 border-t" style={{ borderColor: "#D5E4D2" }} />
              <div className="grid grid-cols-3 gap-2">
                <RecordToolIconButton icon="download" label="CSV 저장" onClick={() => exportCSV()} />
                <RecordToolIconButton icon="import" label="CSV 불러오기" onClick={() => importFileRef.current?.click()} />
                <RecordToolIconButton icon="delete" label="전체 기록 초기화" onClick={() => setShowClearConfirm(true)} />
              </div>
            </UserSettingsSection>
            <UserSettingsSection
              id="pastNotice"
              title="지난 공지 보기"
              summary="닫은 공지를 다시 확인합니다"
              open={userSettingsOpen.pastNotice}
              onToggle={() => toggleUserSettingsSection("pastNotice")}
            >
              <PastNoticePanel
                activeNotice={activeNotice}
                dismissedNotice={dismissedNotice}
                onRestore={restoreDismissedNotice}
              />
            </UserSettingsSection>
            <UserSettingsSection id="textScale" title="글자 크기" summary="눈에 편한 크기를 선택하세요" open={userSettingsOpen.textScale} onToggle={() => toggleUserSettingsSection("textScale")}>
              <p id="text-scale-setting-title" className="text-sm font-bold" style={{ color: "#3D5A3E" }}>글자 크기</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "#526057" }}>눈에 편한 크기를 선택하세요. 이 기기에서 계속 유지됩니다.</p>
              <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="글자 크기 선택">
                {TEXT_SCALE_OPTIONS.map((option) => {
                  const selected = textScale === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`글자 크기 ${option.label}`}
                      onClick={() => selectTextScale(option.value)}
                      className="min-h-12 rounded-lg px-1 text-xs font-bold transition-all active:scale-[0.97]"
                      style={{
                        background: selected ? "#3D5A3E" : "#FFFFFF",
                        color: selected ? "#FFFFFF" : "#526057",
                        border: selected ? "2px solid #3D5A3E" : "1px solid #D1C9B8",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => selectTextScale("standard")}
                disabled={textScale === "standard"}
                className="mt-3 min-h-11 w-full rounded-lg px-3 text-xs font-bold transition-all active:scale-[0.98] disabled:cursor-default disabled:opacity-45"
                style={{ background: "#FFFFFF", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
              >
                기본 크기로 되돌리기
              </button>
            </UserSettingsSection>
            <UserSettingsSection id="contrast" title="고대비 색상 모드" summary="글자와 테두리를 더 선명하게 표시합니다" open={userSettingsOpen.contrast} onToggle={() => toggleUserSettingsSection("contrast")}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p id="high-contrast-setting-title" className="text-sm font-bold" style={{ color: "#3D5A3E" }}>고대비 색상 모드</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: "#526057" }}>글자와 테두리를 더 선명하게 표시합니다.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={highContrast}
                  aria-label="고대비 색상 모드"
                  onClick={toggleHighContrast}
                  className="relative h-9 w-16 shrink-0 rounded-full border-2 transition-colors active:scale-95"
                  style={{ background: highContrast ? "#17351F" : "#FFFFFF", borderColor: highContrast ? "#17351F" : "#879088" }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 flex items-center text-[10px] font-extrabold tracking-wide ${highContrast ? "left-2 text-white" : "right-2 text-[#435149]"}`}
                  >
                    {highContrast ? "켜짐" : "꺼짐"}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`absolute left-1 top-1 size-5 rounded-full bg-white shadow-sm transition-transform ${highContrast ? "translate-x-9" : "translate-x-0"}`}
                  />
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold" style={{ color: "#435149" }}>{highContrast ? "고대비 모드 사용 중" : "일반 대비 모드 사용 중"}</p>
            </UserSettingsSection>
            <UserSettingsSection id="cardOrder" title="카드 배치" summary="메인 카드 순서를 관리합니다" open={userSettingsOpen.cardOrder} onToggle={() => toggleUserSettingsSection("cardOrder")}>
              <p className="text-sm font-bold" style={{ color: "#3D5A3E" }}>카드 배치</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "#6B7280" }}>카드의 빈 여백을 길게 누른 뒤 위·아래로 끌어 원하는 순서로 바꿀 수 있습니다.</p>
              <button
                type="button"
                onClick={() => setMainCardOrder(DEFAULT_MAIN_CARD_ORDER)}
                className="mt-3 w-full rounded-lg px-3 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                style={{ background: "#fff", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
              >
                카드 순서 기본값으로 되돌리기
              </button>
            </UserSettingsSection>
            <UserSettingsSection id="cardVisibility" title="카드 표시" summary="필요 없는 카드를 숨기거나 다시 표시합니다" open={userSettingsOpen.cardVisibility} onToggle={() => toggleUserSettingsSection("cardVisibility")}>
              <p className="text-sm font-bold" style={{ color: "#3D5A3E" }}>카드 표시</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "#6B7280" }}>필요 없는 카드는 숨기고, 언제든 여기에서 다시 표시할 수 있습니다.</p>
              <div className="mt-3 space-y-2">
                {mainCardOrder.map(cardId => (
                  <label key={cardId} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-sm font-medium" style={{ color: "#374151", border: "1px solid #E8E0D0" }}>
                    <span>{MAIN_CARD_LABELS[cardId]}</span>
                    <input
                      type="checkbox"
                      checked={mainCardVisibility[cardId]}
                      onChange={() => toggleMainCardVisibility(cardId)}
                      aria-label={`${MAIN_CARD_LABELS[cardId]} 카드 표시`}
                      className="size-4 accent-[#3D5A3E]"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMainCardVisibility(DEFAULT_MAIN_CARD_VISIBILITY)}
                className="mt-3 w-full rounded-lg px-3 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                style={{ background: "#fff", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
              >
                모든 카드 다시 표시
              </button>
              {supportEventDismissed && (
                <button
                  type="button"
                  onClick={restoreSupportEvent}
                  className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                  style={{ background: "#fff", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
                >
                  기타 안내 다시 표시
                </button>
              )}
            </UserSettingsSection>
            <input
              ref={importFileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={importCSV}
            />
            <input
              ref={portableBackupFileRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={preparePortableRestore}
            />
          </section>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4">
        <div className="flex flex-col gap-4">

        {showMainCardMoveGuide && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
            style={{ background: "#EAF5E8", color: "#3D5A3E", border: "1px solid #CFE3CC" }}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full text-sm" style={{ background: "#fff" }} aria-hidden="true">↕</span>
            <span>{mainCardMoveActive ? "원하는 위치에 놓으세요." : "빈 곳을 길게 누른 뒤 위아래로 움직여 순서를 바꿔보세요."}</span>
          </div>
        )}

        {/* ── 성장형 나무 (접이식) ───────────────────────────────────────── */}
        <SortableMainCard cardId="tree" label="나의 나무" order={mainCardOrder.indexOf("tree")} visible={mainCardVisibility.tree} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
        {(() => {
          const allHits = practiceRounds.reduce((s, r) => s + r.hits, 0);
          const allMollgi = practiceRounds.filter((r) => r.hits === 5).length;
          const treeIcon: CardIconName = allHits >= 50 ? "tree" : "sprout";
          return (
            <div
              className="rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)]"
              style={{ background: "#fff", border: "1px solid #E6DED0" }}
            >
              {/* 헤더 토글 버튼 */}
              <div className="flex h-14 items-center justify-between px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <CardIcon name={treeIcon} />
                  {treeNameEditing ? (
                    <form
                      className="flex items-center gap-1 min-w-0"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = treeNameInput.trim();
                        const next = trimmed || "나의 나무";
                        setTreeName(next);
                        localStorage.setItem(TREE_NAME_KEY, next);
                        setTreeNameEditing(false);
                      }}
                    >
                      <input
                        ref={treeNameInputRef}
                        value={treeNameInput}
                        onChange={(e) => setTreeNameInput(e.target.value)}
                        maxLength={16}
                        placeholder="나무 이름 (최대 16자)"
                        className="text-sm font-bold rounded-lg px-2 py-0.5 min-w-0 w-36 outline-none"
                        style={{
                          color: "#3D5A3E",
                          fontFamily: "'Noto Serif KR', serif",
                          background: "#F0EBE0",
                          border: "1.5px solid #3D5A3E",
                        }}
                        autoFocus
                        onBlur={() => {
                          const trimmed = treeNameInput.trim();
                          const next = trimmed || "나의 나무";
                          setTreeName(next);
                          localStorage.setItem(TREE_NAME_KEY, next);
                          setTreeNameEditing(false);
                        }}
                      />
                      <button
                        type="submit"
                        className="text-xs px-2 py-0.5 rounded-lg font-medium flex-shrink-0"
                        style={{ background: "#3D5A3E", color: "#fff" }}
                      >
                        확인
                      </button>
                    </form>
                  ) : (
                    <button
                      className="relative flex w-20 shrink-0 items-center group"
                      onClick={() => {
                        setTreeNameInput(treeName);
                        setTreeNameEditing(true);
                        setTimeout(() => treeNameInputRef.current?.select(), 50);
                      }}
                      title="나무 이름 편집"
                    >
                      <span className="min-w-0 flex-1 truncate pr-3 text-base font-bold leading-tight tracking-[-0.02em]" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>{treeName}</span>
                      <span className="pointer-events-none absolute right-0 text-xs opacity-0 transition-opacity group-hover:opacity-60" style={{ color: "#3D5A3E" }}>✏️</span>
                    </button>
                  )}
                  {!treeNameEditing && (
                    <span className="max-w-24 truncate rounded-full px-2 py-0.5 text-center text-xs font-semibold leading-4 tabular-nums" style={{ background: "#F0EBE0", color: "#6B7280" }}>
                      {allHits}중 수령
                    </span>
                  )}
                </div>
                <button
                  className="ml-2 flex-shrink-0 transition-transform active:scale-95"
                  onClick={() => setTreeOpen((v) => !v)}
                  aria-label={treeOpen ? "나의 나무 접기" : "나의 나무 펼치기"}
                >
                  <CollapseChevron open={treeOpen} />
                </button>
              </div>
              {/* 접이식 콘텐츠 */}
              <div
                style={{
                  maxHeight: treeOpen ? 600 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.35s cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              >
                <div className="px-4 pb-4">
                  <GrowingTree totalHits={allHits} mollgiCount={allMollgi} />
                </div>
              </div>
            </div>
          );
        })()}
        </SortableMainCard>

        {/* ── 당근 활터: 내 위치 + 가까운 활터 5개 (접이식) ────────────── */}
        <SortableMainCard cardId="location" label="당근 활터" order={mainCardOrder.indexOf("location")} visible={mainCardVisibility.location} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
        <div id="section-location" className="rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)]" style={{ background: "#fff", border: "1px solid #E6DED0" }}>
          <button
            className="flex h-14 w-full items-center justify-between px-4 transition-all active:scale-[0.99]"
            style={{ background: "transparent" }}
            onClick={() => setLocationOpen((v) => { const next = !v; localStorage.setItem(LOCATION_OPEN_KEY, String(next)); return next; })}
          >
            <CardHeaderContent icon="location" title="당근 활터" summary={!locationOpen ? collapsedLocationSummary : undefined} />
            <CollapseChevron open={locationOpen} />
          </button>
          <div style={{ maxHeight: locationOpen ? 1300 : 0, overflow: locationOpen && clubDropdownOpen ? "visible" : "hidden", transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)" }}>
            <div className="flex flex-col px-4 pb-4">
              {/* 내 위치 */}
              <div className="rounded-xl p-3 mb-3" style={{ background: "#F0EBE0" }}>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium" style={{ color: "#3D5A3E" }}>📱 내 위치</span>
                  {myLat && (
                    <span className="font-mono text-xs" style={{ color: "#374151" }}>
                      {myLat.toFixed(5)}, {myLng?.toFixed(5)}
                    </span>
                  )}
                </div>
                {!myLat && (
                  <div className="mt-1">
                    <p className="text-xs" style={{ color: "#59615F" }}>위치 권한을 허용하면 가까운 활터 5곳과 거리·방향을 보여드립니다.</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          toast.error("이 기기에서는 위치 정보를 사용할 수 없습니다.");
                          return;
                        }
                        localStorage.setItem(LOCATION_PERMISSION_REQUEST_KEY, "true");
                        setLocationRequested(true);
                      }}
                      disabled={locationRequested}
                      className="mt-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors active:scale-95 disabled:cursor-wait disabled:opacity-60"
                      style={{ color: "#294B31", borderColor: "#BFD6C2", background: "#FFFFFF" }}
                    >
                      {locationRequested ? "위치 확인 중" : "내 위치 확인"}
                    </button>
                  </div>
                )}
              </div>
              {/* 가까운 활터 5개 */}
              {myLat && myLng ? (
                <div className="space-y-2">
                  {[...clubs]
                    .map((c) => ({
                      ...c,
                      dist: haversineKm(myLat!, myLng!, c.latitude, c.longitude) * 1000,
                      bearing: bearingDeg(myLat!, myLng!, c.latitude, c.longitude),
                    }))
                    .sort((a, b) => a.dist - b.dist)
                    .slice(0, 5)
                    .map((c, idx) => {
                      const distLabel = c.dist < 1000 ? `${Math.round(c.dist)}m` : `${(c.dist / 1000).toFixed(1)}km`;
                      const inside = c.dist <= radius;
                      const dirLabel = bearingLabel(c.bearing);
                      return (
                        <div key={c.id} className="flex flex-col gap-0">
                        <div
                          className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left"
                          style={{
                            background: inside ? "#EAF2EA" : "#F5F0E8",
                            border: inside ? "1.5px solid #3D5A3E" : "1px solid #E8E0D0",
                          }}
                        >
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span aria-label={`가까운 활터 ${idx + 1}위`} className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums" style={{ background: inside ? "#3D5A3E" : "#E8E0D0", color: inside ? "#fff" : "#526057" }}>{idx + 1}</span>
                              <span className="text-sm font-medium truncate" style={{ color: "#374151" }}>{c.name}</span>
                              {inside && <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: "#3D5A3E", color: "#fff" }}>활터 내</span>}
                              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: nearbyClubCounts[c.id] > 0 ? "#FEF3C7" : "#F3F4F6", color: nearbyClubCounts[c.id] > 0 ? "#92400E" : "#9CA3AF" }}>
                                현재원 {nearbyClubCounts[c.id] ?? 0}명
                              </span>
                            </div>
                            {getVisibleClubComment(c.comment) && (
                               <span
                                 className="text-xs mt-0.5 ml-7"
                                 title={getVisibleClubComment(c.comment)!}
                                 style={{
                                   color: "#6B7280",
                                   display: "block",
                                   overflow: "hidden",
                                   whiteSpace: "nowrap",
                                   textOverflow: "ellipsis",
                                   maxWidth: "160px",
                                   cursor: "default",
                                 }}
                               >💬 {getVisibleClubComment(c.comment)}</span>
                             )}
                          </div>
                          {/* 거리 + 방향 */}
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            {/* 화살표 아이콘: bearing 각도로 회전 */}
                            {!inside && (
                              <svg
                                width="18" height="18" viewBox="0 0 24 24" fill="none"
                                style={{ transform: `rotate(${c.bearing}deg)`, flexShrink: 0 }}
                              >
                                <path d="M12 3L19 19L12 15L5 19L12 3Z" fill="#3D5A3E" />
                              </svg>
                            )}
                            <div className="text-right">
                              <div className="text-sm font-bold leading-tight" style={{ color: inside ? "#3D5A3E" : "#6B7280" }}>{distLabel}</div>
                              {!inside && (
                                <div className="text-xs leading-tight" style={{ color: "#9CA3AF" }}>{dirLabel}쪽</div>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* 구글 지도 버튼 */}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 mt-1 w-full rounded-xl py-1.5 text-xs font-medium transition-all active:scale-[0.97]"
                          style={{ background: "#E8F0FE", color: "#1A73E8", border: "1px solid #C5D9F8" }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#1A73E8"/>
                          </svg>
                          지도에서 보기
                        </a>
                        </div>
                      );
                    })}
                </div>
              ) : null}

              {/* 활터 검색 — 당근 활터 카드의 첫 번째 조작 */}
              <div data-club-search className="relative order-first mb-3" ref={clubSearchRef}>
                <button
                  onClick={() => {
                    setClubDropdownOpen((v) => !v);
                    setClubSearch("");
                  }}
                  data-club-search-trigger
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.99]"
                  style={{ background: "#F5F0E8", border: clubDropdownOpen ? "1.5px solid #3D5A3E" : "1px solid #E8E0D0" }}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base flex-shrink-0">🔍</span>
                      <span className="text-sm font-medium truncate" style={{ color: "#374151" }}>{selectedClub?.name ?? "활터 선택"}</span>
                      <span data-club-count className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: clubCount > 0 ? "#FEF3C7" : "#F3F4F6", color: clubCount > 0 ? "#92400E" : "#9CA3AF" }}>
                        현재원 {clubCount}명
                      </span>
                    </div>
                    <span className="text-xs mt-0.5 ml-7" style={{ color: "#9CA3AF" }}>활터 검색 · 탭하여 변경</span>
                    {getVisibleClubComment(selectedClub?.comment) && (
                      <span className="text-xs mt-0.5 ml-7" style={{ color: "#6B7280", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "180px" }}>💬 {getVisibleClubComment(selectedClub?.comment)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {myLat && myLng && selectedClub ? (() => {
                      const selectedDistance = haversineKm(myLat, myLng, selectedClub.latitude, selectedClub.longitude) * 1000;
                      const selectedBearing = bearingDeg(myLat, myLng, selectedClub.latitude, selectedClub.longitude);
                      const selectedInside = selectedDistance <= radius;
                      const selectedDistanceLabel = selectedDistance < 1000 ? `${Math.round(selectedDistance)}m` : `${(selectedDistance / 1000).toFixed(1)}km`;
                      return (
                        <>
                          {!selectedInside && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${selectedBearing}deg)`, flexShrink: 0 }}>
                              <path d="M12 3L19 19L12 15L5 19L12 3Z" fill="#3D5A3E" />
                            </svg>
                          )}
                          <div className="text-right">
                            <div className="text-sm font-bold leading-tight" style={{ color: selectedInside ? "#3D5A3E" : "#6B7280" }}>{selectedDistanceLabel}</div>
                            <div className="text-xs leading-tight" style={{ color: "#9CA3AF" }}>{selectedInside ? "활터 내" : `${bearingLabel(selectedBearing)}쪽`}</div>
                          </div>
                        </>
                      );
                    })() : null}
                    <span className="ml-1 text-xs" style={{ color: "#9CA3AF" }}>{clubDropdownOpen ? "▴" : "▾"}</span>
                  </div>
                </button>

                {clubDropdownOpen && (
                  <div
                    data-club-search-menu
                    className="absolute left-0 right-0 z-50 rounded-xl shadow-lg overflow-hidden card-enter"
                    style={{ top: "calc(100% + 4px)", background: "#fff", border: "1.5px solid #3D5A3E", maxHeight: 260 }}
                  >
                    <div className="px-3 pt-2 pb-1 sticky top-0" style={{ background: "#fff", borderBottom: "1px solid #E8E0D0" }}>
                      <div data-club-search-input-wrap className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "#F5F0E8" }}>
                        <span className="text-sm" style={{ color: "#9CA3AF" }}>🔍</span>
                        <input
                          autoFocus
                          type="text"
                          placeholder="활터 이름 검색..."
                          value={clubSearch}
                          onChange={(e) => setClubSearch(e.target.value)}
                          data-club-search-input
                          className="flex-1 bg-transparent text-sm outline-none"
                          style={{ color: "#374151" }}
                        />
                        {clubSearch && (
                          <button onClick={() => setClubSearch("")} className="text-xs" style={{ color: "#9CA3AF" }}>✕</button>
                        )}
                      </div>
                    </div>
                    <div style={{ overflowY: "auto", maxHeight: 200 }}>
                      {clubs
                        .filter((c) => c.name.toLowerCase().includes(clubSearch.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedClubId(c.id);
                              localStorage.setItem(LAST_CLUB_KEY, c.name);
                              setClubDropdownOpen(false);
                              setClubSearch("");
                            }}
                            data-club-search-option
                            data-active={c.id === selectedClubId}
                            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                            style={{
                              background: c.id === selectedClubId ? "#EAF2EA" : "transparent",
                              color: c.id === selectedClubId ? "#3D5A3E" : "#374151",
                              fontWeight: c.id === selectedClubId ? 700 : 400,
                            }}
                          >
                            {c.id === selectedClubId && <span className="mr-1">✓</span>}
                            {c.name}
                          </button>
                        ))}
                      {clubs.filter((c) => c.name.toLowerCase().includes(clubSearch.toLowerCase())).length === 0 && (
                        <p className="text-center py-4 text-sm" style={{ color: "#9CA3AF" }}>&quot;{clubSearch}&quot;에 해당하는 활터가 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}
                {selectedClub && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedClub.latitude},${selectedClub.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-club-map-link
                    className="flex items-center justify-center gap-1 mt-1 w-full rounded-xl py-1.5 text-xs font-medium transition-all active:scale-[0.97]"
                    style={{ background: "#E8F0FE", color: "#1A73E8", border: "1px solid #C5D9F8" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#1A73E8"/>
                    </svg>
                    {selectedClub.name} 지도에서 보기
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        </SortableMainCard>

        {/* ── 왔소 현황: 활터 선택 + 현황판 (접이식) ───────────────────── */}
        <SortableMainCard cardId="status" label="왔소 현황" order={mainCardOrder.indexOf("status")} visible={mainCardVisibility.status} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
        <div id="section-status" className="rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)]" style={{ background: "#fff", border: "1px solid #E6DED0" }}>
          <button
            type="button"
            className="flex h-14 w-full items-center justify-between px-4 transition-all active:scale-[0.99]"
            style={{ background: "transparent" }}
            onClick={() => setStatusOpen((v) => { const next = !v; localStorage.setItem(STATUS_OPEN_KEY, String(next)); return next; })}
          >
            <CardHeaderContent icon="status" title="왔소 현황" summary={statsUpdatedAt ? `갱신 ${formatTime(statsUpdatedAt)}` : "갱신 중"} />
            <CollapseChevron open={statusOpen} />
          </button>
          <div style={{ maxHeight: statusOpen ? 2000 : 0, overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)" }}>
            <div className="px-4 pb-4">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  aria-label="왔소 현황 새로고침"
                  title="왔소 현황 새로고침"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => handleRetryStats()}
                  disabled={statsLoading || statsRefreshing || statsRetrying}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95 disabled:cursor-wait disabled:opacity-50"
                  style={{ borderColor: "#D8E3D5", color: "#3D5A3E", background: "#F8FBF7" }}
                >
                  <RefreshCw size={14} className={statsRefreshing || statsRetrying ? "animate-spin" : ""} aria-hidden="true" />
                  새로고침
                </button>
              </div>
              {/* 왔소앱 전체 현황 */}
              <div className="grid grid-cols-2 items-stretch gap-2 mb-3">
                <StatBox label="실시간 접속자" value={onlineCount} unit="명" color="#3D5A3E" loading={statsLoading} refreshing={statsRefreshing} />
                <StatBox label="전체 누적" value={totalCount} unit="명" color="#6B7280" loading={statsLoading} refreshing={statsRefreshing} />
              </div>
              {/* 전체 활터 현재원 및 소속정 현황 */}
              <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: "#F5F0E8", border: "1px solid #E8E0D0" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "#3D5A3E" }}>
                    <Users size={15} strokeWidth={2.2} aria-hidden="true" />
                    <span>전체 활터 현재원</span>
                  </span>
                  <span className="text-lg font-bold" style={{ color: "#8B2635" }}>
                    {activeClubStatuses.reduce((sum, club) => sum + club.count, 0)}명
                  </span>
                </div>
                {activeClubStatuses.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {activeClubStatuses.map((club) => (
                      <button
                        type="button"
                        key={club.id}
                        onClick={() => selectActiveClub(club.id)}
                        className="text-xs px-2 py-1 rounded-full transition-all active:scale-[0.97]"
                        style={{ background: "#fff", color: "#374151", border: "1px solid #D1C9B8" }}
                        title={`${club.name} 활터 조회`}
                        aria-label={`${club.name} 활터 조회`}
                      >
                        {club.name} <b style={{ color: "#8B2635" }}>{club.count}명</b>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>현재원이 있는 소속정이 없습니다.</p>
                )}
                <p className="mt-2 text-center text-xs" style={{ color: "#9CA3AF" }}>현재원: 반경 {radius}m 이내 · 최근 1시간 기준</p>
              </div>
              {/* 현황판 에러 및 재시도 */}
              {statsError && (
                <div
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3 text-sm card-enter"
                  style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
                  role="alert"
                >
                  <span className="mt-0.5 shrink-0" style={{ color: "#DC2626" }}>⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium" style={{ color: "#991B1B" }}>네트워크 오류</p>
                    <p className="text-xs mt-0.5 break-words" style={{ color: "#B91C1C" }}>{statsError}</p>
                  </div>
                  <button
                    onClick={handleRetryStats}
                    disabled={statsRetrying}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95"
                    style={{
                      background: statsRetrying ? "#FCA5A5" : "#DC2626",
                      color: "#fff",
                      opacity: statsRetrying ? 0.7 : 1,
                      cursor: statsRetrying ? "not-allowed" : "pointer",
                    }}
                  >
                    {statsRetrying ? (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full stat-refreshing" />
                        재시도 중
                      </span>
                    ) : "재시도"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </SortableMainCard>

        {/* ── 습사 기록 ─────────────────────────────────────────────────── */}
        <SortableMainCard cardId="record" label="습사 기록" order={mainCardOrder.indexOf("record")} visible={mainCardVisibility.record} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
        <SectionCard
          title="습사 기록"
          icon="record"
          collapsible
          open={recordOpen}
          summary={latestRecordSummary}
          onToggle={() => setRecordOpen((v) => { const next = !v; localStorage.setItem(RECORD_OPEN_KEY, String(next)); return next; })}
        >
          {/* 전문가 모드 토글 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: "#374151" }}>입력 방식</span>
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1.5px solid #D1C9B8" }}>
              <button
                onClick={() => { setExpertMode(false); localStorage.setItem(EXPERT_MODE_KEY, "false"); }}
                className="px-3 py-1.5 text-xs font-medium transition-all"
                style={{ background: !expertMode ? "#3D5A3E" : "#FDFAF5", color: !expertMode ? "#fff" : "#6B7280" }}
              >일반</button>
              <button
                onClick={() => { setExpertMode(true); localStorage.setItem(EXPERT_MODE_KEY, "true"); }}
                className="px-3 py-1.5 text-xs font-medium transition-all"
                style={{ background: expertMode ? "#3D5A3E" : "#FDFAF5", color: expertMode ? "#fff" : "#6B7280" }}
              >전문가</button>
            </div>
          </div>

          {!expertMode ? (
            /* ── 일반 모드 ── */
            <div className="grid grid-cols-5 gap-2 mb-4">
              {shots.map((s, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-xs font-medium" style={{ color: "#6B7280" }}>{i + 1}시</span>
                  <button
                    onClick={() => {
                      const next = [...shots];
                      next[i] = s === null ? true : s === true ? false : null;
                      setShots(next);
                    }}
                    className="w-14 h-14 rounded-2xl text-xl font-bold transition-all duration-150 active:scale-95"
                    style={{
                      background: s === true ? "#3D5A3E" : s === false ? "#8B2635" : "#E8E0D0",
                      color: s === null ? "#9CA3AF" : "#fff",
                      boxShadow: s !== null ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                    }}
                  >
                    {s === true ? "O" : s === false ? "X" : "·"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            /* ── 전문가 모드: 5×5 과녁 그리드 ── */
            <div className="mb-4">
              {/* 화살 번호 선택 — N시 형식 */}
              <div className="mb-3 w-full">
                <div className="grid w-full grid-cols-6 gap-1.5">
                  {[1,2,3,4,5].map((n) => {
                    const placed = (() => { for (let r=0;r<5;r++) for (let c=0;c<5;c++) if (grid[r][c].includes(n)) return true; return false; })();
                    return (
                      <button
                        key={n}
                        onClick={() => setNextArrow(n)}
                        className="h-8 min-w-0 w-full rounded-lg px-1 text-xs font-bold transition-all active:scale-95"
                        style={{
                          background: nextArrow === n ? "#3D5A3E" : placed ? "#D1FAE5" : "#E8E0D0",
                          color: nextArrow === n ? "#fff" : placed ? "#065F46" : "#9CA3AF",
                          border: placed && nextArrow !== n ? "1.5px solid #6EE7B7" : "none",
                          textDecoration: placed ? "line-through" : "none",
                          minWidth: 36,
                        }}
                        >{n}시</button>
                    );
                  })}
                  <button
                    onClick={() => { setGrid(Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []))); setNextArrow(1); }}
                    className="h-8 min-w-0 w-full rounded-lg px-1 text-xs font-bold transition-all active:scale-95"
                    style={{ background: "#FEE2E2", color: "#991B1B" }}
                  >초기화</button>
                </div>
              </div>
              {/* 과녁 그리드 — 3:4 비율 */}
              <div className="relative mx-auto" style={{ width: "min(100%, 260px)" }}>
                {/* 배경 레이어: 외곽(실중) vs 중앙(관중) */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: "#F3F4F6", border: "2px solid #D1C9B8", padding: 4, aspectRatio: "3 / 4" }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(5, 1fr)", gap: 3, height: "100%" }}>
                    {Array.from({ length: 5 }, (_, row) =>
                      Array.from({ length: 5 }, (_, col) => {
                        const isCenter = row >= 1 && row <= 3 && col >= 1 && col <= 3;
                        const cellArrows = grid[row][col]; // number[]
                        const hasArrow = cellArrows.length > 0;
                        const ARROW_COLORS = ["#EF4444","#3B82F6","#10B981","#F59E0B","#8B5CF6"];
                        // 다중 화살일 때 색상: 첫 번째 화살 기준
                        const cellBg = hasArrow ? ARROW_COLORS[cellArrows[0]-1] : isCenter ? "#D1FAE5" : "#FEE2E2";
                        return (
                          <button
                            key={`${row}-${col}`}
                            onClick={() => {
                              // 새 그리드: 각 칸을 배열의 배열로 복사
                              const newGrid = grid.map((r) => r.map((cell) => [...cell]));
                              const cellArrows = newGrid[row][col];
                              if (cellArrows.includes(nextArrow)) {
                                // 이미 이 칸에 현재 화살 있음 → 제거
                                newGrid[row][col] = cellArrows.filter((n) => n !== nextArrow);
                              } else {
                                // 다른 칸에 있던 현재 화살 위치 제거 후 이 칸에 추가
                                for (let r=0;r<5;r++) for (let c=0;c<5;c++) {
                                  newGrid[r][c] = newGrid[r][c].filter((n) => n !== nextArrow);
                                }
                                newGrid[row][col] = [...newGrid[row][col], nextArrow].sort((a,b)=>a-b);
                                // 다음 미배치 화살로 자동 이동
                                const next = [1,2,3,4,5].find((n) => { for (let r=0;r<5;r++) for (let c=0;c<5;c++) if (newGrid[r][c].includes(n)) return false; return true; });
                                if (next) setNextArrow(next);
                              }
                              setLastHitCell(`${row}-${col}`);
                              setGrid(newGrid);
                            }}
                            className="flex items-center justify-center rounded-lg font-bold transition-colors active:scale-90"
                            style={{
                              position: "relative",
                              width: "100%",
                              height: "100%",
                              background: cellBg,
                              color: hasArrow ? "#fff" : isCenter ? "#065F46" : "#991B1B",
                              border: isCenter ? "1.5px solid #6EE7B7" : "1.5px solid #FECACA",
                              fontSize: "clamp(0.6rem, 2.5vw, 0.85rem)",
                              flexDirection: "column",
                              lineHeight: 1.1,
                              padding: 1,
                              overflow: "hidden",
                            }}
                          >
                            {/* 리플 효과: 마지막 터치 셀에만 표시 */}
                            {lastHitCell === `${row}-${col}` && hasArrow && (
                              <span
                                key={lastHitCell + cellArrows.join(",")}
                                className="arrow-ripple"
                                style={{ background: isCenter ? "rgba(52,211,153,0.45)" : "rgba(248,113,113,0.45)" }}
                                onAnimationEnd={() => setLastHitCell(null)}
                              />
                            )}
                            {hasArrow
                              ? (
                                <span
                                  key={cellArrows.join(",")}
                                  className="arrow-cell-enter flex flex-col items-center"
                                  style={{ display:"flex", flexDirection:"column", alignItems:"center" }}
                                >
                                  {cellArrows.map((n) => (
                                    <span key={n} style={{ display:"block", fontSize:"clamp(0.55rem,2.2vw,0.8rem)", lineHeight:1.15 }}>
                                      🏹{n}시
                                    </span>
                                  ))}
                                </span>
                              )
                              : isCenter ? "●" : "○"
                            }
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                {/* 범례 */}
                <div className="flex gap-3 mt-2 justify-center">
                  <span className="flex items-center gap-1 text-xs" style={{ color: "#065F46" }}>
                    <span style={{ width:12, height:12, borderRadius:3, background:"#D1FAE5", border:"1.5px solid #6EE7B7", display:"inline-block" }} />
                    관중
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: "#991B1B" }}>
                    <span style={{ width:12, height:12, borderRadius:3, background:"#FEE2E2", border:"1.5px solid #FECACA", display:"inline-block" }} />
                    불중
                  </span>
                </div>
              </div>
            </div>
          )}

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모를 입력하세요 (예: 바람, 자세 등) · 시수 없이 메모만 저장할 수 있어요"
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none outline-none mb-3"
            style={{ borderColor: "#D1C9B8", background: "#FDFAF5", minHeight: 64 }}
            rows={2}
          />
          <input
            ref={recordMediaInputRef}
            type="file"
            accept={RECORD_MEDIA_ACCEPT}
            multiple
            className="hidden"
            onChange={addRecordMedia}
          />
          <div className="mb-3 rounded-xl border p-3" style={{ background: "#F5F0E8", borderColor: "#E6DED0" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#3D5A3E" }}>
                  <Paperclip size={16} strokeWidth={2.2} aria-hidden="true" />
                  사진·동영상·음성 첨부
                </p>
                <p className="mt-0.5 text-xs leading-5" style={{ color: "#6B7280" }}>이 기기에만 저장됩니다 · 최대 {MAX_RECORD_MEDIA_ITEMS}개, 파일당 10MB</p>
              </div>
              <button
                type="button"
                onClick={() => recordMediaInputRef.current?.click()}
                disabled={draftMedia.length >= MAX_RECORD_MEDIA_ITEMS}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold transition-all active:scale-95 disabled:cursor-default disabled:opacity-45"
                style={{ background: "#FFFFFF", color: "#3D5A3E", border: "1px solid #C8D8C8" }}
                aria-label="사진, 동영상 또는 음성 첨부"
              >
                <ImagePlus size={15} strokeWidth={2.2} aria-hidden="true" />
                첨부
              </button>
            </div>
            {draftMedia.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {draftMedia.map((attachment) => {
                  const kind = getRecordMediaKind(attachment.file.type);
                  return (
                    <div key={attachment.id} className="flex items-center gap-2 rounded-lg bg-white p-2" style={{ border: "1px solid #E6DED0" }}>
                      <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md" style={{ background: "#EEF4EC", color: "#3D5A3E" }}>
                        {kind === "image" ? (
                          <img src={attachment.previewUrl} alt="첨부할 사진 미리보기" className="h-full w-full object-cover" />
                        ) : kind === "video" ? (
                          <Video size={20} strokeWidth={2} aria-label="첨부할 동영상" />
                        ) : (
                          <Music size={20} strokeWidth={2} aria-label="첨부할 음성" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold" style={{ color: "#374151" }}>{attachment.file.name}</p>
                        <p className="mt-0.5 text-[11px]" style={{ color: "#6B7280" }}>{getRecordMediaSummary(kind)} · {formatRecordMediaSize(attachment.file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraftMedia(attachment.id)}
                        className="grid size-7 shrink-0 place-items-center rounded-md transition-all active:scale-95"
                        style={{ background: "#FEE2E2", color: "#B91C1C" }}
                        aria-label={`${attachment.file.name} 첨부 제거`}
                        title="첨부 제거"
                      >
                        <X size={15} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium" style={{ color: "#6B7280" }}>
              현재: <strong style={{ color: "#3D5A3E" }}>
                {expertMode
                  ? (() => { const placed = new Set<number>(); for(let r=1;r<=3;r++) for(let c=1;c<=3;c++) grid[r][c].forEach(n=>placed.add(n)); return placed.size; })()
                  : shots.filter(Boolean).length
                }중
              </strong> / 5시
            </span>
          </div>
          <button
            onClick={saveRecord}
            className="w-full py-4 rounded-2xl text-lg font-bold text-white transition-all duration-150 active:scale-98"
            style={{ background: "#3D5A3E", boxShadow: "0 4px 12px rgba(61,90,62,0.3)" }}
          >
            기록 저장
          </button>
        </SectionCard>
        </SortableMainCard>

        {/* ── 시수 통계 ─────────────────────────────────────────────────── */}
        <SortableMainCard cardId="stats" label="시수 통계" order={mainCardOrder.indexOf("stats")} visible={mainCardVisibility.stats} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
        <div className="rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)]" style={{ background: "#fff", border: "1px solid #E6DED0" }}>
          <button
            className="flex h-14 w-full items-center justify-between px-4 transition-all active:scale-[0.99]"
            style={{ background: "transparent" }}
            onClick={() => setStatOpen((v) => { const next = !v; localStorage.setItem(STAT_OPEN_KEY, String(next)); return next; })}
          >
            <CardHeaderContent icon="statistics" title="시수 통계" summary={!statOpen ? `방문 ${visitedClubSummary}곳` : undefined} />
            <CollapseChevron open={statOpen} />
          </button>
          <div style={{ maxHeight: statOpen ? 2000 : 0, overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)" }}>
          <div className="px-4 pb-4">
          <div className="flex gap-1 mb-4 p-1 rounded-xl flex-wrap" style={{ background: "#E8E0D0" }}>
            {(["일별", "주별", "월별", "전체", "활터별", "히트맵"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatTab(tab)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                style={{
                  background: statTab === tab ? "#3D5A3E" : "transparent",
                  color: statTab === tab ? "#fff" : "#6B7280",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 전체 탭 */}
          {statTab === "전체" ? (
            practiceRounds.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: "#F5F0E8" }}>
                <p className="text-2xl mb-2">🏹</p>
                <p className="text-sm" style={{ color: "#9CA3AF" }}>저장된 습사 기록이 없습니다.</p>
                {memoRecordCount > 0 && <p className="mt-1 text-xs" style={{ color: "#C4B9A8" }}>메모 기록 {memoRecordCount}건은 시수 통계에 포함되지 않습니다.</p>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="전체 순수" value={`${stats.totalRounds}순`} />
                  <StatCard label="합산 시수" value={`${stats.totalHits}중`} />
                  <StatCard label="평균 시수" value={`${stats.avgHits}중`} />
                  <StatCard label="5중 (몰기)" value={`${stats.mollgi}회`} highlight={stats.mollgi > 0} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="col-span-2 rounded-xl p-3 text-center" style={{ background: "#F5F0E8" }}>
                    <p className="text-xs mb-1" style={{ color: "#9CA3AF" }}>전체 적중률</p>
                    <p className="text-2xl font-bold" style={{ color: "#3D5A3E" }}>
                      {stats.totalShots > 0 ? Math.round((stats.totalHits / stats.totalShots) * 100) : 0}%
                    </p>
                  </div>
                </div>
                {/* 시수별 분포 */}
                <div className="mt-3 rounded-xl p-3" style={{ background: "#F5F0E8" }}>
                    <p className="text-xs font-medium mb-2" style={{ color: "#6B7280" }}>시수별 분포</p>
                    <div className="space-y-1.5">
                      {[5,4,3,2,1,0].map((n) => {
                      const cnt = practiceRounds.filter((r) => r.hits === n).length;
                      const pct = practiceRounds.length > 0 ? Math.round((cnt / practiceRounds.length) * 100) : 0;
                      return (
                        <div key={n} className="flex items-center gap-2">
                          <span className="text-xs w-6 text-right font-medium" style={{ color: "#374151" }}>{n}중</span>
                          <div className="flex-1 rounded-full overflow-hidden" style={{ background: "#E8E0D0", height: 10 }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: n === 5 ? "#3D5A3E" : n >= 3 ? "#6B9E6C" : "#C4B9A8" }}
                            />
                          </div>
                          <span className="text-xs w-8" style={{ color: "#9CA3AF" }}>{cnt}회</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )
          ) : statTab === "활터별" ? (
            clubStats.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: "#F5F0E8" }}>
                <p className="text-2xl mb-2">🏹</p>
                <p className="text-sm" style={{ color: "#9CA3AF" }}>활터 반경 300m 이내에서 저장한 기록이 없습니다.</p>
                <p className="text-xs mt-1" style={{ color: "#C4B9A8" }}>활터에서 '이번 순 저장'을 누르면 자동으로 집계됩니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clubStats.map((c, idx) => (
                  <div key={c.name} className="rounded-xl p-3" style={{ background: "#F5F0E8", border: idx === 0 ? "2px solid #3D5A3E" : "1px solid #E8E0D0" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sm truncate" style={{ color: "#3D5A3E" }}>📍 {c.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0" style={{ background: "#E8E0D0", color: "#6B7280" }}>{c.visitDays}일 방문</span>
                      </div>
                      {idx === 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: "#3D5A3E", color: "#fff" }}>주 활터</span>}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>순수</p>
                        <p className="text-base font-bold" style={{ color: "#374151" }}>{c.rounds}순</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>평균</p>
                        <p className="text-base font-bold" style={{ color: "#374151" }}>{c.avgHits}중</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>적중률</p>
                        <p className="text-base font-bold" style={{ color: c.rate >= 80 ? "#3D5A3E" : c.rate >= 60 ? "#B45309" : "#8B2635" }}>{c.rate}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>몰기</p>
                        <p className="text-base font-bold" style={{ color: c.mollgi > 0 ? "#3D5A3E" : "#9CA3AF" }}>{c.mollgi}회</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : statTab === "히트맵" ? (
            (() => {
              // 전문가 모드 positions 데이터가 있는 기록만 필터
              const expertRecords = practiceRounds.filter(r => r.positions && r.positions.length === 5);
              if (expertRecords.length === 0) {
                return (
                  <div className="rounded-xl p-6 text-center" style={{ background: "#F5F0E8" }}>
                    <p className="text-2xl mb-2">🏹</p>
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>전문가 모드로 저장한 기록이 없습니다.</p>
                    <p className="text-xs mt-1" style={{ color: "#C4B9A8" }}>습사 기록 탭에서 전문가 모드로 기록하면 여기에 히트맵이 생성됩니다.</p>
                  </div>
                );
              }
              // 5×5 집계 배열
              const heatmap: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
              let totalArrows = 0;
              expertRecords.forEach(r => {
                (r.positions as number[][][]).forEach((rowArr, ri) => {
                  rowArr.forEach((cellArr, ci) => {
                    heatmap[ri][ci] += cellArr.length;
                    totalArrows += cellArr.length;
                  });
                });
              });
              const maxVal = Math.max(...heatmap.flat(), 1);
              // 관중(중앙 3×3) 화살 합계
              let hitCount = 0;
              for (let r=1;r<=3;r++) for (let c=1;c<=3;c++) hitCount += heatmap[r][c];
              const hitRate = totalArrows > 0 ? Math.round((hitCount / totalArrows) * 100) : 0;
              return (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium" style={{ color: "#6B7280" }}>전문가 기록 {expertRecords.length}순 · 전체 {totalArrows}시</span>
                    <span className="text-sm font-bold px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>관중률 {hitRate}%</span>
                  </div>
                  {/* 히트맵 그리드 */}
                  <div className="relative mx-auto" style={{ width: "min(100%, 260px)" }}>
                    <div className="rounded-xl overflow-hidden" style={{ background: "#F3F4F6", border: "2px solid #D1C9B8", padding: 4, aspectRatio: "3 / 4" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(5, 1fr)", gap: 3, height: "100%" }}>
                        {Array.from({ length: 5 }, (_, row) =>
                          Array.from({ length: 5 }, (_, col) => {
                            const isCenter = row >= 1 && row <= 3 && col >= 1 && col <= 3;
                            const val = heatmap[row][col];
                            const intensity = val / maxVal; // 0~1
                            // 관중: 초록 계열, 불중: 빨강 계열
                            const bg = val === 0
                              ? (isCenter ? "#D1FAE5" : "#FEE2E2")
                              : isCenter
                                ? `rgba(16,185,129,${0.15 + intensity * 0.85})`
                                : `rgba(239,68,68,${0.15 + intensity * 0.85})`;
                            const textColor = intensity > 0.5 ? "#fff" : (isCenter ? "#065F46" : "#991B1B");
                            return (
                              <div
                                key={`${row}-${col}`}
                                className="flex items-center justify-center rounded-lg"
                                style={{
                                  background: bg,
                                  border: isCenter ? "1.5px solid #6EE7B7" : "1.5px solid #FECACA",
                                  color: textColor,
                                  fontSize: "clamp(0.6rem, 2.5vw, 0.8rem)",
                                  fontWeight: val > 0 ? 700 : 400,
                                  width: "100%",
                                  height: "100%",
                                  transition: "background 0.3s",
                                }}
                              >
                                {val > 0 ? val : ""}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {/* 범례 */}
                    <div className="flex gap-4 mt-2 justify-center">
                      <span className="flex items-center gap-1 text-xs" style={{ color: "#065F46" }}>
                        <span style={{ width:12, height:12, borderRadius:3, background:"rgba(16,185,129,0.8)", display:"inline-block" }} />
                        관중 (중앙 3×3)
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: "#991B1B" }}>
                        <span style={{ width:12, height:12, borderRadius:3, background:"rgba(239,68,68,0.8)", display:"inline-block" }} />
                        불중 (외곽)
                      </span>
                    </div>
                    <p className="text-xs text-center mt-1" style={{ color: "#9CA3AF" }}>숫자는 해당 구역에 꼽힌 화살 수 · 진할수록 많이 꼽힌 구역</p>
                  </div>
                  {/* 편향 분석 */}
                  {(() => {
                    // 좌우 편향
                    let leftSum = 0, rightSum = 0, topSum = 0, bottomSum = 0;
                    for (let r=0;r<5;r++) { leftSum += heatmap[r][0] + heatmap[r][1]; rightSum += heatmap[r][3] + heatmap[r][4]; }
                    for (let c=0;c<5;c++) { topSum += heatmap[0][c] + heatmap[1][c]; bottomSum += heatmap[3][c] + heatmap[4][c]; }
                    const biasH = leftSum > rightSum + 2 ? "좌편 경향" : rightSum > leftSum + 2 ? "우편 경향" : null;
                    const biasV = topSum > bottomSum + 2 ? "오뉘(상편) 경향" : bottomSum > topSum + 2 ? "촉(하편) 경향" : null;
                    const biases = [biasH, biasV].filter(Boolean);
                    if (biases.length === 0) return null;
                    return (
                      <div className="mt-3 rounded-xl p-3" style={{ background: "#FFF8E1", border: "1px solid #F59E0B" }}>
                        <p className="text-xs font-bold mb-1" style={{ color: "#92400E" }}>편향 분석</p>
                        {biases.map(b => (
                          <p key={b} className="text-xs" style={{ color: "#B45309" }}>⚠️ {b}이 감지되었습니다. 자세 교정을 권장합니다.</p>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })()
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="총 순수" value={`${stats.totalRounds}순`} />
                <StatCard label="합산 시수" value={`${stats.totalHits}중`} />
                <StatCard label="평균 시수" value={`${stats.avgHits}중`} />
                <StatCard label="5중 (몰기)" value={`${stats.mollgi}회`} highlight={stats.mollgi > 0} />
              </div>
              {stats.totalRounds > 0 && (
                <div className="mt-3 rounded-xl p-3 text-center" style={{ background: "#F0EBE0" }}>
                  <span className="text-sm" style={{ color: "#6B7280" }}>적중률 </span>
                  <span className="text-2xl font-bold" style={{ color: "#3D5A3E" }}>
                    {Math.round((stats.totalHits / stats.totalShots) * 100)}%
                  </span>
                </div>
              )}
            </>
          )}
          </div>
          </div>
        </div>
        </SortableMainCard>

        {/* ── 습사 일지 ─────────────────────────────────────────────────── */}
        <SortableMainCard cardId="journal" label="습사 일지" order={mainCardOrder.indexOf("journal")} visible={mainCardVisibility.journal} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
        {/* ── 전체 ZIP 백업 알림 배너 ───────────────────────────────────── */}
        {showBackupBanner && records.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3 flex items-start gap-3 card-enter"
            style={{ background: "#FFF8E1", border: "1.5px solid #F59E0B" }}
          >
            <CardIcon name="backup" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "#92400E" }}>기기 이전용 전체 ZIP 백업을 권장합니다</p>
              <p className="text-xs mt-0.5" style={{ color: "#B45309" }}>기록·메모·첨부 파일·표시 설정을 하나의 ZIP에 담아 새 기기에서 복원할 수 있습니다.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => void exportPortableBackup()}
                  disabled={portableBackupLoading}
                  className="flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: "#F59E0B", color: "#fff" }}
                >
                  <HardDriveDownload size={14} strokeWidth={2} aria-hidden="true" /> {portableBackupLoading ? "ZIP 만드는 중..." : "전체 ZIP 백업"}
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
                    setShowBackupBanner(false);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                  style={{ background: "#FDE68A", color: "#92400E" }}
                >
                  7일 후 다시 알림
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)]" style={{ background: "#fff", border: "1px solid #E6DED0" }}>
          <button
            className="flex h-14 w-full items-center justify-between px-4 transition-all active:scale-[0.99]"
            style={{ background: "transparent" }}
            onClick={() => setJournalOpen((v) => { const next = !v; localStorage.setItem(JOURNAL_OPEN_KEY, String(next)); return next; })}
          >
            <CardHeaderContent icon="journal" title="습사 일지" summary={!journalOpen ? (practiceRounds.length > 0 ? `${practiceRounds.length}순` : memoRecordCount > 0 ? `메모 ${memoRecordCount}건` : "0순") : undefined} />
            <CollapseChevron open={journalOpen} />
          </button>
          <div
            className="touch-pan-y overscroll-contain"
            style={{
              maxHeight: journalOpen ? "min(74dvh, 880px)" : 0,
              overflowY: journalOpen ? "auto" : "hidden",
              overflowX: "hidden",
              transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)",
              WebkitOverflowScrolling: "touch",
            }}
          >
          <div className="px-4 pb-4">
          <div className="mb-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-xs font-semibold" style={{ color: "#526057" }}>보기</span>
                <div data-testid="journal-tabs" data-journal-tabs className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #D1C9B8" }}>
                {([
                  { value: "전체", label: "전체" },
                  { value: "날짜별", label: "날짜" },
                  { value: "몰기", label: "몰기" },
                  { value: "활터별", label: "활터" },
                ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setJournalView(value);
                        if (value === "날짜별") setSelectedJournalDate(null);
                        if (value === "활터별") setSelectedJournalClub(null);
                      }}
                      aria-selected={journalView === value}
                      data-journal-tab
                      data-active={journalView === value}
                      className="px-2 py-1 text-xs font-medium transition-all"
                      style={{
                        background: journalView === value ? "#3D5A3E" : "#FDFAF5",
                        color: journalView === value ? "#fff" : "#6B7280",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: "#6B7280" }} aria-hidden="true" />
            <input
              type="search"
              aria-label="습사 일지 검색"
              placeholder="메모 · 활터 · 날짜 검색"
              value={journalSearch}
              onChange={(event) => setJournalSearch(event.target.value)}
              data-journal-input
              className="h-10 w-full rounded-xl border bg-white py-2 pl-9 pr-10 text-sm outline-none transition-colors focus:border-[#3D5A3E] focus:ring-2 focus:ring-[#3D5A3E]/20"
              style={{ borderColor: "#D1C9B8", color: "#374151" }}
            />
            {journalSearch && (
              <button
                type="button"
                aria-label="일지 검색어 지우기"
                onClick={() => setJournalSearch("")}
                className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-base font-bold transition-colors active:scale-95"
                style={{ color: "#526057" }}
              >
                ×
              </button>
            )}
          </div>

          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2" data-testid="journal-period-filter">
            <label className="min-w-0">
              <span className="mb-1 block text-xs font-semibold" style={{ color: "#526057" }}>시작일</span>
              <input
                type="date"
                aria-label="습사 일지 시작일"
                value={journalStartDate}
                max={journalEndDate || undefined}
                onChange={(event) => updateJournalStartDate(event.target.value)}
                data-journal-input
                className="h-10 w-full rounded-xl border bg-white px-2 text-xs outline-none transition-colors focus:border-[#3D5A3E] focus:ring-2 focus:ring-[#3D5A3E]/20"
                style={{ borderColor: "#D1C9B8", color: "#374151" }}
              />
            </label>
            <span className="pb-2 text-sm font-bold" style={{ color: "#6B7280" }} aria-hidden="true">~</span>
            <label className="min-w-0">
              <span className="mb-1 block text-xs font-semibold" style={{ color: "#526057" }}>종료일</span>
              <input
                type="date"
                aria-label="습사 일지 종료일"
                value={journalEndDate}
                min={journalStartDate || undefined}
                onChange={(event) => updateJournalEndDate(event.target.value)}
                data-journal-input
                className="h-10 w-full rounded-xl border bg-white px-2 text-xs outline-none transition-colors focus:border-[#3D5A3E] focus:ring-2 focus:ring-[#3D5A3E]/20"
                style={{ borderColor: "#D1C9B8", color: "#374151" }}
              />
            </label>
          </div>

          {(journalSearch || journalStartDate || journalEndDate) && (
            <button
              type="button"
              onClick={clearJournalFilters}
              className="mb-3 w-full rounded-lg py-2 text-xs font-bold transition-colors active:scale-[0.98]"
              style={{ background: "#F5F0E8", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
            >
              검색·기간 조건 지우기
            </button>
          )}

          {journalRecords.length === 0 ? (
            <div className="text-center py-8" style={{ color: "#9CA3AF" }}>
              <div className="mb-2 flex justify-center"><CardIcon name="record" /></div>
              <p className="text-sm">{records.length === 0 ? "아직 기록이 없습니다" : "선택한 검색·기간 조건의 기록이 없습니다"}</p>
            </div>
          ) : journalView === "몰기" ? (
            (() => {
              const mollgiRecords = journalPracticeRounds.filter((r) => r.hits === 5 && isValidDate(r.date));
              if (mollgiRecords.length === 0) {
                return (
                  <div className="text-center py-8" style={{ color: "#9CA3AF" }}>
                    <div className="mb-2 flex justify-center"><CardIcon name="record" /></div>
                    <p className="text-sm">아직 몰기(5중) 기록이 없습니다</p>
                    <p className="text-xs mt-1" style={{ color: "#C4B9A8" }}>5발 모두 관중하면 여기에 기록됩니다.</p>
                  </div>
                );
              }
              return (
                <div>
                  {/* 몰기 요약 */}
                  <div className="rounded-xl p-3 mb-3 text-center" style={{ background: "#E8F5E8", border: "1px solid #C8E6C8" }}>
                    <span className="text-sm" style={{ color: "#3D5A3E" }}>전체 몰기 </span>
                    <span className="text-2xl font-bold" style={{ color: "#3D5A3E" }}>{mollgiRecords.length}회</span>
                    <span className="text-sm ml-2" style={{ color: "#6B7280" }}>/ {journalPracticeRounds.length}순</span>
                    <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                      몰기율 {journalPracticeRounds.length > 0 ? Math.round((mollgiRecords.length / journalPracticeRounds.length) * 100) : 0}%
                    </p>
                  </div>
                  {/* 몰기 기록 목록 */}
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E8E0D0" }}>
                    <div className="divide-y" style={{ borderColor: "#E8E0D0" }}>
                      {mollgiRecords.map((r) => (
                        <RecordRow key={r.id} record={r} onDelete={requestDeleteRecord} onUpdateMemo={updateMemo} onAddMedia={addMediaToRecord} onDeleteMedia={deleteMediaFromRecord} showDate />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : journalView === "활터별" ? (
            selectedJournalClubGroup ? (
              <div data-testid="journal-club-detail" className="space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedJournalClub(null)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors active:scale-95"
                  style={{ background: "#F5F0E8", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
                >
                  <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" /> 활터 목록으로
                </button>
                <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #D1C9B8" }}>
                  <div data-journal-detail-header className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: "#3D5A3E" }}>
                    <span className="min-w-0 truncate text-sm font-bold text-white">{selectedJournalClubGroup.clubName}</span>
                    <span className="shrink-0 text-xs text-white opacity-90">{selectedJournalClubGroup.totalRounds > 0 ? `${selectedJournalClubGroup.totalRounds}순 · ${selectedJournalClubGroup.totalHits}중 · ${selectedJournalClubGroup.rate}%${selectedJournalClubGroup.memoEntries > 0 ? ` · 메모 ${selectedJournalClubGroup.memoEntries}건` : ""}` : `메모 ${selectedJournalClubGroup.memoEntries}건`}</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "#E8E0D0" }}>
                    {selectedJournalClubGroup.records.map((record) => (
                      <RecordRow key={record.id} record={record} onDelete={requestDeleteRecord} onUpdateMemo={updateMemo} onAddMedia={addMediaToRecord} onDeleteMedia={deleteMediaFromRecord} showDate />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div data-testid="journal-club-list" className="space-y-2">
                {journalClubGroups.map((group) => (
                  <button
                    key={group.clubName}
                    type="button"
                    onClick={() => setSelectedJournalClub(group.clubName)}
                    data-journal-list-item
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:scale-[0.99]"
                    style={{ background: "#fff", border: "1px solid #D1C9B8" }}
                    aria-label={`${group.clubName} 기록 보기`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold" style={{ color: "#3D5A3E" }}>{group.clubName}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "#6B7280" }}>{group.totalRounds > 0 ? `${group.totalRounds}순 · ${group.totalHits}중 · ${group.rate}%${group.memoEntries > 0 ? ` · 메모 ${group.memoEntries}건` : ""}` : `메모 ${group.memoEntries}건`}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium" style={{ color: "#6B7280" }}>{formatDate(group.latestVisitDate)} · 누적 {group.visitDays}일</span>
                    <ChevronRight size={18} strokeWidth={2} style={{ color: "#6B7280" }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )
          ) : journalView === "날짜별" ? (
            selectedJournalDateGroup ? (
              <div data-testid="journal-date-detail" className="space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedJournalDate(null)}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors active:scale-95"
                  style={{ background: "#F5F0E8", color: "#3D5A3E", border: "1px solid #D1C9B8" }}
                >
                  <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" /> 날짜 목록으로
                </button>
                <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #D1C9B8" }}>
                  <div data-journal-detail-header className="flex items-center justify-between px-3 py-2" style={{ background: "#3D5A3E" }}>
                    <span className="text-sm font-bold text-white">{formatDate(selectedJournalDateGroup.date + "T00:00:00")}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white opacity-80">{selectedJournalDateGroup.totalRounds > 0 ? `${selectedJournalDateGroup.totalRounds}순 · ${selectedJournalDateGroup.totalHits}중${selectedJournalDateGroup.memoEntries > 0 ? ` · 메모 ${selectedJournalDateGroup.memoEntries}건` : ""}` : `메모 ${selectedJournalDateGroup.memoEntries}건`}</span>
                      {selectedJournalDateGroup.totalRounds > 0 && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold"
                          style={{
                            background: selectedJournalDateGroup.rate >= 60 ? "#22C55E" : selectedJournalDateGroup.rate >= 40 ? "#EAB308" : "#EF4444",
                            color: "#fff",
                          }}
                        >
                          {selectedJournalDateGroup.rate}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y" style={{ borderColor: "#E8E0D0" }}>
                    {selectedJournalDateGroup.records.map((record) => (
                      <RecordRow key={record.id} record={record} onDelete={requestDeleteRecord} onUpdateMemo={updateMemo} onAddMedia={addMediaToRecord} onDeleteMedia={deleteMediaFromRecord} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div data-testid="journal-date-list" className="space-y-2">
                {dateGroups.map((group) => (
                  <button
                    key={group.date}
                    type="button"
                    onClick={() => setSelectedJournalDate(group.date)}
                    data-journal-list-item
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:scale-[0.99]"
                    style={{ background: "#fff", border: "1px solid #D1C9B8" }}
                    aria-label={`${formatDate(group.date + "T00:00:00")} 기록 보기`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold" style={{ color: "#3D5A3E" }}>{formatDate(group.date + "T00:00:00")}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "#6B7280" }}>{group.totalRounds > 0 ? `${group.totalRounds}순 · ${group.totalHits}중${group.memoEntries > 0 ? ` · 메모 ${group.memoEntries}건` : ""}` : `메모 ${group.memoEntries}건`}</p>
                    </div>
                    {group.totalRounds > 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          background: group.rate >= 60 ? "#22C55E" : group.rate >= 40 ? "#EAB308" : "#EF4444",
                          color: "#fff",
                        }}
                      >
                        {group.rate}%
                      </span>
                    )}
                    <ChevronRight size={18} strokeWidth={2} style={{ color: "#6B7280" }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-2">
              {[...journalRecords].map((r) => (
                <RecordRow key={r.id} record={r} onDelete={requestDeleteRecord} onUpdateMemo={updateMemo} onAddMedia={addMediaToRecord} onDeleteMedia={deleteMediaFromRecord} showDate />
              ))}
            </div>
          )}
          </div>
          </div>
        </div>
        </SortableMainCard>

        {/* ── 기타 안내 ─────────────────────────────────────────────────── */}
        <SortableMainCard cardId="support" label="기타 안내" order={mainCardOrder.indexOf("support")} visible={mainCardVisibility.support && supportEventEnabled && !supportEventDismissed} onMove={handleMainCardMove} onDragStateChange={setMainCardMoveActive}>
          <div className="rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)]" style={{ background: "#fff", border: "1px solid #E6DED0" }}>
            <button
              type="button"
              className="flex h-14 w-full items-center justify-between px-4 text-left transition-all active:scale-[0.99]"
              onClick={() => setSupportEventOpen((value) => { const next = !value; localStorage.setItem(SUPPORT_EVENT_OPEN_KEY, String(next)); return next; })}
              aria-label={supportEventOpen ? "기타 안내 접기" : "기타 안내 펼치기"}
              aria-expanded={supportEventOpen}
            >
              <CardHeaderContent
                icon="support"
                title="기타 안내"
                summary={!supportEventOpen ? `${getVisibleSupportEventCount(displaySupportEvents)}건` : undefined}
              />
              <CollapseChevron open={supportEventOpen} />
            </button>
            <div style={{ maxHeight: supportEventOpen ? 1100 : 0, overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)" }}>
              <div className="max-h-[560px] space-y-2 overflow-y-auto px-4 pb-4 pt-3 touch-pan-y" style={{ WebkitOverflowScrolling: "touch" }}>
                {displaySupportEvents.length > 0 ? displaySupportEvents.map((event) => {
                  const locationUrl = safeExternalUrl(event.locationUrl);
                  return (
                    <div key={event.id} className="rounded-xl px-3 py-3" style={{ background: "#F5F0E8", border: "1px solid #E6DED0" }}>
                      <p className="text-sm font-bold" style={{ color: "#3D5A3E" }}>{event.title || SUPPORT_EVENT_DEFAULT_TITLE}</p>
                      <SupportEventImage imageUrl={event.imageUrl} alt={`${event.title || "기타 안내"} 이미지`} className="mt-2 h-40 w-full rounded-lg border object-cover" />
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5" style={{ color: "#6B7280" }}>{event.content || SUPPORT_EVENT_DEFAULT_CONTENT}</p>
                      {(event.date || locationUrl) && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                          {event.date && <span className="rounded-full px-2 py-1" style={{ background: "#fff", color: "#6B7280", border: "1px solid #E6DED0" }}>📅 {formatDate(event.date)}</span>}
                          {locationUrl && <a href={locationUrl} target="_blank" rel="noreferrer" className="rounded-full px-2 py-1 underline-offset-2 transition-colors hover:underline" style={{ background: "#EAF5E8", color: "#3D5A3E", border: "1px solid #CFE3CC" }}>📍 장소 보기</a>}
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div className="rounded-xl px-3 py-3" style={{ background: "#F5F0E8", border: "1px solid #E6DED0" }}>
                    <p className="text-sm font-bold" style={{ color: "#3D5A3E" }}>{SUPPORT_EVENT_DEFAULT_TITLE}</p>
                    <p className="mt-1 text-xs leading-5" style={{ color: "#6B7280" }}>{SUPPORT_EVENT_DEFAULT_CONTENT}</p>
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={dismissSupportEvent}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors active:scale-95"
                    style={{ color: "#6B7280", background: "#F5F0E8", border: "1px solid #E6DED0" }}
                    aria-label="기타 안내 닫기"
                  >
                    ✕ 닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SortableMainCard>
        </div>

        {/* ── 관리자 패널 ─────────────────────────────────────────────────── */}
        {adminMode && (
          <SectionCard title="⚙️ 관리자 패널">

            {/* 등록된 활터 목록 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold" style={{ color: "#3D5A3E" }}>📋 등록된 활터 목록</h4>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F0EBE0", color: "#6B7280" }}>전체 {clubs.length}개</span>
              </div>
              {/* 검색 입력란 */}
              {clubs.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-2" style={{ background: "#F5F0E8", border: "1px solid #D1C9B8" }}>
                  <span className="text-sm" style={{ color: "#9CA3AF" }}>🔍</span>
                  <input
                    type="text"
                    placeholder="활터 이름 검색..."
                    value={adminClubSearch}
                    onChange={(e) => setAdminClubSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: "#374151" }}
                  />
                  {adminClubSearch && (
                    <button onClick={() => setAdminClubSearch("")} className="text-xs" style={{ color: "#9CA3AF" }}>✕</button>
                  )}
                </div>
              )}
              {clubs.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: "#9CA3AF" }}>등록된 활터가 없습니다.</p>
              ) : (() => {
                const filtered = clubs.filter((c) =>
                  c.name.toLowerCase().includes(adminClubSearch.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <p className="text-xs text-center py-3" style={{ color: "#9CA3AF" }}>"{adminClubSearch}"에 해당하는 활터가 없습니다.</p>
                ) : (
                  <>
                    {adminClubSearch && (
                      <p className="text-xs mb-1.5" style={{ color: "#9CA3AF" }}>검색 결과 {filtered.length}개</p>
                    )}
                    <div className="space-y-2">
                      {filtered.map((club) => (
                        <div
                          key={club.id}
                          className="rounded-xl overflow-hidden"
                          style={{ border: editingClubId === club.id ? "1.5px solid #3D5A3E" : "1px solid #D1C9B8" }}
                        >
                          {editingClubId === club.id ? (
                            /* ── 편집 모드 ── */
                            <div className="px-3 py-2.5" style={{ background: "#EAF2EA" }}>
                              <p className="text-xs font-bold mb-2" style={{ color: "#3D5A3E" }}>✏️ 활터 편집</p>
                              <div className="space-y-1.5 mb-2">
                                <input
                                  value={editClubName}
                                  onChange={(e) => setEditClubName(e.target.value)}
                                  placeholder="활터 이름"
                                  className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                  style={{ background: "#fff", border: "1px solid #A8C5A0", color: "#1F2937" }}
                                />
                                <div className="flex gap-1.5">
                                  <input
                                    value={editClubLat}
                                    onChange={(e) => setEditClubLat(e.target.value)}
                                    placeholder="위도 (37.12345)"
                                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                                    style={{ background: "#fff", border: "1px solid #A8C5A0", color: "#374151" }}
                                  />
                                  <input
                                    value={editClubLng}
                                    onChange={(e) => setEditClubLng(e.target.value)}
                                    placeholder="경도 (127.12345)"
                                    className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none"
                                    style={{ background: "#fff", border: "1px solid #A8C5A0", color: "#374151" }}
                                  />
                                  {myLat && myLng && (
                                    <button
                                      onClick={() => { setEditClubLat(myLat!.toFixed(5)); setEditClubLng(myLng!.toFixed(5)); }}
                                      className="flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                                      style={{ background: "#3D5A3E", color: "#fff" }}
                                      title="현재 위치 사용"
                                    >📍</button>
                                  )}
                                </div>
                              </div>
                              {/* 코멘트 입력 */}
                              <div className="mb-2">
                                <input
                                  value={editClubComment}
                                  onChange={(e) => setEditClubComment(e.target.value)}
                                  placeholder="메모 / 코멘트 (예: 주차 편함, 수요일 휴장)"
                                  maxLength={40}
                                  className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                  style={{ background: "#fff", border: "1px solid #A8C5A0", color: "#374151" }}
                                />
                                <p className="text-right text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{editClubComment.length}/40</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={updateClub}
                                  disabled={savingClubId === club.id}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                                  style={{ background: savingClubId === club.id ? "#A8C5A0" : "#3D5A3E", color: "#fff" }}
                                >
                                  {savingClubId === club.id ? "저장 중..." : "✔ 저장"}
                                </button>
                                <button
                                  onClick={() => setEditingClubId(null)}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                                  style={{ background: "#F5F0E8", color: "#6B7280", border: "1px solid #D1C9B8" }}
                                >✕ 취소</button>
                              </div>
                            </div>
                          ) : (
                            /* ── 일반 모드 ── */
                            <div
                              className="flex items-center justify-between px-3 py-2"
                              style={{ background: "#F5F0E8" }}
                            >
                               <div className="min-w-0 flex-1">
                                 <div className="flex items-center gap-1.5 flex-wrap">
                                   <p className="text-sm font-medium truncate" style={{ color: "#1F2937" }}>{club.name}</p>
                                   {club.comment && (
                                     <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "#D1FAE5", color: "#065F46" }}>{club.comment}</span>
                                   )}
                                 </div>
                                 <p className="text-xs font-mono" style={{ color: "#6B7280" }}>
                                   {club.latitude.toFixed(5)}, {club.longitude.toFixed(5)}
                                 </p>
                               </div>
                              <div className="flex gap-1.5 ml-2 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingClubId(club.id);
                                    setEditClubName(club.name);
                                    setEditClubLat(club.latitude.toFixed(5));
                                    setEditClubLng(club.longitude.toFixed(5));
                                    setEditClubComment(club.comment ?? "");
                                  }}
                                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
                                  style={{ background: "#3D5A3E", color: "#fff" }}
                                >✏️ 편집</button>
                                <button
                                  onClick={() => deleteClub(club.id, club.name)}
                                  disabled={deletingClubId === club.id}
                                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
                                  style={{
                                    background: deletingClubId === club.id ? "#D1C9B8" : "#8B2635",
                                    color: "#fff",
                                    opacity: deletingClubId === club.id ? 0.6 : 1,
                                  }}
                                >
                                  {deletingClubId === club.id ? "삭제 중..." : "삭제"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="my-3" style={{ borderTop: "1px solid #D1C9B8" }} />

            {/* CSV 업로드 / 다운로드 */}
            <div className="mb-5">
              <h4 className="text-sm font-bold mb-1" style={{ color: "#3D5A3E" }}>📂 CSV 일괄 등록 / 다운로드</h4>
              <p className="text-xs mb-3" style={{ color: "#9CA3AF" }}>형식: <code className="px-1 rounded" style={{ background: "#F0EBE0" }}>name,latitude,longitude,comment</code> (기존 3열 CSV도 지원)</p>
              <div className="flex gap-2">
                {/* 업로드 */}
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvUpload}
                />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  disabled={csvUploading}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{
                    background: csvUploading ? "#D1C9B8" : "#3D5A3E",
                    color: "#fff",
                    opacity: csvUploading ? 0.7 : 1,
                    cursor: csvUploading ? "not-allowed" : "pointer",
                  }}
                >
                  {csvUploading ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full stat-refreshing" />
                      업로드 중...
                    </span>
                  ) : "⬆️ CSV 업로드"}
                </button>
                {/* 다운로드 */}
                <button
                  onClick={downloadClubsCsv}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{ background: "#E8E0D0", color: "#3D5A3E" }}
                >
                  ⬇️ CSV 다운로드
                </button>
              </div>
            </div>

            <div className="my-3" style={{ borderTop: "1px solid #D1C9B8" }} />

            <div className="mb-5 rounded-xl p-3" style={{ background: "#FFF4F2", border: "1px solid #E7B8B1" }}>
              <h4 className="text-sm font-bold mb-1" style={{ color: "#8B2635" }}>🗑️ 활터 전체 관리</h4>
              <p className="text-xs mb-2" style={{ color: "#7F1D1D" }}>현재 등록된 활터와 메모를 모두 삭제합니다. 삭제 전에 확인 창이 표시됩니다.</p>
              <button
                onClick={deleteAllClubs}
                disabled={deletingAllClubs || clubs.length === 0}
                className="w-full py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: deletingAllClubs || clubs.length === 0 ? "#D1C9B8" : "#8B2635",
                  color: "#fff",
                  opacity: deletingAllClubs || clubs.length === 0 ? 0.7 : 1,
                  cursor: deletingAllClubs || clubs.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {deletingAllClubs ? "전체 삭제 중..." : `활터 전체 삭제 (${clubs.length}개)`}
              </button>
            </div>

            {/* 신규 활터 등록 */}
            <div className="mb-5">
              <h4 className="text-sm font-bold mb-2" style={{ color: "#3D5A3E" }}>🏹 신규 활터 등록</h4>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="활터 이름 (예: 부산 수영정)"
                  value={newClubName}
                  onChange={(e) => setNewClubName(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="위도 (Latitude)"
                    value={newClubLat}
                    onChange={(e) => setNewClubLat(e.target.value)}
                    className="border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                    step="0.00001"
                  />
                  <input
                    type="number"
                    placeholder="경도 (Longitude)"
                    value={newClubLng}
                    onChange={(e) => setNewClubLng(e.target.value)}
                    className="border rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                    step="0.00001"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={fillCurrentLocation}
                    className="flex-1 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "#E8E0D0", color: "#3D5A3E" }}
                  >
                    📍 현재 내 위치로 채우기
                  </button>
                  <button
                    onClick={registerClub}
                    className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                    style={{ background: "#3D5A3E" }}
                  >
                    신규 활터 등록
                  </button>
                </div>
              </div>
            </div>

            <div className="my-3" style={{ borderTop: "1px solid #D1C9B8" }} />

            {/* 반경 설정 */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2" style={{ color: "#3D5A3E" }}>
                📏 지오펜싱 반경: <span style={{ color: "#8B2635" }}>{radius}m</span>
              </label>
              <input
                type="range"
                min={50}
                max={2000}
                step={50}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-full accent-green-800"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: "#9CA3AF" }}>
                <span>50m</span><span>2km</span>
              </div>
            </div>

            {/* 공지사항 */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2" style={{ color: "#3D5A3E" }}>📢 공지사항</label>
              <textarea
                value={notice}
                onChange={(e) => setNotice(e.target.value)}
                placeholder="새 공지사항을 입력하세요 (비우면 기존 공지 유지)"
                className="w-full border rounded-xl px-3 py-2 text-sm resize-none outline-none mb-2"
                style={{ borderColor: "#D1C9B8", background: "#FDFAF5", minHeight: 72 }}
                rows={3}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium" style={{ color: "#6B7280" }}>⏰ 만료일</label>
                <input
                  type="date"
                  value={noticeExpiry}
                  onChange={(e) => setNoticeExpiry(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm outline-none flex-1"
                  style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                />
                {noticeExpiry && (
                  <button onClick={() => setNoticeExpiry("")}
                    className="text-xs px-2 py-1 rounded-lg" style={{ background: "#E8E0D0", color: "#6B7280" }}>
                    제거
                  </button>
                )}
              </div>
            </div>

            {/* 기타 안내 */}
            <div className="mb-4 rounded-xl p-3" style={{ background: "#F0EDE6", border: "1px solid #E8E0D0" }}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-bold" style={{ color: "#3D5A3E" }}>🤝 기타 안내</label>
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "#fff", color: "#6B7280", border: "1px solid #D1C9B8" }}>{supportEventsInput.length}/{MAX_SUPPORT_EVENTS}건</span>
              </div>
              <p className="mb-3 text-xs leading-5" style={{ color: "#6B7280" }}>최대 5건까지 등록할 수 있으며, 사용자 카드에는 날짜가 최신인 순서로 표시됩니다.</p>
              <div className="space-y-3">
                {supportEventsInput.map((event, index) => (
                  <div key={event.id} className="rounded-xl p-3" style={{ background: "#fff", border: "1px solid #D1C9B8" }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold" style={{ color: "#3D5A3E" }}>안내 {index + 1}</span>
                      <button type="button" onClick={() => removeSupportEvent(event.id)} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: "#F5F0E8", color: "#6B7280" }}>삭제</button>
                    </div>
                    <input value={event.title} onChange={(e) => updateSupportEventInput(event.id, { title: e.target.value })} placeholder="제목 (예: 함께하는 활터)" maxLength={40} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ border: "1px solid #D1C9B8", background: "#FDFAF5", color: "#374151" }} />
                    <textarea value={event.content} onChange={(e) => updateSupportEventInput(event.id, { content: e.target.value })} placeholder="안내 내용을 입력하세요" maxLength={240} className="mt-2 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none" style={{ border: "1px solid #D1C9B8", background: "#FDFAF5", color: "#374151", minHeight: 72 }} rows={3} />
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input type="date" value={event.date} onChange={(e) => updateSupportEventInput(event.id, { date: e.target.value })} aria-label={`기타 안내 ${index + 1} 날짜`} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ border: "1px solid #D1C9B8", background: "#FDFAF5", color: "#374151" }} />
                      <input type="url" value={event.locationUrl} onChange={(e) => updateSupportEventInput(event.id, { locationUrl: e.target.value })} placeholder="장소 링크 (https://...)" aria-label={`기타 안내 ${index + 1} 장소 링크`} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ border: "1px solid #D1C9B8", background: "#FDFAF5", color: "#374151" }} />
                    </div>
                    <div className="mt-2 rounded-lg px-2.5 py-2" style={{ background: "#F5F0E8", border: "1px solid #E6DED0" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="cursor-pointer text-xs font-bold" style={{ color: "#3D5A3E" }}>
                          <span>{uploadingSupportEventId === event.id ? "이미지 첨부 중…" : "JPEG 이미지 첨부"}</span>
                          <input type="file" accept="image/jpeg" className="sr-only" disabled={uploadingSupportEventId !== null} onChange={(e) => { void uploadSupportEventImage(event.id, e.target.files?.[0]); e.currentTarget.value = ""; }} />
                        </label>
                        {event.imageUrl && <button type="button" onClick={() => updateSupportEventInput(event.id, { imageUrl: "" })} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ background: "#fff", color: "#6B7280", border: "1px solid #D1C9B8" }}>이미지 해제</button>}
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "#9CA3AF" }}>JPEG · 최대 5MB</p>
                      <SupportEventImage imageUrl={event.imageUrl} alt={`기타 안내 ${index + 1} 첨부 미리보기`} className="mt-2 h-28 w-full rounded-md border object-cover" />
                    </div>
                  </div>
                ))}
              </div>
              {supportEventsInput.length < MAX_SUPPORT_EVENTS && <button type="button" onClick={addSupportEvent} className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-bold transition-all active:scale-[0.98]" style={{ background: "#EAF5E8", color: "#3D5A3E", border: "1px solid #CFE3CC" }}>＋ 기타 안내 추가</button>}
              <label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold" style={{ background: "#fff", color: "#3D5A3E", border: "1px solid #D1C9B8" }}>
                <span>전체 사용자에게 기타 안내 표시</span>
                <input
                  type="checkbox"
                  checked={supportEventEnabledInput}
                  onChange={(e) => setSupportEventEnabledInput(e.target.checked)}
                  aria-label="기타 안내 카드 전체 사용자 표시"
                  className="size-4 accent-[#3D5A3E]"
                />
              </label>
            </div>

            <PastNoticePanel
              activeNotice={activeNotice}
              dismissedNotice={dismissedNotice}
              onRestore={restoreDismissedNotice}
              className="mb-4"
            />

            {/* 공지 이력 */}
            {noticeHistory.length > 0 && (
              <div className="mb-4 p-3 rounded-xl" style={{ background: "#F0EDE6" }}>
                <p className="text-xs font-bold mb-2" style={{ color: "#3D5A3E" }}>📋 지난 공지 이력</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {noticeHistory.map((item, idx) => (
                    <div key={idx} className="text-xs p-2 rounded-lg" style={{ background: "#FDFAF5", border: "1px solid #E8E0D0" }}>
                      <p className="font-medium" style={{ color: "#374151" }}>{item.text}</p>
                      <p className="mt-1 opacity-60">
                        {item.expiry && `만료: ${item.expiry} · `}
                        저장: {new Date(item.savedAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setNoticeHistory([]); localStorage.removeItem(NOTICE_HISTORY_KEY); toast.success("공지 이력을 삭제했습니다"); }}
                  className="mt-2 text-xs px-3 py-1 rounded-lg"
                  style={{ background: "#E8E0D0", color: "#6B7280" }}
                >
                  이력 전체 삭제
                </button>
              </div>
            )}

            <button
              onClick={saveAdminSettings}
              className="w-full py-3 rounded-2xl font-bold text-white"
              style={{ background: "#3D5A3E" }}
            >
              설정 저장 (전체 기기 반영)
            </button>

            <button
              onClick={() => { setAdminMode(false); toast.success("관리자 모드 종료"); }}
              className="w-full py-2 rounded-2xl font-medium mt-2"
              style={{ background: "#E8E0D0", color: "#6B7280" }}
            >
              관리자 모드 종료
            </button>

            <div className="my-3" style={{ borderTop: "1px solid #D1C9B8" }} />

            {/* 비밀번호 변경 */}
            <div className="mb-2">
              <h4 className="text-sm font-bold mb-2" style={{ color: "#3D5A3E" }}>🔐 관리자 비밀번호 변경</h4>
              <div className="space-y-2">
                <input
                  type="password"
                  placeholder="현재 비밀번호"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                />
                <input
                  type="password"
                  placeholder="새 비밀번호"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                />
                <input
                  type="password"
                  placeholder="새 비밀번호 확인"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#D1C9B8", background: "#FDFAF5" }}
                />
                <button
                  onClick={() => {
                    if (!pwCurrent || !pwNew || !pwConfirm) { toast.error("모든 항목을 입력해 주세요"); return; }
                    if (pwCurrent !== getAdminPw()) { toast.error("현재 비밀번호가 틀렸습니다"); setPwCurrent(""); return; }
                    if (pwNew.length < 4) { toast.error("새 비밀번호는 4자리 이상이어야 합니다"); return; }
                    if (pwNew !== pwConfirm) { toast.error("새 비밀번호가 일치하지 않습니다"); setPwConfirm(""); return; }
                    localStorage.setItem("admin_pw", pwNew);
                    toast.success("비밀번호가 변경되었습니다");
                    setPwCurrent(""); setPwNew(""); setPwConfirm("");
                  }}
                  className="w-full py-2 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
                  style={{ background: "#3D5A3E" }}
                >
                  비밀번호 변경
                </button>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ── 전체 ZIP 복원 선택 다이얼로그 ── */}
        {pendingPortableBackup && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => !portableRestoreLoading && setPendingPortableBackup(null)}
          >
            <section
              className="my-auto w-full max-w-md rounded-2xl p-5 shadow-2xl"
              style={{ background: "#fff", border: "1px solid #E8E0D0", animation: "card-enter 0.2s ease-out" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="portable-restore-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "#EAF5E8", color: "#3D5A3E" }}>
                  <HardDriveDownload size={21} strokeWidth={2} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 id="portable-restore-title" className="text-base font-bold" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>전체 ZIP 복원</h3>
                  <p className="mt-1 text-xs leading-5" style={{ color: "#6B7280" }}>백업 생성: {formatPortableBackupDate(pendingPortableBackup.manifest.createdAt)}</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl p-3 text-center" style={{ background: "#F5F0E8", border: "1px solid #E6DED0" }}>
                <div><p className="text-lg font-bold" style={{ color: "#3D5A3E" }}>{pendingPortableBackup.manifest.records.length}</p><p className="text-xs" style={{ color: "#6B7280" }}>기록</p></div>
                <div><p className="text-lg font-bold" style={{ color: "#3D5A3E" }}>{pendingPortableBackup.media.length}</p><p className="text-xs" style={{ color: "#6B7280" }}>첨부</p></div>
                <div><p className="text-lg font-bold" style={{ color: "#3D5A3E" }}>{Object.keys(pendingPortableBackup.manifest.settings).length}</p><p className="text-xs" style={{ color: "#6B7280" }}>설정</p></div>
              </div>

              {latestSafetyBackup && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "#F0F6EF", border: "1px solid #D5E4D2" }}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-xs font-bold" style={{ color: "#3D5A3E" }}><ShieldCheck size={14} aria-hidden="true" /> 최근 안전 백업 보관됨</p>
                    <p className="mt-0.5 truncate text-xs" style={{ color: "#526057" }}>{formatPortableBackupDate(latestSafetyBackup.createdAt)} · 기록 {latestSafetyBackup.recordCount}건 · 첨부 {latestSafetyBackup.mediaCount}개</p>
                  </div>
                  <button type="button" disabled={safetyBackupDownloadLoading} onClick={() => void downloadLatestSafetyBackup()} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-50" style={{ background: "#DDEFD9", color: "#315232" }}>{safetyBackupDownloadLoading ? "준비 중" : "ZIP 저장"}</button>
                </div>
              )}

              <div className="space-y-2" role="radiogroup" aria-label="ZIP 복원 방식">
                <label className="block cursor-pointer rounded-xl p-3 transition-colors" style={{ background: portableRestoreMode === "merge" ? "#EAF5E8" : "#F9F7F2", border: portableRestoreMode === "merge" ? "1.5px solid #3D5A3E" : "1px solid #E6DED0" }}>
                  <span className="flex items-start gap-3">
                    <input type="radio" name="portable-restore-mode" value="merge" checked={portableRestoreMode === "merge"} onChange={() => setPortableRestoreMode("merge")} className="mt-0.5 size-4 accent-[#3D5A3E]" />
                    <span>
                      <span className="block text-sm font-bold" style={{ color: "#3D5A3E" }}>병합 복원 · 권장</span>
                      <span className="mt-1 block text-xs leading-5" style={{ color: "#526057" }}>현재 기록과 첨부는 유지하고, 같은 기록은 건너뛰며 새 기록만 추가합니다. 카드 배치·글자 크기 등 기기 설정은 백업 내용으로 적용합니다.</span>
                    </span>
                  </span>
                </label>
                <label className="block cursor-pointer rounded-xl p-3 transition-colors" style={{ background: portableRestoreMode === "replace" ? "#FEF2F2" : "#F9F7F2", border: portableRestoreMode === "replace" ? "1.5px solid #DC2626" : "1px solid #E6DED0" }}>
                  <span className="flex items-start gap-3">
                    <input type="radio" name="portable-restore-mode" value="replace" checked={portableRestoreMode === "replace"} onChange={() => setPortableRestoreMode("replace")} className="mt-0.5 size-4 accent-[#DC2626]" />
                    <span>
                      <span className="block text-sm font-bold" style={{ color: "#B91C1C" }}>전체 복원 · 현재 데이터 덮어쓰기</span>
                      <span className="mt-1 block text-xs leading-5" style={{ color: "#7F1D1D" }}>현재 기기의 기록·첨부·카드 배치·글자 크기 등 저장된 설정을 모두 백업 내용으로 교체합니다.</span>
                    </span>
                  </span>
                </label>
              </div>

              {portableRestoreMode === "replace" && (
                <div className="mt-3 rounded-lg px-3 py-2.5 text-xs leading-5" style={{ background: "#FEF2F2", color: "#B91C1C" }} data-testid="replace-safety-backup-notice">
                  <p className="flex items-center gap-1 font-bold"><ShieldCheck size={14} aria-hidden="true" /> 자동 안전 백업 후 전체 복원</p>
                  <p className="mt-1">덮어쓰기 직전 현재 기록·첨부·설정을 ZIP으로 만들어 이 기기에 최신 1개를 보관하고 ZIP 다운로드도 시도합니다. 안전 백업을 만들지 못하면 전체 복원을 시작하지 않습니다.</p>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button type="button" disabled={portableRestoreLoading} onClick={() => setPendingPortableBackup(null)} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50" style={{ background: "#E8E0D0", color: "#526057" }}>취소</button>
                <button type="button" disabled={portableRestoreLoading} onClick={() => void applyPortableRestore()} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50" style={{ background: portableRestoreMode === "replace" ? "#C2410C" : "#3D5A3E" }}>{portableRestoreLoading ? (portableRestoreStage === "safety" ? "안전 백업 중..." : "복원 중...") : portableRestoreMode === "replace" ? "안전 백업 후 전체 복원" : "병합 복원"}</button>
              </div>
            </section>
          </div>
        )}

        {/* ── 개별 기록 삭제 확인 다이얼로그 ── */}
        {pendingDeleteRecord && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setPendingDeleteRecordId(null)}
          >
            <section
              className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
              style={{ background: "#fff", border: "1px solid #E8E0D0", animation: "card-enter 0.2s ease-out" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="record-delete-confirm-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: "#FEE2E2" }} aria-hidden="true">🗑️</div>
                <div>
                  <h3 id="record-delete-confirm-title" className="text-base font-bold" style={{ color: "#1F2937", fontFamily: "'Noto Serif KR', serif" }}>기록 삭제 확인</h3>
                  <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>선택한 기록을 삭제할까요?</p>
                </div>
              </div>

              <div className="mb-3 rounded-xl p-3" style={{ background: "#F9F7F2", border: "1px solid #E8E0D0" }}>
                <p className="text-sm font-bold" style={{ color: "#374151" }}>{formatDate(pendingDeleteRecord.date)} · {formatTime(pendingDeleteRecord.date)}</p>
                <p className="mt-1 text-xs" style={{ color: "#526057" }}>
                  {isPracticeRound(pendingDeleteRecord) ? `습사 기록 · ${pendingDeleteRecord.hits}중 / 5시` : "메모 기록"}
                  {(pendingDeleteRecord.media?.length ?? 0) > 0 && ` · 첨부 ${pendingDeleteRecord.media!.length}개`}
                </p>
                {pendingDeleteRecord.memo && <p className="mt-2 line-clamp-2 text-xs" style={{ color: "#6B7280" }}>메모: {pendingDeleteRecord.memo}</p>}
              </div>

              <p className="mb-4 rounded-xl px-3 py-2 text-xs leading-5" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
                삭제한 기록과 첨부 파일은 복구할 수 없습니다.
              </p>

              <div className="flex gap-2">
                <button type="button" onClick={() => setPendingDeleteRecordId(null)} className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all active:scale-95" style={{ background: "#E8E0D0", color: "#3D5A3E" }}>취소</button>
                <button type="button" onClick={confirmDeleteRecord} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all active:scale-95" style={{ background: "#EF4444" }}>기록 삭제</button>
              </div>
            </section>
          </div>
        )}

        {/* ── 전체 기록 초기화 확인 다이얼로그 ── */}
        {showClearConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setShowClearConfirm(false)}
          >
            <div
              className="rounded-2xl p-6 mx-4 shadow-2xl"
              style={{ background: "#fff", border: "1px solid #E8E0D0", maxWidth: 320, width: "100%", animation: "card-enter 0.2s ease-out" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">🗑️</div>
                <h3 className="text-base font-bold mb-1" style={{ color: "#1F2937", fontFamily: "'Noto Serif KR', serif" }}>
                  전체 기록 삭제
                </h3>
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  저장된 <strong style={{ color: "#EF4444" }}>{records.length}건</strong>의 기록이 모두 삭제됩니다.<br />
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
              <p className="text-xs text-center mb-4 px-2 py-2 rounded-xl" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
                ⚠️ CSV에는 첨부 파일이 포함되지 않습니다. 전체 삭제 시 기기 내 첨부도 함께 삭제됩니다.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                  style={{ background: "#E8E0D0", color: "#3D5A3E" }}
                >
                  취소
                </button>
                <button
                  onClick={clearAllRecords}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={{ background: "#EF4444", color: "#fff" }}
                >
                  전체 삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 축하 모달 ─────────────────────────────────────────────────── */}
        {treeModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={() => setTreeModal(null)}
          >
            <div
              className="levelup-modal-enter rounded-3xl p-7 w-80 text-center shadow-2xl"
              style={{ background: "#fff", border: "2px solid #3D5A3E" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="text-6xl mb-3 select-none"
                style={{ animation: "tree-float 2s ease-in-out infinite" }}
              >
                {treeModal.emoji}
              </div>
              <h3
                className="text-lg font-bold mb-2"
                style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}
              >
                {treeModal.title}
              </h3>
              <p
                className="text-sm mb-5 whitespace-pre-line"
                style={{ color: "#6B7280" }}
              >
                {treeModal.desc}
              </p>
              <button
                onClick={() => setTreeModal(null)}
                className="w-full py-3 rounded-2xl font-bold text-white transition-all active:scale-95"
                style={{ background: "#3D5A3E", boxShadow: "0 4px 12px rgba(61,90,62,0.3)" }}
              >
                확인
              </button>
            </div>
          </div>
        )}

        <div className="pb-8 pt-2 text-center text-xs space-y-1" style={{ color: "#9CA3AF" }}>
          <p>활터 왔소 — 국궁인을 위한 습사 기록 앱</p>
          <p>© {new Date().getFullYear()} 해현 · 활터 왔소. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function CollapseChevron({
  open,
  color = "#75846E",
  background = "#F7F5F0",
  borderColor = "#E8E0D0",
}: {
  open: boolean;
  color?: string;
  background?: string;
  borderColor?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center rounded-lg border shadow-[0_1px_2px_rgba(61,90,62,0.06)]"
      style={{ background, borderColor }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        className="transition-transform duration-200"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      >
        <path d="m7 10 5 5 5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SectionCard({
  title,
  children,
  collapsible = false,
  open = true,
  icon,
  summary,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  icon?: CardIconName;
  summary?: string;
  onToggle?: () => void;
}) {
  return (
    <div className={`rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(61,90,62,0.08)] ${collapsible ? "p-0" : "p-4"}`} style={{ background: "#fff", border: "1px solid #E6DED0" }}>
      {title && (
        collapsible ? (
          <button
            type="button"
            aria-label={open ? "습사 기록 접기" : "습사 기록 펼치기"}
            aria-expanded={open}
            onClick={onToggle}
            className="flex h-14 w-full items-center justify-between px-4 text-left transition-all active:scale-[0.99]"
          >
            <CardHeaderContent icon={icon} title={title} summary={!open ? summary : undefined} />
            <CollapseChevron open={open} />
          </button>
        ) : (
          <h2 className="text-base font-bold mb-3" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>{title}</h2>
        )
      )}
      {(!collapsible || open) && <div className={collapsible ? "px-4 pb-4 pt-3" : ""}>{children}</div>}
    </div>
  );
}

function CardHeaderContent({ icon, title, summary }: { icon?: CardIconName; title: string; summary?: string }) {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-[1.75rem_5rem_minmax(0,1fr)] items-center gap-2.5 text-left">
      {icon && <CardIcon name={icon} />}
      <span className="mobile-card-heading min-w-0 truncate text-base font-bold leading-tight tracking-[-0.02em]" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>{title}</span>
      {summary && <span className="mobile-card-summary justify-self-start max-w-full truncate rounded-full px-2 py-0.5 text-center text-xs font-semibold leading-4 tabular-nums" style={{ background: "#F0EBE0", color: "#526057" }}>{summary}</span>}
    </span>
  );
}

function StatBox({
  label, value, unit, color, loading, refreshing,
}: {
  label: string; value: number; unit: string; color: string;
  loading?: boolean; refreshing?: boolean;
}) {
  // key를 바꿼서 fade-in 애니메이션 재실행
  const [animKey, setAnimKey] = useState(0);
  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      setAnimKey((k) => k + 1);
      prevValue.current = value;
    }
  }, [value]);

  return (
    <div className="mobile-stat-box relative flex h-full min-h-[92px] flex-col items-center justify-center rounded-xl p-3 text-center" style={{ background: "#F5F0E8" }}>
      {/* 갱신 중 회전 점 */}
      {refreshing && (
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full stat-refreshing"
          style={{ background: color, opacity: 0.6 }}
        />
      )}
      <p className="mobile-stat-label text-xs mb-1" style={{ color: "#66736B" }}>{label}</p>
      {loading ? (
        <span className="stat-skeleton" />
      ) : (
        <p key={animKey} className="mobile-stat-value text-2xl font-bold stat-fade-in" style={{ color }}>
          {value}
        </p>
      )}
      <p className="mobile-stat-label text-xs" style={{ color: "#66736B" }}>{unit}</p>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="mobile-stat-box rounded-xl p-3 text-center" style={{ background: "#F5F0E8", border: highlight ? "2px solid #3D5A3E" : "none" }}>
      <p className="mobile-stat-label text-xs mb-1" style={{ color: "#66736B" }}>{label}</p>
      <p className="mobile-stat-value text-xl font-bold" style={{ color: highlight ? "#3D5A3E" : "#374151" }}>{value}</p>
    </div>
  );
}

function RecordMediaList({ media, onRequestDelete }: { media?: LocalRecordMedia[]; onRequestDelete?: (attachment: LocalRecordMedia) => void }) {
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const attachments = media ?? [];
    if (attachments.length === 0) {
      setMediaUrls({});
      return () => {};
    }

    void Promise.all(attachments.map(async (attachment) => {
      try {
        const blob = await getRecordMediaBlob(attachment.id);
        if (!blob) return [attachment.id, ""] as const;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return [attachment.id, url] as const;
      } catch {
        return [attachment.id, ""] as const;
      }
    })).then((entries) => {
      if (active) {
        setMediaUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
      } else {
        entries.forEach(([, url]) => { if (url) URL.revokeObjectURL(url); });
      }
    });

    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [media]);

  if (!media?.length) return null;

  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={`첨부 ${media.length}개`}>
      {media.map((attachment) => {
        const url = mediaUrls[attachment.id];
        return (
          <div key={attachment.id} className="overflow-hidden rounded-lg p-2" style={{ background: "#F5F0E8", border: "1px solid #E6DED0" }}>
            {url && attachment.kind === "image" ? (
              <a href={url} target="_blank" rel="noreferrer" aria-label={`${attachment.name} 사진 크게 보기`}>
                <img src={url} alt={attachment.name} className="h-36 w-full rounded-md object-cover" />
              </a>
            ) : url && attachment.kind === "video" ? (
              <video controls preload="metadata" className="h-36 w-full rounded-md bg-black object-contain">
                <source src={url} type={attachment.type} />
                동영상을 재생할 수 없습니다.
              </video>
            ) : url && attachment.kind === "audio" ? (
              <div className="flex min-h-16 items-center gap-2 rounded-md px-2" style={{ background: "#FFFFFF" }}>
                <Music size={18} strokeWidth={2} aria-hidden="true" style={{ color: "#3D5A3E" }} />
                <audio controls preload="metadata" className="min-w-0 flex-1">
                  <source src={url} type={attachment.type} />
                  음성을 재생할 수 없습니다.
                </audio>
              </div>
            ) : (
              <div className="flex min-h-16 items-center gap-2 rounded-md px-2 text-xs" style={{ background: "#FFFFFF", color: "#6B7280" }}>
                <Paperclip size={17} strokeWidth={2} aria-hidden="true" />
                <span>이 기기에서 첨부를 불러올 수 없습니다.</span>
              </div>
            )}
            <p className="mt-1.5 truncate text-[11px] font-medium" style={{ color: "#526057" }}>{attachment.name}</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-[10px]" style={{ color: "#89958D" }}>{getRecordMediaSummary(attachment.kind)} · {formatRecordMediaSize(attachment.size)}</p>
              {onRequestDelete && (
                <button
                  type="button"
                  onClick={() => onRequestDelete(attachment)}
                  aria-label={`${attachment.name} 첨부 삭제`}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold transition-all active:scale-95"
                  style={{ background: "#FEE2E2", color: "#B91C1C" }}
                >
                  <X size={12} strokeWidth={2.4} aria-hidden="true" /> 삭제
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordRow({ record, onDelete, onUpdateMemo, onAddMedia, onDeleteMedia, showDate }: { record: ShotRecord; onDelete: (id: string) => void; onUpdateMemo: (id: string, memo: string) => void; onAddMedia: (id: string, files: File[]) => void; onDeleteMedia: (recordId: string, mediaId: string) => Promise<boolean>; showDate?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(record.memo || "");
  const [pendingMediaDelete, setPendingMediaDelete] = useState<LocalRecordMedia | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const isRound = isPracticeRound(record);
  const mediaCount = record.media?.length ?? 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    onUpdateMemo(record.id, editValue.trim());
    setEditing(false);
    if (editValue.trim()) {
      toast.success("메모가 저장되었습니다");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(record.memo || "");
      setEditing(false);
    }
  };

  const confirmMediaDelete = async () => {
    if (!pendingMediaDelete) return;
    const deleted = await onDeleteMedia(record.id, pendingMediaDelete.id);
    if (deleted) setPendingMediaDelete(null);
  };

  return (
    <div className="flex flex-col px-3 py-2" style={{ background: "#FDFAF5" }}>
      {/* 상단 행: 날짜/시간 + 시표(고정폭) + 관중수 + 삭제 */}
      <div className="flex items-center gap-2">
        {/* 날짜·시간 */}
        <div className="flex items-center gap-1 shrink-0">
          {showDate && (
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              {isValidDate(record.date) ? new Date(record.date).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : "-"}
            </span>
          )}
          <span className="text-xs" style={{ color: "#9CA3AF" }}>{formatTime(record.date)}</span>
        </div>
        {isRound ? (
          <>
            {/* 시표 영역 — 가로폭 고정(140px)으로 절대 찌그러지지 않음 */}
            <span
              style={{
                display: "inline-flex",
                gap: 2,
                width: 140,
                minWidth: 140,
                flexShrink: 0,
              }}
            >
              {record.shots.map((s, i) => (
                <span
                  key={i}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    background: s ? "#3D5A3E" : "#8B2635",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {s ? "O" : "X"}
                </span>
              ))}
            </span>
            {/* 관중수 */}
            <span className="text-xs font-bold shrink-0" style={{ color: "#374151" }}>{record.hits}중</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold" style={{ background: "#EAF5E8", color: "#3D5A3E" }}>
            <Paperclip size={13} strokeWidth={2.2} aria-hidden="true" /> 메모 기록
          </span>
        )}
        {/* 삭제 버튼 — 오른쪽 끝 */}
        <button
          onClick={() => onDelete(record.id)}
          className="ml-auto text-xs px-2 py-1 rounded-lg shrink-0"
          style={{ background: "#FEE2E2", color: "#EF4444" }}
        >
          삭제
        </button>
      </div>
      {/* 메모 행 — 편집 모드 또는 표시 모드 */}
      {editing ? (
        <div className="flex items-center gap-1 mt-1 pl-1">
          <span style={{ fontSize: 12, lineHeight: 1.4, color: "#6B7280" }}>📝</span>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="메모 입력..."
            style={{
              flex: 1,
              fontSize: 12,
              color: "#374151",
              background: "#FFF",
              border: "1px solid #3D5A3E",
              borderRadius: 6,
              padding: "3px 8px",
              outline: "none",
            }}
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            style={{ fontSize: 11, color: "#fff", background: "#3D5A3E", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}
          >
            저장
          </button>
        </div>
      ) : (
        <div
          className="flex items-start gap-1 mt-1 pl-1 cursor-pointer rounded-md transition-colors duration-150"
          onClick={() => { setEditValue(record.memo || ""); setEditing(true); }}
          style={{ minHeight: 20 }}
          title="터치하여 메모 편집"
        >
          <span style={{ fontSize: 12, lineHeight: 1.4, color: "#6B7280" }}>📝</span>
          {record.memo && record.memo.trim() !== "" ? (
            <span
              style={{
                fontSize: 12,
                color: "#6B7280",
                lineHeight: 1.4,
                wordBreak: "break-all",
                whiteSpace: "pre-wrap",
              }}
            >
              {record.memo}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#C4B5A0", lineHeight: 1.4, fontStyle: "italic" }}>
              메모 추가...
            </span>
          )}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2 pl-1">
        <input
          ref={mediaInputRef}
          type="file"
          accept={RECORD_MEDIA_ACCEPT}
          multiple
          className="hidden"
          data-testid={`record-media-input-${record.id}`}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            onAddMedia(record.id, files);
          }}
        />
        <button
          type="button"
          onClick={() => mediaInputRef.current?.click()}
          disabled={mediaCount >= MAX_RECORD_MEDIA_ITEMS}
          aria-label={`이 기록에 사진, 동영상 또는 음성 첨부${mediaCount > 0 ? ` · 현재 ${mediaCount}개` : ""}`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-all active:scale-95 disabled:cursor-default disabled:opacity-45"
          style={{ background: "#EEF5EC", border: "1px solid #C8D8C8", color: "#3D5A3E" }}
        >
          <ImagePlus size={14} strokeWidth={2.2} aria-hidden="true" />
          {mediaCount > 0 ? `첨부 추가 · ${mediaCount}/${MAX_RECORD_MEDIA_ITEMS}` : "미디어 첨부"}
        </button>
        <span className="text-[10px]" style={{ color: "#89958D" }}>이 기기에 저장</span>
      </div>
      <RecordMediaList media={record.media} onRequestDelete={setPendingMediaDelete} />
      {pendingMediaDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`record-media-delete-title-${record.id}`}
          className="mt-2 rounded-lg p-2.5"
          style={{ background: "#FFF6F5", border: "1px solid #FECACA" }}
        >
          <p id={`record-media-delete-title-${record.id}`} className="text-xs font-bold" style={{ color: "#991B1B" }}>첨부 파일 삭제</p>
          <p className="mt-1 break-all text-[11px] leading-4" style={{ color: "#7F1D1D" }}>
            <strong>{pendingMediaDelete.name}</strong> 파일만 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setPendingMediaDelete(null)}
              className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-all active:scale-95"
              style={{ background: "#F3EDE4", color: "#526057" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmMediaDelete}
              className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-all active:scale-95"
              style={{ background: "#DC2626", color: "#FFFFFF" }}
            >
              첨부 삭제
            </button>
          </div>
        </div>
      )}
      {/* 활터명 배지 — 300m 이내 매칭된 경우만 표시 */}
      {record.clubName && (
        <div className="flex items-center gap-1 mt-1 pl-1">
          <span
            style={{
              fontSize: 11,
              color: "#3D5A3E",
              background: "#E8F0E8",
              borderRadius: 6,
              padding: "1px 6px",
              fontWeight: 600,
            }}
          >
            📍 {record.clubName}
          </span>
        </div>
      )}
      {/* 전문가 모드: 미니 과녁 그리드 */}
      {record.positions && (
        <div className="mt-2 pl-1">
          <div style={{ display: "inline-grid", gridTemplateColumns: "repeat(5, 16px)", gap: 2 }}>
            {record.positions.map((row, r) =>
              row.map((cellArr, c) => {
                // cellArr는 number[] (다중 화살 허용)
                const arrows: number[] = Array.isArray(cellArr) ? cellArr : (cellArr as unknown as number) > 0 ? [cellArr as unknown as number] : [];
                const isCenter = r >= 1 && r <= 3 && c >= 1 && c <= 3;
                const ARROW_COLORS = ["#EF4444","#3B82F6","#10B981","#F59E0B","#8B5CF6"];
                const hasArrow = arrows.length > 0;
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{
                      width: 16, height: 16, borderRadius: 3,
                      background: hasArrow ? ARROW_COLORS[arrows[0]-1] : isCenter ? "#D1FAE5" : "#FEE2E2",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexDirection: "column",
                      fontSize: 6, fontWeight: 700, color: hasArrow ? "#fff" : "transparent",
                      lineHeight: 1,
                    }}
                  >{hasArrow ? arrows.map((n) => <span key={n} style={{display:"block",fontSize:6}}>{n}</span>) : ""}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
