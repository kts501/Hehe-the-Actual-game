import React, { useEffect, useRef } from 'react';
import type { HudState } from '../game/types';

interface MinimapProps {
  hud: HudState;
}

const MAP_W = 248;
const MAP_H = 152;
const PX_PER_METER = 2.15;
const PLAYER_SCREEN_X = MAP_W * 0.5;
const PLAYER_SCREEN_Y = MAP_H * 0.67;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: string, hexB: string, t: number): string {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Converts a world coordinate (wx, wz) into minimap canvas coordinates
 * using player-heading-up rotation (player always faces upward on the radar).
 */
function worldToMap(
  wx: number,
  wz: number,
  px: number,
  pz: number,
  yaw: number,
): { x: number; y: number } {
  const dx = (wx - px) * PX_PER_METER;
  const dz = (wz - pz) * PX_PER_METER;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: PLAYER_SCREEN_X + (dx * cos - dz * sin),
    y: PLAYER_SCREEN_Y + (dx * sin + dz * cos),
  };
}

/**
 * Clamps an off-screen marker position to the inner border of the minimap
 * so the player always sees the direction toward all 3 Antizin crates and the UV gate.
 */
function clampToEdge(x: number, y: number, pad = 12): { x: number; y: number; clamped: boolean } {
  if (x >= pad && x <= MAP_W - pad && y >= pad && y <= MAP_H - pad) {
    return { x, y, clamped: false };
  }
  const cx = PLAYER_SCREEN_X;
  const cy = PLAYER_SCREEN_Y;
  const vx = x - cx;
  const vy = y - cy;
  let t = 1;
  if (vx > 0) t = Math.min(t, (MAP_W - pad - cx) / vx);
  if (vx < 0) t = Math.min(t, (pad - cx) / vx);
  if (vy > 0) t = Math.min(t, (MAP_H - pad - cy) / vy);
  if (vy < 0) t = Math.min(t, (pad - cy) / vy);
  return {
    x: cx + vx * t,
    y: cy + vy * t,
    clamped: true,
  };
}

