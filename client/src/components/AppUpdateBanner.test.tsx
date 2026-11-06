/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppUpdateBanner, { SERVICE_WORKER_UPDATE_READY_EVENT } from "./AppUpdateBanner";

const originalServiceWorker = navigator.serviceWorker;

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: originalServiceWorker });
});

describe("AppUpdateBanner", () => {
  it("대기 중인 새 워커가 있으면 업데이트 적용 안내를 표시하고 활성화를 요청한다", async () => {
    const postMessage = vi.fn();
    const registration = { waiting: { postMessage } } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });

    const { getByRole } = render(<AppUpdateBanner />);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(SERVICE_WORKER_UPDATE_READY_EVENT, { detail: { registration } }),
      );
    });

    fireEvent.click(getByRole("button", { name: "새 버전 적용" }));
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(getByRole("button", { name: "적용 중" })).toBeTruthy();
  });

  it("사용자는 업데이트 안내를 나중에 닫을 수 있다", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    const { getByRole, queryByRole } = render(<AppUpdateBanner />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_READY_EVENT));
    });

    fireEvent.click(getByRole("button", { name: "나중에" }));
    await waitFor(() => expect(queryByRole("status")).toBeNull());
  });

  it("서비스 워커를 지원하지 않는 환경에서는 안내를 표시하지 않고 안전하게 렌더링한다", () => {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });

    const { container } = render(<AppUpdateBanner />);
    expect(container).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("대기 워커 이벤트가 오면 모바일 하단에 터치하기 쉬운 업데이트 배너를 표시한다", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    const { getByRole } = render(<AppUpdateBanner />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_READY_EVENT));
    });

    const banner = getByRole("status");
    expect(banner.className).toContain("fixed");
    expect(banner.className).toContain("bottom-3");
    expect(getByRole("button", { name: "새 버전 적용" }).className).toContain("min-h-11");
    expect(getByRole("button", { name: "나중에" }).className).toContain("min-h-11");
    expect(getByRole("button", { name: "업데이트 안내 닫기" })).toBeTruthy();
  });
});
