export const MAX_SUPPORT_EVENTS = 5;

export interface SupportEvent {
  id: string;
  title: string;
  content: string;
  date: string;
  locationUrl: string;
  imageUrl: string;
  updatedAt: string;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sortTimestamp(event: SupportEvent): number {
  const value = Date.parse(event.date || event.updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

function hasContent(event: SupportEvent): boolean {
  return Boolean(event.title || event.content || event.date || event.locationUrl || event.imageUrl);
}

/** 안내 날짜가 최신인 순서로 정리하고, 비어 있거나 초과한 항목은 저장하지 않는다. */
export function normalizeSupportEvents(value: unknown): SupportEvent[] {
  if (!Array.isArray(value)) return [];

  const usedIds = new Set<string>();
  const events: SupportEvent[] = [];

  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const fallbackId = `support-event-${index + 1}`;
    const baseId = asText(record.id) || fallbackId;
    const id = usedIds.has(baseId) ? `${fallbackId}-${index + 1}` : baseId;
    usedIds.add(id);

    const event: SupportEvent = {
      id,
      title: asText(record.title),
      content: asText(record.content),
      date: asText(record.date),
      locationUrl: asText(record.locationUrl),
      imageUrl: asText(record.imageUrl),
      updatedAt: asText(record.updatedAt) || "1970-01-01T00:00:00.000Z",
    };
    if (hasContent(event)) events.push(event);
  });

  return events
    .sort((a, b) => sortTimestamp(b) - sortTimestamp(a) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SUPPORT_EVENTS);
}

/** 기존 1건 설정이 있는 설치본을 다건 구조의 첫 안내로 변환한다. */
export function migrateLegacySupportEvent(
  title: string,
  content: string,
  date: string,
  locationUrl: string,
): SupportEvent[] {
  return normalizeSupportEvents([
    { id: "legacy-support-event", title, content, date, locationUrl, updatedAt: "1970-01-01T00:00:00.000Z" },
  ]);
}

export function createSupportEvent(now: string): SupportEvent {
  return { id: `support-event-${now}`, title: "", content: "", date: "", locationUrl: "", imageUrl: "", updatedAt: now };
}

/** 등록 안내가 없을 때도 사용자 카드에 기본 안내 1건이 표시되므로, 실제 표시되는 안내 수를 반환한다. */
export function getVisibleSupportEventCount(events: SupportEvent[]): number {
  return Math.max(events.length, 1);
}
