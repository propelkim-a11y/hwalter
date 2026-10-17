import { describe, expect, it } from "vitest";
import { createCSVRow, parseCSVRow, parseExpertTargetPositions, serializeExpertTargetPositions } from "./practiceCsv";

const positions = [
  [[1], [], [], [], []],
  [[], [2], [], [], []],
  [[], [], [3], [], []],
  [[], [], [], [4], []],
  [[], [], [], [], [5]],
];

describe("전문가 과녁 위치 CSV", () => {
  it("5×5 화살 위치를 CSV 필드로 저장하고 다시 같은 형태로 복원한다", () => {
    const row = createCSVRow(["전문가 메모, 쉼표 포함", serializeExpertTargetPositions(positions)]);
    const [memo, storedPositions] = parseCSVRow(row);

    expect(memo).toBe("전문가 메모, 쉼표 포함");
    expect(parseExpertTargetPositions(storedPositions)).toEqual(positions);
  });

  it("전문가 위치가 없거나 5발·5×5 구조가 맞지 않으면 위치 정보를 복원하지 않는다", () => {
    expect(serializeExpertTargetPositions(undefined)).toBe("");
    expect(parseExpertTargetPositions("")).toBeUndefined();
    expect(parseExpertTargetPositions("[[[1]]]" )).toBeUndefined();
    expect(parseExpertTargetPositions(JSON.stringify(Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []))))).toBeUndefined();
  });
});
