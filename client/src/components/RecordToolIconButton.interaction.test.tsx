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

    await user.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
