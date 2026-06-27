/**
 * SplashScreen — 앱 최초 실행 시 표시되는 스플래시 스크린
 * 디자인: 따뜻한 크림 배경 + 아이콘 scale-up + 앱 이름 fade-in + 자연스러운 fade-out
 */
import { useEffect, useState } from "react";

const ICON_URL = "/manus-storage/icon-512_7c4860e6.png";
const SPLASH_KEY = "splash_shown";

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  // 0: 진입 → 1: 아이콘 등장 → 2: 텍스트 등장 → 3: fade-out 시작 → 4: 완료
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // 단계별 타이밍
    const t1 = setTimeout(() => setPhase(1), 50);   // 아이콘 scale-up 시작
    const t2 = setTimeout(() => setPhase(2), 450);  // 텍스트 fade-in
    const t3 = setTimeout(() => setPhase(3), 1800); // fade-out 시작
    const t4 = setTimeout(() => {
      localStorage.setItem(SPLASH_KEY, "1");
      onDone();
    }, 2400); // 완전히 사라진 후 콜백

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F0E8",
        transition: "opacity 500ms cubic-bezier(0.23, 1, 0.32, 1)",
        opacity: phase === 3 ? 0 : 1,
        pointerEvents: phase === 3 ? "none" : "auto",
      }}
    >
      {/* 아이콘 */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(61,90,62,0.18), 0 4px 12px rgba(0,0,0,0.10)",
          transform: phase >= 1 ? "scale(1)" : "scale(0.72)",
          opacity: phase >= 1 ? 1 : 0,
          transition: "transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 380ms ease-out",
        }}
      >
        <img
          src="/icon-192.png"
          alt="활터 왔소 아이콘"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>

      {/* 앱 이름 */}
      <div
        style={{
          marginTop: 24,
          textAlign: "center",
          opacity: phase >= 2 ? 1 : 0,
          transform: phase >= 2 ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 400ms cubic-bezier(0.23, 1, 0.32, 1), transform 400ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        <p
          style={{
            fontFamily: "'Noto Serif KR', serif",
            fontSize: 26,
            fontWeight: 700,
            color: "#3D5A3E",
            letterSpacing: "0.04em",
            margin: 0,
          }}
        >
          활터 왔소
        </p>
        <p
          style={{
            fontFamily: "'Noto Sans KR', sans-serif",
            fontSize: 13,
            color: "#9CA3AF",
            marginTop: 6,
            letterSpacing: "0.02em",
          }}
        >
          국궁인을 위한 시수 기록 앱
        </p>
      </div>

      {/* 하단 로딩 점 */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          display: "flex",
          gap: 8,
          opacity: phase >= 2 ? 1 : 0,
          transition: "opacity 400ms ease-out 200ms",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#3D5A3E",
              opacity: 0.4,
              animation: `splash-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes splash-dot {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.3; }
          40%            { transform: scale(1.1); opacity: 0.9; }
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-dot { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/** 이번 세션에서 스플래시를 보여줘야 하는지 판단 */
export function shouldShowSplash(): boolean {
  // sessionStorage 기준: 탭을 새로 열 때마다 한 번만 표시
  if (sessionStorage.getItem("splash_done")) return false;
  sessionStorage.setItem("splash_done", "1");
  return true;
}