export const Minimap: React.FC<MinimapProps> = ({ hud }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Determine nearest active objective for GPS route & distance readout
  const uncollectedCrates = hud.crates.filter((c) => !c.collected);
  let targetX = hud.safeHouseX;
  let targetZ = hud.safeHouseZ;
  let targetLabel = 'UV GATE';
  let minTargetDist = Math.hypot(hud.safeHouseX - hud.playerX, hud.safeHouseZ - hud.playerZ);

  if (uncollectedCrates.length > 0) {
    let bestDist = Infinity;
    for (const c of uncollectedCrates) {
      const d = Math.hypot(c.x - hud.playerX, c.z - hud.playerZ);
      if (d < bestDist) {
        bestDist = d;
        targetX = c.x;
        targetZ = c.z;
        targetLabel = 'GRE';
      }
    }
    minTargetDist = bestDist;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = 1;
    if (canvas.width !== MAP_W * dpr || canvas.height !== MAP_H * dpr) {
      canvas.width = MAP_W * dpr;
      canvas.height = MAP_H * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nightT = Math.min(1, Math.max(0, hud.cycleProgress));
    const duskGlow = 1 - nightT;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Dynamic Background (darkens smoothly from Golden Dusk -> Nightfall)
    ctx.fillStyle = lerpHex('#2b211a', '#090e1a', nightT);
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // 2. Rotated World Layer (heading-up around player)
    ctx.save();
    ctx.translate(PLAYER_SCREEN_X, PLAYER_SCREEN_Y);
    ctx.rotate(hud.playerYaw);
    ctx.translate(-hud.playerX * PX_PER_METER, -hud.playerZ * PX_PER_METER);
    ctx.scale(PX_PER_METER, PX_PER_METER);

    // Subtle courtyard grid blocks
    ctx.strokeStyle =
      nightT > 0.5 ? 'rgba(56, 189, 248, 0.06)' : 'rgba(251, 191, 36, 0.08)';
    ctx.lineWidth = 0.35;
    for (let gx = -50; gx <= 50; gx += 10) {
      ctx.beginPath();
      ctx.moveTo(gx, -65);
      ctx.lineTo(gx, 58);
      ctx.stroke();
    }
    for (let gz = -60; gz <= 55; gz += 10) {
      ctx.beginPath();
      ctx.moveTo(-55, gz);
      ctx.lineTo(55, gz);
      ctx.stroke();
    }

    // Symmetrical Red-Sandstone Charbagh Walkways
    ctx.fillStyle = lerpHex('#6f4335', '#1b2234', nightT);
    ctx.fillRect(-9, -43, 18, 82); // North-South central promenade
    ctx.fillRect(-41, -2, 82, 12); // East-West walkway
    ctx.fillRect(-22.5, -41, 5, 78); // West outer path
    ctx.fillRect(17.5, -41, 5, 78); // East outer path

    // Warm avenue edge highlights (stronger golden streetlines at dusk/night like GTA 6 dusk/night maps)
    ctx.strokeStyle =
      nightT > 0.5 ? 'rgba(245, 158, 11, 0.32)' : 'rgba(251, 191, 36, 0.42)';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(-9, -43, 18, 82);
    ctx.strokeRect(-41, -2, 82, 12);

    // Central Reflective Water Pool & Fountain Basin
    ctx.fillStyle = lerpHex('#1d5e80', '#0c274d', nightT);
    ctx.fillRect(-3.6, -37, 7.2, 70);
    ctx.strokeStyle = lerpHex('#e2d9cb', '#38bdf8', nightT * 0.55);
    ctx.lineWidth = 0.4;
    ctx.strokeRect(-3.9, -37, 7.8, 70);

    // Raised Marble Lotus Tank (Al-Kawthar)
    ctx.fillStyle = lerpHex('#e2d9cb', '#334155', nightT);
    ctx.fillRect(-5.7, -1.7, 11.4, 11.4);
    ctx.fillStyle = lerpHex('#38bdf8', '#0284c7', nightT);
    ctx.fillRect(-2.9, 1.1, 5.8, 5.8);

    // Yamuna River Horizon behind Taj Mahal
    ctx.fillStyle = lerpHex('#1a4a68', '#0a1f3d', nightT);
    ctx.fillRect(-140, -130, 280, 52);

    // Perimeter Sandstone Walls & Southern Great Gate (Darwaza-i-Rauza)
    ctx.fillStyle = lerpHex('#874838', '#23293a', nightT);
    ctx.fillRect(-56.2, -50, 2.4, 108); // West wall
    ctx.fillRect(53.8, -50, 2.4, 108); // East wall
    ctx.fillRect(-56.2, 56.8, 112.4, 2.4); // South wall
    ctx.fillStyle = lerpHex('#a5523e', '#2d3548', nightT);
    ctx.fillRect(-11, 53.4, 22, 6.2); // Darwaza-i-Rauza Great Gate

    // Taj Mahal Monument at North End (z = -58)
    // Plinth shadow + marble plinth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fillRect(-23.2, -75.2, 48, 36);
    ctx.fillStyle = lerpHex('#dfd7c8', '#334155', nightT);
    ctx.fillRect(-24, -76, 48, 36);
    ctx.strokeStyle = lerpHex('#fffbeb', '#64748b', nightT);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-24, -76, 48, 36);

    // Red Sandstone Side Mosques (Masjid West & Jawab East)
    ctx.fillStyle = lerpHex('#9c4b39', '#2b2430', nightT);
    ctx.fillRect(-43.2, -72, 10.5, 24);
    ctx.fillRect(32.8, -72, 10.5, 24);
    [-38, 38].forEach((mx) => {
      ctx.beginPath();
      ctx.arc(mx, -60, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = lerpHex('#f5efe6', '#64748b', nightT);
      ctx.fill();
    });

    // Main Mausoleum Body + Central Onion Dome
    ctx.fillStyle = lerpHex('#f5efe6', '#475569', nightT);
    ctx.fillRect(-13, -71, 26, 26);
    ctx.beginPath();
    ctx.arc(0, -58, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = lerpHex('#fffdf7', '#64748b', nightT);
    ctx.fill();
    ctx.strokeStyle = lerpHex('#d6cbb8', '#94a3b8', nightT);
    ctx.lineWidth = 0.45;
    ctx.stroke();

    // 4 Corner Minarets
    const minarets: Array<[number, number]> = [
      [-21, -73],
      [21, -73],
      [-21, -43],
      [21, -43],
    ];
    for (const [mx, mz] of minarets) {
      ctx.beginPath();
      ctx.arc(mx, mz, 1.75, 0, Math.PI * 2);
      ctx.fillStyle = lerpHex('#fffdf7', '#64748b', nightT);
      ctx.fill();
    }

    // East & West Bazaar Rooftops + Wooden Parkour Ramps
    const rooftops = [
      { x: 26, z: -8, hw: 5.5, hd: 6.5, rampZ: 2.0 },
      { x: -26, z: 12, hw: 5.5, hd: 6.5, rampZ: 22.0 },
    ];
    for (const r of rooftops) {
      // Rooftop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(r.x - r.hw + 0.6, r.z - r.hd + 0.6, r.hw * 2, r.hd * 2);
      // Rooftop surface
      ctx.fillStyle = lerpHex('#9c5b43', '#273043', nightT);
      ctx.fillRect(r.x - r.hw, r.z - r.hd, r.hw * 2, r.hd * 2);
      ctx.strokeStyle = lerpHex('#e7dccb', '#475569', nightT);
      ctx.lineWidth = 0.4;
      ctx.strokeRect(r.x - r.hw, r.z - r.hd, r.hw * 2, r.hd * 2);
      // Wooden ramp leading up
      ctx.fillStyle = lerpHex('#b57f4b', '#85582e', nightT);
      ctx.fillRect(r.x - 1.3, r.rampZ - 3.5, 2.6, 7.0);
    }

    // Mid-courtyard parkour ramp
    ctx.fillStyle = lerpHex('#b57f4b', '#85582e', nightT);
    ctx.fillRect(7.1, 11.4, 2.8, 5.2);

    // Wrecked Auto-Rickshaws
    const rickshaws: Array<[number, number]> = [
      [11, 22],
      [-12, 24],
      [15, -24],
      [-22, -6],
    ];
    for (const [rx, rz] of rickshaws) {
      ctx.fillStyle = lerpHex('#d9a11e', '#a16207', nightT);
      ctx.fillRect(rx - 0.9, rz - 1.3, 1.8, 2.6);
    }

    // Taj Mahal UV Safe House Gate (Localized Purple UV Ring + Watchtower)
    const uvGrad = ctx.createRadialGradient(
      hud.safeHouseX,
      hud.safeHouseZ,
      0.5,
      hud.safeHouseX,
      hud.safeHouseZ,
      hud.safeHouseRadius + 1.5,
    );
    uvGrad.addColorStop(0, 'rgba(168, 85, 247, 0.42)');
    uvGrad.addColorStop(0.75, 'rgba(147, 51, 234, 0.24)');
    uvGrad.addColorStop(1, 'rgba(147, 51, 234, 0)');
    ctx.fillStyle = uvGrad;
    ctx.beginPath();
    ctx.arc(hud.safeHouseX, hud.safeHouseZ, hud.safeHouseRadius + 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(hud.safeHouseX, hud.safeHouseZ, hud.safeHouseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Havildar Vikram's Watchtower footprint
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(hud.watchtowerX - 2.4, hud.watchtowerZ - 2.4, 4.8, 4.8);
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(hud.watchtowerX - 2.4, hud.watchtowerZ - 2.4, 4.8, 4.8);

    // 3. Glowing Neon Pink/Magenta GPS Route Line (inspired by reference minimap)
    const routePoints: Array<[number, number]> = [[hud.playerX, hud.playerZ]];
    if (targetLabel === 'GRE') {
      // Route via ramp base if targeting East or West Bazaar Rooftop
      if (Math.abs(targetX - 26) < 1 && Math.abs(targetZ - -8) < 1) {
        if (hud.playerZ > 5.5 || Math.abs(hud.playerX - 26) > 3) {
          routePoints.push([26, 6.2]);
        }
      } else if (Math.abs(targetX - -26) < 1 && Math.abs(targetZ - 12) < 1) {
        if (hud.playerZ > 26 || Math.abs(hud.playerX - -26) > 3) {
          routePoints.push([-26, 26.2]);
        }
      }
    }
    routePoints.push([targetX, targetZ]);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer magenta glow
    ctx.beginPath();
    routePoints.forEach(([rx, rz], idx) => {
      if (idx === 0) ctx.moveTo(rx, rz);
      else ctx.lineTo(rx, rz);
    });
    ctx.strokeStyle = `rgba(236, 72, 153, ${0.45 + duskGlow * 0.1})`;
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Mid neon pink
    ctx.strokeStyle = '#f43f8e';
    ctx.lineWidth = 1.35;
    ctx.stroke();

    // Bright white-pink core
    ctx.strokeStyle = '#fdf2f8';
    ctx.lineWidth = 0.55;
    ctx.stroke();

    // Active Zombie Threat Dots (subtle red pips)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    for (const t of hud.threatDots) {
      ctx.beginPath();
      ctx.arc(t.x, t.z, 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // End world rotation transform

    // 4. Crisp Screen-Space Icons (always upright & edge-clamped so never lost off-radar)

    // Taj Mahal UV Gate Icon
    const uvPos = worldToMap(hud.safeHouseX, hud.safeHouseZ, hud.playerX, hud.playerZ, hud.playerYaw);
    const uvClamped = clampToEdge(uvPos.x, uvPos.y, 13);
    ctx.save();
    ctx.translate(uvClamped.x, uvClamped.y);
    ctx.beginPath();
    ctx.arc(0, 0, uvClamped.clamped ? 6.5 : 7.5, 0, Math.PI * 2);
    ctx.fillStyle = '#581c87';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e9d5ff';
    ctx.stroke();
    ctx.fillStyle = '#faf5ff';
    ctx.font = '700 7px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UV', 0, 0.5);
    ctx.restore();

    // 3 Antizin Crates
    for (const crate of hud.crates) {
      const cPos = worldToMap(crate.x, crate.z, hud.playerX, hud.playerZ, hud.playerYaw);
      const cClamped = clampToEdge(cPos.x, cPos.y, 11);

      ctx.save();
      ctx.translate(cClamped.x, cClamped.y);

      if (!crate.collected) {
        // Outer cyan/pink waypoint halo
        ctx.beginPath();
        ctx.arc(0, 0, cClamped.clamped ? 6.5 : 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
        ctx.fill();

        // Crisp rotated diamond crate icon
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = '#ecfeff';
        ctx.strokeRect(-4, -4, 8, 8);
      } else if (!cClamped.clamped) {
        // Collected crate cleared pip
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = '#15803d';
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = '#86efac';
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Player Position Cursor (Black circle + white rim + sharp upward white arrow, matching GTA 6 minimap)
    ctx.save();
    ctx.translate(PLAYER_SCREEN_X, PLAYER_SCREEN_Y);

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = '#09090b';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -4.6);
    ctx.lineTo(3.4, 3.2);
    ctx.lineTo(0, 1.5);
    ctx.lineTo(-3.4, 3.2);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // 6. Top atmospheric dusk/night vignette & subtle frame sheen
    const topVignette = ctx.createLinearGradient(0, 0, 0, 34);
    topVignette.addColorStop(
      0,
      nightT > 0.5 ? 'rgba(9, 14, 26, 0.72)' : 'rgba(67, 36, 22, 0.52)',
    );
    topVignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topVignette;
    ctx.fillRect(0, 0, MAP_W, 34);

    ctx.restore();
  }, [hud, targetX, targetZ, targetLabel]);

  // Dynamic border tint matching Dusk (amber-gold) vs Nightfall (twilight indigo/violet)
  const nightT = Math.min(1, Math.max(0, hud.cycleProgress));
  const frameBorderColor =
    nightT < 0.55 ? 'rgba(245, 158, 11, 0.65)' : 'rgba(139, 92, 246, 0.65)';

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-stone-950/90 shadow-2xl"
      style={{
        width: `${MAP_W}px`,
        height: `${MAP_H}px`,
        border: `1.5px solid ${frameBorderColor}`,
        boxShadow:
          nightT < 0.55
            ? '0 8px 28px rgba(0, 0, 0, 0.65), inset 0 0 18px rgba(245, 158, 11, 0.14)'
            : '0 8px 28px rgba(0, 0, 0, 0.75), inset 0 0 22px rgba(139, 92, 246, 0.2)',
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Top-Left Live Distance Badge (matching GTA 6 reference pill) */}
      <div className="font-mono-num absolute top-2 left-2 flex items-center gap-1.5 rounded border border-stone-500/50 bg-stone-950/85 px-2 py-0.5 text-[11px] font-bold text-stone-100">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            targetLabel === 'GRE' ? 'bg-cyan-400' : 'bg-purple-400'
          }`}
        />
        <span>{Math.round(minTargetDist)}m</span>
        <span className="text-[10px] font-semibold text-stone-400">{targetLabel}</span>
      </div>

      {/* Bottom-Left Circular 'N' North Badge with Live True-North Tick */}
      <div className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border border-stone-400/60 bg-stone-950/90 text-[11px] font-bold text-stone-100">
        <span>N</span>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${-hud.headingDeg}deg)` }}
        >
          <div className="mx-auto -mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
        </div>
      </div>

      {/* Bottom-Right Subtle Legend */}
      <div className="absolute right-2 bottom-2 flex items-center gap-2 rounded bg-stone-950/75 px-1.5 py-0.5 text-[9px] font-semibold text-stone-300">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rotate-45 bg-cyan-400" />
          GRE
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400" />
          UV
        </span>
      </div>
    </div>
  );
};
