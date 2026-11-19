import * as THREE from 'three';
import type { AwakeningViewmodelPose } from './awakening';
import type { ProceduralTextureSet } from './textures';
import { WEAPONS_BY_ID, type WeaponId } from './weapons';

export type WeaponAnimState =
  | 'idle'
  | 'swing_left'
  | 'swing_right'
  | 'parry'
  | 'takedown'
  | 'blocked'
  | 'inspect'
  | 'intro_ready';

export interface ParkourAnimDetail {
  bobX: number;
  bobY: number;
  strafeInput: number;
  vaultProgress: number;
  mantleProgress: number;
  rollProgress: number;
  isNight?: boolean;
  inSafeZone?: boolean;
  horizSpeed?: number;
  yawDelta?: number;
  pitchDelta?: number;
  wallPullback?: number;
  climbState?: 'NONE' | 'WALL_SCRAMBLE' | 'MUSCLE_UP';
  climbPhaseTime?: number;
  scrambleSide?: number;
  leftGripWorld?: THREE.Vector3;
  rightGripWorld?: THREE.Vector3;
  ledgeNormalWorld?: THREE.Vector3;
  awakeningActive?: boolean;
  awakeningPose?: AwakeningViewmodelPose;
  awakeningBatEmissive?: THREE.Color | null;
  awakeningBatEmissiveIntensity?: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface DustParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface ActiveFirecracker {
  mesh: THREE.Group;
  light: THREE.PointLight;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  banged: boolean;
  lureDuration: number;
  sparkTimer: number;
}

interface FingerJoints {
  mcp: THREE.Group;
  pip: THREE.Group;
  dip: THREE.Group;
}

interface ThumbJoints {
  cmc: THREE.Group;
  mcp: THREE.Group;
  ip: THREE.Group;
}

type LeftHandPose = 'RELAXED_IDLE' | 'OPEN_REACH' | 'FIST_CLENCH' | 'LEDGE_CLAMP' | 'PALM_PRESS';
type RightHandPose = 'UNARMED_READY' | 'TIGHT_FIST' | 'WEAPON_GRIP' | 'PARKOUR_OPEN';

interface FingerAngles {
  mcp: number;
  pip: number;
  dip: number;
  splay: number;
}

const DEG2RAD = Math.PI / 180;

// Exact Left-Hand finger state targets (degrees)
const LEFT_POSE_TABLE: Record<
  LeftHandPose,
  {
    fingers: [FingerAngles, FingerAngles, FingerAngles, FingerAngles]; // Index, Middle, Ring, Pinky
    thumb: { cmcX: number; cmcY: number; cmcZ: number; mcp: number; ip: number };
  }
> = {
  RELAXED_IDLE: {
    fingers: [
      { mcp: 14, pip: 18, dip: 12, splay: -3.5 }, // Index (lead pointer)
      { mcp: 22, pip: 26, dip: 16, splay: -1.0 }, // Middle (slightly deeper curl)
      { mcp: 30, pip: 34, dip: 20, splay: 1.5 }, // Ring
      { mcp: 38, pip: 42, dip: 24, splay: 4.0 }, // Pinky
    ],
    thumb: { cmcX: 18, cmcY: -26, cmcZ: -32, mcp: 18, ip: 16 },
  },
  OPEN_REACH: {
    fingers: [
      { mcp: 6, pip: 8, dip: 5, splay: -6.0 },
      { mcp: 7, pip: 9, dip: 6, splay: -2.0 },
      { mcp: 8, pip: 10, dip: 6, splay: 2.0 },
      { mcp: 10, pip: 10, dip: 7, splay: 6.0 },
    ],
    thumb: { cmcX: 8, cmcY: -10, cmcZ: -34, mcp: 6, ip: 4 },
  },
  FIST_CLENCH: {
    fingers: [
      { mcp: 85, pip: 95, dip: 70, splay: 0 },
      { mcp: 85, pip: 95, dip: 70, splay: 0 },
      { mcp: 85, pip: 95, dip: 70, splay: 0 },
      { mcp: 85, pip: 95, dip: 70, splay: 0 },
    ],
    thumb: { cmcX: 52, cmcY: -48, cmcZ: 16, mcp: 48, ip: 55 },
  },
  LEDGE_CLAMP: {
    fingers: [
      { mcp: 32, pip: 88, dip: 78, splay: -3.0 },
      { mcp: 32, pip: 88, dip: 78, splay: -1.0 },
      { mcp: 34, pip: 86, dip: 76, splay: 1.0 },
      { mcp: 36, pip: 84, dip: 74, splay: 3.0 },
    ],
    thumb: { cmcX: 28, cmcY: -24, cmcZ: -12, mcp: 34, ip: 32 },
  },
  PALM_PRESS: {
    fingers: [
      { mcp: -18, pip: 14, dip: 10, splay: -5.0 },
      { mcp: -18, pip: 14, dip: 10, splay: -1.5 },
      { mcp: -16, pip: 16, dip: 12, splay: 1.5 },
      { mcp: -14, pip: 18, dip: 14, splay: 5.0 },
    ],
    thumb: { cmcX: 10, cmcY: -14, cmcZ: -32, mcp: 8, ip: 6 },
  },
};

// Right-Hand 4-state articulated finger targets (degrees, Index -> Pinky)
const RIGHT_POSE_TABLE: Record<
  RightHandPose,
  {
    fingers: [FingerAngles, FingerAngles, FingerAngles, FingerAngles];
    thumb: { cmcX: number; cmcY: number; cmcZ: number; mcp: number; ip: number };
  }
> = {
  // State A: Unarmed / Parkour Ready — natural relaxed semi-fist (45 / 55 / 35)
  UNARMED_READY: {
    fingers: [
      { mcp: 42, pip: 52, dip: 32, splay: 2.5 },
      { mcp: 45, pip: 55, dip: 35, splay: 0.6 },
      { mcp: 48, pip: 58, dip: 37, splay: -1.2 },
      { mcp: 52, pip: 62, dip: 40, splay: -3.0 },
    ],
    thumb: { cmcX: 28, cmcY: -22, cmcZ: 8, mcp: 24, ip: 22 },
  },
  // State B: Tight Combat Fist — clenched 85°-95° with thumb locked across index/middle
  TIGHT_FIST: {
    fingers: [
      { mcp: 88, pip: 95, dip: 86, splay: 0 },
      { mcp: 88, pip: 95, dip: 86, splay: 0 },
      { mcp: 89, pip: 95, dip: 86, splay: 0 },
      { mcp: 90, pip: 94, dip: 85, splay: 0 },
    ],
    thumb: { cmcX: 54, cmcY: -46, cmcZ: 20, mcp: 48, ip: 56 },
  },
  // State C: Weapon Grip Pose — wraps around equipped weapon's gripRadius
  WEAPON_GRIP: {
    fingers: [
      { mcp: 78, pip: 78, dip: 64, splay: -8.5 },
      { mcp: 80, pip: 78, dip: 64, splay: -9.5 },
      { mcp: 81, pip: 79, dip: 64, splay: -10.0 },
      { mcp: 83, pip: 80, dip: 65, splay: -10.5 },
    ],
    thumb: { cmcX: 46, cmcY: -36, cmcZ: 12, mcp: 38, ip: 40 },
  },
  // State D: Parkour Vault & Ledge Grab Pose — splayed open 10°-15°
  PARKOUR_OPEN: {
    fingers: [
      { mcp: 10, pip: 12, dip: 9, splay: 5.5 },
      { mcp: 11, pip: 14, dip: 10, splay: 1.8 },
      { mcp: 12, pip: 15, dip: 11, splay: -1.8 },
      { mcp: 14, pip: 16, dip: 12, splay: -5.5 },
    ],
    thumb: { cmcX: 10, cmcY: -12, cmcZ: -32, mcp: 8, ip: 6 },
  },
};

// Pre-allocated math helpers (zero GC inside update loop)
const _toTarget = new THREE.Vector3();
const _uDir = new THREE.Vector3();
const _poleProj = new THREE.Vector3();
const _sideAxis = new THREE.Vector3();
const _upperDir = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _shoulderBase = new THREE.Vector3();
const _leftTargetPos = new THREE.Vector3();
const _rightTargetPos = new THREE.Vector3();
const _leftEuler = new THREE.Euler();
const _rightEuler = new THREE.Euler();
const _leftTargetQuat = new THREE.Quaternion();
const _rightTargetQuat = new THREE.Quaternion();
const _parentWorldQuat = new THREE.Quaternion();
const _invParentQuat = new THREE.Quaternion();
const _vmWorldQuat = new THREE.Quaternion();
const _vmInvWorldQuat = new THREE.Quaternion();
const _vmWorldPos = new THREE.Vector3();
const _tipWorld = new THREE.Vector3();
const _baseWorld = new THREE.Vector3();
const _trailLocalTip = new THREE.Vector3();
const _trailLocalBase = new THREE.Vector3();
const _leftPole = new THREE.Vector3(-0.36, -0.88, 0.18).normalize();
const _rightPole = new THREE.Vector3(0.62, -0.82, 0.24).normalize();
const _ikLeftLocal = new THREE.Vector3();
const _ikRightLocal = new THREE.Vector3();
const _ikReachVec = new THREE.Vector3();
const _ikLeftShoulder = new THREE.Vector3(-0.28, -0.46, 0.02);
const _ikRightShoulder = new THREE.Vector3(0.36, -0.5, 0.04);

const TRAIL_SEGMENTS = 14;

function smoothGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.computeVertexNormals();
  return geo;
}

/**
 * Adds subtle baked ambient-occlusion vertex colors along Y (0 = proximal crease, 1 = distal end)
 * so skin creases near knuckles, wrist wraps, and sleeve cuffs never wash out under harsh lights.
 */
function applySkinVertexAO<T extends THREE.BufferGeometry>(
  geo: T,
  bottomAO = 0.74,
  midAO = 1.0,
  topAO = 0.86,
): T {
  const pos = geo.attributes.position;
  if (!pos) return geo;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(0.0001, maxY - minY);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    const bell = Math.sin(t * Math.PI);
    const endMix = THREE.MathUtils.lerp(bottomAO, topAO, t);
    const ao = THREE.MathUtils.lerp(endMix, midAO, bell * 0.85);
    // Subtle warm grime shift in AO shadows
    colors[i * 3] = ao;
    colors[i * 3 + 1] = ao * (0.95 + 0.05 * ao);
    colors[i * 3 + 2] = ao * (0.92 + 0.08 * ao);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Creates a smooth subdivided tapered limb segment along +Y from y=0 to y=length
 * with organic mid-belly muscle contouring (no boxy primitives).
 */
function createTaperedLimbGeo(
  radiusBottom: number,
  radiusMid: number,
  radiusTop: number,
  length: number,
  radialSegments = 12,
  capSegments = 6,
): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  // Bottom cap dome
  for (let i = 0; i <= capSegments; i++) {
    const t = (i / capSegments) * (Math.PI * 0.5);
    const r = Math.max(0.0005, Math.sin(t) * radiusBottom);
    const y = (1 - Math.cos(t)) * radiusBottom * 0.45;
    pts.push(new THREE.Vector2(r, y));
  }
  // Organic muscle-contoured shaft
  const shaftSteps = 8;
  for (let i = 1; i < shaftSteps; i++) {
    const u = i / shaftSteps;
    const bell = Math.sin(u * Math.PI);
    const linear = THREE.MathUtils.lerp(radiusBottom, radiusTop, u);
    const r = THREE.MathUtils.lerp(linear, radiusMid, bell * 0.55);
    pts.push(new THREE.Vector2(r, u * length));
  }
  // Top cap dome
  for (let i = 0; i <= capSegments; i++) {
    const t = (i / capSegments) * (Math.PI * 0.5);
    const r = Math.max(0.0005, Math.cos(t) * radiusTop);
    const y = length - radiusTop * 0.35 + Math.sin(t) * radiusTop * 0.45;
    pts.push(new THREE.Vector2(r, y));
  }
  return smoothGeo(new THREE.LatheGeometry(pts, radialSegments));
}

/**
 * Applies warm weathered survivor vertex shading (#C88D6B base -> #A86E50 in creases, hollows, wrist & tip dirt)
 * for bare-hand meshes whose material base color is #C88D6B.
 */
function applyLeftBareSkinShading<T extends THREE.BufferGeometry>(
  geo: T,
  mode: 'forearm' | 'palm' | 'phalanx' | 'web',
): T {
  const pos = geo.attributes.position;
  if (!pos) return geo;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(0.0001, maxY - minY);
  const colors = new Float32Array(pos.count * 3);

  // Target #A86E50 relative to #C88D6B base => (0.84, 0.78, 0.75)
  const creaseR = 0.84;
  const creaseG = 0.78;
  const creaseB = 0.75;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y - minY) / span;
    let warmth = 0; // 0 = clean #C88D6B, 1 = deep #A86E50 crease/dirt

    if (mode === 'forearm') {
      // Sleeve edge grime + wrist bone crease + subtle inner-forearm ventral shadow
      const cuffAO = Math.max(0, 1 - t / 0.16) * 0.78;
      const wristAO = Math.max(0, (t - 0.84) / 0.16) * 0.65;
      const ventralAO = z < 0 ? Math.min(0.45, (-z / 0.036) * 0.45) : 0;
      warmth = Math.min(1, Math.max(cuffAO, wristAO) + ventralAO * 0.55);
    } else if (mode === 'palm') {
      // Palmar hollow, wrist crease, tendon valleys, and subtle knuckle dirt
      const wristCrease = Math.max(0, 1 - t / 0.2) * 0.68;
      const palmHollow = z < -0.002 ? Math.min(0.85, (-z / 0.013) * 0.7 + (1 - Math.abs(x) / 0.038) * 0.25) : 0;
      const tendonValley = z > 0.002 ? Math.max(0, 0.5 - 0.5 * Math.cos((x / 0.018) * Math.PI * 2)) * 0.35 : 0;
      const knuckleWeather = t > 0.78 && z > 0.004 ? ((t - 0.78) / 0.22) * 0.35 : 0;
      warmth = Math.min(1, Math.max(wristCrease, palmHollow, tendonValley + knuckleWeather));
    } else if (mode === 'phalanx') {
      // Knuckle flexion creases at both ends + light dirt weathering near distal tip
      const proxCrease = Math.max(0, 1 - t / 0.22) * 0.75;
      const distCrease = Math.max(0, (t - 0.78) / 0.22) * 0.62;
      const palmarShade = z < 0 ? 0.28 : 0;
      warmth = Math.min(1, Math.max(proxCrease, distCrease) + palmarShade);
    } else {
      // Purlicue web crease transition
      warmth = 0.55;
    }

    colors[i * 3] = THREE.MathUtils.lerp(1.0, creaseR, warmth);
    colors[i * 3 + 1] = THREE.MathUtils.lerp(1.0, creaseG, warmth);
    colors[i * 3 + 2] = THREE.MathUtils.lerp(1.0, creaseB, warmth);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Custom lofted multi-ring bare forearm (12 radial segments, 8 longitudinal rings, closed caps)
 * with outer brachioradialis muscle bulge, flatter ventral inner plane, and ulnar/radial styloid wrist bones.
 */
