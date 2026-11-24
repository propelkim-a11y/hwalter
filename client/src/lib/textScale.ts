export const TEXT_SCALE_STORAGE_KEY = "hwalter_text_scale";

export const TEXT_SCALE_OPTIONS = [
  { value: "small", label: "작게", percent: 94 },
  { value: "standard", label: "기본", percent: 100 },
  { value: "large", label: "크게", percent: 113 },
  { value: "xlarge", label: "아주 크게", percent: 125 },
] as const;

export type TextScale = (typeof TEXT_SCALE_OPTIONS)[number]["value"];

export function normalizeTextScale(value: string | null): TextScale {
  return TEXT_SCALE_OPTIONS.some((option) => option.value === value)
    ? (value as TextScale)
    : "standard";
}

export function getTextScalePercent(value: TextScale): number {
  return TEXT_SCALE_OPTIONS.find((option) => option.value === value)?.percent ?? 100;
}
