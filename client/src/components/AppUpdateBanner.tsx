import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

export const SERVICE_WORKER_UPDATE_READY_EVENT = "hwalter-service-worker-update-ready";

type UpdateReadyDetail = {
  registration?: ServiceWorkerRegistration;
};

function getRegistrationFromEvent(event: Event): ServiceWorkerRegistration | null {
  return (event as CustomEvent<UpdateReadyDetail>).detail?.registration ?? null;
}

export default function AppUpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const showUpdate = (event: Event) => {
      setRegistration(getRegistrationFromEvent(event));
      setVisible(true);
    };

    window.addEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, showUpdate);

    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker?.getRegistration) {
      return () => window.removeEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, showUpdate);
    }

    void serviceWorker.getRegistration().then((currentRegistration) => {
      if (currentRegistration?.waiting) {
        showUpdate(
          new CustomEvent<UpdateReadyDetail>(SERVICE_WORKER_UPDATE_READY_EVENT, {
            detail: { registration: currentRegistration },
          }),
        );
      }
    });

    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_READY_EVENT, showUpdate);
  }, []);

  if (!visible) return null;

  const applyUpdate = () => {
    setApplying(true);
    const waitingWorker = registration?.waiting;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  };

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl border p-3 shadow-xl sm:right-4 sm:left-auto"
      style={{ background: "#F7FBF6", borderColor: "#BFD6C2" }}
      role="status"
      aria-live="polite"
      aria-label="새 버전 안내"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "#E1F0E0", color: "#294B31" }}>
          <Download size={19} strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-5" style={{ color: "#294B31" }}>새 버전이 준비되었습니다</p>
          <p className="mt-1 text-sm leading-5" style={{ color: "#435149" }}>한 번 적용하면 최신 기능과 홈 화면 아이콘을 사용할 수 있습니다.</p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={applyUpdate}
              disabled={applying}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-70"
              style={{ background: "#294B31" }}
            >
              <RefreshCw size={15} className={applying ? "animate-spin" : ""} aria-hidden="true" />
              {applying ? "적용 중" : "새 버전 적용"}
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors active:scale-95"
              style={{ color: "#526057", background: "#FFFFFF", border: "1px solid #D8E4D7" }}
            >
              나중에
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-black/5 active:scale-95"
          aria-label="업데이트 안내 닫기"
          style={{ color: "#526057" }}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
