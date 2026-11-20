import React, { useEffect, useRef } from 'react';
import type { HudSnapshot, MinimapTelemetry } from '../types/game';
import {
  AGRA_BUILDINGS_3D,
  AGRA_DOMES_3D,
  AGRA_GROUND_FEATURES,
  AGRA_ZIPLINES,
  computeAgraGpsRoute,
  type MapBuilding3D,
  type MapDome3D,
} from '../game/minimapData';

interface DualMinimapsProps {
  hud: HudSnapshot;
  getLiveMinimapTelemetry?: () => MinimapTelemetry | null;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface CamPt {
  cx: number;
  cy: number;
  depth: number;
}

interface ScreenPt {
  x: number;
  y: number;
  depth: number;
}

const NEAR_PLANE = 1.6;
const CAM_BACK = 27.0;
const CAM_UP = 25.0;
const CAM_TILT_RAD = 0.67; // ~38.4 deg pitch-down oblique 3D GTA angle
const COS_TILT = Math.cos(CAM_TILT_RAD);
const SIN_TILT = Math.sin(CAM_TILT_RAD);

function toCameraSpace(
  wx: number,
  wy: number,
  wz: number,
  px: number,
  py: number,
  pz: number,
  cosYaw: number,
  sinYaw: number,
): CamPt {
  const dxw = wx - px;
  const dzw = wz - pz;
  const rx = dxw * cosYaw - dzw * sinYaw;
  const rz = -dxw * sinYaw - dzw * cosYaw;
  const ry = wy - py;

  const dy = ry - CAM_UP;
  const dz = rz + CAM_BACK;
  return {
    cx: rx,
    cy: dz * SIN_TILT + dy * COS_TILT,
    depth: dz * COS_TILT - dy * SIN_TILT,
  };
}

function clipNearPlane(poly: CamPt[]): CamPt[] {
  if (poly.length === 0) return [];
  const out: CamPt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = cur.depth >= NEAR_PLANE;
    const prevIn = prev.depth >= NEAR_PLANE;

    if (curIn !== prevIn) {
      const t = (NEAR_PLANE - prev.depth) / (cur.depth - prev.depth || 1e-6);
      out.push({
        cx: prev.cx + (cur.cx - prev.cx) * t,
        cy: prev.cy + (cur.cy - prev.cy) * t,
        depth: NEAR_PLANE,
      });
    }
    if (curIn) {
      out.push(cur);
    }
  }
  return out;
}

function projectCamPt(pt: CamPt, w: number, h: number, focal: number): ScreenPt {
  const sx = w * 0.5 + (pt.cx / pt.depth) * focal;
  const sy = h * 0.61 - (pt.cy / pt.depth) * focal;
  return { x: sx, y: sy, depth: pt.depth };
}

