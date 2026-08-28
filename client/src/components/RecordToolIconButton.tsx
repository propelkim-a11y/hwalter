import { Download, FileUp, Trash2, type LucideIcon } from "lucide-react";

export type RecordToolIconName = "import" | "delete" | "download";

const RECORD_TOOL_ICON_MAP: Record<RecordToolIconName, LucideIcon> = {
  import: FileUp,
  delete: Trash2,
  download: Download,
};

export function RecordToolIconButton({ icon, label, onClick }: { icon: RecordToolIconName; label: string; onClick: () => void }) {
  const Icon = RECORD_TOOL_ICON_MAP[icon];
  const isDanger = icon === "delete";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-12 shrink-0 place-items-center rounded-lg border transition-all active:scale-95"
      style={isDanger
        ? { background: "#FCF0F0", borderColor: "#F2D0D0", color: "#A64545" }
        : { background: "#F0F6EF", borderColor: "#D5E4D2", color: "#3D5A3E" }}
    >
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
