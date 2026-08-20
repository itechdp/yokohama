import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// 6 floors (rows), top = Floor 6, bottom = Floor 1 (Ground). An area has 1
// or 2 stands (columns), configured per warehouse column: X = Front Row,
// Y = Back Row.
const FLOORS = [6, 5, 4, 3, 2, 1] as const;

const ALL_STANDS = [
  {
    id: "X",
    label: "X Row",
    sub: "Front Row",
    headerBg: "bg-blue-100",
    headerText: "text-blue-700",
    cell: "bg-blue-200 text-blue-900 shadow-[0_4px_0_0_#60A5FA]",
    hover: "hover:brightness-105 hover:-translate-y-px hover:shadow-[0_5px_0_0_#60A5FA]",
    active: "active:translate-y-1 active:shadow-[0_1px_0_0_#60A5FA]",
  },
  {
    id: "Y",
    label: "Y Row",
    sub: "Back Row",
    headerBg: "bg-green-100",
    headerText: "text-green-700",
    cell: "bg-green-200 text-green-900 shadow-[0_4px_0_0_#4ADE80]",
    hover: "hover:brightness-105 hover:-translate-y-px hover:shadow-[0_5px_0_0_#4ADE80]",
    active: "active:translate-y-1 active:shadow-[0_1px_0_0_#4ADE80]",
  },
] as const;

// A literal 6-tier storage rack, built as a real CSS grid (6 rows x 3
// columns) with every cell a clickable button. The thick grey frame and the
// gap between cells (which shows the frame's own background through, like a
// shelf beam) plus a colored drop-shadow under each block are what sell the
// "physical rack" feel — no actual 3D transforms, so every button stays
// crisp and exactly tappable.
export default function StandFloorPicker({
  areaCode,
  standCount,
  selectedCode,
  onSelect,
  onClose,
}: {
  areaCode: string;
  standCount: number;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const STANDS = ALL_STANDS.slice(0, standCount);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-4 sm:p-5 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Select stand position</p>
            <h2 className="text-lg font-semibold text-foreground">Area {areaCode}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Column headers */}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${standCount}, 1fr)` }}>
          {STANDS.map((s) => (
            <div key={s.id} className={cn("rounded-lg px-1 py-1.5 text-center", s.headerBg, s.headerText)}>
              <p className="text-xs font-extrabold leading-none">{s.label}</p>
              <p className="text-[9px] leading-tight mt-0.5 opacity-80">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* The rack: thick grey frame, 6 x standCount grid of blocks */}
        <div className="rounded-2xl border-[6px] border-gray-400 bg-gray-400 p-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${standCount}, 1fr)` }}>
            {FLOORS.map((floor) =>
              STANDS.map((s) => {
                const code = `${areaCode}-${s.id}${floor}`;
                const isSelected = selectedCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onSelect(code)}
                    title={code}
                    className={cn(
                      "relative h-12 rounded-md text-sm font-extrabold transition-all duration-150",
                      s.cell,
                      s.hover,
                      s.active,
                      isSelected && "outline outline-2 outline-offset-2 outline-success",
                    )}
                  >
                    {s.id}
                    {floor}
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-success text-[9px] text-white">
                        ✓
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