function drawProjectedPoly(
  ctx: CanvasRenderingContext2D,
  worldPts: Vec3[],
  px: number,
  py: number,
  pz: number,
  cosYaw: number,
  sinYaw: number,
  w: number,
  h: number,
  focal: number,
  fillStyle: string,
  strokeStyle?: string,
  lineWidth = 1,
): ScreenPt[] | null {
  const camPts = worldPts.map((p) =>
    toCameraSpace(p.x, p.y, p.z, px, py, pz, cosYaw, sinYaw),
  );
  const clipped = clipNearPlane(camPts);
  if (clipped.length < 3) return null;

  const screenPts = clipped.map((p) => projectCamPt(p, w, h, focal));
  ctx.beginPath();
  ctx.moveTo(screenPts[0].x, screenPts[0].y);
  for (let i = 1; i < screenPts.length; i++) {
    ctx.lineTo(screenPts[i].x, screenPts[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  return screenPts;
}

function bilerpQuad(
  p0: ScreenPt,
  p1: ScreenPt,
  p2: ScreenPt,
  p3: ScreenPt,
  u: number,
  v: number,
): { x: number; y: number } {
  const topX = p0.x + (p1.x - p0.x) * u;
  const topY = p0.y + (p1.y - p0.y) * u;
  const botX = p3.x + (p2.x - p3.x) * u;
  const botY = p3.y + (p2.y - p3.y) * u;
  return {
    x: topX + (botX - topX) * v,
    y: topY + (botY - topY) * v,
  };
}

function drawWallWindows(
  ctx: CanvasRenderingContext2D,
  quad: ScreenPt[],
  cols: number,
  rows: number,
  isNight: boolean,
): void {
  if (quad.length !== 4) return;
  const [p0, p1, p2, p3] = quad;
  const approxW = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const approxH = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (approxW < 10 || approxH < 6) return;

  ctx.fillStyle = isNight ? 'rgba(226, 238, 255, 0.72)' : 'rgba(205, 224, 240, 0.72)';
  for (let r = 0; r < rows; r++) {
    const v0 = 0.16 + (r / rows) * 0.68;
    const v1 = v0 + 0.48 / rows;
    for (let c = 0; c < cols; c++) {
      const u0 = 0.12 + (c / cols) * 0.76;
      const u1 = u0 + 0.44 / cols;
      const a = bilerpQuad(p0, p1, p2, p3, u0, v0);
      const b = bilerpQuad(p0, p1, p2, p3, u1, v0);
      const d = bilerpQuad(p0, p1, p2, p3, u1, v1);
      const e = bilerpQuad(p0, p1, p2, p3, u0, v1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function draw3DBuilding(
  ctx: CanvasRenderingContext2D,
  b: MapBuilding3D,
  px: number,
  py: number,
  pz: number,
  cosYaw: number,
  sinYaw: number,
  w: number,
  h: number,
  focal: number,
  isNight: boolean,
): void {
  const hw = b.w * 0.5;
  const hd = b.d * 0.5;
  const x0 = b.x - hw;
  const x1 = b.x + hw;
  const z0 = b.z - hd;
  const z1 = b.z + hd;

  // Player-camera world position (approx) for exact backface culling of vertical walls
  const fwdX = -sinYaw;
  const fwdZ = -cosYaw;
  const camWorldX = px - fwdX * CAM_BACK;
  const camWorldZ = pz - fwdZ * CAM_BACK;

  // Draw visible vertical faces before roof so roof caps cleanly
  const faces: Array<{
    visible: boolean;
    pts: Vec3[];
    color: string;
    cols: number;
  }> = [
    {
      // South face (+Z)
      visible: camWorldZ > z1,
      pts: [
        { x: x0, y: b.maxY, z: z1 },
        { x: x1, y: b.maxY, z: z1 },
        { x: x1, y: b.minY, z: z1 },
        { x: x0, y: b.minY, z: z1 },
      ],
      color: b.wallNSColor,
      cols: Math.max(2, Math.min(5, Math.round(b.w / 3.2))),
    },
    {
      // North face (-Z)
      visible: camWorldZ < z0,
      pts: [
        { x: x1, y: b.maxY, z: z0 },
        { x: x0, y: b.maxY, z: z0 },
        { x: x0, y: b.minY, z: z0 },
        { x: x1, y: b.minY, z: z0 },
      ],
      color: b.wallNSColor,
      cols: Math.max(2, Math.min(5, Math.round(b.w / 3.2))),
    },
    {
      // East face (+X)
      visible: camWorldX > x1,
      pts: [
        { x: x1, y: b.maxY, z: z1 },
        { x: x1, y: b.maxY, z: z0 },
        { x: x1, y: b.minY, z: z0 },
        { x: x1, y: b.minY, z: z1 },
      ],
      color: b.wallEWColor,
      cols: Math.max(2, Math.min(5, Math.round(b.d / 3.2))),
    },
    {
      // West face (-X)
      visible: camWorldX < x0,
      pts: [
        { x: x0, y: b.maxY, z: z0 },
        { x: x0, y: b.maxY, z: z1 },
        { x: x0, y: b.minY, z: z1 },
        { x: x0, y: b.minY, z: z0 },
      ],
      color: b.wallEWColor,
      cols: Math.max(2, Math.min(5, Math.round(b.d / 3.2))),
    },
  ];

  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (!f.visible) continue;
    const screenQuad = drawProjectedPoly(
      ctx,
      f.pts,
      px,
      py,
      pz,
      cosYaw,
      sinYaw,
      w,
      h,
      focal,
      f.color,
      'rgba(15, 23, 42, 0.35)',
      0.8,
    );
    if (b.hasWindows && screenQuad && screenQuad.length === 4 && b.maxY - b.minY >= 3.2) {
      drawWallWindows(ctx, screenQuad, f.cols, b.maxY - b.minY >= 8 ? 3 : 2, isNight);
    }
  }

  // Roof Top Cap
  const roofPts: Vec3[] = [
    { x: x0, y: b.maxY, z: z0 },
    { x: x1, y: b.maxY, z: z0 },
    { x: x1, y: b.maxY, z: z1 },
    { x: x0, y: b.maxY, z: z1 },
  ];
  const roofQuad = drawProjectedPoly(
    ctx,
    roofPts,
    px,
    py,
    pz,
    cosYaw,
    sinYaw,
    w,
    h,
    focal,
    b.roofColor,
    'rgba(255, 255, 255, 0.16)',
    0.8,
  );

  // Subtle rooftop mechanical / water tank props matching GTA 3D minimap look
  if (b.hasRoofProps && roofQuad && roofQuad.length === 4) {
    drawProjectedPoly(
      ctx,
      [
        { x: b.x - hw * 0.45, y: b.maxY + 0.55, z: b.z - hd * 0.45 },
        { x: b.x - hw * 0.05, y: b.maxY + 0.55, z: b.z - hd * 0.45 },
        { x: b.x - hw * 0.05, y: b.maxY + 0.55, z: b.z - hd * 0.05 },
        { x: b.x - hw * 0.45, y: b.maxY + 0.55, z: b.z - hd * 0.05 },
      ],
      px,
      py,
      pz,
      cosYaw,
      sinYaw,
      w,
      h,
      focal,
      '#6b7280',
      'rgba(15,23,42,0.35)',
      0.6,
    );
    drawProjectedPoly(
      ctx,
      [
        { x: b.x + hw * 0.08, y: b.maxY + 0.3, z: b.z + hd * 0.08 },
        { x: b.x + hw * 0.52, y: b.maxY + 0.3, z: b.z + hd * 0.08 },
        { x: b.x + hw * 0.52, y: b.maxY + 0.3, z: b.z + hd * 0.45 },
        { x: b.x + hw * 0.08, y: b.maxY + 0.3, z: b.z + hd * 0.45 },
      ],
      px,
      py,
      pz,
      cosYaw,
      sinYaw,
      w,
      h,
      focal,
      '#475569',
      'rgba(255,255,255,0.18)',
      0.6,
    );
  }
}

function draw3DDomeOrMinaret(
  ctx: CanvasRenderingContext2D,
  d: MapDome3D,
  px: number,
  py: number,
  pz: number,
  cosYaw: number,
  sinYaw: number,
  w: number,
  h: number,
  focal: number,
): void {
  const baseCam = toCameraSpace(d.x, d.baseY, d.z, px, py, pz, cosYaw, sinYaw);
  const topCam = toCameraSpace(d.x, d.baseY + d.height, d.z, px, py, pz, cosYaw, sinYaw);
  if (baseCam.depth < NEAR_PLANE || topCam.depth < NEAR_PLANE) return;

  const baseScr = projectCamPt(baseCam, w, h, focal);
  const topScr = projectCamPt(topCam, w, h, focal);
  const radPx = (d.radius / baseCam.depth) * focal;
  if (radPx < 1.2) return;

  if (d.isMinaret) {
    // Tapered minaret shaft + crown cupola
    ctx.beginPath();
    ctx.moveTo(baseScr.x - radPx, baseScr.y);
    ctx.lineTo(topScr.x - radPx * 0.55, topScr.y);
    ctx.lineTo(topScr.x + radPx * 0.55, topScr.y);
    ctx.lineTo(baseScr.x + radPx, baseScr.y);
    ctx.closePath();
    const grad = ctx.createLinearGradient(baseScr.x - radPx, 0, baseScr.x + radPx, 0);
    grad.addColorStop(0, d.color);
    grad.addColorStop(1, d.shadeColor);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.32)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(topScr.x, topScr.y, Math.max(1.5, radPx * 0.68), 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
  } else {
    // Bulbous Mughal Onion Dome + golden kalash spire
    const midY = (baseScr.y + topScr.y) * 0.55;
    const bulgeR = radPx * 1.1;
    ctx.beginPath();
    ctx.ellipse(baseScr.x, baseScr.y, radPx, radPx * 0.42, 0, 0, Math.PI);
    ctx.bezierCurveTo(
      baseScr.x - bulgeR,
      midY,
      topScr.x - radPx * 0.4,
      topScr.y + 3,
      topScr.x,
      topScr.y,
    );
    ctx.bezierCurveTo(
      topScr.x + radPx * 0.4,
      topScr.y + 3,
      baseScr.x + bulgeR,
      midY,
      baseScr.x + radPx,
      baseScr.y,
    );
    ctx.closePath();
    const grad = ctx.createLinearGradient(baseScr.x - radPx, topScr.y, baseScr.x + radPx, baseScr.y);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, d.color);
    grad.addColorStop(1, d.shadeColor);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Kalash finial spire
    ctx.beginPath();
    ctx.moveTo(topScr.x, topScr.y);
    ctx.lineTo(topScr.x, topScr.y - Math.max(3, radPx * 0.48));
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function computeEdgeBadgePos(
  relX: number,
  relFwd: number,
  w: number,
  h: number,
  inset: number,
): { x: number; y: number } {
  const len = Math.hypot(relX, relFwd) || 1;
  const ux = relX / len;
  const uy = -relFwd / len; // +relFwd is UP (-y on canvas)
  const cx = w * 0.5;
  const cy = h * 0.58;
  const maxX = w * 0.5 - inset;
  const maxYTop = cy - inset;
  const maxYBot = h - inset - cy;

  const tx = ux !== 0 ? (ux > 0 ? maxX : -maxX) / ux : Infinity;
  const ty = uy !== 0 ? (uy < 0 ? -maxYTop : maxYBot) / uy : Infinity;
  const t = Math.min(Math.abs(tx), Math.abs(ty));
  return {
    x: Math.max(inset, Math.min(w - inset, cx + ux * t)),
    y: Math.max(inset, Math.min(h - inset, cy + uy * t)),
  };
}

function getActiveObjective(telemetry: MinimapTelemetry): {
  x: number;
  y: number;
  z: number;
  distance: number;
  isSafeHouse: boolean;
} {
  let bestCrate: (typeof telemetry.crates)[number] | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < telemetry.crates.length; i++) {
    const c = telemetry.crates[i];
    if (c.collected) continue;
    const d = Math.hypot(c.x - telemetry.playerX, c.z - telemetry.playerZ);
    if (d < bestDist) {
      bestDist = d;
      bestCrate = c;
    }
  }
  if (bestCrate) {
    return {
      x: bestCrate.x,
      y: bestCrate.y,
      z: bestCrate.z,
      distance: Math.round(bestDist),
      isSafeHouse: false,
    };
  }
  const tajDist = Math.round(
    Math.hypot(telemetry.tajGate.x - telemetry.playerX, telemetry.tajGate.z - telemetry.playerZ),
  );
  return {
    x: telemetry.tajGate.x,
    y: 1.5,
    z: telemetry.tajGate.z,
    distance: tajDist,
    isSafeHouse: true,
  };
}

function drawPlayerArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 17, 21, 0.92)';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.stroke();

  // Crisp upward directional arrowhead inside dark circle
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4.4);
  ctx.lineTo(cx + 3.6, cy + 3.4);
  ctx.lineTo(cx, cy + 1.6);
  ctx.lineTo(cx - 3.6, cy + 3.4);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawNorthBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 7.2, 0, Math.PI * 2);
  ctx.fillStyle = '#0f1116';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 8.5px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', x, y + 0.4);
  ctx.restore();
}

function drawDistanceAndPin(
  ctx: CanvasRenderingContext2D,
  distMeters: number,
  pinX: number,
  pinY: number,
  isSafeHouse: boolean,
): void {
  ctx.save();
  // Edge waypoint pin matching reference pink circle
  ctx.beginPath();
  ctx.arc(pinX, pinY, 5.2, 0, Math.PI * 2);
  ctx.fillStyle = isSafeHouse ? '#c084fc' : '#ff2e93';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#18181b';
  ctx.stroke();

  // Distance label in top-left corner with crisp dark outline
  const label = `${distMeters} m`;
  ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(label, 9, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 9, 8);
  ctx.restore();
}

function render3DMinimap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  telemetry: MinimapTelemetry,
  isNight: boolean,
  elapsedSec: number,
): void {
  const px = telemetry.playerX;
  const py = telemetry.playerY;
  const pz = telemetry.playerZ;
  const cosYaw = Math.cos(telemetry.playerYaw);
  const sinYaw = Math.sin(telemetry.playerYaw);
  const focal = w * 0.94;

  // Matte GTA 3D Map backdrop
  ctx.fillStyle = isNight ? '#3f454f' : '#666d78';
  ctx.fillRect(0, 0, w, h);

  // 1. Ground Rect Features in perspective 3D
  for (let i = 0; i < AGRA_GROUND_FEATURES.length; i++) {
    const f = AGRA_GROUND_FEATURES[i];
    const hw = f.w * 0.5;
    const hd = f.d * 0.5;
    let fill = '#6f7782';
    let y = 0.0;
    if (f.kind === 'courtyard') {
      fill = isNight ? '#4a515d' : '#737a86';
      y = 0.02;
    } else if (f.kind === 'lawn') {
      fill = isNight ? '#2c4f3a' : '#3d6f4f';
      y = 0.04;
    } else if (f.kind === 'walkway') {
      fill = isNight ? '#68717e' : '#969ea9';
      y = 0.05;
    } else if (f.kind === 'water') {
      fill = isNight ? '#304961' : '#4a6885';
      y = 0.06;
    } else if (f.kind === 'uv_zone') {
      fill = '#a855f7';
      y = 0.08;
    } else if (f.kind === 'ramp') {
      fill = '#b48a5a';
      y = 0.45;
    }

    drawProjectedPoly(
      ctx,
      [
        { x: f.x - hw, y, z: f.z - hd },
        { x: f.x + hw, y, z: f.z - hd },
        { x: f.x + hw, y, z: f.z + hd },
        { x: f.x - hw, y, z: f.z + hd },
      ],
      px,
      py,
      pz,
      cosYaw,
      sinYaw,
      w,
      h,
      focal,
      fill,
    );
  }

  // 1B. Territory Sector Zones & Flagpoles in 3D Space
  if (telemetry.territories && telemetry.territories.length > 0) {
    for (let ti = 0; ti < telemetry.territories.length; ti++) {
      const t = telemetry.territories[ti];
      const segs = 22;
      const ringPts: Vec3[] = [];
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        ringPts.push({
          x: t.x + Math.cos(ang) * t.radius,
          y: 0.14,
          z: t.z + Math.sin(ang) * t.radius,
        });
      }
      drawProjectedPoly(
        ctx,
        ringPts,
        px,
        py,
        pz,
        cosYaw,
        sinYaw,
        w,
        h,
        focal,
        t.captured ? 'rgba(56, 189, 248, 0.16)' : 'rgba(220, 38, 38, 0.16)',
        t.captured ? 'rgba(56, 189, 248, 0.78)' : 'rgba(239, 68, 68, 0.72)',
        1.2,
      );

      const cBase = toCameraSpace(t.x, 0.2, t.z, px, py, pz, cosYaw, sinYaw);
      const cTop = toCameraSpace(t.x, 4.8, t.z, px, py, pz, cosYaw, sinYaw);
      if (cBase.depth >= NEAR_PLANE && cTop.depth >= NEAR_PLANE) {
        const sBase = projectCamPt(cBase, w, h, focal);
        const sTop = projectCamPt(cTop, w, h, focal);
        ctx.beginPath();
        ctx.moveTo(sBase.x, sBase.y);
        ctx.lineTo(sTop.x, sTop.y);
        ctx.strokeStyle = t.captured ? '#38bdf8' : '#ef4444';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sTop.x, sTop.y - 3);
        ctx.lineTo(sTop.x + 6, sTop.y - 1);
        ctx.lineTo(sTop.x, sTop.y + 1.5);
        ctx.closePath();
        ctx.fillStyle = t.captured ? '#38bdf8' : '#dc2626';
        ctx.fill();
      }
    }
  }

  // 2. Active Pink/Magenta GPS Route Ribbon on the 3D ground plane
  const obj = getActiveObjective(telemetry);
  const routePts = computeAgraGpsRoute(px, pz, obj.x, obj.z);
  const denseRoute: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < routePts.length - 1; i++) {
    const a = routePts[i];
    const b = routePts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(segLen / 6));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      denseRoute.push({
        x: a.x + (b.x - a.x) * t,
        y: 0.25,
        z: a.z + (b.z - a.z) * t,
      });
    }
  }
  const lastRoute = routePts[routePts.length - 1];
  denseRoute.push({ x: lastRoute.x, y: 0.25, z: lastRoute.z });

  const projRoute: ScreenPt[] = [];
  for (let i = 0; i < denseRoute.length - 1; i++) {
    const cA = toCameraSpace(denseRoute[i].x, denseRoute[i].y, denseRoute[i].z, px, py, pz, cosYaw, sinYaw);
    const cB = toCameraSpace(
      denseRoute[i + 1].x,
      denseRoute[i + 1].y,
      denseRoute[i + 1].z,
      px,
      py,
      pz,
      cosYaw,
      sinYaw,
    );
    if (cA.depth < NEAR_PLANE && cB.depth < NEAR_PLANE) continue;
    let pA = cA;
    let pB = cB;
    if (pA.depth < NEAR_PLANE) {
      const t = (NEAR_PLANE - pA.depth) / (pB.depth - pA.depth || 1e-6);
      pA = { cx: pA.cx + (pB.cx - pA.cx) * t, cy: pA.cy + (pB.cy - pA.cy) * t, depth: NEAR_PLANE };
    } else if (pB.depth < NEAR_PLANE) {
      const t = (NEAR_PLANE - pB.depth) / (pA.depth - pB.depth || 1e-6);
      pB = { cx: pB.cx + (pA.cx - pB.cx) * t, cy: pB.cy + (pA.cy - pB.cy) * t, depth: NEAR_PLANE };
    }
    if (projRoute.length === 0) {
      projRoute.push(projectCamPt(pA, w, h, focal));
    }
    projRoute.push(projectCamPt(pB, w, h, focal));
  }

  if (projRoute.length >= 2) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(projRoute[0].x, projRoute[0].y);
    for (let i = 1; i < projRoute.length; i++) {
      ctx.lineTo(projRoute[i].x, projRoute[i].y);
    }
    ctx.strokeStyle = obj.isSafeHouse ? 'rgba(192, 132, 252, 0.35)' : 'rgba(255, 46, 147, 0.38)';
    ctx.lineWidth = 7.5;
    ctx.stroke();

    ctx.strokeStyle = obj.isSafeHouse ? '#c084fc' : '#ff3b9a';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Painter-Sorted 3D Extruded Buildings (terraces first, then buildings back-to-front)
  const lowTerraces = AGRA_BUILDINGS_3D.filter((b) => b.maxY <= 3.01);
  const tallBuildings = AGRA_BUILDINGS_3D.filter((b) => b.maxY > 3.01);

  lowTerraces
    .map((b) => ({
      b,
      depth: toCameraSpace(b.x, (b.minY + b.maxY) * 0.5, b.z, px, py, pz, cosYaw, sinYaw).depth,
    }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ b }) => draw3DBuilding(ctx, b, px, py, pz, cosYaw, sinYaw, w, h, focal, isNight));

  tallBuildings
    .map((b) => ({
      b,
      depth: toCameraSpace(b.x, (b.minY + b.maxY) * 0.5, b.z, px, py, pz, cosYaw, sinYaw).depth,
    }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ b }) => draw3DBuilding(ctx, b, px, py, pz, cosYaw, sinYaw, w, h, focal, isNight));

  // 4. Taj Mahal Domes & Corner Minarets (back-to-front)
  AGRA_DOMES_3D.map((d) => ({
    d,
    depth: toCameraSpace(d.x, d.baseY, d.z, px, py, pz, cosYaw, sinYaw).depth,
  }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ d }) => draw3DDomeOrMinaret(ctx, d, px, py, pz, cosYaw, sinYaw, w, h, focal));

  // 5. Elevated 3D Ziplines
  ctx.save();
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.72)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  for (let i = 0; i < AGRA_ZIPLINES.length; i++) {
    const z = AGRA_ZIPLINES[i];
    const cA = toCameraSpace(z.sx, z.sy + 1.8, z.sz, px, py, pz, cosYaw, sinYaw);
    const cB = toCameraSpace(z.ex, z.ey + 1.8, z.ez, px, py, pz, cosYaw, sinYaw);
    if (cA.depth < NEAR_PLANE || cB.depth < NEAR_PLANE) continue;
    const sA = projectCamPt(cA, w, h, focal);
    const sB = projectCamPt(cB, w, h, focal);
    ctx.beginPath();
    ctx.moveTo(sA.x, sA.y);
    ctx.lineTo(sB.x, sB.y);
    ctx.stroke();
  }
  ctx.restore();

  // 6. Enemy Blips in 3D Space
  const pulse = 0.5 + 0.5 * Math.sin(elapsedSec * 7);
  for (let i = 0; i < telemetry.enemies.length; i++) {
    const e = telemetry.enemies[i];
    const c = toCameraSpace(e.x, 0.9, e.z, px, py, pz, cosYaw, sinYaw);
    if (c.depth < NEAR_PLANE || c.depth > 110) continue;
    const s = projectCamPt(c, w, h, focal);
    if (s.x < -8 || s.x > w + 8 || s.y < -8 || s.y > h + 8) continue;

    if (e.kind === 'night_runner') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6.0 + pulse * 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 34, 0, ${0.55 + pulse * 0.45})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else if (e.kind === 'runner') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, e.kind === 'brute' ? 3.2 : e.kind === 'night_runner' ? 3.0 : 2.3, 0, Math.PI * 2);
    ctx.fillStyle =
      e.kind === 'night_runner'
        ? '#ff2200'
        : e.kind === 'runner' || e.alerted
          ? '#ef4444'
          : '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // 6B. Allied Survivor Blips in 3D (#00d8ff)
  if (telemetry.allies && telemetry.allies.length > 0) {
    for (let i = 0; i < telemetry.allies.length; i++) {
      const a = telemetry.allies[i];
      const cam = toCameraSpace(a.x, 0.9, a.z, px, py, pz, cosYaw, sinYaw);
      if (cam.depth < NEAR_PLANE) continue;
      const s = projectCamPt(cam, w, h, focal);
      if (s.x < -8 || s.x > w + 8 || s.y < -8 || s.y > h + 8) continue;

      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 216, 255, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = '#00d8ff';
      ctx.fill();
      ctx.strokeStyle = '#083344';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  }

  // 7. Uncollected Antizin Crates in 3D (elevation stem + cyan diamond)
  for (let i = 0; i < telemetry.crates.length; i++) {
    const cr = telemetry.crates[i];
    if (cr.collected) continue;
    const cTop = toCameraSpace(cr.x, cr.y + 1.4, cr.z, px, py, pz, cosYaw, sinYaw);
    const cBase = toCameraSpace(cr.x, cr.y, cr.z, px, py, pz, cosYaw, sinYaw);
    if (cTop.depth < NEAR_PLANE) continue;
    const sTop = projectCamPt(cTop, w, h, focal);
    const sBase = projectCamPt(cBase, w, h, focal);

    ctx.beginPath();
    ctx.moveTo(sBase.x, sBase.y);
    ctx.lineTo(sTop.x, sTop.y);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sTop.x, sTop.y - 4.5);
    ctx.lineTo(sTop.x + 4.5, sTop.y);
    ctx.lineTo(sTop.x, sTop.y + 4.5);
    ctx.lineTo(sTop.x - 4.5, sTop.y);
    ctx.closePath();
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.strokeStyle = '#083344';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 8. Player Cursor at Projected Ground Origin
  const pCam = toCameraSpace(px, py, pz, px, py, pz, cosYaw, sinYaw);
  const pScr = projectCamPt(pCam, w, h, focal);
  drawPlayerArrow(ctx, pScr.x, pScr.y);

  // 9. Edge Waypoint Pin, Distance & Dynamic North Badge
  const objDx = obj.x - px;
  const objDz = obj.z - pz;
  const objRelX = objDx * cosYaw - objDz * sinYaw;
  const objRelFwd = -objDx * sinYaw - objDz * cosYaw;
  const pinPos = computeEdgeBadgePos(objRelX, objRelFwd, w, h, 8);
  drawDistanceAndPin(ctx, obj.distance, pinPos.x, pinPos.y, obj.isSafeHouse);

  const northRelX = sinYaw;
  const northRelFwd = cosYaw;
  const northPos = computeEdgeBadgePos(northRelX, northRelFwd, w, h, 10);
  drawNorthBadge(ctx, northPos.x, northPos.y);
}

