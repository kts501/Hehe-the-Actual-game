import * as THREE from 'three';
import type { BoxCollider } from '../types/game';
import type { ProceduralTextureSet } from './textures';

export type ScreamerAiState =
  | 'IDLE'
  | 'CHASE'
  | 'STAGGER'
  | 'KNOCKDOWN'
  | 'GRABBED'
  | 'DEAD';

export type MeleeSwingDirection = 'left_to_right' | 'right_to_left' | 'overhead';

interface TendonStrandSpec {
  mesh: THREE.Mesh;
  upperAnchor: THREE.Vector3; // in headGroup space
  lowerAnchor: THREE.Vector3; // in jawPivot space
  baseRadius: number;
}

interface HairLockSpec {
  pivot: THREE.Group;
  baseRotX: number;
  baseRotY: number;
  baseRotZ: number;
  jiggleX: number;
  jiggleZ: number;
  velX: number;
  velZ: number;
  stiffness: number;
  damping: number;
  sensitivity: number;
}

const _headWorldCur = new THREE.Vector3();
const _tmpUpperWorld = new THREE.Vector3();
const _tmpLowerWorld = new THREE.Vector3();
const _tmpMid = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _toPlayer = new THREE.Vector3();

function smoothGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an open-ended ragged clothing sleeve/tunic or trouser cuff
 * with irregular jagged hems and smooth normals.
 */
