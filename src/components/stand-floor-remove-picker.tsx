import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FLOORS = [6, 5, 4, 3, 2, 1] as const;

const ALL_STANDS = [
  { id: "X", label: "X Row (Front)", occupied: "#93C5FD", top: "#DBEAFE", side: "#60A5FA", text: "#1E3A8A" },
  { id: "Y", label: "Y Row (Back)", occupied: "#86EFAC", top: "#DCFCE7", side: "#4ADE80", text: "#14532D" },
  { id: "Z", label: "Z Row (Rear)", occupied: "#C4B5FD", top: "#EDE9FE", side: "#A78BFA", text: "#4C1D95" },
] as const;

// Used instead of the X/Y row colors once a tire type is selected in step 1 —
// bins get colored by whether they hold that type, not by which row they're in.
const OTHER_TYPE_STYLE = { occupied: "#93C5FD", top: "#DBEAFE", side: "#60A5FA", text: "#1E3A8A" };
const SELECTED_TYPE_STYLE = { occupied: "#F87171", top: "#FECACA", side: "#EF4444", text: "#7F1D1D" };

const BLOCK_W = 74;
const BLOCK_H = 40;
const DEPTH_DX = 16;
const DEPTH_DY = -10;
// 80% of each stand behind the previous one stays visible, 20% hidden
// (see stand-floor-picker-svg.tsx for the full derivation).
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

export interface Occupant {
  tireId: string;
  model: string;
  serialNumber: string;
  // The tire's actual stored bin code — normally "<areaCode>-<shortCode>",
  // but for a tire still sitting under a pre-split address it's the
  // pre-split code instead. Always toggle/select using this, never a
  // reconstructed "<areaCode>-<shortCode>", or the toggle silently no-ops.
  code: string;
  // How many tires actually sit in this bin — a slot can hold up to
  // BIN_CAPACITY, so this can be >1 even though only one tire's info is shown.
  count: number;
}

