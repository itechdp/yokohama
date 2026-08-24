import { X } from "lucide-react";
import { STAND_IDS } from "@/data/warehouse-bins";

// Floor count and stand count are both configured per warehouse column, no
// fixed cap on either. Stand A (front) always shows fully; B, C, ... (each
// one further back), when present, sit behind it offset just enough that
// ~80% of each still shows (label readable).
function floorsDescending(floorCount: number): number[] {
  return Array.from({ length: floorCount }, (_, i) => floorCount - i);
}

// Hand-picked, visually distinct colors for the first 8 stands; cycles
// beyond that (stands beyond 8 are still distinguishable by their letter).
const STAND_PALETTE = [
  { front: "#93C5FD", top: "#DBEAFE", side: "#60A5FA", text: "#1E3A8A" }, // blue
  { front: "#86EFAC", top: "#DCFCE7", side: "#4ADE80", text: "#14532D" }, // green
  { front: "#C4B5FD", top: "#EDE9FE", side: "#A78BFA", text: "#4C1D95" }, // purple
  { front: "#FCA5A5", top: "#FEE2E2", side: "#F87171", text: "#7F1D1D" }, // red
  { front: "#FCD34D", top: "#FEF3C7", side: "#FBBF24", text: "#78350F" }, // amber
  { front: "#67E8F9", top: "#CFFAFE", side: "#22D3EE", text: "#164E63" }, // cyan
  { front: "#F9A8D4", top: "#FCE7F3", side: "#F472B6", text: "#831843" }, // pink
  { front: "#BEF264", top: "#ECFCCB", side: "#A3E635", text: "#365314" }, // lime
];

function standsFor(standCount: number) {
  return STAND_IDS.slice(0, standCount).map((id, i) => ({ id, label: `${id} Row`, ...STAND_PALETTE[i % STAND_PALETTE.length] }));
}

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
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;
const MARGIN_RIGHT = 40;

// Origin/view height grow with floor/stand count so the tallest, deepest
// block always has headroom; view width grows with stand count so a wide
// column (many stands) never gets clipped or forces the modal to overflow —
// the SVG renders at its natural pixel size and the wrapper scrolls instead.
function computeGeometry(floorCount: number, standCount: number) {
  const originY = MARGIN_TOP + (standCount - 1) * Math.abs(STAND_STEP_Y) + (floorCount - 1) * FLOOR_STEP_Y + BLOCK_H - DEPTH_DY;
  const viewW = ORIGIN_X + (standCount - 1) * STAND_STEP_X + BLOCK_W + DEPTH_DX + MARGIN_RIGHT;
  return { originY, viewH: originY + MARGIN_BOTTOM, viewW };
}

const floorLabel = (floor: number) =>
  floor === 1 ? "1st Floor (Ground)" : `${floor}${floor === 2 ? "nd" : floor === 3 ? "rd" : "th"} Floor`;

function blockFor(standIndex: number, floor: number, originY: number) {
  const fx = ORIGIN_X + standIndex * STAND_STEP_X;
  const fy = originY + standIndex * STAND_STEP_Y - (floor - 1) * FLOOR_STEP_Y;
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
  floorCount,
  slotCounts,
  selectedCode,
  onSelect,
  onClose,
}: {
  areaCode: string;
  standCount: number;
  floorCount: number;
  // How many tires already sit in each stand+floor slot ("X1", "Y3", ...) of
  // this area — no capacity limit, shown just for info.
  slotCounts: Record<string, number>;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const STANDS = standsFor(standCount);
  const FLOORS = floorsDescending(floorCount);
  const { originY, viewH, viewW } = computeGeometry(floorCount, standCount);
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

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          {STANDS.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.front }} />
              <span style={{ color: s.text }}>{s.label}</span>
            </span>
          ))}
        </div>

        <div className="rounded-xl bg-muted/40 p-2 overflow-x-auto">
          <svg viewBox={`0 0 ${viewW} ${viewH}`} width={viewW} height={viewH} className="max-w-none select-none" role="group" aria-label="Storage stand">
            {/* Floor labels, left of the front (X) column */}
            {FLOORS.map((floor) => {
              const b = blockFor(0, floor, originY);
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
                  const isSelected = selectedCode === code;
                  const b = blockFor(standIndex, floor, originY);
                  return (
                    <g
                      key={code}
                      role="button"
                      tabIndex={0}
                      aria-label={count > 0 ? `${code}: ${count} tire${count === 1 ? "" : "s"}` : code}
                      onClick={() => onSelect(code)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onSelect(code);
                      }}
                      className="transition-transform duration-150 cursor-pointer hover:brightness-105"
                      style={{ transformOrigin: `${b.labelX}px ${b.labelY}px` }}
                    >
                      <title>{count > 0 ? `${code} — ${count} tire${count === 1 ? "" : "s"}` : `${code} — empty`}</title>
                      <polygon points={b.topFace} fill={s.top} stroke="#00000014" />
                      <polygon points={b.sideFace} fill={s.side} stroke="#00000014" />
                      <rect
                        x={b.front.x}
                        y={b.front.y}
                        width={b.front.w}
                        height={b.front.h}
                        rx={3}
                        fill={s.front}
                        stroke={isSelected ? "#16A34A" : "#00000014"}
                        strokeWidth={isSelected ? 3 : 1}
                      />
                      <text
                        x={b.labelX}
                        y={b.labelY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={13}
                        fontWeight={800}
                        fill={s.text}
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
