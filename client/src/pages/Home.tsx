/**
 * 활터 왔소 — 국궁 시수 기록 앱
 *
 * 디자인 철학: 대나무 숲 자연주의
 * - 크림 배경(#F5F0E8), 대나무 녹색(#3D5A3E), 진홍 강조(#8B2635)
 * - Noto Serif KR (제목) + Noto Sans KR (본문)
 * - 카드 기반 섹션, 부드러운 그림자, 자연스러운 전환
 *
 * 기능:
 * 1. O/X 시수 기록 (1순 5시) → LocalStorage 저장
 * 2. 일별/주별/월별/연별 통계
 * 3. 시수 일지 (날짜별 그룹 보기 + 전체 목록)
 * 4. CSV 내보내기
 * 5. Wake Lock (화면 꺼짐 방지)
 * 6. 다중 활터 드롭다운 (Supabase clubs 테이블)
 * 7. 실시간 현황판 (현재원 1시간 Grace Period / 동시접속 5분 / 누적)
 * 8. 관리자 모드 (활터 등록, 공지사항, 반경 설정)
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { GrowingTree } from "@/components/GrowingTree";

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

interface ShotRecord {
  id: string;
  date: string; // ISO string
  shots: (boolean | null)[];
  hits: number;
  memo: string;
  lat?: number;
  lng?: number;
  clubName?: string; // 지오펜싱 매칭된 활터명 (300m 이내) 또는 undefined
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
  totalRounds: number;
  totalHits: number;
  rate: number;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bow_records_v11";
const SESSION_KEY = "bow_session_id";
const DEFAULT_ADMIN_PW = "0531";
const LAST_CLUB_KEY = "last_selected_club"; // 마지막 선택 활터 저장 키
const TREE_NAME_KEY = "tree_name"; // 나무 이름 저장 키
const LOCATION_OPEN_KEY = "section_location_open"; // 현재 활터 섹션 접힘 상태
const STATUS_OPEN_KEY = "section_status_open"; // 왔소앱 현황 섹션 접힘 상태
const LAST_BACKUP_KEY = "last_csv_backup_ts"; // 마지막 CSV 백업 타임스탬프
const BACKUP_REMIND_DAYS = 7; // N일마다 백업 알림
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

function groupByDate(records: ShotRecord[]): DateGroup[] {
  // records는 이미 최신순(index 0 = 최신)으로 저장되어 있으므로 그대로 순회
  const map = new Map<string, ShotRecord[]>();
  records.forEach((r) => {
    const key = getDateKey(r.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries()).map(([date, recs]) => {
    const totalHits = recs.reduce((s, r) => s + r.hits, 0);
    const totalShots = recs.length * 5;
    return {
      date,
      records: recs, // 각 날짜 내에서도 최신순 유지
      totalRounds: recs.length,
      totalHits,
      rate: totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0,
    };
  });
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function Home() {
  // 세션 ID
  const [sessionId] = useState<string>(() => {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) { id = nanoid(); localStorage.setItem(SESSION_KEY, id); }
    return id;
  });

  // 시수 기록
  const [records, setRecords] = useState<ShotRecord[]>(() => {
    try {
      const raw: ShotRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      // 날짜가 유효하지 않은 레코드 필터링
      return raw.filter((r) => r && isValidDate(r.date));
    } catch { return []; }
  });
  const [shots, setShots] = useState<(boolean | null)[]>([null, null, null, null, null]);
  const [memo, setMemo] = useState("");

  // 통계 탭
  const [statTab, setStatTab] = useState<"일별" | "주별" | "월별" | "활터별" | "전체">("일별");

  // 일지 보기 모드
  const [journalView, setJournalView] = useState<"날짜별" | "전체">("날짜별");
  // 일지 페이징 (5일 단위)
  const [visibleDays, setVisibleDays] = useState(5);

  // GPS
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const myLatRef = useRef<number | null>(null);
  const myLngRef = useRef<number | null>(null);

  // 활터 목록
  const [clubs, setClubs] = useState<Club[]>(FALLBACK_CLUBS);
  const [selectedClubId, setSelectedClubId] = useState<number>(() => {
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
  const [statsLoading, setStatsLoading] = useState(true);   // 최초 로딩
  const [statsRefreshing, setStatsRefreshing] = useState(false); // 30초 갱신 중
  const [statsError, setStatsError] = useState<string | null>(null); // 에러 메시지
  const [statsRetrying, setStatsRetrying] = useState(false); // 수동 재시도 중
  const statsLoadedOnce = useRef(false);
  const statsHadError = useRef(false); // 직전 실행에 에러가 있었는지 추적

  // 섹션 토글
  const [locationOpen, setLocationOpen] = useState(
    () => localStorage.getItem(LOCATION_OPEN_KEY) !== "false"
  );
  const [statusOpen, setStatusOpen] = useState(
    () => localStorage.getItem(STATUS_OPEN_KEY) !== "false"
  );

  // 성장형 나무 시스템
  const [treeModal, setTreeModal] = useState<{ type: "levelup" | "mollgi" | "unlock"; title: string; desc: string; emoji: string } | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeName, setTreeName] = useState(() => localStorage.getItem(TREE_NAME_KEY) || "나의 나무");
  const [treeNameEditing, setTreeNameEditing] = useState(false);
  const [treeNameInput, setTreeNameInput] = useState("");
  const treeNameInputRef = useRef<HTMLInputElement>(null);

  // 관리자
  const [adminMode, setAdminMode] = useState(false);
  const [adminTapCount, setAdminTapCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const adminTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 비밀번호 변경
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");

  // 관리자 설정값
  const [radius, setRadius] = useState(200);
  const [notice, setNotice] = useState("");
  const [noticeExpiry, setNoticeExpiry] = useState("");
  const [displayNotice, setDisplayNotice] = useState("");
  const [displayNoticeExpiry, setDisplayNoticeExpiry] = useState("");

  // 관리자 신규 활터 등록
  const [newClubName, setNewClubName] = useState("");
  const [newClubLat, setNewClubLat] = useState("");
  const [newClubLng, setNewClubLng] = useState("");
  const [deletingClubId, setDeletingClubId] = useState<number | null>(null);

  // CSV 업로드
  const [csvUploading, setCsvUploading] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // 왔소앱 현황 활터 검색
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
    if (!navigator.geolocation) return;
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        myLatRef.current = pos.coords.latitude;
        myLngRef.current = pos.coords.longitude;
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

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
    } catch {}
  }, []);

  useEffect(() => {
    loadSettings();
    const t = setInterval(loadSettings, 60000);
    return () => clearInterval(t);
  }, [loadSettings]);

  // ── Supabase: 위치 업서트 (60초마다) ─────────────────────────────────────
  useEffect(() => {
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
  }, [sessionId, selectedClub]);

  // ── Supabase: 현황판 조회 (30초마다) ─────────────────────────────────────
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
      // 선택 활터 현재원
      if (selectedClub) {
        const { data: countData, error: countErr } = await supabase.rpc("get_club_user_count", {
          club_name_param: selectedClub.name,
          center_lat: selectedClub.latitude,
          center_lng: selectedClub.longitude,
          radius_km: radius / 1000,
        });
        if (countErr) throw countErr;
        setClubCount(typeof countData === "number" ? countData : 0);
      }
      // 이전에 에러가 있었다면 복구 토스트 표시
      if (statsHadError.current) {
        statsHadError.current = false;
        toast.success("현황판 연결이 복구되었습니다", {
          description: "데이터가 성공적으로 갱신되었습니다.",
          duration: 3000,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : (err as { message?: string })?.message ?? "알 수 없는 오류";
      // 네트워크 에러인 경우 사용자 친화적 메시지로 변환
      statsHadError.current = true;
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
  }, [selectedClub, radius]);

  // 수동 재시도
  const handleRetryStats = useCallback(() => {
    setStatsRetrying(true);
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 30000);
    return () => clearInterval(t);
  }, [fetchStats]);

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

  // ── 시수 기록 저장 ────────────────────────────────────────────────────────
  const saveRecord = () => {
    if (shots.some((s) => s === null)) {
      toast.error("5시를 모두 입력해 주세요");
      return;
    }
    const hits = shots.filter(Boolean).length;
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

    const record: ShotRecord = {
      id: nanoid(),
      date: new Date().toISOString(),
      shots: shots as boolean[],
      hits,
      memo,
      // 300m 이내 활터명이 있으면 활터명 저장, 없으면 GPS 좌표 저장
      clubName: matchedClubName,
      lat: matchedClubName ? undefined : (curLat ?? undefined),
      lng: matchedClubName ? undefined : (curLng ?? undefined),
    };
    const updated = [record, ...records];
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShots([null, null, null, null, null]);
    setMemo("");
    setVisibleDays(5); // 새 기록 저장 시 일지 맨 위부터 다시 표시
    const locationLabel = matchedClubName ? ` · 📍${matchedClubName}` : "";
    toast.success(`저장 완료 — ${hits}중 / 5시${hits === 5 ? " 🎉 몰기!" : ""}${locationLabel}`);

    // ── 성장형 나무: 레벨업 / 몰기 해금 감지 ────────────────────────────────
    const prevTotalHits = records.reduce((s, r) => s + r.hits, 0);
    const newTotalHits = prevTotalHits + hits;
    const prevMollgi = records.filter((r) => r.hits === 5).length;
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

  const deleteRecord = (id: string) => {
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success("기록이 삭제되었습니다");
  };

  const clearAllRecords = () => {
    setRecords([]);
    localStorage.removeItem(STORAGE_KEY);
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
    const header = "순번,날짜(KST),관중수,시수내역,메모,활터명,위도,경도\n";
    const rows = [...records].reverse().map((r, i) =>
      `${i + 1},${formatDate(r.date)} ${formatTime(r.date)},${r.hits},"${r.shots.map((s) => (s ? "O" : "X")).join(" ")}","${r.memo ?? ""}","${r.clubName ?? ""}",${r.clubName ? "" : (r.lat ?? "")},${r.clubName ? "" : (r.lng ?? "")}`
    ).join("\n");
    const blob = new Blob([BOM + metaLine + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `활터왔소_시수일지_${todayKST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // 마지막 백업 시간 기록
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    setShowBackupBanner(false);
    if (fromBanner) toast.success("백업 완료! 다음 알림까지 7일입니다.");
  };

  // ── CSV 가져오기 ──────────────────────────────────────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);

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
          const lines = dataLines; // 내부 사용을 위해 변수 재할당
          // CSV 필드 파싱 (따옴표 포함 처리)
          const cols: string[] = [];
          let cur = "";
          let inQ = false;
          for (const ch of lines[i]) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
            else { cur += ch; }
          }
          cols.push(cur);

          // 컬럼: 순번, 날짜(KST), 관중수, 시수내역, 메모, 활터명, 위도, 경도
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

          // 날짜 파싱 (YYYY.MM.DD HH:MM → ISO)
          const dateParts = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
          if (!dateParts) continue;
          const isoDate = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}T${dateParts[4]}:${dateParts[5]}:00`;
          if (!isValidDate(isoDate)) continue;

          // 시수내역 파싱 ("O X O X O")
          const shots = shotsStr.split(" ").map((s) => s === "O" ? true : s === "X" ? false : null);
          const hits = parseInt(hitsStr, 10);
          if (isNaN(hits)) continue;

          imported.push({
            id: nanoid(),
            date: isoDate,
            shots,
            hits,
            memo,
            clubName,
            lat: isNaN(lat as number) ? undefined : lat,
            lng: isNaN(lng as number) ? undefined : lng,
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

        // 중복 제거: 날짜+시수내역이 동일한 기록 건너뛰
        setRecords((prev) => {
          const existingKeys = new Set(prev.map((r) => `${r.date}|${r.shots.join(",")}` ));
          const newOnes = imported.filter((r) => !existingKeys.has(`${r.date}|${r.shots.join(",")}`));
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

  // ── 통계 계산 ─────────────────────────────────────────────────────────────
  const computeStats = () => {
    const now = new Date();
    const filtered = records.filter((r) => {
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

  // ── 활터별 통계 계산 ───────────────────────────────────────────────────────
  const computeClubStats = () => {
    // clubName이 있는 기록만 집계 (지오펜싱 매칭된 기록)
    const clubRecords = records.filter((r) => r.clubName && isValidDate(r.date));
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
      const items = [
        { key: "radius_km", value: String(radius / 1000) },
        { key: "notice", value: notice },
        { key: "notice_expiry", value: noticeExpiry },
      ];
      for (const item of items) {
        await supabase.from("app_settings").upsert(
          { key: item.key, value: item.value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }
      setDisplayNotice(notice);
      setDisplayNoticeExpiry(noticeExpiry);
      toast.success("설정이 저장되었습니다");
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
    const header = "name,latitude,longitude";
    const rows = clubs.map((c) => `${c.name},${c.latitude},${c.longitude}`);
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
      const parsed: { name: string; latitude: number; longitude: number }[] = [];
      const errors: string[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 3) { errors.push(`${i + 1}줄: 컴마 3개 미만`); continue; }
        const name = cols[0];
        const lat = parseFloat(cols[1]);
        const lng = parseFloat(cols[2]);
        if (!name) { errors.push(`${i + 1}줄: 이름 비었음`); continue; }
        if (isNaN(lat) || isNaN(lng)) { errors.push(`${i + 1}줄: 좌표 오류`); continue; }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { errors.push(`${i + 1}줄: 좌표 범위 초과`); continue; }
        parsed.push({ name, latitude: lat, longitude: lng });
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
  const dateGroups = groupByDate(records);

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#F5F0E8", fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* 헤더 */}
      <header
        className="sticky top-0 z-50 flex items-center justify-center py-3 px-4 cursor-pointer select-none"
        style={{ background: "#3D5A3E", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        onClick={handleHeaderTap}
      >
        <span className="text-xl font-bold tracking-wide" style={{ color: "#F5F0E8", fontFamily: "'Noto Serif KR', serif" }}>
          🏹 활터 왔소
        </span>
        {adminMode && (
          <span className="ml-3 text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "#8B2635", color: "#fff" }}>
            관리자
          </span>
        )}
      </header>

      {/* 공지사항 배너 */}
      {activeNotice && (
        <div className="px-4 py-2 text-sm text-center font-medium" style={{ background: "#FFF3CD", color: "#856404", borderBottom: "1px solid #FFE08A" }}>
          📢 {activeNotice}
          {displayNoticeExpiry && (
            <span className="ml-2 text-xs opacity-70">({displayNoticeExpiry} 까지)</span>
          )}
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

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ── 성장형 나무 (접이식) ───────────────────────────────────────── */}
        {(() => {
          const allHits = records.reduce((s, r) => s + r.hits, 0);
          const allMollgi = records.filter((r) => r.hits === 5).length;
          // 현재 단계 이모지
          const stageEmoji = allHits >= 500 ? "🌳" : allHits >= 200 ? "🌲" : allHits >= 50 ? "🌿" : "🌱";
          return (
            <div
              className="rounded-2xl shadow-sm overflow-hidden"
              style={{ background: "#fff", border: "1px solid #E8E0D0" }}
            >
              {/* 헤더 토글 버튼 */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span>{stageEmoji}</span>
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
                      className="flex items-center gap-1.5 group"
                      onClick={() => {
                        setTreeNameInput(treeName);
                        setTreeNameEditing(true);
                        setTimeout(() => treeNameInputRef.current?.select(), 50);
                      }}
                      title="나무 이름 편집"
                    >
                      <span className="text-sm font-bold" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>{treeName}</span>
                      <span className="text-xs opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "#3D5A3E" }}>✏️</span>
                    </button>
                  )}
                  {!treeNameEditing && (
                    <span className="text-xs font-normal px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#F0EBE0", color: "#6B7280" }}>
                      {allHits}중 수령
                    </span>
                  )}
                </div>
                <button
                  className="text-lg transition-transform duration-300 flex-shrink-0 ml-2"
                  style={{ transform: treeOpen ? "rotate(180deg)" : "rotate(0deg)", color: "#9CA3AF", background: "transparent" }}
                  onClick={() => setTreeOpen((v) => !v)}
                >
                  ▾
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

        {/* ── 현재 활터: 내 위치 + 가까운 활터 5개 (접이식) ────────────── */}
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: "#fff", border: "1px solid #E8E0D0" }}>
          <button
            className="w-full flex items-center justify-between px-4 py-3 transition-all active:scale-[0.99]"
            style={{ background: "transparent" }}
            onClick={() => setLocationOpen((v) => { const next = !v; localStorage.setItem(LOCATION_OPEN_KEY, String(next)); return next; })}
          >
            <span className="text-base font-bold" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>📍 현재 활터</span>
            <span
              className="text-lg transition-transform duration-300"
              style={{ transform: locationOpen ? "rotate(180deg)" : "rotate(0deg)", color: "#9CA3AF" }}
            >▾</span>
          </button>
          <div style={{ maxHeight: locationOpen ? 600 : 0, overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)" }}>
            <div className="px-4 pb-4">
              {/* 내 위치 */}
              <div className="rounded-xl p-3 mb-3" style={{ background: "#F0EBE0" }}>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium" style={{ color: "#3D5A3E" }}>📱 내 위치</span>
                  <span className="font-mono text-xs" style={{ color: "#374151" }}>
                    {myLat ? `${myLat.toFixed(5)}, ${myLng?.toFixed(5)}` : "GPS 수신 중..."}
                  </span>
                </div>
                {!myLat && (
                  <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>위치 권한을 허용하면 가까운 활터를 자동으로 찾아드립니다.</p>
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
                      const isSelected = c.id === selectedClubId;
                      const dirLabel = bearingLabel(c.bearing);
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedClubId(c.id);
                            localStorage.setItem(LAST_CLUB_KEY, c.name);
                            setStatusOpen(true);
                            localStorage.setItem(STATUS_OPEN_KEY, "true");
                            setTimeout(() => {
                              document.getElementById("section-status")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 120);
                            toast.success(`활터 현황: ${c.name}`);
                          }}
                          className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-all active:scale-[0.98] text-left"
                          style={{
                            background: isSelected ? "#D6EAD6" : inside ? "#EAF2EA" : "#F5F0E8",
                            border: isSelected ? "1.5px solid #2D4A2E" : inside ? "1.5px solid #3D5A3E" : "1px solid #E8E0D0",
                          }}
                        >
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base flex-shrink-0">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🌹"}</span>
                              <span className="text-sm font-medium truncate" style={{ color: "#374151" }}>{c.name}</span>
                              {inside && <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: "#3D5A3E", color: "#fff" }}>활터 내</span>}
                              {isSelected && <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: "#2D4A2E", color: "#fff" }}>선택중</span>}
                            </div>
                            {c.comment && (
                               <span
                                 className="text-xs mt-0.5 ml-7"
                                 title={c.comment}
                                 style={{
                                   color: "#6B7280",
                                   display: "block",
                                   overflow: "hidden",
                                   whiteSpace: "nowrap",
                                   textOverflow: "ellipsis",
                                   maxWidth: "160px",
                                   cursor: "default",
                                 }}
                               >💬 {c.comment}</span>
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
                        </button>
                      );
                    })}
                </div>
              ) : (
                <div className="rounded-xl p-4 text-center" style={{ background: "#F5F0E8" }}>
                  <p className="text-2xl mb-1">🗺️</p>
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>GPS 위치를 수신하면 가까운 활터 5곳을 표시합니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 왔소앱 현황: 활터 선택 + 현황판 (접이식) ───────────────────── */}
        <div id="section-status" className="rounded-2xl shadow-sm" style={{ background: "#fff", border: "1px solid #E8E0D0" }}>
          <button
            className="w-full flex items-center justify-between px-4 py-3 transition-all active:scale-[0.99]"
            style={{ background: "transparent" }}
            onClick={() => setStatusOpen((v) => { const next = !v; localStorage.setItem(STATUS_OPEN_KEY, String(next)); return next; })}
          >
            <span className="text-base font-bold" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>📊 왔소앱 현황</span>
            <span
              className="text-lg transition-transform duration-300"
              style={{ transform: statusOpen ? "rotate(180deg)" : "rotate(0deg)", color: "#9CA3AF" }}
            >▾</span>
          </button>
          <div style={{ maxHeight: statusOpen ? 2000 : 0, overflow: statusOpen && clubDropdownOpen ? "visible" : "hidden", transition: "max-height 0.35s cubic-bezier(0.23,1,0.32,1)" }}>
            <div className="px-4 pb-4">
              {/* 활터 검색 + 선택 */}
              <div className="mb-3 relative" ref={clubSearchRef}>
                <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>활터 선택</label>
                {/* 선택된 활터 표시 및 검색 토글 버튼 */}
                <button
                  onClick={() => {
                    setClubDropdownOpen((v) => !v);
                    setClubSearch("");
                  }}
                  className="w-full flex items-center justify-between border rounded-xl px-3 py-2 text-sm outline-none text-left transition-all"
                  style={{ borderColor: clubDropdownOpen ? "#3D5A3E" : "#D1C9B8", background: "#FDFAF5", color: "#3D5A3E", fontWeight: 600 }}
                >
                  <span className="truncate">{selectedClub?.name ?? "활터 선택"}</span>
                  <span className="ml-2 flex-shrink-0 text-xs" style={{ color: "#9CA3AF" }}>{clubDropdownOpen ? "▴" : "▾"}</span>
                </button>

                {/* 드롭다운 패널 */}
                {clubDropdownOpen && (
                  <div
                    className="absolute left-0 right-0 z-50 rounded-xl shadow-lg overflow-hidden card-enter"
                    style={{ top: "calc(100% + 4px)", background: "#fff", border: "1.5px solid #3D5A3E", maxHeight: 260 }}
                  >
                    {/* 검색 입력란 */}
                    <div className="px-3 pt-2 pb-1 sticky top-0" style={{ background: "#fff", borderBottom: "1px solid #E8E0D0" }}>
                      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "#F5F0E8" }}>
                        <span className="text-sm" style={{ color: "#9CA3AF" }}>🔍</span>
                        <input
                          autoFocus
                          type="text"
                          placeholder="활터 이름 검색..."
                          value={clubSearch}
                          onChange={(e) => setClubSearch(e.target.value)}
                          className="flex-1 bg-transparent text-sm outline-none"
                          style={{ color: "#374151" }}
                        />
                        {clubSearch && (
                          <button onClick={() => setClubSearch("")} className="text-xs" style={{ color: "#9CA3AF" }}>✕</button>
                        )}
                      </div>
                    </div>
                    {/* 활터 목록 */}
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
                        <p className="text-center py-4 text-sm" style={{ color: "#9CA3AF" }}>"{clubSearch}"에 해당하는 활터가 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* 현황판 3분할 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <StatBox label="활터 현재원" value={clubCount} unit="명" color="#8B2635" loading={statsLoading} refreshing={statsRefreshing} />
                <StatBox label="실시간 접속자" value={onlineCount} unit="명" color="#3D5A3E" loading={statsLoading} refreshing={statsRefreshing} />
                <StatBox label="전체 누적" value={totalCount} unit="명" color="#6B7280" loading={statsLoading} refreshing={statsRefreshing} />
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
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                현재원: 반경 {radius}m 이내 · 1시간 이내 &nbsp;·&nbsp; 실시간: 최근 5분 활성 &nbsp;·&nbsp; 누적: 전체 기기 수
              </p>
            </div>
          </div>
        </div>

        {/* ── 시수 기록 ─────────────────────────────────────────────────── */}
        <SectionCard title="🎯 시수 기록">
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
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모를 입력하세요 (예: 바람, 자세 등)"
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none outline-none mb-3"
            style={{ borderColor: "#D1C9B8", background: "#FDFAF5", minHeight: 64 }}
            rows={2}
          />
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium" style={{ color: "#6B7280" }}>
              현재: <strong style={{ color: "#3D5A3E" }}>{shots.filter(Boolean).length}중</strong> / 5시
            </span>
          </div>
          <button
            onClick={saveRecord}
            className="w-full py-4 rounded-2xl text-lg font-bold text-white transition-all duration-150 active:scale-98"
            style={{ background: "#3D5A3E", boxShadow: "0 4px 12px rgba(61,90,62,0.3)" }}
          >
            이번 순 저장
          </button>
        </SectionCard>

        {/* ── 시수 통계 ─────────────────────────────────────────────────── */}
        <SectionCard title="📊 시수 통계">
          <div className="flex gap-1 mb-4 p-1 rounded-xl flex-wrap" style={{ background: "#E8E0D0" }}>
            {(["일별", "주별", "월별", "전체", "활터별"] as const).map((tab) => (
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
            records.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: "#F5F0E8" }}>
                <p className="text-2xl mb-2">🏹</p>
                <p className="text-sm" style={{ color: "#9CA3AF" }}>저장된 시수 기록이 없습니다.</p>
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
                      const cnt = records.filter((r) => r.hits === n).length;
                      const pct = records.length > 0 ? Math.round((cnt / records.length) * 100) : 0;
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
        </SectionCard>

        {/* ── 시수 일지 ─────────────────────────────────────────────────── */}
        {/* ── CSV 백업 알림 배너 ───────────────────────────────────────── */}
        {showBackupBanner && records.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3 flex items-start gap-3 card-enter"
            style={{ background: "#FFF8E1", border: "1.5px solid #F59E0B" }}
          >
            <span className="text-xl flex-shrink-0 mt-0.5">💾</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "#92400E" }}>시수일지 CSV 백업을 권장합니다</p>
              <p className="text-xs mt-0.5" style={{ color: "#B45309" }}>브라우저 캐시 삭제 시 데이터가 사라질 수 있습니다. 주기적으로 CSV로 백업해 두세요.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => exportCSV(true)}
                  className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: "#F59E0B", color: "#fff" }}
                >
                  ⬇️ 지금 백업하기
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

        <SectionCard title="📋 시수 일지">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm" style={{ color: "#6B7280" }}>총 {records.length}순 기록</span>
            <div className="flex gap-1">
              {/* 숨김 file input */}
              <input
                ref={importFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={importCSV}
              />
              <button
                onClick={() => importFileRef.current?.click()}
                title="CSV 불러오기"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base"
                style={{ background: "#E8E0D0", color: "#8B2635" }}
              >
                📂
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                title="전체 기록 초기화"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base"
                style={{ background: "#FEE2E2", color: "#EF4444" }}
              >
                🗑️
              </button>
              <button
                onClick={() => exportCSV()}
                title="CSV 저장"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base"
                style={{ background: "#E8E0D0", color: "#3D5A3E" }}
              >
                📥
              </button>
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #D1C9B8" }}>
                {(["날짜별", "전체"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setJournalView(v)}
                    className="px-3 py-1 text-xs font-medium transition-all"
                    style={{
                      background: journalView === v ? "#3D5A3E" : "#FDFAF5",
                      color: journalView === v ? "#fff" : "#6B7280",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="text-center py-8" style={{ color: "#9CA3AF" }}>
              <p className="text-3xl mb-2">🎯</p>
              <p className="text-sm">아직 기록이 없습니다</p>
            </div>
          ) : journalView === "날짜별" ? (
            <div className="space-y-4">
              {dateGroups.slice(0, visibleDays).map((group) => (
                <div key={group.date} className="rounded-xl overflow-hidden" style={{ border: "1px solid #D1C9B8" }}>
                  {/* 날짜 헤더 */}
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: "#3D5A3E" }}>
                    <span className="text-sm font-bold text-white">{formatDate(group.date + "T00:00:00")}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white opacity-80">{group.totalRounds}순 · {group.totalHits}중</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: group.rate >= 60 ? "#22C55E" : group.rate >= 40 ? "#EAB308" : "#EF4444",
                          color: "#fff",
                        }}
                      >
                        {group.rate}%
                      </span>
                    </div>
                  </div>
                  {/* 순 목록 */}
                  <div className="divide-y" style={{ borderColor: "#E8E0D0" }}>
                    {group.records.map((r) => (
                      <RecordRow key={r.id} record={r} onDelete={deleteRecord} />
                    ))}
                  </div>
                </div>
              ))}
              {/* 더보기 버튼 */}
              {dateGroups.length > visibleDays ? (
                <button
                  onClick={() => setVisibleDays((v) => v + 5)}
                  className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95"
                  style={{ background: "#F5F0E8", color: "#3D5A3E", border: "1px dashed #A89880" }}
                >
                  이전 기록 5일 더보기 ▼ ({dateGroups.length - visibleDays}일 남음)
                </button>
              ) : dateGroups.length > 5 ? (
                <p className="text-center text-xs py-3" style={{ color: "#9CA3AF" }}>마지막 기록입니다</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {[...records].map((r) => (
                <RecordRow key={r.id} record={r} onDelete={deleteRecord} showDate />
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── 관리자 패널 ───────────────────────────────────────────────── */}
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
              <p className="text-xs mb-3" style={{ color: "#9CA3AF" }}>형식: <code className="px-1 rounded" style={{ background: "#F0EBE0" }}>name,latitude,longitude</code> (첫 줄 헤더 선택)</p>
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
                placeholder="공지사항을 입력하세요 (비우면 숨김)"
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
                  저장된 <strong style={{ color: "#EF4444" }}>{records.length}순</strong>의 기록이 모두 삭제됩니다.<br />
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
              <p className="text-xs text-center mb-4 px-2 py-2 rounded-xl" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
                ⚠️ 삭제 전에 CSV 저장으로 백업하는 것을 권장합니다
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
          <p>활터 왔소 — 국궁인을 위한 시수 기록 앱</p>
          <p>© {new Date().getFullYear()} 해현 · 활터 왔소. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#fff", border: "1px solid #E8E0D0" }}>
      {title && (
        <h2 className="text-base font-bold mb-3" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>
          {title}
        </h2>
      )}
      {children}
    </div>
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
    <div className="rounded-xl p-3 text-center relative" style={{ background: "#F5F0E8" }}>
      {/* 갱신 중 회전 점 */}
      {refreshing && (
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full stat-refreshing"
          style={{ background: color, opacity: 0.6 }}
        />
      )}
      <p className="text-xs mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
      {loading ? (
        <span className="stat-skeleton" />
      ) : (
        <p key={animKey} className="text-2xl font-bold stat-fade-in" style={{ color }}>
          {value}
        </p>
      )}
      <p className="text-xs" style={{ color: "#9CA3AF" }}>{unit}</p>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "#F5F0E8", border: highlight ? "2px solid #3D5A3E" : "none" }}>
      <p className="text-xs mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: highlight ? "#3D5A3E" : "#374151" }}>{value}</p>
    </div>
  );
}

function RecordRow({ record, onDelete, showDate }: { record: ShotRecord; onDelete: (id: string) => void; showDate?: boolean }) {
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
        {/* 삭제 버튼 — 오른쪽 끝 */}
        <button
          onClick={() => onDelete(record.id)}
          className="ml-auto text-xs px-2 py-1 rounded-lg shrink-0"
          style={{ background: "#FEE2E2", color: "#EF4444" }}
        >
          삭제
        </button>
      </div>
      {/* 메모 행 — 항상 표시 (내용 있을 때만) */}
      {record.memo && record.memo.trim() !== "" && (
        <div className="flex items-start gap-1 mt-1 pl-1">
          <span style={{ fontSize: 12, lineHeight: 1.4, color: "#6B7280" }}>📝</span>
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
    </div>
  );
}
