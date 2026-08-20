import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIN_CAPACITY } from "@/data/warehouse-bins";

// 6 floors, top = Floor 6, bottom = Floor 1 (Ground). An area has 1 or 2
// stands (configured per warehouse column) — X (front) always shows fully;
// Y (back), when the area has a second stand, sits behind X offset just
// enough that ~80% of it still shows (label readable).
const FLOORS = [6, 5, 4, 3, 2, 1] as const;

const ALL_STANDS = [
  { id: "X", label: "X Row (Front)", front: "#93C5FD", top: "#DBEAFE", side: "#60A5FA", text: "#1E3A8A" },
  { id: "Y", label: "Y Row (Back)", front: "#86EFAC", top: "#DCFCE7", side: "#4ADE80", text: "#14532D" },
  { id: "Z", label: "Z Row (Rear)", front: "#C4B5FD", top: "#EDE9FE", side: "#A78BFA", text: "#4C1D95" },
] as const;

const BLOCK_W = 74;
const BLOCK_H = 40;
const DEPTH_DX = 16;
const DEPTH_DY = -10;
// Each stand behind the previous one shows exactly 80% of its width, 20%
// hidden. The block in front also casts its own side-face extrusion
// (DEPTH_DX) onto the one behind it, so that extra width has to be added
// back into the offset — otherwise the true hidden portion runs past 20%.
const STAND_STEP_X = Math.round(BLOCK_W * 0.8) + DEPTH_DX;
const STAND_STEP_Y = -16;
const FLOOR_STEP_Y = 48;

const ORIGIN_X = 104;
const ORIGIN_Y = 372;

const VIEW_W = 390;
const VIEW_H = 430;

const floorLabel = (floor: number) =>
  floor === 1 ? "1st Floor (Ground)" : `${floor}${floor === 2 ? "nd" : floor === 3 ? "rd" : "th"} Floor`;

function blockFor(standIndex: number, floor: number) {
  const fx = ORIGIN_X + standIndex * STAND_STEP_X;
  const fy = ORIGIN_Y + standIndex * STAND_STEP_Y - (floor - 1) * FLOOR_STEP_Y;
  const top = fy - BLOCK_H;
  return {
    front: { x: fx, y: top, w: BLOCK_W, h: BLOCK_H },
    topFace: `${fx},${top} ${fx + DEPTH_DX},${top + DEPTH_DY} ${fx + BLOCK_W + DEPTH_DX},${top + DEPTH_DY} ${fx + BLOCK_W},${top}`,
    sideFace: `${fx + BLOCK_W},${top} ${fx + BLOCK_W + DEPTH_DX},${top + DEPTH_DY} ${fx + BLOCK_W + DEPTH_DX},${fy + DEPTH_DY} ${fx + BLOCK_W},${fy}`,
    labelX: fx + BLOCK_W / 2,
    labelY: top + BLOCK_H / 2,
  };
}

export default function StandFloorPickerSvg({
  areaCode,
  standCount,
  slotCounts,
  selectedCode,
  onSelect,
  onClose,
}: {
  areaCode: string;
  standCount: number;
  // How many tires already sit in each stand+floor slot ("X1", "Y3", ...) of
  // this area — a slot at BIN_CAPACITY is full and greyed out, not selectable.
  slotCounts: Record<string, number>;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const STANDS = ALL_STANDS.slice(0, standCount);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-4 sm:p-5 shadow-xl space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Select stand position</p>
            <h2 className="text-lg font-semibold text-foreground">Area {areaCode}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 text-[11px] font-semibold">
          {STANDS.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.front }} />
              <span style={{ color: s.text }}>{s.label}</span>
            </span>
          ))}
        </div>

        <div className="rounded-xl bg-muted/40 p-2">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto select-none" role="group" aria-label="Storage stand">
            {/* Floor labels, left of the front (X) column */}
            {FLOORS.map((floor) => {
              const b = blockFor(0, floor);
              return (
                <text
                  key={`floor-${floor}`}
                  x={ORIGIN_X - 14}
                  y={b.labelY}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={600}
                  fill="#6B7280"
                >
                  {floorLabel(floor)}
                </text>
              );
            })}

            {/* Painted back-to-front (Y, then X, when there's a second
                stand) so X sits fully on top and Y peeks out ~80% behind it. */}
            {STANDS.map((s, standIndex) => ({ s, standIndex }))
              .reverse()
              .map(({ s, standIndex }) =>
                FLOORS.map((floor) => {
                  const shortCode = `${s.id}${floor}`;
                  const code = `${areaCode}-${shortCode}`;
                  const count = slotCounts[shortCode] ?? 0;
                  const isFull = count >= BIN_CAPACITY;
                  const isSelected = selectedCode === code;
                  const b = blockFor(standIndex, floor);
                  return (
                    <g
                      key={code}
                      role="button"
                      tabIndex={isFull ? -1 : 0}
                      aria-label={isFull ? `${code}: full (${count}/${BIN_CAPACITY})` : code}
                      aria-disabled={isFull}
                      onClick={() => !isFull && onSelect(code)}
                      onKeyDown={(e) => {
                        if (!isFull && (e.key === "Enter" || e.key === " ")) onSelect(code);
                      }}
                      className={cn(
                        "transition-transform duration-150",
                        isFull ? "cursor-not-allowed" : "cursor-pointer hover:brightness-105",
                      )}
                      style={{ transformOrigin: `${b.labelX}px ${b.labelY}px` }}
                    >
                      <title>{isFull ? `${code} — full (${count}/${BIN_CAPACITY})` : `${code} — ${count}/${BIN_CAPACITY}`}</title>
                      <polygon points={b.topFace} fill={isFull ? "#E5E7EB" : s.top} stroke="#00000014" />
                      <polygon points={b.sideFace} fill={isFull ? "#D1D5DB" : s.side} stroke="#00000014" />
                      <rect
                        x={b.front.x}
                        y={b.front.y}
                        width={b.front.w}
                        height={b.front.h}
                        rx={3}
                        fill={isFull ? "#F3F4F6" : s.front}
                        stroke={isSelected ? "#16A34A" : "#00000014"}
                        strokeWidth={isSelected ? 3 : 1}
                        opacity={isFull ? 0.7 : 1}
                      />
                      <text
                        x={b.labelX}
                        y={b.labelY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={13}
                        fontWeight={800}
                        fill={isFull ? "#9CA3AF" : s.text}
                      >
                        {s.id}
                        {floor}
                      </text>
                      {isSelected && (
                        <>
                          <circle cx={b.front.x + b.front.w + DEPTH_DX - 2} cy={b.front.y - 2} r={7} fill="#16A34A" />
                          <text
                            x={b.front.x + b.front.w + DEPTH_DX - 2}
                            y={b.front.y - 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={9}
                            fill="white"
                          >
                            ✓
                          </text>
                        </>
                      )}
                    </g>
                  );
                }),
              )}
          </svg>
        </div>
      </div>
    </div>
  );
}
