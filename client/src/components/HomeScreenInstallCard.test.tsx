// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_SCREEN_INSTALL_DISMISSED_KEY, HomeScreenInstallCard } from "./HomeScreenInstallCard";

const setNavigatorValue = (key: string, value: unknown) => {
  Object.defineProperty(window.navigator, key, { configurable: true, value });
};

const setStandaloneMode = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  setNavigatorValue("userAgent", "Mozilla/5.0");
  setNavigatorValue("maxTouchPoints", 0);
  setNavigatorValue("standalone", undefined);
  setStandaloneMode(false);
});

describe("HomeScreenInstallCard", () => {
  it("iOS에서는 Safari 공유 메뉴 안내를 설치 CTA로 제공하고 닫기 상태를 저장한다", async () => {
    setNavigatorValue("userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    render(<HomeScreenInstallCard />);

    expect(await screen.findByText("홈 화면에 추가하기")).not.toBeNull();
    expect(screen.getByText("홈 화면에 추가")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "홈 화면에 추가" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "홈 화면 추가 안내 닫기" }));

    expect(localStorage.getItem(HOME_SCREEN_INSTALL_DISMISSED_KEY)).toBe("true");
    expect(screen.queryByText("홈 화면에 추가하기")).toBeNull();
  });

  it("Android 설치 제안이 가능하면 바로 설치 버튼을 제공한다", async () => {
    setNavigatorValue("userAgent", "Mozilla/5.0 (Linux; Android 15)");
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });

    render(<HomeScreenInstallCard />);
    window.dispatchEvent(installEvent);

    const installButton = await screen.findByRole("button", { name: "홈 화면에 추가" });
    fireEvent.click(installButton);

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByText("홈 화면에 추가하기")).toBeNull());
  });

  it("이미 홈 화면에 설치된 상태에서는 안내를 숨긴다", async () => {
    setNavigatorValue("userAgent", "Mozilla/5.0 (Linux; Android 15)");
    setStandaloneMode(true);
    render(<HomeScreenInstallCard />);

    await waitFor(() => expect(screen.queryByText("홈 화면에 추가하기")).toBeNull());
  });
});
