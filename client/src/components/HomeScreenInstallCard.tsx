import { useEffect, useState } from "react";
import { Download, MoreVertical, Share, Smartphone, X } from "lucide-react";

export const HOME_SCREEN_INSTALL_DISMISSED_KEY = "home_screen_install_card_dismissed";

type InstallPlatform = "android" | "ios" | "other";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function getInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function isStandaloneDisplay(matchesStandalone: boolean, iosStandalone?: boolean): boolean {
  return matchesStandalone || iosStandalone === true;
}

export function HomeScreenInstallCard() {
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const mediaMatches = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;

    setPlatform(getInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setIsInstalled(isStandaloneDisplay(mediaMatches, iosStandalone));
    setDismissed(localStorage.getItem(HOME_SCREEN_INSTALL_DISMISSED_KEY) === "true");

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const dismissCard = () => {
    localStorage.setItem(HOME_SCREEN_INSTALL_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  const installApp = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setIsInstalled(true);
  };

  if (platform === "other" || isInstalled || dismissed) return null;

  const canPromptInstall = platform === "android" && installPrompt !== null;

  return (
    <aside
      className="mx-auto mt-3 max-w-2xl rounded-2xl border p-4 shadow-[0_4px_14px_rgba(61,90,62,0.08)]"
      style={{ background: "#EFF6F0", borderColor: "#CFE2D1", color: "#294B31" }}
      aria-labelledby="home-screen-install-title"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl border"
          style={{ background: "#FFFFFF", borderColor: "#CFE2D1", color: "#3D6C45" }}
          aria-hidden="true"
        >
          <Smartphone size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="home-screen-install-title" className="text-base font-bold tracking-[-0.02em]">
            홈 화면에 추가하기
          </h2>
          {platform === "ios" ? (
            // iOS Safari는 웹 앱 설치 프롬프트 API를 제공하지 않으므로 공유 메뉴 안내가 설치 CTA 역할을 합니다.
            <p className="mt-1.5 text-sm leading-5 text-[#4D6651]">
              Safari에서 <span className="inline-flex items-center gap-0.5 font-semibold"><Share size={13} aria-hidden="true" /> 공유</span>를 누른 뒤 <strong>홈 화면에 추가</strong>를 선택하세요.
            </p>
          ) : canPromptInstall ? (
            <p className="mt-1.5 text-sm leading-5 text-[#4D6651]">
              홈 화면에 추가하면 삼족오 아이콘으로 더 빠르게 열 수 있습니다.
            </p>
          ) : (
            <p className="mt-1.5 text-sm leading-5 text-[#4D6651]">
              Chrome 메뉴 <span className="inline-flex align-middle"><MoreVertical size={14} aria-hidden="true" /></span>에서 <strong>홈 화면에 추가</strong>를 선택하세요.
            </p>
          )}
          {canPromptInstall && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
              style={{ background: "#3D6C45" }}
            >
              <Download size={15} aria-hidden="true" />
              홈 화면에 추가
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismissCard}
          className="grid size-8 shrink-0 place-items-center rounded-lg border transition-colors active:scale-95"
          style={{ color: "#4D6651", background: "rgba(255,255,255,0.66)", borderColor: "#CFE2D1" }}
          aria-label="홈 화면 추가 안내 닫기"
          title="닫기"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
