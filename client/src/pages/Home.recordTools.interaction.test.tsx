/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "clubs") {
      return { select: () => ({ order: async () => ({ data: [] }) }) };
    }
    if (table === "app_settings") {
      return { select: async () => ({ data: [] }), upsert: async () => ({ error: null }) };
    }
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

describe("시수 일지 도구 버튼", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.from.mockClear();
    localStorage.setItem("bow_records_v11", JSON.stringify([{
      id: "record-1",
      date: "2026-08-27T09:00:00.000Z",
      shots: [true, false, false, false, false],
      hits: 1,
      memo: "",
    }]));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:csv") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  afterEach(() => cleanup());

  it("불러오기·초기화·저장 버튼은 레이블로 접근 가능하며 기존 화면 동작을 실행한다", async () => {
    const user = userEvent.setup();
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click");
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Home />);

    const importButton = await screen.findByRole("button", { name: "CSV 불러오기" });
    const clearButton = screen.getByRole("button", { name: "전체 기록 초기화" });
    const exportButton = screen.getByRole("button", { name: "CSV 저장" });

    await user.click(importButton);
    expect(inputClick).toHaveBeenCalled();

    await user.click(clearButton);
    expect(screen.getByRole("heading", { name: "전체 기록 삭제" })).toBeTruthy();

    exportButton.focus();
    await user.keyboard("{Enter}");
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(linkClick).toHaveBeenCalled();
  });
});
