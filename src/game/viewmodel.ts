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
  headGrabActive?: boolean;
  headGrabTimer?: number;
  batFaceDriveActive?: boolean;
  batFaceDriveTimer?: number;
  inspectLeftArm?: boolean;
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

interface BloodDripParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  floorY: number;
  active: boolean;
}

interface SpatterDroplet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  floorY: number;
  life: number;
  active: boolean;
}

interface GroundSpatterDecal {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  life: number;
  maxLife: number;
  fadeStartRatio: number;
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

type RightHandPose = 'UNARMED_READY' | 'TIGHT_FIST' | 'WEAPON_GRIP' | 'PARKOUR_OPEN';

interface FingerAngles {
  mcp: number;
  pip: number;
  dip: number;
  splay: number;
}

const DEG2RAD = Math.PI / 180;

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
const _rightTargetPos = new THREE.Vector3();
const _rightEuler = new THREE.Euler();
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
const _rightPole = new THREE.Vector3(0.62, -0.82, 0.24).normalize();
const _ikRightLocal = new THREE.Vector3();
const _ikReachVec = new THREE.Vector3();
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

function distToQuadBezier2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  cx: number,
  cz: number,
  bx: number,
  bz: number,
): number {
  let minSq = Infinity;
  let prevX = ax;
  let prevZ = az;
  const steps = 10;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    const curX = mt * mt * ax + 2 * mt * t * cx + t * t * bx;
    const curZ = mt * mt * az + 2 * mt * t * cz + t * t * bz;
    const dx = curX - prevX;
    const dz = curZ - prevZ;
    const lenSq = dx * dx + dz * dz;
    const proj = lenSq > 1e-9 ? THREE.MathUtils.clamp(((px - prevX) * dx + (pz - prevZ) * dz) / lenSq, 0, 1) : 0;
    const qx = prevX + dx * proj;
    const qz = prevZ + dz * proj;
    const dSq = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
    if (dSq < minSq) minSq = dSq;
    prevX = curX;
    prevZ = curZ;
  }
  return Math.sqrt(minSq);
}

/**
 * Procedurally sculpted bare Left Back of the Hand + Front Palm Core (`leftHandCoreMesh`)
 * built from a subdivided 28x6x28 BoxGeometry (0.088m x 0.026m x 0.105m):
 * -Z = knuckles, +Z = wrist, +Y = dorsal back of hand, -Y = palm underside, -X = pinky, +X = thumb.
 */
function createLeftHandCoreGeo(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.088, 0.026, 0.105, 28, 6, 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  const baseDorsalCol = new THREE.Color('#C98E6B');
  const dorsalHighlightCol = new THREE.Color('#D69C7A');
  const dorsalShadowCol = new THREE.Color('#9E6346');

  const palmPadCol = new THREE.Color('#D89F80');
  const palmCupCol = new THREE.Color('#A6694C');
  const palmCreaseCol = new THREE.Color('#7D4730');
  const workCol = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  const tendonXs = [-0.03, -0.01, 0.011, 0.031];
  const knuckleCascades = [
    { x: -0.03, dz: 0.014, dy: -0.004 }, // Pinky
    { x: -0.01, dz: 0.005, dy: 0.0 }, // Ring
    { x: 0.011, dz: 0.0, dy: 0.0 }, // Middle (furthest -Z)
    { x: 0.031, dz: 0.005, dy: 0.0 }, // Index
  ];
  const valleyXs = [-0.02, 0.0005, 0.021];

  const evalKnuckleCascade = (vx: number): { dz: number; dy: number } => {
    if (vx <= knuckleCascades[0].x) return { dz: knuckleCascades[0].dz, dy: knuckleCascades[0].dy };
    for (let k = 0; k < knuckleCascades.length - 1; k++) {
      const a = knuckleCascades[k];
      const b = knuckleCascades[k + 1];
      if (vx <= b.x) {
        const u = (vx - a.x) / (b.x - a.x);
        return {
          dz: THREE.MathUtils.lerp(a.dz, b.dz, u),
          dy: THREE.MathUtils.lerp(a.dy, b.dy, u),
        };
      }
    }
    const last = knuckleCascades[knuckleCascades.length - 1];
    return { dz: last.dz, dy: last.dy };
  };

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const origY = y;

    const tZ = THREE.MathUtils.clamp((0.0525 - z) / 0.105, 0, 1);

    // 1. Trapezoidal Taper (0.76 -> 1.04 width, 1.25 -> 0.78 thickness)
    const scaleX = THREE.MathUtils.lerp(0.76, 1.04, tZ);
    const scaleY = THREE.MathUtils.lerp(1.25, 0.78, tZ);
    x *= scaleX;
    y *= scaleY;

    // 2. Anatomical Knuckle Cascade (applied across both dorsal & palmar distal edge)
    const cascade = evalKnuckleCascade(x);
    const distalWeight = THREE.MathUtils.smoothstep(tZ, 0.45, 1.0);
    z += cascade.dz * distalWeight;
    y += cascade.dy * distalWeight;

    let dorsalHighlightMix = 0;
    let dorsalShadowMix = 0;
    let palmPadMix = 0;
    let palmCupMix = 0;
    let palmCreaseMix = 0;

    if (origY > 0) {
      // --- DORSAL BACK OF THE HAND (Step 1 preserved) ---
      const dorsalWeight = THREE.MathUtils.smoothstep(origY, 0.0, 0.009);
      const arch = Math.max(0, 1.0 - Math.pow(x / 0.045, 2)) * 0.0065;
      y += arch * dorsalWeight;

      let tendonMask = 0;
      if (tZ > 0.15 && tZ < 0.92) {
        const lenWeight = Math.sin(((tZ - 0.15) / 0.77) * Math.PI);
        const fanFactor = THREE.MathUtils.clamp((tZ - 0.08) / 0.86, 0, 1);
        for (let t = 0; t < tendonXs.length; t++) {
          const tx = tendonXs[t] * (0.28 + 0.72 * fanFactor);
          const ridge = Math.exp(-Math.pow((x - tx) / 0.0046, 2));
          if (ridge > tendonMask) tendonMask = ridge;
        }
        tendonMask *= lenWeight * dorsalWeight;
        y += tendonMask * 0.0018;
      }

      let knuckleDomeMask = 0;
      for (let k = 0; k < knuckleCascades.length; k++) {
        const kc = knuckleCascades[k];
        const kz = -0.0525 + kc.dz + 0.0065;
        const dist = Math.hypot(x - kc.x, z - kz);
        if (dist < 0.009) {
          const dome = Math.cos((dist / 0.009) * (Math.PI * 0.5));
          const domeSq = dome * dome;
          if (domeSq > knuckleDomeMask) knuckleDomeMask = domeSq;
        }
      }
      knuckleDomeMask *= dorsalWeight;
      y += knuckleDomeMask * 0.0032;

      let valleyMask = 0;
      if (tZ > 0.72) {
        const valleyZWeight = THREE.MathUtils.smoothstep(tZ, 0.72, 0.96);
        for (let v = 0; v < valleyXs.length; v++) {
          const vBump = Math.exp(-Math.pow((x - valleyXs[v]) / 0.0042, 2)) * valleyZWeight;
          if (vBump > valleyMask) valleyMask = vBump;
        }
        valleyMask *= dorsalWeight;
        y -= valleyMask * 0.0012;
      }

      dorsalHighlightMix = THREE.MathUtils.clamp(Math.max(knuckleDomeMask, tendonMask * 0.82), 0, 1);
      dorsalShadowMix = THREE.MathUtils.clamp(valleyMask * 0.85, 0, 1);
    } else {
      // --- FRONT / UNDERSIDE PALM ANATOMY (y <= 0, Step 2) ---
      const palmWeight = THREE.MathUtils.smoothstep(-origY, 0.0, 0.0075);

      // 1. Thenar Eminence (Thumb-base teardrop muscle bulge peaking -0.0085m at x=+0.024, z=+0.016)
      let thenar = 0;
      if (x > 0.006 && z > -0.012) {
        const dx = (x - 0.024) / 0.0135;
        const dz = (z - 0.016) / 0.0215;
        const gate =
          THREE.MathUtils.smoothstep(x, 0.006, 0.0145) *
          THREE.MathUtils.smoothstep(z, -0.012, -0.002);
        thenar = Math.exp(-(dx * dx + dz * dz)) * gate;
      }

      // 2. Hypothenar Eminence (Outer pinky-side muscle ridge peaking -0.0055m at x=-0.029, z=+0.010)
      let hypothenar = 0;
      if (x < -0.016 && z > -0.025) {
        const dx = (x - -0.029) / 0.0095;
        const dz = (z - 0.01) / 0.0265;
        const gate =
          THREE.MathUtils.smoothstep(-x, 0.016, 0.022) *
          THREE.MathUtils.smoothstep(z, -0.025, -0.014);
        hypothenar = Math.exp(-(dx * dx + dz * dz)) * gate;
      }

      // 3. Distal Palmar Cushion (4 rounded finger-base pads at -0.048 < z < -0.028, -0.0045m swell)
      let distalCushion = 0;
      if (z > -0.048 && z < -0.028) {
        const zMid = -0.038 + cascade.dz * 0.45;
        const zGate =
          THREE.MathUtils.smoothstep(z, -0.048, -0.043) *
          THREE.MathUtils.smoothstep(-z, 0.028, 0.032);
        const zRidge = Math.exp(-Math.pow((z - zMid) / 0.0072, 2));
        let padSub = 0.52;
        for (let k = 0; k < knuckleCascades.length; k++) {
          const p = Math.exp(-Math.pow((x - knuckleCascades[k].x) / 0.0075, 2));
          const candidate = 0.52 + 0.48 * p;
          if (candidate > padSub) padSub = candidate;
        }
        distalCushion = zRidge * zGate * padSub;
      }

      // 4. Central Palmar Cup (Hollow center bowl peaking +0.0055m inward at x=-0.002, z=-0.004)
      const cupDx = (x - -0.002) / 0.0175;
      const cupDz = (z - -0.004) / 0.0205;
      const palmCup = Math.exp(-(cupDx * cupDx + cupDz * cupDz));

      // 5. Carved Palmar Creases (Life Line, Head Line, Heart Line: +0.0016m inward, 0.0025m width)
      const lifeDist = distToQuadBezier2D(x, z, 0.018, -0.022, 0.004, 0.008, 0.004, 0.036);
      const headDist = distToQuadBezier2D(x, z, 0.02, -0.02, -0.004, -0.01, -0.028, -0.004);
      const heartDist = distToQuadBezier2D(x, z, -0.032, -0.024, -0.006, -0.026, 0.016, -0.032);
      const minCreaseDist = Math.min(lifeDist, headDist, heartDist);
      const creaseVal = Math.exp(-Math.pow(minCreaseDist / 0.0025, 2));

      const palmDeltaY =
        -0.0085 * thenar -
        0.0055 * hypothenar -
        0.0045 * distalCushion +
        0.0055 * palmCup +
        0.0016 * creaseVal;
      y += palmDeltaY * palmWeight;

      palmPadMix = THREE.MathUtils.clamp(Math.max(thenar, hypothenar, distalCushion) * palmWeight, 0, 1);
      palmCupMix = THREE.MathUtils.clamp(palmCup * 0.92 * palmWeight, 0, 1);
      palmCreaseMix = THREE.MathUtils.clamp(creaseVal * 0.95 * palmWeight, 0, 1);
    }

    pos.setXYZ(i, x, y, z);

    // 6. Vertex Color Shading
    workCol.copy(baseDorsalCol);
    if (origY > 0) {
      workCol.lerp(dorsalHighlightCol, dorsalHighlightMix);
      workCol.lerp(dorsalShadowCol, dorsalShadowMix);
    } else {
      workCol.lerp(palmPadCol, palmPadMix);
      workCol.lerp(palmCupCol, palmCupMix);
      workCol.lerp(palmCreaseCol, palmCreaseMix);
    }

    colors[i * 3] = workCol.r;
    colors[i * 3 + 1] = workCol.g;
    colors[i * 3 + 2] = workCol.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return smoothGeo(geo);
}

/**
 * Shared exact anatomical forearm cross-section sampler so `leftForearmMesh`,
 * the 3 layered wrist wraps, and the rolled-up sleeve cuff conform tightly with zero gaps.
 */
