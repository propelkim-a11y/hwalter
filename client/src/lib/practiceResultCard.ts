export interface PracticeSummaryRow {
  label: string;
  clubName?: string;
  hits: number;
  shots: (boolean | null)[];
  isMemoOnly?: boolean;
}

export interface PracticeSummaryCardData {
  title: string;
  periodLabel: string;
  rows: PracticeSummaryRow[];
  totalRounds: number;
  totalHits: number;
  treeName?: string;
  customCaption?: string;
  brandMarkUrl?: string;
}

const CARD_WIDTH = 1080;
const COLORS = {
  background: "#F5F0E8",
  paper: "#FFFDF8",
  green: "#294B31",
  greenSoft: "#E8F0E8",
  text: "#27352C",
  muted: "#6B786F",
  red: "#8B2635",
  line: "#D8E4D4",
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
) {
  const characters = Array.from(text);
  let line = "";
  let lineCount = 0;
  for (const character of characters) {
    const next = line + character;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line, x, y + lineCount * lineHeight);
      line = character;
      lineCount += 1;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (lineCount < maxLines) context.fillText(line, x, y + lineCount * lineHeight);
  return Math.min(lineCount + 1, maxLines);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export async function createPracticeSummaryCard(data: PracticeSummaryCardData): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("이미지 카드는 브라우저에서만 만들 수 있습니다.");
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = 1500;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 카드를 만들 수 없습니다.");
  const brandMark = await loadImage(data.brandMarkUrl || "/samjoko-brand-mark.png");
  const rate = data.totalRounds > 0 ? Math.round((data.totalHits / (data.totalRounds * 5)) * 100) : 0;
  const customCaption = data.customCaption?.trim();

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, CARD_WIDTH, 1500);
  context.fillStyle = COLORS.green;
  context.fillRect(0, 0, CARD_WIDTH, 270);
  context.fillStyle = "rgba(255,255,255,0.08)";
  context.beginPath();
  context.arc(930, 84, 170, 0, Math.PI * 2);
  context.fill();
  if (brandMark) {
    context.globalAlpha = 0.94;
    context.drawImage(brandMark, 890, 26, 132, 132);
    context.globalAlpha = 1;
  }
  context.fillStyle = "#FFFFFF";
  context.font = "700 52px 'Noto Serif KR', 'Noto Sans KR', sans-serif";
  context.fillText("활터왔소", 76, 92);
  context.fillStyle = "#DCE9D9";
  context.font = "500 26px 'Noto Sans KR', sans-serif";
  context.fillText("습사 일지 공유", 80, 143);
  context.font = "600 24px 'Noto Sans KR', sans-serif";
  context.fillText(`나의 나무 · ${data.treeName?.trim() || "나의 나무"}`, 80, 205);
  roundedRect(context, 56, 314, CARD_WIDTH - 112, customCaption ? 270 : 238, 28);
  context.fillStyle = COLORS.paper;
  context.fill();
  context.strokeStyle = COLORS.line;
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = COLORS.muted;
  context.font = "600 25px 'Noto Sans KR', sans-serif";
  context.fillText(data.periodLabel, 92, 372);
  context.fillStyle = COLORS.text;
  context.font = "700 42px 'Noto Serif KR', 'Noto Sans KR', sans-serif";
  context.fillText(data.title, 92, 434);
  let statsY = 500;
  if (customCaption) {
    context.fillStyle = COLORS.red;
    context.font = "600 25px 'Noto Sans KR', sans-serif";
    const captionLines = drawWrappedText(context, `“${customCaption}”`, 92, 480, CARD_WIDTH - 184, 31, 2);
    statsY = 480 + captionLines * 31 + 18;
  }
  context.fillStyle = COLORS.green;
  context.font = "700 31px 'Noto Sans KR', sans-serif";
  context.fillText(`${data.totalRounds}순 · ${data.totalHits}중 · ${rate}%`, 92, statsY);

  const rowsTop = customCaption ? 620 : 590;
  const rowsHeight = customCaption ? 700 : 690;
  roundedRect(context, 56, rowsTop, CARD_WIDTH - 112, rowsHeight, 28);
  context.fillStyle = COLORS.paper;
  context.fill();
  context.strokeStyle = COLORS.line;
  context.stroke();
  context.fillStyle = COLORS.text;
  context.font = "700 30px 'Noto Sans KR', sans-serif";
  context.fillText("포함된 순", 92, rowsTop + 60);
  const visibleRows = data.rows.slice(0, 8);
  visibleRows.forEach((row, index) => {
    const y = rowsTop + 96 + index * 70;
    context.fillStyle = index % 2 === 0 ? "#F8F5EF" : COLORS.paper;
    roundedRect(context, 80, y, CARD_WIDTH - 160, 56, 14);
    context.fill();
    context.fillStyle = COLORS.text;
    context.font = "600 23px 'Noto Sans KR', sans-serif";
    context.fillText(row.label, 104, y + 36);
    context.fillStyle = COLORS.muted;
    context.font = "500 21px 'Noto Sans KR', sans-serif";
    context.fillText(row.clubName || "활터 미지정", 330, y + 36);
    if (row.isMemoOnly) {
      context.fillStyle = COLORS.muted;
      context.font = "700 21px 'Noto Sans KR', sans-serif";
      context.textAlign = "right";
      context.fillText("메모", CARD_WIDTH - 104, y + 36);
      context.textAlign = "left";
    } else {
      const marks = (row.shots.length === 5 ? row.shots : [null, null, null, null, null]).map((shot) => shot === true ? "O" : shot === false ? "X" : "–");
      context.font = "700 23px 'Noto Sans KR', sans-serif";
      let markX = CARD_WIDTH - 246;
      marks.forEach((mark) => {
        context.fillStyle = mark === "O" ? COLORS.red : COLORS.muted;
        context.fillText(mark, markX, y + 36);
        markX += 32;
      });
    }
    context.textAlign = "left";
  });
  if (data.rows.length > visibleRows.length) {
    context.fillStyle = COLORS.muted;
    context.font = "500 21px 'Noto Sans KR', sans-serif";
    context.fillText(`전체 ${data.rows.length}순 중 ${visibleRows.length}순을 표시`, 104, rowsTop + rowsHeight - 28);
  }

  context.fillStyle = COLORS.muted;
  context.font = "500 23px 'Noto Sans KR', sans-serif";
  context.fillText("내 기기에 저장된 습사 기록", 56, 1405);
  context.fillStyle = COLORS.green;
  context.font = "700 25px 'Noto Sans KR', sans-serif";
  context.textAlign = "right";
  context.fillText("활터왔소", CARD_WIDTH - 56, 1405);
  context.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지 카드를 저장할 수 없습니다.")), "image/png");
  });
}
