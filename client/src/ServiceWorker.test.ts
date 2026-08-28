import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(
  fileURLToPath(new URL("../public/sw.js", import.meta.url)),
  "utf8",
);
const mainSource = readFileSync(
  fileURLToPath(new URL("./main.tsx", import.meta.url)),
  "utf8",
);

describe("서비스 워커", () => {
  it("루트 sw.js 등록 경로에 실제 JavaScript 파일을 제공한다", () => {
    expect(mainSource).toContain('register("/sw.js", { scope: "/" })');
    expect(serviceWorker).toContain('self.addEventListener("install"');
    expect(serviceWorker).toContain('self.addEventListener("activate"');
  });

  it("오프라인 탐색 시 마지막 앱 셸로 돌아갈 수 있도록 처리한다", () => {
    expect(serviceWorker).toContain('const APP_SHELL = ["/", "/manifest.json?v=20260827-samjoko-v2"]');
    expect(serviceWorker).toContain('const CACHE_NAME = "hwalter-isseo-navigation-v3"');
    expect(serviceWorker).toContain('event.request.mode !== "navigate"');
    expect(serviceWorker).toContain('caches.match("/")');
  });

  it("대기 중인 업데이트는 사용자 선택 뒤 활성화하도록 알리고 메시지를 처리한다", () => {
    expect(mainSource).toContain("SERVICE_WORKER_UPDATE_READY_EVENT");
    expect(mainSource).toContain("announceServiceWorkerUpdate(reg)");
    expect(mainSource).not.toContain("newWorker.postMessage({ type: \"SKIP_WAITING\" })");
    expect(serviceWorker).toContain('self.addEventListener("message"');
    expect(serviceWorker).toContain('event.data?.type === "SKIP_WAITING"');
  });
});