function evalLeftForearmPoint(
  cosT: number,
  sinT: number,
  z: number,
  extraOffset = 0,
): { x: number; y: number; z: number; muscleHighlight: number; creaseShadow: number } {
  const t = THREE.MathUtils.clamp((z - 0.048) / 0.34, 0, 1);
  const baseR = THREE.MathUtils.lerp(0.036, 0.056, t) + extraOffset;
  const scaleX = THREE.MathUtils.lerp(0.94, 1.0, t);
  const scaleY = THREE.MathUtils.lerp(0.72, 0.88, t);

  let x = cosT * baseR * scaleX;
  let y = sinT * baseR * scaleY + 0.0018 * (1 - t);

  // Ulnar (-X, +Y) & Radial (+X, +Y) Styloid Wrist Bone Bumps near z = +0.062
  const styloidZ = Math.exp(-Math.pow((z - 0.062) / 0.018, 2));
  const ulnarBump =
    Math.exp(-(Math.pow((x - -0.032) / 0.012, 2) + Math.pow((y - 0.008) / 0.011, 2))) * styloidZ;
  const radialBump =
    Math.exp(-(Math.pow((x - 0.032) / 0.012, 2) + Math.pow((y - 0.004) / 0.011, 2))) * styloidZ;
  const styloidOffset = ulnarBump * 0.0035 + radialBump * 0.0025;
  x += cosT * styloidOffset;
  y += sinT * styloidOffset;

  // Brachioradialis & Flexor Forearm Bulge (0.16 < z < 0.32, outer-top x < 0, y > 0)
  let muscleHighlight = 0;
  if (z > 0.16 && z < 0.32 && cosT < 0.15 && sinT > -0.2) {
    const muscleZ = Math.sin(((z - 0.16) / 0.16) * Math.PI);
    const dirWeight = THREE.MathUtils.smoothstep(-cosT, -0.15, 0.72) * THREE.MathUtils.smoothstep(sinT, -0.2, 0.55);
    muscleHighlight = muscleZ * dirWeight;
    const bulge = muscleHighlight * 0.007;
    x += cosT * bulge;
    y += sinT * bulge;
  }

  // Inner Wrist Tendon Groove (y < 0, 0.05 < z < 0.14)
  let tendonGroove = 0;
  if (y < 0 && z > 0.05 && z < 0.14) {
    const grooveZ = Math.sin(((z - 0.05) / 0.09) * Math.PI);
    const undersideWeight = THREE.MathUtils.smoothstep(-sinT, 0.25, 0.85);
    const centerGroove = Math.exp(-Math.pow(x / 0.006, 2)) * grooveZ * undersideWeight;
    const flankRidges = Math.exp(-Math.pow((Math.abs(x) - 0.0105) / 0.004, 2)) * grooveZ * undersideWeight;
    tendonGroove = centerGroove;
    y += centerGroove * 0.002 - flankRidges * 0.0012;
  }

  const wristCrease = THREE.MathUtils.smoothstep(0.082 - z, 0, 0.034) * 0.72;
  const undersideAO = y < 0 ? THREE.MathUtils.smoothstep(-sinT, 0.0, 0.95) * 0.62 : 0;
  const creaseShadow = THREE.MathUtils.clamp(Math.max(wristCrease, undersideAO, tendonGroove * 0.85), 0, 1);

  return { x, y, z, muscleHighlight, creaseShadow };
}

/**
 * Seamless wrist-to-forearm mesh (`leftForearmMesh`) constructed from CylinderGeometry(0.036, 0.056, 0.34, 24, 18, false)
 * rotated & translated so narrow wrist sits at z=+0.048 inside leftHandCoreMesh and elbow extends to z=+0.388.
 */
function createLeftForearmGeo(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.036, 0.056, 0.34, 24, 18, false);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 0.218);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const baseSkin = new THREE.Color('#C48866');
  const shadowSkin = new THREE.Color('#9E6346');
  const highlightSkin = new THREE.Color('#D29776');
  const workCol = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const rRaw = Math.hypot(vx, vy);

    if (rRaw > 1e-5) {
      const cosT = vx / rRaw;
      const sinT = vy / rRaw;
      const pt = evalLeftForearmPoint(cosT, sinT, vz, 0);
      pos.setXYZ(i, pt.x, pt.y, pt.z);
      workCol.copy(baseSkin);
      workCol.lerp(highlightSkin, pt.muscleHighlight * 0.65);
      workCol.lerp(shadowSkin, pt.creaseShadow);
    } else {
      pos.setXYZ(i, 0, 0.0018 * (1 - THREE.MathUtils.clamp((vz - 0.048) / 0.34, 0, 1)), vz);
      workCol.copy(shadowSkin);
    }

    colors[i * 3] = workCol.r;
    colors[i * 3 + 1] = workCol.g;
    colors[i * 3 + 2] = workCol.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return smoothGeo(geo);
}

/**
 * Builds a snug closed athletic tape / leather wrist wrap strap conforming directly to the
 * exact oval cross-section and bony landmarks of `leftForearmMesh` with zero floating gaps.
 */
