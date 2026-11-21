export function shouldShowNotice(notice: string, dismissedNotice: string | null): boolean {
  return Boolean(notice) && notice !== dismissedNotice;
}

export function canRestoreDismissedNotice(notice: string, dismissedNotice: string | null): boolean {
  return Boolean(notice) && notice === dismissedNotice;
}
