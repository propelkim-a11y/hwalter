import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { SERVICE_WORKER_UPDATE_READY_EVENT } from "./components/AppUpdateBanner";

function announceServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  if (!navigator.serviceWorker.controller) return;
  window.dispatchEvent(
    new CustomEvent(SERVICE_WORKER_UPDATE_READY_EVENT, { detail: { registration } }),
  );
}

// Service Worker 직접 등록 (PWA 오프라인 구동)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] 등록 성공:", reg.scope);
        // 새 버전은 사용자가 안내에서 적용할 때까지 현재 버전과 함께 대기한다.
        if (reg.waiting) announceServiceWorkerUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                announceServiceWorkerUpdate(reg);
              }
            });
          }
        });
        void reg.update();
      })
      .catch((err) => {
        console.warn("[SW] 등록 실패:", err);
      });

    // 사용자가 새 버전 적용을 선택해 제어 워커가 바뀔 때만 한 번 새로고침한다.
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