function createLeftWristStrapGeo(zCenter: number, halfWidth: number, tiltAngle: number, thickness = 0.003): THREE.BufferGeometry {
  const radSegs = 28;
  const rings = 4; // 0: inner-front, 1: outer-front, 2: outer-back, 3: inner-back
  const ringProfile: Array<{ zOff: number; rOff: number }> = [
    { zOff: -halfWidth, rOff: -0.0005 },
    { zOff: -halfWidth * 0.88, rOff: thickness },
    { zOff: halfWidth * 0.88, rOff: thickness },
    { zOff: halfWidth, rOff: -0.0005 },
  ];

  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rings; r++) {
    const prof = ringProfile[r];
    for (let s = 0; s < radSegs; s++) {
      const theta = (s / radSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const zSample = zCenter + prof.zOff + sinT * tiltAngle;
      const pt = evalLeftForearmPoint(cosT, sinT, zSample, prof.rOff);
      positions.push(pt.x, pt.y, pt.z);
    }
  }

  for (let r = 0; r < rings; r++) {
    const nextR = (r + 1) % rings;
    const row0 = r * radSegs;
    const row1 = nextR * radSegs;
    for (let s = 0; s < radSegs; s++) {
      const nextS = (s + 1) % radSegs;
      const a = row0 + s;
      const b = row0 + nextS;
      const c = row1 + s;
      const d = row1 + nextS;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return smoothGeo(geo);
}

/**
 * Builds the rolled-up dark slate-olive sleeve cuff (z = +0.29 to +0.39) with uneven layered fabric rings.
 */
function createLeftSleeveCuffGeo(): THREE.BufferGeometry {
  const radSegs = 28;
  const rings = 9;
  const zStart = 0.29;
  const zEnd = 0.39;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const u = r / rings;
    const zBase = THREE.MathUtils.lerp(zStart, zEnd, u);
    const foldRoll1 = Math.exp(-Math.pow((u - 0.14) / 0.12, 2)) * 0.0085;
    const foldRoll2 = Math.exp(-Math.pow((u - 0.44) / 0.14, 2)) * 0.0065;
    const cuffTuck = u < 0.06 ? THREE.MathUtils.lerp(-0.001, 0.007, u / 0.06) : 0.007;

    for (let s = 0; s < radSegs; s++) {
      const theta = (s / radSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const fabricWave =
        Math.sin(theta * 5 + u * 6.0) * 0.0022 +
        Math.cos(theta * 3 - u * 4.5) * 0.0018;
      const zRipple = u > 0.04 && u < 0.7 ? Math.sin(theta * 4 + u * 3.0) * 0.0032 : 0;
      const pt = evalLeftForearmPoint(
        cosT,
        sinT,
        zBase + zRipple,
        cuffTuck + foldRoll1 + foldRoll2 + fabricWave,
      );
      positions.push(pt.x, pt.y, pt.z);
    }
  }

  for (let r = 0; r < rings; r++) {
    const row0 = r * radSegs;
    const row1 = (r + 1) * radSegs;
    for (let s = 0; s < radSegs; s++) {
      const nextS = (s + 1) % radSegs;
      const a = row0 + s;
      const b = row0 + nextS;
      const c = row1 + s;
      const d = row1 + nextS;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return smoothGeo(geo);
}

/**
 * Joint sphere matching the oval finger cross-section and #C48866 skin tone so curling never leaves gaps.
 */
function createFingerJointSphereGeo(baseRadius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(baseRadius * 0.96, 8, 8);
  geo.scale(1.0, 0.85, 1.0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const skinCol = new THREE.Color('#C48866');
  const undersideCol = new THREE.Color('#B37655');
  const workCol = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const underMix = y < 0 ? THREE.MathUtils.clamp(-y / (baseRadius * 0.82), 0, 1) * 0.45 : 0;
    workCol.copy(skinCol).lerp(undersideCol, underMix);
    colors[i * 3] = workCol.r;
    colors[i * 3 + 1] = workCol.g;
    colors[i * 3 + 2] = workCol.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return smoothGeo(geo);
}

/**
 * Curved oval dorsal fingernail / nail-bed shell hugging the outer 55% of a distal phalanx.
 */
function createFingernailShellGeo(
  length: number,
  baseRadius: number,
  tipRadius: number,
  isRim: boolean,
): THREE.BufferGeometry {
  const nU = 8;
  const nV = 8;
  const zCenter = isRim ? -length * 0.71 : -length * 0.728;
  const halfLen = isRim ? length * 0.295 : length * 0.275;
  const maxPhi = isRim ? 0.76 : 0.64;
  const topLift = isRim ? 0.0003 : 0.00072;
  const botDepth = -0.00045;

  const evalSurf = (u: number, v: number, radialLift: number): [number, number, number] => {
    const xNorm = u * Math.sqrt(Math.max(0, 1 - 0.5 * v * v));
    const zNorm = v * Math.sqrt(Math.max(0, 1 - 0.5 * u * u));
    const z = zCenter + zNorm * halfLen;
    const uZ = THREE.MathUtils.clamp(-z / length, 0, 1);
    const rBase = THREE.MathUtils.lerp(baseRadius, tipRadius, uZ);
    const bulge = 0.95 + 0.16 * Math.pow(Math.abs(uZ - 0.5) * 2, 1.6);
    const rSurf = rBase * bulge;
    const phi = xNorm * maxPhi;
    const edgeFade = Math.max(0, 1 - (xNorm * xNorm + zNorm * zNorm) * 0.45);
    const lift = radialLift > 0 ? radialLift * (0.55 + 0.45 * edgeFade) : radialLift;
    const x = Math.sin(phi) * (rSurf + lift * 0.4);
    const y = Math.cos(phi) * rSurf * 0.85 + lift;
    return [x, y, z];
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const stride = nU + 1;
  const layerSize = (nU + 1) * (nV + 1);

  // Layer 0: Top dorsal surface
  for (let iv = 0; iv <= nV; iv++) {
    const v = -1 + (2 * iv) / nV;
    for (let iu = 0; iu <= nU; iu++) {
      const u = -1 + (2 * iu) / nU;
      const [px, py, pz] = evalSurf(u, v, topLift);
      positions.push(px, py, pz);
    }
  }
  // Layer 1: Embedded bottom base inside skin
  for (let iv = 0; iv <= nV; iv++) {
    const v = -1 + (2 * iv) / nV;
    for (let iu = 0; iu <= nU; iu++) {
      const u = -1 + (2 * iu) / nU;
      const [px, py, pz] = evalSurf(u, v, botDepth);
      positions.push(px, py, pz);
    }
  }

  // Top & bottom faces
  for (let iv = 0; iv < nV; iv++) {
    for (let iu = 0; iu < nU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);

      const ba = layerSize + a;
      const bb = layerSize + b;
      const bc = layerSize + c;
      const bd = layerSize + d;
      indices.push(ba, bb, bc, bb, bd, bc);
    }
  }

  // Perimeter rim stitch
  const stitchEdge = (t0: number, t1: number) => {
    const b0 = layerSize + t0;
    const b1 = layerSize + t1;
    indices.push(t0, t1, b0, t1, b1, b0);
  };
  for (let iu = 0; iu < nU; iu++) {
    stitchEdge(iu, iu + 1);
    stitchEdge(nV * stride + iu + 1, nV * stride + iu);
  }
  for (let iv = 0; iv < nV; iv++) {
    stitchEdge((iv + 1) * stride, iv * stride);
    stitchEdge(iv * stride + nU, (iv + 1) * stride + nU);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return smoothGeo(geo);
}

/**
 * Anatomical Finger Segment Builder:
 * Sculpted CylinderGeometry(tipRadius, baseRadius, length, 10, 4, false) along -Z
 * (z = 0 at joint pivot, z = -length at tip) with oval 0.85 vertical flattening,
 * +11% knuckle bulges, 0.95x mid-shaft taper, underside joint creases (#965A3E),
 * seamless joint sphere, and dorsal fingernail (#DFB8A2 + #8F5740 nail-bed rim) when hasNail=true.
 */
function createFingerPhalanx(
  length: number,
  baseRadius: number,
  tipRadius: number,
  hasNail: boolean,
  skinMat: THREE.Material,
  nailMat: THREE.Material,
  nailRimMat: THREE.Material,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): THREE.Group {
  const segGroup = new THREE.Group();

  const cylGeo = new THREE.CylinderGeometry(tipRadius, baseRadius, length, 10, 4, false);
  cylGeo.rotateX(-Math.PI / 2);
  cylGeo.translate(0, 0, -length / 2);

  const pos = cylGeo.attributes.position as THREE.BufferAttribute;
  const baseSkin = new THREE.Color('#C48866');
  const dorsalKnuckle = new THREE.Color('#CF9573');
  const creaseColor = new THREE.Color('#965A3E');
  const workCol = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const rRaw = Math.hypot(vx, vy);
    const u = THREE.MathUtils.clamp(-vz / length, 0, 1);

    if (rRaw > 1e-5) {
      const bulge = 0.95 + 0.16 * Math.pow(Math.abs(u - 0.5) * 2, 1.6);
      const x = vx * bulge;
      let y = vy * bulge * 0.85;
      let z = vz;

      // Softly curve distal fingertip rim when hasNail is true
      if (hasNail && u > 0.95) {
        z -= tipRadius * 0.12;
      }

      const jointNear = Math.max(
        Math.exp(-Math.pow(u / 0.16, 2)),
        hasNail ? 0 : Math.exp(-Math.pow((1 - u) / 0.16, 2)),
      );

      let creaseMix = 0;
      if (y < 0) {
        const undersideWeight = THREE.MathUtils.smoothstep(-y / (baseRadius * 0.85), 0.18, 0.85);
        creaseMix = jointNear * undersideWeight;
        y += creaseMix * 0.001;
      }

      const dorsalHighlight = y > 0 ? jointNear * THREE.MathUtils.clamp(y / (baseRadius * 0.85), 0, 1) * 0.45 : 0;
      pos.setXYZ(i, x, y, z);

      workCol.copy(baseSkin);
      workCol.lerp(dorsalKnuckle, dorsalHighlight);
      workCol.lerp(creaseColor, creaseMix);
    } else {
      const zOut = hasNail && u > 0.5 ? vz - tipRadius * 0.38 : vz;
      pos.setXYZ(i, 0, 0, zOut);
      workCol.copy(baseSkin);
    }

    colors[i * 3] = workCol.r;
    colors[i * 3 + 1] = workCol.g;
    colors[i * 3 + 2] = workCol.b;
  }

  cylGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  smoothGeo(cylGeo);
  segGroup.add(new THREE.Mesh(trackGeo(cylGeo), skinMat));

  // Seamless Joint Sphere at pivot z = 0
  const jointSphereGeo = trackGeo(createFingerJointSphereGeo(baseRadius));
  segGroup.add(new THREE.Mesh(jointSphereGeo, skinMat));

  // Dorsal Fingernail + Nail-Bed Rim on outer 55% of Distal Tip
  if (hasNail) {
    const rimGeo = trackGeo(createFingernailShellGeo(length, baseRadius, tipRadius, true));
    segGroup.add(new THREE.Mesh(rimGeo, nailRimMat));
    const nailGeo = trackGeo(createFingernailShellGeo(length, baseRadius, tipRadius, false));
    segGroup.add(new THREE.Mesh(nailGeo, nailMat));
  }

  return segGroup;
}

/**
 * Smooth tapered skin-webbing wedge (#B87B5B) bridging the thumb base to the radial side of the Index finger base.
 */
function createThumbIndexWebbingGeo(): THREE.BufferGeometry {
  const nU = 8;
  const nV = 8;
  const thumbOrigin = new THREE.Vector3(0.034, -0.005, 0.006);
  const thumbEuler = new THREE.Euler(-0.32, -0.58, -0.45, 'XYZ');
  const thumbAxis = new THREE.Vector3(0, 0, -1).applyEuler(thumbEuler).normalize();

  const thumbBasePt = thumbOrigin.clone().addScaledVector(thumbAxis, 0.002);
  const thumbTipPt = thumbOrigin.clone().addScaledVector(thumbAxis, 0.036);
  const indexBasePt = new THREE.Vector3(0.033, -0.002, -0.004);
  const indexTipPt = new THREE.Vector3(0.0335, 0.001, -0.056);

  const webColor = new THREE.Color('#B87B5B');
  const saddleShadow = new THREE.Color('#9E6346');
  const workCol = new THREE.Color();

  const evalMidPoint = (u: number, v: number): THREE.Vector3 => {
    const pThumb = new THREE.Vector3().lerpVectors(thumbBasePt, thumbTipPt, u);
    const pIndex = new THREE.Vector3().lerpVectors(indexBasePt, indexTipPt, u);
    const p = new THREE.Vector3().lerpVectors(pThumb, pIndex, v);
    const arc = Math.sin(v * Math.PI) * Math.pow(u, 1.35);
    p.z += arc * 0.011;
    p.x -= arc * 0.003;
    p.y += arc * 0.0015;
    return p;
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const stride = nU + 1;
  const layerSize = (nU + 1) * (nV + 1);

  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    for (let iv = 0; iv <= nV; iv++) {
      const v = iv / nV;
      for (let iu = 0; iu <= nU; iu++) {
        const u = iu / nU;
        const p = evalMidPoint(u, v);
        const halfThick = THREE.MathUtils.lerp(0.0072, 0.0016, Math.pow(u, 0.85));
        const endTaper = 0.72 + 0.28 * Math.sin(v * Math.PI);
        positions.push(p.x, p.y + sign * halfThick * endTaper, p.z);

        const shadeMix = (1 - Math.sin(v * Math.PI) * 0.4) * (side === 1 ? 0.55 : 0.25) + u * 0.15;
        workCol.copy(webColor).lerp(saddleShadow, THREE.MathUtils.clamp(shadeMix, 0, 1));
        colors.push(workCol.r, workCol.g, workCol.b);
      }
    }
  }

  // Top (+Y) & Bottom (-Y) faces: dP/du ~ (+X, -Z), dP/dv ~ (-Z, -X) -> (dP/du) x (dP/dv) = +Y
  for (let iv = 0; iv < nV; iv++) {
    for (let iu = 0; iu < nU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);

      const ba = layerSize + a;
      const bb = layerSize + b;
      const bc = layerSize + c;
      const bd = layerSize + d;
      indices.push(ba, bc, bb, bb, bc, bd);
    }
  }

  // Perimeter stitch along outer boundary
  const stitch = (t0: number, t1: number) => {
    indices.push(t0, t1, layerSize + t0, t1, layerSize + t1, layerSize + t0);
  };
  for (let iu = 0; iu < nU; iu++) {
    stitch(iu + 1, iu);
    stitch(nV * stride + iu, nV * stride + iu + 1);
  }
  for (let iv = 0; iv < nV; iv++) {
    stitch(iv * stride, (iv + 1) * stride);
    stitch((iv + 1) * stride + nU, iv * stride + nU);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return smoothGeo(geo);
}

/**
 * Extends a skin MeshStandardMaterial with a physiological systolic/dicrotic blood-flow pulse
 * vertex shader propagating along the forearm and wrist, paired with a subtle subsurface flush.
 */
function applyForearmPulseShader(
  material: THREE.MeshStandardMaterial,
  axis: 'z' | 'y',
  pulseUniform: { value: number },
): void {
  material.customProgramCacheKey = () => `forearm_blood_pulse_${axis}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPulseTime = pulseUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uPulseTime;
varying float vBloodPulse;`,
      )
      .replace(
        '#include <begin_vertex>',
        axis === 'z'
          ? `#include <begin_vertex>
float forearmT = clamp((position.z - 0.048) / 0.34, 0.0, 1.0);
float seamFade = smoothstep(0.052, 0.088, position.z) * smoothstep(0.325, 0.255, position.z);
float pulsePhase = fract(uPulseTime * 1.28 - (1.0 - forearmT) * 0.45);
float systolic = exp(-pow((pulsePhase - 0.16) / 0.075, 2.0));
float dicrotic = 0.45 * exp(-pow((pulsePhase - 0.34) / 0.095, 2.0));
float cardiacWave = systolic + dicrotic;

float innerWristMask = smoothstep(0.35, -0.55, objectNormal.y);
float radialVein = exp(-pow((position.x - 0.014) / 0.009, 2.0));
float ulnarVein = exp(-pow((position.x + 0.011) / 0.010, 2.0));
float wristFocus = smoothstep(0.58, 0.08, forearmT);
float vesselMask = innerWristMask * max(radialVein, ulnarVein) * (0.45 + 0.55 * wristFocus);

vec3 safeNormal = length(objectNormal) > 0.0001 ? normalize(objectNormal) : vec3(0.0, 1.0, 0.0);
float pulseDisp = cardiacWave * seamFade * (0.00022 + 0.00058 * vesselMask);
transformed += safeNormal * pulseDisp;
vBloodPulse = clamp(cardiacWave * seamFade * (0.35 + 0.65 * vesselMask), 0.0, 1.0);`
          : `#include <begin_vertex>
float forearmT = clamp(position.y / 0.194, 0.0, 1.0);
float seamFade = smoothstep(0.015, 0.055, position.y) * smoothstep(0.192, 0.155, position.y);
float pulsePhase = fract(uPulseTime * 1.28 - forearmT * 0.45);
float systolic = exp(-pow((pulsePhase - 0.16) / 0.075, 2.0));
float dicrotic = 0.45 * exp(-pow((pulsePhase - 0.34) / 0.095, 2.0));
float cardiacWave = systolic + dicrotic;

float innerWristMask = smoothstep(0.35, -0.55, objectNormal.z);
float vesselMask = innerWristMask * exp(-pow((position.x + 0.012) / 0.011, 2.0)) * (0.45 + 0.55 * smoothstep(0.35, 0.88, forearmT));

vec3 safeNormal = length(objectNormal) > 0.0001 ? normalize(objectNormal) : vec3(0.0, 0.0, -1.0);
float pulseDisp = cardiacWave * seamFade * (0.00022 + 0.00058 * vesselMask);
transformed += safeNormal * pulseDisp;
vBloodPulse = clamp(cardiacWave * seamFade * (0.35 + 0.65 * vesselMask), 0.0, 1.0);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vBloodPulse;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb *= mix(vec3(1.0), vec3(1.08, 0.93, 0.90), vBloodPulse * 0.52);`,
      );
  };
}

/**
 * First-person true hierarchical skeletal rig (`Shoulder -> UpperArm -> Forearm -> Wrist -> Palm -> 5 Articulated Fingers`)
 * with anatomically sculpted hands, Dying Light Biomarker cuff, detailed ash/oak baseball bat,
 * state-driven procedural animations, dynamic motion-trail ribbon, parkour legs/boots, zipline hook, and particle pools.
 */
type UnarmedCombatPhase = 'IDLE' | 'WINDUP' | 'STRIKE' | 'HITSTOP' | 'RECOVERY';

interface UnarmedArmRig {
  root: THREE.Group;
  forearmPivot: THREE.Group;
  wristPivot: THREE.Group;
  fistGroup: THREE.Group;
}

export class WeaponAndEffects {
  public readonly viewmodelGroup = new THREE.Group();
  public readonly weaponPivot = this.viewmodelGroup;

  // Isolated Left Hand Core Root (attached directly to camera, Layer 2)
  private readonly leftArmRoot = new THREE.Group();

  // Dedicated Unarmed Combat Viewmodel (attached directly to camera, Layer 2)
  private readonly unarmedViewModel = new THREE.Group();
  private unarmedLeftArm!: UnarmedArmRig;
  private unarmedRightArm!: UnarmedArmRig;
  private readonly combatSystem: {
    phase: UnarmedCombatPhase;
    comboStep: 1 | 2 | 3;
    timer: number;
    duration: number;
    hitstopRemaining: number;
    impactFired: boolean;
    comboChainTimer: number;
    queuedCombo: boolean;
    onImpact: ((step: 1 | 2 | 3) => void) | null;
  } = {
    phase: 'IDLE',
    comboStep: 1,
    timer: 0,
    duration: 0.54,
    hitstopRemaining: 0,
    impactFired: false,
    comboChainTimer: 0,
    queuedCombo: false,
    onImpact: null,
  };
  private masterVisible = false;

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
  private readonly batBloodOverlay: THREE.Mesh;
  private readonly batTipMarker = new THREE.Object3D();
  private readonly batThroatMarker = new THREE.Object3D();
  private readonly daggerGroup = new THREE.Group();
  private readonly cleaverGroup = new THREE.Group();

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
  private readonly goreDropletPool: SparkParticle[] = [];
  private readonly bloodDripPool: BloodDripParticle[] = [];
  private readonly bloodPuddleGeo: THREE.CircleGeometry;
  private readonly bloodPuddleMat: THREE.MeshStandardMaterial;
  private readonly bloodPuddles: THREE.Mesh[] = [];
  private readonly spatterDroplets: SpatterDroplet[] = [];
  private readonly groundSpatters: GroundSpatterDecal[] = [];
  private groundSpatterCursor = 0;
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
  private readonly equipSwapDuration = 0.38;
  private animState: WeaponAnimState = 'idle';
  private animTime = 0;
  private animDuration = 0.44;
  private swingToggle = false;
  private shockwaveTime = -1;
  private kickTime = -1;
  private kickIsDropkick = false;
  private headGrabWhiffTime = -1;
  private batEmberTimer = 0;
  private leftInspectBlend = 0;
  private leftInspectSpin = 0;
  private readonly forearmPulseUniform = { value: 0 };

  // Smoothed Kinematic State
  private readonly curRightPos = new THREE.Vector3(0.29, -0.26, -0.44);
  private readonly curRightEuler = new THREE.Euler(-0.38, 0.95, -1.05);
  private curVmRoll = 0;
  private curVmPullback = 0;
  private swayYawLag = 0;
  private swayPitchLag = 0;
  private landingDipPos = 0;
  private landingDipVel = 0;

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
        bumpMap: textures.clothWrapBump,
        bumpScale: 0.014,
        roughnessMap: textures.clothWrapRoughness,
        color: 0x454d49, // #3A403D rolled olive-slate survivor sleeve cuff
        roughness: 0.9,
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
        bumpMap: textures.clothWrapBump,
        bumpScale: 0.018,
        roughnessMap: textures.clothWrapRoughness,
        color: 0x26292f, // #1E2024 matte-charcoal athletic compression wrist wrap
        roughness: 0.92,
        metalness: 0.03,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const watchStrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.wristWrapTape,
        bumpMap: textures.clothWrapBump,
        bumpScale: 0.016,
        color: 0x353b32, // #2D322B paracord / nylon survival wrist strap
        roughness: 0.86,
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


    this.batWoodMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        bumpMap: textures.batWoodBump,
        bumpScale: 0.018,
        roughnessMap: textures.batWoodRoughness,
        color: 0xeadfce,
        emissive: 0x000000,
        emissiveIntensity: 1.0,
        roughness: 0.68,
        metalness: 0.04,
        envMapIntensity: 0.4,
        toneMapped: true,
      }),
    );
    const batWoodMat = this.batWoodMat;
    const batGripMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.batGripTape,
        bumpMap: textures.clothWrapBump,
        bumpScale: 0.014,
        color: 0xd4d4d8,
        roughness: 0.9,
        metalness: 0.04,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const pommelMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        bumpMap: textures.batWoodBump,
        bumpScale: 0.014,
        roughnessMap: textures.batWoodRoughness,
        color: 0x9b6f42,
        roughness: 0.72,
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
    // 1. ISOLATED BARE LEFT PALM + BACK-OF-HAND CORE + WRIST + FOREARM + WRAPS
    // =========================================================================
    const leftHandCoreMat = trackMat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.0,
        emissive: 0x000000,
        envMapIntensity: 0.3,
      }),
    );
    const leftHandCoreGeo = trackGeo(createLeftHandCoreGeo());
    const leftHandCoreMesh = new THREE.Mesh(leftHandCoreGeo, leftHandCoreMat);
    leftHandCoreMesh.name = 'leftHandCoreMesh';

    const leftForearmSkinMat = trackMat(leftHandCoreMat.clone());
    applyForearmPulseShader(leftForearmSkinMat, 'z', this.forearmPulseUniform);
    const leftForearmGeo = trackGeo(createLeftForearmGeo());
    const leftForearmMesh = new THREE.Mesh(leftForearmGeo, leftForearmSkinMat);
    leftForearmMesh.name = 'leftForearmMesh';

    const leftWristWrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.wristWrapTape,
        bumpMap: textures.clothWrapBump,
        bumpScale: 0.018,
        roughnessMap: textures.clothWrapRoughness,
        color: 0x22252a,
        roughness: 0.9,
        metalness: 0.04,
        envMapIntensity: 0.3,
      }),
    );
    const leftSleeveCuffMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        bumpMap: textures.clothWrapBump,
        bumpScale: 0.014,
        roughnessMap: textures.clothWrapRoughness,
        color: 0x333935,
        roughness: 0.94,
        metalness: 0.02,
        envMapIntensity: 0.28,
      }),
    );

    const strapConfigs = [
      { z: 0.075, halfW: 0.011, tilt: 0.0038 },
      { z: 0.115, halfW: 0.0115, tilt: -0.0042 },
      { z: 0.145, halfW: 0.0105, tilt: 0.0032 },
    ];
    for (let i = 0; i < strapConfigs.length; i++) {
      const sc = strapConfigs[i];
      const strapMesh = new THREE.Mesh(
        trackGeo(createLeftWristStrapGeo(sc.z, sc.halfW, sc.tilt, 0.003)),
        leftWristWrapMat,
      );
      this.leftArmRoot.add(strapMesh);
    }

    const leftSleeveMesh = new THREE.Mesh(trackGeo(createLeftSleeveCuffGeo()), leftSleeveCuffMat);

    // Articulated Bare Fingers, Opposable Thumb, Fingernails & Webbing attached directly to leftHandCoreMesh
    const leftNailPlateMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdfb8a2,
        roughness: 0.45,
        metalness: 0.02,
        envMapIntensity: 0.35,
        toneMapped: true,
      }),
    );
    const leftNailRimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x8f5740,
        roughness: 0.72,
        metalness: 0.0,
        envMapIntensity: 0.25,
        toneMapped: true,
      }),
    );

    const leftFingerSpecs: Array<{
      name: string;
      anchor: [number, number, number];
      lengths: [number, number, number];
      rBase: number;
      rTip: number;
      curls: [number, number, number];
    }> = [
      {
        name: 'Index',
        anchor: [0.031, 0.002, -0.048],
        lengths: [0.036, 0.023, 0.018],
        rBase: 0.0088,
        rTip: 0.0064,
        curls: [-0.24, -0.32, -0.18],
      },
      {
        name: 'Middle',
        anchor: [0.011, 0.003, -0.052],
        lengths: [0.04, 0.026, 0.019],
        rBase: 0.0092,
        rTip: 0.0066,
        curls: [-0.32, -0.4, -0.22],
      },
      {
        name: 'Ring',
        anchor: [-0.01, 0.002, -0.048],
        lengths: [0.037, 0.024, 0.018],
        rBase: 0.0086,
        rTip: 0.0062,
        curls: [-0.4, -0.48, -0.26],
      },
      {
        name: 'Pinky',
        anchor: [-0.03, -0.002, -0.04],
        lengths: [0.029, 0.018, 0.015],
        rBase: 0.0076,
        rTip: 0.0054,
        curls: [-0.48, -0.56, -0.3],
      },
    ];

    for (let f = 0; f < leftFingerSpecs.length; f++) {
      const spec = leftFingerSpecs[f];
      const r0 = spec.rBase;
      const r1 = THREE.MathUtils.lerp(spec.rBase, spec.rTip, 0.42);
      const r2 = THREE.MathUtils.lerp(spec.rBase, spec.rTip, 0.74);
      const r3 = spec.rTip;

      const mcpPivot = new THREE.Group();
      mcpPivot.name = `Left${spec.name}_MCP`;
      mcpPivot.position.set(spec.anchor[0], spec.anchor[1], spec.anchor[2]);
      mcpPivot.rotation.x = spec.curls[0];
      leftHandCoreMesh.add(mcpPivot);

      mcpPivot.add(
        createFingerPhalanx(
          spec.lengths[0],
          r0,
          r1,
          false,
          leftHandCoreMat,
          leftNailPlateMat,
          leftNailRimMat,
          trackGeo,
        ),
      );

      const pipPivot = new THREE.Group();
      pipPivot.name = `Left${spec.name}_PIP`;
      pipPivot.position.set(0, 0, -spec.lengths[0]);
      pipPivot.rotation.x = spec.curls[1];
      mcpPivot.add(pipPivot);

      pipPivot.add(
        createFingerPhalanx(
          spec.lengths[1],
          r1,
          r2,
          false,
          leftHandCoreMat,
          leftNailPlateMat,
          leftNailRimMat,
          trackGeo,
        ),
      );

      const dipPivot = new THREE.Group();
      dipPivot.name = `Left${spec.name}_DIP`;
      dipPivot.position.set(0, 0, -spec.lengths[1]);
      dipPivot.rotation.x = spec.curls[2];
      pipPivot.add(dipPivot);

      dipPivot.add(
        createFingerPhalanx(
          spec.lengths[2],
          r2,
          r3,
          true,
          leftHandCoreMat,
          leftNailPlateMat,
          leftNailRimMat,
          trackGeo,
        ),
      );
    }

    // 3-Joint Opposable Thumb (ThumbCMC -> Metacarpal -> ThumbMCP -> Proximal -> ThumbIP -> Distal + Thumbnail)
    const tr0 = 0.0105;
    const tr1 = THREE.MathUtils.lerp(0.0105, 0.0076, 0.42);
    const tr2 = THREE.MathUtils.lerp(0.0105, 0.0076, 0.74);
    const tr3 = 0.0076;

    const thumbCmc = new THREE.Group();
    thumbCmc.name = 'LeftThumb_CMC';
    thumbCmc.position.set(0.034, -0.005, 0.006);
    thumbCmc.rotation.set(-0.32, -0.58, -0.45);
    leftHandCoreMesh.add(thumbCmc);

    thumbCmc.add(
      createFingerPhalanx(0.034, tr0, tr1, false, leftHandCoreMat, leftNailPlateMat, leftNailRimMat, trackGeo),
    );

    const thumbMcp = new THREE.Group();
    thumbMcp.name = 'LeftThumb_MCP';
    thumbMcp.position.set(0, 0, -0.034);
    thumbMcp.rotation.x = -0.22;
    thumbCmc.add(thumbMcp);

    thumbMcp.add(
      createFingerPhalanx(0.028, tr1, tr2, false, leftHandCoreMat, leftNailPlateMat, leftNailRimMat, trackGeo),
    );

    const thumbIp = new THREE.Group();
    thumbIp.name = 'LeftThumb_IP';
    thumbIp.position.set(0, 0, -0.028);
    thumbIp.rotation.x = -0.28;
    thumbMcp.add(thumbIp);

    thumbIp.add(
      createFingerPhalanx(0.022, tr2, tr3, true, leftHandCoreMat, leftNailPlateMat, leftNailRimMat, trackGeo),
    );

    // Smooth tapered skin-webbing wedge connecting thumb base to Index finger base
    const thumbIndexWebMesh = new THREE.Mesh(trackGeo(createThumbIndexWebbingGeo()), leftHandCoreMat);
    thumbIndexWebMesh.name = 'leftThumbIndexWebbing';
    leftHandCoreMesh.add(thumbIndexWebMesh);

    this.leftArmRoot.position.set(-0.28, -0.2, -0.46);
    this.leftArmRoot.rotation.set(0.22, 0.38, -0.32);
    this.leftArmRoot.add(leftHandCoreMesh);
    this.leftArmRoot.add(leftForearmMesh);
    this.leftArmRoot.add(leftSleeveMesh);
    camera.add(this.leftArmRoot);

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

    // Muscular bare forearm skin with subtle sleeve/wrist-wrap crease AO & blood-flow pulse shader
    const rightForearmSkinMat = trackMat(skinMat.clone());
    applyForearmPulseShader(rightForearmSkinMat, 'y', this.forearmPulseUniform);
    const rForearmSkin = new THREE.Mesh(
      applySkinVertexAO(
        trackGeo(createTaperedLimbGeo(0.043, 0.04, 0.0295, this.forearmLen - 0.086, 12, 6)),
        0.74,
        1.0,
        0.76,
      ),
      rightForearmSkinMat,
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

    // Front 40% barrel crimson blood-stain overlay toggled by Bat Face-Drive execution
    const batBloodProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.0338, 0.44),
      new THREE.Vector2(0.0358, 0.48),
      new THREE.Vector2(0.0366, 0.59),
      new THREE.Vector2(0.0351, 0.655),
      new THREE.Vector2(0.0275, 0.678),
      new THREE.Vector2(0.0143, 0.684),
      new THREE.Vector2(0.001, 0.6855),
    ];
    const batBloodGeo = trackGeo(smoothGeo(new THREE.LatheGeometry(batBloodProfile, 16)));
    const batBloodMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6e0707,
        emissive: 0x220000,
        emissiveIntensity: 0.65,
        roughness: 0.22,
        metalness: 0.05,
        transparent: true,
        opacity: 0.94,
      }),
    );
    this.batBloodOverlay = new THREE.Mesh(batBloodGeo, batBloodMat);
    this.batBloodOverlay.visible = false;
    this.batGroup.add(this.batBloodOverlay);

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

    // High-velocity crimson gore droplets (0x7A0404 / 0xA80808, roughness 0.2)
    const goreGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.032, 6, 6)));
    for (let i = 0; i < 36; i++) {
      const mat = trackMat(
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x7a0404 : 0xa80808,
          roughness: 0.2,
          metalness: 0.05,
          transparent: true,
          opacity: 0.95,
        }),
      );
      const mesh = new THREE.Mesh(goreGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.goreDropletPool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.65 });
    }

    // Thick stretched dripping blood droplets (0x6B0202, scale.y = 2.4, -14 m/s^2)
    const dripGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.018, 6, 6)));
    const dripMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6b0202,
        roughness: 0.15,
        metalness: 0.06,
      }),
    );
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(dripGeo, dripMat);
      mesh.scale.set(0.85, 2.4, 0.85);
      mesh.visible = false;
      scene.add(mesh);
      this.bloodDripPool.push({ mesh, vel: new THREE.Vector3(), floorY: 0, active: false });
    }

    this.bloodPuddleGeo = trackGeo(new THREE.CircleGeometry(1, 12));
    this.bloodPuddleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4d0202,
        roughness: 0.25,
        metalness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );

    // Ballistic Blood Spatter Droplets (arc out of melee/finisher wounds -> stamp ground spatter on floor impact)
    const splatDropGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.022, 6, 5)));
    const splatDropMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x8b0509,
        roughness: 0.14,
        metalness: 0.08,
      }),
    );
    for (let i = 0; i < 44; i++) {
      const mesh = new THREE.Mesh(splatDropGeo, splatDropMat);
      mesh.visible = false;
      scene.add(mesh);
      this.spatterDroplets.push({ mesh, vel: new THREE.Vector3(), floorY: 0, life: 0, active: false });
    }

    // Short-duration persistent Textured Ground Blood Spatter Decals (fades smoothly after ~5-9s)
    const groundSplatGeo = trackGeo(new THREE.PlaneGeometry(1, 1));
    groundSplatGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 64; i++) {
      const mat = trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.bloodSpatter,
          color: 0xffffff,
          roughness: 0.16,
          metalness: 0.12,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }),
      );
      const mesh = new THREE.Mesh(groundSplatGeo, mat);
      mesh.visible = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.groundSpatters.push({ mesh, mat, life: 0, maxLife: 9.0, fadeStartRatio: 0.4 });
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

    // =========================================================================
    // 4B. DEDICATED UNARMED COMBAT VIEWMODEL (FISTS [1])
    // =========================================================================
    const unarmedSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd2997c,
        roughness: 0.72,
        metalness: 0.05,
      }),
    );
    const unarmedWrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x18181a,
        roughness: 0.9,
        metalness: 0.02,
      }),
    );
    const unarmedGloveMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1f2024,
        roughness: 0.65,
        metalness: 0.08,
      }),
    );
    const unarmedKnuckleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2c2e33,
        roughness: 0.35,
        metalness: 0.45,
      }),
    );

    const buildUnarmedArm = (isRight: boolean): UnarmedArmRig => {
      const sign = isRight ? 1 : -1;
      const root = new THREE.Group();
      root.rotation.order = 'YXZ';

      const forearmPivot = new THREE.Group();
      root.add(forearmPivot);

      // Tapered skin forearm extending along +Z (0.06m -> 0.36m toward shoulder)
      const forearmGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.048, 0.31, 14, 4));
      forearmGeo.rotateX(Math.PI / 2);
      const forearmMesh = new THREE.Mesh(forearmGeo, unarmedSkinMat);
      forearmMesh.scale.set(1.06, 0.86, 1.0);
      forearmMesh.position.set(0, -0.004, 0.21);
      forearmPivot.add(forearmMesh);

      // 3 overlapping dark cloth wrist/forearm wraps (#18181a)
      [0.08, 0.14, 0.2].forEach((wz, idx) => {
        const wrapRadius = 0.0345 + idx * 0.0032;
        const wrapGeo = trackGeo(new THREE.CylinderGeometry(wrapRadius, wrapRadius + 0.0018, 0.046, 14));
        wrapGeo.rotateX(Math.PI / 2);
        const wrapMesh = new THREE.Mesh(wrapGeo, unarmedWrapMat);
        wrapMesh.scale.set(1.08, 0.89, 1.0);
        wrapMesh.position.set(0, -0.003, wz);
        wrapMesh.rotation.z = (idx % 2 === 0 ? 1 : -1) * 0.045 * sign;
        forearmPivot.add(wrapMesh);
      });

      // Wrist pivot at z = 0
      const wristPivot = new THREE.Group();
      wristPivot.position.set(0, 0, 0.055);
      forearmPivot.add(wristPivot);

      // Gloved Fist Assembly
      const fistGroup = new THREE.Group();
      wristPivot.add(fistGroup);

      // Gloved palm block (#1f2024)
      const palmMesh = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.082, 0.042, 0.092)),
        unarmedGloveMat,
      );
      palmMesh.position.set(0, 0.0, -0.042);
      fistGroup.add(palmMesh);

      // Wrist cuff seal
      const cuffMesh = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.035, 0.037, 0.032, 12)),
        unarmedGloveMat,
      );
      cuffMesh.rotation.x = Math.PI / 2;
      cuffMesh.scale.set(1.12, 0.78, 1.0);
      cuffMesh.position.set(0, 0.0, -0.004);
      fistGroup.add(cuffMesh);

      // Reinforced knuckle guard bar (#2c2e33)
      const knuckleBar = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.086, 0.022, 0.026)),
        unarmedKnuckleMat,
      );
      knuckleBar.position.set(0, 0.017, -0.084);
      fistGroup.add(knuckleBar);

      // 4 Individual Knuckle Caps along guard bar
      for (let k = 0; k < 4; k++) {
        const kx = (-1.5 + k) * 0.0205 * sign;
        const cap = new THREE.Mesh(
          trackGeo(new THREE.SphereGeometry(0.0115, 8, 6)),
          unarmedKnuckleMat,
        );
        cap.scale.set(0.96, 0.84, 0.82);
        cap.position.set(kx, 0.018, -0.094);
        fistGroup.add(cap);
      }

      // 4 Curled Fingers (Index, Middle, Ring, Pinky) tucked tightly into palm
      const fingerRadii = [0.0098, 0.0102, 0.0095, 0.0084];
      for (let f = 0; f < 4; f++) {
        const fx = (-1.5 + f) * 0.0205 * sign;
        const r = fingerRadii[f];
        const prox = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(r * 1.95, 0.022, 0.032)),
          unarmedGloveMat,
        );
        prox.position.set(fx, 0.003, -0.096);
        prox.rotation.x = 0.58;
        fistGroup.add(prox);

        const midSkin = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(r * 0.88, r * 0.96, 0.028, 8)),
          unarmedSkinMat,
        );
        midSkin.position.set(fx, -0.016, -0.092);
        midSkin.rotation.x = 1.48;
        fistGroup.add(midSkin);

        const tipSkin = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(r * 0.8, r * 0.88, 0.022, 8)),
          unarmedSkinMat,
        );
        tipSkin.position.set(fx, -0.022, -0.068);
        tipSkin.rotation.x = 2.45;
        fistGroup.add(tipSkin);
      }

      // 2-Segment Tucked Thumb wrapped cleanly across the index & middle fingers
      const thumbBase = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.026, 0.024, 0.038)),
        unarmedGloveMat,
      );
      thumbBase.position.set(-0.044 * sign, -0.011, -0.062);
      thumbBase.rotation.set(0.32, 0.42 * sign, -0.35 * sign);
      fistGroup.add(thumbBase);

      const thumbTip = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.0088, 0.0102, 0.034, 8)),
        unarmedSkinMat,
      );
      thumbTip.position.set(-0.024 * sign, -0.02, -0.092);
      thumbTip.rotation.z = (Math.PI / 2 - 0.18) * sign;
      fistGroup.add(thumbTip);

      return { root, forearmPivot, wristPivot, fistGroup };
    };

    this.unarmedLeftArm = buildUnarmedArm(false);
    this.unarmedLeftArm.root.position.set(-0.26, -0.22, -0.42);
    this.unarmedLeftArm.root.rotation.set(0.35, 0.25, -0.15);
    this.unarmedViewModel.add(this.unarmedLeftArm.root);

    this.unarmedRightArm = buildUnarmedArm(true);
    this.unarmedRightArm.root.position.set(0.3, -0.26, -0.34);
    this.unarmedRightArm.root.rotation.set(0.42, -0.3, 0.2);
    this.unarmedViewModel.add(this.unarmedRightArm.root);

    this.unarmedViewModel.visible = false;
    camera.add(this.unarmedViewModel);

    // Assign Layer 2 (isolated depth-cleared viewmodel pass) & shadow integrity on left arm/watch/hand
    const assignViewmodelLayer = (root: THREE.Object3D, castShadow: boolean) => {
      root.traverse((obj) => {
        obj.layers.set(2);
        obj.frustumCulled = false;
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = castShadow;
          obj.receiveShadow = true;
        }
      });
    };
    assignViewmodelLayer(this.viewmodelGroup, false);
    assignViewmodelLayer(this.leftArmRoot, true);
    assignViewmodelLayer(this.unarmedViewModel, false);
    assignViewmodelLayer(this.leftLegPivot, false);
    assignViewmodelLayer(this.rightLegPivot, false);
    assignViewmodelLayer(this.ziplineHookPivot, false);
    assignViewmodelLayer(this.swingArcMesh, false);

    // Solve initial right-arm pose so first frame starts clean
    this.applyRightFingerAngles(0, 1, 'WEAPON_GRIP', 0);
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
    this.masterVisible = visible;
    if (!visible) {
      this.viewmodelGroup.visible = false;
      this.leftArmRoot.visible = false;
      this.unarmedViewModel.visible = false;
      this.leftLegPivot.visible = false;
      this.rightLegPivot.visible = false;
      this.ziplineHookPivot.visible = false;
      this.swingArcMesh.visible = false;
    } else {
      const useDedicatedUnarmed = this.activeWeapon === 'unarmed';
      this.viewmodelGroup.visible = !useDedicatedUnarmed;
      this.leftArmRoot.visible = !useDedicatedUnarmed;
      this.unarmedViewModel.visible = useDedicatedUnarmed;
      this.swingArcMesh.visible = !useDedicatedUnarmed;
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
      this.combatSystem.phase = 'IDLE';
      this.combatSystem.timer = 0;
      this.combatSystem.hitstopRemaining = 0;
      this.combatSystem.comboStep = 1;
      this.applyActiveWeaponMeshes(weapon);
      this.setVisible(this.masterVisible);
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

  public triggerUnarmedHook(onImpact?: (step: 1 | 2 | 3) => void): boolean {
    const cs = this.combatSystem;
    if (cs.phase === 'WINDUP' || cs.phase === 'STRIKE' || cs.phase === 'HITSTOP') {
      cs.queuedCombo = true;
      return false;
    }
    const nextStep: 1 | 2 | 3 =
      cs.phase === 'RECOVERY' || cs.comboChainTimer > 0
        ? (cs.comboStep === 1 ? 2 : cs.comboStep === 2 ? 3 : 1)
        : 1;
    cs.comboStep = nextStep;
    cs.phase = 'WINDUP';
    cs.timer = 0;
    cs.duration = nextStep === 1 ? 0.54 : nextStep === 2 ? 0.52 : 0.56;
    cs.hitstopRemaining = 0;
    cs.impactFired = false;
    cs.queuedCombo = false;
    cs.onImpact = onImpact ?? null;
    return true;
  }

  public triggerUnarmedHitstop(durationSec = 0.045): void {
    if (this.combatSystem.phase === 'STRIKE') {
      this.combatSystem.phase = 'HITSTOP';
      this.combatSystem.hitstopRemaining = durationSec;
    }
  }

  public isUnarmedAttackActive(): boolean {
    return this.combatSystem.phase !== 'IDLE';
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

  public triggerHeadGrabWhiff(): void {
    this.headGrabWhiffTime = 0;
  }

  public setBatBloodStained(stained: boolean): void {
    this.batBloodOverlay.visible = stained;
  }

  public getBatTipWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    this.viewmodelGroup.updateWorldMatrix(true, true);
    return this.batTipMarker.getWorldPosition(out);
  }

  public spawnFinisherGoreBurst(worldPos: THREE.Vector3, sprayDir: THREE.Vector3, count = 26): void {
    let spawned = 0;
    for (let i = 0; i < this.goreDropletPool.length && spawned < count; i++) {
      const g = this.goreDropletPool[i];
      if (g.life <= 0) {
        g.life = 0.45 + Math.random() * 0.35;
        g.maxLife = g.life;
        g.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.14,
          worldPos.y + (Math.random() - 0.5) * 0.12,
          worldPos.z + (Math.random() - 0.5) * 0.14,
        );
        // 0.025m -> 0.05m droplet radius
        g.mesh.scale.setScalar(0.78 + Math.random() * 0.78);
        g.mesh.visible = true;
        (g.mesh.material as THREE.MeshStandardMaterial).opacity = 0.96;

        const spreadAngle = Math.random() * Math.PI * 2;
        const radialSpeed = 1.6 + Math.random() * 3.8;
        g.vel.set(
          sprayDir.x * (1.5 + Math.random() * 3.2) + Math.cos(spreadAngle) * radialSpeed,
          1.2 + Math.random() * 3.6,
          sprayDir.z * (1.5 + Math.random() * 3.2) + Math.sin(spreadAngle) * radialSpeed,
        );
        spawned++;
      }
    }
  }

  public spawnBloodDrip(worldPos: THREE.Vector3, floorY: number): void {
    for (let i = 0; i < this.bloodDripPool.length; i++) {
      const d = this.bloodDripPool[i];
      if (!d.active) {
        d.active = true;
        d.floorY = floorY;
        d.mesh.position.copy(worldPos);
        d.mesh.visible = true;
        d.vel.set(
          (Math.random() - 0.5) * 0.32,
          -0.45 - Math.random() * 0.65,
          (Math.random() - 0.5) * 0.32,
        );
        return;
      }
    }
  }

  private spawnBloodPuddle(x: number, y: number, z: number): void {
    const MAX_PUDDLES = 48;
    let puddle: THREE.Mesh;
    if (this.bloodPuddles.length >= MAX_PUDDLES) {
      puddle = this.bloodPuddles.shift()!;
    } else {
      puddle = new THREE.Mesh(this.bloodPuddleGeo, this.bloodPuddleMat);
      puddle.rotation.x = -Math.PI / 2;
      this.scene.add(puddle);
    }
    const radius = 0.08 + Math.random() * 0.12;
    puddle.position.set(x, y + 0.014, z);
    puddle.scale.set(radius * (0.9 + Math.random() * 0.3), radius * (0.9 + Math.random() * 0.3), 1);
    puddle.rotation.z = Math.random() * Math.PI * 2;
    this.bloodPuddles.push(puddle);
  }

  public spawnGroundBloodSplatter(worldPos: THREE.Vector3, count = 2): void {
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 0.55;
      const oz = (Math.random() - 0.5) * 0.55;
      this.spawnBloodPuddle(worldPos.x + ox, worldPos.y, worldPos.z + oz);
    }
  }

  private stampGroundBloodSpatter(
    x: number,
    floorY: number,
    z: number,
    dirX: number,
    dirZ: number,
    sizeBase: number,
    streakStretch = 1.0,
    durationSec = 8.5,
  ): void {
    const decal = this.groundSpatters[this.groundSpatterCursor];
    this.groundSpatterCursor = (this.groundSpatterCursor + 1) % this.groundSpatters.length;

    const dirLen = Math.hypot(dirX, dirZ);
    const rotY = dirLen > 0.05 ? Math.atan2(dirX, dirZ) : Math.random() * Math.PI * 2;
    const width = sizeBase * (0.85 + Math.random() * 0.35);
    const length = sizeBase * streakStretch * (0.95 + Math.random() * 0.45);

    decal.mesh.position.set(x, floorY + 0.018 + (this.groundSpatterCursor % 4) * 0.001, z);
    decal.mesh.rotation.set(0, rotY, 0);
    decal.mesh.scale.set(width, 1, length);
    decal.mesh.visible = true;
    decal.maxLife = durationSec;
    decal.life = durationSec;
    decal.fadeStartRatio = 0.42;
    decal.mat.opacity = 0.94;
  }

  /**
   * Launches ballistic blood spatter droplets along hitDir that burst onto floorY
   * as persistent, short-duration textured ground blood spatters (~8-10s).
   */
  public spawnComboBloodSpatter(
    worldPos: THREE.Vector3,
    hitDir: THREE.Vector3,
    floorY: number,
    dropletCount = 10,
    spreadScale = 1.0,
  ): void {
    const centerCount = dropletCount >= 14 ? 3 : 2;
    for (let c = 0; c < centerCount; c++) {
      this.stampGroundBloodSpatter(
        worldPos.x + hitDir.x * (0.35 + c * 0.35) + (Math.random() - 0.5) * 0.42,
        floorY,
        worldPos.z + hitDir.z * (0.35 + c * 0.35) + (Math.random() - 0.5) * 0.42,
        hitDir.x,
        hitDir.z,
        (0.58 + Math.random() * 0.42) * spreadScale,
        1.15 + Math.random() * 0.45,
        8.2 + Math.random() * 2.2,
      );
    }

    let spawned = 0;
    for (let i = 0; i < this.spatterDroplets.length && spawned < dropletCount; i++) {
      const d = this.spatterDroplets[i];
      if (!d.active) {
        d.active = true;
        d.floorY = floorY;
        d.life = 2.4;
        d.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.18,
          Math.max(floorY + 0.25, worldPos.y + (Math.random() - 0.5) * 0.16),
          worldPos.z + (Math.random() - 0.5) * 0.18,
        );
        const s = 0.75 + Math.random() * 0.85;
        d.mesh.scale.set(s, s * 1.4, s);
        d.mesh.visible = true;

        const ang = (Math.random() - 0.5) * 2.1;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const rx = hitDir.x * cosA - hitDir.z * sinA;
        const rz = hitDir.x * sinA + hitDir.z * cosA;
        const fwdSpeed = (2.2 + Math.random() * 4.4) * spreadScale;
        d.vel.set(rx * fwdSpeed, 0.9 + Math.random() * 3.1, rz * fwdSpeed);
        spawned++;
      }
    }
  }

  public clearBloodPuddles(): void {
    for (let i = 0; i < this.bloodPuddles.length; i++) {
      this.scene.remove(this.bloodPuddles[i]);
    }
    this.bloodPuddles.length = 0;
    for (let i = 0; i < this.goreDropletPool.length; i++) {
      this.goreDropletPool[i].life = 0;
      this.goreDropletPool[i].mesh.visible = false;
    }
    for (let i = 0; i < this.bloodDripPool.length; i++) {
      this.bloodDripPool[i].active = false;
      this.bloodDripPool[i].mesh.visible = false;
    }
    for (let i = 0; i < this.spatterDroplets.length; i++) {
      this.spatterDroplets[i].active = false;
      this.spatterDroplets[i].mesh.visible = false;
    }
    for (let i = 0; i < this.groundSpatters.length; i++) {
      this.groundSpatters[i].life = 0;
      this.groundSpatters[i].mesh.visible = false;
      this.groundSpatters[i].mat.opacity = 0;
    }
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
    const rightGripWorld = parkourDetail?.rightGripWorld;
    const awakeningActive = parkourDetail?.awakeningActive ?? false;
    const awakeningPose = parkourDetail?.awakeningPose;
    const awakeningBatEmissive = parkourDetail?.awakeningBatEmissive ?? null;
    const awakeningBatEmissiveIntensity = parkourDetail?.awakeningBatEmissiveIntensity ?? 1.0;
    const headGrabActive = parkourDetail?.headGrabActive ?? false;
    const headGrabTimer = parkourDetail?.headGrabTimer ?? 0;
    const batFaceDriveActive = parkourDetail?.batFaceDriveActive ?? false;
    const batFaceDriveTimer = parkourDetail?.batFaceDriveTimer ?? 0;
    const inspectLeftArm = parkourDetail?.inspectLeftArm ?? false;
    void isNight;
    void inSafeZone;

    // Advance physiological forearm/wrist blood-flow pulse shader uniform
    this.forearmPulseUniform.value += dt * (awakeningActive ? 1.35 : 1.0);

    // Determine whether dedicated unarmedViewModel should be visible instead of armed/climb rig
    const usingDedicatedUnarmed =
      this.masterVisible &&
      this.activeWeapon === 'unarmed' &&
      !awakeningPose?.active &&
      !headGrabActive &&
      !batFaceDriveActive &&
      climbState === 'NONE' &&
      !isZiplining &&
      !isMantling &&
      !isVaulting &&
      !inspectLeftArm;

    this.unarmedViewModel.visible = usingDedicatedUnarmed;
    this.viewmodelGroup.visible = this.masterVisible && !usingDedicatedUnarmed;
    this.leftArmRoot.visible = this.masterVisible && !usingDedicatedUnarmed;
    this.swingArcMesh.visible = this.masterVisible && !usingDedicatedUnarmed;

    // Smooth vertical equip / unequip transition (0.18s drop down -> swap -> 0.20s cubic ease-out rise from y = -0.35)
    let equipOffsetY = 0;
    if (this.equipSwapTime >= 0) {
      this.equipSwapTime += dt;
      if (this.equipSwapTime < 0.18) {
        const downU = Math.min(1, this.equipSwapTime / 0.18);
        const easeDown = downU * downU;
        equipOffsetY = -0.35 * easeDown;
      } else {
        if (this.pendingWeapon !== null) {
          this.applyActiveWeaponMeshes(this.pendingWeapon);
          this.pendingWeapon = null;
        }
        const upU = Math.min(1, (this.equipSwapTime - 0.18) / 0.2);
        const easeOutCubic = 1 - Math.pow(1 - upU, 3);
        equipOffsetY = -0.35 * (1 - easeOutCubic);
        if (this.equipSwapTime >= this.equipSwapDuration) {
          this.equipSwapTime = -1;
          equipOffsetY = 0;
        }
      }
    }

    // Update dedicated Unarmed Viewmodel (idle breathing bob, figure-8 walk/sprint sway, & 3-step combatSystem)
    this.updateUnarmedViewmodel(dt, elapsed, horizSpeed, isSprinting, equipOffsetY);

    // Smooth dual-angle / 360-degree V-hold inspection for connected Forearm + Wrist + Palm + Back of Hand
    const inspectTarget = inspectLeftArm ? 1 : 0;
    this.leftInspectBlend = THREE.MathUtils.lerp(this.leftInspectBlend, inspectTarget, 1 - Math.exp(-12 * dt));
    if (inspectLeftArm) {
      this.leftInspectSpin += dt * 1.15;
    } else if (this.leftInspectBlend < 0.01) {
      this.leftInspectSpin = 0;
    }
    let whiffX = 0;
    let whiffY = 0;
    let whiffZ = 0;
    let whiffRotX = 0;
    let whiffRotZ = 0;
    if (!inspectLeftArm && this.headGrabWhiffTime >= 0) {
      const u = Math.min(1, this.headGrabWhiffTime / 0.3);
      const lunge = Math.sin(u * Math.PI);
      whiffX = lunge * 0.08;
      whiffY = -lunge * 0.04;
      whiffZ = -lunge * 0.14;
      whiffRotX = -lunge * 0.38;
      whiffRotZ = lunge * 0.42;
    }

    this.leftArmRoot.position.set(
      THREE.MathUtils.lerp(-0.28, -0.15, this.leftInspectBlend) + whiffX,
      THREE.MathUtils.lerp(-0.2, -0.09, this.leftInspectBlend) + whiffY,
      THREE.MathUtils.lerp(-0.46, -0.36, this.leftInspectBlend) + whiffZ,
    );
    const inspectRotX = 0.22 + Math.sin(this.leftInspectSpin * 0.65) * 0.38 * this.leftInspectBlend + whiffRotX;
    const inspectRotY = 0.38 + this.leftInspectSpin * this.leftInspectBlend;
    const inspectRotZ = -0.32 + Math.sin(this.leftInspectSpin * 0.45) * 0.42 * this.leftInspectBlend + whiffRotZ;
    this.leftArmRoot.rotation.set(inspectRotX, inspectRotY, inspectRotZ);

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
    // B. Mouse-look Rotational Spring Lag (±0.08 rad max) + Anti-Wall Pullback
    // -------------------------------------------------------------------------
    if (climbState === 'MUSCLE_UP' || awakeningPose?.active || headGrabActive || batFaceDriveActive) {
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

        if (isUnarmed) {
          // State B Unarmed Sprint: rhythmic cross-body tight-fist pump
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
      }
    }

    // 3. Parkour Slide (C while sprinting)
    if (isSliding) {
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
        rPosX = 0.3;
        rPosY = -0.24 + Math.cos(elapsed * 16) * 0.022;
        rPosZ = -0.42;
        rRotX = isUnarmed ? -1.02 : -0.28;
        rRotY = isUnarmed ? -0.18 : 0.85;
        rRotZ = isUnarmed ? 0.22 : -0.95;
      } else {
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

      rPosX = 0.15 + zipSway;
      rPosY = 0.13 + zipBuzz;
      rPosZ = -0.42;
      rRotX = -1.25;
      rRotY = -0.06;
      rRotZ = 0.05 - zipSway * 1.4;
      if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
      dampHz = 18;
    } else if (isVaulting) {
      const plantArc = Math.sin(vaultProgress * Math.PI);
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
      if (climbState === 'MUSCLE_UP' && rightGripWorld) {
        if (climbPhaseTime < 0.42) {
          this.camera.updateMatrixWorld(true);
          this.viewmodelGroup.updateMatrixWorld(true);
          _ikRightLocal.copy(rightGripWorld);
          this.viewmodelGroup.worldToLocal(_ikRightLocal);

          _ikRightLocal.z = Math.min(-0.18, _ikRightLocal.z + 0.03);
          _ikRightLocal.y = THREE.MathUtils.clamp(_ikRightLocal.y + 0.015, -0.68, 0.16);
          _ikReachVec.subVectors(_ikRightLocal, _ikRightShoulder);
          if (_ikReachVec.length() > 0.72) {
            _ikReachVec.setLength(0.72);
            _ikRightLocal.copy(_ikRightShoulder).add(_ikReachVec);
          }

          const pullU = THREE.MathUtils.clamp((climbPhaseTime - 0.14) / 0.28, 0, 1);
          const tremor = climbPhaseTime >= 0.14 ? Math.sin(elapsed * 18 * Math.PI * 2) * 0.003 : 0;

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
          rPosX = THREE.MathUtils.lerp(0.29, 0.22, reach);
          rPosY = THREE.MathUtils.lerp(-0.24, -0.06, reach);
          rPosZ = THREE.MathUtils.lerp(-0.44, -0.56, reach);
          rRotX = THREE.MathUtils.lerp(isUnarmed ? -1.08 : -0.38, -1.48, reach);
          rRotY = isUnarmed ? -0.1 : 0.72;
          rRotZ = isUnarmed ? 0.08 : -0.78;
          if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
        } else {
          const pull = (mantleProgress - 0.24) / 0.76;
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
      rPosX = 0.34;
      rPosY = -0.2;
      rPosZ = -0.44;
      rRotX = isUnarmed ? -0.95 : -0.34;
      rRotZ = isUnarmed ? 0.32 : -0.82;
      if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      dampHz = 16;
    } else if (isAirborne && !isSliding) {
      const airFloat = Math.sin(elapsed * 6.5) * 0.018;
      rPosX = 0.34;
      rPosY = -0.22 - airFloat * 0.6;
      rPosZ = -0.46;
      rRotX = isUnarmed ? -1.04 : -0.34;
      rRotY = isUnarmed ? -0.16 : 0.88;
      rRotZ = isUnarmed ? 0.28 : -0.92;
      if (isUnarmed) rightFingerPose = 'PARKOUR_OPEN';
      dampHz = 14;
    } else if (canMantle && !isSliding) {
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
            const punch = Math.sin(t * Math.PI);
            const wind = t < 0.2 ? Math.sin((t / 0.2) * Math.PI * 0.5) : 0;
            rightFingerPose = 'TIGHT_FIST';
            rightExertionStrain = 6 * punch;
            if (isForehand) {
              rPosX = THREE.MathUtils.lerp(rPosX, 0.05 + wind * 0.08, punch || wind * 0.5);
              rPosY = THREE.MathUtils.lerp(rPosY, -0.14 - wind * 0.03, punch || wind * 0.5);
              rPosZ = THREE.MathUtils.lerp(rPosZ, -0.74 + wind * 0.08, punch || wind * 0.5);
              rRotX = THREE.MathUtils.lerp(rRotX, -1.46, punch);
              rRotY = THREE.MathUtils.lerp(rRotY, -0.14, punch);
              rRotZ = THREE.MathUtils.lerp(rRotZ, 0.94, punch);
            } else {
              rPosX = 0.27;
              rPosY = -0.24;
              rPosZ = -0.44;
            }
          } else {
            const windEnd = this.animDuration * 0.22;
            const slashEnd = this.animDuration * 0.5;
            const recDur = Math.max(0.01, this.animDuration - slashEnd);

            // Phase 1: Wind-up over shoulder
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
          if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
          if (t < 0.42) {
            rPosX = 0.32;
            rPosY = -0.28;
            rPosZ = -0.38;
            rRotX = isUnarmed ? -1.12 : -0.25;
            rRotY = isUnarmed ? -0.2 : 0.85;
            rRotZ = isUnarmed ? 0.32 : -0.95;
          } else {
            const strike = (t - 0.42) / 0.58;
            const punch = Math.sin(strike * Math.PI);
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
          if (isUnarmed) rightFingerPose = 'TIGHT_FIST';
          if (t < 0.35) {
            const up = t / 0.35;
            rPosX = 0.18;
            rPosY = -0.12 + up * 0.24;
            rPosZ = -0.42;
            rRotX = isUnarmed ? -0.8 - up * 0.3 : -0.15;
            rRotY = isUnarmed ? -0.15 : 0.82;
            rRotZ = isUnarmed ? 0.25 : -1.1;
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
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'intro_ready') {
          dampHz = 12;
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
      rPosY += equipOffsetY;
      rPosZ += Math.abs(equipOffsetY) * 0.22;
      rRotX += equipOffsetY * 0.9;
      dampHz = Math.max(dampHz, 26);
    }

    // -------------------------------------------------------------------------
    // 5B. Awakening Cinematic Build-Up Override & MMB Head-Grab Capture Override
    // -------------------------------------------------------------------------
    if (awakeningPose?.active) {
      this.animState = 'idle';
      this.swingArcMat.opacity = 0;
      this.headGrabWhiffTime = -1;
      rPosX = awakeningPose.rightPosX;
      rPosY = awakeningPose.rightPosY;
      rPosZ = awakeningPose.rightPosZ;
      rRotX = awakeningPose.rightRotX;
      rRotY = awakeningPose.rightRotY;
      rRotZ = awakeningPose.rightRotZ;
      rightFingerPose = awakeningPose.rightPose;
      rightExertionStrain = awakeningPose.exertion;
      dampHz = 28;
    } else if (batFaceDriveActive) {
      this.animState = 'idle';
      this.swingArcMat.opacity = 0;
      this.headGrabWhiffTime = -1;

      const t = batFaceDriveTimer;
      if (t < 0.18) {
        // PHASE 1: Violent Wind-Up (0.00s -> 0.18s, fast cubic ease-out)
        const u = Math.min(1, t / 0.18);
        const ease = 1 - Math.pow(1 - u, 3);
        rPosX = THREE.MathUtils.lerp(0.38, 0.34, ease);
        rPosY = THREE.MathUtils.lerp(-0.1, -0.02, ease);
        rPosZ = THREE.MathUtils.lerp(-0.44, -0.3, ease);
        rRotX = THREE.MathUtils.lerp(-0.22, -1.15, ease);
        rRotY = THREE.MathUtils.lerp(1.05, 0.18, ease);
        rRotZ = THREE.MathUtils.lerp(-1.18, 0.12, ease);
        rightFingerPose = 'WEAPON_GRIP';
        rightExertionStrain = 10;
        dampHz = 45;
      } else if (t < 0.3) {
        // PHASE 2: Ramming Thrust into Mouth (0.18s -> 0.30s, exponential snap)
        const u = Math.min(1, (t - 0.18) / 0.12);
        const snap = (1 - Math.exp(-u * 6.5)) / (1 - Math.exp(-6.5));
        rPosX = THREE.MathUtils.lerp(0.34, 0.06, snap);
        rPosY = THREE.MathUtils.lerp(-0.02, 0.02, snap);
        rPosZ = THREE.MathUtils.lerp(-0.3, -0.68, snap);
        rRotX = THREE.MathUtils.lerp(-1.15, -1.32, snap);
        rRotY = THREE.MathUtils.lerp(0.18, 0.24, snap);
        rRotZ = THREE.MathUtils.lerp(0.12, 0.08, snap);
        rightFingerPose = 'WEAPON_GRIP';
        rightExertionStrain = 10;
        trailActive = true;
        dampHz = 62;
      } else if (t < 1.05) {
        // PHASE 3: Impaled Corpse Hold & Blood Drip Window (0.30s -> 1.05s)
        const impaleU = (t - 0.3) / 0.75;
        rPosX = 0.06;
        rPosY = 0.02 - impaleU * 0.015;
        rPosZ = -0.68;
        rRotX = -1.32;
        rRotY = 0.24;
        rRotZ = 0.08;
        rightFingerPose = 'WEAPON_GRIP';
        rightExertionStrain = 8;
        dampHz = 36;
      } else if (t < 1.22) {
        // PHASE 4a: Bat Yank Extraction (1.05s -> 1.22s)
        const u = Math.min(1, (t - 1.05) / 0.17);
        const yank = 1 - Math.pow(1 - u, 2);
        rPosX = THREE.MathUtils.lerp(0.06, 0.36, yank);
        rPosY = THREE.MathUtils.lerp(0.005, -0.24, yank);
        rPosZ = THREE.MathUtils.lerp(-0.68, -0.44, yank);
        rRotX = THREE.MathUtils.lerp(-1.32, -0.55, yank);
        rRotY = THREE.MathUtils.lerp(0.24, 0.72, yank);
        rRotZ = THREE.MathUtils.lerp(0.08, -0.78, yank);
        rightFingerPose = 'WEAPON_GRIP';
        rightExertionStrain = 10;
        trailActive = true;
        dampHz = 50;
      } else {
        // PHASE 4b: Smooth recovery to neutral combat stance (1.22s -> 1.35s)
        const u = Math.min(1, (t - 1.22) / 0.13);
        const rec = u * u * (3 - 2 * u);
        rPosX = THREE.MathUtils.lerp(0.36, rPosX, rec);
        rPosY = THREE.MathUtils.lerp(-0.24, rPosY, rec);
        rPosZ = THREE.MathUtils.lerp(-0.44, rPosZ, rec);
        rRotX = THREE.MathUtils.lerp(-0.55, rRotX, rec);
        rRotY = THREE.MathUtils.lerp(0.72, rRotY, rec);
        rRotZ = THREE.MathUtils.lerp(-0.78, rRotZ, rec);
        rightFingerPose = 'WEAPON_GRIP';
        rightExertionStrain = 2 * (1 - rec);
        dampHz = 24;
      }
    } else if (headGrabActive) {
      this.animState = 'idle';
      this.swingArcMat.opacity = 0;
      this.headGrabWhiffTime = -1;

      const reachU = Math.min(1, headGrabTimer / 0.18);
      const easeReach = 1 - Math.pow(1 - reachU, 3);

      // Right hand cocks bat/weapon back ready for lethal follow-up
      if (isUnarmed) {
        rPosX = THREE.MathUtils.lerp(rPosX, 0.36, easeReach);
        rPosY = THREE.MathUtils.lerp(rPosY, -0.14, easeReach);
        rPosZ = THREE.MathUtils.lerp(rPosZ, -0.42, easeReach);
        rRotX = THREE.MathUtils.lerp(rRotX, -1.04, easeReach);
        rRotY = THREE.MathUtils.lerp(rRotY, -0.28, easeReach);
        rRotZ = THREE.MathUtils.lerp(rRotZ, 0.34, easeReach);
        rightFingerPose = 'TIGHT_FIST';
      } else {
        rPosX = THREE.MathUtils.lerp(rPosX, 0.38, easeReach);
        rPosY = THREE.MathUtils.lerp(rPosY, -0.1, easeReach);
        rPosZ = THREE.MathUtils.lerp(rPosZ, -0.44, easeReach);
        rRotX = THREE.MathUtils.lerp(rRotX, -0.22, easeReach);
        rRotY = THREE.MathUtils.lerp(rRotY, 1.05, easeReach);
        rRotZ = THREE.MathUtils.lerp(rRotZ, -1.18, easeReach);
        rightFingerPose = 'WEAPON_GRIP';
      }
      rightExertionStrain = 7;
      dampHz = 34;
    } else if (this.headGrabWhiffTime >= 0) {
      this.headGrabWhiffTime += dt;
      if (this.headGrabWhiffTime / 0.3 >= 1) {
        this.headGrabWhiffTime = -1;
      }
    }

    // Apply anti-wall-clipping pullback tuck toward chest (disabled during world-space climb IK, Awakening, Head-Grab, & Finisher)
    if (
      this.curVmPullback > 0.01 &&
      climbState === 'NONE' &&
      !awakeningPose?.active &&
      !headGrabActive &&
      !batFaceDriveActive
    ) {
      const pb = this.curVmPullback;
      rPosZ += pb * 0.09;
      rPosX -= pb * 0.04;
      rRotX += pb * 0.32;
      rRotZ += pb * 0.18;
    }

    // -------------------------------------------------------------------------
    // D. Smooth Exponential Damping + 2-Bone Right Arm IK + Articulated Fingers
    // -------------------------------------------------------------------------
    const damp = 1 - Math.exp(-dampHz * dt);
    this.curRightPos.x = THREE.MathUtils.lerp(this.curRightPos.x, rPosX, damp);
    this.curRightPos.y = THREE.MathUtils.lerp(this.curRightPos.y, rPosY, damp);
    this.curRightPos.z = THREE.MathUtils.lerp(this.curRightPos.z, rPosZ, damp);
    this.curRightEuler.x = THREE.MathUtils.lerp(this.curRightEuler.x, rRotX, damp);
    this.curRightEuler.y = THREE.MathUtils.lerp(this.curRightEuler.y, rRotY, damp);
    this.curRightEuler.z = THREE.MathUtils.lerp(this.curRightEuler.z, rRotZ, damp);

    _rightEuler.copy(this.curRightEuler);
    _rightTargetQuat.setFromEuler(_rightEuler);
    _rightTargetPos.copy(this.curRightPos);

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

    const fingerDamp = 1 - Math.exp(-15 * dt);
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

    for (let i = 0; i < this.goreDropletPool.length; i++) {
      const g = this.goreDropletPool[i];
      if (g.life > 0) {
        g.life -= dt;
        g.vel.y -= 15 * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        if (g.mesh.position.y < 0.02) {
          g.mesh.position.y = 0.02;
          g.vel.set(0, 0, 0);
        }
        const ratio = Math.max(0, g.life / g.maxLife);
        (g.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(0.96, ratio * 1.4);
        if (g.life <= 0) g.mesh.visible = false;
      }
    }

    for (let i = 0; i < this.bloodDripPool.length; i++) {
      const d = this.bloodDripPool[i];
      if (d.active) {
        d.vel.y -= 14 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        if (d.mesh.position.y <= d.floorY + 0.02) {
          d.active = false;
          d.mesh.visible = false;
          this.spawnBloodPuddle(d.mesh.position.x, d.floorY, d.mesh.position.z);
        }
      }
    }

    for (let i = 0; i < this.spatterDroplets.length; i++) {
      const s = this.spatterDroplets[i];
      if (s.active) {
        s.life -= dt;
        s.vel.y -= 16 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.mesh.position.y <= s.floorY + 0.02) {
          s.active = false;
          s.mesh.visible = false;
          const speedH = Math.hypot(s.vel.x, s.vel.z);
          this.stampGroundBloodSpatter(
            s.mesh.position.x,
            s.floorY,
            s.mesh.position.z,
            s.vel.x,
            s.vel.z,
            0.34 + Math.random() * 0.34,
            1.1 + Math.min(1.1, speedH * 0.22),
            7.8 + Math.random() * 2.4,
          );
        } else if (s.life <= 0) {
          s.active = false;
          s.mesh.visible = false;
        }
      }
    }

    for (let i = 0; i < this.groundSpatters.length; i++) {
      const gs = this.groundSpatters[i];
      if (gs.life > 0) {
        gs.life -= dt;
        if (gs.life <= 0) {
          gs.life = 0;
          gs.mesh.visible = false;
          gs.mat.opacity = 0;
        } else {
          const ratio = gs.life / gs.maxLife;
          gs.mat.opacity = ratio < gs.fadeStartRatio ? (ratio / gs.fadeStartRatio) * 0.92 : 0.92;
        }
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

  private updateUnarmedViewmodel(
    dt: number,
    elapsed: number,
    horizSpeed: number,
    isSprinting: boolean,
    equipOffsetY: number,
  ): void {
    const cs = this.combatSystem;
    if (cs.comboChainTimer > 0) {
      cs.comboChainTimer = Math.max(0, cs.comboChainTimer - dt);
    }

    // Idle breathing bob & walk/sprint figure-8 sway
    const movingFactor = THREE.MathUtils.clamp(horizSpeed / 7.5, 0, 1.2);
    const breathY = Math.sin(elapsed * 2.2) * 0.004;
    const swayMult = isSprinting ? 1.35 : 1.0;
    const fig8X = Math.sin(elapsed * 9.5) * 0.015 * movingFactor * swayMult;
    const fig8Y = Math.abs(Math.cos(elapsed * 9.5)) * 0.01 * movingFactor * swayMult;

    // Guard Rest Poses (Orthodox)
    let lx = -0.26 + fig8X;
    let ly = -0.22 + breathY + fig8Y;
    let lz = -0.42;
    let lrx = 0.35;
    let lry = 0.25;
    let lrz = -0.15;

    let rx = 0.3 + fig8X * 0.85;
    let ry = -0.26 - breathY * 0.8 + fig8Y;
    let rz = -0.34;
    let rrx = 0.42;
    let rry = -0.3;
    let rrz = 0.2;

    if (cs.phase === 'HITSTOP') {
      cs.hitstopRemaining -= dt;
      if (cs.hitstopRemaining <= 0) {
        cs.hitstopRemaining = 0;
        cs.phase = cs.timer < 0.24 ? 'STRIKE' : 'RECOVERY';
      }
    } else if (cs.phase !== 'IDLE') {
      cs.timer += dt;
      const t = cs.timer;

      if (cs.comboStep === 1) {
        // Left Hook (0.54s total timeline: 0.00-0.11 WINDUP -> 0.11-0.24 STRIKE -> 0.24-0.54 RECOVERY)
        if (t < 0.11) {
          cs.phase = 'WINDUP';
          const u = Math.sin((t / 0.11) * (Math.PI * 0.5));
          lx = THREE.MathUtils.lerp(-0.26, -0.46, u);
          ly = THREE.MathUtils.lerp(-0.22, -0.15, u);
          lz = THREE.MathUtils.lerp(-0.42, -0.28, u);
          lrx = THREE.MathUtils.lerp(0.35, 0.12, u);
          lry = THREE.MathUtils.lerp(0.25, 0.72, u);
          lrz = THREE.MathUtils.lerp(-0.15, -1.15, u);
          rx = THREE.MathUtils.lerp(0.3, 0.34, u);
          ry = THREE.MathUtils.lerp(-0.26, -0.28, u);
          rz = THREE.MathUtils.lerp(-0.34, -0.3, u);
        } else if (t < 0.24) {
          cs.phase = 'STRIKE';
          const u = (t - 0.11) / 0.13;
          const arc = 1 - Math.pow(1 - u, 3);
          lx = THREE.MathUtils.lerp(-0.46, 0.1, arc);
          ly = THREE.MathUtils.lerp(-0.15, -0.16, arc);
          lz = THREE.MathUtils.lerp(-0.28, -0.44, arc) - Math.sin(u * Math.PI) * 0.08;
          lrx = THREE.MathUtils.lerp(0.12, -0.15, arc);
          lry = THREE.MathUtils.lerp(0.72, -0.95, arc);
          lrz = THREE.MathUtils.lerp(-1.15, -1.35, arc);
          rx = 0.34;
          ry = -0.28;
          rz = -0.3;

          if (!cs.impactFired && t >= 0.155) {
            cs.impactFired = true;
            cs.onImpact?.(1);
          }
        } else {
          cs.phase = 'RECOVERY';
          const u = Math.min(1, (t - 0.24) / 0.3);
          const rec = u * u * (3 - 2 * u);
          lx = THREE.MathUtils.lerp(0.1, -0.26, rec);
          ly = THREE.MathUtils.lerp(-0.16, -0.22 + breathY, rec);
          lz = THREE.MathUtils.lerp(-0.44, -0.42, rec);
          lrx = THREE.MathUtils.lerp(-0.15, 0.35, rec);
          lry = THREE.MathUtils.lerp(-0.95, 0.25, rec);
          lrz = THREE.MathUtils.lerp(-1.35, -0.15, rec);
          rx = THREE.MathUtils.lerp(0.34, 0.3, rec);
          ry = THREE.MathUtils.lerp(-0.28, -0.26 - breathY * 0.8, rec);
          rz = THREE.MathUtils.lerp(-0.3, -0.34, rec);
        }
      } else if (cs.comboStep === 2) {
        // Right Cross (0.52s)
        if (t < 0.1) {
          cs.phase = 'WINDUP';
          const u = Math.sin((t / 0.1) * (Math.PI * 0.5));
          rx = THREE.MathUtils.lerp(0.3, 0.38, u);
          ry = THREE.MathUtils.lerp(-0.26, -0.24, u);
          rz = THREE.MathUtils.lerp(-0.34, -0.22, u);
          rrx = THREE.MathUtils.lerp(0.42, 0.25, u);
          rry = THREE.MathUtils.lerp(-0.3, -0.42, u);
          rrz = THREE.MathUtils.lerp(0.2, 0.32, u);
          lx = -0.3;
          lz = -0.38;
        } else if (t < 0.23) {
          cs.phase = 'STRIKE';
          const u = (t - 0.1) / 0.13;
          const snap = 1 - Math.pow(1 - u, 3);
          rx = THREE.MathUtils.lerp(0.38, 0.02, snap);
          ry = THREE.MathUtils.lerp(-0.24, -0.15, snap);
          rz = THREE.MathUtils.lerp(-0.22, -0.56, snap);
          rrx = THREE.MathUtils.lerp(0.25, -0.12, snap);
          rry = THREE.MathUtils.lerp(-0.42, 0.35, snap);
          rrz = THREE.MathUtils.lerp(0.32, 0.95, snap);
          lx = -0.3;
          lz = -0.38;

          if (!cs.impactFired && t >= 0.15) {
            cs.impactFired = true;
            cs.onImpact?.(2);
          }
        } else {
          cs.phase = 'RECOVERY';
          const u = Math.min(1, (t - 0.23) / 0.29);
          const rec = u * u * (3 - 2 * u);
          rx = THREE.MathUtils.lerp(0.02, 0.3, rec);
          ry = THREE.MathUtils.lerp(-0.15, -0.26 - breathY * 0.8, rec);
          rz = THREE.MathUtils.lerp(-0.56, -0.34, rec);
          rrx = THREE.MathUtils.lerp(-0.12, 0.42, rec);
          rry = THREE.MathUtils.lerp(0.35, -0.3, rec);
          rrz = THREE.MathUtils.lerp(0.95, 0.2, rec);
          lx = THREE.MathUtils.lerp(-0.3, -0.26, rec);
          lz = THREE.MathUtils.lerp(-0.38, -0.42, rec);
        }
      } else {
        // Left Uppercut (0.56s)
        if (t < 0.11) {
          cs.phase = 'WINDUP';
          const u = Math.sin((t / 0.11) * (Math.PI * 0.5));
          lx = THREE.MathUtils.lerp(-0.26, -0.34, u);
          ly = THREE.MathUtils.lerp(-0.22, -0.36, u);
          lz = THREE.MathUtils.lerp(-0.42, -0.32, u);
          lrx = THREE.MathUtils.lerp(0.35, 0.65, u);
          lry = THREE.MathUtils.lerp(0.25, 0.15, u);
          lrz = THREE.MathUtils.lerp(-0.15, -0.25, u);
        } else if (t < 0.25) {
          cs.phase = 'STRIKE';
          const u = (t - 0.11) / 0.14;
          const snap = 1 - Math.pow(1 - u, 3);
          lx = THREE.MathUtils.lerp(-0.34, -0.04, snap);
          ly = THREE.MathUtils.lerp(-0.36, -0.06, snap);
          lz = THREE.MathUtils.lerp(-0.32, -0.48, snap);
          lrx = THREE.MathUtils.lerp(0.65, -0.62, snap);
          lry = THREE.MathUtils.lerp(0.15, -0.18, snap);
          lrz = THREE.MathUtils.lerp(-0.25, -0.35, snap);

          if (!cs.impactFired && t >= 0.16) {
            cs.impactFired = true;
            cs.onImpact?.(3);
          }
        } else {
          cs.phase = 'RECOVERY';
          const u = Math.min(1, (t - 0.25) / 0.31);
          const rec = u * u * (3 - 2 * u);
          lx = THREE.MathUtils.lerp(-0.04, -0.26, rec);
          ly = THREE.MathUtils.lerp(-0.06, -0.22 + breathY, rec);
          lz = THREE.MathUtils.lerp(-0.48, -0.42, rec);
          lrx = THREE.MathUtils.lerp(-0.62, 0.35, rec);
          lry = THREE.MathUtils.lerp(-0.18, 0.25, rec);
          lrz = THREE.MathUtils.lerp(-0.35, -0.15, rec);
        }
      }

      if (cs.timer >= cs.duration) {
        cs.phase = 'IDLE';
        cs.timer = 0;
        cs.comboChainTimer = 0.7;
        cs.onImpact = null;
        if (cs.queuedCombo) {
          cs.queuedCombo = false;
        }
      }
    }

    this.unarmedViewModel.position.set(0, equipOffsetY, 0);
    this.unarmedLeftArm.root.position.set(lx, ly, lz);
    this.unarmedLeftArm.root.rotation.set(lrx, lry, lrz);
    this.unarmedRightArm.root.position.set(rx, ry, rz);
    this.unarmedRightArm.root.rotation.set(rrx, rry, rrz);
  }

  public dispose(): void {
    this.camera.remove(this.viewmodelGroup);
    this.camera.remove(this.leftArmRoot);
    this.camera.remove(this.unarmedViewModel);
    this.camera.remove(this.leftLegPivot);
    this.camera.remove(this.rightLegPivot);
    this.camera.remove(this.ziplineHookPivot);
    this.camera.remove(this.swingArcMesh);
    this.scene.remove(this.shockwaveMesh);
    this.scene.remove(this.firecrackerLight);
    this.sparkPool.forEach((p) => this.scene.remove(p.mesh));
    this.bloodPool.forEach((b) => this.scene.remove(b.mesh));
    this.goreDropletPool.forEach((g) => this.scene.remove(g.mesh));
    this.bloodDripPool.forEach((d) => this.scene.remove(d.mesh));
    this.bloodPuddles.forEach((p) => this.scene.remove(p));
    this.bloodPuddles.length = 0;
    this.spatterDroplets.forEach((s) => this.scene.remove(s.mesh));
    this.groundSpatters.forEach((gs) => this.scene.remove(gs.mesh));
    this.dustPool.forEach((d) => this.scene.remove(d.mesh));
    this.activeFirecrackers.forEach((fc) => this.scene.remove(fc.mesh));
    this.disposables.forEach((d) => d.dispose());
  }
}
