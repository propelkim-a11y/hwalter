import { canRestoreDismissedNotice } from "@/lib/noticePreference";

type PastNoticePanelProps = {
  activeNotice: string;
  dismissedNotice: string | null;
  onRestore: () => void;
  className?: string;
};

export function PastNoticePanel({ activeNotice, dismissedNotice, onRestore, className = "" }: PastNoticePanelProps) {
  const canRestore = canRestoreDismissedNotice(activeNotice, dismissedNotice);

  return (
    <div className={`rounded-xl p-3 ${className}`} style={{ background: "#F5F0E8", border: "1px solid #E8E0D0" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold" style={{ color: "#3D5A3E" }}>🕘 지난 공지 보기</p>
          <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>사용자가 닫은 현재 공지를 다시 확인합니다.</p>
        </div>
        {canRestore && (
          <button
            type="button"
            onClick={onRestore}
            className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-[0.97]"
            style={{ background: "#3D5A3E", color: "#fff" }}
          >
            배너 다시 표시
          </button>
        )}
      </div>
      {dismissedNotice ? (
        <div className="mt-2 rounded-lg px-2.5 py-2 text-sm" style={{ background: "#fff", color: "#374151", border: "1px solid #E8E0D0" }}>
          <span className="font-medium" style={{ color: "#856404" }}>최근 닫은 공지</span>
          <p className="mt-1 whitespace-pre-wrap">{dismissedNotice}</p>
          {!canRestore && (
            <p className="mt-1 text-xs" style={{ color: "#9CA3AF" }}>현재 공지가 변경되어 배너 재표시 대상이 아닙니다.</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs" style={{ color: "#9CA3AF" }}>닫은 공지가 없습니다.</p>
      )}
    </div>
  );
}
