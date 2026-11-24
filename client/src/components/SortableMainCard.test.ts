import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./SortableMainCard.tsx", import.meta.url)),
  "utf8",
);

describe("SortableMainCard", () => {
  it("드래그 점 없이 카드 자체를 길게 눌러 이동할 수 있게 한다", () => {
    expect(source).not.toContain("⠿");
    expect(source).toContain("setTimeout");
    expect(source).toContain("길게 눌러 드래그");
    expect(source).toContain("onDragStart={event => event.preventDefault()}");
    expect(source).not.toContain("draggable");
  });

  it("길게 누른 카드만 떠 보이고 주변 카드는 놓을 때까지 재정렬하지 않는다", () => {
    const pointerMoveStart = source.indexOf("const handlePointerMove");
    const pointerMoveEnd = source.indexOf("const finishPointerDrag", pointerMoveStart);
    const pointerMove = source.slice(pointerMoveStart, pointerMoveEnd);
    const finishDragStart = source.indexOf("const finishPointerDrag");
    const finishDragEnd = source.indexOf("return (", finishDragStart);
    const finishDrag = source.slice(finishDragStart, finishDragEnd);

    expect(source).toContain("pendingTargetRef");
    expect(source).toContain("setDragOffset");
    expect(source).toContain('pointerEvents: touchDragging ? "none" : undefined');
    expect(pointerMove).not.toContain("onMove(");
    expect(finishDrag).toContain("if (target) onMove(cardId, target)");
  });

  it("카드 헤더 버튼에서도 길게 누른 이동을 시작하고, 이동 뒤의 클릭은 한 번 차단한다", () => {
    expect(source).not.toContain('"button, a, input');
    expect(source).not.toContain("event.currentTarget.setPointerCapture(pointerId)");
    expect(source).toContain("cardElement.setPointerCapture(pointerId)");
    expect(source).toContain("suppressClickRef");
    expect(source).toContain("onClickCapture={handleClickCapture}");
    expect(source).toContain("event.stopPropagation()");
    expect(source).toContain("window.setTimeout(() => {");
    expect(source).toContain("suppressClickRef.current = false;");
  });

  it("휴대폰의 미세한 손가락 이동에는 길게 누르기를 유지하고 브라우저 메뉴를 막는다", () => {
    expect(source).toContain("LONG_PRESS_MOVE_TOLERANCE_PX = 12");
    expect(source).toContain("Math.hypot(event.clientX - pressStart.x");
    expect(source).toContain("setPointerCapture(pointerId)");
    expect(source).toContain('touchAction: touchDragging ? "none" : "manipulation"');
    expect(source).toContain("onContextMenu={event => event.preventDefault()}");
    expect(source).toContain('addEventListener("touchmove", preventPageScrollWhileDragging, { passive: false })');
    expect(source).toContain("if (touchDraggingRef.current) event.preventDefault()");
  });

  it("이동 중 놓기 대상 카드를 테두리와 안내 라벨로 강조한다", () => {
    expect(source).toContain("MAIN_CARD_DROP_TARGET_EVENT");
    expect(source).toContain("publishDropTarget(cardId, nextTarget)");
    expect(source).toContain("isDropTarget");
    expect(source).toContain("ring-[#4F7A51]");
    expect(source).toContain("여기에 놓기");
    expect(source).toContain("bg-[#EAF5E8]/70");
  });
});
