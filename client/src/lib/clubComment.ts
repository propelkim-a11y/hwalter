export function getVisibleClubComment(comment?: string | null): string | null {
  const normalized = comment?.trim();
  if (!normalized || normalized === "''" || normalized === '""') return null;
  return normalized;
}
