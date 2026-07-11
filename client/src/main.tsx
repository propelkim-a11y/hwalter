import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Service Worker 직접 등록 (PWA 오프라인 구동)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] 등록 성공:", reg.scope);
        // 새 버전 감지 시 즉시 활성화
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // 새 버전 설치 완료 — 자동 새로고침
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn("[SW] 등록 실패:", err);
      });

    // SW 업데이트 후 페이지 자동 새로고침
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
