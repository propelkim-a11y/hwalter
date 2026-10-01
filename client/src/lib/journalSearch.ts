export type JournalSearchRecord = {
  date: string;
  memo?: string;
  clubName?: string;
};

export type JournalDateRange = {
  startDate?: string;
  endDate?: string;
};

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function filterJournalRecords<T extends JournalSearchRecord>(records: T[], query: string, dateRange: JournalDateRange = {}): T[] {
  const normalizedQuery = normalizeSearchText(query);

  return records.filter((record) => {
    const day = record.date.slice(0, 10);
    if (dateRange.startDate && day < dateRange.startDate) return false;
    if (dateRange.endDate && day > dateRange.endDate) return false;
    if (!normalizedQuery) return true;
    const searchableText = [
      record.memo ?? "",
      record.clubName ?? "",
      record.date,
      day,
      day.replaceAll("-", "."),
    ].join(" ");
    return normalizeSearchText(searchableText).includes(normalizedQuery);
  });
}
