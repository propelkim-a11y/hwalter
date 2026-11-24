export interface PracticeSummaryRow {
  label: string;
  clubName?: string;
  hits: number;
  shots: (boolean | null)[];
  weather?: {
    temperatureC: number;
    apparentTemperatureC?: number;
    relativeHumidityPercent: number;
    windSpeedKmh: number;
    precipitationProbabilityPercent?: number;
    windDirectionDegrees?: number;
  };
  isMemoOnly?: boolean;
}

export interface PracticeSummaryCardData {
  title: string;
  periodLabel: string;
  practiceRangeName?: string;
  headerImageUrl?: string;
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

function getWrappedLineCount(context: CanvasRenderingContext2D, text: string, maxWidth: number): number {
  let line = "";
  let lineCount = 1;
  for (const character of Array.from(text)) {
    const next = line + character;
    if (context.measureText(next).width > maxWidth && line) {
      line = character;
      lineCount += 1;
    } else {
      line = next;
    }
  }
  return lineCount;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawContainImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, radius: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.clip();
  context.fillStyle = "#F7F4EE";
  context.fillRect(x, y, width, height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

function getWindArrow(degrees?: number): string {
  if (typeof degrees !== "number") return "";
  return ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][Math.round(degrees / 45) % 8] ?? "";
}

function formatRowWeather(weather: PracticeSummaryRow["weather"]): string {
  if (!weather) return "날씨 -";
  const apparent = typeof weather.apparentTemperatureC === "number" ? `/${weather.apparentTemperatureC.toFixed(0)}°` : "";
  const precipitation = typeof weather.precipitationProbabilityPercent === "number" ? `☔${Math.round(weather.precipitationProbabilityPercent)}%` : "";
  const windDirection = getWindArrow(weather.windDirectionDegrees);
  return [
    `🌡${weather.temperatureC.toFixed(0)}°${apparent}`,
    `💧${Math.round(weather.relativeHumidityPercent)}%`,
    precipitation,
    `💨${weather.windSpeedKmh.toFixed(0)}${windDirection}`,
  ].filter(Boolean).join(" · ");
}

export async function createPracticeSummaryCard(data: PracticeSummaryCardData): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("이미지 카드는 브라우저에서만 만들 수 있습니다.");
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = 2000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 카드를 만들 수 없습니다.");
  const brandMark = await loadImage(data.brandMarkUrl || "/samjoko-brand-mark.png");
  const rate = data.totalRounds > 0 ? Math.round((data.totalHits / (data.totalRounds * 5)) * 100) : 0;
  const customCaption = data.customCaption?.trim();
  const treeName = data.treeName?.trim();
  const headerImage = data.headerImageUrl ? await loadImage(data.headerImageUrl) : null;
  const imageAspectRatio = headerImage && headerImage.naturalHeight > 0
    ? headerImage.naturalWidth / headerImage.naturalHeight
    : 0;
  const imageFrameWidth = headerImage
    ? imageAspectRatio >= 1.45 ? 400 : imageAspectRatio <= 0.8 ? 300 : 360
    : 0;
  const imageFrameHeight = 190;
  const imageX = headerImage ? CARD_WIDTH - 160 - imageFrameWidth : 0;
  const captionWidth = headerImage
    ? Math.min(500, Math.max(390, imageX - 92 - 28))
    : CARD_WIDTH - 184;
  context.font = "600 25px 'Noto Sans KR', sans-serif";
  const captionLines = customCaption
    ? getWrappedLineCount(context, `“${customCaption}”`, captionWidth)
    : 0;
  const summaryBottomPadding = 28;
  const textContentBottom = customCaption
    ? 404 + captionLines * 31 + 18
    : 430;
  const imageContentHeight = headerImage ? imageFrameHeight : 0;
  const summaryHeight = Math.max(
    240,
    textContentBottom + summaryBottomPadding - 260,
    imageContentHeight + 56,
  );
  const summaryCenterY = 260 + summaryHeight / 2;
  const isTwoColumnLayout = data.rows.length > 9;
  const rowsTop = customCaption ? 260 + summaryHeight + 70 : 540;
  const rowsHeight = isTwoColumnLayout ? 900 : (customCaption ? 820 : 800);
  const footerY = rowsTop + rowsHeight + 80;
  canvas.height = Math.max(2000, footerY + 80);

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, CARD_WIDTH, canvas.height);
  context.fillStyle = COLORS.green;
  context.fillRect(0, 0, CARD_WIDTH, 190);
  context.fillStyle = "rgba(255,255,255,0.08)";
  context.beginPath();
  context.arc(930, 58, 138, 0, Math.PI * 2);
  context.fill();
  if (brandMark) {
    context.globalAlpha = 0.94;
    context.drawImage(brandMark, 905, 10, 110, 110);
    context.globalAlpha = 1;
  }
  context.fillStyle = "#FFFFFF";
  context.font = "700 44px 'Noto Serif KR', 'Noto Sans KR', sans-serif";
  context.fillText("활터왔소", 76, 70);
  context.fillStyle = "#FFFFFF";
  context.font = "600 24px 'Noto Sans KR', sans-serif";
  const rangeLabel = data.practiceRangeName?.trim() || "미지정";
  context.fillText(`${rangeLabel}${treeName ? ` · ${treeName}` : ""}`, 80, 128);
  roundedRect(context, 56, 260, CARD_WIDTH - 112, summaryHeight, 28);
  context.fillStyle = COLORS.paper;
  context.fill();
  context.strokeStyle = COLORS.line;
  context.lineWidth = 3;
  context.stroke();
  if (headerImage) {
    const imageY = summaryCenterY - imageFrameHeight / 2;
    drawContainImage(context, headerImage, imageX, imageY, imageFrameWidth, imageFrameHeight, 20);
    context.strokeStyle = COLORS.line;
    context.lineWidth = 3;
    roundedRect(context, imageX, imageY, imageFrameWidth, imageFrameHeight, 20);
    context.stroke();
  }
  context.fillStyle = COLORS.muted;
  context.fillStyle = COLORS.text;
  context.font = "700 42px 'Noto Serif KR', 'Noto Sans KR', sans-serif";
  context.fillText(data.title, 92, 360);
  let statsY = 430;
  if (customCaption) {
    context.fillStyle = COLORS.red;
    context.font = "600 25px 'Noto Sans KR', sans-serif";
    drawWrappedText(context, `“${customCaption}”`, 92, 404, captionWidth, 31, captionLines);
    statsY = 404 + captionLines * 31 + 18;
  }
  context.fillStyle = COLORS.green;
  context.font = "700 31px 'Noto Sans KR', sans-serif";
  context.fillText(`${data.totalRounds}순 · ${data.totalHits}중 · ${rate}%`, 92, statsY);

