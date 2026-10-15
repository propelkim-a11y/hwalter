export const HIGH_CONTRAST_STORAGE_KEY = "hwalter_high_contrast";

export function isHighContrastEnabled(value: string | null): boolean {
  return value === "true";
}
