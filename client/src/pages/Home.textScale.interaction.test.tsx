/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIGH_CONTRAST_STORAGE_KEY } from "@/lib/contrastMode";
import { TEXT_SCALE_STORAGE_KEY } from "@/lib/textScale";

const mocks = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "clubs") return { select: () => ({ order: async () => ({ data: [] }) }) };
    if (table === "app_settings") return { select: async () => ({ data: [] }), upsert: async () => ({ error: null }) };
    return { upsert: async () => ({ error: null }) };
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: async (name: string) => ({ data: name === "get_user_stats" ? { total: 0, online: 0 } : 0, error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("nanoid", () => ({ nanoid: () => "test-session" }));
vi.mock("@/components/GrowingTree", () => ({ GrowingTree: () => <div /> }));
vi.mock("@/components/PastNoticePanel", () => ({ PastNoticePanel: () => null }));
vi.mock("@/components/SortableMainCard", () => ({ SortableMainCard: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Home from "./Home";

describe("설정 글자 크기 선택", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.from.mockClear();
    document.documentElement.style.fontSize = "";
    delete document.documentElement.dataset.hwalterContrast;
  });

  afterEach(() => cleanup());

  it("크게 선택을 저장하고 재진입 후에도 복원하며 기본값으로 되돌릴 수 있다", async () => {
    const user = userEvent.setup();
    const firstView = render(<Home />);

    await user.click(screen.getByRole("button", { name: "설정 열기" }));
    await user.click(screen.getByRole("radio", { name: "글자 크기 크게" }));

    expect(localStorage.getItem(TEXT_SCALE_STORAGE_KEY)).toBe("large");
    expect(document.documentElement.style.fontSize).toBe("113%");
    expect(screen.getByRole("radio", { name: "글자 크기 크게" }).getAttribute("aria-checked")).toBe("true");

    firstView.unmount();
    render(<Home />);
    await user.click(screen.getByRole("button", { name: "설정 열기" }));

    expect(screen.getByRole("radio", { name: "글자 크기 크게" }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: "기본 크기로 되돌리기" }));
    expect(localStorage.getItem(TEXT_SCALE_STORAGE_KEY)).toBe("standard");
    expect(document.documentElement.style.fontSize).toBe("100%");
  });

  it("고대비 모드를 저장하고 재진입 후에도 복원하며 다시 해제할 수 있다", async () => {
    const user = userEvent.setup();
    const firstView = render(<Home />);

    await user.click(screen.getByRole("button", { name: "설정 열기" }));
    const contrastSwitch = screen.getByRole("switch", { name: "고대비 색상 모드" });
    expect(contrastSwitch.getAttribute("aria-checked")).toBe("false");

    await user.click(contrastSwitch);
    expect(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)).toBe("true");
    expect(document.documentElement.dataset.hwalterContrast).toBe("high");
    expect(screen.getByText("고대비 모드 사용 중")).toBeTruthy();
    expect(screen.getByText("켜짐")).toBeTruthy();

    firstView.unmount();
    render(<Home />);
    await user.click(screen.getByRole("button", { name: "설정 열기" }));
    const restoredSwitch = screen.getByRole("switch", { name: "고대비 색상 모드" });
    expect(restoredSwitch.getAttribute("aria-checked")).toBe("true");

    await user.click(restoredSwitch);
    expect(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)).toBe("false");
    expect(document.documentElement.dataset.hwalterContrast).toBe("standard");
    expect(screen.getByText("꺼짐")).toBeTruthy();
  });
});