  roundedRect(context, 56, rowsTop, CARD_WIDTH - 112, rowsHeight, 28);
  context.fillStyle = COLORS.paper;
  context.fill();
  context.strokeStyle = COLORS.line;
  context.stroke();
  context.fillStyle = COLORS.text;
  context.font = "700 30px 'Noto Sans KR', sans-serif";
  const visibleRows = data.rows.slice(0, isTwoColumnLayout ? 18 : 9);
  const columnCount = isTwoColumnLayout ? 2 : 1;
  const rowHeight = 68;
  const itemWidth = isTwoColumnLayout ? (CARD_WIDTH - 190) / 2 : CARD_WIDTH - 160;
  visibleRows.forEach((row, index) => {
    const column = index % columnCount;
    const line = Math.floor(index / columnCount);
    const x = isTwoColumnLayout ? 80 + column * (itemWidth + 30) : 80;
    const y = rowsTop + 96 + line * rowHeight;
    context.fillStyle = index % 2 === 0 ? "#F8F5EF" : COLORS.paper;
    roundedRect(context, x, y, itemWidth, 56, 14);
    context.fill();
    context.fillStyle = COLORS.text;
    context.font = isTwoColumnLayout ? "600 20px 'Noto Sans KR', sans-serif" : "600 23px 'Noto Sans KR', sans-serif";
    context.fillText(row.label, x + 24, y + 28);
    if (row.isMemoOnly) {
      context.fillStyle = COLORS.muted;
      context.font = "700 20px 'Noto Sans KR', sans-serif";
      context.textAlign = "right";
      context.fillText("메모", x + itemWidth - 24, y + 28);
      context.textAlign = "left";
    } else {
      const marks = (row.shots.length === 5 ? row.shots : [null, null, null, null, null]).map((shot) => shot === true ? "O" : shot === false ? "X" : "–");
      context.font = `700 ${isTwoColumnLayout ? 20 : 23}px 'Noto Sans KR', sans-serif`;
      let markX = x + itemWidth - (isTwoColumnLayout ? 150 : 142);
      marks.forEach((mark) => {
        context.fillStyle = mark === "O" ? COLORS.red : COLORS.muted;
        context.fillText(mark, markX, y + 28);
        markX += isTwoColumnLayout ? 24 : 28;
      });
    }
    context.fillStyle = COLORS.muted;
    context.font = isTwoColumnLayout ? "500 15px 'Noto Sans KR', 'Apple Color Emoji', sans-serif" : "500 17px 'Noto Sans KR', 'Apple Color Emoji', sans-serif";
    context.fillText(formatRowWeather(row.weather), x + 24, y + 52);
    context.textAlign = "left";
  });
  if (data.rows.length > visibleRows.length) {
    context.fillStyle = COLORS.muted;
    context.font = "500 21px 'Noto Sans KR', sans-serif";
    context.fillText(`전체 ${data.rows.length}순 중 ${visibleRows.length}순을 표시`, 104, rowsTop + rowsHeight - 28);
  }

  context.fillStyle = COLORS.muted;
  context.font = "500 23px 'Noto Sans KR', sans-serif";
  context.fillText("내 기기에 저장된 습사 기록", 56, footerY);
  context.fillStyle = COLORS.green;
  context.font = "700 25px 'Noto Sans KR', sans-serif";
  context.textAlign = "right";
  context.fillText("활터왔소", CARD_WIDTH - 56, footerY);
  context.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지 카드를 저장할 수 없습니다.")), "image/png");
  });
}
