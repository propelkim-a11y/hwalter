/**
 * OfflineBanner
 * 네트워크 연결이 끊어지면 화면 상단에 부드럽게 슬라이드 인되는 배너.
 * 오프라인 상태에서도 시수 입력은 localStorage 기반으로 정상 작동함을 안내.
 */
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useEffect, useRef, useState } from "react";

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false); // DOM 마운트 여부
  const prevOnline = useRef(true);

  useEffect(() => {
    if (!isOnline && prevOnline.current) {
      // 오프라인 전환 → 배너 표시
      setShow(true);
      requestAnimationFrame(() => setVisible(true));
    } else if (isOnline && !prevOnline.current) {
      // 온라인 복구 → 배너 숨김 (애니메이션 후 DOM 제거)
      setVisible(false);
      const t = setTimeout(() => setShow(false), 400);
      return () => clearTimeout(t);
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  if (!show) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        transform: visible ? "translateY(0)" : "translateY(-110%)",
        transition: "transform 0.35s cubic-bezier(0.23, 1, 0.32, 1)",
        background: "linear-gradient(90deg, #B45309 0%, #D97706 100%)",
        color: "#fff",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
        fontWeight: 600,
        boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
      }}
    >
      <span style={{ fontSize: "16px" }}>📡</span>
      <span style={{ flex: 1 }}>
        오프라인 상태입니다. 시수 입력은 정상 작동하며, 네트워크 복구 후 자동 동기화됩니다.
      </span>
    </div>
  );
}