function createAnatomicalForearmGeo(yStart: number, yEnd: number): THREE.BufferGeometry {
  const radSegs = 12;
  const rings = 8;
  const span = yEnd - yStart;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const u = r / rings;
    const y = yStart + u * span;
    // Muscular taper: fuller upper-mid forearm -> narrow oval wrist
    const baseR =
      u < 0.35
        ? THREE.MathUtils.lerp(0.047, 0.0435, u / 0.35)
        : THREE.MathUtils.lerp(0.0435, 0.0285, (u - 0.35) / 0.65);

    for (let s = 0; s < radSegs; s++) {
      const theta = (s / radSegs) * Math.PI * 2;
      const cosT = Math.cos(theta); // +X = radial (thumb side), -X = ulnar (outer left)
      const sinT = Math.sin(theta); // +Z = dorsal (back), -Z = ventral (inner palm)

      let rx = baseR * 1.1;
      let rz = baseR * 0.84;

      // Outer brachioradialis muscle belly bulge along dorsal-radial & outer upper forearm
      const brachioBell = Math.sin(THREE.MathUtils.clamp((u - 0.05) / 0.6, 0, 1) * Math.PI);
      if (cosT < 0.25 && sinT > -0.35) {
        rx += brachioBell * 0.0046;
        rz += brachioBell * 0.0032;
      }

      // Flatter ventral (-Z) inner forearm plane
      if (sinT < 0) {
        rz *= 0.86;
      }

      // Subtle ulnar (-X, +Z) & radial (+X) styloid wrist bone bumps just behind wrist joint
      const styloidBell = Math.exp(-Math.pow((u - 0.9) / 0.08, 2));
      if (cosT < -0.5 && sinT > 0.1) {
        rx += styloidBell * 0.0028;
        rz += styloidBell * 0.0022;
      } else if (cosT > 0.65 && Math.abs(sinT) < 0.65) {
        rx += styloidBell * 0.0022;
      }

      positions.push(cosT * rx, y, sinT * rz);
      uvs.push(s / radSegs, u);
    }
  }

  for (let r = 0; r < rings; r++) {
    const row0 = r * radSegs;
    const row1 = (r + 1) * radSegs;
    for (let s = 0; s < radSegs; s++) {
      const next = (s + 1) % radSegs;
      const a = row0 + s;
      const b = row0 + next;
      const c = row1 + s;
      const d = row1 + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Closed proximal & distal end caps
  const botCenterIdx = positions.length / 3;
  positions.push(0, yStart, 0);
  uvs.push(0.5, 0);
  for (let s = 0; s < radSegs; s++) {
    indices.push(botCenterIdx, s, (s + 1) % radSegs);
  }

  const topCenterIdx = positions.length / 3;
  positions.push(0, yEnd, 0);
  uvs.push(0.5, 1);
  const topRow = rings * radSegs;
  for (let s = 0; s < radSegs; s++) {
    indices.push(topCenterIdx, topRow + ((s + 1) % radSegs), topRow + s);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return applyLeftBareSkinShading(smoothGeo(geo), 'forearm');
}

/**
 * Thick multi-layered folded sleeve cuff with jagged stylized fabric creases at forearm base.
 */
function createFoldedSleeveCuffGeo(yStart: number, yEnd: number): THREE.BufferGeometry {
  const radSegs = 12;
  const rings = 5;
  const span = yEnd - yStart;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const u = r / rings;
    const yBase = yStart + u * span;
    const cuffFlare = u > 0.55 ? Math.sin(((u - 0.55) / 0.45) * Math.PI) * 0.0065 : 0;
    const baseR = THREE.MathUtils.lerp(0.052, 0.047, u) + cuffFlare;

    for (let s = 0; s < radSegs; s++) {
      const theta = (s / radSegs) * Math.PI * 2;
      const crease =
        Math.sin(theta * 5 + r * 0.9) * 0.0028 +
        Math.cos(theta * 3 - r * 0.6) * 0.0022;
      const rLocal = baseR + crease;
      const yRipple = u > 0.7 ? Math.sin(theta * 4 + s * 0.4) * 0.0038 : 0;
      positions.push(Math.cos(theta) * rLocal * 1.08, yBase + yRipple, Math.sin(theta) * rLocal * 0.88);
      uvs.push(s / radSegs, u);
    }
  }

  for (let r = 0; r < rings; r++) {
    const row0 = r * radSegs;
    const row1 = (r + 1) * radSegs;
    for (let s = 0; s < radSegs; s++) {
      const next = (s + 1) % radSegs;
      indices.push(row0 + s, row1 + s, row0 + next, row0 + next, row1 + s, row1 + next);
    }
  }

  const botIdx = positions.length / 3;
  positions.push(0, yStart, 0);
  uvs.push(0.5, 0);
  for (let s = 0; s < radSegs; s++) {
    indices.push(botIdx, s, (s + 1) % radSegs);
  }
  const topIdx = positions.length / 3;
  positions.push(0, yEnd, 0);
  uvs.push(0.5, 1);
  const topRow = rings * radSegs;
  for (let s = 0; s < radSegs; s++) {
    indices.push(topIdx, topRow + ((s + 1) % radSegs), topRow + s);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return smoothGeo(geo);
}

/**
 * Wedge-tapered bare palm geometry with arched dorsum (+Z), 4 extensor tendon ridges,
 * concave palmar hollow (-Z), and thenar pad fullness on radial (+X) base.
 */
function createBarePalmGeo(): THREE.BufferGeometry {
  const radSegs = 12;
  const rings = 6;
  const yStart = -0.005;
  const yEnd = 0.083;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const u = r / rings;
    const y = THREE.MathUtils.lerp(yStart, yEnd, u);
    const halfWidth = THREE.MathUtils.lerp(0.029, 0.04, Math.sin(u * Math.PI * 0.68));
    const halfThick = THREE.MathUtils.lerp(0.0135, 0.0108, u);

    for (let s = 0; s < radSegs; s++) {
      const theta = (s / radSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let x = cosT * halfWidth;
      let z = sinT * halfThick;

      // Dorsal arch & 4 extensor tendon ridges fanning from wrist toward knuckles
      if (sinT > 0.15) {
        const arch = (1 - cosT * cosT * 0.55) * 0.0026;
        const tendonFan = Math.pow(0.5 + 0.5 * Math.cos(cosT * 3.8 * Math.PI), 2) * 0.0014 * Math.sin(u * Math.PI);
        z += arch + tendonFan;
      }

      // Concave palm hollow (-Z) + thenar swelling on radial (+X) wrist base
      if (sinT < -0.15) {
        const hollow = (1 - cosT * cosT) * 0.0024 * Math.sin(u * Math.PI);
        z += hollow;
        if (cosT > 0.25 && u < 0.58) {
          const thenarBell = Math.sin((u / 0.58) * Math.PI);
          z -= thenarBell * 0.0038 * cosT;
          x += thenarBell * 0.0024;
        }
      }

      // Subtle ulnar heel ridge (-X)
      if (cosT < -0.65 && u < 0.5) {
        x -= Math.sin((u / 0.5) * Math.PI) * 0.002;
      }

      positions.push(x, y, z);
      uvs.push(s / radSegs, u);
    }
  }

  for (let r = 0; r < rings; r++) {
    const row0 = r * radSegs;
    const row1 = (r + 1) * radSegs;
    for (let s = 0; s < radSegs; s++) {
      const next = (s + 1) % radSegs;
      indices.push(row0 + s, row1 + s, row0 + next, row0 + next, row1 + s, row1 + next);
    }
  }

  const botIdx = positions.length / 3;
  positions.push(0, yStart, 0);
  uvs.push(0.5, 0);
  for (let s = 0; s < radSegs; s++) {
    indices.push(botIdx, s, (s + 1) % radSegs);
  }
  const topIdx = positions.length / 3;
  positions.push(0, yEnd, 0);
  uvs.push(0.5, 1);
  const topRow = rings * radSegs;
  for (let s = 0; s < radSegs; s++) {
    indices.push(topIdx, topRow + ((s + 1) % radSegs), topRow + s);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return applyLeftBareSkinShading(smoothGeo(geo), 'palm');
}

/**
 * Stretched triangular thumb-index webbing (purlicue) connecting index metacarpal to abducted thumb base.
 */
function createPurlicueWebGeo(): THREE.BufferGeometry {
  // Thin closed double-sided wedge bridging radial palm edge (+X) to thumb mid-proximal zone
  const dorsal = [
    [0.031, 0.036, 0.006], // 0: palm base radial dorsal
    [0.031, 0.072, 0.004], // 1: index MCP dorsal
    [0.056, 0.044, -0.001], // 2: thumb mid dorsal
    [0.044, 0.056, -0.002], // 3: curved web saddle midpoint
  ];
  const palmar = [
    [0.03, 0.036, -0.004], // 4
    [0.03, 0.072, -0.003], // 5
    [0.055, 0.044, -0.008], // 6
    [0.043, 0.056, -0.007], // 7
  ];
  const pts = [...dorsal, ...palmar].flat();
  const uvs = [
    0, 0, 0, 1, 1, 0.2, 0.5, 0.6,
    0, 0, 0, 1, 1, 0.2, 0.5, 0.6,
  ];
  const indices = [
    // Dorsal triangles
    0, 3, 1, 0, 2, 3,
    // Palmar triangles
    4, 5, 7, 4, 7, 6,
    // Free leading saddle edge (1 -> 3 -> 2) stitched to palmar (5 -> 7 -> 6)
    1, 3, 7, 1, 7, 5,
    3, 2, 6, 3, 6, 7,
    // Inner edges sealed into palm & thumb
    0, 4, 2, 2, 4, 6,
    0, 1, 5, 0, 5, 4,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return applyLeftBareSkinShading(smoothGeo(geo), 'web');
}

/**
 * Chamfered 8-sided phalanx geometry with subtle proximal/distal knuckle flares and closed rounded tip.
 */
function createChamferedPhalanxGeo(r0: number, r1: number, length: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0.0004, -0.001));
  pts.push(new THREE.Vector2(r0 * 0.96, 0));
  pts.push(new THREE.Vector2(r0 * 1.04, length * 0.14)); // slight proximal knuckle flare
  pts.push(new THREE.Vector2(THREE.MathUtils.lerp(r0, r1, 0.45) * 0.94, length * 0.5)); // tapered waist
  pts.push(new THREE.Vector2(r1 * 1.02, length * 0.85)); // slight distal joint flare
  pts.push(new THREE.Vector2(r1 * 0.82, length * 0.96));
  pts.push(new THREE.Vector2(0.0004, length + r1 * 0.18));
  return applyLeftBareSkinShading(smoothGeo(new THREE.LatheGeometry(pts, 8)), 'phalanx');
}

/**
 * First-person true hierarchical skeletal rig (`Shoulder -> UpperArm -> Forearm -> Wrist -> Palm -> 5 Articulated Fingers`)
 * with anatomically sculpted hands, Dying Light Biomarker cuff, detailed ash/oak baseball bat,
 * state-driven procedural animations, dynamic motion-trail ribbon, parkour legs/boots, zipline hook, and particle pools.
 */
export class WeaponAndEffects {
  public readonly viewmodelGroup = new THREE.Group();
  public readonly weaponPivot = this.viewmodelGroup;

  // Nested Skeletal Hierarchies
  private readonly leftShoulder = new THREE.Group();
  private readonly leftUpperArm = new THREE.Group();
  private readonly leftForearm = new THREE.Group();
  private readonly leftWrist = new THREE.Group();
  private readonly leftPalm = new THREE.Group();
  private readonly leftFingers: FingerJoints[] = [];
  private readonly leftThumb!: ThumbJoints;

  private readonly rightShoulder = new THREE.Group();
  private readonly rightUpperArm = new THREE.Group();
  private readonly rightForearm = new THREE.Group();
  private readonly rightWrist = new THREE.Group();
  private readonly rightPalm = new THREE.Group();
  private readonly rightWeaponSocket = new THREE.Group();
  private readonly rightFingers: FingerJoints[] = [];
  private readonly rightThumb!: ThumbJoints;

  private readonly batGroup = new THREE.Group();
  private readonly batWoodMat: THREE.MeshStandardMaterial;
  private readonly batAuraMesh: THREE.Mesh;
  private readonly batAuraMat: THREE.MeshBasicMaterial;
  private readonly batTipMarker = new THREE.Object3D();
  private readonly batThroatMarker = new THREE.Object3D();
  private readonly daggerGroup = new THREE.Group();
  private readonly cleaverGroup = new THREE.Group();

  // Biomarker LED material (cyan in day/safe zone, pulsing crimson at night)
  private readonly biomarkerLedMat: THREE.MeshStandardMaterial;

  // Dynamic Procedural Swing Motion-Trail Mesh
  private readonly trailMesh: THREE.Mesh;
  private readonly trailGeo: THREE.BufferGeometry;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private readonly trailPositions: Float32Array;
  private readonly trailTipHistory: THREE.Vector3[] = [];
  private readonly trailBaseHistory: THREE.Vector3[] = [];
  private trailFade = 0;

  // Preserved Parkour Legs, Zipline Hook, Shockwave & Particle Pools
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly ziplineHookPivot = new THREE.Group();

  private readonly swingArcMesh: THREE.Mesh;
  private readonly swingArcMat: THREE.MeshBasicMaterial;
  private readonly shockwaveMesh: THREE.Mesh;
  private readonly shockwaveMat: THREE.MeshBasicMaterial;

  private readonly sparkPool: SparkParticle[] = [];
  private readonly bloodPool: SparkParticle[] = [];
  private readonly dustPool: DustParticle[] = [];
  private readonly activeFirecrackers: ActiveFirecracker[] = [];
  private readonly firecrackerBodyGeo: THREE.CylinderGeometry;
  private readonly firecrackerTipGeo: THREE.SphereGeometry;
  private readonly firecrackerBodyMat: THREE.MeshStandardMaterial;
  private readonly firecrackerTipMat: THREE.MeshBasicMaterial;
  private readonly firecrackerLight: THREE.PointLight;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private activeWeapon: WeaponId = 'bat';
  private pendingWeapon: WeaponId | null = null;
  private equipSwapTime = -1;
  private readonly equipSwapDuration = 0.28;
  private animState: WeaponAnimState = 'idle';
  private animTime = 0;
  private animDuration = 0.44;
  private swingToggle = false;
  private shockwaveTime = -1;
  private kickTime = -1;
  private kickIsDropkick = false;
  private batEmberTimer = 0;

  // Smoothed Kinematic State
  private readonly curLeftPos = new THREE.Vector3(-0.34, -0.24, -0.5);
  private readonly curLeftEuler = new THREE.Euler(-1.08, 0.36, -0.42);
  private readonly curRightPos = new THREE.Vector3(0.29, -0.26, -0.44);
  private readonly curRightEuler = new THREE.Euler(-0.38, 0.95, -1.05);
  private curVmRoll = 0;
  private curVmPullback = 0;
  private swayYawLag = 0;
  private swayPitchLag = 0;
  private landingDipPos = 0;
  private landingDipVel = 0;
  private readonly curLeftCurl = [14, 22, 30, 38];
  private readonly curLeftPip = [18, 26, 34, 42];
  private readonly curLeftDip = [12, 16, 20, 24];
  private readonly curLeftSplay = [-3.5, -1.0, 1.5, 4.0];
  private curThumbCmcX = 18;
  private curThumbCmcY = -26;
  private curThumbCmcZ = -32;
  private curThumbMcp = 18;
  private curThumbIp = 16;

  private readonly curRightCurl = [78, 80, 81, 83];
  private readonly curRightPip = [78, 78, 79, 80];
  private readonly curRightDip = [64, 64, 64, 65];
  private readonly curRightSplay = [-8.5, -9.5, -10.0, -10.5];
  private curRThumbCmcX = 46;
  private curRThumbCmcY = -36;
  private curRThumbCmcZ = 12;
  private curRThumbMcp = 38;
  private curRThumbIp = 40;
  private curRightExertion = 0;

  private readonly upperArmLen = 0.36;
  private readonly forearmLen = 0.28;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, textures: ProceduralTextureSet) {
    this.scene = scene;
    this.camera = camera;

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.disposables.push(m);
      return m;
    };

    camera.add(this.viewmodelGroup);

    // =========================================================================
    // MATERIALS (Anti-blowout calibrated PBR Standard materials)
    // =========================================================================
    const skinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.skinDetail,
        color: 0xeac1a8, // * #d89b78 => #C98E6B warm survivor skin tone
        roughness: 0.78,
        metalness: 0.0,
        emissive: 0x000000,
        envMapIntensity: 0.4,
        vertexColors: true,
        toneMapped: true,
      }),
    );
    const nailMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd9b39c,
        roughness: 0.42,
        metalness: 0.0,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const sleeveMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x454d49, // #3A403D rolled olive-slate survivor sleeve cuff
        roughness: 0.88,
        metalness: 0.02,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const gloveMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.tacticalGlove,
        color: 0xd0d4dc, // #22252A matte charcoal fingerless tactical glove
        roughness: 0.85,
        metalness: 0.05,
        envMapIntensity: 0.4,
        toneMapped: true,
      }),
    );
    const palmGripMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.tacticalGlove,
        color: 0x9aa0aa, // Perforated inner-palm & Velcro strap reinforcement
        roughness: 0.92,
        metalness: 0.04,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const carbonPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x15171a, // Hard-shell beveled carbon knuckle guard
        roughness: 0.35,
        metalness: 0.45,
        envMapIntensity: 0.4,
        toneMapped: true,
      }),
    );
    const wristWrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.wristWrapTape,
        color: 0x26292f, // #1E2024 matte-charcoal athletic compression wrist wrap
        roughness: 0.88,
        metalness: 0.03,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const watchStrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.wristWrapTape,
        color: 0x353b32, // #2D322B paracord / nylon survival wrist strap
        roughness: 0.84,
        metalness: 0.06,
        envMapIntensity: 0.4,
        toneMapped: true,
      }),
    );
    const bezelMetalMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6c7480,
        roughness: 0.32,
        metalness: 0.82,
        envMapIntensity: 0.45,
        toneMapped: true,
      }),
    );
    this.biomarkerLedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7eeeff,
        emissive: 0x5ce1ff,
        emissiveIntensity: 0.72,
        roughness: 0.2,
        metalness: 0.1,
        toneMapped: true,
      }),
    );

    // Calibrated Bare Left-Arm Survivor Skin & Nail + Tactical Watch + Paracord Materials
    const leftSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc88d6b,
        bumpMap: textures.skinDetail,
        bumpScale: 0.0024,
        roughness: 0.76,
        metalness: 0.0,
        emissive: 0x000000,
        envMapIntensity: 0.35,
        vertexColors: true,
        toneMapped: true,
      }),
    );
    const leftNailMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8ae96,
        roughness: 0.55,
        metalness: 0.0,
        envMapIntensity: 0.3,
        toneMapped: true,
      }),
    );
    const leftSleeveMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x353b36, // #2B302C dark charcoal-olive folded sleeve cuff
        roughness: 0.9,
        metalness: 0.02,
        envMapIntensity: 0.3,
        toneMapped: true,
      }),
    );
    const watchStrapMatLeft = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.tacticalGlove,
        color: 0x1e2024, // #1A1C20 ballistic nylon/rubber watch strap
        roughness: 0.88,
        metalness: 0.04,
        envMapIntensity: 0.32,
        toneMapped: true,
      }),
    );
    const watchSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x25282e, // Chunky octagonal dark-steel watch case & notched bezel
        roughness: 0.35,
        metalness: 0.6,
        envMapIntensity: 0.45,
        toneMapped: true,
      }),
    );
    const gunmetalBuckleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x525862, // Brushed gunmetal tang buckle & crown
        roughness: 0.32,
        metalness: 0.78,
        envMapIntensity: 0.45,
        toneMapped: true,
      }),
    );
    const watchFaceBackingMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0e1116, // Recessed dark tactical dial
        roughness: 0.42,
        metalness: 0.12,
        envMapIntensity: 0.25,
      }),
    );
    const watchAmberTickMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6a640,
        emissive: 0xd9942a,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.1,
        toneMapped: true,
      }),
    );
    const watchGlassMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9fb8cc,
        roughness: 0.12,
        metalness: 0.1,
        transparent: true,
        opacity: 0.2,
        envMapIntensity: 0.45,
        depthWrite: false,
      }),
    );
    const paracordOliveMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4a523b,
        roughness: 0.88,
        metalness: 0.02,
        envMapIntensity: 0.28,
        toneMapped: true,
      }),
    );
    const paracordBrownMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x362b23,
        roughness: 0.88,
        metalness: 0.02,
        envMapIntensity: 0.28,
        toneMapped: true,
      }),
    );
    const crimsonAgletMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x8b2626,
        roughness: 0.48,
        metalness: 0.12,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );

    this.batWoodMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        color: 0xeadfce,
        emissive: 0x000000,
        emissiveIntensity: 1.0,
        roughness: 0.62,
        metalness: 0.04,
        envMapIntensity: 0.4,
        toneMapped: true,
      }),
    );
    const batWoodMat = this.batWoodMat;
    const batGripMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.batGripTape,
        color: 0xd4d4d8,
        roughness: 0.88,
        metalness: 0.04,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const pommelMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        color: 0x9b6f42,
        roughness: 0.66,
        metalness: 0.04,
        envMapIntensity: 0.4,
        toneMapped: true,
      }),
    );

    // Swappable weapon materials (dagger / heavy cleaver)
    const leatherMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b2618,
        roughness: 0.84,
        envMapIntensity: 0.35,
      }),
    );
    const forgedBladeMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x454b54,
        roughness: 0.46,
        metalness: 0.8,
        envMapIntensity: 0.42,
      }),
    );
    const edgeSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xbac4d0,
        roughness: 0.24,
        metalness: 0.9,
        envMapIntensity: 0.45,
      }),
    );
    const darkIronMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x292d34,
        roughness: 0.4,
        metalness: 0.85,
        envMapIntensity: 0.42,
      }),
    );
    const copperWireMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc86d0a,
        roughness: 0.3,
        metalness: 0.84,
        envMapIntensity: 0.42,
      }),
    );
    const bloodRustMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c2d12,
        roughness: 0.74,
        metalness: 0.22,
        envMapIntensity: 0.35,
      }),
    );
    const jeanMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x394433,
        roughness: 0.88,
        envMapIntensity: 0.35,
      }),
    );
    const bootMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x423830, roughness: 0.66, envMapIntensity: 0.35 }));
    const soleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.92, envMapIntensity: 0.3 }));

    // =========================================================================
    // 1. LEFT ARM SKELETAL RIG (Bare-Handed Runner Forearm + Field Watch + Paracord)
    // =========================================================================
    this.leftShoulder.position.set(-0.28, -0.46, 0.02);
    this.viewmodelGroup.add(this.leftShoulder);

    // Upper Arm sleeve extending off-screen back into shoulder
    const lUpperGeo = trackGeo(createTaperedLimbGeo(0.056, 0.052, 0.046, this.upperArmLen, 12, 6));
    const lUpperMesh = new THREE.Mesh(lUpperGeo, leftSleeveMat);
    lUpperMesh.scale.set(1.04, 1.0, 0.92);
    this.leftUpperArm.add(lUpperMesh);
    this.leftShoulder.add(this.leftUpperArm);

    // Forearm attached at elbow (0, upperArmLen, 0)
    this.leftForearm.position.set(0, this.upperArmLen, 0);
    this.leftUpperArm.add(this.leftForearm);

    // Rolled-up multi-layered folded dark charcoal-olive fabric cuff (#2B302C) at lower-left edge
    const lLowerSleeveGeo = trackGeo(createFoldedSleeveCuffGeo(-0.05, 0.105));
    const lLowerSleeveMesh = new THREE.Mesh(lLowerSleeveGeo, leftSleeveMat);
    this.leftForearm.add(lLowerSleeveMesh);

    const lOuterCuffRollGeo = trackGeo(createFoldedSleeveCuffGeo(0.088, 0.128));
    const lOuterCuffRoll = new THREE.Mesh(lOuterCuffRollGeo, leftSleeveMat);
    lOuterCuffRoll.scale.set(1.06, 1.0, 1.06);
    this.leftForearm.add(lOuterCuffRoll);

    // Custom lofted anatomical bare forearm (12 radial segments, 8 longitudinal rings)
    const lForearmSkinGeo = trackGeo(createAnatomicalForearmGeo(0.095, this.forearmLen + 0.006));
    const lForearmSkin = new THREE.Mesh(lForearmSkinGeo, leftSkinMat);
    this.leftForearm.add(lForearmSkin);

    // Braided Paracord Survival Bracelet directly behind watch (y = 0.188m)
    const paracordGroup = new THREE.Group();
    paracordGroup.position.y = 0.188;
    this.leftForearm.add(paracordGroup);

    const weaveCount = 14;
    for (let w = 0; w < weaveCount; w++) {
      const ang = (w / weaveCount) * Math.PI * 2;
      const seg = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.BoxGeometry(0.0115, 0.016, 0.0075))),
        w % 2 === 0 ? paracordOliveMat : paracordBrownMat,
      );
      seg.position.set(Math.cos(ang) * 0.0365, (w % 2 === 0 ? 1 : -1) * 0.0012, Math.sin(ang) * 0.0285);
      seg.rotation.y = -ang + Math.PI * 0.5;
      seg.rotation.z = (w % 2 === 0 ? 1 : -1) * 0.34;
      paracordGroup.add(seg);
    }

    // Outer cobra knot + two short stiffened braided cord tails with crimson aglet beads (#8B2626)
    const paracordKnot = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.012, 0.019, 0.014))),
      paracordOliveMat,
    );
    paracordKnot.position.set(-0.038, 0, 0.006);
    paracordGroup.add(paracordKnot);

    [-0.004, 0.005].forEach((cz, idx) => {
      const tailPivot = new THREE.Group();
      tailPivot.position.set(-0.041, -0.004, 0.006 + cz);
      tailPivot.rotation.set(idx === 0 ? -0.32 : -0.18, 0, idx === 0 ? -0.45 : -0.25);
      paracordGroup.add(tailPivot);

      const cordLen = idx === 0 ? 0.03 : 0.024;
      const cordMesh = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0024, 0.0022, cordLen, 6))),
        idx === 0 ? paracordBrownMat : paracordOliveMat,
      );
      cordMesh.position.y = -cordLen * 0.5;
      tailPivot.add(cordMesh);

      const agletBead = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0031, 0.0028, 0.0075, 8))),
        crimsonAgletMat,
      );
      agletBead.position.y = -cordLen - 0.003;
      tailPivot.add(agletBead);
    });

    // Heavy-Duty Tactical Field Watch mounted snugly at wrist (y = 0.236m), angled outward-upward
    const watchGroup = new THREE.Group();
    watchGroup.position.y = 0.236;
    this.leftForearm.add(watchGroup);

    // Wide matte-black ballistic nylon/rubber watch strap (#1A1C20)
    const watchBand = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.032, 0.0335, 0.035, 12, 1))),
      watchStrapMatLeft,
    );
    watchBand.scale.set(1.12, 1.0, 0.85);
    watchGroup.add(watchBand);

    // Twin strap keeper loops on underside/radial side
    [-0.011, 0.008].forEach((ky) => {
      const keeper = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.TorusGeometry(0.0332, 0.0024, 6, 12))),
        watchStrapMatLeft,
      );
      keeper.rotation.x = Math.PI / 2;
      keeper.scale.set(1.13, 0.86, 1.0);
      keeper.position.y = ky;
      watchGroup.add(keeper);
    });

    // Brushed gunmetal tang buckle on the underside (-Z) of wrist strap
    const buckleFrame = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.016, 0.028, 0.0055))),
      gunmetalBuckleMat,
    );
    buckleFrame.position.set(0, 0, -0.0285);
    watchGroup.add(buckleFrame);

    const buckleTang = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0016, 0.0016, 0.024, 6))),
      gunmetalBuckleMat,
    );
    buckleTang.rotation.z = Math.PI * 0.5;
    buckleTang.position.set(0, 0, -0.0308);
    watchGroup.add(buckleTang);

    // Chunky Octagonal Dark-Steel Watch Housing facing outward-upward toward player camera
    const watchCaseGroup = new THREE.Group();
    watchCaseGroup.position.set(-0.007, 0.002, 0.024);
    watchCaseGroup.rotation.set(-0.04, -0.22, 0);
    watchGroup.add(watchCaseGroup);

    const lugBridge = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.03, 0.048, 0.0085))),
      watchSteelMat,
    );
    lugBridge.position.z = 0.001;
    watchCaseGroup.add(lugBridge);

    const octagonalCase = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.023, 0.0245, 0.012, 8))),
      watchSteelMat,
    );
    octagonalCase.rotation.x = Math.PI / 2;
    octagonalCase.rotation.y = Math.PI / 8;
    octagonalCase.position.z = 0.005;
    watchCaseGroup.add(octagonalCase);

    // Raised notched compass bezel + 12 perimeter grip notches
    const bezelRing = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.0195, 0.0032, 6, 12))),
      watchSteelMat,
    );
    bezelRing.position.z = 0.0112;
    watchCaseGroup.add(bezelRing);

    for (let n = 0; n < 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      const notch = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.BoxGeometry(0.003, 0.0042, 0.0032))),
        n % 3 === 0 ? gunmetalBuckleMat : watchSteelMat,
      );
      notch.position.set(Math.cos(a) * 0.0205, Math.sin(a) * 0.0205, 0.0115);
      notch.rotation.z = a;
      watchCaseGroup.add(notch);
    }

    // Crown guard, center knurled crown, and two side pushers on right (+X) edge of case
    const crownGuard = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.005, 0.014, 0.008))),
      watchSteelMat,
    );
    crownGuard.position.set(0.0235, 0, 0.0055);
    watchCaseGroup.add(crownGuard);

    const watchCrown = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0036, 0.0036, 0.005, 8))),
      gunmetalBuckleMat,
    );
    watchCrown.rotation.z = Math.PI / 2;
    watchCrown.position.set(0.0265, 0, 0.0055);
    watchCaseGroup.add(watchCrown);

    [-0.0105, 0.0105].forEach((py) => {
      const pusher = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0052, 8))),
        gunmetalBuckleMat,
      );
      pusher.rotation.z = Math.PI / 2;
      pusher.position.set(0.024, py, 0.0055);
      watchCaseGroup.add(pusher);
    });

    // Recessed Dark Tactical Dial (#0E1116) + Pale-Cyan/Amber Ticks + Minimalist Hands + Crystal
    const dialPlate = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0172, 0.0172, 0.0022, 16))),
      watchFaceBackingMat,
    );
    dialPlate.rotation.x = Math.PI / 2;
    dialPlate.position.z = 0.0098;
    watchCaseGroup.add(dialPlate);

    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      const isCardinal = h % 3 === 0;
      const tick = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(isCardinal ? 0.0018 : 0.0011, isCardinal ? 0.0038 : 0.0024, 0.0008)),
        h === 0 ? watchAmberTickMat : this.biomarkerLedMat,
      );
      tick.position.set(Math.sin(a) * 0.0138, Math.cos(a) * 0.0138, 0.0112);
      tick.rotation.z = -a;
      watchCaseGroup.add(tick);
    }

    const hourHand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.0016, 0.0085, 0.0008)), watchAmberTickMat);
    hourHand.position.set(0.0026, 0.0026, 0.0116);
    hourHand.rotation.z = -0.82;
    watchCaseGroup.add(hourHand);

    const minuteHand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.0012, 0.0125, 0.0008)), this.biomarkerLedMat);
    minuteHand.position.set(-0.0022, 0.0046, 0.0118);
    minuteHand.rotation.z = 0.44;
    watchCaseGroup.add(minuteHand);

    const centerPinion = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.0016, 0.0016, 0.0012, 8)), gunmetalBuckleMat);
    centerPinion.rotation.x = Math.PI / 2;
    centerPinion.position.z = 0.012;
    watchCaseGroup.add(centerPinion);

    const watchCrystal = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0176, 0.0176, 0.0012, 16))),
      watchGlassMat,
    );
    watchCrystal.rotation.x = Math.PI / 2;
    watchCrystal.position.z = 0.0128;
    watchCaseGroup.add(watchCrystal);

    // Left Wrist Joint (bare skin anatomical wrist bridge so flexing never gaps)
    this.leftWrist.position.set(0, this.forearmLen, 0);
    this.leftForearm.add(this.leftWrist);

    const lWristJointGeo = applyLeftBareSkinShading(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.028, 12, 8))),
      'forearm',
    );
    const lWristJoint = new THREE.Mesh(lWristJointGeo, leftSkinMat);
    lWristJoint.scale.set(1.06, 0.68, 0.72);
    this.leftWrist.add(lWristJoint);

    // Left Bare Palm: wedge-tapered metacarpal geometry with tendon ridges, thenar pad & 4 knuckle domes
    this.leftWrist.add(this.leftPalm);

    const lPalmMesh = new THREE.Mesh(trackGeo(createBarePalmGeo()), leftSkinMat);
    this.leftPalm.add(lPalmMesh);

    // Four distinct anatomical knuckle domes across dorsal MCP ridge
    [0.0275, 0.0092, -0.0092, -0.0275].forEach((kx, idx) => {
      const ky = 0.078 - Math.abs(idx - 1.3) * 0.0024;
      const domeGeo = applyLeftBareSkinShading(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.0094, 10, 8))),
        'phalanx',
      );
      const dome = new THREE.Mesh(domeGeo, leftSkinMat);
      dome.scale.set(0.95, 0.88, 0.72);
      dome.position.set(kx, ky, 0.0088);
      this.leftPalm.add(dome);
    });

    // Stretched Thumb-Index Webbing (Purlicue)
    const purlicueMesh = new THREE.Mesh(trackGeo(createPurlicueWebGeo()), leftSkinMat);
    this.leftPalm.add(purlicueMesh);

    // Five Articulated Bare Fingers (Index on +X -> Pinky on -X), 3 chamfered skin phalanges + fingernail beds
    const leftFingerConfigs = [
      { x: 0.0275, y: 0.08, r0: 0.0085, len1: 0.036, len2: 0.024, len3: 0.0185 }, // Index (Lead)
      { x: 0.0092, y: 0.083, r0: 0.0088, len1: 0.04, len2: 0.027, len3: 0.0195 }, // Middle (Longest)
      { x: -0.0092, y: 0.08, r0: 0.0082, len1: 0.036, len2: 0.025, len3: 0.0185 }, // Ring
      { x: -0.0275, y: 0.074, r0: 0.0072, len1: 0.028, len2: 0.02, len3: 0.016 }, // Pinky
    ];

    leftFingerConfigs.forEach((fc) => {
      const mcp = new THREE.Group();
      mcp.position.set(fc.x, fc.y, 0);
      this.leftPalm.add(mcp);

      // Bare proximal phalanx
      const proxMesh = new THREE.Mesh(
        trackGeo(createChamferedPhalanxGeo(fc.r0 * 1.02, fc.r0 * 0.88, fc.len1)),
        leftSkinMat,
      );
      mcp.add(proxMesh);

      // PIP knuckle dome
      const pip = new THREE.Group();
      pip.position.set(0, fc.len1, 0);
      mcp.add(pip);

      const pipJoint = new THREE.Mesh(
        applyLeftBareSkinShading(trackGeo(smoothGeo(new THREE.SphereGeometry(fc.r0 * 0.88, 8, 6))), 'phalanx'),
        leftSkinMat,
      );
      pipJoint.scale.set(1.0, 0.88, 0.92);
      pip.add(pipJoint);

      // Bare middle phalanx
      const midMesh = new THREE.Mesh(
        trackGeo(createChamferedPhalanxGeo(fc.r0 * 0.84, fc.r0 * 0.72, fc.len2)),
        leftSkinMat,
      );
      pip.add(midMesh);

      const dip = new THREE.Group();
      dip.position.set(0, fc.len2, 0);
      pip.add(dip);

      const dipJoint = new THREE.Mesh(
        applyLeftBareSkinShading(trackGeo(smoothGeo(new THREE.SphereGeometry(fc.r0 * 0.74, 8, 6))), 'phalanx'),
        leftSkinMat,
      );
      dipJoint.scale.set(1.0, 0.88, 0.92);
      dip.add(dipJoint);

      // Bare distal phalanx + inset muted keratin fingernail bed on dorsal tip
      const distMesh = new THREE.Mesh(
        trackGeo(createChamferedPhalanxGeo(fc.r0 * 0.72, fc.r0 * 0.56, fc.len3)),
        leftSkinMat,
      );
      dip.add(distMesh);

      const nailBed = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.BoxGeometry(fc.r0 * 1.02, fc.len3 * 0.44, fc.r0 * 0.3))),
        leftNailMat,
      );
      nailBed.position.set(0, fc.len3 * 0.68, fc.r0 * 0.5);
      dip.add(nailBed);

      this.leftFingers.push({ mcp, pip, dip });
    });

    // Bare Opposable Left Thumb (CMC -> MCP -> IP) positioned low/forward on radial (+X) palm side
    const lThumbCmc = new THREE.Group();
    lThumbCmc.position.set(0.032, 0.023, -0.003);
    this.leftPalm.add(lThumbCmc);

    const lThumbBaseMesh = new THREE.Mesh(
      trackGeo(createChamferedPhalanxGeo(0.0112, 0.0096, 0.028)),
      leftSkinMat,
    );
    lThumbCmc.add(lThumbBaseMesh);

    const lThumbMcp = new THREE.Group();
    lThumbMcp.position.set(0, 0.028, 0);
    lThumbCmc.add(lThumbMcp);

    const lThumbMidMesh = new THREE.Mesh(
      trackGeo(createChamferedPhalanxGeo(0.0094, 0.0082, 0.025)),
      leftSkinMat,
    );
    lThumbMcp.add(lThumbMidMesh);

    const lThumbIp = new THREE.Group();
    lThumbIp.position.set(0, 0.025, 0);
    lThumbMcp.add(lThumbIp);

    const lThumbTipMesh = new THREE.Mesh(
      trackGeo(createChamferedPhalanxGeo(0.0082, 0.0064, 0.021)),
      leftSkinMat,
    );
    lThumbIp.add(lThumbTipMesh);

    const lThumbNail = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.0088, 0.0095, 0.0024))),
      leftNailMat,
    );
    lThumbNail.position.set(0, 0.014, 0.0056);
    lThumbIp.add(lThumbNail);

    this.leftThumb = { cmc: lThumbCmc, mcp: lThumbMcp, ip: lThumbIp };

    // =========================================================================
    // 2. RIGHT ARM SKELETAL RIG (Tactical Runner Forearm + Fingerless Glove + 5-Finger Rig)
    // =========================================================================
    this.rightShoulder.position.set(0.38, -0.54, 0.08);
    this.viewmodelGroup.add(this.rightShoulder);

    // Upper Arm extending back toward bottom-right frustum (rolled sleeve #3A403D, closed end caps)
    const rUpperGeo = trackGeo(createTaperedLimbGeo(0.058, 0.053, 0.046, this.upperArmLen, 12, 6));
    const rUpperMesh = new THREE.Mesh(rUpperGeo, sleeveMat);
    rUpperMesh.scale.set(1.04, 1.0, 0.92);
    this.rightUpperArm.add(rUpperMesh);
    this.rightShoulder.add(this.rightUpperArm);

    // Athletic tapered forearm attached at elbow (0, upperArmLen, 0), tapering 0.044m -> 0.029m
    this.rightForearm.position.set(0, this.upperArmLen, 0);
    this.rightUpperArm.add(this.rightForearm);

    // Rolled-up #3A403D shirt cuff at base of visible forearm
    const rForearmSleeve = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.048, 0.047, 0.045, 0.098, 12, 6)),
      sleeveMat,
    );
    rForearmSleeve.scale.set(1.06, 1.0, 0.88);
    this.rightForearm.add(rForearmSleeve);

    const rRolledCuff = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.044, 0.009, 8, 12))),
      sleeveMat,
    );
    rRolledCuff.rotation.x = Math.PI / 2;
    rRolledCuff.scale.set(1.06, 0.88, 1.0);
    rRolledCuff.position.y = 0.096;
    this.rightForearm.add(rRolledCuff);

    // Muscular bare forearm skin with subtle sleeve/wrist-wrap crease AO
    const rForearmSkin = new THREE.Mesh(
      applySkinVertexAO(
        trackGeo(createTaperedLimbGeo(0.043, 0.04, 0.0295, this.forearmLen - 0.086, 12, 6)),
        0.74,
        1.0,
        0.76,
      ),
      skinMat,
    );
    rForearmSkin.scale.set(1.06, 1.0, 0.84);
    rForearmSkin.position.y = 0.086;
    this.rightForearm.add(rForearmSkin);

    // Matte-charcoal athletic wrist wrap / compression tape band (#1E2024) with overlapping bevel rings
    for (let w = 0; w < 4; w++) {
      const rTop = 0.032 - w * 0.0006;
      const rBot = 0.0334 - w * 0.0006;
      const wrapBand = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CylinderGeometry(rTop, rBot, 0.022, 12))),
        wristWrapMat,
      );
      wrapBand.scale.set(1.08, 1.0, 0.86);
      wrapBand.position.y = 0.194 + w * 0.019;
      wrapBand.rotation.z = w % 2 === 0 ? 0.038 : -0.038;
      this.rightForearm.add(wrapBand);

      const bevelEdge = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.TorusGeometry(rTop * 1.01, 0.0018, 6, 12))),
        wristWrapMat,
      );
      bevelEdge.rotation.x = Math.PI / 2;
      bevelEdge.scale.set(1.08, 0.86, 1.0);
      bevelEdge.position.y = 0.204 + w * 0.019;
      this.rightForearm.add(bevelEdge);
    }

    // Secondary tactical nylon / paracord survival strap (#2D322B) + metallic buckle clasp on outer wrist
    const rParacordGroup = new THREE.Group();
    rParacordGroup.position.y = 0.226;
    this.rightForearm.add(rParacordGroup);

    const paracordBase = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0332, 0.0338, 0.022, 12))),
      watchStrapMat,
    );
    paracordBase.scale.set(1.09, 1.0, 0.88);
    rParacordGroup.add(paracordBase);

    [-0.006, 0.006].forEach((py) => {
      const braid = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.TorusGeometry(0.0336, 0.0024, 6, 12))),
        watchStrapMat,
      );
      braid.rotation.x = Math.PI / 2;
      braid.scale.set(1.09, 0.88, 1.0);
      braid.position.y = py;
      rParacordGroup.add(braid);
    });

    const claspHousing = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.012, 0.024, 0.02))),
      bezelMetalMat,
    );
    claspHousing.position.set(0.034, 0, 0.008);
    rParacordGroup.add(claspHousing);

    const claspPin = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0022, 0.0022, 0.026, 8))),
      carbonPadMat,
    );
    claspPin.position.set(0.039, 0, 0.008);
    rParacordGroup.add(claspPin);

    // Right Wrist Pivot + stitched tactical glove cuff
    this.rightWrist.position.set(0, this.forearmLen, 0);
    this.rightForearm.add(this.rightWrist);

    const rWristJoint = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0295, 12, 8))),
      gloveMat,
    );
    rWristJoint.scale.set(1.08, 0.78, 0.76);
    this.rightWrist.add(rWristJoint);

    const rGloveCuffSeam = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.0305, 0.0032, 6, 12))),
      palmGripMat,
    );
    rGloveCuffSeam.rotation.x = Math.PI / 2;
    rGloveCuffSeam.scale.set(1.08, 0.78, 1.0);
    rGloveCuffSeam.position.y = 0.006;
    this.rightWrist.add(rGloveCuffSeam);

    // Right Palm (unified anatomical space: +Y wrist->knuckles, +Z dorsal, -Z palm, -X thumb/index, +X pinky)
    this.rightWrist.add(this.rightPalm);

    // Tapered metacarpal palm block in fingerless charcoal tactical glove (#22252A), wider across knuckles
    const rPalmGloveGeo = trackGeo(createTaperedLimbGeo(0.031, 0.0385, 0.04, 0.083, 12, 6));
    const rPalmMesh = new THREE.Mesh(rPalmGloveGeo, gloveMat);
    rPalmMesh.scale.set(1.0, 1.0, 0.31);
    this.rightPalm.add(rPalmMesh);

    // Subtle dorsal metacarpal arch dome
    const rDorsalArch = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.028, 10, 8))),
      gloveMat,
    );
    rDorsalArch.scale.set(1.18, 1.25, 0.24);
    rDorsalArch.position.set(0, 0.046, 0.0075);
    this.rightPalm.add(rDorsalArch);

    // Rubberized Velcro strap across dorsal wrist
    const rVelcroStrap = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.056, 0.017, 0.007))),
      palmGripMat,
    );
    rVelcroStrap.position.set(0, 0.016, 0.0115);
    this.rightPalm.add(rVelcroStrap);

    // Perforated grip reinforcement panel on inner palm (-Z)
    const rInnerGripPanel = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.BoxGeometry(0.056, 0.052, 0.006))),
      palmGripMat,
    );
    rInnerGripPanel.position.set(0, 0.044, -0.0108);
    this.rightPalm.add(rInnerGripPanel);

    // Reinforced padded thenar thumb heel on radial (-X) palm side
    const rThenarPad = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.014, 0.032, 6, 12))),
      gloveMat,
    );
    rThenarPad.scale.set(1.0, 1.0, 0.65);
    rThenarPad.position.set(-0.024, 0.026, -0.004);
    rThenarPad.rotation.z = 0.35;
    this.rightPalm.add(rThenarPad);

    // Padded, beveled Carbon-Fiber / Hard-Shell Knuckle Guard across all 4 knuckles (#15171A)
    [-0.027, -0.009, 0.009, 0.027].forEach((kx, idx) => {
      const ky = 0.076 - Math.abs(idx - 1.5) * 0.0025;
      const pad = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.0098, 10, 8))),
        carbonPadMat,
      );
      pad.scale.set(0.95, 0.85, 0.72);
      pad.position.set(kx, ky, 0.0118);
      this.rightPalm.add(pad);
    });
    const rKnuckleBridge = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.007, 0.056, 6, 12))),
      carbonPadMat,
    );
    rKnuckleBridge.rotation.z = Math.PI / 2;
    rKnuckleBridge.scale.set(1.0, 1.0, 0.65);
    rKnuckleBridge.position.set(0, 0.075, 0.0108);
    this.rightPalm.add(rKnuckleBridge);

    // Right Weapon Socket nestled cleanly against inner palm (-Z) tilted +70° toward thumb/index (-X)
    this.rightWeaponSocket.position.set(0, 0.052, -0.028);
    this.rightWeaponSocket.rotation.set(0, 0, 70 * DEG2RAD);
    this.rightPalm.add(this.rightWeaponSocket);

    // Articulated Right 4 Fingers (Index on -X -> Pinky on +X):
    // Proximal phalanx in fingerless charcoal glove; Middle + Distal phalanges exposed skin with crease AO & nail caps
    const rightFingerSpecs = [
      { x: -0.0275, y: 0.08, r0: 0.0086, len1: 0.04, len2: 0.026, len3: 0.019 }, // Index
      { x: -0.0092, y: 0.083, r0: 0.009, len1: 0.042, len2: 0.028, len3: 0.02 }, // Middle
      { x: 0.0092, y: 0.08, r0: 0.0084, len1: 0.039, len2: 0.026, len3: 0.019 }, // Ring
      { x: 0.0275, y: 0.074, r0: 0.0074, len1: 0.032, len2: 0.022, len3: 0.017 }, // Pinky
    ];

    rightFingerSpecs.forEach((fc) => {
      const mcp = new THREE.Group();
      mcp.position.set(fc.x, fc.y, 0);
      this.rightPalm.add(mcp);

      // Proximal phalanx (fingerless glove sleeve)
      const proxMesh = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fc.r0 * 1.04, fc.r0 * 0.96, fc.r0 * 0.88, fc.len1, 12, 6)),
        gloveMat,
      );
      mcp.add(proxMesh);

      // Stitched fingerless glove cuff trim at PIP opening
      const cuffTrim = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.TorusGeometry(fc.r0 * 0.86, 0.0014, 6, 10))),
        palmGripMat,
      );
      cuffTrim.rotation.x = Math.PI / 2;
      cuffTrim.position.y = fc.len1 * 0.94;
      mcp.add(cuffTrim);

      const pip = new THREE.Group();
      pip.position.set(0, fc.len1, 0);
      mcp.add(pip);

      // Middle phalanx (exposed human skin with knuckle crease AO)
      const midMesh = new THREE.Mesh(
        applySkinVertexAO(
          trackGeo(createTaperedLimbGeo(fc.r0 * 0.84, fc.r0 * 0.78, fc.r0 * 0.72, fc.len2, 12, 6)),
          0.74,
          1.0,
          0.84,
        ),
        skinMat,
      );
      pip.add(midMesh);

      const dip = new THREE.Group();
      dip.position.set(0, fc.len2, 0);
      pip.add(dip);

      // Distal phalanx (exposed human skin + dorsal fingernail)
      const distMesh = new THREE.Mesh(
        applySkinVertexAO(
          trackGeo(createTaperedLimbGeo(fc.r0 * 0.72, fc.r0 * 0.66, fc.r0 * 0.52, fc.len3, 12, 6)),
          0.8,
          1.0,
          0.9,
        ),
        skinMat,
      );
      dip.add(distMesh);

      const nailMesh = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(fc.r0 * 0.56, 10, 8))),
        nailMat,
      );
      nailMesh.scale.set(0.9, 1.35, 0.35);
      nailMesh.position.set(0, fc.len3 * 0.68, fc.r0 * 0.44);
      dip.add(nailMesh);

      this.rightFingers.push({ mcp, pip, dip });
    });

    // Opposable Right Thumb (CMC -> MCP -> IP) on radial (-X) palm side
    const rThumbCmc = new THREE.Group();
    rThumbCmc.position.set(-0.034, 0.025, -0.002);
    this.rightPalm.add(rThumbCmc);

    const rThumbBaseMesh = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.0112, 0.0104, 0.0094, 0.027, 12, 6)),
      gloveMat,
    );
    rThumbCmc.add(rThumbBaseMesh);

    const rThumbMcp = new THREE.Group();
    rThumbMcp.position.set(0, 0.027, 0);
    rThumbCmc.add(rThumbMcp);

    const rThumbMidMesh = new THREE.Mesh(
      applySkinVertexAO(trackGeo(createTaperedLimbGeo(0.0092, 0.0086, 0.008, 0.025, 12, 6)), 0.75, 1.0, 0.86),
      skinMat,
    );
    rThumbMcp.add(rThumbMidMesh);

    const rThumbIp = new THREE.Group();
    rThumbIp.position.set(0, 0.025, 0);
    rThumbMcp.add(rThumbIp);

    const rThumbTipMesh = new THREE.Mesh(
      applySkinVertexAO(trackGeo(createTaperedLimbGeo(0.008, 0.0074, 0.0058, 0.021, 12, 6)), 0.82, 1.0, 0.9),
      skinMat,
    );
    rThumbIp.add(rThumbTipMesh);

    const rThumbNail = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0062, 10, 8))),
      nailMat,
    );
    rThumbNail.scale.set(0.95, 1.3, 0.35);
    rThumbNail.position.set(0, 0.014, 0.0052);
    rThumbIp.add(rThumbNail);

    this.rightThumb = { cmc: rThumbCmc, mcp: rThumbMcp, ip: rThumbIp };

    // =========================================================================
    // 3. DETAILED BASEBALL / CRICKET BAT (inside rightWeaponSocket)
    // =========================================================================
    this.rightWeaponSocket.add(this.batGroup);

    // Section 1: Flared pommel knob at base (radius 0.024m, y = -0.148 .. -0.115)
    const pommelProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.001, -0.148),
      new THREE.Vector2(0.017, -0.146),
      new THREE.Vector2(0.024, -0.136),
      new THREE.Vector2(0.024, -0.125),
      new THREE.Vector2(0.017, -0.115),
    ];
    const batPommel = new THREE.Mesh(trackGeo(smoothGeo(new THREE.LatheGeometry(pommelProfile, 16))), pommelMat);
    this.batGroup.add(batPommel);

    // Section 2: Black ribbed rubber/cloth grip tape (length 0.24m: y = -0.115 .. +0.125, radius 0.017m)
    const batGrip = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.24, 16, 8))),
      batGripMat,
    );
    batGrip.position.y = 0.005;
    this.batGroup.add(batGrip);

    // Finishing collar tape band at top of grip
    const gripCollar = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0184, 0.0176, 0.016, 16))),
      batGripMat,
    );
    gripCollar.position.y = 0.124;
    this.batGroup.add(gripCollar);

    // Section 3: Smoothly flared hardwood barrel (length 0.56m: y = +0.125 .. +0.685, radius 0.018m -> 0.036m)
    const barrelProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.018, 0.125),
      new THREE.Vector2(0.0195, 0.19),
      new THREE.Vector2(0.024, 0.27),
      new THREE.Vector2(0.0305, 0.37),
      new THREE.Vector2(0.0352, 0.48),
      new THREE.Vector2(0.036, 0.59),
      new THREE.Vector2(0.0345, 0.655),
      new THREE.Vector2(0.027, 0.678),
      new THREE.Vector2(0.014, 0.684),
      new THREE.Vector2(0.001, 0.685),
    ];
    const batBarrelGeo = trackGeo(smoothGeo(new THREE.LatheGeometry(barrelProfile, 16)));
    const batBarrel = new THREE.Mesh(batBarrelGeo, batWoodMat);
    this.batGroup.add(batBarrel);

    // Awakening Pumped-Up translucent crimson-gold aura shell on bat barrel (1.05x scale, 0xFF3B14)
    this.batAuraMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff3b14,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    );
    this.batAuraMesh = new THREE.Mesh(batBarrelGeo, this.batAuraMat);
    this.batAuraMesh.scale.set(1.05, 1.02, 1.05);
    this.batAuraMesh.visible = false;
    this.batGroup.add(this.batAuraMesh);

    // Markers for procedural swing motion-trail ribbon (attached to rightWeaponSocket so all weapons share it)
    this.batThroatMarker.position.set(0, 0.26, 0);
    this.batTipMarker.position.set(0, 0.67, 0);
    this.rightWeaponSocket.add(this.batThroatMarker);
    this.rightWeaponSocket.add(this.batTipMarker);

    // --- Swappable Weapon 1: Scavenger Short Blade / Stylized Dagger (Left Wheel Slot) ---
    // Rotated -90° around Y so cutting edge (-Z) faces forward along palm knuckles (+Y_palm)
    this.daggerGroup.rotation.set(0, -Math.PI / 2, 0);
    this.daggerGroup.position.set(0, 0.0, 0);
    this.daggerGroup.visible = false;
    this.rightWeaponSocket.add(this.daggerGroup);

    const daggerGrip = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.0155, 0.0165, 0.145, 8)),
      leatherMat,
    );
    daggerGrip.position.y = 0.005;
    this.daggerGroup.add(daggerGrip);

    const daggerPommel = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.022, 0)),
      copperWireMat,
    );
    daggerPommel.scale.set(0.9, 1.15, 0.9);
    daggerPommel.position.y = -0.075;
    this.daggerGroup.add(daggerPommel);

    const daggerGuard = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.028, 0.018, 0.088)),
      darkIronMat,
    );
    daggerGuard.position.y = 0.084;
    this.daggerGroup.add(daggerGuard);

    const daggerBladeCore = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.008, 0.24, 0.034)),
      forgedBladeMat,
    );
    daggerBladeCore.position.set(0, 0.21, -0.003);
    this.daggerGroup.add(daggerBladeCore);

    const daggerBladeEdge = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.004, 0.24, 0.012)),
      edgeSteelMat,
    );
    daggerBladeEdge.position.set(0, 0.21, -0.022);
    this.daggerGroup.add(daggerBladeEdge);

    const daggerTip = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.021, 0.095, 4)),
      edgeSteelMat,
    );
    daggerTip.scale.set(0.32, 1.0, 1.0);
    daggerTip.position.set(0, 0.375, -0.008);
    this.daggerGroup.add(daggerTip);

    // --- Swappable Weapon 2: Heavy Stylized Cleaver / Machete (Right Wheel Slot) ---
    this.cleaverGroup.rotation.set(0, -Math.PI / 2, 0);
    this.cleaverGroup.position.set(0, 0.0, 0);
    this.cleaverGroup.visible = false;
    this.rightWeaponSocket.add(this.cleaverGroup);

    const cleaverGrip = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.0175, 0.0185, 0.21, 8)),
      leatherMat,
    );
    cleaverGrip.position.y = 0.005;
    this.cleaverGroup.add(cleaverGrip);

    [0.04, -0.02, -0.07].forEach((cy) => {
      const wrap = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.0188, 0.0035, 6, 10)),
        copperWireMat,
      );
      wrap.rotation.x = Math.PI / 2;
      wrap.position.y = cy;
      this.cleaverGroup.add(wrap);
    });

    const cleaverBolster = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.032, 0.024, 0.072)),
      darkIronMat,
    );
    cleaverBolster.position.set(0, 0.115, -0.012);
    this.cleaverGroup.add(cleaverBolster);

    const cleaverBlade = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.012, 0.44, 0.084)),
      forgedBladeMat,
    );
    cleaverBlade.position.set(0, 0.34, -0.024);
    cleaverBlade.rotation.x = 0.03;
    this.cleaverGroup.add(cleaverBlade);

    const cleaverEdge = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.005, 0.44, 0.022)),
      edgeSteelMat,
    );
    cleaverEdge.position.set(0, 0.34, -0.072);
    cleaverEdge.rotation.x = 0.03;
    this.cleaverGroup.add(cleaverEdge);

    // Broad angled cleaver head nose + reinforced spine bar
    const cleaverNose = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.011, 0.13, 0.098)),
      edgeSteelMat,
    );
    cleaverNose.position.set(0, 0.56, -0.036);
    cleaverNose.rotation.x = -0.22;
    this.cleaverGroup.add(cleaverNose);

    const cleaverSpine = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.015, 0.48, 0.018)),
      bloodRustMat,
    );
    cleaverSpine.position.set(0, 0.35, 0.018);
    cleaverSpine.rotation.x = 0.03;
    this.cleaverGroup.add(cleaverSpine);

    // =========================================================================
    // 4. PROCEDURAL MOTION-TRAIL MESH (attached inside viewmodelGroup)
    // =========================================================================
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      this.trailTipHistory.push(new THREE.Vector3());
      this.trailBaseHistory.push(new THREE.Vector3());
    }
    this.trailPositions = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
    const trailColors = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
    const trailIndices: number[] = [];
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const fade = 1 - i / (TRAIL_SEGMENTS - 1);
      const c = fade * fade;
      // Tip vertex (brighter) & throat vertex (softer)
      trailColors[(i * 2) * 3] = 0.98 * c;
      trailColors[(i * 2) * 3 + 1] = 0.94 * c;
      trailColors[(i * 2) * 3 + 2] = 0.82 * c;
      trailColors[(i * 2 + 1) * 3] = 0.72 * c * 0.5;
      trailColors[(i * 2 + 1) * 3 + 1] = 0.68 * c * 0.5;
      trailColors[(i * 2 + 1) * 3 + 2] = 0.62 * c * 0.5;
      if (i < TRAIL_SEGMENTS - 1) {
        const a = i * 2;
        const b = a + 1;
        const cIdx = a + 2;
        const d = a + 3;
        trailIndices.push(a, b, cIdx, b, d, cIdx);
      }
    }
    this.trailGeo = trackGeo(new THREE.BufferGeometry());
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    this.trailGeo.setIndex(trailIndices);
    this.trailMat = trackMat(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.trailMesh = new THREE.Mesh(this.trailGeo, this.trailMat);
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = false;
    this.viewmodelGroup.add(this.trailMesh);

    // =========================================================================
    // 5. DUAL PARKOUR LEGS & BOOTS, ZIPLINE HOOK & PARTICLE POOLS (preserved)
    // =========================================================================
    const buildParkourLeg = (pivot: THREE.Group, isRight: boolean) => {
      const thigh = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.076, 0.28, 8, 14))), jeanMat);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.z = -0.14;
      pivot.add(thigh);

      const shin = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.064, 0.36, 8, 14))), jeanMat);
      shin.rotation.x = Math.PI / 2;
      shin.position.z = -0.38;
      pivot.add(shin);

      const cuff = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CylinderGeometry(0.064, 0.066, 0.07, 12))), leatherMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = -0.53;
      pivot.add(cuff);

      const shoe = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.064, 0.16, 8, 14))), bootMat);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.0, 1.0, 1.15);
      shoe.position.set(isRight ? 0.005 : -0.005, 0.032, -0.62);
      pivot.add(shoe);

      const shoeSole = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.066, 0.17, 6, 12))), soleMat);
      shoeSole.rotation.x = Math.PI / 2;
      shoeSole.scale.set(1.04, 0.45, 1.18);
      shoeSole.position.set(isRight ? 0.005 : -0.005, -0.028, -0.62);
      pivot.add(shoeSole);
    };

    this.leftLegPivot.position.set(-0.18, -0.74, -0.14);
    this.leftLegPivot.visible = false;
    buildParkourLeg(this.leftLegPivot, false);
    camera.add(this.leftLegPivot);

    this.rightLegPivot.position.set(0.18, -0.74, -0.14);
    this.rightLegPivot.visible = false;
    buildParkourLeg(this.rightLegPivot, true);
    camera.add(this.rightLegPivot);

    const hookGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.9,
        roughness: 0.25,
        metalness: 0.75,
      }),
    );
    const gripRubberMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 }));

    this.ziplineHookPivot.position.set(0, 0.23, -0.44);
    this.ziplineHookPivot.visible = false;
    camera.add(this.ziplineHookPivot);

    const handleBar = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.36, 10))),
      edgeSteelMat,
    );
    handleBar.rotation.z = Math.PI / 2;
    this.ziplineHookPivot.add(handleBar);

    [-0.12, 0.12].forEach((gx) => {
      const grip = new THREE.Mesh(
        smoothGeo(trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 10))),
        gripRubberMat,
      );
      grip.rotation.z = Math.PI / 2;
      grip.position.x = gx;
      this.ziplineHookPivot.add(grip);
    });

    const shank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.036, 0.14, 0.036)), darkIronMat);
    shank.position.set(0, 0.075, 0);
    this.ziplineHookPivot.add(shank);

    const pulleyWheel = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.044, 0.044, 0.028, 12))),
      hookGlowMat,
    );
    pulleyWheel.rotation.z = Math.PI / 2;
    pulleyWheel.position.set(0, 0.145, 0);
    this.ziplineHookPivot.add(pulleyWheel);

    const hookArch = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.055, 0.012, 6, 12, Math.PI)), hookGlowMat);
    hookArch.position.set(0, 0.155, 0);
    this.ziplineHookPivot.add(hookArch);

    // Parry/Takedown arc + shockwave + pools
    this.swingArcMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.swingArcMesh = new THREE.Mesh(
      trackGeo(new THREE.RingGeometry(0.32, 0.52, 24, 1, -Math.PI * 0.4, Math.PI * 0.8)),
      this.swingArcMat,
    );
    this.swingArcMesh.position.set(0.02, -0.06, -0.68);
    this.swingArcMesh.rotation.set(0.35, 0, -0.35);
    camera.add(this.swingArcMesh);

    this.shockwaveMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.shockwaveMesh = new THREE.Mesh(trackGeo(new THREE.RingGeometry(0.4, 1.0, 32)), this.shockwaveMat);
    this.shockwaveMesh.rotation.x = -Math.PI / 2;
    this.shockwaveMesh.visible = false;
    scene.add(this.shockwaveMesh);

    const sparkGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.036, 6, 6)));
    for (let i = 0; i < 48; i++) {
      const mat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 }));
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.sparkPool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.35 });
    }

    const bloodGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.034, 6, 5)));
    for (let i = 0; i < 32; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xdc2626 : 0x7f1d1d, transparent: true, opacity: 0 }),
      );
      const mesh = new THREE.Mesh(bloodGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.bloodPool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.42 });
    }

    const dustGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.24, 10, 8)));
    for (let i = 0; i < 28; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({ color: 0xd6c7b2, transparent: true, opacity: 0, depthWrite: false }),
      );
      const mesh = new THREE.Mesh(dustGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.dustPool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.55 });
    }

    this.firecrackerBodyGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8));
    this.firecrackerTipGeo = trackGeo(new THREE.SphereGeometry(0.055, 6, 6));
    this.firecrackerBodyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }));
    this.firecrackerTipMat = trackMat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 0.35), toneMapped: false }),
    );
    this.firecrackerLight = new THREE.PointLight(0xf97316, 0, 14, 1.5);
    this.firecrackerLight.castShadow = false;
    scene.add(this.firecrackerLight);

    // Assign Layer 2 (isolated depth-cleared viewmodel pass) & shadow integrity on left arm/watch/hand
    const assignViewmodelLayer = (root: THREE.Object3D, castShadow: boolean) => {
      root.traverse((obj) => {
        obj.layers.set(2);
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = castShadow;
          obj.receiveShadow = true;
        }
      });
    };
    assignViewmodelLayer(this.viewmodelGroup, false);
    assignViewmodelLayer(this.leftShoulder, true);
    assignViewmodelLayer(this.leftLegPivot, false);
    assignViewmodelLayer(this.rightLegPivot, false);
    assignViewmodelLayer(this.ziplineHookPivot, false);
    assignViewmodelLayer(this.swingArcMesh, false);

    // Solve initial pose so first frame starts clean
    this.applyLeftFingerAngles(0, 1, 'RELAXED_IDLE');
    this.applyRightFingerAngles(0, 1, 'WEAPON_GRIP', 0);
    this.solveArmPose(
      this.leftShoulder,
      this.leftUpperArm,
      this.leftForearm,
      this.leftWrist,
      _shoulderBase.set(-0.28, -0.46, 0.02),
      this.curLeftPos,
      _leftTargetQuat.setFromEuler(this.curLeftEuler),
      _leftPole,
    );
    this.solveArmPose(
      this.rightShoulder,
      this.rightUpperArm,
      this.rightForearm,
      this.rightWrist,
      _shoulderBase.set(0.38, -0.54, 0.08),
      this.curRightPos,
      _rightTargetQuat.setFromEuler(this.curRightEuler),
      _rightPole,
    );
  }

  public setVisible(visible: boolean): void {
    this.viewmodelGroup.visible = visible;
    if (!visible) {
      this.leftLegPivot.visible = false;
      this.rightLegPivot.visible = false;
      this.ziplineHookPivot.visible = false;
      this.swingArcMesh.visible = false;
    } else {
      this.swingArcMesh.visible = true;
    }
  }

  public triggerLandingImpact(fallDistanceMeters: number): void {
    const severity = THREE.MathUtils.clamp(fallDistanceMeters / 5.0, 0.22, 1.0);
    this.landingDipVel -= 0.45 + severity * 0.72;
  }

  /**
   * 2-Bone Analytic IK driving Shoulder -> UpperArm -> Forearm -> Wrist
   * while orienting Wrist to exact target orientation in viewmodelGroup space.
   */
  private solveArmPose(
    shoulder: THREE.Group,
    upperArm: THREE.Group,
    forearm: THREE.Group,
    wrist: THREE.Group,
    baseShoulderPos: THREE.Vector3,
    wristTargetPos: THREE.Vector3,
    desiredWristQuat: THREE.Quaternion,
    poleDir: THREE.Vector3,
  ): void {
    const L1 = this.upperArmLen;
    const L2 = this.forearmLen;
    const maxReach = L1 + L2 - 0.012;

    _shoulderBase.copy(baseShoulderPos);
    _toTarget.subVectors(wristTargetPos, _shoulderBase);
    let dist = _toTarget.length();

    // Subtle anatomical scapular protraction when reaching far forward (ledge grab / vault)
    if (dist > maxReach) {
      const excess = Math.min(0.16, dist - maxReach);
      _uDir.copy(_toTarget).divideScalar(dist || 1);
      _shoulderBase.addScaledVector(_uDir, excess);
      _toTarget.subVectors(wristTargetPos, _shoulderBase);
      dist = _toTarget.length();
    }
    shoulder.position.copy(_shoulderBase);

    const clampedDist = THREE.MathUtils.clamp(dist, 0.14, maxReach);
    _uDir.copy(_toTarget).divideScalar(dist || 1);

    // Project elbow pole perpendicular to shoulder->wrist ray
    const dotPole = _poleProj.copy(poleDir).dot(_uDir);
    _poleProj.addScaledVector(_uDir, -dotPole);
    if (_poleProj.lengthSq() < 1e-5) {
      _poleProj.set(0, -1, 0);
    } else {
      _poleProj.normalize();
    }

    // Elbow hinge axis perpendicular to arm plane
    _sideAxis.crossVectors(_uDir, _poleProj).normalize();

    // Law of cosines for shoulder & elbow angles
    const cosUpper = THREE.MathUtils.clamp(
      (L1 * L1 + clampedDist * clampedDist - L2 * L2) / (2 * L1 * clampedDist),
      -0.999,
      0.999,
    );
    const upperAngle = Math.acos(cosUpper);

    const cosElbow = THREE.MathUtils.clamp(
      (L1 * L1 + L2 * L2 - clampedDist * clampedDist) / (2 * L1 * L2),
      -0.999,
      0.999,
    );
    const elbowBend = Math.PI - Math.acos(cosElbow);

    _upperDir
      .copy(_uDir)
      .multiplyScalar(Math.cos(upperAngle))
      .addScaledVector(_poleProj, Math.sin(upperAngle))
      .normalize();

    _zAxis.crossVectors(_sideAxis, _upperDir).normalize();
    _rotMat.makeBasis(_sideAxis, _upperDir, _zAxis);
    shoulder.quaternion.setFromRotationMatrix(_rotMat);
    upperArm.quaternion.identity();

    // Bend forearm cleanly back toward wrist target around local X hinge axis
    forearm.rotation.set(-elbowBend, 0, 0);

    // Orient wrist to exact desired orientation relative to viewmodelGroup
    _parentWorldQuat.copy(shoulder.quaternion).multiply(forearm.quaternion);
    _invParentQuat.copy(_parentWorldQuat).invert();
    wrist.quaternion.copy(_invParentQuat).multiply(desiredWristQuat);
  }

  private applyLeftFingerAngles(elapsed: number, damp: number, pose: LeftHandPose): void {
    const spec = LEFT_POSE_TABLE[pose];
    const breathRipple = Math.sin(elapsed * 2.4) * 1.4;

    for (let i = 0; i < 4; i++) {
      const f = spec.fingers[i];
      const targetMcp = f.mcp + (pose === 'RELAXED_IDLE' ? breathRipple * (0.7 + i * 0.15) : 0);
      this.curLeftCurl[i] = THREE.MathUtils.lerp(this.curLeftCurl[i], targetMcp, damp);
      this.curLeftPip[i] = THREE.MathUtils.lerp(this.curLeftPip[i], f.pip, damp);
      this.curLeftDip[i] = THREE.MathUtils.lerp(this.curLeftDip[i], f.dip, damp);
      this.curLeftSplay[i] = THREE.MathUtils.lerp(this.curLeftSplay[i], f.splay, damp);

      const joints = this.leftFingers[i];
      // Positive finger curl bends +Y toward -Z inner palm via negative rotation.x
      joints.mcp.rotation.set(-this.curLeftCurl[i] * DEG2RAD, 0, this.curLeftSplay[i] * DEG2RAD);
      joints.pip.rotation.set(-this.curLeftPip[i] * DEG2RAD, 0, 0);
      joints.dip.rotation.set(-this.curLeftDip[i] * DEG2RAD, 0, 0);
    }

    this.curThumbCmcX = THREE.MathUtils.lerp(this.curThumbCmcX, spec.thumb.cmcX, damp);
    this.curThumbCmcY = THREE.MathUtils.lerp(this.curThumbCmcY, spec.thumb.cmcY, damp);
    this.curThumbCmcZ = THREE.MathUtils.lerp(this.curThumbCmcZ, spec.thumb.cmcZ, damp);
    this.curThumbMcp = THREE.MathUtils.lerp(this.curThumbMcp, spec.thumb.mcp, damp);
    this.curThumbIp = THREE.MathUtils.lerp(this.curThumbIp, spec.thumb.ip, damp);

    this.leftThumb.cmc.rotation.set(
      -this.curThumbCmcX * DEG2RAD,
      this.curThumbCmcY * DEG2RAD,
      this.curThumbCmcZ * DEG2RAD,
    );
    this.leftThumb.mcp.rotation.set(-this.curThumbMcp * DEG2RAD, 0, 0);
    this.leftThumb.ip.rotation.set(-this.curThumbIp * DEG2RAD, 0, 0);
  }

  private applyRightFingerAngles(
    elapsed: number,
    damp: number,
    pose: RightHandPose,
    exertionDeg: number,
  ): void {
    const spec = RIGHT_POSE_TABLE[pose];
    this.curRightExertion = THREE.MathUtils.lerp(this.curRightExertion, exertionDeg, damp);

    // Dynamic wrap adjustment from equipped weapon handle diameter
    const gripRadius = WEAPONS_BY_ID[this.activeWeapon].gripRadius;
    const gripRadiusAdj = pose === 'WEAPON_GRIP' && gripRadius > 0 ? (gripRadius - 0.017) * 2600 : 0;
    const breathRipple = Math.sin(elapsed * 2.2 + 0.6) * 1.1;

    for (let i = 0; i < 4; i++) {
      const f = spec.fingers[i];
      const ripple = pose === 'UNARMED_READY' ? breathRipple * (0.7 + i * 0.15) : 0;
      const targetMcp = THREE.MathUtils.clamp(f.mcp + this.curRightExertion * 0.65 - gripRadiusAdj + ripple, -12, 95);
      const targetPip = THREE.MathUtils.clamp(f.pip + this.curRightExertion * 0.85 - gripRadiusAdj, 4, 98);
      const targetDip = THREE.MathUtils.clamp(f.dip + this.curRightExertion * 0.55 - gripRadiusAdj * 0.6, 4, 92);

      this.curRightCurl[i] = THREE.MathUtils.lerp(this.curRightCurl[i], targetMcp, damp);
      this.curRightPip[i] = THREE.MathUtils.lerp(this.curRightPip[i], targetPip, damp);
      this.curRightDip[i] = THREE.MathUtils.lerp(this.curRightDip[i], targetDip, damp);
      this.curRightSplay[i] = THREE.MathUtils.lerp(this.curRightSplay[i], f.splay, damp);

      const joints = this.rightFingers[i];
      joints.mcp.rotation.set(-this.curRightCurl[i] * DEG2RAD, 0, this.curRightSplay[i] * DEG2RAD);
      joints.pip.rotation.set(-this.curRightPip[i] * DEG2RAD, 0, 0);
      joints.dip.rotation.set(-this.curRightDip[i] * DEG2RAD, 0, 0);
    }

    this.curRThumbCmcX = THREE.MathUtils.lerp(this.curRThumbCmcX, spec.thumb.cmcX, damp);
    this.curRThumbCmcY = THREE.MathUtils.lerp(this.curRThumbCmcY, spec.thumb.cmcY, damp);
    this.curRThumbCmcZ = THREE.MathUtils.lerp(this.curRThumbCmcZ, spec.thumb.cmcZ, damp);
    this.curRThumbMcp = THREE.MathUtils.lerp(this.curRThumbMcp, spec.thumb.mcp + this.curRightExertion * 0.35, damp);
    this.curRThumbIp = THREE.MathUtils.lerp(this.curRThumbIp, spec.thumb.ip + this.curRightExertion * 0.35, damp);

    this.rightThumb.cmc.rotation.set(
      -this.curRThumbCmcX * DEG2RAD,
      -this.curRThumbCmcY * DEG2RAD,
      -this.curRThumbCmcZ * DEG2RAD,
    );
    this.rightThumb.mcp.rotation.set(-this.curRThumbMcp * DEG2RAD, 0, 0);
    this.rightThumb.ip.rotation.set(-this.curRThumbIp * DEG2RAD, 0, 0);
  }

  private resetTrailHistory(): void {
    this.viewmodelGroup.updateWorldMatrix(true, true);
    _vmWorldQuat.setFromRotationMatrix(this.viewmodelGroup.matrixWorld);
    _vmInvWorldQuat.copy(_vmWorldQuat).invert();
    _vmWorldPos.setFromMatrixPosition(this.viewmodelGroup.matrixWorld);

    this.batTipMarker.getWorldPosition(_tipWorld);
    this.batThroatMarker.getWorldPosition(_baseWorld);

    _trailLocalTip.copy(_tipWorld).sub(_vmWorldPos).applyQuaternion(_vmInvWorldQuat);
    _trailLocalBase.copy(_baseWorld).sub(_vmWorldPos).applyQuaternion(_vmInvWorldQuat);

    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      this.trailTipHistory[i].copy(_trailLocalTip);
      this.trailBaseHistory[i].copy(_trailLocalBase);
    }
  }

  private updateMotionTrail(active: boolean, dt: number): void {
    if (active) {
      this.trailFade = 1.0;
      this.viewmodelGroup.updateWorldMatrix(true, true);
      _vmWorldQuat.setFromRotationMatrix(this.viewmodelGroup.matrixWorld);
      _vmInvWorldQuat.copy(_vmWorldQuat).invert();
      _vmWorldPos.setFromMatrixPosition(this.viewmodelGroup.matrixWorld);

      this.batTipMarker.getWorldPosition(_tipWorld);
      this.batThroatMarker.getWorldPosition(_baseWorld);
      _trailLocalTip.copy(_tipWorld).sub(_vmWorldPos).applyQuaternion(_vmInvWorldQuat);
      _trailLocalBase.copy(_baseWorld).sub(_vmWorldPos).applyQuaternion(_vmInvWorldQuat);

      for (let i = TRAIL_SEGMENTS - 1; i > 0; i--) {
        this.trailTipHistory[i].copy(this.trailTipHistory[i - 1]);
        this.trailBaseHistory[i].copy(this.trailBaseHistory[i - 1]);
      }
      this.trailTipHistory[0].copy(_trailLocalTip);
      this.trailBaseHistory[0].copy(_trailLocalBase);
    } else if (this.trailFade > 0) {
      this.trailFade = Math.max(0, this.trailFade - dt * 7.5);
    }

    if (this.trailFade <= 0.01) {
      this.trailMesh.visible = false;
      this.trailMat.opacity = 0;
      return;
    }

    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const t = this.trailTipHistory[i];
      const b = this.trailBaseHistory[i];
      const tipIdx = i * 6;
      this.trailPositions[tipIdx] = t.x;
      this.trailPositions[tipIdx + 1] = t.y;
      this.trailPositions[tipIdx + 2] = t.z;

      const baseIdx = tipIdx + 3;
      this.trailPositions[baseIdx] = b.x;
      this.trailPositions[baseIdx + 1] = b.y;
      this.trailPositions[baseIdx + 2] = b.z;
    }

    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailMat.opacity = this.trailFade * 0.58;
    this.trailMesh.visible = true;
  }

  private applyActiveWeaponMeshes(weapon: WeaponId): void {
    this.activeWeapon = weapon;
    this.batGroup.visible = weapon === 'bat';
    this.daggerGroup.visible = weapon === 'dagger';
    this.cleaverGroup.visible = weapon === 'cleaver';

    if (weapon === 'bat') {
      this.batThroatMarker.position.set(0, 0.26, 0);
      this.batTipMarker.position.set(0, 0.67, 0);
    } else if (weapon === 'dagger') {
      this.batThroatMarker.position.set(0, 0.14, 0);
      this.batTipMarker.position.set(0, 0.42, -0.01);
    } else if (weapon === 'cleaver') {
      this.batThroatMarker.position.set(0, 0.22, -0.02);
      this.batTipMarker.position.set(0, 0.62, -0.04);
    }
    this.resetTrailHistory();
  }

  public setWeapon(weapon: WeaponId, immediate = false): void {
    if (immediate) {
      this.pendingWeapon = null;
      this.equipSwapTime = -1;
      this.applyActiveWeaponMeshes(weapon);
      return;
    }
    if (this.activeWeapon === weapon && this.pendingWeapon === null) return;
    if (this.pendingWeapon === weapon) return;
    this.pendingWeapon = weapon;
    this.equipSwapTime = 0;
  }

  public getWeapon(): WeaponId {
    return this.pendingWeapon ?? this.activeWeapon;
  }

  public triggerSwing(duration = 0.44): void {
    this.swingToggle = !this.swingToggle;
    this.animState = this.swingToggle ? 'swing_left' : 'swing_right';
    this.animTime = 0;
    this.animDuration = Math.max(0.2, duration);
    this.swingArcMat.color.setHex(
      this.activeWeapon === 'cleaver' ? 0xfbbf24 : this.activeWeapon === 'dagger' ? 0xe2e8f0 : 0xfef08a,
    );
    this.swingArcMesh.rotation.z = this.swingToggle ? -0.5 : 2.6;
    this.resetTrailHistory();
  }

  public triggerParry(): void {
    this.animState = 'parry';
    this.animTime = 0;
    this.animDuration = 0.38;
    this.swingArcMat.color.setHex(0xfacc15);
    this.swingArcMesh.rotation.z = 0.1;
  }

  public triggerTakedown(origin: THREE.Vector3): void {
    this.animState = 'takedown';
    this.animTime = 0;
    this.animDuration = 0.55;
    this.swingArcMat.color.setHex(0xf59e0b);
    this.resetTrailHistory();

    this.shockwaveTime = 0;
    this.shockwaveMesh.position.set(origin.x, origin.y + 0.08, origin.z);
    this.shockwaveMesh.scale.setScalar(0.5);
    this.shockwaveMesh.visible = true;
    this.shockwaveMat.opacity = 0.9;
  }

  public triggerBlocked(): void {
    this.animState = 'blocked';
    this.animTime = 0;
    this.animDuration = 0.26;
  }

  public triggerInspect(): void {
    if (this.animState !== 'idle' && this.animState !== 'inspect') return;
    this.animState = 'inspect';
    this.animTime = 0;
    this.animDuration = 1.95;
  }

  public triggerIntroReady(): void {
    this.animState = 'intro_ready';
    this.animTime = 0;
    this.animDuration = 2.2;
  }

  public cancelIntroReady(): void {
    if (this.animState === 'intro_ready') {
      this.animState = 'idle';
      this.animTime = 0;
    }
  }

  public triggerKick(isDropkick = false): void {
    this.kickTime = 0;
    this.kickIsDropkick = isDropkick;
    this.rightLegPivot.visible = true;
    this.leftLegPivot.visible = isDropkick;
  }

  public spawnSparks(worldPos: THREE.Vector3, colorHex = 0xfbbf24, count = 10): void {
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < count; i++) {
      const p = this.sparkPool[i];
      if (p.life <= 0) {
        p.life = 0.25 + Math.random() * 0.2;
        p.maxLife = p.life;
        p.mesh.position.copy(worldPos);
        p.mesh.visible = true;
        (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
        p.vel.set((Math.random() - 0.5) * 6.5, 1.5 + Math.random() * 4.5, (Math.random() - 0.5) * 6.5);
        spawned++;
      }
    }
  }

  public spawnBloodAndSparks(worldPos: THREE.Vector3, hitDir: THREE.Vector3, count = 10): void {
    this.spawnSparks(worldPos, 0xfbbf24, Math.max(4, Math.floor(count * 0.65)));
    let bloodSpawned = 0;
    for (let i = 0; i < this.bloodPool.length && bloodSpawned < count; i++) {
      const b = this.bloodPool[i];
      if (b.life <= 0) {
        b.life = 0.32 + Math.random() * 0.22;
        b.maxLife = b.life;
        b.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.16,
          worldPos.y + (Math.random() - 0.5) * 0.16,
          worldPos.z + (Math.random() - 0.5) * 0.16,
        );
        b.mesh.scale.setScalar(0.75 + Math.random() * 0.65);
        b.mesh.visible = true;
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
        b.vel.set(
          hitDir.x * (2.6 + Math.random() * 2.5) + (Math.random() - 0.5) * 4.2,
          1.4 + Math.random() * 3.4,
          hitDir.z * (2.6 + Math.random() * 2.5) + (Math.random() - 0.5) * 4.2,
        );
        bloodSpawned++;
      }
    }
  }

  public spawnDustPuffs(worldPos: THREE.Vector3, count = 8): void {
    let spawned = 0;
    for (let i = 0; i < this.dustPool.length && spawned < count; i++) {
      const p = this.dustPool[i];
      if (p.life <= 0) {
        p.life = 0.42 + Math.random() * 0.25;
        p.maxLife = p.life;
        const angle = (spawned / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.5;
        p.mesh.position.set(
          worldPos.x + Math.cos(angle) * 0.3,
          worldPos.y + 0.14,
          worldPos.z + Math.sin(angle) * 0.3,
        );
        p.mesh.scale.setScalar(0.65);
        p.mesh.visible = true;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45;
        p.vel.set(
          Math.cos(angle) * (1.8 + Math.random() * 1.4),
          0.7 + Math.random() * 0.9,
          Math.sin(angle) * (1.8 + Math.random() * 1.4),
        );
        spawned++;
      }
    }
  }

  public throwFirecracker(origin: THREE.Vector3, dir: THREE.Vector3): ActiveFirecracker {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.firecrackerBodyGeo, this.firecrackerBodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const tip = new THREE.Mesh(this.firecrackerTipGeo, this.firecrackerTipMat);
    tip.position.z = 0.13;
    group.add(tip);

    group.position.copy(origin);
    this.scene.add(group);

    this.firecrackerLight.position.copy(origin);
    this.firecrackerLight.intensity = 4.5;

    const vel = dir.clone().multiplyScalar(14);
    vel.y += 4.2;

    const fc: ActiveFirecracker = {
      mesh: group,
      light: this.firecrackerLight,
      pos: origin.clone(),
      vel,
      age: 0,
      banged: false,
      lureDuration: 6.5,
      sparkTimer: 0,
    };
    this.activeFirecrackers.push(fc);
    return fc;
  }

  public getActiveLurePosition(): THREE.Vector3 | null {
    for (let i = this.activeFirecrackers.length - 1; i >= 0; i--) {
      const fc = this.activeFirecrackers[i];
      if (fc.age < fc.lureDuration) {
        return fc.pos;
      }
    }
    return null;
  }

  public update(
    dt: number,
    elapsed: number,
    moveSpeedRatio: number,
    isSprinting: boolean,
    isMantling: boolean,
    isAirborne: boolean,
    canMantle: boolean,
    isSliding: boolean,
    isZiplining: boolean,
    isVaulting: boolean,
    isLookingDown: boolean,
    wallRunSide: -1 | 0 | 1,
    isRolling: boolean,
    onFirecrackerBang: (pos: THREE.Vector3) => void,
    parkourDetail?: ParkourAnimDetail,
  ): void {
    const camBobX = parkourDetail?.bobX ?? 0;
    const camBobY = parkourDetail?.bobY ?? 0;
    const strafeInput = parkourDetail?.strafeInput ?? 0;
    const vaultProgress = parkourDetail?.vaultProgress ?? 0.5;
    const mantleProgress = parkourDetail?.mantleProgress ?? 0.5;
    const isNight = parkourDetail?.isNight ?? false;
    const inSafeZone = parkourDetail?.inSafeZone ?? false;
    const horizSpeed = parkourDetail?.horizSpeed ?? moveSpeedRatio * 7.5;
    const yawDelta = parkourDetail?.yawDelta ?? 0;
    const pitchDelta = parkourDetail?.pitchDelta ?? 0;
    const wallPullback = parkourDetail?.wallPullback ?? 0;

    const climbState = parkourDetail?.climbState ?? 'NONE';
    const climbPhaseTime = parkourDetail?.climbPhaseTime ?? 0;
    const scrambleSide = parkourDetail?.scrambleSide ?? 1;
    const leftGripWorld = parkourDetail?.leftGripWorld;
    const rightGripWorld = parkourDetail?.rightGripWorld;
    const awakeningActive = parkourDetail?.awakeningActive ?? false;
    const awakeningPose = parkourDetail?.awakeningPose;
    const awakeningBatEmissive = parkourDetail?.awakeningBatEmissive ?? null;
    const awakeningBatEmissiveIntensity = parkourDetail?.awakeningBatEmissiveIntensity ?? 1.0;

    // Pumped-Up bat barrel fiery aura pulse (0.30..0.60 opacity)
    if (awakeningActive && this.activeWeapon === 'bat') {
      this.batAuraMesh.visible = true;
      this.batAuraMat.opacity = 0.45 + Math.sin(elapsed * 10) * 0.15;
    } else {
      this.batAuraMesh.visible = false;
      this.batAuraMat.opacity = 0;
    }

    // Crimson rim glint / fiery orange wind-up glow on bat barrel
    if (awakeningBatEmissive && this.activeWeapon === 'bat') {
      this.batWoodMat.emissive.copy(awakeningBatEmissive);
      this.batWoodMat.emissiveIntensity = awakeningBatEmissiveIntensity;
    } else {
      this.batWoodMat.emissive.setRGB(0, 0, 0);
      this.batWoodMat.emissiveIntensity = 1.0;
    }

    // -------------------------------------------------------------------------
    // A. Watch Dial / Biomarker LED State (Pale Cyan Day/Safe, Crimson Night — zero bloom blowout)
    // -------------------------------------------------------------------------
    if (this.animState === 'intro_ready') {
      const p1 = Math.exp(-Math.pow((this.animTime - 0.55) / 0.14, 2));
      const p2 = Math.exp(-Math.pow((this.animTime - 1.05) / 0.14, 2));
      this.biomarkerLedMat.color.setHex(0x7eeeff);
      this.biomarkerLedMat.emissive.setHex(0x5ce1ff);
      this.biomarkerLedMat.emissiveIntensity = 0.78 + Math.max(p1, p2) * 1.1;
    } else if (isNight && !inSafeZone) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 5.2);
      this.biomarkerLedMat.color.setHex(0xff5238);
      this.biomarkerLedMat.emissive.setHex(0xff3b1f);
      this.biomarkerLedMat.emissiveIntensity = 0.6 + pulse * 0.65;
    } else {
      const steadyBreath = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 1.4);
      this.biomarkerLedMat.color.setHex(0x7eeeff);
      this.biomarkerLedMat.emissive.setHex(0x5ce1ff);
      this.biomarkerLedMat.emissiveIntensity = 0.66 + steadyBreath * 0.16;
    }

    // -------------------------------------------------------------------------
    // B. Mouse-look Rotational Spring Lag (±0.08 rad max) + Anti-Wall Pullback
    // -------------------------------------------------------------------------
    if (climbState === 'MUSCLE_UP' || awakeningPose?.active) {
      this.swayYawLag = 0;
      this.swayPitchLag = 0;
      this.curVmRoll = THREE.MathUtils.lerp(this.curVmRoll, 0, 1 - Math.exp(-20 * dt));
      this.curVmPullback = 0;
      this.viewmodelGroup.position.set(0, 0, 0);
      this.viewmodelGroup.rotation.set(0, 0, 0);
    } else {
      this.swayYawLag = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(this.swayYawLag + yawDelta * 0.85, 0, 1 - Math.exp(-12 * dt)),
        -0.08,
        0.08,
      );
      this.swayPitchLag = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(this.swayPitchLag + pitchDelta * 0.85, 0, 1 - Math.exp(-12 * dt)),
        -0.08,
        0.08,
      );

      // Spring-damped landing impact dip & recovery
      const springForce = -220 * this.landingDipPos - 24 * this.landingDipVel;
      this.landingDipVel += springForce * dt;
      this.landingDipPos = THREE.MathUtils.clamp(this.landingDipPos + this.landingDipVel * dt, -0.14, 0.04);

      const targetVmRoll = isSliding ? -6 * DEG2RAD : -strafeInput * 0.028;
      this.curVmRoll = THREE.MathUtils.lerp(this.curVmRoll, targetVmRoll, 1 - Math.exp(-14 * dt));
      this.curVmPullback = THREE.MathUtils.lerp(this.curVmPullback, wallPullback, 1 - Math.exp(-16 * dt));

      this.viewmodelGroup.position.set(0, -this.curVmPullback * 0.04 + this.landingDipPos, this.curVmPullback * 0.16);
      this.viewmodelGroup.rotation.set(
        this.swayPitchLag * 0.45 + this.landingDipPos * 1.15,
        this.swayYawLag * 0.55,
        this.curVmRoll,
      );
    }

    // -------------------------------------------------------------------------
    // C. Idle Figure-8 Breathing Sway (0.004 amp) & Locomotion Offsets
    // -------------------------------------------------------------------------
    const breathPrimary = Math.sin(elapsed * Math.PI * 2 * 0.38);
    const breathWrist = Math.sin(elapsed * Math.PI * 2 * 0.76 + 0.4);
    const fig8X = Math.sin(elapsed * 1.9) * 0.004;
    const fig8Y = Math.sin(elapsed * 3.8) * 0.0026;
    const isMoving = horizSpeed >= 0.5;

    // 1. Default Idle & Breathing Target Poses
    const isUnarmed = this.activeWeapon === 'unarmed';
    const isDagger = this.activeWeapon === 'dagger';
    const isCleaver = this.activeWeapon === 'cleaver';

    // Right Arm Idle Pose (State A Unarmed Guard vs State C Bat/Cleaver/Dagger Ready)
    let rPosX = (isUnarmed ? 0.34 : isDagger ? 0.27 : isCleaver ? 0.31 : 0.29) + fig8X + this.swayYawLag * 0.16;
    let rPosY = (isUnarmed ? -0.28 : isDagger ? -0.25 : isCleaver ? -0.28 : -0.26) + fig8Y + breathPrimary * 0.0035 - this.swayPitchLag * 0.14;
    let rPosZ = (isUnarmed ? -0.52 : isDagger ? -0.47 : isCleaver ? -0.45 : -0.44) + breathPrimary * 0.002;
    let rRotX = (isUnarmed ? -1.08 : isDagger ? -0.72 : isCleaver ? -0.34 : -0.38) + breathPrimary * 0.014 + this.swayPitchLag * 0.65;
    let rRotY = (isUnarmed ? -0.22 : isDagger ? 0.78 : isCleaver ? 0.98 : 0.95) + breathWrist * 0.012 + this.swayYawLag * 0.65;
    let rRotZ = (isUnarmed ? 0.25 : isDagger ? -0.96 : isCleaver ? -1.02 : -1.05) - strafeInput * 0.055;

    let lPosX = (isUnarmed ? -0.3 : -0.34) - fig8X * 0.6 + this.swayYawLag * 0.12;
    let lPosY = (isUnarmed ? -0.21 : -0.24) + fig8Y * 0.8 + breathPrimary * 0.004 - this.swayPitchLag * 0.12;
    let lPosZ = (isUnarmed ? -0.48 : -0.5) + breathPrimary * 0.002;
    let lRotX = -1.08 + breathPrimary * 0.018 + this.swayPitchLag * 0.5;
    let lRotY = (isUnarmed ? 0.38 : 0.36) + breathWrist * 0.012 + this.swayYawLag * 0.5;
    let lRotZ = (isUnarmed ? -0.38 : -0.42) - strafeInput * 0.06;

    let leftFingerPose: LeftHandPose = isUnarmed ? 'FIST_CLENCH' : 'RELAXED_IDLE';
    let rightFingerPose: RightHandPose = isUnarmed ? 'UNARMED_READY' : 'WEAPON_GRIP';
    let rightExertionStrain = 0;
    let dampHz = 14;

    // 2. Walking & Sprinting (Figure-8 rhythm & cross-body sprint pump)
    if (
      isMoving &&
      !isSliding &&
      !isAirborne &&
      !isVaulting &&
      !isMantling &&
      climbState === 'NONE' &&
      !isZiplining &&
      !isRolling
    ) {
      if (isSprinting) {
        const pumpSin = Math.sin(elapsed * 14);
        const pumpCos = Math.cos(elapsed * 14);
        lPosX = -0.24 - camBobX * 0.4 + pumpSin * 0.042;
        lPosY = -0.22 - camBobY * 0.4 + pumpCos * 0.048;
        lPosZ = -0.42 - pumpSin * 0.072;
        lRotX = -1.04 + pumpSin * 0.18;
        lRotY = 0.34 + pumpCos * 0.08;
        lRotZ = -0.24;

        if (isUnarmed) {
          // State B Unarmed Sprint: rhythmic cross-body tight-fist pump opposite left arm
          rightFingerPose = 'TIGHT_FIST';
          rPosX = 0.26 - camBobX * 0.35 - pumpSin * 0.044;
          rPosY = -0.24 - camBobY * 0.35 - pumpCos * 0.044;
          rPosZ = -0.46 + pumpSin * 0.074;
          rRotX = -1.1 + pumpSin * 0.2;
          rRotY = -0.28 + pumpCos * 0.08;
          rRotZ = 0.34;
        } else {
          // Weapon Sprint: tuck bat/blade diagonally across chest with crisp stride cadence
          rPosX = 0.24 - camBobX * 0.35 + pumpCos * 0.018;
          rPosY = -0.21 - camBobY * 0.35 - Math.abs(pumpSin) * 0.02;
          rPosZ = -0.37 - pumpCos * 0.022;
          rRotX = -0.22 + pumpSin * 0.06;
          rRotY = 0.72 + pumpCos * 0.045;
          rRotZ = -0.82 - strafeInput * 0.05;
        }
      } else {
        // Walking: figure-eight counter-swing synced to camera head-bob
        const walkFactor = THREE.MathUtils.clamp(moveSpeedRatio, 0, 1);
        const walkPhase = elapsed * 9;
        rPosX += -camBobX * 0.5 + Math.cos(walkPhase * 0.5) * 0.016 * walkFactor;
        rPosY += -camBobY * 0.5 - Math.abs(Math.sin(walkPhase)) * 0.015 * walkFactor;
        rPosZ += Math.sin(walkPhase) * 0.02 * walkFactor;
        rRotX += Math.sin(walkPhase) * 0.04 * walkFactor;
        rRotZ += Math.cos(walkPhase * 0.5) * 0.025 * walkFactor;

        lPosX += -camBobX * 0.5 - Math.cos(walkPhase * 0.5) * 0.014 * walkFactor;
        lPosY += -camBobY * 0.5 + Math.abs(Math.sin(walkPhase)) * 0.014 * walkFactor;
        lPosZ += -Math.sin(walkPhase) * 0.022 * walkFactor;
        lRotX += -Math.sin(walkPhase) * 0.055 * walkFactor;
      }
    }

    // 3. Parkour Slide (C while sprinting)
    if (isSliding) {
      lPosX = -0.32;
      lPosY = -0.36;
      lPosZ = -0.32;
      lRotX = -0.88;
      lRotY = 0.22;
      lRotZ = 0.24;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.32;
      rPosY = -0.34;
      rPosZ = -0.3;
      rRotX = -0.95;
      rRotY = 0.16;
      rRotZ = isUnarmed ? 0.36 : -0.65;
      if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      dampHz = 16;
    }

    // 4. Rolling, Wall-Run, Zipline, Speed Vault, Ledge Grab & Mantle, Airborne Jump
    if (isRolling) {
      lPosX = -0.2;
      lPosY = -0.34;
      lPosZ = -0.34;
      lRotX = -1.75;
      lRotZ = 0.15;
      leftFingerPose = 'FIST_CLENCH';

      rPosX = 0.2;
      rPosY = -0.36;
      rPosZ = -0.34;
      rRotX = -1.42;
      rRotY = -0.15;
      rRotZ = isUnarmed ? 0.18 : -0.6;
      if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
      dampHz = 18;
    } else if (wallRunSide !== 0) {
      if (wallRunSide === -1) {
        // Left hand skims along left wall
        lPosX = -0.38;
        lPosY = -0.14 + Math.sin(elapsed * 16) * 0.028;
        lPosZ = -0.46;
        lRotX = -1.25;
        lRotY = 0.1;
        lRotZ = 0.55;
        leftFingerPose = 'OPEN_REACH';

        rPosX = 0.3;
        rPosY = -0.24 + Math.cos(elapsed * 16) * 0.022;
        rPosZ = -0.42;
        rRotX = isUnarmed ? -1.02 : -0.28;
        rRotY = isUnarmed ? -0.18 : 0.85;
        rRotZ = isUnarmed ? 0.22 : -0.95;
      } else {
        lPosX = -0.26;
        lPosY = -0.22 + Math.cos(elapsed * 16) * 0.026;
        lPosZ = -0.42;
        lRotX = -1.05;
        rPosX = 0.36;
        rPosY = -0.16 + Math.sin(elapsed * 16) * 0.024;
        rPosZ = -0.46;
        rRotX = -1.22;
        rRotY = isUnarmed ? -0.12 : 0.55;
        rRotZ = isUnarmed ? -0.45 : -0.78;
        if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      }
      dampHz = 16;
    } else if (isZiplining) {
      const zipSway = Math.sin(elapsed * 4.5) * 0.015;
      const zipBuzz = Math.sin(elapsed * 46) * 0.003;
      this.ziplineHookPivot.visible = true;
      this.ziplineHookPivot.position.set(zipSway, 0.23 + zipBuzz, -0.44);
      this.ziplineHookPivot.rotation.set(0.05, 0, -zipSway * 1.8);

      lPosX = -0.14 + zipSway;
      lPosY = 0.14 + zipBuzz;
      lPosZ = -0.42;
      lRotX = -1.25;
      lRotY = 0.06;
      lRotZ = -0.05 - zipSway * 1.4;
      leftFingerPose = 'FIST_CLENCH';

      rPosX = 0.15 + zipSway;
      rPosY = 0.13 + zipBuzz;
      rPosZ = -0.42;
      rRotX = -1.25;
      rRotY = -0.06;
      rRotZ = 0.05 - zipSway * 1.4;
      if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
      dampHz = 18;
    } else if (isVaulting) {
      // Speed Vault: Left hand plants flat; Right hand braces forward with splayed fingers
      const plantArc = Math.sin(vaultProgress * Math.PI);
      lPosX = -0.18;
      lPosY = -0.22 - plantArc * 0.09;
      lPosZ = -0.5 - plantArc * 0.06;
      lRotX = -1.45 + 70 * DEG2RAD * plantArc;
      lRotY = 0.12;
      lRotZ = 0.05;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.32;
      rPosY = -0.26 - plantArc * 0.05;
      rPosZ = -0.48 - plantArc * 0.06;
      rRotX = isUnarmed ? -1.32 + 0.35 * plantArc : -0.35;
      rRotY = isUnarmed ? -0.15 : 0.85;
      rRotZ = isUnarmed ? 0.16 : -0.78;
      if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      dampHz = 18;
    } else if (climbState === 'WALL_SCRAMBLE') {
      const wave = Math.sin(climbPhaseTime * 24) * scrambleSide;
      lPosX = -0.22;
      lPosY = -0.05 + wave * 0.11;
      lPosZ = -0.46;
      lRotX = -1.42;
      lRotY = 0.14;
      lRotZ = -0.1;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.24;
      rPosY = -0.08 - wave * 0.1;
      rPosZ = -0.46;
      rRotX = -1.38;
      rRotY = isUnarmed ? -0.12 : 0.45;
      rRotZ = isUnarmed ? 0.12 : -0.65;
      rightFingerPose = 'PARKOUR_OPEN';
      rightExertionStrain = -4;
      dampHz = 24;
    } else if (climbState === 'MUSCLE_UP' || isMantling) {
      if (climbState === 'MUSCLE_UP' && leftGripWorld && rightGripWorld) {
        if (climbPhaseTime < 0.42) {
          this.camera.updateMatrixWorld(true);
          this.viewmodelGroup.updateMatrixWorld(true);
          _ikLeftLocal.copy(leftGripWorld);
          this.viewmodelGroup.worldToLocal(_ikLeftLocal);
          _ikRightLocal.copy(rightGripWorld);
          this.viewmodelGroup.worldToLocal(_ikRightLocal);

          _ikLeftLocal.z = Math.min(-0.18, _ikLeftLocal.z + 0.025);
          _ikLeftLocal.y = THREE.MathUtils.clamp(_ikLeftLocal.y + 0.015, -0.68, 0.16);
          _ikReachVec.subVectors(_ikLeftLocal, _ikLeftShoulder);
          if (_ikReachVec.length() > 0.72) {
            _ikReachVec.setLength(0.72);
            _ikLeftLocal.copy(_ikLeftShoulder).add(_ikReachVec);
          }

          _ikRightLocal.z = Math.min(-0.18, _ikRightLocal.z + 0.03);
          _ikRightLocal.y = THREE.MathUtils.clamp(_ikRightLocal.y + 0.015, -0.68, 0.16);
          _ikReachVec.subVectors(_ikRightLocal, _ikRightShoulder);
          if (_ikReachVec.length() > 0.72) {
            _ikReachVec.setLength(0.72);
            _ikRightLocal.copy(_ikRightShoulder).add(_ikReachVec);
          }

          const pullU = THREE.MathUtils.clamp((climbPhaseTime - 0.14) / 0.28, 0, 1);
          const tremor = climbPhaseTime >= 0.14 ? Math.sin(elapsed * 18 * Math.PI * 2) * 0.003 : 0;

          lPosX = _ikLeftLocal.x + tremor;
          lPosY = _ikLeftLocal.y + tremor * 0.7;
          lPosZ = _ikLeftLocal.z;
          if (climbPhaseTime < 0.06) {
            const reachU = climbPhaseTime / 0.06;
            lRotX = THREE.MathUtils.lerp(-1.12, -1.52, reachU);
            lRotY = 0.08;
            lRotZ = -0.08;
            leftFingerPose = 'OPEN_REACH';
          } else {
            lRotX = -1.52 + pullU * 0.34;
            lRotY = 0.06;
            lRotZ = -0.06;
            leftFingerPose = 'LEDGE_CLAMP';
          }

          rPosX = _ikRightLocal.x - tremor;
          rPosY = _ikRightLocal.y + tremor * 0.7;
          rPosZ = _ikRightLocal.z;
          rRotX = isUnarmed ? -1.48 + pullU * 0.32 : -0.45 + pullU * 0.18;
          rRotY = isUnarmed ? -0.08 : 0.78;
          rRotZ = isUnarmed ? 0.06 : -0.82;
          rightFingerPose = isUnarmed ? (climbPhaseTime < 0.06 ? 'PARKOUR_OPEN' : 'TIGHT_FIST') : 'WEAPON_GRIP';
          rightExertionStrain = climbPhaseTime >= 0.14 ? 8 * Math.sin(pullU * Math.PI) : -3;
          dampHz = 30;
        } else {
          const u3 = THREE.MathUtils.clamp((climbPhaseTime - 0.42) / 0.2, 0, 1);
          if (u3 < 0.55) {
            const press = u3 / 0.55;
            lPosX = THREE.MathUtils.lerp(-0.22, -0.25, press);
            lPosY = THREE.MathUtils.lerp(-0.3, -0.36, press);
            lPosZ = THREE.MathUtils.lerp(-0.42, -0.36, press);
            lRotX = -1.78;
            lRotY = 0.1;
            lRotZ = 0.14;
            leftFingerPose = 'PALM_PRESS';

            rPosX = THREE.MathUtils.lerp(0.24, 0.28, press);
            rPosY = THREE.MathUtils.lerp(-0.32, -0.36, press);
            rPosZ = THREE.MathUtils.lerp(-0.42, -0.36, press);
            rRotX = isUnarmed ? -1.74 : -0.5;
            rRotY = isUnarmed ? -0.1 : 0.78;
            rRotZ = isUnarmed ? -0.12 : -0.82;
            if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
            rightExertionStrain = 5 * (1 - press);
          } else {
            const rec = (u3 - 0.55) / 0.45;
            const sRec = rec * rec * (3 - 2 * rec);
            lPosX = THREE.MathUtils.lerp(-0.25, -0.26, sRec);
            lPosY = THREE.MathUtils.lerp(-0.36, -0.24, sRec);
            lPosZ = THREE.MathUtils.lerp(-0.36, -0.38, sRec);
            lRotX = THREE.MathUtils.lerp(-1.78, -1.12, sRec);
            lRotY = THREE.MathUtils.lerp(0.1, 0.24, sRec);
            lRotZ = THREE.MathUtils.lerp(0.14, -0.18, sRec);
            leftFingerPose = 'RELAXED_IDLE';

            rPosX = THREE.MathUtils.lerp(0.28, 0.29, sRec);
            rPosY = THREE.MathUtils.lerp(-0.36, -0.26, sRec);
            rPosZ = THREE.MathUtils.lerp(-0.36, -0.44, sRec);
            rRotX = THREE.MathUtils.lerp(-1.2, isUnarmed ? -1.08 : -0.38, sRec);
            rRotY = THREE.MathUtils.lerp(0.4, isUnarmed ? -0.22 : 0.95, sRec);
            rRotZ = THREE.MathUtils.lerp(-0.4, isUnarmed ? 0.25 : -1.05, sRec);
            rightExertionStrain = 0;
          }
          dampHz = 22;
        }
      } else {
        if (mantleProgress < 0.24) {
          const reach = mantleProgress / 0.24;
          lPosX = THREE.MathUtils.lerp(-0.26, -0.2, reach);
          lPosY = THREE.MathUtils.lerp(-0.22, -0.04, reach);
          lPosZ = THREE.MathUtils.lerp(-0.42, -0.56, reach);
          lRotX = THREE.MathUtils.lerp(-1.1, -1.55, reach);
          leftFingerPose = reach > 0.65 ? 'LEDGE_CLAMP' : 'OPEN_REACH';

          rPosX = THREE.MathUtils.lerp(0.29, 0.22, reach);
          rPosY = THREE.MathUtils.lerp(-0.24, -0.06, reach);
          rPosZ = THREE.MathUtils.lerp(-0.44, -0.56, reach);
          rRotX = THREE.MathUtils.lerp(isUnarmed ? -1.08 : -0.38, -1.48, reach);
          rRotY = isUnarmed ? -0.1 : 0.72;
          rRotZ = isUnarmed ? 0.08 : -0.78;
          if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
        } else {
          const pull = (mantleProgress - 0.24) / 0.76;
          lPosX = THREE.MathUtils.lerp(-0.2, -0.28, pull);
          lPosY = THREE.MathUtils.lerp(-0.04, -0.38, pull);
          lPosZ = THREE.MathUtils.lerp(-0.56, -0.36, pull);
          lRotX = THREE.MathUtils.lerp(-1.55, -0.95, pull);
          leftFingerPose = pull > 0.65 ? 'PALM_PRESS' : 'LEDGE_CLAMP';

          rPosX = THREE.MathUtils.lerp(0.22, 0.3, pull);
          rPosY = THREE.MathUtils.lerp(-0.06, -0.36, pull);
          rPosZ = THREE.MathUtils.lerp(-0.56, -0.38, pull);
          rRotX = THREE.MathUtils.lerp(-1.48, isUnarmed ? -1.1 : -0.45, pull);
          rRotY = isUnarmed ? -0.12 : 0.82;
          rRotZ = isUnarmed ? 0.14 : -0.88;
          if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
        }
        dampHz = 18;
      }
    } else if (this.kickTime >= 0 && this.kickIsDropkick) {
      lPosX = -0.34;
      lPosY = -0.18;
      lPosZ = -0.44;
      lRotX = -0.95;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.34;
      rPosY = -0.2;
      rPosZ = -0.44;
      rRotX = isUnarmed ? -0.95 : -0.34;
      rRotZ = isUnarmed ? 0.32 : -0.82;
      if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      dampHz = 16;
    } else if (isAirborne && !isSliding) {
      // Jumping / Airborne: flare arms subtly for balance, splayed fingers when unarmed
      const airFloat = Math.sin(elapsed * 6.5) * 0.018;
      lPosX = -0.31;
      lPosY = -0.19 + airFloat;
      lPosZ = -0.43;
      lRotX = -1.02;
      lRotY = 0.18;
      lRotZ = -0.28;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.34;
      rPosY = -0.22 - airFloat * 0.6;
      rPosZ = -0.46;
      rRotX = isUnarmed ? -1.04 : -0.34;
      rRotY = isUnarmed ? -0.16 : 0.88;
      rRotZ = isUnarmed ? 0.28 : -0.92;
      if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      dampHz = 14;
    } else if (canMantle && !isSliding) {
      // Pre-reach cue near climbable ledge
      lPosX = -0.28;
      lPosY = -0.18;
      lPosZ = -0.46;
      lRotX = -1.2;
      leftFingerPose = 'OPEN_REACH';

      if (isUnarmed) {
        rPosX = 0.32;
        rPosY = -0.21;
        rPosZ = -0.5;
        rRotX = -1.24;
        rightFingerPose = 'PARKOUR_OPEN';
      }
    }

    if (!isZiplining) {
      this.ziplineHookPivot.visible = false;
    }

    // -------------------------------------------------------------------------
    // 5. Combat Swings (3-phase), Arkham Counter, Takedown & [B]/[I] Inspect
    // -------------------------------------------------------------------------
    let trailActive = false;
    if (this.animState !== 'idle' && !isZiplining && !isMantling && climbState === 'NONE' && !isVaulting) {
      if (this.animState === 'inspect' && (isSliding || isAirborne)) {
        this.animState = 'idle';
      } else {
        this.animTime += dt;
        const t = Math.min(1, this.animTime / this.animDuration);

        if (this.animState === 'swing_left' || this.animState === 'swing_right') {
          const isForehand = this.animState === 'swing_left';
          const dirSign = isForehand ? 1 : -1;
          dampHz = this.activeWeapon === 'dagger' ? 28 : this.activeWeapon === 'cleaver' ? 18 : 24;

          if (this.activeWeapon === 'unarmed') {
            // Unarmed 3-phase punch: wind-up -> crisp jab/cross with inward forearm pronation -> recovery
            const punch = Math.sin(t * Math.PI);
            const wind = t < 0.2 ? Math.sin((t / 0.2) * Math.PI * 0.5) : 0;
            leftFingerPose = 'FIST_CLENCH';
            rightFingerPose = 'TIGHT_FIST';
            rightExertionStrain = 6 * punch;
            if (isForehand) {
              // Fast Right Cross with pronation twist (thumb rotates downward/inward at strike peak)
              rPosX = THREE.MathUtils.lerp(rPosX, 0.05 + wind * 0.08, punch || wind * 0.5);
              rPosY = THREE.MathUtils.lerp(rPosY, -0.14 - wind * 0.03, punch || wind * 0.5);
              rPosZ = THREE.MathUtils.lerp(rPosZ, -0.74 + wind * 0.08, punch || wind * 0.5);
              rRotX = THREE.MathUtils.lerp(rRotX, -1.46, punch);
              rRotY = THREE.MathUtils.lerp(rRotY, -0.14, punch);
              rRotZ = THREE.MathUtils.lerp(rRotZ, 0.94, punch);

              lPosX = -0.22;
              lPosY = -0.21;
              lPosZ = -0.36;
            } else {
              // Fast Left Jab while Right Hand tightens guard
              lPosX = THREE.MathUtils.lerp(lPosX, -0.05, punch);
              lPosY = THREE.MathUtils.lerp(lPosY, -0.12, punch);
              lPosZ = THREE.MathUtils.lerp(lPosZ, -0.72, punch);
              lRotX = THREE.MathUtils.lerp(lRotX, -1.52, punch);
              lRotY = THREE.MathUtils.lerp(lRotY, 0.14, punch);
              lRotZ = THREE.MathUtils.lerp(lRotZ, -0.52, punch);

              rPosX = 0.27;
              rPosY = -0.24;
              rPosZ = -0.44;
            }
          } else {
            const windEnd = this.animDuration * 0.22;
            const slashEnd = this.animDuration * 0.5;
            const recDur = Math.max(0.01, this.animDuration - slashEnd);

            // Phase 1: Wind-up over shoulder + left forearm guard
            if (this.animTime < windEnd) {
              const w = this.animTime / Math.max(0.01, windEnd);
              const easeW = Math.sin(w * Math.PI * 0.5);
              rightExertionStrain = 6 * easeW;
              rPosX = THREE.MathUtils.lerp(rPosX, isForehand ? 0.4 : -0.04, easeW);
              rPosY = THREE.MathUtils.lerp(rPosY, -0.1, easeW);
              rPosZ = THREE.MathUtils.lerp(rPosZ, -0.36, easeW);
              rRotX = THREE.MathUtils.lerp(rRotX, -0.12, easeW);
              rRotY = THREE.MathUtils.lerp(rRotY, isForehand ? 1.18 : -0.65, easeW);
              rRotZ = THREE.MathUtils.lerp(rRotZ, isForehand ? -1.42 : -0.45, easeW);

              lPosX = THREE.MathUtils.lerp(lPosX, -0.18, easeW);
              lPosY = THREE.MathUtils.lerp(lPosY, -0.18, easeW);
              lPosZ = THREE.MathUtils.lerp(lPosZ, -0.44, easeW);
              lRotX = THREE.MathUtils.lerp(lRotX, -1.25, easeW);
              lRotZ = THREE.MathUtils.lerp(lRotZ, 0.32, easeW);
              leftFingerPose = 'FIST_CLENCH';
            } else if (this.animTime < slashEnd) {
              // Phase 2: Fast Diagonal Strike Arc + Forearm Pronation + Motion-Trail Mesh
              const s = (this.animTime - windEnd) / Math.max(0.01, slashEnd - windEnd);
              const slash = s * s * (3 - 2 * s);
              trailActive = true;
              rightExertionStrain = 9;

              rPosX = THREE.MathUtils.lerp(isForehand ? 0.4 : -0.04, isForehand ? -0.24 : 0.34, slash);
              rPosY = THREE.MathUtils.lerp(-0.1, -0.26, slash);
              rPosZ = -0.5 - Math.sin(slash * Math.PI) * 0.12;
              rRotX = THREE.MathUtils.lerp(-0.12, -1.32, slash);
              rRotY = THREE.MathUtils.lerp(isForehand ? 1.18 : -0.65, isForehand ? -0.48 : 1.12, slash);
              rRotZ = THREE.MathUtils.lerp(isForehand ? -1.42 : -0.45, dirSign * 0.42 - 0.72, slash);

              lPosX = -0.22 - slash * 0.08;
              lPosY = -0.22;
              lPosZ = -0.38;
              lRotX = -1.1;
              lRotZ = 0.25;
              leftFingerPose = 'FIST_CLENCH';
            } else {
              // Phase 3: Follow-through & smooth recovery
              const rec = (this.animTime - slashEnd) / recDur;
              const easeR = 1 - Math.pow(1 - rec, 2);
              dampHz = 14;
              rightExertionStrain = 9 * (1 - easeR);
              rPosX = THREE.MathUtils.lerp(isForehand ? -0.24 : 0.34, rPosX, easeR);
              rPosY = THREE.MathUtils.lerp(-0.26, rPosY, easeR);
              rPosZ = THREE.MathUtils.lerp(-0.5, rPosZ, easeR);
              rRotX = THREE.MathUtils.lerp(-1.32, rRotX, easeR);
              rRotY = THREE.MathUtils.lerp(isForehand ? -0.48 : 1.12, rRotY, easeR);
              rRotZ = THREE.MathUtils.lerp(dirSign * 0.42 - 0.72, rRotZ, easeR);
            }
          }
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'parry') {
          dampHz = 20;
          leftFingerPose = 'FIST_CLENCH';
          if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
          if (t < 0.42) {
            const p = Math.sin((t / 0.42) * Math.PI * 0.5);
            lPosX = THREE.MathUtils.lerp(lPosX, -0.06, p);
            lPosY = THREE.MathUtils.lerp(lPosY, -0.17, p);
            lPosZ = THREE.MathUtils.lerp(lPosZ, -0.44, p);
            lRotX = -1.25;
            lRotY = 0.65;
            lRotZ = 1.18;

            rPosX = 0.32;
            rPosY = -0.28;
            rPosZ = -0.38;
            rRotX = isUnarmed ? -1.12 : -0.25;
            rRotY = isUnarmed ? -0.2 : 0.85;
            rRotZ = isUnarmed ? 0.32 : -0.95;
          } else {
            const strike = (t - 0.42) / 0.58;
            const punch = Math.sin(strike * Math.PI);
            lPosX = THREE.MathUtils.lerp(-0.06, lPosX, strike);
            lPosY = THREE.MathUtils.lerp(-0.17, lPosY, strike);
            lPosZ = THREE.MathUtils.lerp(-0.44, lPosZ, strike);
            lRotZ = THREE.MathUtils.lerp(1.18, lRotZ, strike);

            rPosX = 0.22 - punch * 0.14;
            rPosY = -0.22 + punch * 0.14;
            rPosZ = -0.46 - punch * 0.18;
            rRotX = isUnarmed ? -1.25 - punch * 0.35 : -0.65 - punch * 0.65;
            rRotY = isUnarmed ? -0.18 : 0.45;
            rRotZ = isUnarmed ? 0.72 : -0.78;
          }
          this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.85;
        } else if (this.animState === 'takedown') {
          dampHz = 20;
          leftFingerPose = 'FIST_CLENCH';
          if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
          if (t < 0.35) {
            const up = t / 0.35;
            rPosX = 0.18;
            rPosY = -0.12 + up * 0.24;
            rPosZ = -0.42;
            rRotX = isUnarmed ? -0.8 - up * 0.3 : -0.15;
            rRotY = isUnarmed ? -0.15 : 0.82;
            rRotZ = isUnarmed ? 0.25 : -1.1;
            lPosX = -0.18;
            lPosY = -0.14;
            lPosZ = -0.44;
          } else {
            const slam = (t - 0.35) / 0.65;
            trailActive = slam < 0.55;
            rPosX = 0.12;
            rPosY = 0.12 - Math.sin(slam * Math.PI * 0.5) * 0.48;
            rPosZ = -0.5 - Math.sin(slam * Math.PI) * 0.18;
            rRotX = -1.35 * Math.sin(slam * Math.PI * 0.65) - 0.35;
          }
          this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.85;
        } else if (this.animState === 'blocked') {
          const ease = Math.sin(t * Math.PI);
          dampHz = 18;
          leftFingerPose = 'FIST_CLENCH';
          if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
          rPosX = 0.35 + ease * 0.14;
          rPosY = -0.28 - ease * 0.08;
          rRotX += ease * 0.48;
          rRotZ -= ease * 0.35;
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'inspect') {
          dampHz = 9;
          const fadeIn = Math.min(1, t / 0.22);
          const fadeOut = Math.min(1, (1 - t) / 0.25);
          const blend = Math.min(fadeIn, fadeOut);
          const smoothB = blend * blend * (3 - 2 * blend);
          const rollLook = Math.sin(t * Math.PI * 2) * 0.26;

          rPosX = THREE.MathUtils.lerp(rPosX, 0.19, smoothB);
          rPosY = THREE.MathUtils.lerp(rPosY, -0.16, smoothB);
          rPosZ = THREE.MathUtils.lerp(rPosZ, -0.45, smoothB);
          rRotX = THREE.MathUtils.lerp(rRotX, isUnarmed ? -0.82 : -0.52, smoothB);
          rRotY = THREE.MathUtils.lerp(rRotY, isUnarmed ? 0.32 + rollLook : 0.42 + rollLook, smoothB);
          rRotZ = THREE.MathUtils.lerp(rRotZ, isUnarmed ? 0.18 : -0.78 + rollLook * 0.4, smoothB);

          lPosX = THREE.MathUtils.lerp(lPosX, -0.15, smoothB);
          lPosY = THREE.MathUtils.lerp(lPosY, -0.11, smoothB);
          lPosZ = THREE.MathUtils.lerp(lPosZ, -0.35, smoothB);
          lRotX = THREE.MathUtils.lerp(lRotX, -0.82, smoothB);
          lRotY = THREE.MathUtils.lerp(lRotY, 0.72, smoothB);
          lRotZ = THREE.MathUtils.lerp(lRotZ, -0.48, smoothB);
          leftFingerPose = 'RELAXED_IDLE';
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'intro_ready') {
          dampHz = 12;
          const raiseEnd = 0.5;
          const holdEnd = 1.9;
          let armBlend = 1;
          if (this.animTime < raiseEnd) {
            const u = this.animTime / raiseEnd;
            armBlend = u * u * (3 - 2 * u);
          } else if (this.animTime > holdEnd) {
            const u = Math.max(0, 1 - (this.animTime - holdEnd) / Math.max(0.01, this.animDuration - holdEnd));
            armBlend = u * u * (3 - 2 * u);
          }

          lPosX = THREE.MathUtils.lerp(lPosX, -0.14, armBlend);
          lPosY = THREE.MathUtils.lerp(lPosY, -0.09, armBlend);
          lPosZ = THREE.MathUtils.lerp(lPosZ, -0.34, armBlend);
          lRotX = THREE.MathUtils.lerp(lRotX, -0.78, armBlend);
          lRotY = THREE.MathUtils.lerp(lRotY, 0.78, armBlend);
          lRotZ = THREE.MathUtils.lerp(lRotZ, -0.45, armBlend);
          leftFingerPose = 'RELAXED_IDLE';

          const twirl = Math.sin(t * Math.PI * 2);
          const liftR = Math.sin(t * Math.PI);
          rPosX = THREE.MathUtils.lerp(rPosX, 0.24, liftR);
          rPosY = THREE.MathUtils.lerp(rPosY, -0.21, liftR);
          rPosZ = THREE.MathUtils.lerp(rPosZ, -0.44, liftR);
          rRotX = THREE.MathUtils.lerp(rRotX, -0.48, liftR);
          rRotY = THREE.MathUtils.lerp(rRotY, 0.75 + twirl * 0.28, liftR);
          rRotZ = THREE.MathUtils.lerp(rRotZ, -0.92 + twirl * 0.22, liftR);
          this.swingArcMat.opacity = 0;
        }

        if (this.animTime >= this.animDuration) {
          this.animState = 'idle';
          this.swingArcMat.opacity = 0;
        }
      }
    } else {
      this.swingArcMat.opacity = 0;
    }

    // Smooth lower/raise equip swap animation on right arm
    if (this.equipSwapTime >= 0) {
      this.equipSwapTime += dt;
      const p = Math.min(1, this.equipSwapTime / this.equipSwapDuration);
      if (p >= 0.5 && this.pendingWeapon !== null) {
        this.applyActiveWeaponMeshes(this.pendingWeapon);
        this.pendingWeapon = null;
      }
      const dip = Math.sin(p * Math.PI);
      rPosY -= dip * 0.34;
      rPosZ += dip * 0.08;
      rRotX -= dip * 0.35;
      dampHz = Math.max(dampHz, 24);
      if (p >= 1) {
        this.equipSwapTime = -1;
      }
    }

    // -------------------------------------------------------------------------
    // 5B. Awakening Cinematic Build-Up Override (locks swing/pullback during cutscene)
    // -------------------------------------------------------------------------
    if (awakeningPose?.active) {
      this.animState = 'idle';
      this.swingArcMat.opacity = 0;
      rPosX = awakeningPose.rightPosX;
      rPosY = awakeningPose.rightPosY;
      rPosZ = awakeningPose.rightPosZ;
      rRotX = awakeningPose.rightRotX;
      rRotY = awakeningPose.rightRotY;
      rRotZ = awakeningPose.rightRotZ;
      lPosX = awakeningPose.leftPosX;
      lPosY = awakeningPose.leftPosY;
      lPosZ = awakeningPose.leftPosZ;
      lRotX = awakeningPose.leftRotX;
      lRotY = awakeningPose.leftRotY;
      lRotZ = awakeningPose.leftRotZ;
      leftFingerPose = awakeningPose.leftPose;
      rightFingerPose = awakeningPose.rightPose;
      rightExertionStrain = awakeningPose.exertion;
      dampHz = 28;
    }

    // Apply anti-wall-clipping pullback tuck toward chest (disabled during world-space climb IK & Activation Smack)
    if (this.curVmPullback > 0.01 && climbState === 'NONE' && !awakeningPose?.active) {
      const pb = this.curVmPullback;
      rPosZ += pb * 0.09;
      rPosX -= pb * 0.04;
      rRotX += pb * 0.32;
      rRotZ += pb * 0.18;
      lPosZ += pb * 0.08;
      lPosX += pb * 0.04;
      lRotX += pb * 0.22;
    }

    // -------------------------------------------------------------------------
    // D. Smooth Exponential Damping + 2-Bone Arm IK + Articulated Fingers
    // -------------------------------------------------------------------------
    const damp = 1 - Math.exp(-dampHz * dt);
    this.curLeftPos.x = THREE.MathUtils.lerp(this.curLeftPos.x, lPosX, damp);
    this.curLeftPos.y = THREE.MathUtils.lerp(this.curLeftPos.y, lPosY, damp);
    this.curLeftPos.z = THREE.MathUtils.lerp(this.curLeftPos.z, lPosZ, damp);
    this.curLeftEuler.x = THREE.MathUtils.lerp(this.curLeftEuler.x, lRotX, damp);
    this.curLeftEuler.y = THREE.MathUtils.lerp(this.curLeftEuler.y, lRotY, damp);
    this.curLeftEuler.z = THREE.MathUtils.lerp(this.curLeftEuler.z, lRotZ, damp);

    this.curRightPos.x = THREE.MathUtils.lerp(this.curRightPos.x, rPosX, damp);
    this.curRightPos.y = THREE.MathUtils.lerp(this.curRightPos.y, rPosY, damp);
    this.curRightPos.z = THREE.MathUtils.lerp(this.curRightPos.z, rPosZ, damp);
    this.curRightEuler.x = THREE.MathUtils.lerp(this.curRightEuler.x, rRotX, damp);
    this.curRightEuler.y = THREE.MathUtils.lerp(this.curRightEuler.y, rRotY, damp);
    this.curRightEuler.z = THREE.MathUtils.lerp(this.curRightEuler.z, rRotZ, damp);

    _leftEuler.copy(this.curLeftEuler);
    _rightEuler.copy(this.curRightEuler);
    _leftTargetQuat.setFromEuler(_leftEuler);
    _rightTargetQuat.setFromEuler(_rightEuler);

    _leftTargetPos.copy(this.curLeftPos);
    _rightTargetPos.copy(this.curRightPos);

    this.solveArmPose(
      this.leftShoulder,
      this.leftUpperArm,
      this.leftForearm,
      this.leftWrist,
      _shoulderBase.set(-0.28, -0.46, 0.02),
      _leftTargetPos,
      _leftTargetQuat,
      _leftPole,
    );
    this.solveArmPose(
      this.rightShoulder,
      this.rightUpperArm,
      this.rightForearm,
      this.rightWrist,
      _shoulderBase.set(0.38, -0.54, 0.08),
      _rightTargetPos,
      _rightTargetQuat,
      _rightPole,
    );

    // Smoothly articulate all 15 left-hand & 15 right-hand finger joints
    const fingerDamp = 1 - Math.exp(-15 * dt);
    this.applyLeftFingerAngles(elapsed, fingerDamp, leftFingerPose);
    this.applyRightFingerAngles(elapsed, fingerDamp, rightFingerPose, rightExertionStrain);

    // Update procedural bat motion-trail ribbon
    this.updateMotionTrail(trailActive, dt);

    // Pumped-Up Mode: trail fiery ember sparks off the bat tip while moving or swinging
    if (
      awakeningActive &&
      this.activeWeapon === 'bat' &&
      (horizSpeed > 1.2 || this.animState === 'swing_left' || this.animState === 'swing_right')
    ) {
      this.batEmberTimer -= dt;
      const interval = this.animState === 'swing_left' || this.animState === 'swing_right' ? 0.022 : 0.055;
      if (this.batEmberTimer <= 0) {
        this.batEmberTimer = interval;
        this.viewmodelGroup.updateWorldMatrix(true, true);
        this.batTipMarker.getWorldPosition(_tipWorld);
        this.spawnSparks(_tipWorld, Math.random() < 0.5 ? 0xff4500 : 0xffc800, 1);
      }
    } else {
      this.batEmberTimer = 0;
    }

    // -------------------------------------------------------------------------
    // E. Dual Parkour Legs & Boots (preserved)
    // -------------------------------------------------------------------------
    if (this.kickTime >= 0) {
      this.kickTime += dt;
      const dur = this.kickIsDropkick ? 0.42 : 0.34;
      const kp = this.kickTime / dur;
      if (kp >= 1) {
        this.kickTime = -1;
        this.kickIsDropkick = false;
        this.leftLegPivot.visible = false;
        this.rightLegPivot.visible = false;
      } else {
        const thrust = Math.sin(kp * Math.PI);
        if (this.kickIsDropkick) {
          this.leftLegPivot.visible = true;
          this.rightLegPivot.visible = true;
          this.leftLegPivot.position.set(-0.15 + thrust * 0.03, -0.62 + thrust * 0.44, -0.14 - thrust * 0.36);
          this.leftLegPivot.rotation.set(thrust * 0.44, 0, -thrust * 0.08);
          this.rightLegPivot.position.set(0.15 - thrust * 0.03, -0.62 + thrust * 0.44, -0.14 - thrust * 0.36);
          this.rightLegPivot.rotation.set(thrust * 0.44, 0, thrust * 0.08);
        } else {
          this.leftLegPivot.visible = false;
          this.rightLegPivot.visible = true;
          this.rightLegPivot.position.set(0.12 - thrust * 0.1, -0.64 + thrust * 0.42, -0.15 - thrust * 0.34);
          this.rightLegPivot.rotation.set(thrust * 0.48, 0, thrust * 0.14);
        }
      }
    } else if (isRolling) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      this.leftLegPivot.position.set(-0.14, -0.48, -0.28);
      this.leftLegPivot.rotation.set(0.55, 0, -0.08);
      this.rightLegPivot.position.set(0.14, -0.48, -0.28);
      this.rightLegPivot.rotation.set(0.55, 0, 0.08);
    } else if (wallRunSide !== 0) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const stride = Math.sin(elapsed * 16) * 0.12;
      this.leftLegPivot.position.set(-0.17, -0.62 + stride, -0.2);
      this.leftLegPivot.rotation.set(0.28 + stride * 0.8, 0, wallRunSide * -0.16);
      this.rightLegPivot.position.set(0.17, -0.62 - stride, -0.2);
      this.rightLegPivot.rotation.set(0.28 - stride * 0.8, 0, wallRunSide * -0.16);
    } else if (isSliding) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      this.leftLegPivot.position.set(-0.14, -0.49, -0.27);
      this.leftLegPivot.rotation.set(0.18, 0, -0.09);
      this.rightLegPivot.position.set(0.12, -0.42, -0.36);
      this.rightLegPivot.rotation.set(0.28, 0, 0.1);
    } else if (isVaulting) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      this.leftLegPivot.position.set(-0.16, -0.52, -0.26);
      this.leftLegPivot.rotation.set(0.32, 0, -0.18);
      this.rightLegPivot.position.set(0.16, -0.56, -0.22);
      this.rightLegPivot.rotation.set(0.26, 0, 0.12);
    } else if (climbState === 'WALL_SCRAMBLE') {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const drive = Math.sin(climbPhaseTime * 22) * scrambleSide;
      this.leftLegPivot.position.set(-0.16, -0.58 + drive * 0.14, -0.22);
      this.leftLegPivot.rotation.set(0.35 + drive * 0.35, 0, -0.06);
      this.rightLegPivot.position.set(0.16, -0.58 - drive * 0.14, -0.22);
      this.rightLegPivot.rotation.set(0.35 - drive * 0.35, 0, 0.06);
    } else if (climbState === 'MUSCLE_UP' || isMantling) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const kneeDrive = climbState === 'MUSCLE_UP' ? THREE.MathUtils.clamp((climbPhaseTime - 0.14) / 0.32, 0, 1) : 0.6;
      this.leftLegPivot.position.set(-0.16, -0.62 + kneeDrive * 0.08, -0.18 - kneeDrive * 0.08);
      this.leftLegPivot.rotation.set(0.2 + kneeDrive * 0.22, 0, -0.06);
      this.rightLegPivot.position.set(0.16, -0.58 + kneeDrive * 0.14, -0.2 - kneeDrive * 0.12);
      this.rightLegPivot.rotation.set(0.26 + kneeDrive * 0.28, 0, 0.08);
    } else if (isAirborne || isZiplining) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const tuck = Math.sin(elapsed * 8) * 0.025;
      this.leftLegPivot.position.set(-0.18, -0.64 + tuck, -0.18);
      this.leftLegPivot.rotation.set(0.18, 0, -0.04);
      this.rightLegPivot.position.set(0.18, -0.62 - tuck, -0.2);
      this.rightLegPivot.rotation.set(0.24, 0, 0.04);
    } else if (isLookingDown) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const stride = Math.sin(elapsed * 9) * moveSpeedRatio * 0.08;
      this.leftLegPivot.position.set(-0.16, -0.82, -0.1 + stride);
      this.leftLegPivot.rotation.set(-0.75, 0, -0.03);
      this.rightLegPivot.position.set(0.16, -0.82, -0.1 - stride);
      this.rightLegPivot.rotation.set(-0.75, 0, 0.03);
    } else {
      this.leftLegPivot.visible = false;
      this.rightLegPivot.visible = false;
    }

    // -------------------------------------------------------------------------
    // F. Shockwave, Sparks, Blood, Dust Puffs & Firecrackers (preserved)
    // -------------------------------------------------------------------------
    if (this.shockwaveTime >= 0) {
      this.shockwaveTime += dt;
      const p = this.shockwaveTime / 0.45;
      if (p >= 1) {
        this.shockwaveTime = -1;
        this.shockwaveMesh.visible = false;
      } else {
        this.shockwaveMesh.scale.setScalar(0.6 + p * 7.2);
        this.shockwaveMat.opacity = (1 - p) * 0.85;
      }
    }

    for (let i = 0; i < this.sparkPool.length; i++) {
      const p = this.sparkPool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 14 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.04) {
          p.mesh.position.y = 0.04;
          p.vel.y *= -0.4;
        }
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    for (let i = 0; i < this.bloodPool.length; i++) {
      const b = this.bloodPool[i];
      if (b.life > 0) {
        b.life -= dt;
        b.vel.y -= 16 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        if (b.mesh.position.y < 0.03) {
          b.mesh.position.y = 0.03;
          b.vel.set(0, 0, 0);
        }
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (b.life / b.maxLife) * 0.92);
        if (b.life <= 0) b.mesh.visible = false;
      }
    }

    for (let i = 0; i < this.dustPool.length; i++) {
      const d = this.dustPool[i];
      if (d.life > 0) {
        d.life -= dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.vel.multiplyScalar(Math.exp(-3.5 * dt));
        const prog = 1 - d.life / d.maxLife;
        d.mesh.scale.setScalar(0.65 + prog * 1.45);
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - prog) * 0.42);
        if (d.life <= 0) d.mesh.visible = false;
      }
    }

    for (let i = this.activeFirecrackers.length - 1; i >= 0; i--) {
      const fc = this.activeFirecrackers[i];
      fc.age += dt;
      fc.vel.y -= 18 * dt;
      fc.pos.addScaledVector(fc.vel, dt);
      if (fc.pos.y < 0.08) {
        fc.pos.y = 0.08;
        fc.vel.y = Math.abs(fc.vel.y) * 0.32;
        fc.vel.x *= 0.68;
        fc.vel.z *= 0.68;
      }
      fc.mesh.position.copy(fc.pos);
      fc.mesh.rotation.x += dt * 7;
      fc.mesh.rotation.z += dt * 5;

      if (i === this.activeFirecrackers.length - 1) {
        fc.light.position.copy(fc.pos);
      }

      fc.sparkTimer += dt;
      if (!fc.banged && fc.sparkTimer > 0.07) {
        fc.sparkTimer = 0;
        this.spawnSparks(fc.pos, 0xfde047, 2);
      }

      if (!fc.banged && fc.age >= 0.95) {
        fc.banged = true;
        this.spawnSparks(fc.pos, 0xf97316, 16);
        fc.light.intensity = 10;
        onFirecrackerBang(fc.pos);
      }

      if (fc.banged && i === this.activeFirecrackers.length - 1) {
        fc.light.intensity = 3.5 + Math.sin(fc.age * 28) * 2.0;
        if (fc.age < 3.5 && Math.random() < 0.25) {
          this.spawnSparks(fc.pos, 0xfef08a, 1);
        }
      }

      if (fc.age >= fc.lureDuration) {
        this.scene.remove(fc.mesh);
        this.activeFirecrackers.splice(i, 1);
      }
    }
    if (this.activeFirecrackers.length === 0 && this.firecrackerLight.intensity > 0) {
      this.firecrackerLight.intensity = 0;
    }
  }

  public dispose(): void {
    this.camera.remove(this.viewmodelGroup);
    this.camera.remove(this.leftLegPivot);
    this.camera.remove(this.rightLegPivot);
    this.camera.remove(this.ziplineHookPivot);
    this.camera.remove(this.swingArcMesh);
    this.scene.remove(this.shockwaveMesh);
    this.scene.remove(this.firecrackerLight);
    this.sparkPool.forEach((p) => this.scene.remove(p.mesh));
    this.bloodPool.forEach((b) => this.scene.remove(b.mesh));
    this.dustPool.forEach((d) => this.scene.remove(d.mesh));
    this.activeFirecrackers.forEach((fc) => this.scene.remove(fc.mesh));
    this.disposables.forEach((d) => d.dispose());
  }
}