function render2DMinimap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  telemetry: MinimapTelemetry,
  isNight: boolean,
  elapsedSec: number,
): void {
  const px = telemetry.playerX;
  const pz = telemetry.playerZ;
  const cosYaw = Math.cos(telemetry.playerYaw);
  const sinYaw = Math.sin(telemetry.playerYaw);

  const scale = 2.05; // pixels per meter
  const playerScreenX = w * 0.5;
  const playerScreenY = h * 0.7;

  const worldTo2D = (wx: number, wz: number) => {
    const dx = wx - px;
    const dz = wz - pz;
    const relX = dx * cosYaw - dz * sinYaw;
    const relFwd = -dx * sinYaw - dz * cosYaw;
    return {
      x: playerScreenX + relX * scale,
      y: playerScreenY - relFwd * scale,
    };
  };

  // Matte GTA 2D Map backdrop
  ctx.fillStyle = isNight ? '#3c424b' : '#636a75';
  ctx.fillRect(0, 0, w, h);

  // Transform canvas directly into player-relative 2D space so rotated footprints stay razor sharp!
  ctx.save();
  ctx.translate(playerScreenX, playerScreenY);
  ctx.scale(scale, scale);
  // Rotate so player's forward (-sin(yaw), -cos(yaw)) maps to -Y (screen up)
  ctx.rotate(telemetry.playerYaw);
  ctx.translate(-px, -pz);

  // 1. Flat 2D Ground Layers & Road Markings
  for (let i = 0; i < AGRA_GROUND_FEATURES.length; i++) {
    const f = AGRA_GROUND_FEATURES[i];
    const x0 = f.x - f.w * 0.5;
    const z0 = f.z - f.d * 0.5;
    if (f.kind === 'courtyard') {
      ctx.fillStyle = isNight ? '#49505b' : '#707783';
      ctx.fillRect(x0, z0, f.w, f.d);
    } else if (f.kind === 'lawn') {
      ctx.fillStyle = isNight ? '#2a4d38' : '#3d6f4f';
      ctx.fillRect(x0, z0, f.w, f.d);
    } else if (f.kind === 'walkway') {
      ctx.fillStyle = isNight ? '#68717e' : '#969ea9';
      ctx.fillRect(x0, z0, f.w, f.d);
      // Crisp amber/sandstone lane borders matching the 2D GPS reference
      ctx.strokeStyle = 'rgba(217, 179, 124, 0.58)';
      ctx.lineWidth = 0.45;
      ctx.strokeRect(x0, z0, f.w, f.d);
    } else if (f.kind === 'water') {
      ctx.fillStyle = isNight ? '#2e475f' : '#4a6885';
      ctx.fillRect(x0, z0, f.w, f.d);
    } else if (f.kind === 'uv_zone') {
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(x0, z0, f.w, f.d);
    } else if (f.kind === 'ramp') {
      ctx.fillStyle = '#c29763';
      ctx.fillRect(x0, z0, f.w, f.d);
    }
  }

  // 1B. Territory Boundaries & Flagpoles in 2D Blueprint Space
  if (telemetry.territories && telemetry.territories.length > 0) {
    for (let ti = 0; ti < telemetry.territories.length; ti++) {
      const t = telemetry.territories[ti];
      ctx.beginPath();
      ctx.arc(t.x, t.z, t.radius, 0, Math.PI * 2);
      ctx.fillStyle = t.captured ? 'rgba(56, 189, 248, 0.16)' : 'rgba(220, 38, 38, 0.14)';
      ctx.fill();
      ctx.strokeStyle = t.captured ? 'rgba(56, 189, 248, 0.82)' : 'rgba(239, 68, 68, 0.78)';
      ctx.lineWidth = 0.75;
      ctx.stroke();

      // Flagpole marker at center
      ctx.beginPath();
      ctx.arc(t.x, t.z, 1.35, 0, Math.PI * 2);
      ctx.fillStyle = t.captured ? '#38bdf8' : '#ef4444';
      ctx.fill();
    }
  }

  // 2. Flat 2D Building Footprints (no 3D extrusion)
  for (let i = 0; i < AGRA_BUILDINGS_3D.length; i++) {
    const b = AGRA_BUILDINGS_3D[i];
    const x0 = b.x - b.w * 0.5;
    const z0 = b.z - b.d * 0.5;
    ctx.fillStyle = b.id.startsWith('taj_maus') || b.id === 'taj_plinth'
      ? isNight ? '#cbc4b7' : '#e6e0d5'
      : isNight ? '#343942' : '#525862';
    ctx.fillRect(x0, z0, b.w, b.d);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(x0, z0, b.w, b.d);
  }

  // 2D Dome & Minaret Blueprint Circles on Taj Mahal
  for (let i = 0; i < AGRA_DOMES_3D.length; i++) {
    const d = AGRA_DOMES_3D[i];
    ctx.beginPath();
    ctx.arc(d.x, d.z, d.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f1ea';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  // 3. Zipline Dashed Tactical Lines
  ctx.save();
  ctx.setLineDash([1.8, 1.8]);
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.78)';
  ctx.lineWidth = 0.65;
  for (let i = 0; i < AGRA_ZIPLINES.length; i++) {
    const z = AGRA_ZIPLINES[i];
    ctx.beginPath();
    ctx.moveTo(z.sx, z.sz);
    ctx.lineTo(z.ex, z.ez);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Glowing Pink/Magenta 2D GPS Route Path
  const obj = getActiveObjective(telemetry);
  const routePts = computeAgraGpsRoute(px, pz, obj.x, obj.z);
  if (routePts.length >= 2) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(routePts[0].x, routePts[0].z);
    for (let i = 1; i < routePts.length; i++) {
      ctx.lineTo(routePts[i].x, routePts[i].z);
    }
    ctx.strokeStyle = obj.isSafeHouse ? 'rgba(192, 132, 252, 0.38)' : 'rgba(255, 46, 147, 0.4)';
    ctx.lineWidth = 3.8;
    ctx.stroke();

    ctx.strokeStyle = obj.isSafeHouse ? '#c084fc' : '#ff3b9a';
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // 5. Player Vision Cone (pointing upward in screen space)
  ctx.save();
  const coneGrad = ctx.createRadialGradient(playerScreenX, playerScreenY, 2, playerScreenX, playerScreenY, 44);
  coneGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  coneGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(playerScreenX, playerScreenY);
  ctx.arc(playerScreenX, playerScreenY, 44, -Math.PI * 0.5 - 0.42, -Math.PI * 0.5 + 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 6. Enemy Blips in 2D Screen Space
  const pulse = 0.5 + 0.5 * Math.sin(elapsedSec * 7);
  for (let i = 0; i < telemetry.enemies.length; i++) {
    const e = telemetry.enemies[i];
    const s = worldTo2D(e.x, e.z);
    if (s.x < -8 || s.x > w + 8 || s.y < -8 || s.y > h + 8) continue;

    if (e.kind === 'night_runner') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6.0 + pulse * 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 34, 0, ${0.55 + pulse * 0.45})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else if (e.kind === 'runner') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, e.kind === 'brute' ? 3.2 : e.kind === 'night_runner' ? 3.0 : 2.3, 0, Math.PI * 2);
    ctx.fillStyle =
      e.kind === 'night_runner'
        ? '#ff2200'
        : e.kind === 'runner' || e.alerted
          ? '#ef4444'
          : '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // 6B. Allied Survivor Blips in 2D (#00d8ff)
  if (telemetry.allies && telemetry.allies.length > 0) {
    for (let i = 0; i < telemetry.allies.length; i++) {
      const a = telemetry.allies[i];
      const s = worldTo2D(a.x, a.z);
      if (s.x < -8 || s.x > w + 8 || s.y < -8 || s.y > h + 8) continue;

      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 216, 255, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = '#00d8ff';
      ctx.fill();
      ctx.strokeStyle = '#083344';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  }

  // 7. Uncollected Antizin Crate Markers
  for (let i = 0; i < telemetry.crates.length; i++) {
    const cr = telemetry.crates[i];
    if (cr.collected) continue;
    const s = worldTo2D(cr.x, cr.z);
    if (s.x < -8 || s.x > w + 8 || s.y < -8 || s.y > h + 8) continue;
    ctx.fillStyle = '#22d3ee';
    ctx.strokeStyle = '#083344';
    ctx.lineWidth = 1.1;
    ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
    ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
  }

  // 8. Player Cursor + Edge Pin + Distance + Dynamic North Badge
  drawPlayerArrow(ctx, playerScreenX, playerScreenY);

  const objDx = obj.x - px;
  const objDz = obj.z - pz;
  const objRelX = objDx * cosYaw - objDz * sinYaw;
  const objRelFwd = -objDx * sinYaw - objDz * cosYaw;
  const pinPos = computeEdgeBadgePos(objRelX, objRelFwd, w, h, 8);
  drawDistanceAndPin(ctx, obj.distance, pinPos.x, pinPos.y, obj.isSafeHouse);

  const northRelX = sinYaw;
  const northRelFwd = cosYaw;
  const northPos = computeEdgeBadgePos(northRelX, northRelFwd, w, h, 10);
  drawNorthBadge(ctx, northPos.x, northPos.y);
}

export const DualMinimaps: React.FC<DualMinimapsProps> = ({
  hud,
  getLiveMinimapTelemetry,
}) => {
  const canvas3dRef = useRef<HTMLCanvasElement | null>(null);
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HudSnapshot>(hud);
  const getterRef = useRef(getLiveMinimapTelemetry);

  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  useEffect(() => {
    getterRef.current = getLiveMinimapTelemetry;
  }, [getLiveMinimapTelemetry]);

  useEffect(() => {
    let rafId = 0;
    const startMs = performance.now();

    const drawFrame = (now: number) => {
      const c3d = canvas3dRef.current;
      const c2d = canvas2dRef.current;
      const currentHud = hudRef.current;
      const telemetry = getterRef.current?.() ?? currentHud.minimap;

      if (c3d && c2d && telemetry) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const elapsedSec = (now - startMs) * 0.001;

        for (const [canvas, renderer] of [
          [c3d, render3DMinimap],
          [c2d, render2DMinimap],
        ] as const) {
          const rect = canvas.getBoundingClientRect();
          const cssW = Math.max(120, Math.round(rect.width));
          const cssH = Math.max(70, Math.round(rect.height));
          const targetW = Math.round(cssW * dpr);
          const targetH = Math.round(cssH * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            renderer(ctx, cssW, cssH, telemetry, currentHud.isNight, elapsedSec);
          }
        }
      }

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="flex flex-col gap-2.5 select-none">
      {/* 3D Perspective Isometric Minimap */}
      <div className="relative h-[108px] w-[192px] sm:h-[124px] sm:w-[224px] overflow-hidden rounded-xl border border-white/25 bg-[#525863] shadow-[0_8px_22px_rgba(0,0,0,0.68)]">
        <canvas ref={canvas3dRef} className="block h-full w-full" />
        <span
          className="pointer-events-none absolute right-2 top-1.5 rounded bg-black/65 px-1.5 py-0.5 font-display text-[10px] font-bold tracking-wider text-emerald-300"
          aria-label="3D Minimap"
        >
          3D
        </span>
      </div>

      {/* 2D Top-Down Tactical Minimap */}
      <div className="relative h-[108px] w-[192px] sm:h-[124px] sm:w-[224px] overflow-hidden rounded-xl border border-white/25 bg-[#525863] shadow-[0_8px_22px_rgba(0,0,0,0.68)]">
        <canvas ref={canvas2dRef} className="block h-full w-full" />
        <span
          className="pointer-events-none absolute right-2 top-1.5 rounded bg-black/65 px-1.5 py-0.5 font-display text-[10px] font-bold tracking-wider text-rose-300"
          aria-label="2D Minimap"
        >
          2D
        </span>
      </div>
    </div>
  );
};