// Outward's version of the stand/floor picker: unlike Inward's (which lets
// you pick ANY position to place into), this only lets you pick stand+floor
// slots that actually have a tire in them right now — tapping one toggles
// it into the removal list, so X1 can be pulled while X2, Y1, etc. stay
// exactly as they are. Multi-select within one area, closed explicitly via
// Done, since you may want to remove several tires from the same area.
export default function StandFloorRemovePicker({
  areaCode,
  standCount,
  occupants,
  legacyOccupant,
  selectedCodes,
  selectedModels,
  onToggle,
  onDone,
}: {
  areaCode: string;
  standCount: number;
  occupants: Record<string, Occupant | undefined>;
  // A tire placed before stand/floor tracking existed — its location is the
  // bare area code with no stand+floor suffix, so it can't slot into the
  // grid below. Shown as its own removable row instead.
  legacyOccupant?: Occupant;
  selectedCodes: Set<string>;
  // Tire type(s) picked in step 1, if any — when set, bins are colored by
  // whether they hold a selected type (red) or not (blue) instead of by row.
  selectedModels?: Set<string>;
  onToggle: (code: string) => void;
  onDone: () => void;
}) {
  const STANDS = ALL_STANDS.slice(0, standCount);
  const hasTypeSelection = !!selectedModels && selectedModels.size > 0;
  const selectedHere = STANDS.flatMap((s) => FLOORS.map((f) => `${s.id}${f}`)).filter((c) => {
    const occ = occupants[c];
    return occ && selectedCodes.has(occ.code);
  });
  const legacySelected = !!legacyOccupant && selectedCodes.has(legacyOccupant.code);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-4 sm:p-5 shadow-xl space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tap occupied slots to pick for outward</p>
            <h2 className="text-lg font-semibold text-foreground">Area {areaCode}</h2>
          </div>
          <button type="button" onClick={onDone} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {legacyOccupant && (
          <button
            type="button"
            onClick={() => onToggle(legacyOccupant.code)}
            className={cn(
              "w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
              legacySelected ? "border-success bg-success/10" : "border-border bg-muted hover:bg-muted/70",
            )}
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{legacyOccupant.model}</p>
              <p className="text-xs text-muted-foreground truncate">
                {legacyOccupant.serialNumber} · placed before stand/floor tracking
              </p>
            </div>
            {legacySelected && (
              <span className="shrink-0 flex size-5 items-center justify-center rounded-full bg-success text-[10px] text-white">✓</span>
            )}
          </button>
        )}

        {hasTypeSelection ? (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded bg-info/70 inline-block" /> Other tires
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded bg-danger/70 inline-block" /> Selected type here
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 text-[11px] font-semibold">
            {STANDS.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.occupied }} />
                <span style={{ color: s.text }}>{s.label}</span>
              </span>
            ))}
          </div>
        )}

        <div className="rounded-xl bg-muted/40 p-2">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto select-none" role="group" aria-label="Storage stand">
            {FLOORS.map((floor) => {
              const b = blockFor(0, floor);
              return (
                <text key={`floor-${floor}`} x={ORIGIN_X - 14} y={b.labelY} textAnchor="end" dominantBaseline="central" fontSize={12} fontWeight={600} fill="#6B7280">
                  {floorLabel(floor)}
                </text>
              );
            })}

            {STANDS.map((s, standIndex) => ({ s, standIndex }))
              .reverse()
              .map(({ s, standIndex }) =>
                FLOORS.map((floor) => {
                  const shortCode = `${s.id}${floor}`;
                  const displayCode = `${areaCode}-${shortCode}`;
                  const occupant = occupants[shortCode];
                  const isOccupied = !!occupant;
                  const isSelected = isOccupied && selectedCodes.has(occupant.code);
                  const isMatchingType = isOccupied && hasTypeSelection && selectedModels!.has(occupant.model);
                  const style = hasTypeSelection ? (isMatchingType ? SELECTED_TYPE_STYLE : OTHER_TYPE_STYLE) : s;
                  const b = blockFor(standIndex, floor);
                  return (
                    <g
                      key={displayCode}
                      role="button"
                      tabIndex={isOccupied ? 0 : -1}
                      aria-label={isOccupied ? `${displayCode}: ${occupant.model}` : `${displayCode}: empty`}
                      aria-disabled={!isOccupied}
                      onClick={() => isOccupied && onToggle(occupant.code)}
                      onKeyDown={(e) => {
                        if (isOccupied && (e.key === "Enter" || e.key === " ")) onToggle(occupant.code);
                      }}
                      className={cn("transition-transform duration-150", isOccupied ? "cursor-pointer hover:brightness-105" : "cursor-not-allowed")}
                      style={{ transformOrigin: `${b.labelX}px ${b.labelY}px` }}
                    >
                      <title>{isOccupied ? `${displayCode} — ${occupant.model} (${occupant.serialNumber})` : `${displayCode} — empty`}</title>
                      <polygon points={b.topFace} fill={isOccupied ? style.top : "#E5E7EB"} stroke="#00000014" />
                      <polygon points={b.sideFace} fill={isOccupied ? style.side : "#D1D5DB"} stroke="#00000014" />
                      <rect
                        x={b.front.x}
                        y={b.front.y}
                        width={b.front.w}
                        height={b.front.h}
                        rx={3}
                        fill={isOccupied ? style.occupied : "#F3F4F6"}
                        stroke={isSelected ? "#16A34A" : "#00000014"}
                        strokeWidth={isSelected ? 3 : 1}
                        opacity={isOccupied ? 1 : 0.6}
                      />
                      <text
                        x={b.labelX}
                        y={b.labelY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={13}
                        fontWeight={800}
                        fill={isOccupied ? style.text : "#9CA3AF"}
                      >
                        {shortCode}
                      </text>
                      {isSelected && (
                        <>
                          <circle cx={b.front.x + b.front.w + DEPTH_DX - 2} cy={b.front.y - 2} r={7} fill="#16A34A" />
                          <text x={b.front.x + b.front.w + DEPTH_DX - 2} y={b.front.y - 2} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="white">
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

        {selectedHere.length > 0 && (
          <div className="rounded-xl border border-border bg-muted p-3 space-y-1.5">
            <p className="text-xs font-medium text-foreground">Picked from this area</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {selectedHere.map((c) => {
                const occ = occupants[c];
                return (
                  <li key={c}>
                    {c}: {occ?.model} · {occ?.serialNumber}
                    {occ && occ.count > 1 ? ` (${occ.count} tires)` : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
