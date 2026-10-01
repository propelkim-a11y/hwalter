type BrandMarkProps = {
  size?: number;
  className?: string;
};

/** 활의 곡선과 대나무 마디, 작은 낙관을 조합한 활터 왔소 전용 마크. */
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
    />
  );
}