function createJaggedGarmentGeo(
  rTop: number,
  rBottom: number,
  height: number,
  radialSegs = 14,
  heightSegs = 5,
  jagAmp = 0.048,
  jagTop = false,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, radialSegs, heightSegs, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    if (y < -height * 0.16) {
      const u = Math.min(1, (-height * 0.16 - y) / (height * 0.34));
      const tear =
        (Math.sin(ang * 5.0 + 0.4) * jagAmp +
          Math.cos(ang * 9.0 + 1.7) * (jagAmp * 0.65) +
          Math.sin(ang * 13.0) * (jagAmp * 0.35)) *
        u;
      pos.setY(i, y + tear);
      pos.setX(i, x * (1 + Math.sin(ang * 6.0) * 0.06 * u));
      pos.setZ(i, z * (1 + Math.cos(ang * 6.0) * 0.06 * u));
    } else if (jagTop && y > height * 0.22) {
      const tearTop = Math.sin(ang * 6.0 + 0.9) * (jagAmp * 0.55);
      pos.setY(i, y + tearTop);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Deforms a 16x14 sphere into a gaunt Volatile/Screamer cranium:
 * flattened temples, sharp protruding cheekbones, heavy furrowed brow ridge,
 * sunken orbital hollows, and 3 asymmetric mutation nodules on the upper-left temple.
 */
function createGauntCraniumGeo(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.112, 16, 14);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Tall, narrow, gaunt skull proportions (~0.28m tall x 0.20m wide incl. jaw)
    x *= 0.88;
    y *= 1.18;
    z *= 1.04;

    const nx = x / 0.112;
    const ny = y / 0.132;
    const nz = z / 0.116;

    // Taper lower cheek / maxilla forward while hollowing cheeks beneath zygomatic arch
    if (ny < 0.05 && nz > 0.1) {
      const cheekFactor = THREE.MathUtils.clamp((0.05 - ny) / 0.65, 0, 1);
      // Hollow sub-zygomatic cheeks inward
      if (Math.abs(nx) > 0.28 && Math.abs(nx) < 0.82 && ny > -0.58) {
        x *= 1.0 - 0.24 * cheekFactor;
      }
      // Pull maxilla/upper dental arch forward (+Z)
      if (ny < -0.15) {
        z += cheekFactor * 0.024;
      }
    }

    // Flatten left/right temples inward for starved silhouette
    if (ny > 0.05 && ny < 0.68 && Math.abs(nx) > 0.55) {
      x *= 0.89;
    }

    // Heavy jutting brow ridge above orbits (y ~ +0.025..+0.06, front +Z)
    if (nz > 0.45 && ny > 0.16 && ny < 0.48) {
      const browEnv = Math.exp(-Math.pow((ny - 0.31) / 0.11, 2));
      const notch = 1 - 0.35 * Math.exp(-Math.pow(nx / 0.16, 2)); // central frown furrow
      z += browEnv * notch * 0.022;
      y += browEnv * 0.005;
    }

    // Deeply sunken orbital hollows for recessed eye sockets
    if (nz > 0.45 && ny > -0.05 && ny < 0.22 && Math.abs(nx) > 0.12 && Math.abs(nx) < 0.56) {
      const eyeDist = Math.hypot((Math.abs(nx) - 0.34) / 0.18, (ny - 0.09) / 0.12);
      if (eyeDist < 1.0) {
        const pushIn = (1 - eyeDist * eyeDist) * 0.024;
        z -= pushIn;
      }
    }

    // Prominent sharp zygomatic cheekbones jutting out under eyes
    if (nz > 0.2 && ny > -0.22 && ny < 0.08 && Math.abs(nx) > 0.35) {
      const chkDist = Math.hypot((Math.abs(nx) - 0.58) / 0.24, (ny + 0.06) / 0.12);
      if (chkDist < 1.0) {
        const pop = (1 - chkDist * chkDist) * 0.017;
        x += Math.sign(x) * pop;
        z += pop * 0.72;
      }
    }

    // Sunken inverted triangular nasal depression in center face
    if (nz > 0.58 && ny > -0.24 && ny < 0.08 && Math.abs(nx) < 0.2) {
      const noseSink = Math.max(0, 1 - Math.abs(nx) / 0.2) * Math.max(0, 1 - Math.abs(ny + 0.07) / 0.16);
      z -= noseSink * 0.016;
    }

    // Forehead horizontal frown creases
    if (nz > 0.35 && ny > 0.44 && ny < 0.76) {
      z += Math.sin(ny * 32) * 0.0024;
    }

    // Occipital skull ridge taper at back
    if (nz < -0.55 && ny < -0.25) {
      z += 0.014;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a tapered, naturally curved ragged hair lock extending down from (0,0,0) along -Y / -Z.
 */
function createHairLockGeo(length: number, width: number, curveBack: number, curveSide: number): THREE.BufferGeometry {
  const segsY = 5;
  const positions: number[] = [];
  const indices: number[] = [];
  const halfW = width * 0.5;
  const halfT = width * 0.28;

  // Cross-section diamond blade (4 verts per ring) tapering to sharp ragged tip
  for (let s = 0; s <= segsY; s++) {
    const u = s / segsY;
    const taper = Math.pow(1 - u, 0.72);
    const w = Math.max(0.0012, halfW * taper);
    const t = Math.max(0.0008, halfT * taper);
    const cy = -u * length;
    const cz = u * u * curveBack + Math.sin(u * Math.PI) * 0.006;
    const cx = u * u * curveSide;

    positions.push(cx - w, cy, cz); // 0: left
    positions.push(cx, cy, cz + t); // 1: outer
    positions.push(cx + w, cy, cz); // 2: right
    positions.push(cx, cy, cz - t); // 3: inner
  }

  for (let s = 0; s < segsY; s++) {
    const r0 = s * 4;
    const r1 = (s + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const next = (k + 1) % 4;
      indices.push(r0 + k, r1 + k, r0 + next, r0 + next, r1 + k, r1 + next);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Complete procedural Volatile Stalker / Screamer infected enemy archetype:
 * - Hierarchical skeletal rig (1.78m height) with exact named pivots
 * - Detailed 0.28m x 0.20m gaunt sculpted head, unhinged jaw, 14 jagged teeth, 6 stretching tendons
 * - 18-lock tattered hair system with real-time velocity-driven secondary jiggle physics
 * - Emaciated ribbed torso, torn dark-slate/maroon clothing, clawed gaunt limbs
 * - Full AI & Hit-Reaction State Machine (IDLE, CHASE, STAGGER, KNOCKDOWN, GRABBED, DEAD)
 */
export class InfectedEnemy {
  public readonly id: number;

  // Named Skeletal Pivot Groups (exact required hierarchy)
  public readonly root = new THREE.Group();
  public readonly hips = new THREE.Group();
  public readonly spine = new THREE.Group();
  public readonly chest = new THREE.Group();
  public readonly neck = new THREE.Group();
  public readonly headGroup = new THREE.Group();
  public readonly jawPivot = new THREE.Group();
  public readonly leftShoulder = new THREE.Group();
  public readonly leftElbow = new THREE.Group();
  public readonly rightShoulder = new THREE.Group();
  public readonly rightElbow = new THREE.Group();
  public readonly leftHip = new THREE.Group();
  public readonly leftKnee = new THREE.Group();
  public readonly rightHip = new THREE.Group();
  public readonly rightKnee = new THREE.Group();
  public readonly hairGroup = new THREE.Group();

  // State Machine & Physics Properties
  public aiState: ScreamerAiState = 'IDLE';
  public readonly velocity = new THREE.Vector3();
  public angularVelocity = 0;
  public isGrounded = true;
  public health = 100;
  public maxHealth = 100;
  public yaw = 0;
  public readonly homePos = new THREE.Vector3();
  public alerted = false;
  public attackCooldown = 0;
  public groanTimer = 2 + Math.random() * 5;
  public respawnTimer = 0;

  // Timers & Reaction Kinematics
  private animPhase = Math.random() * 12;
  private staggerTimer = 0;
  private readonly staggerDuration = 0.35;
  private staggerHeadYaw = 0;
  private staggerHeadPitch = 0;
  private staggerSpineRoll = 0;
  private staggerSpinePitch = 0;
  private hitFlashTimer = 0;

  private knockdownTimer = 0;
  private knockdownStage: 'FALLING' | 'DOWNED' | 'GETTING_UP' = 'FALLING';
  private knockdownFallProg = 0;

  private chaseAttackWindup = -1; // >= 0 while swinging claws in CHASE
  private screamPulse = 0;
  private jawAngleRad = 0.26; // ~15 deg default
  private deadTimer = 0;
  private hasTriggeredChaseScreech = false;

  // Secondary Hair Jiggle Physics State
  private readonly hairLocks: HairLockSpec[] = [];
  private readonly prevHeadWorldPos = new THREE.Vector3();
  private readonly prevHeadWorldVel = new THREE.Vector3();
  private hairFirstFrame = true;

  // Stretching Jaw Tendons
  private readonly tendons: TendonStrandSpec[] = [];

  // Per-instance skin material so 0.08s dark-red hit flash is isolated per enemy
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly bruiseSkinMat: THREE.MeshStandardMaterial;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private static readonly BASE_SKIN_HEX = 0x7e7872;
  private static readonly FLASH_SKIN_HEX = 0x8a1c20;
  private static readonly BASE_BRUISE_HEX = 0x3a2b30;
  private static readonly FLASH_BRUISE_HEX = 0x6b141a;

  constructor(
    id: number,
    scene: THREE.Scene,
    textures: ProceduralTextureSet,
    x: number,
    y: number,
    z: number,
    initialYaw = 0,
  ) {
    this.id = id;
    this.homePos.set(x, y, z);
    this.yaw = initialYaw;

    this.root.name = `Screamer_${id}`;
    this.root.position.set(x, y, z);
    this.root.rotation.y = initialYaw;

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.disposables.push(m);
      return m;
    };

    // -------------------------------------------------------------------------
    // Calibrated Procedural Materials (PBR Standard, flatShading: false)
    // -------------------------------------------------------------------------
    this.skinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.022,
        color: InfectedEnemy.BASE_SKIN_HEX,
        roughness: 0.72,
        metalness: 0.04,
        flatShading: false,
      }),
    );

    this.bruiseSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.02,
        color: InfectedEnemy.BASE_BRUISE_HEX,
        roughness: 0.76,
        metalness: 0.04,
        flatShading: false,
      }),
    );

    const earSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        color: 0x7a746e,
        roughness: 0.74,
        metalness: 0.03,
        flatShading: false,
      }),
    );

    const sinewSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        color: 0x6e6862,
        roughness: 0.68,
        metalness: 0.04,
        flatShading: false,
      }),
    );

    const eyeSocketMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0d0a0c,
        roughness: 0.94,
        metalness: 0.02,
        flatShading: false,
      }),
    );

    const cataractEyeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8d2c5,
        emissive: 0x331100,
        emissiveIntensity: 0.35,
        roughness: 0.28,
        metalness: 0.02,
        flatShading: false,
      }),
    );

    const nasalCavMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x140c0e,
        roughness: 0.95,
        metalness: 0.02,
        flatShading: false,
      }),
    );

    const gumsMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3d1218,
        roughness: 0.42,
        metalness: 0.05,
        flatShading: false,
      }),
    );

    const teethMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcfc4a8,
        roughness: 0.38,
        metalness: 0.04,
        flatShading: false,
      }),
    );

    const tendonMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5e1b22,
        roughness: 0.25,
        metalness: 0.06,
        flatShading: false,
      }),
    );

    const tongueMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4a151d,
        roughness: 0.32,
        metalness: 0.04,
        flatShading: false,
      }),
    );

    const hairMats = [
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x161414,
          roughness: 0.92,
          metalness: 0.02,
          side: THREE.DoubleSide,
          flatShading: false,
        }),
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x241f1d,
          roughness: 0.92,
          metalness: 0.02,
          side: THREE.DoubleSide,
          flatShading: false,
        }),
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x2e2824,
          roughness: 0.9,
          metalness: 0.02,
          side: THREE.DoubleSide,
          flatShading: false,
        }),
      ),
    ];

    const scalpMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x181514,
        roughness: 0.92,
        metalness: 0.02,
        flatShading: false,
      }),
    );

    const tunicSlateMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x2b282c,
        roughness: 0.9,
        metalness: 0.03,
        side: THREE.DoubleSide,
        flatShading: false,
      }),
    );

    const tunicMaroonMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x3d2224,
        roughness: 0.88,
        metalness: 0.04,
        side: THREE.DoubleSide,
        flatShading: false,
      }),
    );

    const trouserMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x22201e,
        roughness: 0.92,
        metalness: 0.02,
        side: THREE.DoubleSide,
        flatShading: false,
      }),
    );

    const clawMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x241c1c,
        roughness: 0.44,
        metalness: 0.08,
        flatShading: false,
      }),
    );

    const shadowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.56,
      }),
    );

    // Ground Contact Shadow
    const cShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.18, 1.18)), shadowMat);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.02;
    this.root.add(cShadow);

    // -------------------------------------------------------------------------
    // Hips / Pelvis (y = 0.88m -> ~1.78m total standing stature)
    // -------------------------------------------------------------------------
    this.hips.position.set(0, 0.88, 0);
    this.root.add(this.hips);

    const pelvisMesh = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.112, 0.14, 6, 12))),
      trouserMat,
    );
    pelvisMesh.rotation.z = Math.PI / 2;
    pelvisMesh.scale.set(0.95, 1.0, 0.74);
    pelvisMesh.castShadow = true;
    this.hips.add(pelvisMesh);

    // -------------------------------------------------------------------------
    // Gaunt Emaciated Legs + Ragged Trousers + Bare Clawed Feet
    // -------------------------------------------------------------------------
    const buildGauntLeg = (side: -1 | 1, hipGrp: THREE.Group, kneeGrp: THREE.Group) => {
      hipGrp.position.set(side * 0.105, -0.02, 0);
      this.hips.add(hipGrp);

      const hipCap = new THREE.Mesh(trackGeo(smoothGeo(new THREE.SphereGeometry(0.068, 10, 8))), trouserMat);
      hipGrp.add(hipCap);

      const thighMesh = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.058, 0.27, 6, 10))),
        trouserMat,
      );
      thighMesh.position.y = -0.175;
      thighMesh.castShadow = true;
      hipGrp.add(thighMesh);

      // Torn ragged trouser cuff exposing bruised knee & gaunt shin
      const legCuff = new THREE.Mesh(
        trackGeo(createJaggedGarmentGeo(0.066, 0.072, 0.25, 12, 4, 0.044)),
        trouserMat,
      );
      legCuff.position.y = -0.21;
      hipGrp.add(legCuff);

      kneeGrp.position.set(0, -0.37, 0);
      hipGrp.add(kneeGrp);

      const kneeBruise = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.046, 8, 8))),
        this.bruiseSkinMat,
      );
      kneeBruise.scale.set(0.92, 1.1, 0.96);
      kneeGrp.add(kneeBruise);

      const shinMesh = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.039, 0.3, 6, 10))),
        this.skinMat,
      );
      shinMesh.position.y = -0.185;
      shinMesh.castShadow = true;
      kneeGrp.add(shinMesh);

      // Ankle & bare gaunt foot with darkened claws
      const ankle = new THREE.Mesh(trackGeo(smoothGeo(new THREE.SphereGeometry(0.036, 8, 6))), this.bruiseSkinMat);
      ankle.position.set(0, -0.38, 0);
      kneeGrp.add(ankle);

      const foot = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.032, 0.125, 4, 8))),
        this.skinMat,
      );
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.06, 1.0, 0.65);
      foot.position.set(0, -0.435, 0.055);
      kneeGrp.add(foot);

      const toeClawGeo = trackGeo(smoothGeo(new THREE.ConeGeometry(0.008, 0.032, 5)));
      [-0.018, 0, 0.018].forEach((tx) => {
        const toe = new THREE.Mesh(toeClawGeo, clawMat);
        toe.rotation.x = Math.PI * 0.44;
        toe.position.set(tx, -0.442, 0.135);
        kneeGrp.add(toe);
      });
    };

    buildGauntLeg(-1, this.leftHip, this.leftKnee);
    buildGauntLeg(1, this.rightHip, this.rightKnee);

    // -------------------------------------------------------------------------
    // Spine, Hollowed Waist, Ribbed Emaciated Chest & Torn Tunic
    // -------------------------------------------------------------------------
    this.spine.position.set(0, 0.05, 0);
    this.hips.add(this.spine);

    // Sunken hollowed abdominal waist
    const waistSkin = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.092, 0.17, 6, 12))),
      this.skinMat,
    );
    waistSkin.position.y = 0.12;
    waistSkin.scale.set(1.06, 1.0, 0.72);
    this.spine.add(waistSkin);

    // Jagged lower tunic skirt hanging asymmetrically over hips
    const lowerTunic = new THREE.Mesh(
      trackGeo(createJaggedGarmentGeo(0.118, 0.136, 0.27, 14, 5, 0.055, false)),
      tunicSlateMat,
    );
    lowerTunic.position.y = 0.06;
    lowerTunic.scale.set(1.12, 1.0, 0.78);
    this.spine.add(lowerTunic);

    // Blood-soaked front chest tatters overlap
    const bloodTatter = new THREE.Mesh(
      trackGeo(createJaggedGarmentGeo(0.124, 0.14, 0.24, 12, 4, 0.048, true)),
      tunicMaroonMat,
    );
    bloodTatter.position.set(0, 0.24, 0.006);
    bloodTatter.scale.set(1.1, 1.0, 0.76);
    this.spine.add(bloodTatter);

    this.chest.position.set(0, 0.26, 0.01);
    this.spine.add(this.chest);

    const chestMesh = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.128, 0.18, 6, 12))),
      this.skinMat,
    );
    chestMesh.position.y = 0.14;
    chestMesh.scale.set(1.22, 1.0, 0.72);
    chestMesh.castShadow = true;
    this.chest.add(chestMesh);

    // Protruding gaunt horizontal rib ridges across starved chest
    const ribArcGeo = trackGeo(smoothGeo(new THREE.TorusGeometry(0.095, 0.011, 6, 12, Math.PI * 0.68)));
    for (let r = 0; r < 4; r++) {
      [-1, 1].forEach((side) => {
        const rib = new THREE.Mesh(ribArcGeo, r % 2 === 0 ? this.skinMat : this.bruiseSkinMat);
        rib.position.set(side * 0.036, 0.04 + r * 0.038, 0.025);
        rib.rotation.y = side * Math.PI * 0.34;
        rib.rotation.x = 0.18;
        this.chest.add(rib);
      });
    }

    // Protruding dorsal vertebrae nodules down back
    const vertGeo = trackGeo(smoothGeo(new THREE.SphereGeometry(0.018, 8, 6)));
    for (let v = 0; v < 5; v++) {
      const vert = new THREE.Mesh(vertGeo, this.bruiseSkinMat);
      vert.scale.set(0.85, 1.1, 1.3);
      vert.position.set(0, 0.02 + v * 0.055, -0.092);
      this.chest.add(vert);
    }

    // Torn sleeveless tunic shoulders framing collarbones
    [-1, 1].forEach((side) => {
      const shoulderRag = new THREE.Mesh(
        trackGeo(createJaggedGarmentGeo(0.058, 0.068, 0.11, 10, 3, 0.028, true)),
        side === -1 ? tunicMaroonMat : tunicSlateMat,
      );
      shoulderRag.position.set(side * 0.165, 0.24, 0.005);
      shoulderRag.rotation.z = side * 0.38;
      this.chest.add(shoulderRag);
    });

    // -------------------------------------------------------------------------
    // Gaunt Elongated Arms + Bruised Joints + Skeletal Hands with Dark Claws
    // -------------------------------------------------------------------------
    const buildGauntArm = (side: -1 | 1, shoulderGrp: THREE.Group, elbowGrp: THREE.Group) => {
      shoulderGrp.position.set(side * 0.205, 0.235, 0.012);
      this.chest.add(shoulderGrp);

      const sJoint = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.048, 10, 8))),
        this.bruiseSkinMat,
      );
      shoulderGrp.add(sJoint);

      const upperArm = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.036, 0.24, 6, 10))),
        this.skinMat,
      );
      upperArm.position.y = -0.145;
      upperArm.castShadow = true;
      shoulderGrp.add(upperArm);

      // Torn sleeve band hanging from upper bicep
      const bicepRag = new THREE.Mesh(
        trackGeo(createJaggedGarmentGeo(0.044, 0.052, 0.12, 10, 3, 0.026)),
        tunicSlateMat,
      );
      bicepRag.position.y = -0.07;
      shoulderGrp.add(bicepRag);

      elbowGrp.position.set(0, -0.295, 0);
      shoulderGrp.add(elbowGrp);

      const eJoint = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.038, 8, 8))),
        this.bruiseSkinMat,
      );
      elbowGrp.add(eJoint);

      const forearm = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.031, 0.245, 6, 10))),
        this.skinMat,
      );
      forearm.position.y = -0.15;
      forearm.castShadow = true;
      elbowGrp.add(forearm);

      // Gaunt skeletal wrist & bruised palm
      const palm = new THREE.Mesh(
        trackGeo(smoothGeo(new THREE.SphereGeometry(0.04, 10, 8))),
        this.bruiseSkinMat,
      );
      palm.scale.set(0.85, 1.25, 0.56);
      palm.position.set(0, -0.315, 0.012);
      elbowGrp.add(palm);

      // 4 Long gaunt splayed fingers + sharp darkened claws (#241C1C)
      const fingerGeo = trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.0075, 0.058, 4, 6)));
      const clawGeo = trackGeo(smoothGeo(new THREE.ConeGeometry(0.007, 0.048, 5)));
      [-0.024, -0.008, 0.008, 0.024].forEach((fx, idx) => {
        const finger = new THREE.Mesh(fingerGeo, this.skinMat);
        finger.position.set(fx, -0.062, 0.012);
        finger.rotation.x = 0.28;
        finger.rotation.z = (idx - 1.5) * -0.08 * side;
        palm.add(finger);

        const claw = new THREE.Mesh(clawGeo, clawMat);
        claw.position.set(0, -0.048, 0.008);
        claw.rotation.x = Math.PI - 0.48;
        finger.add(claw);
      });

      const thumb = new THREE.Mesh(fingerGeo, this.skinMat);
      thumb.scale.setScalar(0.88);
      thumb.position.set(-side * 0.03, -0.026, 0.022);
      thumb.rotation.set(0.42, 0, -side * 0.55);
      palm.add(thumb);

      const thumbClaw = new THREE.Mesh(clawGeo, clawMat);
      thumbClaw.scale.setScalar(0.85);
      thumbClaw.position.set(0, -0.044, 0.008);
      thumbClaw.rotation.x = Math.PI - 0.42;
      thumb.add(thumbClaw);
    };

    buildGauntArm(-1, this.leftShoulder, this.leftElbow);
    buildGauntArm(1, this.rightShoulder, this.rightElbow);

    // -------------------------------------------------------------------------
    // Neck + 4 Taut Sternocleidomastoid Neck Sinews
    // -------------------------------------------------------------------------
    this.neck.position.set(0, 0.31, 0.028);
    this.chest.add(this.neck);

    const neckCore = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CylinderGeometry(0.054, 0.066, 0.135, 12))),
      this.skinMat,
    );
    neckCore.position.y = 0.05;
    neckCore.rotation.x = 0.16;
    this.neck.add(neckCore);

    // 4 Angled neck sinew cords converging toward clavicle notch & back skull
    const sinewGeo = trackGeo(smoothGeo(new THREE.CylinderGeometry(0.011, 0.014, 0.145, 7)));
    const sinewConfigs: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [
      { pos: [-0.036, 0.052, 0.034], rot: [0.22, 0, 0.28] },
      { pos: [0.036, 0.052, 0.034], rot: [0.22, 0, -0.28] },
      { pos: [-0.032, 0.055, -0.032], rot: [-0.14, 0, 0.18] },
      { pos: [0.032, 0.055, -0.032], rot: [-0.14, 0, -0.18] },
    ];
    sinewConfigs.forEach((sc) => {
      const s = new THREE.Mesh(sinewGeo, sinewSkinMat);
      s.position.set(...sc.pos);
      s.rotation.set(...sc.rot);
      this.neck.add(s);
    });

    // -------------------------------------------------------------------------
    // 1.1 DETAILED VOLATILE / SCREAMER HEAD SCULPT (~0.28m tall x 0.20m wide)
    // -------------------------------------------------------------------------
    this.headGroup.position.set(0, 0.145, 0.042);
    this.neck.add(this.headGroup);

    const craniumGeo = trackGeo(createGauntCraniumGeo());
    const cranium = new THREE.Mesh(craniumGeo, this.skinMat);
    cranium.position.set(0, 0.024, 0);
    cranium.castShadow = true;
    this.headGroup.add(cranium);

    // 3 Asymmetric scarred mutation nodules & vein ridges across upper-left temple (matches reference)
    const noduleGeo = trackGeo(smoothGeo(new THREE.SphereGeometry(0.022, 10, 8)));
    const nodules: Array<{ pos: [number, number, number]; scale: [number, number, number] }> = [
      { pos: [0.048, 0.102, 0.068], scale: [1.1, 0.85, 0.9] },
      { pos: [0.066, 0.088, 0.044], scale: [0.9, 1.25, 0.72] },
      { pos: [0.072, 0.036, 0.068], scale: [0.65, 0.65, 0.7] },
    ];
    nodules.forEach((nd) => {
      const nod = new THREE.Mesh(noduleGeo, this.bruiseSkinMat);
      nod.position.set(...nd.pos);
      nod.scale.set(...nd.scale);
      this.headGroup.add(nod);
    });

    // Deep recessed dark eye sockets (#0D0A0C) + pale milky-cataract eyeballs (r = 0.016m)
    const socketGeo = trackGeo(smoothGeo(new THREE.SphereGeometry(0.026, 10, 8)));
    const eyeballGeo = trackGeo(smoothGeo(new THREE.SphereGeometry(0.016, 10, 8)));
    [-0.038, 0.038].forEach((ex) => {
      const sock = new THREE.Mesh(socketGeo, eyeSocketMat);
      sock.scale.set(1.08, 0.78, 0.55);
      sock.position.set(ex, 0.036, 0.092);
      this.headGroup.add(sock);

      const eye = new THREE.Mesh(eyeballGeo, cataractEyeMat);
      eye.position.set(ex, 0.036, 0.098);
      this.headGroup.add(eye);
    });

    // Sunken inverted triangular nasal cavity (#140C0E) flanked by sharp bony nasal ridges
    const nasalHole = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.ConeGeometry(0.017, 0.034, 4))),
      nasalCavMat,
    );
    nasalHole.rotation.z = Math.PI * 0.25;
    nasalHole.rotation.x = -0.18;
    nasalHole.scale.set(0.85, 1.0, 0.48);
    nasalHole.position.set(0, 0.008, 0.112);
    this.headGroup.add(nasalHole);

    const nasalBridgeGeo = trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.0065, 0.032, 4, 6)));
    [-0.014, 0.014].forEach((nx) => {
      const ridge = new THREE.Mesh(nasalBridgeGeo, this.skinMat);
      ridge.position.set(nx, 0.014, 0.108);
      ridge.rotation.z = nx < 0 ? -0.24 : 0.24;
      ridge.rotation.x = -0.22;
      this.headGroup.add(ridge);
    });

    // Recessed oral cavern inside upper skull behind stretched mouth
    const oralCav = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.052, 10, 8))),
      nasalCavMat,
    );
    oralCav.scale.set(1.0, 1.35, 0.85);
    oralCav.position.set(0, -0.05, 0.055);
    this.headGroup.add(oralCav);

    // Sculpted gaunt C-shaped ears (#7A746E)
    const earOuterGeo = trackGeo(smoothGeo(new THREE.TorusGeometry(0.022, 0.0065, 6, 10, Math.PI * 1.45)));
    const earInnerGeo = trackGeo(smoothGeo(new THREE.SphereGeometry(0.015, 8, 6)));
    [-1, 1].forEach((side) => {
      const earPivot = new THREE.Group();
      earPivot.position.set(side * 0.094, 0.018, -0.01);
      earPivot.rotation.y = side * 0.92;
      earPivot.rotation.z = side * 0.15;
      this.headGroup.add(earPivot);

      const helix = new THREE.Mesh(earOuterGeo, earSkinMat);
      helix.rotation.z = side * -Math.PI * 0.35;
      earPivot.add(helix);

      const concha = new THREE.Mesh(earInnerGeo, this.bruiseSkinMat);
      concha.scale.set(0.85, 1.15, 0.4);
      earPivot.add(concha);
    });

    // Upper Maxilla Gums (#3D1218) + 7 Sharp Irregular Yellowed-Ivory Upper Teeth (#CFC4A8)
    const upperGumArc = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.044, 0.012, 6, 12, Math.PI))),
      gumsMat,
    );
    upperGumArc.rotation.x = Math.PI / 2;
    upperGumArc.position.set(0, -0.036, 0.068);
    this.headGroup.add(upperGumArc);

    const upperToothGeo = trackGeo(smoothGeo(new THREE.ConeGeometry(0.0046, 0.024, 5)));
    const upperToothAngles = [-1.15, -0.78, -0.42, 0.0, 0.42, 0.78, 1.15];
    upperToothAngles.forEach((ang, idx) => {
      const tx = Math.sin(ang) * 0.043;
      const tz = 0.068 + Math.cos(ang) * 0.046;
      const t = new THREE.Mesh(upperToothGeo, teethMat);
      const scaleH = idx === 1 || idx === 5 ? 1.24 : 0.85 + ((idx * 7) % 3) * 0.14;
      t.scale.set(0.95, scaleH, 0.95);
      t.position.set(tx, -0.046, tz);
      t.rotation.x = Math.PI + ((idx % 2 === 0 ? 1 : -1) * 0.08);
      t.rotation.z = (idx - 3) * 0.05;
      this.headGroup.add(t);
    });

    // -------------------------------------------------------------------------
    // Hyper-Extended Unhinged Lower Jaw (`jawPivot`) + Gums + 7 Lower Teeth + Tongue
    // -------------------------------------------------------------------------
    this.jawPivot.position.set(0, -0.026, 0.015);
    this.jawPivot.rotation.x = 0.26;
    this.headGroup.add(this.jawPivot);

    // Elongated mandibular rami descending diagonally to gaunt angular chin
    const ramusGeo = trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.014, 0.085, 5, 8)));
    [-1, 1].forEach((side) => {
      const ramus = new THREE.Mesh(ramusGeo, this.skinMat);
      ramus.position.set(side * 0.056, -0.042, 0.032);
      ramus.rotation.x = 0.82;
      ramus.rotation.z = side * 0.22;
      this.jawPivot.add(ramus);
    });

    const chinBody = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.SphereGeometry(0.038, 10, 8))),
      this.skinMat,
    );
    chinBody.scale.set(0.95, 0.9, 1.15);
    chinBody.position.set(0, -0.082, 0.082);
    this.jawPivot.add(chinBody);

    const lowerGumArc = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.TorusGeometry(0.039, 0.011, 6, 12, Math.PI))),
      gumsMat,
    );
    lowerGumArc.rotation.x = Math.PI / 2;
    lowerGumArc.position.set(0, -0.066, 0.055);
    this.jawPivot.add(lowerGumArc);

    const tongue = new THREE.Mesh(
      trackGeo(smoothGeo(new THREE.CapsuleGeometry(0.018, 0.055, 4, 8))),
      tongueMat,
    );
    tongue.rotation.x = Math.PI / 2 - 0.12;
    tongue.scale.set(1.08, 1.0, 0.45);
    tongue.position.set(0, -0.056, 0.062);
    this.jawPivot.add(tongue);

    const lowerToothGeo = trackGeo(smoothGeo(new THREE.ConeGeometry(0.0044, 0.022, 5)));
    const lowerToothAngles = [-1.1, -0.72, -0.36, 0.0, 0.36, 0.72, 1.1];
    lowerToothAngles.forEach((ang, idx) => {
      const tx = Math.sin(ang) * 0.039;
      const tz = 0.055 + Math.cos(ang) * 0.042;
      const t = new THREE.Mesh(lowerToothGeo, teethMat);
      const scaleH = idx === 1 || idx === 5 ? 1.2 : 0.8 + ((idx * 5) % 3) * 0.15;
      t.scale.set(0.95, scaleH, 0.95);
      t.position.set(tx, -0.056, tz);
      t.rotation.x = (idx % 2 === 0 ? 1 : -1) * 0.08;
      t.rotation.z = (idx - 3) * -0.05;
      this.jawPivot.add(t);
    });

    // 6 Stretching Fleshy Oral Tendon / Saliva Strands (updated dynamically in update())
    const tendonGeo = trackGeo(smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 6, 1)));
    const tendonPairs: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [new THREE.Vector3(-0.044, -0.038, 0.064), new THREE.Vector3(-0.041, -0.064, 0.048), 0.0036],
      [new THREE.Vector3(-0.032, -0.038, 0.095), new THREE.Vector3(-0.03, -0.064, 0.084), 0.0029],
      [new THREE.Vector3(-0.011, -0.04, 0.112), new THREE.Vector3(-0.013, -0.065, 0.096), 0.0025],
      [new THREE.Vector3(0.015, -0.04, 0.111), new THREE.Vector3(0.012, -0.065, 0.095), 0.0028],
      [new THREE.Vector3(0.035, -0.038, 0.092), new THREE.Vector3(0.032, -0.064, 0.08), 0.0034],
      [new THREE.Vector3(0.044, -0.038, 0.062), new THREE.Vector3(0.042, -0.064, 0.046), 0.004],
    ];
    tendonPairs.forEach(([upperAnchor, lowerAnchor, baseRadius]) => {
      const mesh = new THREE.Mesh(tendonGeo, tendonMat);
      this.headGroup.add(mesh);
      this.tendons.push({ mesh, upperAnchor, lowerAnchor, baseRadius });
    });

    // -------------------------------------------------------------------------
    // 1.2 PROCEDURAL TATTERED HAIR (`hairGroup` child of `headGroup`)
    // -------------------------------------------------------------------------
    this.hairGroup.name = 'ScreamerHair';
    this.headGroup.add(this.hairGroup);

    // Matted dark scalp cap hugging back/crown while leaving forehead & left-temple nodules clear
    const scalpCap = new THREE.Mesh(
      trackGeo(
        smoothGeo(new THREE.SphereGeometry(0.104, 14, 10, Math.PI * 0.12, Math.PI * 1.45, 0.12, Math.PI * 0.56)),
      ),
      scalpMat,
    );
    scalpCap.scale.set(0.92, 1.18, 1.06);
    scalpCap.position.set(-0.005, 0.03, -0.016);
    scalpCap.rotation.y = Math.PI * 0.68;
    scalpCap.rotation.x = -0.22;
    this.hairGroup.add(scalpCap);

    // 18 Distinct tapered curved hair locks with secondary spring-damped jiggle physics
    const hairSpecs: Array<{
      pos: [number, number, number];
      rot: [number, number, number];
      len: number;
      width: number;
      curveBack: number;
      curveSide: number;
      matIdx: number;
    }> = [
      // Top crown & parted bangs (swept right/back so upper-left temple nodules stay scarred & visible)
      { pos: [-0.025, 0.138, 0.025], rot: [0.22, 0.25, -0.35], len: 0.12, width: 0.032, curveBack: 0.024, curveSide: -0.018, matIdx: 0 },
      { pos: [-0.048, 0.126, 0.042], rot: [0.18, 0.35, -0.42], len: 0.135, width: 0.028, curveBack: 0.022, curveSide: -0.024, matIdx: 1 },
      { pos: [0.008, 0.142, 0.012], rot: [0.28, -0.18, 0.22], len: 0.115, width: 0.03, curveBack: 0.026, curveSide: 0.015, matIdx: 2 },
      { pos: [-0.068, 0.104, 0.022], rot: [0.14, 0.55, -0.34], len: 0.15, width: 0.03, curveBack: 0.02, curveSide: -0.022, matIdx: 0 },
      { pos: [-0.082, 0.084, -0.005], rot: [0.12, 0.72, -0.28], len: 0.165, width: 0.028, curveBack: 0.024, curveSide: -0.016, matIdx: 1 },
      { pos: [-0.078, 0.068, -0.036], rot: [0.18, 0.95, -0.22], len: 0.175, width: 0.032, curveBack: 0.028, curveSide: -0.012, matIdx: 2 },
      // Back parietal & occipital cascade (longest ragged locks)
      { pos: [-0.048, 0.116, -0.058], rot: [0.24, 0.38, -0.14], len: 0.17, width: 0.036, curveBack: 0.032, curveSide: -0.014, matIdx: 0 },
      { pos: [-0.018, 0.128, -0.068], rot: [0.26, 0.12, -0.06], len: 0.18, width: 0.038, curveBack: 0.034, curveSide: -0.006, matIdx: 1 },
      { pos: [0.016, 0.128, -0.068], rot: [0.25, -0.12, 0.08], len: 0.175, width: 0.035, curveBack: 0.034, curveSide: 0.008, matIdx: 0 },
      { pos: [0.048, 0.114, -0.056], rot: [0.22, -0.36, 0.16], len: 0.165, width: 0.034, curveBack: 0.03, curveSide: 0.015, matIdx: 2 },
      { pos: [0.072, 0.092, -0.034], rot: [0.18, -0.78, 0.24], len: 0.155, width: 0.03, curveBack: 0.026, curveSide: 0.018, matIdx: 1 },
      { pos: [0.082, 0.074, -0.006], rot: [0.14, -0.95, 0.32], len: 0.125, width: 0.026, curveBack: 0.02, curveSide: 0.018, matIdx: 0 },
      // Lower nape & tattered ear-framing side wisps
      { pos: [-0.055, 0.054, -0.088], rot: [0.28, 0.28, -0.12], len: 0.145, width: 0.034, curveBack: 0.028, curveSide: -0.014, matIdx: 2 },
      { pos: [-0.022, 0.062, -0.098], rot: [0.3, 0.08, -0.04], len: 0.155, width: 0.036, curveBack: 0.03, curveSide: -0.005, matIdx: 0 },
      { pos: [0.018, 0.062, -0.098], rot: [0.29, -0.08, 0.06], len: 0.15, width: 0.034, curveBack: 0.03, curveSide: 0.006, matIdx: 1 },
      { pos: [0.052, 0.052, -0.088], rot: [0.26, -0.28, 0.14], len: 0.135, width: 0.03, curveBack: 0.026, curveSide: 0.014, matIdx: 0 },
      { pos: [-0.066, 0.092, 0.052], rot: [0.08, 0.45, -0.48], len: 0.095, width: 0.022, curveBack: 0.016, curveSide: -0.02, matIdx: 2 },
      { pos: [0.042, 0.125, 0.008], rot: [0.22, -0.45, 0.34], len: 0.09, width: 0.024, curveBack: 0.022, curveSide: 0.016, matIdx: 1 },
    ];

    hairSpecs.forEach((hs, idx) => {
      const pivot = new THREE.Group();
      pivot.position.set(...hs.pos);
      pivot.rotation.set(...hs.rot);
      const lockGeo = trackGeo(createHairLockGeo(hs.len, hs.width, hs.curveBack, hs.curveSide));
      const lockMesh = new THREE.Mesh(lockGeo, hairMats[hs.matIdx % hairMats.length]);
      pivot.add(lockMesh);
      this.hairGroup.add(pivot);

      this.hairLocks.push({
        pivot,
        baseRotX: hs.rot[0],
        baseRotY: hs.rot[1],
        baseRotZ: hs.rot[2],
        jiggleX: 0,
        jiggleZ: 0,
        velX: 0,
        velZ: 0,
        stiffness: 95 + (idx % 4) * 18,
        damping: 8.5 + (idx % 3) * 1.4,
        sensitivity: 0.045 + (hs.len - 0.08) * 0.28,
      });
    });

    scene.add(this.root);
    this.syncTendons();
  }

  public getHeadWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.headGroup.getWorldPosition(out);
  }

  public reset(x: number, y: number, z: number, yaw = 0): void {
    this.homePos.set(x, y, z);
    this.root.position.set(x, y, z);
    this.yaw = yaw;
    this.root.rotation.set(0, yaw, 0);
    this.root.visible = true;

    this.health = this.maxHealth;
    this.aiState = 'IDLE';
    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
    this.isGrounded = true;
    this.alerted = false;
    this.attackCooldown = 0;
    this.staggerTimer = 0;
    this.hitFlashTimer = 0;
    this.knockdownTimer = 0;
    this.chaseAttackWindup = -1;
    this.deadTimer = 0;
    this.hasTriggeredChaseScreech = false;
    this.hairFirstFrame = true;
    this.jawAngleRad = 0.26;
    this.skinMat.color.setHex(InfectedEnemy.BASE_SKIN_HEX);
    this.bruiseSkinMat.color.setHex(InfectedEnemy.BASE_BRUISE_HEX);

    this.spine.rotation.set(0.28, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.jawPivot.rotation.set(0.26, 0, 0);
    this.leftShoulder.rotation.set(0, 0, 0);
    this.rightShoulder.rotation.set(0, 0, 0);
    this.leftElbow.rotation.set(0, 0, 0);
    this.rightElbow.rotation.set(0, 0, 0);
    this.leftHip.rotation.set(0, 0, 0);
    this.rightHip.rotation.set(0, 0, 0);
    this.leftKnee.rotation.set(0, 0, 0);
    this.rightKnee.rotation.set(0, 0, 0);
    this.syncTendons();
  }

  public applyStagger(directionVec: THREE.Vector3, swingDir: MeleeSwingDirection = 'left_to_right'): void {
    if (this.aiState === 'DEAD') return;
    this.alerted = true;
    this.chaseAttackWindup = -1;
    this.aiState = 'STAGGER';
    this.staggerTimer = this.staggerDuration;
    this.hitFlashTimer = 0.08;
    this.screamPulse = 0.65;

    // 4.5 m/s backward pushback + subtle upward hop
    const dirLen = Math.hypot(directionVec.x, directionVec.z) || 1;
    this.velocity.x = (directionVec.x / dirLen) * 4.5;
    this.velocity.z = (directionVec.z / dirLen) * 4.5;
    this.velocity.y = Math.max(this.velocity.y, 1.4);

    // Direction-matched head & torso snap (±0.55 rad)
    if (swingDir === 'left_to_right') {
      this.staggerHeadYaw = -0.55;
      this.staggerHeadPitch = -0.18;
      this.staggerSpineRoll = -0.26;
      this.staggerSpinePitch = 0.14;
    } else if (swingDir === 'right_to_left') {
      this.staggerHeadYaw = 0.55;
      this.staggerHeadPitch = -0.18;
      this.staggerSpineRoll = 0.26;
      this.staggerSpinePitch = 0.14;
    } else {
      // Overhead slam
      this.staggerHeadYaw = 0;
      this.staggerHeadPitch = 0.45;
      this.staggerSpineRoll = 0;
      this.staggerSpinePitch = 0.42;
    }
  }

  public applyKnockdown(impulseVec: THREE.Vector3): void {
    if (this.aiState === 'DEAD') return;
    this.alerted = true;
    this.chaseAttackWindup = -1;
    this.aiState = 'KNOCKDOWN';
    this.knockdownStage = 'FALLING';
    this.knockdownFallProg = 0;
    this.knockdownTimer = 0;
    this.hitFlashTimer = 0.08;
    this.isGrounded = false;
    this.velocity.copy(impulseVec);
    if (this.velocity.y < 3.6) this.velocity.y = 4.2;
    this.angularVelocity = (Math.random() - 0.5) * 4.5;
  }

  public setGrabbed(): void {
    this.aiState = 'GRABBED';
    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
    this.chaseAttackWindup = -1;
    this.staggerTimer = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
  }

  public markDead(hitDir?: THREE.Vector3): void {
    this.health = 0;
    this.aiState = 'DEAD';
    this.deadTimer = 0;
    this.respawnTimer = 24;
    this.chaseAttackWindup = -1;
    if (hitDir) {
      this.velocity.x = hitDir.x * 4.2;
      this.velocity.z = hitDir.z * 4.2;
    }
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    isNight: boolean,
    lurePos: THREE.Vector3 | null,
    colliders: BoxCollider[],
    tajSafeZone: { minX: number; maxX: number; minZ: number; maxZ: number },
    onPlayerHit: (damage: number, attackerPos: THREE.Vector3) => void,
    onScreech: () => void,
    onGroan: () => void,
  ): void {
    if (dt <= 0) return;

    // 0.08s dark-red skin tint flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flashT = this.hitFlashTimer / 0.08;
      this.skinMat.color.setHex(InfectedEnemy.BASE_SKIN_HEX).lerp(
        new THREE.Color(InfectedEnemy.FLASH_SKIN_HEX),
        flashT,
      );
      this.bruiseSkinMat.color.setHex(InfectedEnemy.BASE_BRUISE_HEX).lerp(
        new THREE.Color(InfectedEnemy.FLASH_BRUISE_HEX),
        flashT,
      );
    } else {
      this.skinMat.color.setHex(InfectedEnemy.BASE_SKIN_HEX);
      this.bruiseSkinMat.color.setHex(InfectedEnemy.BASE_BRUISE_HEX);
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.groanTimer -= dt;
    this.screamPulse = Math.max(0, this.screamPulse - dt * 1.6);

    // -------------------------------------------------------------------------
    // GRABBED: AI & gravity suspended — frantic struggling in player's left palm
    // -------------------------------------------------------------------------
    if (this.aiState === 'GRABBED') {
      const t = elapsed;
      this.spine.rotation.set(0.24 + Math.sin(t * 16) * 0.06, Math.sin(t * 20) * 0.08, Math.cos(t * 18) * 0.07);
      this.headGroup.rotation.set(
        -0.25 + Math.sin(t * 22) * 0.08,
        Math.sin(t * 19) * 0.14,
        Math.cos(t * 24) * 0.09,
      );
      // Jaw thrashes wide open (~48 deg)
      this.jawAngleRad = THREE.MathUtils.degToRad(48) + Math.sin(t * 26) * 0.08;
      this.jawPivot.rotation.x = this.jawAngleRad;

      // Arms reach up frantically scraping at player's left forearm
      this.leftShoulder.rotation.set(-2.35 + Math.sin(t * 21) * 0.32, 0.25, -0.28 + Math.cos(t * 17) * 0.14);
      this.leftElbow.rotation.set(-0.95 + Math.sin(t * 25) * 0.25, 0, 0);
      this.rightShoulder.rotation.set(-2.25 + Math.cos(t * 23) * 0.34, -0.28, 0.24 + Math.sin(t * 19) * 0.16);
      this.rightElbow.rotation.set(-1.05 + Math.cos(t * 26) * 0.25, 0, 0);

      // Legs dangle & kick helplessly
      this.leftHip.rotation.set(-0.35 + Math.sin(t * 17) * 0.48, 0, -0.06);
      this.leftKnee.rotation.set(0.75 + Math.cos(t * 17) * 0.32, 0, 0);
      this.rightHip.rotation.set(-0.35 - Math.sin(t * 17) * 0.48, 0, 0.06);
      this.rightKnee.rotation.set(0.75 - Math.cos(t * 17) * 0.32, 0, 0);

      this.syncTendons();
      this.updateHairPhysics(dt);
      return;
    }

    // -------------------------------------------------------------------------
    // DEAD: ragdoll collapse & respawn
    // -------------------------------------------------------------------------
    if (this.aiState === 'DEAD') {
      this.deadTimer += dt;
      const fallT = Math.min(1, this.deadTimer / 0.38);
      const ease = 1 - Math.pow(1 - fallT, 2);
      this.root.rotation.x = -ease * (Math.PI * 0.48);
      this.root.rotation.z = ease * 0.22;
      this.velocity.x *= Math.exp(-6 * dt);
      this.velocity.z *= Math.exp(-6 * dt);
      this.root.position.x += this.velocity.x * dt;
      this.root.position.z += this.velocity.z * dt;
      const floorY = this.sampleSupportHeight(this.root.position.x, this.root.position.z, this.root.position.y, colliders);
      this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, floorY + 0.14, Math.min(1, dt * 10));
      this.leftKnee.rotation.x = ease * 0.8;
      this.rightKnee.rotation.x = ease * 0.55;
      this.leftShoulder.rotation.x = -ease * 0.7;
      this.rightShoulder.rotation.x = -ease * 1.1;
      this.jawPivot.rotation.x = ease * 0.55;
      this.syncTendons();
      this.updateHairPhysics(dt);

      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.reset(this.homePos.x, this.homePos.y, this.homePos.z, Math.random() * Math.PI * 2);
      }
      return;
    }

    // -------------------------------------------------------------------------
    // UV Safe Zone Repulsion
    // -------------------------------------------------------------------------
    if (
      this.root.position.z < tajSafeZone.maxZ + 1.8 &&
      this.root.position.x > tajSafeZone.minX - 1.5 &&
      this.root.position.x < tajSafeZone.maxX + 1.5
    ) {
      this.root.position.z = tajSafeZone.maxZ + 1.9;
      this.velocity.z = 3.5;
      this.applyStagger(new THREE.Vector3(0, 0, 1), 'overhead');
    }

    // Target resolution (Firecracker lure overrides player)
    const isLured = lurePos !== null && this.root.position.distanceToSquared(lurePos) < 26 * 26;
    const targetPos = isLured && lurePos ? lurePos : playerPos;
    _toPlayer.subVectors(targetPos, this.root.position);
    const horizDist = Math.hypot(_toPlayer.x, _toPlayer.z);
    const vertDist = Math.abs(targetPos.y - this.root.position.y);

    // -------------------------------------------------------------------------
    // State Transitions & Behaviors
    // -------------------------------------------------------------------------
    if (this.aiState === 'STAGGER') {
      this.staggerTimer -= dt;
      const p = Math.max(0, Math.min(1, this.staggerTimer / this.staggerDuration));
      // Sharp whip peak at start followed by damped 0.35s spring recovery
      const snap = Math.sin(Math.pow(p, 0.55) * Math.PI * 0.85);
      this.headGroup.rotation.set(this.staggerHeadPitch * snap, this.staggerHeadYaw * snap, 0);
      this.spine.rotation.set(
        0.34 + this.staggerSpinePitch * snap,
        this.staggerHeadYaw * 0.35 * snap,
        this.staggerSpineRoll * snap,
      );
      this.jawAngleRad = THREE.MathUtils.lerp(this.jawAngleRad, 0.72, 1 - Math.exp(-16 * dt));
      this.jawPivot.rotation.x = this.jawAngleRad;

      this.leftShoulder.rotation.set(-0.9 - snap * 0.5, 0, -0.35 * snap);
      this.rightShoulder.rotation.set(-0.9 - snap * 0.6, 0, 0.35 * snap);
      this.leftElbow.rotation.set(-0.9, 0, 0);
      this.rightElbow.rotation.set(-0.9, 0, 0);

      this.velocity.x *= Math.exp(-6.5 * dt);
      this.velocity.z *= Math.exp(-6.5 * dt);

      if (this.staggerTimer <= 0) {
        this.aiState = 'CHASE';
        this.headGroup.rotation.set(0, 0, 0);
        this.spine.rotation.set(0.42, 0, 0);
      }
    } else if (this.aiState === 'KNOCKDOWN') {
      if (this.knockdownStage === 'FALLING') {
        this.knockdownFallProg = Math.min(1, this.knockdownFallProg + dt / 0.32);
        this.root.rotation.x = THREE.MathUtils.lerp(0, -Math.PI * 0.5, this.knockdownFallProg);
        this.yaw += this.angularVelocity * dt;
        this.headGroup.rotation.x = -0.35 * this.knockdownFallProg;
        this.jawPivot.rotation.x = 0.68;
        this.leftShoulder.rotation.x = -1.8 * this.knockdownFallProg;
        this.rightShoulder.rotation.x = -1.6 * this.knockdownFallProg;

        if (this.isGrounded && this.knockdownFallProg >= 0.85) {
          this.knockdownStage = 'DOWNED';
          this.knockdownTimer = 1.6;
          this.root.rotation.x = -Math.PI * 0.5;
        }
      } else if (this.knockdownStage === 'DOWNED') {
        this.knockdownTimer -= dt;
        this.velocity.x *= Math.exp(-8 * dt);
        this.velocity.z *= Math.exp(-8 * dt);
        this.root.rotation.x = -Math.PI * 0.5;
        // Writhe weakly on ground
        this.headGroup.rotation.y = Math.sin(elapsed * 4.5) * 0.22;
        this.jawPivot.rotation.x = 0.42 + Math.abs(Math.sin(elapsed * 5)) * 0.14;
        if (this.knockdownTimer <= 0) {
          this.knockdownStage = 'GETTING_UP';
          this.knockdownTimer = 0.45;
        }
      } else {
        // Scramble upright into CHASE
        this.knockdownTimer -= dt;
        const upP = 1 - Math.max(0, this.knockdownTimer / 0.45);
        this.root.rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.5, 0, upP);
        this.spine.rotation.x = THREE.MathUtils.lerp(0.65, 0.42, upP);
        this.headGroup.rotation.set(0, 0, 0);
        if (this.knockdownTimer <= 0) {
          this.root.rotation.x = 0;
          this.aiState = 'CHASE';
          this.hasTriggeredChaseScreech = false;
        }
      }
    } else {
      // IDLE <-> CHASE
      const aggroRange = isNight || this.alerted ? 26.0 : 18.0;
      const shouldChase = isLured || (horizDist <= aggroRange && vertDist < 4.8);

      if (shouldChase) {
        if (this.aiState !== 'CHASE') {
          this.aiState = 'CHASE';
          if (!this.hasTriggeredChaseScreech) {
            this.hasTriggeredChaseScreech = true;
            this.screamPulse = 1.0;
            onScreech();
          }
        }
      } else {
        this.aiState = 'IDLE';
        this.hasTriggeredChaseScreech = false;
      }

      if (this.aiState === 'IDLE') {
        // Hunched forward (spine.rotation.x = 0.28 rad), eerie head twitch, subtle chest breathing, jaw ~15 deg
        this.velocity.x *= Math.exp(-8 * dt);
        this.velocity.z *= Math.exp(-8 * dt);

        const breath = Math.sin(elapsed * 2.2 + this.animPhase);
        this.hips.position.y = 0.88 + breath * 0.008;
        this.spine.rotation.set(0.28 + breath * 0.025, 0, Math.sin(elapsed * 1.1 + this.animPhase) * 0.03);

        // Eerie sharp head twitches on erratic cadence
        const twitchBeat = Math.sin(elapsed * 7.5 + this.animPhase * 2) * Math.pow(Math.max(0, Math.sin(elapsed * 1.7 + this.animPhase)), 6);
        this.headGroup.rotation.set(
          -0.12 + twitchBeat * 0.16,
          Math.sin(elapsed * 0.8 + this.animPhase) * 0.18 + twitchBeat * 0.34,
          twitchBeat * 0.28,
        );

        this.jawAngleRad = THREE.MathUtils.lerp(
          this.jawAngleRad,
          THREE.MathUtils.degToRad(15) + Math.abs(breath) * 0.05,
          1 - Math.exp(-10 * dt),
        );
        this.jawPivot.rotation.x = this.jawAngleRad;

        // Slouched dangling arms
        this.leftShoulder.rotation.set(-0.38 + breath * 0.05, 0, -0.08);
        this.rightShoulder.rotation.set(-0.34 - breath * 0.05, 0, 0.08);
        this.leftElbow.rotation.set(-0.55, 0, 0);
        this.rightElbow.rotation.set(-0.52, 0, 0);
        this.leftHip.rotation.set(0, 0, 0);
        this.rightHip.rotation.set(0, 0, 0);
        this.leftKnee.rotation.set(0.12, 0, 0);
        this.rightKnee.rotation.set(0.12, 0, 0);

        if (this.groanTimer <= 0 && horizDist < 18) {
          this.groanTimer = 4.2 + Math.random() * 5.0;
          onGroan();
        }
      } else {
        // CHASE: face target, frantic hunched sprint (4.6 m/s) & outstretched claws, jaw open ~42 deg
        const desiredYaw = Math.atan2(_toPlayer.x, _toPlayer.z);
        this.yaw = lerpAngle(this.yaw, desiredYaw, dt * 8.5);

        const moveSpeed = 4.6;
        const stopDist = isLured ? 1.65 : 1.75;

        if (this.chaseAttackWindup >= 0) {
          // Claw slash lunge animation in progress
          this.chaseAttackWindup -= dt;
          const p = 1 - Math.max(0, this.chaseAttackWindup / 0.42);
          this.spine.rotation.set(0.42 - Math.sin(p * Math.PI) * 0.25, 0, 0);
          this.leftShoulder.rotation.set(-1.9 - Math.sin(p * Math.PI) * 0.8, 0, 0.15);
          this.rightShoulder.rotation.set(-2.0 - Math.sin(p * Math.PI) * 0.9, 0, -0.15);
          this.leftElbow.rotation.set(-0.45, 0, 0);
          this.rightElbow.rotation.set(-0.45, 0, 0);
          this.velocity.x *= Math.exp(-6 * dt);
          this.velocity.z *= Math.exp(-6 * dt);

          if (this.chaseAttackWindup <= 0) {
            this.chaseAttackWindup = -1;
            this.attackCooldown = 0.95;
            if (!isLured && horizDist < 2.45 && vertDist < 2.1) {
              onPlayerHit(14, this.root.position);
            }
          }
        } else if (horizDist > stopDist) {
          this.velocity.x = Math.sin(this.yaw) * moveSpeed;
          this.velocity.z = Math.cos(this.yaw) * moveSpeed;

          this.animPhase += dt * (4.0 + moveSpeed * 1.95);
          const stride = Math.sin(this.animPhase) * 0.68;
          const oppStride = Math.sin(this.animPhase + Math.PI) * 0.68;

          this.leftHip.rotation.set(stride, 0, 0);
          this.rightHip.rotation.set(oppStride, 0, 0);
          this.leftKnee.rotation.set(Math.max(0.1, -Math.cos(this.animPhase) * 0.72), 0, 0);
          this.rightKnee.rotation.set(Math.max(0.1, -Math.cos(this.animPhase + Math.PI) * 0.72), 0, 0);

          const bounce = Math.abs(Math.cos(this.animPhase)) * 0.048;
          this.hips.position.y = 0.88 + bounce;
          this.spine.rotation.set(0.42 + Math.sin(this.animPhase * 2) * 0.045, 0, Math.sin(this.animPhase) * 0.075);
          this.headGroup.rotation.set(
            -0.28 + Math.sin(this.animPhase * 2) * 0.06,
            Math.sin(elapsed * 9) * 0.06,
            -Math.sin(this.animPhase) * 0.09,
          );

          // Outstretched desperate clawing arms
          this.leftShoulder.rotation.set(-1.38 + oppStride * 0.35, 0.14, -0.14);
          this.rightShoulder.rotation.set(-1.38 + stride * 0.35, -0.14, 0.14);
          this.leftElbow.rotation.set(-0.38, 0, 0);
          this.rightElbow.rotation.set(-0.38, 0, 0);
        } else {
          this.velocity.x *= 0.7;
          this.velocity.z *= 0.7;
          if (!isLured && this.attackCooldown <= 0 && vertDist < 2.2) {
            this.chaseAttackWindup = 0.42;
            onScreech();
          }
        }

        // Open jaw wide (42 deg base, snapping wider during windup/screech)
        const targetJawDeg = this.chaseAttackWindup >= 0 || this.screamPulse > 0.2 ? 48 : 42;
        this.jawAngleRad = THREE.MathUtils.lerp(
          this.jawAngleRad,
          THREE.MathUtils.degToRad(targetJawDeg) + Math.sin(elapsed * 16) * 0.05,
          1 - Math.exp(-14 * dt),
        );
        this.jawPivot.rotation.x = this.jawAngleRad;

        if (this.groanTimer <= 0 && horizDist < 18) {
          this.groanTimer = 3.2 + Math.random() * 3.8;
          onGroan();
        }
      }
    }

    // -------------------------------------------------------------------------
    // Gravity (-18 m/s²), Horizontal Collider Pushout & Rooftop Support Sync
    // -------------------------------------------------------------------------
    this.velocity.y -= 18 * dt;
    this.root.position.x += this.velocity.x * dt;
    this.root.position.z += this.velocity.z * dt;
    this.root.position.y += this.velocity.y * dt;

    // Resolve horizontal walls (skipping rooftops we are standing on)
    const bodyRadius = 0.44;
    for (let c = 0; c < colliders.length; c++) {
      const b = colliders[c];
      if (!b.blocksZombies || b.ramp) continue;
      if (this.root.position.y >= b.maxY - 0.12 || this.root.position.y + 1.75 < b.minY) continue;

      const closestX = Math.max(b.minX, Math.min(this.root.position.x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(this.root.position.z, b.maxZ));
      const dx = this.root.position.x - closestX;
      const dz = this.root.position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < bodyRadius * bodyRadius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const push = bodyRadius - dist;
        this.root.position.x += (dx / dist) * push;
        this.root.position.z += (dz / dist) * push;
      }
    }

    this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -43, 43);
    this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -53, 49);

    // Support height check (ground y=0 OR building/platform rooftop under feet!)
    const supportY = this.sampleSupportHeight(
      this.root.position.x,
      this.root.position.z,
      this.root.position.y,
      colliders,
    );
    if (this.root.position.y <= supportY) {
      this.root.position.y = supportY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    this.root.rotation.y = this.yaw;

    this.syncTendons();
    this.updateHairPhysics(dt);
  }

  private sampleSupportHeight(x: number, z: number, curY: number, colliders: BoxCollider[]): number {
    let groundY = 0;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.ramp) continue;
      if (x >= b.minX - 0.15 && x <= b.maxX + 0.15 && z >= b.minZ - 0.15 && z <= b.maxZ + 0.15) {
        if (curY >= b.maxY - 0.55 && b.maxY > groundY) {
          groundY = b.maxY;
        }
      }
    }
    return groundY;
  }

  private syncTendons(): void {
    // Transform lowerAnchor from jawPivot local space -> headGroup local space cleanly
    this.jawPivot.updateMatrix();
    for (let i = 0; i < this.tendons.length; i++) {
      const t = this.tendons[i];
      _tmpUpperWorld.copy(t.upperAnchor);
      _tmpLowerWorld.copy(t.lowerAnchor).applyMatrix4(this.jawPivot.matrix);

      _tmpDir.subVectors(_tmpLowerWorld, _tmpUpperWorld);
      const len = Math.max(0.005, _tmpDir.length());
      _tmpMid.addVectors(_tmpUpperWorld, _tmpLowerWorld).multiplyScalar(0.5);

      // Thin slightly as tendon stretches taut when jaw gapes wide
      const thinScale = THREE.MathUtils.clamp(0.055 / len, 0.52, 1.15);
      t.mesh.position.copy(_tmpMid);
      t.mesh.scale.set(t.baseRadius * thinScale, len, t.baseRadius * thinScale);
      _tmpDir.divideScalar(len);
      t.mesh.quaternion.setFromUnitVectors(_upAxis, _tmpDir);
    }
  }

  private updateHairPhysics(dt: number): void {
    this.root.updateMatrixWorld(true);
    this.headGroup.getWorldPosition(_headWorldCur);

    if (this.hairFirstFrame) {
      this.hairFirstFrame = false;
      this.prevHeadWorldPos.copy(_headWorldCur);
      this.prevHeadWorldVel.set(0, 0, 0);
      return;
    }

    const invDt = 1 / Math.max(0.004, dt);
    const velX = (_headWorldCur.x - this.prevHeadWorldPos.x) * invDt;
    const velY = (_headWorldCur.y - this.prevHeadWorldPos.y) * invDt;
    const velZ = (_headWorldCur.z - this.prevHeadWorldPos.z) * invDt;

    const accX = THREE.MathUtils.clamp((velX - this.prevHeadWorldVel.x) * 0.45 + velX * 0.2, -26, 26);
    const accY = THREE.MathUtils.clamp((velY - this.prevHeadWorldVel.y) * 0.45 + velY * 0.18, -24, 24);
    const accZ = THREE.MathUtils.clamp((velZ - this.prevHeadWorldVel.z) * 0.45 + velZ * 0.2, -26, 26);

    this.prevHeadWorldPos.copy(_headWorldCur);
    this.prevHeadWorldVel.set(velX, velY, velZ);

    // Project world impulse into local X / Z inertia for subtle dangling secondary hair motion
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const localFwdImpulse = accX * sinY + accZ * cosY;
    const localSideImpulse = accX * cosY - accZ * sinY;

    for (let i = 0; i < this.hairLocks.length; i++) {
      const h = this.hairLocks[i];
      const driveX = (-localFwdImpulse - accY * 0.55) * h.sensitivity;
      const driveZ = -localSideImpulse * h.sensitivity;

      const forceX = -h.stiffness * h.jiggleX - h.damping * h.velX + driveX * 14;
      const forceZ = -h.stiffness * h.jiggleZ - h.damping * h.velZ + driveZ * 14;

      h.velX += forceX * dt;
      h.velZ += forceZ * dt;
      h.jiggleX = THREE.MathUtils.clamp(h.jiggleX + h.velX * dt, -0.45, 0.45);
      h.jiggleZ = THREE.MathUtils.clamp(h.jiggleZ + h.velZ * dt, -0.42, 0.42);

      h.pivot.rotation.set(h.baseRotX + h.jiggleX, h.baseRotY, h.baseRotZ + h.jiggleZ);
    }
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    for (let i = 0; i < this.disposables.length; i++) {
      this.disposables[i].dispose();
    }
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}
