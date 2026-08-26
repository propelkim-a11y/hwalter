// @vitest-environment jsdom

import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SortableMainCard } from "./SortableMainCard";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });

const setPointerCapture = vi.fn();
const releasePointerCapture = vi.fn();

describe("SortableMainCard interaction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPointerCapture.mockReset();
    releasePointerCapture.mockReset();
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderCard(onToggle = vi.fn()) {
    render(
      <SortableMainCard cardId="tree" label="나의 나무" order={0} visible onMove={vi.fn()}>
        <button type="button" onClick={onToggle}>카드 열기</button>
      </SortableMainCard>,
    );
    return { onToggle, button: screen.getByRole("button", { name: "카드 열기" }) };
  }

  it("일반 탭은 카드 안의 접기·펼치기 버튼까지 그대로 전달한다", () => {
    const { button, onToggle } = renderCard();

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("길게 누른 뒤의 클릭만 막고, 다음 일반 탭은 다시 버튼에 전달한다", () => {
    const { button, onToggle } = renderCard();

    fireEvent.pointerDown(button, { pointerId: 1, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(420));
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();

    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
