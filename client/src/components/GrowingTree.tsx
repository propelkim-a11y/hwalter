/**
 * GrowingTree.tsx — 성장형 나무 시스템
 *
 * 디자인 철학: 대나무 숲 자연주의
 * - 크림 배경(#F5F0E8), 대나무 녹색(#3D5A3E), 진홍 강조(#8B2635)
 *
 * 성장 단계 (누적 적중 시수):
 *   0~49   → 🌱 파릇한 새싹
 *   50~199 → 🌿 무럭무럭 묘목
 *   200~499→ 🪵 든든한 소나무
 *   500+   → 🌳 풍성한 신령목
 *
 * 몰기 특수 오브젝트:
 *   10회+  → 🌸 붉은 꽃
 *   30회+  → 🍎 황금 열매
 *   50회+  → 🐦 전설의 파랑새
 *   100회+ → ✨🌈 오로라 + 무지개
 */

import { useMemo } from "react";

interface GrowingTreeProps {
  totalHits: number;   // 누적 적중 시수
  mollgiCount: number; // 누적 몰기 횟수
}

interface TreeStage {
  emoji: string;
  name: string;
  minHits: number;
  maxHits: number | null; // null = 최고 단계
  color: string;
}

const STAGES: TreeStage[] = [
  { emoji: "🌱", name: "파릇한 새싹",   minHits: 0,   maxHits: 49,  color: "#86EFAC" },
  { emoji: "🌿", name: "무럭무럭 묘목", minHits: 50,  maxHits: 199, color: "#4ADE80" },
  { emoji: "🌲", name: "든든한 소나무", minHits: 200, maxHits: 499, color: "#3D5A3E" },
  { emoji: "🌳", name: "풍성한 신령목", minHits: 500, maxHits: null, color: "#166534" },
];

function getStage(hits: number): TreeStage {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (hits >= STAGES[i].minHits) return STAGES[i];
  }
  return STAGES[0];
}

function getProgressToNext(hits: number): { current: number; max: number; pct: number } {
  const stage = getStage(hits);
  if (stage.maxHits === null) {
    // 최고 단계: 500 기준으로 500씩 누적 표시
    const base = Math.floor((hits - 500) / 500) * 500 + 500;
    const next = base + 500;
    return { current: hits - base, max: 500, pct: Math.min(((hits - base) / 500) * 100, 100) };
  }
  const range = stage.maxHits - stage.minHits + 1;
  const progress = hits - stage.minHits;
  return { current: progress, max: range, pct: Math.min((progress / range) * 100, 100) };
}

