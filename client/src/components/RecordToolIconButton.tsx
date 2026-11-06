import { Archive, ArchiveRestore, Download, FileUp, Trash2, type LucideIcon } from "lucide-react";

export type RecordToolIconName = "import" | "delete" | "download" | "backup" | "restore";

const RECORD_TOOL_ICON_MAP: Record<RecordToolIconName, LucideIcon> = {
  import: FileUp,
  delete: Trash2,
  download: Download,
  backup: Archive,
  restore: ArchiveRestore,
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
      data-record-tool
      data-danger={isDanger}
      className="flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-all active:scale-[0.97]"
      style={isDanger
        ? { background: "#FCF0F0", borderColor: "#F2D0D0", color: "#A64545" }
        : { background: "#F0F6EF", borderColor: "#D5E4D2", color: "#3D5A3E" }}
    >
      <span data-record-tool-icon className="grid size-8 place-items-center rounded-lg" style={isDanger ? { background: "#F9E2E2" } : { background: "#fff" }}>
        <Icon size={19} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="text-[11px] font-bold leading-tight">{label}</span>
    </button>
  );
}
