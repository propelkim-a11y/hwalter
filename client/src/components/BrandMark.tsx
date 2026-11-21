type BrandMarkProps = {
  size?: number;
  className?: string;
};

function isStandalonePwa() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return displayModeStandalone || iosStandalone;
}

function triggerPwaHaptic(pointerType: string) {
  if (pointerType !== "touch" || !isStandalonePwa()) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof navigator.vibrate === "function") navigator.vibrate(12);
}

/** 헤더와 설치 아이콘에 공통으로 사용하는 삼족오 브랜드 마크. */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <img
      src="/samjoko-brand-mark.png"
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ objectFit: "contain" }}
      onPointerDown={(event) => triggerPwaHaptic(event.pointerType)}
    />
  );
}
