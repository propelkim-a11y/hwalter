import { useEffect, useRef, useState } from "react";
import type { ReactNode, PointerEvent } from "react";
import type { MainCardId } from "@/lib/mainCardOrder";

const MAIN_CARD_DROP_TARGET_EVENT = "main-card-drop-target";
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

function publishDropTarget(source: MainCardId, target: MainCardId | null) {
  document.dispatchEvent(new CustomEvent(MAIN_CARD_DROP_TARGET_EVENT, { detail: { source, target } }));
}

type SortableMainCardProps = {
  cardId: MainCardId;
  label: string;
  order: number;
  visible: boolean;
  onMove: (source: MainCardId, target: MainCardId) => void;
  children: ReactNode;
};

export function SortableMainCard({ cardId, label, order, visible, onMove, children }: SortableMainCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [touchDragging, setTouchDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pendingTargetRef = useRef<MainCardId | null>(null);
  const suppressClickRef = useRef(false);
  const touchDraggingRef = useRef(false);

  useEffect(() => {
    const cardElement = cardRef.current;
    if (!cardElement) return;
    const preventPageScrollWhileDragging = (event: TouchEvent) => {
      if (touchDraggingRef.current) event.preventDefault();
    };
    cardElement.addEventListener("touchmove", preventPageScrollWhileDragging, { passive: false });
    return () => cardElement.removeEventListener("touchmove", preventPageScrollWhileDragging);
  }, []);

  useEffect(() => {
    const handleDropTarget = (event: Event) => {
      const detail = (event as CustomEvent<{ source: MainCardId; target: MainCardId | null }>).detail;
      setIsDropTarget(detail.target === cardId && detail.source !== cardId);
    };
    document.addEventListener(MAIN_CARD_DROP_TARGET_EVENT, handleDropTarget);
    return () => document.removeEventListener(MAIN_CARD_DROP_TARGET_EVENT, handleDropTarget);
  }, [cardId]);

  if (!visible) return null;

  const getTargetCardId = (x: number, y: number): MainCardId | null => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-main-card-id]");
    return (target?.dataset.mainCardId as MainCardId | undefined) ?? null;
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a, input, textarea, select, label")) return;
    const cardElement = event.currentTarget;
    const pointerId = event.pointerId;
    const dragStart = { x: event.clientX, y: event.clientY };
    pressStartRef.current = dragStart;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      pointerIdRef.current = pointerId;
      dragStartRef.current = dragStart;
      pendingTargetRef.current = null;
      publishDropTarget(cardId, null);
      cardElement.setPointerCapture(pointerId);
      setDragOffset({ x: 0, y: 0 });
      touchDraggingRef.current = true;
      setTouchDragging(true);
    }, 420);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!touchDragging || pointerIdRef.current !== event.pointerId) {
      const pressStart = pressStartRef.current;
      if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > LONG_PRESS_MOVE_TOLERANCE_PX) {
        clearLongPress();
      }
      return;
    }
    event.preventDefault();
    const start = dragStartRef.current;
    if (start) setDragOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
    const target = getTargetCardId(event.clientX, event.clientY);
    const nextTarget = target && target !== cardId ? target : null;
    if (pendingTargetRef.current !== nextTarget) publishDropTarget(cardId, nextTarget);
    pendingTargetRef.current = nextTarget;
  };

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    clearLongPress();
    if (pointerIdRef.current !== event.pointerId) {
      pressStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    event.preventDefault();
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const target = pendingTargetRef.current;
    publishDropTarget(cardId, null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    pressStartRef.current = null;
    touchDraggingRef.current = false;
    dragStartRef.current = null;
    pendingTargetRef.current = null;
    setDragOffset({ x: 0, y: 0 });
    setTouchDragging(false);
    if (target) onMove(cardId, target);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={cardRef}
      data-main-card-id={cardId}
      className={`relative min-w-0 rounded-2xl transition-[transform,opacity,box-shadow] duration-200 ${touchDragging ? "scale-[0.99] opacity-80" : ""} ${isDropTarget ? "ring-2 ring-[#4F7A51] ring-offset-2 ring-offset-[#F5F0E8]" : ""}`}
      style={{
        order,
        transform: touchDragging ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.015)` : undefined,
        zIndex: touchDragging ? 30 : undefined,
        pointerEvents: touchDragging ? "none" : undefined,
        boxShadow: touchDragging ? "0 18px 38px rgba(61,90,62,0.22)" : undefined,
        touchAction: touchDragging ? "none" : "manipulation",
      }}
      title={`${label} 카드 위치 변경 — 길게 눌러 드래그`}
      onDragStart={event => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onClickCapture={handleClickCapture}
      onContextMenu={event => event.preventDefault()}
    >
      {isDropTarget && (
        <div className="pointer-events-none absolute -top-3 left-1/2 z-40 -translate-x-1/2 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm" style={{ background: "#3D5A3E", color: "#fff" }}>
          여기에 놓기
        </div>
      )}
      {isDropTarget && <div aria-hidden="true" className="pointer-events-none absolute inset-1 z-10 rounded-xl bg-[#EAF5E8]/70" />}
      {children}
    </div>
  );
}
