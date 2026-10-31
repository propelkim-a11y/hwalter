/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    localStorage.setItem("journal_record_tools_open", "false");
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

  it("ZIP·CSV 불러오기와 초기화·저장 도구는 레이블로 접근 가능하며 기존 화면 동작을 실행한다", async () => {
    const user = userEvent.setup();
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click");
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "설정 열기" }));
    await user.click(await screen.findByRole("button", { name: "저장·백업 펼치기" }));
    await user.click(screen.getByRole("button", { name: "활터 메모 목록 열기" }));
    expect(screen.getByRole("heading", { name: "활터 메모 목록" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "활터 메모 목록 닫기" }));
    const importButton = await screen.findByRole("button", { name: "습사 CSV 불러오기" });
    const zipRestoreButton = screen.getByRole("button", { name: "전체 백업 불러오기" });
    const clearButton = screen.getByRole("button", { name: "습사 기록 초기화" });
    const exportButton = screen.getByRole("button", { name: "습사 CSV 저장" });

    await user.click(importButton);
    expect(inputClick).toHaveBeenCalled();

    await user.click(zipRestoreButton);
    expect(inputClick).toHaveBeenCalledTimes(2);

    await user.click(clearButton);
    expect(screen.getByRole("heading", { name: "전체 기록 삭제" })).toBeTruthy();

    exportButton.focus();
    await user.keyboard("{Enter}");
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(linkClick).toHaveBeenCalled();
  });

  it("설정에서 활터별 과녁 방위각을 편집하고 다시 열어도 유지한다", async () => {
    const user = userEvent.setup();
    const view = render(<Home />);

    await user.click(await screen.findByRole("button", { name: "설정 열기" }));
    await user.click(screen.getByRole("button", { name: "활터별 과녁 방위각 펼치기" }));
    const bearingInput = screen.getByRole("spinbutton", { name: "대전 주몽정 과녁 방위각 설정" });
    await user.clear(bearingInput);
    await user.type(bearingInput, "45");

    const savedBearings = JSON.parse(localStorage.getItem("target_bearing_by_club") ?? "{}") as Record<string, string>;
    expect(savedBearings["대전 주몽정"]).toBe("45");

    view.unmount();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "설정 열기" }));
    expect((screen.getByRole("spinbutton", { name: "대전 주몽정 과녁 방위각 설정" }) as HTMLInputElement).value).toBe("45");
  });

  it("개별 습사 기록은 삭제 확인 전에는 유지하고 확인 뒤에만 삭제한다", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "2026.08.27 기록 보기" }));
    await user.click(await screen.findByRole("button", { name: "삭제" }));

    expect(screen.getByRole("heading", { name: "기록 삭제 확인" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("bow_records_v11") ?? "[]")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("heading", { name: "기록 삭제 확인" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("bow_records_v11") ?? "[]")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "삭제" }));
    await user.click(screen.getByRole("button", { name: "기록 삭제" }));

    await waitFor(() => expect(JSON.parse(localStorage.getItem("bow_records_v11") ?? "[]")).toHaveLength(0));
    expect(screen.queryByRole("heading", { name: "기록 삭제 확인" })).toBeNull();
  });
});
