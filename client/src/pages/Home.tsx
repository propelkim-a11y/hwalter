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

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { nanoid } from "nanoid";

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

interface ShotRecord {
  id: string;
  date: string; // ISO string
  shots: (boolean | null)[];
  hits: number;
  memo: string;
  lat?: number;
  lng?: number;
}

interface Club {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getDateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function groupByDate(records: ShotRecord[]): DateGroup[] {
  const map = new Map<string, ShotRecord[]>();
  [...records].reverse().forEach((r) => {
    const key = getDateKey(r.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries()).map(([date, recs]) => {
    const totalHits = recs.reduce((s, r) => s + r.hits, 0);
    const totalShots = recs.length * 5;
    return {
      date,
      records: recs,
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
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });
  const [shots, setShots] = useState<(boolean | null)[]>([null, null, null, null, null]);
  const [memo, setMemo] = useState("");

  // 통계 탭
  const [statTab, setStatTab] = useState<"일별" | "주별" | "월별" | "연별">("일별");

  // 일지 보기 모드
  const [journalView, setJournalView] = useState<"날짜별" | "전체">("날짜별");

  // GPS
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const myLatRef = useRef<number | null>(null);
  const myLngRef = useRef<number | null>(null);

  // 활터 목록
  const [clubs, setClubs] = useState<Club[]>(FALLBACK_CLUBS);
  const [selectedClubId, setSelectedClubId] = useState<number>(FALLBACK_CLUBS[0].id);
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
    if (displayNoticeExpiry) {
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
    const record: ShotRecord = {
      id: nanoid(),
      date: new Date().toISOString(),
      shots: shots as boolean[],
      hits,
      memo,
      lat: myLatRef.current ?? undefined,
      lng: myLngRef.current ?? undefined,
    };
    const updated = [record, ...records];
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShots([null, null, null, null, null]);
    setMemo("");
    toast.success(`저장 완료 — ${hits}중 / 5시`);
  };

  // ── 기록 삭제 ─────────────────────────────────────────────────────────────
  const deleteRecord = (id: string) => {
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success("기록이 삭제되었습니다");
  };

  // ── CSV 내보내기 ──────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (records.length === 0) { toast.error("저장된 기록이 없습니다"); return; }
    const BOM = "\uFEFF";
    const header = "순번,날짜,중수,시수내역,메모,위도,경도\n";
    const rows = [...records].reverse().map((r, i) =>
      `${i + 1},${formatDate(r.date)} ${formatTime(r.date)},${r.hits},"${r.shots.map((s) => (s ? "O" : "X")).join(" ")}","${r.memo}",${r.lat ?? ""},${r.lng ?? ""}`
    ).join("\n");
    const blob = new Blob([BOM + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `활터왔소_시수일지_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 통계 계산 ─────────────────────────────────────────────────────────────
  const computeStats = () => {
    const now = new Date();
    const filtered = records.filter((r) => {
      const d = new Date(r.date);
      if (statTab === "일별") return d.toDateString() === now.toDateString();
      if (statTab === "주별") {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      }
      if (statTab === "월별") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return d.getFullYear() === now.getFullYear();
    });
    const totalRounds = filtered.length;
    const totalHits = filtered.reduce((s, r) => s + r.hits, 0);
    const totalShots = totalRounds * 5;
    const avgHits = totalRounds > 0 ? (totalHits / totalRounds).toFixed(1) : "0.0";
    const best = filtered.reduce((max, r) => Math.max(max, r.hits), 0);
    return { totalRounds, totalHits, totalShots, avgHits, best };
  };
  const stats = computeStats();

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

  // ── 관리자: 현재 위치로 신규 활터 좌표 채우기 ────────────────────────────
  const fillCurrentLocation = () => {
    if (myLatRef.current && myLngRef.current) {
      setNewClubLat(myLatRef.current.toFixed(5));
      setNewClubLng(myLngRef.current.toFixed(5));
    } else {
      toast.error("GPS 위치를 아직 받지 못했습니다");
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

        {/* ── 실시간 현황판 ─────────────────────────────────────────────── */}
        <SectionCard title={`📍 현재 활터 주변 (${radius}m)`}>
          {/* 활터 선택 드롭다운 */}
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>활터 선택</label>
            <select
              id="club-select"
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(Number(e.target.value))}
              className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#D1C9B8", background: "#FDFAF5", color: "#3D5A3E", fontWeight: 600 }}
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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

          {/* 위치 정보 */}
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#F0EBE0" }}>
            <div className="flex justify-between items-center text-sm">
              <span style={{ color: "#6B7280" }}>📱 내 위치</span>
              <span className="font-mono text-xs" style={{ color: "#374151" }}>
                {myLat ? `${myLat.toFixed(5)}, ${myLng?.toFixed(5)}` : "GPS 수신 중..."}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span style={{ color: "#6B7280" }}>🏹 {selectedClub?.name ?? "활터"}</span>
              <span className="font-mono text-xs" style={{ color: "#374151" }}>
                {selectedClub ? `${selectedClub.latitude.toFixed(5)}, ${selectedClub.longitude.toFixed(5)}` : "-"}
              </span>
            </div>
            {distanceLabel && (
              <div className="flex justify-center pt-1">
                <span className="px-4 py-1 rounded-full text-sm font-bold text-white"
                  style={{ background: isInsideRadius ? "#3D5A3E" : "#8B2635" }}>
                  {isInsideRadius ? `✅ 활터 내 (${distanceLabel})` : `활터까지 ${distanceLabel}`}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs mt-2" style={{ color: "#9CA3AF" }}>
            현재원: 반경 {radius}m 이내 · 1시간 이내 &nbsp;·&nbsp; 실시간: 최근 5분 활성 &nbsp;·&nbsp; 누적: 전체 기기 수
          </p>
        </SectionCard>

        {/* ── 시수 기록 ─────────────────────────────────────────────────── */}
        <SectionCard title="🎯 시수 기록 (1순)">
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
          <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "#E8E0D0" }}>
            {(["일별", "주별", "월별", "연별"] as const).map((tab) => (
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
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="총 순수" value={`${stats.totalRounds}순`} />
            <StatCard label="합산 중수" value={`${stats.totalHits}중`} />
            <StatCard label="평균 중수" value={`${stats.avgHits}중`} />
            <StatCard label="최고 기록" value={`${stats.best}중`} highlight={stats.best === 5} />
          </div>
          {stats.totalRounds > 0 && (
            <div className="mt-3 rounded-xl p-3 text-center" style={{ background: "#F0EBE0" }}>
              <span className="text-sm" style={{ color: "#6B7280" }}>적중률 </span>
              <span className="text-2xl font-bold" style={{ color: "#3D5A3E" }}>
                {Math.round((stats.totalHits / stats.totalShots) * 100)}%
              </span>
            </div>
          )}
        </SectionCard>

        {/* ── 시수 일지 ─────────────────────────────────────────────────── */}
        <SectionCard title="📋 시수 일지">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm" style={{ color: "#6B7280" }}>총 {records.length}순 기록</span>
            <div className="flex gap-1">
              <button
                onClick={exportCSV}
                className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{ background: "#E8E0D0", color: "#3D5A3E" }}
              >
                📥 CSV 저장
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
              {dateGroups.map((group) => (
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
              <h4 className="text-sm font-bold mb-2" style={{ color: "#3D5A3E" }}>📋 등록된 활터 목록</h4>
              {clubs.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: "#9CA3AF" }}>등록된 활터가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {clubs.map((club) => (
                    <div
                      key={club.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: "#F5F0E8", border: "1px solid #D1C9B8" }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: "#1F2937" }}>{club.name}</p>
                        <p className="text-xs font-mono" style={{ color: "#6B7280" }}>
                          {club.latitude.toFixed(5)}, {club.longitude.toFixed(5)}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteClub(club.id, club.name)}
                        disabled={deletingClubId === club.id}
                        className="ml-3 px-3 py-1 rounded-lg text-xs font-bold transition-all"
                        style={{
                          background: deletingClubId === club.id ? "#D1C9B8" : "#8B2635",
                          color: "#fff",
                          opacity: deletingClubId === club.id ? 0.6 : 1,
                        }}
                      >
                        {deletingClubId === club.id ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

        <div className="pb-8 text-center text-xs" style={{ color: "#9CA3AF" }}>
          활터 왔소 — 국궁인을 위한 시수 기록 앱
        </div>
      </main>
    </div>
  );
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ background: "#fff", border: "1px solid #E8E0D0" }}>
      <h2 className="text-base font-bold mb-3" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>
        {title}
      </h2>
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
    <div className="flex items-center justify-between px-3 py-2" style={{ background: "#FDFAF5" }}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {showDate && (
          <span className="text-xs shrink-0" style={{ color: "#9CA3AF" }}>
            {new Date(record.date).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
          </span>
        )}
        <span className="text-xs shrink-0" style={{ color: "#9CA3AF" }}>{formatTime(record.date)}</span>
        <div className="flex gap-0.5">
          {record.shots.map((s, i) => (
            <span
              key={i}
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: s ? "#3D5A3E" : "#8B2635", color: "#fff" }}
            >
              {s ? "O" : "X"}
            </span>
          ))}
        </div>
        <span className="text-xs font-bold shrink-0" style={{ color: "#374151" }}>{record.hits}중</span>
        {record.memo && (
          <span className="text-xs truncate" style={{ color: "#9CA3AF" }}>{record.memo}</span>
        )}
      </div>
      <button
        onClick={() => onDelete(record.id)}
        className="ml-2 text-xs px-2 py-1 rounded-lg shrink-0"
        style={{ background: "#FEE2E2", color: "#EF4444" }}
      >
        삭제
      </button>
    </div>
  );
}