export function GrowingTree({ totalHits, mollgiCount }: GrowingTreeProps) {
  const stage = useMemo(() => getStage(totalHits), [totalHits]);
  const progress = useMemo(() => getProgressToNext(totalHits), [totalHits]);
  const isMaxStage = stage.maxHits === null;

  // 몰기 특수 오브젝트 해금 여부
  const hasFlower  = mollgiCount >= 10;
  const hasFruit   = mollgiCount >= 30;
  const hasBird    = mollgiCount >= 50;
  const hasAurora  = mollgiCount >= 100;

  // 나무 크기: 단계에 따라 커짐
  const treeSize = stage.minHits === 0 ? "text-7xl" :
                   stage.minHits === 50 ? "text-8xl" :
                   stage.minHits === 200 ? "text-9xl" : "text-[7rem]";

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: hasAurora
          ? "linear-gradient(135deg, #fdf4ff 0%, #f0fdf4 25%, #eff6ff 50%, #fff7ed 75%, #fdf4ff 100%)"
          : "linear-gradient(180deg, #e8f5e9 0%, #F5F0E8 100%)",
        border: hasAurora ? "2px solid transparent" : "1px solid #D1C9B8",
        boxShadow: hasAurora
          ? "0 0 0 2px #a855f7, 0 0 20px rgba(168,85,247,0.3), 0 4px 16px rgba(0,0,0,0.1)"
          : "0 2px 8px rgba(0,0,0,0.06)",
        padding: "1.25rem",
      }}
    >
      {/* 오로라 배경 애니메이션 */}
      {hasAurora && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(45deg, rgba(168,85,247,0.08), rgba(59,130,246,0.08), rgba(16,185,129,0.08), rgba(245,158,11,0.08))",
            animation: "aurora-shift 4s ease-in-out infinite alternate",
          }}
        />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold" style={{ color: "#3D5A3E", fontFamily: "'Noto Serif KR', serif" }}>
            🌲 나의 나무
          </span>
          {hasAurora && <span className="text-xs">✨🌈</span>}
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: stage.color, color: "#fff" }}
        >
          {stage.emoji} {stage.name}
        </span>
      </div>

      {/* 나무 영역 */}
      <div className="relative flex flex-col items-center justify-center py-2 z-10" style={{ minHeight: 120 }}>
        {/* 오로라 글로우 */}
        {hasAurora && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(168,85,247,0.15) 0%, transparent 70%)",
              animation: "aurora-pulse 2s ease-in-out infinite",
            }}
          />
        )}

        {/* 나무 이모지 */}
        <div
          className={`${treeSize} select-none`}
          style={{
            animation: hasAurora ? "tree-float 3s ease-in-out infinite" : "none",
            filter: hasAurora ? "drop-shadow(0 0 12px rgba(168,85,247,0.5))" : "none",
            lineHeight: 1,
          }}
        >
          {stage.emoji}
        </div>

        {/* 몰기 특수 오브젝트 — 나무 주변 배치 */}
        {(hasFlower || hasFruit || hasBird) && (
          <div className="flex items-center gap-2 mt-1">
            {hasFlower && (
              <span
                className="text-2xl"
                style={{ animation: "flower-sway 2.5s ease-in-out infinite" }}
                title="몰기 10회 달성 — 붉은 꽃"
              >
                🌸
              </span>
            )}
            {hasFruit && (
              <span
                className="text-2xl"
                style={{ animation: "flower-sway 2.5s ease-in-out infinite 0.5s" }}
                title="몰기 30회 달성 — 황금 열매"
              >
                🍎
              </span>
            )}
            {hasBird && (
              <span
                className="text-2xl"
                style={{ animation: "bird-hop 1.8s ease-in-out infinite" }}
                title="몰기 50회 달성 — 전설의 파랑새"
              >
                🐦
              </span>
            )}
          </div>
        )}
      </div>

      {/* 경험치 정보 */}
      <div className="relative z-10 mt-2">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium" style={{ color: "#6B7280" }}>
            누적 적중 <strong style={{ color: "#3D5A3E" }}>{totalHits}중</strong>
          </span>
          <span className="text-xs" style={{ color: "#9CA3AF" }}>
            {isMaxStage
              ? `신령목 레벨 ${Math.floor((totalHits - 500) / 500) + 1}`
              : `다음 단계까지 ${progress.max - progress.current}중`}
          </span>
        </div>

        {/* 게이지 바 */}
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 10, background: "#E8E0D0" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress.pct}%`,
              background: hasAurora
                ? "linear-gradient(90deg, #a855f7, #3b82f6, #10b981)"
                : `linear-gradient(90deg, ${stage.color}, ${stage.color}cc)`,
              boxShadow: hasAurora ? "0 0 8px rgba(168,85,247,0.6)" : "none",
            }}
          />
        </div>

        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: "#9CA3AF" }}>{progress.current}중</span>
          <span className="text-xs" style={{ color: "#9CA3AF" }}>{progress.max}중</span>
        </div>
      </div>

      {/* 몰기 카운트 */}
      {mollgiCount > 0 && (
        <div className="relative z-10 mt-2.5 pt-2.5 flex items-center justify-center gap-1.5"
          style={{ borderTop: "1px dashed #D1C9B8" }}>
          <span className="text-xs" style={{ color: "#6B7280" }}>몰기</span>
          <span className="text-sm font-bold" style={{ color: "#8B2635" }}>{mollgiCount}회</span>
          {hasFlower && <span className="text-xs">🌸</span>}
          {hasFruit && <span className="text-xs">🍎</span>}
          {hasBird && <span className="text-xs">🐦</span>}
          {hasAurora && <span className="text-xs">✨</span>}
        </div>
      )}
    </div>
  );
}
