export type ExpertTargetPositions = number[][][];

export function normalizeExpertTargetPositions(value: unknown): ExpertTargetPositions | undefined {
  if (!Array.isArray(value) || value.length !== 5) return undefined;
  const positions: ExpertTargetPositions = [];

  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 5) return undefined;
    const normalizedRow: number[][] = [];
    for (const cell of row) {
      if (!Array.isArray(cell) || !cell.every((arrow) => Number.isInteger(arrow) && arrow >= 1 && arrow <= 5)) {
        return undefined;
      }
      normalizedRow.push([...cell]);
    }
    positions.push(normalizedRow);
  }

  const arrows = positions.flat(2).sort((a, b) => a - b);
  if (arrows.length !== 5 || arrows.some((arrow, index) => arrow !== index + 1)) return undefined;
  return positions;
}

export function serializeExpertTargetPositions(positions?: number[][][]): string {
  const normalized = normalizeExpertTargetPositions(positions);
  return normalized ? JSON.stringify(normalized) : "";
}

export function parseExpertTargetPositions(value?: string): ExpertTargetPositions | undefined {
  if (!value?.trim()) return undefined;
  try {
    return normalizeExpertTargetPositions(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export function escapeCSVCell(value: string | number | boolean | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function createCSVRow(values: Array<string | number | boolean | null | undefined>): string {
  return values.map(escapeCSVCell).join(",");
}

export function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}
