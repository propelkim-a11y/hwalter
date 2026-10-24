/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordToolIconButton } from "./RecordToolIconButton";

describe("RecordToolIconButton", () => {
  it("접근성 레이블로 식별되며 클릭과 Enter 키로 같은 동작을 실행한다", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RecordToolIconButton icon="download" label="CSV 저장" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "CSV 저장" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("title")).toBe("CSV 저장");
    expect(button.getAttribute("data-record-tool")).toBe("true");
    expect(button.getAttribute("data-danger")).toBe("false");
    expect(button.className).toContain("min-h-[4.5rem]");
    expect(button.className).toContain("flex-col");
    expect(screen.getByText("CSV 저장")).toBeTruthy();
    expect(button.querySelector("[data-record-tool-icon]")).toBeTruthy();

    await user.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("ZIP 복원 도구도 설명 레이블과 클릭 동작을 제공한다", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RecordToolIconButton icon="restore" label="전체 ZIP 복원" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "전체 ZIP 복원" });
    expect(button.getAttribute("title")).toBe("전체 ZIP 복원");
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("전체 기록 초기화 도구는 고대비 경고 색상용 식별자를 제공한다", () => {
    render(<RecordToolIconButton icon="delete" label="전체 기록 초기화" onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "전체 기록 초기화" }).getAttribute("data-danger")).toBe("true");
  });
});
