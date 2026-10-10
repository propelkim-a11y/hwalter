/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRecordMedia, getAllRecordMedia, saveRecordMedia } from "@/lib/recordMediaStore";

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
  beforeEach(async () => {
    localStorage.clear();
    await clearRecordMedia();
    mocks.from.mockClear();
    mocks.settings = [];
    localStorage.setItem("bow_records_v11", JSON.stringify([
      { id: "record-seoul", date: "2026-08-28T01:00:00.000Z", shots: [true, true, true, true, true], hits: 5, memo: "서울 메모", clubName: "서울 황학정" },
      { id: "record-daejeon", date: "2026-08-27T01:00:00.000Z", shots: [true, true, false, false, false], hits: 2, memo: "연습", clubName: "대전 주몽정" },
      { id: "record-unassigned", date: "2026-08-26T01:00:00.000Z", shots: [true, false, false, false, false], hits: 1, memo: "기록", },
    ]));
  });

  afterEach(async () => {
    cleanup();
    await clearRecordMedia();
  });

  it("날짜·활터 탭은 기본 목록만 보이고 선택한 항목의 기록만 펼친다", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const journalTabs = await screen.findByTestId("journal-tabs");
    expect(within(journalTabs).getAllByRole("button").map((button) => button.textContent)).toEqual(["전체", "날짜", "몰기", "활터"]);
    expect(screen.getByTestId("journal-date-list")).toBeTruthy();
    expect(screen.queryByTestId("journal-date-detail")).toBeNull();
    expect(screen.queryByText("서울 메모")).toBeNull();

    await user.click(screen.getByRole("button", { name: "2026.08.28 기록 보기" }));
    expect(screen.getByTestId("journal-date-detail")).toBeTruthy();
    expect(screen.getByText("서울 메모")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "날짜 목록으로" }));
    expect(screen.getByTestId("journal-date-list")).toBeTruthy();
    expect(screen.queryByText("서울 메모")).toBeNull();

    const searchInput = screen.getByRole("searchbox", { name: "습사 일지 검색" });
    await user.type(searchInput, "황학정");
    await user.click(within(journalTabs).getByRole("button", { name: "활터" }));
    expect(screen.getByTestId("journal-club-list")).toBeTruthy();
    expect(screen.queryByTestId("journal-club-detail")).toBeNull();
    expect(screen.getByRole("button", { name: "서울 황학정 기록 보기" })).toBeTruthy();
    expect(screen.queryByText("활터 미지정")).toBeNull();

    await user.click(screen.getByRole("button", { name: "서울 황학정 기록 보기" }));
    expect(screen.getByTestId("journal-club-detail")).toBeTruthy();
    expect(screen.getByText("서울 메모")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "활터 목록으로" }));
    expect(screen.getByTestId("journal-club-list")).toBeTruthy();

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

  it("기록 관리 카드는 기본으로 접혀 있고 선택 상태를 기기에 저장한다", async () => {
    const user = userEvent.setup();
    const firstRender = render(<Home />);
    expect(screen.queryByTestId("journal-record-tools")).toBeNull();
    await user.click(screen.getByRole("button", { name: "설정 열기" }));
    const recordTools = await screen.findByTestId("journal-record-tools");

    expect(within(recordTools).getByRole("button", { name: "기록 관리 펼치기" })).toBeTruthy();
    expect(within(recordTools).queryByRole("button", { name: "전체 ZIP 백업" })).toBeNull();
    expect(within(recordTools).queryByText(/기기 변경 전에는/)).toBeNull();

    await user.click(within(recordTools).getByRole("button", { name: "기록 관리 펼치기" }));
    expect(within(recordTools).getByRole("button", { name: "전체 ZIP 백업" })).toBeTruthy();
    expect(within(recordTools).getByText(/기기 변경 전에는/)).toBeTruthy();
    expect(localStorage.getItem("journal_record_tools_open")).toBe("true");

    firstRender.unmount();
    render(<Home />);
    await user.click(screen.getByRole("button", { name: "설정 열기" }));
    const restoredRecordTools = await screen.findByTestId("journal-record-tools");
    expect(within(restoredRecordTools).getByRole("button", { name: "기록 관리 접기" })).toBeTruthy();
    expect(within(restoredRecordTools).getByRole("button", { name: "전체 ZIP 복원" })).toBeTruthy();
  });

  it("기존 습사 기록에도 사진·동영상·음성을 추가해 기기에 저장한다", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "2026.08.28 기록 보기" }));
    const mediaInput = screen.getByTestId("record-media-input-record-seoul") as HTMLInputElement;
    const photo = new File(["existing-record-photo"], "기존기록.jpg", { type: "image/jpeg" });
    fireEvent.change(mediaInput, { target: { files: [photo] } });

    await waitFor(async () => expect(await getAllRecordMedia()).toHaveLength(1));
    const [stored] = await getAllRecordMedia();
    expect(stored.recordId).toBe("record-seoul");
    expect(stored.name).toBe("기존기록.jpg");
    expect(screen.getByRole("button", { name: /이 기록에 사진, 동영상 또는 음성 첨부 · 현재 1개/ })).toBeTruthy();

    const savedRecords = JSON.parse(localStorage.getItem("bow_records_v11") ?? "[]");
    expect(savedRecords.find((record: { id: string }) => record.id === "record-seoul")?.media).toHaveLength(1);
  });

  it("기존 기록의 첨부 파일은 확인 뒤 선택한 파일만 개별 삭제한다", async () => {
    const [attachment] = await saveRecordMedia("record-seoul", [new File(["remove-only-this"], "삭제할사진.jpg", { type: "image/jpeg" })]);
    const records = JSON.parse(localStorage.getItem("bow_records_v11") ?? "[]");
    records.find((record: { id: string }) => record.id === "record-seoul").media = [attachment];
    localStorage.setItem("bow_records_v11", JSON.stringify(records));

    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "2026.08.28 기록 보기" }));

    await user.click(screen.getByRole("button", { name: "삭제할사진.jpg 첨부 삭제" }));
    const dialog = screen.getByRole("alertdialog", { name: "첨부 파일 삭제" });
    expect(within(dialog).getByText(/삭제할사진\.jpg/)).toBeTruthy();
    expect(await getAllRecordMedia()).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "첨부 삭제" }));
    await waitFor(async () => expect(await getAllRecordMedia()).toHaveLength(0));
    expect(screen.queryByRole("button", { name: "삭제할사진.jpg 첨부 삭제" })).toBeNull();

    const savedRecords = JSON.parse(localStorage.getItem("bow_records_v11") ?? "[]");
    expect(savedRecords.find((record: { id: string }) => record.id === "record-seoul")?.media).toEqual([]);
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
