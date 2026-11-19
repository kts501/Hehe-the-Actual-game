import React from 'react';
import { WEAPONS_BY_SLOT, type WeaponConfig, type WeaponId, type WeaponSlot } from '../game/weapons';

interface WeaponWheelProps {
  hoveredSlot: WeaponSlot;
  activeWeapon: WeaponId;
  cratesCollected: number;
  totalCrates: number;
  scrapParts: number;
  weaponDurability: Record<WeaponId, number>;
  cursorX: number;
  cursorY: number;
  pointerLocked: boolean;
  onHoverSlot?: (slot: WeaponSlot) => void;
  onSelectSlot?: (slot: WeaponSlot) => void;
}

const WHEEL_SIZE = 440;
const CX = WHEEL_SIZE / 2;
const CY = WHEEL_SIZE / 2;
const INNER_R = 96;
const OUTER_R = 200;

interface WedgeGeometry {
  slot: WeaponSlot;
  startDeg: number;
  endDeg: number;
  iconX: number;
  iconY: number;
  path: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function createDonutWedgePath(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  startDeg: number,
  endDeg: number,
): string {
  const gapDeg = 1.6;
  const a0 = startDeg + gapDeg;
  const a1 = endDeg - gapDeg;
  const pOutStart = polarToCartesian(cx, cy, rOut, a0);
  const pOutEnd = polarToCartesian(cx, cy, rOut, a1);
  const pInEnd = polarToCartesian(cx, cy, rIn, a1);
  const pInStart = polarToCartesian(cx, cy, rIn, a0);
  const largeArc = a1 - a0 > 180 ? 1 : 0;

  return [
    `M ${pOutStart.x.toFixed(2)} ${pOutStart.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${largeArc} 1 ${pOutEnd.x.toFixed(2)} ${pOutEnd.y.toFixed(2)}`,
    `L ${pInEnd.x.toFixed(2)} ${pInEnd.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${largeArc} 0 ${pInStart.x.toFixed(2)} ${pInStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

const WEDGES: WedgeGeometry[] = [
  {
    slot: 'top',
    startDeg: -135,
    endDeg: -45,
    iconX: CX,
    iconY: CY - (INNER_R + OUTER_R) * 0.5,
    path: createDonutWedgePath(CX, CY, INNER_R, OUTER_R, -135, -45),
  },
  {
    slot: 'right',
    startDeg: -45,
    endDeg: 45,
    iconX: CX + (INNER_R + OUTER_R) * 0.5,
    iconY: CY,
    path: createDonutWedgePath(CX, CY, INNER_R, OUTER_R, -45, 45),
  },
  {
    slot: 'bottom',
    startDeg: 45,
    endDeg: 135,
    iconX: CX,
    iconY: CY + (INNER_R + OUTER_R) * 0.5,
    path: createDonutWedgePath(CX, CY, INNER_R, OUTER_R, 45, 135),
  },
  {
    slot: 'left',
    startDeg: 135,
    endDeg: 225,
    iconX: CX - (INNER_R + OUTER_R) * 0.5,
    iconY: CY,
    path: createDonutWedgePath(CX, CY, INNER_R, OUTER_R, 135, 225),
  },
];

const WeaponSilhouetteIcon: React.FC<{
  weaponId: WeaponId;
  active: boolean;
}> = ({ weaponId, active }) => {
  const color = active ? '#FFFBEB' : '#E4E4E7';
  const accent = active ? '#FDE68A' : '#A1A1AA';

  if (weaponId === 'bat') {
    return (
      <svg viewBox="0 0 64 64" className="h-14 w-14 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" aria-hidden="true">
        <g transform="rotate(42 32 32)">
          <path
            d="M 28.5 52 L 35.5 52 L 36.5 56 L 27.5 56 Z"
            fill={accent}
          />
          <rect x="29.5" y="37" width="5" height="15" rx="1" fill={accent} />
          <path
            d="M 29.5 37 L 26.8 14 C 26.4 9 28.8 6 32 6 C 35.2 6 37.6 9 37.2 14 L 34.5 37 Z"
            fill={color}
          />
          <rect x="28.7" y="34" width="6.6" height="3" rx="0.8" fill={accent} opacity="0.9" />
        </g>
      </svg>
    );
  }

  if (weaponId === 'unarmed') {
    return (
      <svg viewBox="0 0 64 64" className="h-13 w-13 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" aria-hidden="true">
        {/* Stylized fighting fist / parkour hand silhouette */}
        <path
          d="M 19 30 C 19 25 22 22 25 22 L 25 18 C 25 16.3 26.3 15 28 15 C 29.7 15 31 16.3 31 18 L 31 17 C 31 15.3 32.3 14 34 14 C 35.7 14 37 15.3 37 17 L 37 18.5 C 37 16.8 38.3 15.5 40 15.5 C 41.7 15.5 43 16.8 43 18.5 L 43 21.5 C 43 20 44.1 19 45.6 19 C 47.1 19 48.2 20.1 48.2 21.8 L 48.2 35 C 48.2 42 43.2 47 36 47 L 28.5 47 C 22.8 47 19 42.6 19 36.8 Z"
          fill={color}
        />
        <path
          d="M 17 31 L 23.5 31 C 25.4 31 27 32.5 27 34.4 L 27 37 C 27 38.6 25.7 39.8 24 39.8 L 19.5 39.8 C 17.5 39.8 16 38.1 16 36 Z"
          fill={accent}
        />
        <rect x="24" y="49" width="17" height="4.5" rx="1.5" fill={accent} />
      </svg>
    );
  }

  if (weaponId === 'dagger') {
    return (
      <svg viewBox="0 0 64 64" className="h-14 w-14 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" aria-hidden="true">
        <g transform="rotate(42 32 32)">
          <path d="M 32 6 L 37 22 L 35.5 37 L 28.5 37 L 27 22 Z" fill={color} />
          <line x1="32" y1="10" x2="32" y2="34" stroke={accent} strokeWidth="1.6" />
          <rect x="21" y="37" width="22" height="4" rx="1.2" fill={accent} />
          <rect x="29.5" y="41" width="5" height="12" rx="1" fill={color} />
          <circle cx="32" cy="55" r="3.4" fill={accent} />
        </g>
      </svg>
    );
  }

  // Heavy Cleaver / Machete
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" aria-hidden="true">
      <g transform="rotate(38 32 32)">
        <path
          d="M 24 8 L 38 12 L 40 37 L 26 37 L 24 14 Z"
          fill={color}
        />
        <circle cx="29" cy="14.5" r="2.2" fill="rgba(20,22,28,0.85)" />
        <path d="M 37.6 12.2 L 40 37 L 37.2 37 L 35.6 12 Z" fill={accent} />
        <rect x="24.5" y="37" width="15" height="3.5" rx="1" fill={accent} />
        <rect x="27" y="40.5" width="6.5" height="14.5" rx="1.4" fill={color} />
      </g>
    </svg>
  );
};

export const WeaponWheel: React.FC<WeaponWheelProps> = ({
  hoveredSlot,
  activeWeapon,
  cratesCollected,
  totalCrates,
  scrapParts,
  weaponDurability,
  cursorX,
  cursorY,
  pointerLocked,
  onHoverSlot,
  onSelectSlot,
}) => {
  const highlighted: WeaponConfig = WEAPONS_BY_SLOT[hoveredSlot];
  const durabilityValue = weaponDurability[highlighted.id] ?? 0;
  const maxDurability = highlighted.maxDurability;
  const durabilityPct = maxDurability > 0 ? Math.max(0, Math.min(100, (durabilityValue / maxDurability) * 100)) : 0;

  // Clamp cursor dot visually inside the wheel ring area
  const cursorDist = Math.hypot(cursorX, cursorY);
  const clampedR = Math.min(155, cursorDist);
  const dotX = cursorDist > 0.001 ? (cursorX / cursorDist) * clampedR : 0;
  const dotY = cursorDist > 0.001 ? (cursorY / cursorDist) * clampedR : 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center select-none pointer-events-auto"
      style={{
        background:
          'radial-gradient(circle at center, rgba(10, 12, 16, 0.54) 0%, rgba(8, 10, 14, 0.80) 70%, rgba(5, 6, 9, 0.90) 100%)',
      }}
      role="dialog"
      aria-label="Weapon Selector Wheel"
    >
      <div className="relative flex flex-col items-center">
        {/* Radial Wheel Ring Container */}
        <div
          className="relative"
          style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        >
          <svg
            viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
            className="h-full w-full overflow-visible drop-shadow-[0_18px_40px_rgba(0,0,0,0.8)]"
          >
            <defs>
              <linearGradient id="wheelActiveWedgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F5A623" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#D9821E" stopOpacity="0.9" />
              </linearGradient>
              <radialGradient id="wheelInactiveWedgeGrad" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="rgba(26, 29, 37, 0.84)" />
                <stop offset="100%" stopColor="rgba(16, 18, 24, 0.84)" />
              </radialGradient>
            </defs>

            {/* Subtle Outer Rim Hairline */}
            <circle
              cx={CX}
              cy={CY}
              r={OUTER_R + 6}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1"
            />

            {/* Cardinal Wedges */}
            {WEDGES.map((wedge) => {
              const weapon = WEAPONS_BY_SLOT[wedge.slot];
              const isSelected = wedge.slot === hoveredSlot;
              const isEquipped = weapon.id === activeWeapon;

              return (
                <g
                  key={wedge.slot}
                  style={{
                    transformOrigin: `${CX}px ${CY}px`,
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 110ms cubic-bezier(0.22, 1, 0.36, 1)',
                    cursor: pointerLocked ? 'default' : 'pointer',
                  }}
                  onMouseEnter={() => {
                    if (!pointerLocked) onHoverSlot?.(wedge.slot);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!pointerLocked) onSelectSlot?.(wedge.slot);
                  }}
                >
                  <path
                    d={wedge.path}
                    fill={isSelected ? 'url(#wheelActiveWedgeGrad)' : 'url(#wheelInactiveWedgeGrad)'}
                    stroke={
                      isSelected
                        ? '#FDE68A'
                        : isEquipped
                          ? 'rgba(245, 166, 35, 0.45)'
                          : 'rgba(255, 255, 255, 0.16)'
                    }
                    strokeWidth={isSelected ? 2.4 : 1.2}
                  />
                </g>
              );
            })}

            {/* Center Hub Dark Backdrop */}
            <circle
              cx={CX}
              cy={CY}
              r={INNER_R - 4}
              fill="rgba(14, 16, 21, 0.90)"
              stroke="rgba(255, 255, 255, 0.16)"
              strokeWidth="1.5"
            />

            {/* Subtle Aim Vector Line from Center to Virtual Cursor */}
            {cursorDist > 10 && (
              <line
                x1={CX}
                y1={CY}
                x2={CX + dotX}
                y2={CY + dotY}
                stroke="rgba(245, 166, 35, 0.38)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}
          </svg>

          {/* Positioned Weapon Icons & Slot Tags inside Each Wedge */}
          {WEDGES.map((wedge) => {
            const weapon = WEAPONS_BY_SLOT[wedge.slot];
            const isSelected = wedge.slot === hoveredSlot;
            const isEquipped = weapon.id === activeWeapon;
            const scaleOffset = isSelected ? 1.05 : 1;
            const xPos = CX + (wedge.iconX - CX) * scaleOffset;
            const yPos = CY + (wedge.iconY - CY) * scaleOffset;

            return (
              <div
                key={`icon_${wedge.slot}`}
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
                style={{ left: xPos, top: yPos }}
              >
                <WeaponSilhouetteIcon weaponId={weapon.id} active={isSelected} />
                {isEquipped && !isSelected && (
                  <span className="mt-0.5 text-[9px] font-bold tracking-[0.14em] text-amber-300/90 uppercase">
                    Active
                  </span>
                )}
              </div>
            );
          })}

          {/* Center Info Hub: Antizin Vials, Scrap Parts, Weapon Durability Bar */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex w-40 flex-col items-center text-center">
              <div className="text-[10px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
                Survival Kit
              </div>

              <div className="mt-2 flex w-full flex-col gap-1 px-2 text-xs text-zinc-100">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Antizin Vials:</span>
                  <span className="font-mono-num font-bold text-amber-300">
                    {cratesCollected} / {totalCrates}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Scrap Parts:</span>
                  <span className="font-mono-num font-bold text-white">{scrapParts}</span>
                </div>
              </div>

              {maxDurability > 0 ? (
                <div className="mt-2.5 w-32">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold tracking-wider text-zinc-300 uppercase">
                    <span>Durability</span>
                    <span className="font-mono-num text-white">
                      {durabilityValue}/{maxDurability}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-xs bg-zinc-800/95 ring-1 ring-white/15">
                    <div
                      className="h-full transition-[width,background-color] duration-150"
                      style={{
                        width: `${durabilityPct}%`,
                        backgroundColor:
                          durabilityPct > 45 ? '#F5A623' : durabilityPct > 20 ? '#F97316' : '#EF4444',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 text-[10px] font-semibold tracking-wider text-amber-300/90 uppercase">
                  +15% Parkour Speed
                </div>
              )}
            </div>
          </div>

          {/* Virtual Pointer Dot indicating live selection angle */}
          {cursorDist > 6 && (
            <div
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-amber-400 shadow-[0_0_10px_rgba(245,166,35,0.95)]"
              style={{ left: CX + dotX, top: CY + dotY }}
            />
          )}
        </div>

        {/* Bottom Weapon Nameplate Banner & Stat Badges */}
        <div className="mt-4 flex flex-col items-center">
          <div className="rounded-md border border-amber-400/45 bg-[#14161C]/92 px-7 py-2.5 text-center shadow-[0_12px_32px_rgba(0,0,0,0.85)]">
            <div className="font-display text-lg font-bold tracking-[0.12em] text-white uppercase">
              {highlighted.name}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2.5">
              {highlighted.badges.map((badge) => (
                <div
                  key={badge.label}
                  className="flex items-center gap-1.5 rounded-xs border border-white/12 bg-zinc-900/90 px-2.5 py-0.5 text-[11px]"
                >
                  <span className="font-semibold tracking-wider text-zinc-400 uppercase">
                    {badge.label}
                  </span>
                  <span className="font-mono-num font-bold text-amber-300">{badge.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 text-[11px] font-medium tracking-wider text-zinc-300/85 uppercase">
            Move Mouse to Select · Release to Equip
          </div>
        </div>
      </div>
    </div>
  );
};
