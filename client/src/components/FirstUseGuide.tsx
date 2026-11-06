import { useEffect, useState } from "react";
import { HelpCircle, MapPin, NotebookPen, Save, Target, X } from "lucide-react";

const GUIDE_SEEN_KEY = "hwalter_first_use_guide_seen";

type GuideStep = {
  icon: typeof MapPin;
  title: string;
  description: string;
};

const GUIDE_STEPS: GuideStep[] = [
  { icon: MapPin, title: "활터를 먼저 선택하세요", description: "당근 활터에서 검색하거나 가까운 활터를 선택하면 방문 기록에 활터명이 함께 저장됩니다." },
  { icon: Target, title: "습사를 기록하세요", description: "습사 기록에서 5시를 입력하고 저장하세요. 시수 없이 메모·사진만 남기는 기록도 가능합니다." },
  { icon: NotebookPen, title: "통계와 일지를 확인하세요", description: "시수 통계에서는 관중 흐름을, 습사 일지에서는 날짜·활터별 기록과 메모를 확인할 수 있습니다." },
  { icon: Save, title: "저장은 자동입니다", description: "기록은 이 기기에 자동 저장됩니다. 기기를 바꿀 때는 설정의 저장·백업에서 전체 백업을 저장하세요." },
];

export function FirstUseGuide() {
  const [open, setOpen] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    setFirstVisit(localStorage.getItem(GUIDE_SEEN_KEY) !== "true");
  }, []);

  const openGuide = () => {
    setOpen(true);
    setFirstVisit(false);
    localStorage.setItem(GUIDE_SEEN_KEY, "true");
  };

  const closeGuide = () => {
    setOpen(false);
    setFirstVisit(false);
    localStorage.setItem(GUIDE_SEEN_KEY, "true");
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={openGuide}
        title="처음 사용 안내"
        aria-label="처음 사용 안내 열기"
        className="ml-auto flex w-fit min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95"
        style={{ background: "#F0F6EF", color: "#3D5A3E", border: "1px solid #D5E4D2" }}
      >
        <HelpCircle size={15} aria-hidden="true" />
        처음 사용 안내
      </button>

      {firstVisit && !open && (
        <div className="mt-3 rounded-xl p-3" style={{ background: "#EEF6EA", border: "1px solid #C8D8C8" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold" style={{ color: "#315232" }}>처음 오셨나요?</p>
              <p className="mt-1 text-xs leading-5" style={{ color: "#526057" }}>활터 선택부터 기록·백업까지 1분 안에 알아보세요.</p>
            </div>
            <button type="button" onClick={closeGuide} aria-label="처음 사용 안내 닫기" className="size-7 rounded-md text-base" style={{ color: "#526057" }}>×</button>
          </div>
          <button type="button" onClick={openGuide} className="mt-2.5 min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition-all active:scale-95" style={{ background: "#3D5A3E", color: "#FFFFFF" }}>간편 가이드 보기</button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 sm:items-center" style={{ background: "rgba(26, 38, 29, 0.48)" }} role="presentation" onClick={closeGuide}>
          <section role="dialog" aria-modal="true" aria-labelledby="first-use-guide-title" className="my-4 w-full max-w-md overflow-hidden rounded-2xl shadow-2xl" style={{ background: "#F7F2E9" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4" style={{ background: "#315232", color: "#FFFFFF" }}>
              <div>
                <p className="text-[11px] font-semibold opacity-80">활터에 있소</p>
                <h2 id="first-use-guide-title" className="mt-1 text-lg font-bold">처음 사용 간편 가이드</h2>
                <p className="mt-1 text-xs leading-5 opacity-85">필요한 것만 순서대로 따라 해보세요.</p>
              </div>
              <button type="button" onClick={closeGuide} aria-label="간편 가이드 닫기" className="grid size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-white/10 active:scale-95"><X size={18} /></button>
            </div>
            <div className="space-y-2.5 p-4">
              {GUIDE_STEPS.map(({ icon: Icon, title, description }, index) => (
                <div key={title} className="flex items-start gap-3 rounded-xl p-3" style={{ background: "#FFFFFF", border: "1px solid #E8E0D0" }}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: "#EAF5E8", color: "#3D5A3E" }}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold" style={{ color: "#315232" }}>{index + 1}. {title}</p>
                    <p className="mt-1 text-xs leading-5" style={{ color: "#526057" }}>{description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <p className="text-[11px] leading-4" style={{ color: "#89958D" }}>나중에도 상단의 ‘처음 사용 안내’에서 다시 볼 수 있습니다.</p>
              <button type="button" onClick={closeGuide} className="min-h-9 shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all active:scale-95" style={{ background: "#3D5A3E", color: "#FFFFFF" }}>확인했어요</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
