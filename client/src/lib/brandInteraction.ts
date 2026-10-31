export function isBrandActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

export function restartBrandPulse(
  setActive: (active: boolean) => void,
  requestFrame: (callback: () => void) => number,
): void {
  setActive(false);
  requestFrame(() => setActive(true));
}
