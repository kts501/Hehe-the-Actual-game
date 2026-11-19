import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';

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

interface LeftFingerAngles {
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
    fingers: [LeftFingerAngles, LeftFingerAngles, LeftFingerAngles, LeftFingerAngles]; // Index, Middle, Ring, Pinky
    thumb: { cmcX: number; cmcY: number; cmcZ: number; mcp: number; ip: number };
  }
> = {
  RELAXED_IDLE: {
    fingers: [
      { mcp: 22, pip: 28, dip: 15, splay: -2.5 },
      { mcp: 28, pip: 34, dip: 18, splay: -0.5 },
      { mcp: 34, pip: 40, dip: 22, splay: 1.5 },
      { mcp: 40, pip: 45, dip: 25, splay: 3.5 },
    ],
    thumb: { cmcX: 20, cmcY: -22, cmcZ: -18, mcp: 14, ip: 12 },
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
const _leftPole = new THREE.Vector3(-0.62, -0.82, 0.24).normalize();
const _rightPole = new THREE.Vector3(0.62, -0.82, 0.24).normalize();
const _ikLeftLocal = new THREE.Vector3();
const _ikRightLocal = new THREE.Vector3();
const _ikReachVec = new THREE.Vector3();
const _ikLeftShoulder = new THREE.Vector3(-0.36, -0.5, 0.04);
const _ikRightShoulder = new THREE.Vector3(0.36, -0.5, 0.04);

const TRAIL_SEGMENTS = 14;

function smoothGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.computeVertexNormals();
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
  radialSegments = 16,
  capSegments = 8,
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
  private readonly batTipMarker = new THREE.Object3D();
  private readonly batThroatMarker = new THREE.Object3D();
  private readonly macheteGroup = new THREE.Group();
  private readonly pipeGroup = new THREE.Group();

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

  private activeWeapon: 'bat' | 'machete' | 'pipe' = 'bat';
  private animState: WeaponAnimState = 'idle';
  private animTime = 0;
  private animDuration = 0.44;
  private swingToggle = false;
  private shockwaveTime = -1;
  private kickTime = -1;
  private kickIsDropkick = false;

  // Smoothed Kinematic State
  private readonly curLeftPos = new THREE.Vector3(-0.26, -0.24, -0.38);
  private readonly curLeftEuler = new THREE.Euler(-1.12, 0.24, -0.18);
  private readonly curRightPos = new THREE.Vector3(0.28, -0.26, -0.4);
  private readonly curRightEuler = new THREE.Euler(0.25, -0.35, 0.22);
  private curVmRoll = 0;
  private curVmPullback = 0;
  private swayYawLag = 0;
  private swayPitchLag = 0;
  private readonly curLeftCurl = [22, 28, 34, 40];
  private readonly curLeftPip = [28, 34, 40, 45];
  private readonly curLeftDip = [15, 18, 22, 25];
  private readonly curLeftSplay = [-2.5, -0.5, 1.5, 3.5];
  private curThumbCmcX = 20;
  private curThumbCmcY = -22;
  private curThumbCmcZ = -18;
  private curThumbMcp = 14;
  private curThumbIp = 12;
  private curRightExertion = 0;

  private readonly upperArmLen = 0.34;
  private readonly forearmLen = 0.27;

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
    // MATERIALS (PBR Standard with procedural CanvasTextures)
    // =========================================================================
    const skinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.skinDetail,
        color: 0xffffff,
        roughness: 0.62,
        metalness: 0.02,
      }),
    );
    const nailMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe8c4b0,
        roughness: 0.32,
        metalness: 0.04,
      }),
    );
    const sleeveMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x353d30,
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    const gloveMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.tacticalGlove,
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.06,
      }),
    );
    const carbonPadMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262b33,
        roughness: 0.28,
        metalness: 0.46,
      }),
    );
    const wristWrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.wristWrapTape,
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.02,
      }),
    );
    const nylonStrapMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.tacticalGlove,
        color: 0x1a1d22,
        roughness: 0.72,
        metalness: 0.05,
      }),
    );
    const bezelMetalMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6c7480,
        roughness: 0.28,
        metalness: 0.86,
      }),
    );
    this.biomarkerLedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 2.1,
        roughness: 0.15,
        metalness: 0.1,
        toneMapped: false,
      }),
    );
    const watchFaceBackingMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x090e16,
        roughness: 0.22,
        metalness: 0.4,
      }),
    );

    const batWoodMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        color: 0xffffff,
        roughness: 0.56,
        metalness: 0.04,
      }),
    );
    const batGripMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.batGripTape,
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    const pommelMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        color: 0xa47748,
        roughness: 0.62,
        metalness: 0.04,
      }),
    );

    // Swappable weapon materials (machete / pipe)
    const leatherMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.82 }));
    const rustPipeMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x6b6f75,
        roughness: 0.56,
        metalness: 0.78,
      }),
    );
    const forgedBladeMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x454b54,
        roughness: 0.44,
        metalness: 0.82,
      }),
    );
    const edgeSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.2,
        metalness: 0.95,
      }),
    );
    const darkIronMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x292d34,
        roughness: 0.38,
        metalness: 0.88,
      }),
    );
    const copperWireMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.28,
        metalness: 0.85,
      }),
    );
    const bloodRustMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c2d12,
        roughness: 0.72,
        metalness: 0.25,
      }),
    );
    const jeanMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x394433,
        roughness: 0.88,
      }),
    );
    const bootMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x423830, roughness: 0.62 }));
    const soleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.92 }));

    // =========================================================================
    // 1. LEFT ARM SKELETAL RIG (Parkour & Dying Light Biomarker Hand)
    // =========================================================================
    this.leftShoulder.position.set(-0.36, -0.5, 0.04);
    this.viewmodelGroup.add(this.leftShoulder);

    // Upper Arm (rolled olive/charcoal athletic sleeve)
    const lUpperGeo = trackGeo(createTaperedLimbGeo(0.055, 0.052, 0.045, this.upperArmLen, 16, 8));
    const lUpperMesh = new THREE.Mesh(lUpperGeo, sleeveMat);
    lUpperMesh.scale.set(1.04, 1.0, 0.92);
    this.leftUpperArm.add(lUpperMesh);
    this.leftShoulder.add(this.leftUpperArm);

    // Forearm attached at elbow (0, upperArmLen, 0), tapering 0.042m -> 0.029m
    this.leftForearm.position.set(0, this.upperArmLen, 0);
    this.leftUpperArm.add(this.leftForearm);

    // Rolled sleeve segment covering proximal 0.11m of forearm + thick rolled cuff ring
    const lLowerSleeveGeo = trackGeo(createTaperedLimbGeo(0.046, 0.047, 0.044, 0.115, 16, 8));
    const lLowerSleeveMesh = new THREE.Mesh(lLowerSleeveGeo, sleeveMat);
    lLowerSleeveMesh.scale.set(1.06, 1.0, 0.88);
    this.leftForearm.add(lLowerSleeveMesh);

    const lRolledCuffGeo = trackGeo(smoothGeo(new THREE.TorusGeometry(0.043, 0.0095, 10, 16)));
    const lRolledCuff = new THREE.Mesh(lRolledCuffGeo, sleeveMat);
    lRolledCuff.rotation.x = Math.PI / 2;
    lRolledCuff.scale.set(1.06, 0.88, 1.0);
    lRolledCuff.position.y = 0.114;
    this.leftForearm.add(lRolledCuff);

    // Bare forearm tapering 0.042m -> 0.029m into wrist
    const lForearmSkinGeo = trackGeo(createTaperedLimbGeo(0.042, 0.039, 0.029, this.forearmLen - 0.095, 16, 8));
    const lForearmSkin = new THREE.Mesh(lForearmSkinGeo, skinMat);
    lForearmSkin.scale.set(1.06, 1.0, 0.84);
    lForearmSkin.position.y = 0.095;
    this.leftForearm.add(lForearmSkin);

    // Dying Light Biomarker Cuff wrapped around distal left wrist (y = 0.232m)
    const biomarkerGroup = new THREE.Group();
    biomarkerGroup.position.y = 0.232;
    this.leftForearm.add(biomarkerGroup);

    const nylonStrap = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0322, 0.0338, 0.038, 16, 2))),
      nylonStrapMat,
    );
    nylonStrap.scale.set(1.08, 1.0, 0.86);
    biomarkerGroup.add(nylonStrap);

    // Stitched strap trim ribs
    [-0.015, 0.015].forEach((ry) => {
      const rib = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.TorusGeometry(0.0332, 0.0022, 8, 16))),
        carbonPadMat,
      );
      rib.rotation.x = Math.PI / 2;
      rib.scale.set(1.08, 0.86, 1.0);
      rib.position.y = ry;
      biomarkerGroup.add(rib);
    });

    // Metallic Bezel & Glowing Biomarker LED Arc mounted on dorsal (+Z) side of wrist
    const bezelHousing = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.022, 0.0235, 0.012, 16))),
      bezelMetalMat,
    );
    bezelHousing.rotation.x = Math.PI / 2;
    bezelHousing.position.set(0.002, 0, 0.026);
    biomarkerGroup.add(bezelHousing);

    const dialBacking = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0175, 0.0175, 0.004, 16))),
      watchFaceBackingMat,
    );
    dialBacking.rotation.x = Math.PI / 2;
    dialBacking.position.set(0.002, 0, 0.0315);
    biomarkerGroup.add(dialBacking);

    const ledArc = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.0135, 0.0024, 8, 16, Math.PI * 1.45))),
      this.biomarkerLedMat,
    );
    ledArc.position.set(0.002, 0, 0.034);
    ledArc.rotation.z = Math.PI * 0.78;
    biomarkerGroup.add(ledArc);

    const ledCenterNode = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0036, 12, 8))),
      this.biomarkerLedMat,
    );
    ledCenterNode.scale.set(1.0, 1.0, 0.5);
    ledCenterNode.position.set(0.002, 0, 0.0342);
    biomarkerGroup.add(ledCenterNode);

    // Left Wrist Joint (smooth spherical connector so wrist never gaps when flexing)
    this.leftWrist.position.set(0, this.forearmLen, 0);
    this.leftForearm.add(this.leftWrist);

    const lWristJoint = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0285, 16, 10))),
      nylonStrapMat,
    );
    lWristJoint.scale.set(1.08, 0.78, 0.76);
    this.leftWrist.add(lWristJoint);

    // Left Palm (0.078m W x 0.024m T x 0.082m L) in fingerless tactical glove
    this.leftWrist.add(this.leftPalm);

    const lPalmGloveGeo = trackGeo(createTaperedLimbGeo(0.032, 0.0385, 0.039, 0.082, 16, 8));
    const lPalmMesh = new THREE.Mesh(lPalmGloveGeo, gloveMat);
    lPalmMesh.scale.set(1.0, 1.0, 0.31); // width ~0.078m, thickness ~0.024m, length 0.082m
    this.leftPalm.add(lPalmMesh);

    // Fingerless glove palm guard & thumb base reinforcement
    const lThenarPad = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.014, 0.032, 8, 16))),
      gloveMat,
    );
    lThenarPad.scale.set(1.0, 1.0, 0.65);
    lThenarPad.position.set(0.024, 0.026, -0.004);
    lThenarPad.rotation.z = -0.35;
    this.leftPalm.add(lThenarPad);

    // Raised molded carbon knuckle pads across dorsal (+Z) knuckle ridge
    [-0.027, -0.009, 0.009, 0.027].forEach((kx, idx) => {
      const ky = 0.076 - Math.abs(idx - 1.5) * 0.0025;
      const pad = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.0096, 12, 8))),
        carbonPadMat,
      );
      pad.scale.set(0.95, 0.85, 0.68);
      pad.position.set(kx, ky, 0.0115);
      this.leftPalm.add(pad);
    });
    const lKnuckleBridge = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.0068, 0.056, 8, 16))),
      carbonPadMat,
    );
    lKnuckleBridge.rotation.z = Math.PI / 2;
    lKnuckleBridge.scale.set(1.0, 1.0, 0.65);
    lKnuckleBridge.position.set(0, 0.075, 0.0105);
    this.leftPalm.add(lKnuckleBridge);

    // Left 4 Fingers (Index on +X -> Pinky on -X), each with MCP -> PIP -> DIP
    // Proximal phalanx is covered by fingerless glove; Middle + Distal phalanges are exposed skin + fingernail
    const leftFingerConfigs = [
      { x: 0.0275, y: 0.079, r0: 0.0086, len1: 0.034, len2: 0.023, len3: 0.018 }, // Index
      { x: 0.0092, y: 0.082, r0: 0.009, len1: 0.038, len2: 0.026, len3: 0.019 }, // Middle
      { x: -0.0092, y: 0.08, r0: 0.0084, len1: 0.035, len2: 0.024, len3: 0.018 }, // Ring
      { x: -0.0275, y: 0.075, r0: 0.0074, len1: 0.027, len2: 0.019, len3: 0.016 }, // Pinky
    ];

    leftFingerConfigs.forEach((fc) => {
      const mcp = new THREE.Group();
      mcp.position.set(fc.x, fc.y, 0);
      this.leftPalm.add(mcp);

      // Proximal phalanx (fingerless glove sleeve)
      const proxMesh = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fc.r0 * 1.04, fc.r0 * 0.96, fc.r0 * 0.88, fc.len1, 16, 8)),
        gloveMat,
      );
      mcp.add(proxMesh);

      const pip = new THREE.Group();
      pip.position.set(0, fc.len1, 0);
      mcp.add(pip);

      // Middle phalanx (exposed human skin)
      const midMesh = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fc.r0 * 0.84, fc.r0 * 0.78, fc.r0 * 0.72, fc.len2, 16, 8)),
        skinMat,
      );
      pip.add(midMesh);

      const dip = new THREE.Group();
      dip.position.set(0, fc.len2, 0);
      pip.add(dip);

      // Distal phalanx (exposed human skin + subtle fingernail on dorsal +Z tip)
      const distMesh = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fc.r0 * 0.72, fc.r0 * 0.66, fc.r0 * 0.52, fc.len3, 16, 8)),
        skinMat,
      );
      dip.add(distMesh);

      const nailMesh = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(fc.r0 * 0.56, 12, 8))),
        nailMat,
      );
      nailMesh.scale.set(0.9, 1.35, 0.35);
      nailMesh.position.set(0, fc.len3 * 0.68, fc.r0 * 0.44);
      dip.add(nailMesh);

      this.leftFingers.push({ mcp, pip, dip });
    });

    // Left Thumb (CMC -> MCP -> IP) with fingerless glove base and exposed skin tip + nail
    const lThumbCmc = new THREE.Group();
    lThumbCmc.position.set(0.034, 0.025, 0.001);
    this.leftPalm.add(lThumbCmc);

    const lThumbBaseMesh = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.0112, 0.0104, 0.0094, 0.026, 16, 8)),
      gloveMat,
    );
    lThumbCmc.add(lThumbBaseMesh);

    const lThumbMcp = new THREE.Group();
    lThumbMcp.position.set(0, 0.026, 0);
    lThumbCmc.add(lThumbMcp);

    const lThumbMidMesh = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.0092, 0.0086, 0.008, 0.024, 16, 8)),
      skinMat,
    );
    lThumbMcp.add(lThumbMidMesh);

    const lThumbIp = new THREE.Group();
    lThumbIp.position.set(0, 0.024, 0);
    lThumbMcp.add(lThumbIp);

    const lThumbTipMesh = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.008, 0.0074, 0.0058, 0.021, 16, 8)),
      skinMat,
    );
    lThumbIp.add(lThumbTipMesh);

    const lThumbNail = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0062, 12, 8))),
      nailMat,
    );
    lThumbNail.scale.set(0.95, 1.3, 0.35);
    lThumbNail.position.set(0, 0.014, 0.0052);
    lThumbIp.add(lThumbNail);

    this.leftThumb = { cmc: lThumbCmc, mcp: lThumbMcp, ip: lThumbIp };

    // =========================================================================
    // 2. RIGHT ARM SKELETAL RIG (Bare Forearm + Wrist-Wrap Tape + Bat Grip)
    // =========================================================================
    this.rightShoulder.position.set(0.36, -0.5, 0.04);
    this.viewmodelGroup.add(this.rightShoulder);

    // Upper Arm (rolled sleeve)
    const rUpperGeo = trackGeo(createTaperedLimbGeo(0.055, 0.052, 0.045, this.upperArmLen, 16, 8));
    const rUpperMesh = new THREE.Mesh(rUpperGeo, sleeveMat);
    rUpperMesh.scale.set(1.04, 1.0, 0.92);
    this.rightUpperArm.add(rUpperMesh);
    this.rightShoulder.add(this.rightUpperArm);

    // Bare Forearm attached at elbow (0, upperArmLen, 0), tapering 0.042m -> 0.029m
    this.rightForearm.position.set(0, this.upperArmLen, 0);
    this.rightUpperArm.add(this.rightForearm);

    const rForearmSleeve = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.046, 0.046, 0.044, 0.065, 16, 8)),
      sleeveMat,
    );
    rForearmSleeve.scale.set(1.06, 1.0, 0.88);
    this.rightForearm.add(rForearmSleeve);

    const rRolledCuff = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.043, 0.0085, 10, 16))),
      sleeveMat,
    );
    rRolledCuff.rotation.x = Math.PI / 2;
    rRolledCuff.scale.set(1.06, 0.88, 1.0);
    rRolledCuff.position.y = 0.064;
    this.rightForearm.add(rRolledCuff);

    const rForearmSkin = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.042, 0.039, 0.029, this.forearmLen - 0.055, 16, 8)),
      skinMat,
    );
    rForearmSkin.scale.set(1.06, 1.0, 0.84);
    rForearmSkin.position.y = 0.055;
    this.rightForearm.add(rForearmSkin);

    // Athletic white/grey diagonal cloth wrist-wrap tape around distal forearm & wrist (y = 0.19 .. 0.27)
    for (let w = 0; w < 4; w++) {
      const wrapRing = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CylinderGeometry(0.0308 - w * 0.0005, 0.0322 - w * 0.0005, 0.024, 16))),
        wristWrapMat,
      );
      wrapRing.scale.set(1.08, 1.0, 0.86);
      wrapRing.position.y = 0.198 + w * 0.019;
      wrapRing.rotation.z = w % 2 === 0 ? 0.045 : -0.045;
      this.rightForearm.add(wrapRing);
    }

    // Right Wrist Pivot + wrapped joint sphere
    this.rightWrist.position.set(0, this.forearmLen, 0);
    this.rightForearm.add(this.rightWrist);

    const rWristJoint = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0302, 16, 10))),
      wristWrapMat,
    );
    rWristJoint.scale.set(1.06, 0.82, 0.82);
    this.rightWrist.add(rWristJoint);

    // Right Palm oriented so bat grip center sits cleanly in the palm cradle
    // Palm heel connects to wrist at (0,0,0), palm body sits at +X/+Z side of the grip axis
    this.rightWrist.add(this.rightPalm);

    // Sculpted palm heel tape overlap + bare muscular palm (width 0.078m, thickness 0.024m, length 0.082m)
    const rPalmTapeBase = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.026, 0.029, 0.022, 16))),
      wristWrapMat,
    );
    rPalmTapeBase.scale.set(0.62, 1.0, 1.25);
    rPalmTapeBase.position.set(0.016, -0.022, 0.038);
    rPalmTapeBase.rotation.x = 0.35;
    this.rightPalm.add(rPalmTapeBase);

    const rPalmBody = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.028, 0.0385, 0.039, 0.082, 16, 8)),
      skinMat,
    );
    // Oriented from wrist (+Z) forward to knuckles (-Z), vertical height 0.078m along Y, thickness 0.024m along X
    rPalmBody.rotation.x = -Math.PI / 2;
    rPalmBody.scale.set(0.31, 1.0, 1.0);
    rPalmBody.position.set(0.022, 0.0, 0.048);
    this.rightPalm.add(rPalmBody);

    // Thenar muscle pad (thumb heel) on upper-inner palm
    const rThenarPad = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.013, 0.032, 8, 16))),
      skinMat,
    );
    rThenarPad.scale.set(0.72, 1.0, 1.0);
    rThenarPad.position.set(0.014, 0.026, 0.026);
    rThenarPad.rotation.set(1.15, 0.2, 0.15);
    this.rightPalm.add(rThenarPad);

    // Visible extensor tendons & knuckle domes on back (+X) of bare right hand
    [-0.0285, -0.0095, 0.0095, 0.0285].forEach((ty) => {
      const tendon = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.0028, 0.046, 6, 12))),
        skinMat,
      );
      tendon.rotation.x = Math.PI / 2;
      tendon.position.set(0.032, ty, 0.014);
      this.rightPalm.add(tendon);

      const knuckle = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.0072, 12, 8))),
        skinMat,
      );
      knuckle.scale.set(0.75, 1.0, 1.0);
      knuckle.position.set(0.028, ty, -0.016);
      this.rightPalm.add(knuckle);
    });

    // Right Weapon Socket at exact prompt grip offset: [0, -0.015, 0.01], tilted forward 18°
    this.rightWeaponSocket.position.set(0, -0.015, 0.01);
    this.rightWeaponSocket.rotation.set(-18 * DEG2RAD, 0, 0);
    this.rightPalm.add(this.rightWeaponSocket);

    // Right 4 Fingers staggered vertically by 0.019m along the tilted handle axis (Index top -> Pinky bottom)
    // Wrapping snugly around the 0.017m grip tape cylinder with ZERO intersection:
    // MCP: 78°, PIP: 85°, DIP: 55°
    const rightFingerFrame = new THREE.Group();
    rightFingerFrame.position.copy(this.rightWeaponSocket.position);
    rightFingerFrame.rotation.copy(this.rightWeaponSocket.rotation);
    this.rightPalm.add(rightFingerFrame);

    const rightFingerSpecs = [
      { y: 0.0435, r0: 0.0086, len1: 0.044, len2: 0.028, len3: 0.02 }, // Index (top)
      { y: 0.0245, r0: 0.009, len1: 0.046, len2: 0.029, len3: 0.021 }, // Middle
      { y: 0.0055, r0: 0.0084, len1: 0.044, len2: 0.027, len3: 0.02 }, // Ring
      { y: -0.0135, r0: 0.0075, len1: 0.039, len2: 0.024, len3: 0.018 }, // Pinky (bottom)
    ];

    rightFingerSpecs.forEach((fs) => {
      // Knuckle sits just outside grip radius (0.017 + 0.009 = 0.026m) at right-front quadrant (+0.025, -0.021)
      const mcp = new THREE.Group();
      mcp.position.set(0.025, fs.y, -0.021);
      // Local +Y points along tangent around bat; rotating around Z/Y wraps in (X, Z) plane around +Y bat!
      // Orient mcp so its +Y points forward (-Z) tilted 14° out (+X), then rotate +78° around +Y toward -X!
      mcp.rotation.order = 'YXZ';
      mcp.rotation.x = -Math.PI / 2; // +Y becomes -Z forward
      mcp.rotation.y = (78 - 12) * DEG2RAD; // curls inward across front of 0.017m grip cylinder
      rightFingerFrame.add(mcp);

      const prox = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fs.r0, fs.r0 * 0.92, fs.r0 * 0.85, fs.len1, 16, 8)),
        skinMat,
      );
      mcp.add(prox);

      const pip = new THREE.Group();
      pip.position.set(0, fs.len1, 0);
      pip.rotation.z = 85 * DEG2RAD; // bends inward around -X side of cylinder
      mcp.add(pip);

      const mid = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fs.r0 * 0.84, fs.r0 * 0.78, fs.r0 * 0.72, fs.len2, 16, 8)),
        skinMat,
      );
      pip.add(mid);

      const dip = new THREE.Group();
      dip.position.set(0, fs.len2, 0);
      dip.rotation.z = 55 * DEG2RAD; // tucks cleanly onto +Z/-X side of grip tape
      pip.add(dip);

      const dist = new THREE.Mesh(
        trackGeo(createTaperedLimbGeo(fs.r0 * 0.71, fs.r0 * 0.64, fs.r0 * 0.52, fs.len3, 16, 8)),
        skinMat,
      );
      dip.add(dist);

      const nail = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(fs.r0 * 0.54, 12, 8))),
        nailMat,
      );
      nail.scale.set(0.45, 1.3, 0.9);
      nail.position.set(fs.r0 * 0.42, fs.len3 * 0.68, 0);
      dip.add(nail);

      this.rightFingers.push({ mcp, pip, dip });
    });

    // Right Thumb: CMC rotated inward 55° around the outer handle perimeter above Index
    const rThumbCmc = new THREE.Group();
    rThumbCmc.position.set(0.022, 0.054, 0.018);
    rThumbCmc.rotation.order = 'YXZ';
    rThumbCmc.rotation.x = -Math.PI * 0.44;
    rThumbCmc.rotation.y = (180 - 55) * DEG2RAD;
    rightFingerFrame.add(rThumbCmc);

    const rThumbProx = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.011, 0.01, 0.0092, 0.028, 16, 8)),
      skinMat,
    );
    rThumbCmc.add(rThumbProx);

    const rThumbMcp = new THREE.Group();
    rThumbMcp.position.set(0, 0.028, 0);
    rThumbMcp.rotation.z = -52 * DEG2RAD;
    rThumbCmc.add(rThumbMcp);

    const rThumbMid = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.0092, 0.0086, 0.0078, 0.024, 16, 8)),
      skinMat,
    );
    rThumbMcp.add(rThumbMid);

    const rThumbIp = new THREE.Group();
    rThumbIp.position.set(0, 0.024, 0);
    rThumbIp.rotation.z = -46 * DEG2RAD;
    rThumbMcp.add(rThumbIp);

    const rThumbDist = new THREE.Mesh(
      trackGeo(createTaperedLimbGeo(0.0078, 0.0072, 0.0056, 0.021, 16, 8)),
      skinMat,
    );
    rThumbIp.add(rThumbDist);

    const rThumbNail = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.0058, 12, 8))),
      nailMat,
    );
    rThumbNail.scale.set(0.45, 1.3, 0.9);
    rThumbNail.position.set(-0.0046, 0.014, 0);
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
    const batBarrel = new THREE.Mesh(trackGeo(smoothGeo(new THREE.LatheGeometry(barrelProfile, 16))), batWoodMat);
    this.batGroup.add(batBarrel);

    // Markers for procedural swing motion-trail ribbon
    this.batThroatMarker.position.set(0, 0.26, 0);
    this.batTipMarker.position.set(0, 0.67, 0);
    this.batGroup.add(this.batThroatMarker);
    this.batGroup.add(this.batTipMarker);

    // --- Swappable Weapon 1: Serrated Post-Apocalyptic Scrap Machete ---
    this.macheteGroup.rotation.set(0.32, -0.1, 0.05);
    this.macheteGroup.position.set(0, 0.0, 0);
    this.macheteGroup.visible = false;
    this.rightWeaponSocket.add(this.macheteGroup);

    const hilt = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.2, 12)), leatherMat);
    hilt.position.y = 0.01;
    this.macheteGroup.add(hilt);

    const guard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.034, 0.022, 0.092)), darkIronMat);
    guard.position.y = 0.11;
    this.macheteGroup.add(guard);

    const bladeBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.011, 0.56, 0.056)), forgedBladeMat);
    bladeBody.position.set(0, 0.4, -0.01);
    bladeBody.rotation.x = 0.04;
    this.macheteGroup.add(bladeBody);

    const cuttingEdge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.005, 0.56, 0.016)), edgeSteelMat);
    cuttingEdge.position.set(0, 0.4, -0.042);
    cuttingEdge.rotation.x = 0.04;
    this.macheteGroup.add(cuttingEdge);

    const bladeTip = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.03, 0.12, 4)), edgeSteelMat);
    bladeTip.position.set(0, 0.72, -0.03);
    bladeTip.rotation.y = Math.PI / 4;
    bladeTip.rotation.x = -0.18;
    this.macheteGroup.add(bladeTip);

    const sawToothGeo = trackGeo(new THREE.ConeGeometry(0.014, 0.032, 4));
    for (let s = 0; s < 5; s++) {
      const tooth = new THREE.Mesh(sawToothGeo, darkIronMat);
      tooth.position.set(0, 0.18 + s * 0.072, 0.024 - s * 0.002);
      tooth.rotation.x = Math.PI / 2 - 0.35;
      this.macheteGroup.add(tooth);
    }

    // --- Swappable Weapon 2: Rusted Cloth-Wrapped & Wired Lead Pipe ---
    this.pipeGroup.rotation.set(0.08, 0, 0);
    this.pipeGroup.visible = false;
    this.rightWeaponSocket.add(this.pipeGroup);

    const shaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.017, 0.018, 0.66, 12)), rustPipeMat);
    shaft.position.y = 0.22;
    this.pipeGroup.add(shaft);

    const pipePommel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.036, 10)), darkIronMat);
    pipePommel.position.y = -0.12;
    this.pipeGroup.add(pipePommel);

    const collar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.052, 8)), darkIronMat);
    collar.position.y = 0.44;
    this.pipeGroup.add(collar);

    [0.34, 0.38, 0.49].forEach((cy) => {
      const coil = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.022, 0.0045, 6, 14)), copperWireMat);
      coil.rotation.x = Math.PI / 2 + 0.15;
      coil.position.y = cy;
      this.pipeGroup.add(coil);
    });

    const pipeHead = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 12)), darkIronMat);
    pipeHead.rotation.z = Math.PI / 2;
    pipeHead.position.set(0.02, 0.56, 0);
    this.pipeGroup.add(pipeHead);

    const flange = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.026, 12)), bloodRustMat);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(-0.042, 0.56, 0);
    this.pipeGroup.add(flange);

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

    // Prevent floating shadows from viewmodel onto close walls
    this.viewmodelGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });

    // Solve initial pose so first frame starts clean
    this.applyLeftFingerAngles(0, 1, 'RELAXED_IDLE');
    this.solveArmPose(
      this.leftShoulder,
      this.leftUpperArm,
      this.leftForearm,
      this.leftWrist,
      new THREE.Vector3(-0.36, -0.5, 0.04),
      this.curLeftPos,
      _leftTargetQuat.setFromEuler(this.curLeftEuler),
      _leftPole,
    );
    this.solveArmPose(
      this.rightShoulder,
      this.rightUpperArm,
      this.rightForearm,
      this.rightWrist,
      new THREE.Vector3(0.36, -0.5, 0.04),
      this.curRightPos,
      _rightTargetQuat.setFromEuler(this.curRightEuler),
      _rightPole,
    );
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

  private applyRightFingerExertion(targetStrainDeg: number, damp: number): void {
    this.curRightExertion = THREE.MathUtils.lerp(this.curRightExertion, targetStrainDeg, damp);
    for (let i = 0; i < this.rightFingers.length; i++) {
      const f = this.rightFingers[i];
      f.mcp.rotation.y = (66 + this.curRightExertion * 0.8) * DEG2RAD;
      f.pip.rotation.z = (85 + this.curRightExertion) * DEG2RAD;
      f.dip.rotation.z = (55 + this.curRightExertion * 0.7) * DEG2RAD;
    }
    this.rightThumb.mcp.rotation.z = (-52 - this.curRightExertion * 0.6) * DEG2RAD;
    this.rightThumb.ip.rotation.z = (-46 - this.curRightExertion * 0.5) * DEG2RAD;
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

  public setWeapon(weapon: 'bat' | 'machete' | 'pipe'): void {
    this.activeWeapon = weapon;
    this.batGroup.visible = weapon === 'bat';
    this.macheteGroup.visible = weapon === 'machete';
    this.pipeGroup.visible = weapon === 'pipe';
  }

  public getWeapon(): 'bat' | 'machete' | 'pipe' {
    return this.activeWeapon;
  }

  public triggerSwing(): void {
    this.swingToggle = !this.swingToggle;
    this.animState = this.swingToggle ? 'swing_left' : 'swing_right';
    this.animTime = 0;
    this.animDuration = 0.44; // 0.10s windup + 0.12s slash + 0.22s follow-through
    this.swingArcMat.color.setHex(0xfef08a);
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

    // -------------------------------------------------------------------------
    // A. Biomarker LED State (#00f0ff Day/Safe Zone, Pulsing #ff3b1f Night)
    // -------------------------------------------------------------------------
    if (this.animState === 'intro_ready') {
      // Two bright cyan pulses synced with the 2 electronic chirps at animTime ~0.55s & ~1.05s
      const p1 = Math.exp(-Math.pow((this.animTime - 0.55) / 0.14, 2));
      const p2 = Math.exp(-Math.pow((this.animTime - 1.05) / 0.14, 2));
      this.biomarkerLedMat.color.setHex(0x00f0ff);
      this.biomarkerLedMat.emissive.setHex(0x00f0ff);
      this.biomarkerLedMat.emissiveIntensity = 1.9 + Math.max(p1, p2) * 3.2;
    } else if (isNight && !inSafeZone) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 5.2);
      this.biomarkerLedMat.color.setHex(0xff3b1f);
      this.biomarkerLedMat.emissive.setHex(0xff3b1f);
      this.biomarkerLedMat.emissiveIntensity = 1.2 + pulse * 2.4;
    } else {
      const steadyBreath = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 1.4);
      this.biomarkerLedMat.color.setHex(0x00f0ff);
      this.biomarkerLedMat.emissive.setHex(0x00f0ff);
      this.biomarkerLedMat.emissiveIntensity = 1.85 + steadyBreath * 0.45;
    }

    // -------------------------------------------------------------------------
    // B. Mouse-look Rotational Spring Lag (±0.08 rad max) + Anti-Wall Pullback
    // -------------------------------------------------------------------------
    if (climbState === 'MUSCLE_UP') {
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

      const targetVmRoll = isSliding ? -6 * DEG2RAD : -strafeInput * 0.028;
      this.curVmRoll = THREE.MathUtils.lerp(this.curVmRoll, targetVmRoll, 1 - Math.exp(-14 * dt));
      this.curVmPullback = THREE.MathUtils.lerp(this.curVmPullback, wallPullback, 1 - Math.exp(-16 * dt));

      this.viewmodelGroup.position.set(0, -this.curVmPullback * 0.04, this.curVmPullback * 0.16);
      this.viewmodelGroup.rotation.set(this.swayPitchLag * 0.45, this.swayYawLag * 0.55, this.curVmRoll);
    }

    // -------------------------------------------------------------------------
    // C. Dual-Frequency Breathing (0.38 Hz + 0.76 Hz) & Locomotion Offsets
    // -------------------------------------------------------------------------
    const breathPrimary = Math.sin(elapsed * Math.PI * 2 * 0.38);
    const breathWrist = Math.sin(elapsed * Math.PI * 2 * 0.76 + 0.4);
    const isMoving = horizSpeed >= 0.5;

    // 1. Default Idle & Breathing Target Poses (Exact Prompt Coordinates)
    let rPosX = 0.28 + breathWrist * 0.002 + this.swayYawLag * 0.16;
    let rPosY = -0.26 + breathPrimary * 0.005 + breathWrist * 0.0018 - this.swayPitchLag * 0.14;
    let rPosZ = -0.4 + breathPrimary * 0.002;
    let rRotX = 0.25 + breathPrimary * 0.015 + this.swayPitchLag * 0.65;
    let rRotY = -0.35 + breathWrist * 0.014 + this.swayYawLag * 0.65;
    let rRotZ = 0.22 - strafeInput * 0.055;

    let lPosX = -0.26 - breathWrist * 0.002 + this.swayYawLag * 0.12;
    let lPosY = -0.24 + breathPrimary * 0.0055 - breathWrist * 0.0015 - this.swayPitchLag * 0.12;
    let lPosZ = -0.38 + breathPrimary * 0.002;
    // Left palm local +Y forward (-Z), +Z dorsal up (+Y): rotX = -1.12 aims hand forward with biomarker/knuckles visible
    let lRotX = -1.12 + breathPrimary * 0.018 + this.swayPitchLag * 0.5;
    let lRotY = 0.24 + breathWrist * 0.012 + this.swayYawLag * 0.5;
    let lRotZ = -0.18 - strafeInput * 0.06;

    let leftFingerPose: LeftHandPose = 'RELAXED_IDLE';
    let rightExertionStrain = 0;
    let dampHz = 14;

    // 2. Walking & Sprinting
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
        // Sprinting: 14 Hz left-arm pump across lower FOV, right arm pulls bat high-ready across chest/shoulder
        const pumpSin = Math.sin(elapsed * 14);
        const pumpCos = Math.cos(elapsed * 14);
        lPosX = -0.24 - camBobX * 0.4 + pumpSin * 0.042;
        lPosY = -0.22 - camBobY * 0.4 + pumpCos * 0.048;
        lPosZ = -0.42 - pumpSin * 0.072;
        lRotX = -1.04 + pumpSin * 0.18;
        lRotY = 0.34 + pumpCos * 0.08;
        lRotZ = -0.24;

        rPosX = 0.22 - camBobX * 0.35 + pumpCos * 0.016;
        rPosY = -0.2 - camBobY * 0.35 + Math.abs(pumpSin) * -0.018;
        rPosZ = -0.34 - pumpCos * 0.02;
        rRotX = 0.55 + pumpSin * 0.045;
        rRotY = -0.65 + pumpCos * 0.035;
        rRotZ = 0.45 - strafeInput * 0.05;
      } else {
        // Walking: 1:1 counter-swing synced to camera head-bob
        const walkFactor = THREE.MathUtils.clamp(moveSpeedRatio, 0, 1);
        const walkPhase = elapsed * 9;
        rPosX += -camBobX * 0.5 + Math.cos(walkPhase * 0.5) * 0.012 * walkFactor;
        rPosY += -camBobY * 0.5 - Math.abs(Math.sin(walkPhase)) * 0.012 * walkFactor;
        rPosZ += Math.sin(walkPhase) * 0.016 * walkFactor;
        rRotX += Math.sin(walkPhase) * 0.03 * walkFactor;

        lPosX += -camBobX * 0.5 - Math.cos(walkPhase * 0.5) * 0.012 * walkFactor;
        lPosY += -camBobY * 0.5 + Math.abs(Math.sin(walkPhase)) * 0.012 * walkFactor;
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
      rPosZ = -0.28;
      rRotX = -0.3;
      rRotY = -0.4;
      rRotZ = 0.6;
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
      rPosZ = -0.32;
      rRotX = -0.55;
      rRotY = -0.45;
      rRotZ = 0.65;
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

        rPosX = 0.28;
        rPosY = -0.24 + Math.cos(elapsed * 16) * 0.022;
        rPosZ = -0.36;
        rRotX = 0.38;
        rRotY = -0.45;
        rRotZ = 0.32;
      } else {
        lPosX = -0.26;
        lPosY = -0.22 + Math.cos(elapsed * 16) * 0.026;
        lPosZ = -0.42;
        lRotX = -1.05;
        rPosX = 0.26;
        rPosY = -0.2 + Math.sin(elapsed * 16) * 0.022;
        rPosZ = -0.35;
        rRotX = 0.45;
        rRotY = -0.55;
        rRotZ = 0.38;
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

      rPosX = 0.16 + zipSway;
      rPosY = 0.13 + zipBuzz;
      rPosZ = -0.42;
      rRotX = -0.45;
      rRotY = 0.12;
      rRotZ = 0.18 - zipSway * 1.4;
      dampHz = 18;
    } else if (isVaulting) {
      // Speed Vault: Left hand plants flat (70° wrist extension!) onto obstacle top surface; right tucks bat by hip
      const plantArc = Math.sin(vaultProgress * Math.PI);
      lPosX = -0.18;
      lPosY = -0.22 - plantArc * 0.09;
      lPosZ = -0.5 - plantArc * 0.06;
      // 70 deg wrist extension tilts hand upward from downward-reaching forearm so palm lands flat on obstacle
      lRotX = -1.45 + 70 * DEG2RAD * plantArc;
      lRotY = 0.12;
      lRotZ = 0.05;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.34;
      rPosY = -0.36;
      rPosZ = -0.3;
      rRotX = -0.25;
      rRotY = -0.35;
      rRotZ = 0.48;
      dampHz = 18;
    } else if (climbState === 'WALL_SCRAMBLE') {
      // Rapid 1-step upward wall-scramble reach with splayed fingers + bat angled safely outside wall
      const wave = Math.sin(climbPhaseTime * 24) * scrambleSide;
      lPosX = -0.22;
      lPosY = -0.05 + wave * 0.11;
      lPosZ = -0.46;
      lRotX = -1.42;
      lRotY = 0.14;
      lRotZ = -0.1;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.27;
      rPosY = -0.11 - wave * 0.1;
      rPosZ = -0.41;
      rRotX = 0.12;
      rRotY = -0.86;
      rRotZ = 0.78;
      rightExertionStrain = -4;
      dampHz = 24;
    } else if (climbState === 'MUSCLE_UP' || isMantling) {
      // 3-Phase World-Space IK Ledge Catch, Pull-Up & Rooftop Mantle
      if (climbState === 'MUSCLE_UP' && leftGripWorld && rightGripWorld) {
        if (climbPhaseTime < 0.42) {
          // Convert world-space ledge grip anchors into viewmodelGroup space for rock-steady IK lock
          this.camera.updateMatrixWorld(true);
          this.viewmodelGroup.updateMatrixWorld(true);
          _ikLeftLocal.copy(leftGripWorld);
          this.viewmodelGroup.worldToLocal(_ikLeftLocal);
          _ikRightLocal.copy(rightGripWorld);
          this.viewmodelGroup.worldToLocal(_ikRightLocal);

          // Offset palm heel slightly back toward camera (+0.025z, +0.015y) and clamp safely within arm reach (0.72m)
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
          // 0.00s–0.06s OPEN_REACH splayed fingers slap lip -> 0.06s–0.42s LEDGE_CLAMP crimp hook
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

          // Right hand holds bat angled outward/parallel along the ledge edge so barrel never clips wall
          rPosX = _ikRightLocal.x - tremor;
          rPosY = _ikRightLocal.y + tremor * 0.7;
          rPosZ = _ikRightLocal.z;
          rRotX = -0.34 + pullU * 0.18;
          rRotY = -1.16;
          rRotZ = 0.96;
          rightExertionStrain = climbPhaseTime >= 0.14 ? 8 * Math.sin(pullU * Math.PI) : -3;
          dampHz = 30;
        } else {
          // Phase 3 (0.42s - 0.62s): Hip-heave PALM_PRESS push-off transitioning smoothly into ready carry pose
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
            rPosZ = THREE.MathUtils.lerp(-0.4, -0.35, press);
            rRotX = -0.24;
            rRotY = -0.82;
            rRotZ = 0.72;
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

            rPosX = THREE.MathUtils.lerp(0.28, 0.26, sRec);
            rPosY = THREE.MathUtils.lerp(-0.36, -0.24, sRec);
            rPosZ = THREE.MathUtils.lerp(-0.35, -0.38, sRec);
            rRotX = THREE.MathUtils.lerp(-0.24, 0.3, sRec);
            rRotY = THREE.MathUtils.lerp(-0.82, -0.4, sRec);
            rRotZ = THREE.MathUtils.lerp(0.72, 0.26, sRec);
            rightExertionStrain = 0;
          }
          dampHz = 22;
        }
      } else {
        // Legacy fallback mantle curve
        if (mantleProgress < 0.24) {
          const reach = mantleProgress / 0.24;
          lPosX = THREE.MathUtils.lerp(-0.26, -0.2, reach);
          lPosY = THREE.MathUtils.lerp(-0.22, -0.04, reach);
          lPosZ = THREE.MathUtils.lerp(-0.42, -0.56, reach);
          lRotX = THREE.MathUtils.lerp(-1.1, -1.55, reach);
          leftFingerPose = reach > 0.65 ? 'LEDGE_CLAMP' : 'OPEN_REACH';

          rPosX = THREE.MathUtils.lerp(0.28, 0.22, reach);
          rPosY = THREE.MathUtils.lerp(-0.24, -0.06, reach);
          rPosZ = THREE.MathUtils.lerp(-0.4, -0.54, reach);
          rRotX = THREE.MathUtils.lerp(0.25, -0.35, reach);
          rRotY = -1.1;
          rRotZ = 0.9;
        } else {
          const pull = (mantleProgress - 0.24) / 0.76;
          lPosX = THREE.MathUtils.lerp(-0.2, -0.28, pull);
          lPosY = THREE.MathUtils.lerp(-0.04, -0.38, pull);
          lPosZ = THREE.MathUtils.lerp(-0.56, -0.36, pull);
          lRotX = THREE.MathUtils.lerp(-1.55, -0.95, pull);
          leftFingerPose = pull > 0.65 ? 'PALM_PRESS' : 'LEDGE_CLAMP';

          rPosX = THREE.MathUtils.lerp(0.22, 0.3, pull);
          rPosY = THREE.MathUtils.lerp(-0.06, -0.36, pull);
          rPosZ = THREE.MathUtils.lerp(-0.54, -0.35, pull);
          rRotX = THREE.MathUtils.lerp(-0.35, 0.15, pull);
          rRotY = -0.45;
          rRotZ = 0.34;
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
      rPosY = -0.22;
      rPosZ = -0.42;
      rRotZ = 0.45;
      dampHz = 16;
    } else if (isAirborne && !isSliding) {
      // Jumping / Airborne: flare arms subtly for balance, splayed OPEN_REACH fingers
      const airFloat = Math.sin(elapsed * 6.5) * 0.018;
      lPosX = -0.31;
      lPosY = -0.19 + airFloat;
      lPosZ = -0.43;
      lRotX = -1.02;
      lRotY = 0.18;
      lRotZ = -0.28;
      leftFingerPose = 'OPEN_REACH';

      rPosX = 0.32;
      rPosY = -0.21 - airFloat * 0.6;
      rPosZ = -0.41;
      rRotX = 0.18;
      rRotY = -0.28;
      rRotZ = 0.34;
      dampHz = 14;
    } else if (canMantle && !isSliding) {
      // Pre-reach cue near climbable ledge
      lPosX = -0.28;
      lPosY = -0.18;
      lPosZ = -0.46;
      lRotX = -1.2;
      leftFingerPose = 'OPEN_REACH';
    }

    if (!isZiplining) {
      this.ziplineHookPivot.visible = false;
    }

    // -------------------------------------------------------------------------
    // 5. Combat Swings (3-phase), Arkham Counter, Takedown & [B]/[I] Inspect
    // -------------------------------------------------------------------------
    let trailActive = false;
    if (this.animState !== 'idle' && !isZiplining && !isMantling && climbState === 'NONE' && !isVaulting) {
      // Cancel inspect immediately if player moves into combat or parkour slide
      if (this.animState === 'inspect' && (isSliding || isAirborne)) {
        this.animState = 'idle';
      } else {
        this.animTime += dt;
        const t = Math.min(1, this.animTime / this.animDuration);

        if (this.animState === 'swing_left' || this.animState === 'swing_right') {
          const isForehand = this.animState === 'swing_left';
          const dirSign = isForehand ? 1 : -1;
          dampHz = 22;

          // Phase 1: 0.00s -> 0.10s Wind-up over right shoulder + left forearm guard
          if (this.animTime < 0.1) {
            const w = this.animTime / 0.1;
            const easeW = Math.sin(w * Math.PI * 0.5);
            rPosX = THREE.MathUtils.lerp(rPosX, isForehand ? 0.38 : -0.05, easeW);
            rPosY = THREE.MathUtils.lerp(rPosY, -0.06, easeW);
            rPosZ = THREE.MathUtils.lerp(rPosZ, -0.32, easeW);
            rRotX = THREE.MathUtils.lerp(rRotX, 0.65, easeW);
            rRotY = THREE.MathUtils.lerp(rRotY, isForehand ? -0.85 : 0.72, easeW);
            rRotZ = THREE.MathUtils.lerp(rRotZ, isForehand ? -0.52 : 0.68, easeW);

            lPosX = THREE.MathUtils.lerp(lPosX, -0.18, easeW);
            lPosY = THREE.MathUtils.lerp(lPosY, -0.18, easeW);
            lPosZ = THREE.MathUtils.lerp(lPosZ, -0.44, easeW);
            lRotX = THREE.MathUtils.lerp(lRotX, -1.25, easeW);
            lRotZ = THREE.MathUtils.lerp(lRotZ, 0.32, easeW);
            leftFingerPose = 'FIST_CLENCH';
          } else if (this.animTime < 0.22) {
            // Phase 2: 0.10s -> 0.22s Explosive Diagonal Slash + Motion-Trail Mesh
            const s = (this.animTime - 0.1) / 0.12;
            const slash = s * s * (3 - 2 * s);
            trailActive = true;

            rPosX = THREE.MathUtils.lerp(isForehand ? 0.38 : -0.05, isForehand ? -0.26 : 0.34, slash);
            rPosY = THREE.MathUtils.lerp(-0.06, -0.26, slash);
            rPosZ = -0.48 - Math.sin(slash * Math.PI) * 0.1;
            rRotX = THREE.MathUtils.lerp(0.65, -0.85, slash);
            rRotY = THREE.MathUtils.lerp(isForehand ? -0.85 : 0.72, isForehand ? 1.15 : -0.95, slash);
            rRotZ = THREE.MathUtils.lerp(isForehand ? -0.52 : 0.68, dirSign * 1.12, slash);

            lPosX = -0.22 - slash * 0.08;
            lPosY = -0.22;
            lPosZ = -0.38;
            lRotX = -1.1;
            lRotZ = 0.25;
            leftFingerPose = 'FIST_CLENCH';
          } else {
            // Phase 3: 0.22s -> 0.44s Follow-through & smooth recovery
            const rec = (this.animTime - 0.22) / 0.22;
            const easeR = 1 - Math.pow(1 - rec, 2);
            dampHz = 14;
            rPosX = THREE.MathUtils.lerp(isForehand ? -0.26 : 0.34, rPosX, easeR);
            rPosY = THREE.MathUtils.lerp(-0.26, rPosY, easeR);
            rPosZ = THREE.MathUtils.lerp(-0.48, rPosZ, easeR);
            rRotX = THREE.MathUtils.lerp(-0.85, rRotX, easeR);
            rRotY = THREE.MathUtils.lerp(isForehand ? 1.15 : -0.95, rRotY, easeR);
            rRotZ = THREE.MathUtils.lerp(dirSign * 1.12, rRotZ, easeR);
          }
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'parry') {
          // Arkham Counter: Left forearm snaps horizontally across chest (FIST_CLENCH) + upward bat-pommel/elbow strike
          dampHz = 20;
          leftFingerPose = 'FIST_CLENCH';
          if (t < 0.42) {
            const p = Math.sin((t / 0.42) * Math.PI * 0.5);
            lPosX = THREE.MathUtils.lerp(lPosX, -0.06, p);
            lPosY = THREE.MathUtils.lerp(lPosY, -0.17, p);
            lPosZ = THREE.MathUtils.lerp(lPosZ, -0.44, p);
            lRotX = -1.25;
            lRotY = 0.65;
            lRotZ = 1.18; // horizontal chest guard

            rPosX = 0.32;
            rPosY = -0.28;
            rPosZ = -0.34;
            rRotX = 0.4;
            rRotY = -0.45;
            rRotZ = 0.35;
          } else {
            // Upward bat-pommel / elbow strike follow-up
            const strike = (t - 0.42) / 0.58;
            const punch = Math.sin(strike * Math.PI);
            lPosX = THREE.MathUtils.lerp(-0.06, lPosX, strike);
            lPosY = THREE.MathUtils.lerp(-0.17, lPosY, strike);
            lPosZ = THREE.MathUtils.lerp(-0.44, lPosZ, strike);
            lRotZ = THREE.MathUtils.lerp(1.18, lRotZ, strike);

            rPosX = 0.22 - punch * 0.14;
            rPosY = -0.22 + punch * 0.16;
            rPosZ = -0.42 - punch * 0.14;
            rRotX = -0.35 - punch * 0.85;
            rRotY = 0.45;
            rRotZ = 0.72;
          }
          this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.85;
        } else if (this.animState === 'takedown') {
          dampHz = 20;
          leftFingerPose = 'FIST_CLENCH';
          if (t < 0.35) {
            const up = t / 0.35;
            rPosX = 0.16;
            rPosY = -0.1 + up * 0.24;
            rPosZ = -0.38;
            rRotX = 0.55 * up;
            rRotY = -0.2;
            rRotZ = 0.1;
            lPosX = -0.18;
            lPosY = -0.14;
            lPosZ = -0.44;
          } else {
            const slam = (t - 0.35) / 0.65;
            trailActive = slam < 0.55;
            rPosX = 0.12;
            rPosY = 0.14 - Math.sin(slam * Math.PI * 0.5) * 0.48;
            rPosZ = -0.48 - Math.sin(slam * Math.PI) * 0.16;
            rRotX = -1.45 * Math.sin(slam * Math.PI * 0.65);
          }
          this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.85;
        } else if (this.animState === 'blocked') {
          const ease = Math.sin(t * Math.PI);
          dampHz = 18;
          leftFingerPose = 'FIST_CLENCH';
          rPosX = 0.34 + ease * 0.14;
          rPosY = -0.28 - ease * 0.08;
          rRotX = 0.55 * ease;
          rRotZ = 0.5 * ease;
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'inspect') {
          // [B] / [I] Inspect: Tilt bat across right-center FOV to admire grain & raise left wrist to glance at Biomarker LED
          dampHz = 9;
          const fadeIn = Math.min(1, t / 0.22);
          const fadeOut = Math.min(1, (1 - t) / 0.25);
          const blend = Math.min(fadeIn, fadeOut);
          const smoothB = blend * blend * (3 - 2 * blend);
          const rollLook = Math.sin(t * Math.PI * 2) * 0.24;

          rPosX = THREE.MathUtils.lerp(rPosX, 0.16, smoothB);
          rPosY = THREE.MathUtils.lerp(rPosY, -0.14, smoothB);
          rPosZ = THREE.MathUtils.lerp(rPosZ, -0.42, smoothB);
          rRotX = THREE.MathUtils.lerp(rRotX, 0.52, smoothB);
          rRotY = THREE.MathUtils.lerp(rRotY, -0.78 + rollLook, smoothB);
          rRotZ = THREE.MathUtils.lerp(rRotZ, 0.68 + rollLook * 0.4, smoothB);

          lPosX = THREE.MathUtils.lerp(lPosX, -0.15, smoothB);
          lPosY = THREE.MathUtils.lerp(lPosY, -0.11, smoothB);
          lPosZ = THREE.MathUtils.lerp(lPosZ, -0.35, smoothB);
          lRotX = THREE.MathUtils.lerp(lRotX, -0.82, smoothB);
          lRotY = THREE.MathUtils.lerp(lRotY, 0.72, smoothB);
          lRotZ = THREE.MathUtils.lerp(lRotZ, -0.48, smoothB);
          leftFingerPose = 'RELAXED_IDLE';
          this.swingArcMat.opacity = 0;
        } else if (this.animState === 'intro_ready') {
          // Dying Light intro: Left wrist raises 0.5s -> holds 1.4s displaying Biomarker LED -> lowers 0.3s;
          // Right hand gives the bat a weight-check twirl before settling into RELAXED_IDLE
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
          rPosX = THREE.MathUtils.lerp(rPosX, 0.21, liftR);
          rPosY = THREE.MathUtils.lerp(rPosY, -0.19, liftR);
          rPosZ = THREE.MathUtils.lerp(rPosZ, -0.41, liftR);
          rRotX = THREE.MathUtils.lerp(rRotX, 0.44, liftR);
          rRotY = THREE.MathUtils.lerp(rRotY, -0.52 + twirl * 0.36, liftR);
          rRotZ = THREE.MathUtils.lerp(rRotZ, 0.48 + twirl * 0.24, liftR);
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

    // Apply anti-wall-clipping pullback tuck toward chest (disabled during world-space climb IK)
    if (this.curVmPullback > 0.01 && climbState === 'NONE') {
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
      _shoulderBase.set(-0.36, -0.5, 0.04),
      _leftTargetPos,
      _leftTargetQuat,
      _leftPole,
    );
    this.solveArmPose(
      this.rightShoulder,
      this.rightUpperArm,
      this.rightForearm,
      this.rightWrist,
      _shoulderBase.set(0.36, -0.5, 0.04),
      _rightTargetPos,
      _rightTargetQuat,
      _rightPole,
    );

    // Smoothly articulate all 15 left-hand finger joints & right-hand grip exertion
    const fingerDamp = 1 - Math.exp(-15 * dt);
    this.applyLeftFingerAngles(elapsed, fingerDamp, leftFingerPose);
    this.applyRightFingerExertion(rightExertionStrain, fingerDamp);

    // Update procedural bat motion-trail ribbon
    this.updateMotionTrail(trailActive, dt);

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
