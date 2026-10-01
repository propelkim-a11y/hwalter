/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: [] as Array<{ key: string; value: string }>,
  from: vi.fn((table: string) => {
    if (table === "clubs") return { select: () => ({ order: async () => ({ data: [] }) }) };
    if (table === "app_settings") return { select: async () => ({ data: mocks.settings }), upsert: async () => ({ error: null }) };
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

describe("습사 일지 탭", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.from.mockClear();
    mocks.settings = [];
    localStorage.setItem("bow_records_v11", JSON.stringify([
      { id: "record-seoul", date: "2026-08-28T01:00:00.000Z", shots: [true, true, true, true, true], hits: 5, memo: "몰기", clubName: "서울 황학정" },
      { id: "record-daejeon", date: "2026-08-27T01:00:00.000Z", shots: [true, true, false, false, false], hits: 2, memo: "연습", clubName: "대전 주몽정" },
      { id: "record-unassigned", date: "2026-08-26T01:00:00.000Z", shots: [true, false, false, false, false], hits: 1, memo: "기록", },
    ]));
  });

  afterEach(() => cleanup());

  it("전체·날짜·몰기·활터 순서로 탭을 제공하고 활터별 기록을 표시한다", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const journalTabs = await screen.findByTestId("journal-tabs");
    expect(within(journalTabs).getAllByRole("button").map((button) => button.textContent)).toEqual(["전체", "날짜", "몰기", "활터"]);

    const searchInput = screen.getByRole("searchbox", { name: "습사 일지 검색" });
    await user.type(searchInput, "황학정");
    await user.click(within(journalTabs).getByRole("button", { name: "활터" }));
    expect(screen.getByText("서울 황학정")).toBeTruthy();
    expect(screen.queryByText("활터 미지정")).toBeNull();

    await user.click(screen.getByRole("button", { name: "일지 검색어 지우기" }));
    expect((searchInput as HTMLInputElement).value).toBe("");
    expect(screen.getByText("활터 미지정")).toBeTruthy();

    await user.click(within(journalTabs).getByRole("button", { name: "몰기" }));
    expect(screen.getByText("전체 몰기")).toBeTruthy();

    await user.click(within(journalTabs).getByRole("button", { name: "날짜" }));
    expect(screen.getByText("2026.08.28")).toBeTruthy();

    const startDateInput = screen.getByLabelText("습사 일지 시작일") as HTMLInputElement;
    const endDateInput = screen.getByLabelText("습사 일지 종료일") as HTMLInputElement;
    fireEvent.change(startDateInput, { target: { value: "2026-08-27" } });
    fireEvent.change(endDateInput, { target: { value: "2026-08-27" } });
    expect(startDateInput.value).toBe("2026-08-27");
    expect(endDateInput.value).toBe("2026-08-27");
    expect(screen.queryByText("2026.08.28")).toBeNull();
    expect(screen.getByText("2026.08.27")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "검색·기간 조건 지우기" }));
    expect(startDateInput.value).toBe("");
    expect(endDateInput.value).toBe("");
    expect(screen.getByText("2026.08.28")).toBeTruthy();
  });

  it("기타 안내 카드가 접히면 실제 표시 중인 안내 수를 보여준다", async () => {
    localStorage.setItem("support_event_card_open", "false");
    mocks.settings = [
      {
        key: "support_events",
        value: JSON.stringify([
          { id: "support-1", title: "첫 안내", content: "내용", date: "2026-08-28", locationUrl: "", imageUrl: "" },
          { id: "support-2", title: "둘째 안내", content: "내용", date: "2026-08-27", locationUrl: "", imageUrl: "" },
        ]),
      },
    ];

    render(<Home />);

    const supportHeader = await screen.findByRole("button", { name: "기타 안내 펼치기" });
    await waitFor(() => expect(supportHeader.textContent).toContain("2건"));
  });

  it("등록 안내가 없고 기본 안내만 표시될 때도 접힌 기타 안내 카드에 1건을 보여준다", async () => {
    localStorage.setItem("support_event_card_open", "false");
    render(<Home />);

    const supportHeader = await screen.findByRole("button", { name: "기타 안내 펼치기" });
    expect(supportHeader.textContent).toContain("1건");
  });

  it("단일 기타 안내가 저장된 상태에서 접힌 카드 헤더에 1건을 보여준다", async () => {
    localStorage.setItem("support_event_card_open", "false");
    mocks.settings = [
      {
        key: "support_events",
        value: JSON.stringify([
          { id: "support-1", title: "정기 습사 안내", content: "내용", date: "2026-08-28", locationUrl: "", imageUrl: "" },
        ]),
      },
    ];

    render(<Home />);

    const supportHeader = await screen.findByRole("button", { name: "기타 안내 펼치기" });
    await waitFor(() => expect(supportHeader.textContent).toContain("1건"));
  });
});
