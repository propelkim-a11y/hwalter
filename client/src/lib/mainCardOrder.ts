export const MAIN_CARD_IDS = ["tree", "location", "status", "record", "stats", "journal", "support"] as const;

export type MainCardId = (typeof MAIN_CARD_IDS)[number];

export const DEFAULT_MAIN_CARD_ORDER: MainCardId[] = [...MAIN_CARD_IDS];
export const MAIN_CARD_LABELS: Record<MainCardId, string> = {
  tree: "나의 나무",
  location: "당근 활터",
  status: "왔소 현황",
  record: "습사 기록",
  stats: "시수 통계",
  journal: "습사 일지",
  support: "기타 안내",
};
export const DEFAULT_MAIN_CARD_VISIBILITY: Record<MainCardId, boolean> = {
  tree: true,
  location: true,
  status: true,
  record: true,
  stats: true,
  journal: true,
  support: true,
};

export function normalizeMainCardOrder(value: unknown): MainCardId[] {
  const saved = Array.isArray(value) ? value.filter((item): item is MainCardId => typeof item === "string" && MAIN_CARD_IDS.includes(item as MainCardId)) : [];
  const uniqueSaved = saved.filter((item, index) => saved.indexOf(item) === index);
  return [...uniqueSaved, ...DEFAULT_MAIN_CARD_ORDER.filter(item => !uniqueSaved.includes(item))];
}

export function moveMainCard(order: MainCardId[], source: MainCardId, target: MainCardId): MainCardId[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = [...order];
  const sourceIndex = next.indexOf(source);
  const targetIndex = next.indexOf(target);
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}

export function normalizeMainCardVisibility(value: unknown): Record<MainCardId, boolean> {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return MAIN_CARD_IDS.reduce<Record<MainCardId, boolean>>((visibility, cardId) => {
    visibility[cardId] = typeof saved[cardId] === "boolean" ? saved[cardId] : true;
    return visibility;
  }, { ...DEFAULT_MAIN_CARD_VISIBILITY });
}
