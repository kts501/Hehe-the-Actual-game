import * as THREE from 'three';
import type { BoxCollider } from '../types/game';
import type { ProceduralTextureSet } from './textures';

export type NightRunnerState =
  | 'STALK'
  | 'CHASE'
  | 'ATTACK_MELEE'
  | 'STAGGER'
  | 'FINISHER_GRAB'
  | 'IDLE'
  | 'DEAD';

export interface NightRunnerUpdateResult {
  dealtDamage: number;
  triggeredFinisher: boolean;
}

const _nrVecA = new THREE.Vector3();
const _nrCamQuat = new THREE.Quaternion();
const _nrInvParentQuat = new THREE.Quaternion();
const _nrWorldTarget = new THREE.Vector3();

const nrGeoCache = new Map<string, THREE.BufferGeometry>();
function getCachedNrGeo<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
  let g = nrGeoCache.get(key) as T | undefined;
  if (!g) {
    g = factory();
    nrGeoCache.set(key, g);
  }
  return g;
}

interface SharedNrMaterials {
  carapace: THREE.MeshStandardMaterial;
  pale: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  gum: THREE.MeshStandardMaterial;
  socket: THREE.MeshStandardMaterial;
  claw: THREE.MeshStandardMaterial;
}

let sharedNrMats: SharedNrMaterials | null = null;
let sharedNrMatsHasTextures = false;

function getSharedNightRunnerMaterials(textures?: ProceduralTextureSet): SharedNrMaterials {
  if (!sharedNrMats || (!sharedNrMatsHasTextures && textures)) {
    sharedNrMatsHasTextures = Boolean(textures);
    sharedNrMats = {
      carapace: new THREE.MeshStandardMaterial({
        map: textures?.nightHunterCarapace ?? null,
        bumpMap: textures?.nightHunterCarapaceBump ?? null,
        bumpScale: 0.036,
        roughnessMap: textures?.nightHunterCarapaceRoughness ?? null,
        color: 0x3b485c,
        roughness: 0.38,
        metalness: 0.28,
      }),
      pale: new THREE.MeshStandardMaterial({
        map: textures?.zombieSkin ?? null,
        bumpMap: textures?.zombieSkinBump ?? null,
        bumpScale: 0.024,
        roughnessMap: textures?.zombieSkinRoughness ?? null,
        color: 0xa69b93,
        roughness: 0.72,
        metalness: 0.04,
      }),
      bone: new THREE.MeshStandardMaterial({
        color: 0xdccbb0,
        roughness: 0.44,
        metalness: 0.05,
      }),
      gum: new THREE.MeshStandardMaterial({
        color: 0x5c1118,
        roughness: 0.28,
        metalness: 0.05,
      }),
      socket: new THREE.MeshStandardMaterial({
        color: 0x090709,
        roughness: 0.94,
        metalness: 0.02,
      }),
      claw: new THREE.MeshStandardMaterial({
        color: 0x1a1518,
        roughness: 0.34,
        metalness: 0.18,
      }),
    };
  }
  return sharedNrMats;
}

export class NightRunner {
  public readonly id: number;
  public readonly group: THREE.Group;
  public readonly torso: THREE.Group;
  public readonly head: THREE.Group;
  public readonly leftShoulder: THREE.Group;
  public readonly leftElbow: THREE.Group;
  public readonly rightShoulder: THREE.Group;
  public readonly rightElbow: THREE.Group;
  public readonly leftHip: THREE.Group;
  public readonly leftKnee: THREE.Group;
  public readonly rightHip: THREE.Group;
  public readonly rightKnee: THREE.Group;
  private readonly leftEye: THREE.Mesh;
  private readonly rightEye: THREE.Mesh;
  private readonly leftMandible: THREE.Group;
  private readonly rightMandible: THREE.Group;
  private readonly fleshMat: THREE.MeshStandardMaterial;
  private readonly eyeMat: THREE.MeshStandardMaterial;

  public state: NightRunnerState = 'STALK';
  public hp = 135;
  public maxHp = 135;
  public yaw = 0;
  public animPhase = Math.random() * Math.PI * 2;
  public stateTimer = 0;
  public attackCooldown = 0;
  public staggerTimer = 0;
  public knockbackVel = new THREE.Vector3();
  public alerted = false;
  public frozenForFinisher = false;
  public territoryId: string | null = null;
  public hitFlashTimer = 0;

  private patrolAngle = Math.random() * Math.PI * 2;
  private patrolTimer = 1 + Math.random() * 2;
  private meleeDealtThisSwing = false;
  private attackSwingTimer = 0;
  private groundY = 0;
  private readonly defaultLeftShoulderPos = new THREE.Vector3(-0.36, 1.35, 0.08);
  private readonly defaultRightShoulderPos = new THREE.Vector3(0.36, 1.35, 0.08);

  constructor(
    id: number,
    x: number,
    y: number,
    z: number,
    scene: THREE.Scene,
    textures?: ProceduralTextureSet,
  ) {
    this.id = id;
    this.groundY = y;
    const mats = getSharedNightRunnerMaterials(textures);

    this.fleshMat = new THREE.MeshStandardMaterial({
      map: textures?.nightHunterMuscle ?? null,
      bumpMap: textures?.zombieSkinBump ?? null,
      bumpScale: 0.028,
      roughnessMap: textures?.zombieSkinRoughness ?? null,
      color: 0xd9b3ab,
      roughness: 0.64,
      metalness: 0.04,
    });

    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff6200,
      emissiveIntensity: 2.8,
      roughness: 0.16,
    });

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    // Hunched Volatile Torso (pivot y = 1.08, forward predator crouch)
    this.torso = new THREE.Group();
    this.torso.position.set(0, 1.08, 0);
    this.torso.rotation.x = 0.35;
    this.group.add(this.torso);

    // Tapered pale flayed abdomen
    const waistGeo = getCachedNrGeo('nr_waist', () => new THREE.CapsuleGeometry(0.145, 0.24, 5, 10));
    const waist = new THREE.Mesh(waistGeo, mats.pale);
    waist.position.set(0, -0.22, -0.01);
    waist.scale.set(1.12, 1.0, 0.86);
    this.torso.add(waist);

    // Muscular striated chest & ribcage
    const chestGeo = getCachedNrGeo('nr_chest', () => new THREE.SphereGeometry(0.245, 12, 10));
    const chest = new THREE.Mesh(chestGeo, this.fleshMat);
    chest.position.set(0, 0.12, 0.03);
    chest.scale.set(1.24, 1.08, 0.84);
    this.torso.add(chest);

    // Pale flayed sternum / tendon fascia across center chest
    const sternumGeo = getCachedNrGeo('nr_sternum', () => new THREE.CapsuleGeometry(0.11, 0.22, 4, 8));
    const sternum = new THREE.Mesh(sternumGeo, mats.pale);
    sternum.position.set(0, 0.08, 0.12);
    sternum.scale.set(1.28, 1.0, 0.52);
    this.torso.add(sternum);

    // Iridescent dark slate-blue chitin carapace across upper back & shoulders
    const backCarapaceGeo = getCachedNrGeo('nr_back_carapace', () => new THREE.SphereGeometry(0.26, 12, 10));
    const backCarapace = new THREE.Mesh(backCarapaceGeo, mats.carapace);
    backCarapace.position.set(0, 0.18, -0.08);
    backCarapace.scale.set(1.26, 1.04, 0.72);
    this.torso.add(backCarapace);

    const pauldronGeo = getCachedNrGeo('nr_pauldron', () => new THREE.SphereGeometry(0.155, 10, 8));
    for (const side of [-1, 1] as const) {
      const pauldron = new THREE.Mesh(pauldronGeo, mats.carapace);
      pauldron.position.set(side * 0.28, 0.22, 0.01);
      pauldron.scale.set(1.12, 0.92, 1.05);
      pauldron.rotation.z = side * -0.28;
      this.torso.add(pauldron);
    }

    // Jagged pale bone rib-spurs erupting outward from lower torso flanks
    const ribSpurGeo = getCachedNrGeo('nr_rib_spur', () => new THREE.ConeGeometry(0.034, 0.24, 6));
    for (const side of [-1, 1] as const) {
      for (let r = 0; r < 3; r++) {
        const spur = new THREE.Mesh(ribSpurGeo, mats.bone);
        spur.position.set(side * (0.22 + r * 0.012), -0.02 - r * 0.085, 0.06 - r * 0.035);
        spur.rotation.z = side * -(1.05 + r * 0.18);
        spur.rotation.y = side * (0.45 - r * 0.12);
        spur.rotation.x = 0.24;
        this.torso.add(spur);
      }
    }

    // Serrated dorsal spine horns along hunchback
    const spineHornGeo = getCachedNrGeo('nr_spine_horn', () => new THREE.ConeGeometry(0.032, 0.14, 5));
    for (let s = 0; s < 5; s++) {
      const horn = new THREE.Mesh(spineHornGeo, mats.bone);
      horn.position.set(0, -0.14 + s * 0.115, -0.21 - (s >= 2 ? 0.03 : 0));
      horn.rotation.x = -Math.PI * 0.42 - s * 0.06;
      this.torso.add(horn);
    }

    // Muscular neck bridging torso to forward-jutting skull
    const neckGeo = getCachedNrGeo('nr_neck', () => new THREE.CylinderGeometry(0.078, 0.11, 0.22, 8));
    const neck = new THREE.Mesh(neckGeo, this.fleshMat);
    neck.position.set(0, 0.36, 0.06);
    neck.rotation.x = 0.28;
    this.torso.add(neck);

    // Sculpted Volatile Head (pivot y = 1.54, z = 0.22)
    this.head = new THREE.Group();
    this.head.position.set(0, 1.54, 0.22);
    this.head.rotation.x = 0.14;
    this.group.add(this.head);

    const craniumGeo = getCachedNrGeo('nr_cranium', () => new THREE.SphereGeometry(0.138, 12, 10));
    const cranium = new THREE.Mesh(craniumGeo, mats.pale);
    cranium.position.set(0, 0.04, -0.01);
    cranium.scale.set(0.94, 1.12, 1.08);
    this.head.add(cranium);

    // Chitinous brow plate + jagged skull crown horns
    const browGeo = getCachedNrGeo('nr_brow', () => new THREE.BoxGeometry(0.21, 0.055, 0.12));
    const brow = new THREE.Mesh(browGeo, mats.carapace);
    brow.position.set(0, 0.09, 0.085);
    brow.rotation.x = 0.18;
    this.head.add(brow);

    const crownHornGeo = getCachedNrGeo('nr_crown_horn', () => new THREE.ConeGeometry(0.022, 0.09, 5));
    for (let h = 0; h < 6; h++) {
      const horn = new THREE.Mesh(crownHornGeo, mats.bone);
      const ang = -0.85 + h * 0.34;
      horn.position.set(Math.sin(ang) * 0.095, 0.145 + (h % 2) * 0.02, -0.02 + Math.cos(ang) * 0.05);
      horn.rotation.x = -0.35;
      horn.rotation.z = -ang * 0.55;
      this.head.add(horn);
    }

    // Sunken eye sockets + fiery glowing orange-amber eyes
    const socketGeo = getCachedNrGeo('nr_eye_socket', () => new THREE.SphereGeometry(0.042, 8, 8));
    const eyeGeom = getCachedNrGeo('nr_eye', () => new THREE.SphereGeometry(0.029, 10, 10));

    for (const side of [-1, 1] as const) {
      const sock = new THREE.Mesh(socketGeo, mats.socket);
      sock.position.set(side * 0.062, 0.042, 0.118);
      sock.scale.set(1.0, 0.85, 0.62);
      this.head.add(sock);
    }

    this.leftEye = new THREE.Mesh(eyeGeom, this.eyeMat);
    this.leftEye.position.set(-0.062, 0.042, 0.136);
    this.head.add(this.leftEye);

    this.rightEye = new THREE.Mesh(eyeGeom, this.eyeMat);
    this.rightEye.position.set(0.062, 0.042, 0.136);
    this.head.add(this.rightEye);

    // Dark throat recess & bloody upper maxilla + fangs
    const throatGeo = getCachedNrGeo('nr_throat', () => new THREE.SphereGeometry(0.082, 8, 8));
    const throat = new THREE.Mesh(throatGeo, mats.socket);
    throat.position.set(0, -0.06, 0.065);
    this.head.add(throat);

    const upperGumGeo = getCachedNrGeo('nr_upper_gum', () => new THREE.CapsuleGeometry(0.048, 0.08, 4, 8));
    const upperGum = new THREE.Mesh(upperGumGeo, mats.gum);
    upperGum.rotation.z = Math.PI / 2;
    upperGum.position.set(0, -0.022, 0.122);
    this.head.add(upperGum);

    const fangGeo = getCachedNrGeo('nr_fang', () => new THREE.ConeGeometry(0.011, 0.046, 5));
    for (let f = -2; f <= 2; f++) {
      const fang = new THREE.Mesh(fangGeo, mats.bone);
      fang.position.set(f * 0.022, -0.056, 0.145 - Math.abs(f) * 0.008);
      fang.rotation.x = Math.PI - 0.15;
      this.head.add(fang);
    }

    // Splayed split lower mandibles (Volatile signature)
    const buildMandible = (side: -1 | 1): THREE.Group => {
      const mGroup = new THREE.Group();
      mGroup.position.set(side * 0.036, -0.095, 0.06);
      mGroup.rotation.set(0.28, side * 0.34, side * -0.26);

      const outerGeo = getCachedNrGeo('nr_mandible_outer', () => new THREE.CapsuleGeometry(0.032, 0.12, 4, 8));
      const outer = new THREE.Mesh(outerGeo, mats.carapace);
      outer.rotation.x = Math.PI / 2 - 0.15;
      outer.position.set(side * 0.012, -0.01, 0.06);
      mGroup.add(outer);

      const innerGeo = getCachedNrGeo('nr_mandible_inner', () => new THREE.CapsuleGeometry(0.024, 0.11, 4, 8));
      const inner = new THREE.Mesh(innerGeo, mats.gum);
      inner.rotation.x = Math.PI / 2 - 0.15;
      inner.position.set(side * -0.006, 0.006, 0.062);
      mGroup.add(inner);

      for (let t = 0; t < 2; t++) {
        const tusk = new THREE.Mesh(fangGeo, mats.bone);
        tusk.position.set(side * -0.004, 0.028, 0.07 + t * 0.04);
        tusk.rotation.x = 0.25;
        tusk.rotation.z = side * 0.22;
        mGroup.add(tusk);
      }

      this.head.add(mGroup);
      return mGroup;
    };
    this.leftMandible = buildMandible(-1);
    this.rightMandible = buildMandible(1);

    // Articulated Left & Right Arms (shoulder at x = ±0.36, y = 1.35 — exact reach for finisher grab)
    const buildArm = (side: -1 | 1) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.36, 1.35, 0.08);
      this.group.add(shoulder);

      const deltoidGeo = getCachedNrGeo('nr_deltoid', () => new THREE.SphereGeometry(0.095, 8, 8));
      const deltoid = new THREE.Mesh(deltoidGeo, mats.carapace);
      deltoid.scale.set(1.05, 1.15, 1.0);
      shoulder.add(deltoid);

      const upperArmGeo = getCachedNrGeo('nr_upper_arm', () => new THREE.CapsuleGeometry(0.068, 0.28, 5, 8));
      const upperArm = new THREE.Mesh(upperArmGeo, this.fleshMat);
      upperArm.position.set(0, -0.21, 0);
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.42, 0);
      shoulder.add(elbow);

      const elbowSpurGeo = getCachedNrGeo('nr_elbow_spur', () => new THREE.ConeGeometry(0.022, 0.1, 5));
      const elbowSpur = new THREE.Mesh(elbowSpurGeo, mats.bone);
      elbowSpur.position.set(side * 0.02, 0.02, -0.075);
      elbowSpur.rotation.x = -Math.PI * 0.62;
      elbow.add(elbowSpur);

      const lowerArmGeo = getCachedNrGeo('nr_lower_arm', () => new THREE.CapsuleGeometry(0.056, 0.28, 5, 8));
      const lowerArm = new THREE.Mesh(lowerArmGeo, this.fleshMat);
      lowerArm.position.set(0, -0.2, 0);
      elbow.add(lowerArm);

      const forearmPlateGeo = getCachedNrGeo('nr_forearm_plate', () => new THREE.CapsuleGeometry(0.052, 0.26, 4, 8));
      const forearmPlate = new THREE.Mesh(forearmPlateGeo, mats.carapace);
      forearmPlate.position.set(side * 0.018, -0.19, -0.02);
      forearmPlate.scale.set(0.85, 1.0, 0.72);
      elbow.add(forearmPlate);

      const handGeo = getCachedNrGeo('nr_hand', () => new THREE.SphereGeometry(0.058, 8, 8));
      const handMesh = new THREE.Mesh(handGeo, mats.carapace);
      handMesh.position.set(0, -0.42, 0.01);
      handMesh.scale.set(0.95, 1.25, 0.78);
      elbow.add(handMesh);

      const clawGeom = getCachedNrGeo('nr_claw', () => new THREE.ConeGeometry(0.015, 0.12, 5));
      for (let c = 0; c < 4; c++) {
        const claw = new THREE.Mesh(clawGeom, mats.claw);
        const offsetX = (-1.5 + c) * 0.024;
        claw.position.set(offsetX, -0.52, 0.032);
        claw.rotation.x = Math.PI + 0.28;
        elbow.add(claw);
      }

      return { shoulder, elbow };
    };

    const leftArm = buildArm(-1);
    this.leftShoulder = leftArm.shoulder;
    this.leftElbow = leftArm.elbow;

    const rightArm = buildArm(1);
    this.rightShoulder = rightArm.shoulder;
    this.rightElbow = rightArm.elbow;

    // Articulated Predator Legs (hip at x = ±0.16, y = 0.85)
    const buildLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.16, 0.85, 0);
      this.group.add(hip);

      const thighGeo = getCachedNrGeo('nr_thigh', () => new THREE.CapsuleGeometry(0.088, 0.26, 5, 8));
      const thigh = new THREE.Mesh(thighGeo, this.fleshMat);
      thigh.position.set(0, -0.21, 0);
      hip.add(thigh);

      const thighPlateGeo = getCachedNrGeo('nr_thigh_plate', () => new THREE.CapsuleGeometry(0.068, 0.22, 4, 8));
      const thighPlate = new THREE.Mesh(thighPlateGeo, mats.carapace);
      thighPlate.position.set(side * 0.032, -0.2, 0.024);
      thighPlate.scale.set(0.76, 1.0, 0.78);
      hip.add(thighPlate);

      const knee = new THREE.Group();
      knee.position.set(0, -0.43, 0);
      hip.add(knee);

      const kneeGuardGeo = getCachedNrGeo('nr_knee_guard', () => new THREE.SphereGeometry(0.072, 8, 8));
      const kneeGuard = new THREE.Mesh(kneeGuardGeo, mats.carapace);
      kneeGuard.position.set(0, 0.01, 0.035);
      knee.add(kneeGuard);

      const shinGeo = getCachedNrGeo('nr_shin', () => new THREE.CapsuleGeometry(0.064, 0.28, 5, 8));
      const shin = new THREE.Mesh(shinGeo, mats.pale);
      shin.position.set(0, -0.21, 0);
      knee.add(shin);

      const shinPlateGeo = getCachedNrGeo('nr_shin_plate', () => new THREE.CapsuleGeometry(0.052, 0.22, 4, 8));
      const shinPlate = new THREE.Mesh(shinPlateGeo, mats.carapace);
      shinPlate.position.set(0, -0.2, 0.028);
      shinPlate.scale.set(0.84, 1.0, 0.65);
      knee.add(shinPlate);

      const footGeo = getCachedNrGeo('nr_foot', () => new THREE.CapsuleGeometry(0.056, 0.14, 4, 8));
      const foot = new THREE.Mesh(footGeo, mats.carapace);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(0, -0.42, 0.06);
      foot.scale.set(1.05, 1.0, 0.62);
      knee.add(foot);

      const toeClawGeo = getCachedNrGeo('nr_toe_claw', () => new THREE.ConeGeometry(0.014, 0.07, 5));
      for (let tc = -1; tc <= 1; tc++) {
        const toeClaw = new THREE.Mesh(toeClawGeo, mats.claw);
        toeClaw.position.set(tc * 0.032, -0.435, 0.165);
        toeClaw.rotation.x = Math.PI * 0.48;
        knee.add(toeClaw);
      }

      return { hip, knee };
    };

    const leftLeg = buildLeg(-1);
    this.leftHip = leftLeg.hip;
    this.leftKnee = leftLeg.knee;

    const rightLeg = buildLeg(1);
    this.rightHip = rightLeg.hip;
    this.rightKnee = rightLeg.knee;

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child !== this.leftEye && child !== this.rightEye) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(this.group);
  }

  public getHeadWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.head.getWorldPosition(out);
  }

  public reset(x: number, y: number, z: number): void {
    this.hp = this.maxHp;
    this.state = 'STALK';
    this.frozenForFinisher = false;
    this.attackCooldown = 0;
    this.staggerTimer = 0;
    this.attackSwingTimer = 0;
    this.meleeDealtThisSwing = false;
    this.hitFlashTimer = 0;
    this.fleshMat.emissive.setHex(0x000000);
    this.fleshMat.emissiveIntensity = 0;
    this.knockbackVel.set(0, 0, 0);
    this.groundY = y;
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, 0, 0);
    this.resetArmPositions();
  }

  public resetArmPositions(): void {
    this.leftShoulder.position.copy(this.defaultLeftShoulderPos);
    this.rightShoulder.position.copy(this.defaultRightShoulderPos);
    this.leftShoulder.rotation.set(0, 0, 0);
    this.rightShoulder.rotation.set(0, 0, 0);
    this.leftElbow.rotation.set(0, 0, 0);
    this.rightElbow.rotation.set(0, 0, 0);
  }

  public applyDamage(
    amount: number,
    knockbackDir: THREE.Vector3,
    stunSeconds = 0.6,
    knockbackSpeed = 4.5,
  ): boolean {
    if (this.state === 'DEAD' || this.state === 'FINISHER_GRAB') return false;
    this.hp -= amount;
    this.hitFlashTimer = 0.14;
    this.alerted = true;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'DEAD';
      this.stateTimer = 0;
      return true;
    }
    this.state = 'STAGGER';
    this.staggerTimer = stunSeconds;
    this.knockbackVel.set(knockbackDir.x * knockbackSpeed, 0, knockbackDir.z * knockbackSpeed);
    return false;
  }

  public applyUvRepulsion(dx: number, dz: number, force = 6.0): void {
    if (this.state === 'DEAD' || this.state === 'FINISHER_GRAB') return;
    const len = Math.hypot(dx, dz) || 1;
    this.knockbackVel.set((dx / len) * force, 0, (dz / len) * force);
    if (this.state !== 'STAGGER') {
      this.state = 'STAGGER';
      this.staggerTimer = Math.max(this.staggerTimer, 0.35);
    }
  }

  /**
   * Positions the Night Runner's left & right clawed hands in camera space
   * for Phases 1–3 of the < 3% HP lethal head-grab & crush sequence.
   */
  public poseFinisherGrabInCameraSpace(
    camera: THREE.Camera,
    handSpreadX: number,
    clawTwitch: number,
  ): void {
    this.group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    // Position shoulder pivots in camera space at x = ±handSpreadX, y = -0.05, z = -0.32
    // offsetting up along the arm length so the clawed hands frame the camera temples cleanly.
    const placeHand = (
      shoulder: THREE.Group,
      elbow: THREE.Group,
      side: -1 | 1,
    ) => {
      _nrVecA.set(side * handSpreadX, -0.05, -0.32);
      _nrWorldTarget.copy(_nrVecA).applyMatrix4(camera.matrixWorld);
      this.group.worldToLocal(_nrWorldTarget);

      // Shoulder sits slightly back & down in local space; orient arm straight toward camera
      shoulder.position.set(
        _nrWorldTarget.x + side * 0.08,
        _nrWorldTarget.y - 0.14,
        _nrWorldTarget.z - 0.34,
      );
      camera.getWorldQuaternion(_nrCamQuat);
      this.group.getWorldQuaternion(_nrInvParentQuat).invert();
      shoulder.quaternion.copy(_nrInvParentQuat).multiply(_nrCamQuat);
      shoulder.rotateX(Math.PI * 0.52 + clawTwitch * 0.15);
      shoulder.rotateZ(side * -0.22);
      elbow.rotation.set(-0.28 + clawTwitch * 0.25, 0, side * 0.15);
    };

    placeHand(this.leftShoulder, this.leftElbow, -1);
    placeHand(this.rightShoulder, this.rightElbow, 1);
    this.torso.rotation.x = 0.28;
    this.head.rotation.set(-0.08, 0, 0);
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerHp: number,
    colliders: BoxCollider[],
    sampleGroundHeight: (x: number, z: number) => number,
    isNight: boolean,
    isFinisherActive: boolean,
  ): NightRunnerUpdateResult {
    const out: NightRunnerUpdateResult = {
      dealtDamage: 0,
      triggeredFinisher: false,
    };

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flashRatio = this.hitFlashTimer / 0.14;
      this.fleshMat.emissive.setHex(0xb91c1c);
      this.fleshMat.emissiveIntensity = flashRatio * 1.35;
    } else if (this.fleshMat.emissiveIntensity !== 0) {
      this.fleshMat.emissiveIntensity = 0;
    }

    if (this.state === 'DEAD') {
      this.stateTimer += dt;
      // Collapse onto ground smoothly
      this.group.rotation.x = THREE.MathUtils.lerp(
        this.group.rotation.x,
        -Math.PI * 0.48,
        1 - Math.exp(-dt * 9),
      );
      this.group.position.y = THREE.MathUtils.lerp(
        this.group.position.y,
        this.groundY + 0.14,
        1 - Math.exp(-dt * 9),
      );
      return out;
    }

    if (this.state === 'FINISHER_GRAB') {
      return out;
    }

    if (isFinisherActive || this.frozenForFinisher || this.state === 'IDLE') {
      return out;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const horizDist = Math.hypot(dx, dz);
    const dy = Math.abs(playerPos.y - this.group.position.y);

    // Check immediate < 3% HP proximity finisher trigger
    if (playerHp > 0 && playerHp < 3 && horizDist <= 2.4 && dy < 2.2) {
      out.triggeredFinisher = true;
      return out;
    }

    // Handle STAGGER knockback state
    if (this.state === 'STAGGER') {
      this.staggerTimer -= dt;
      this.moveWithColliders(
        this.knockbackVel.x * dt,
        this.knockbackVel.z * dt,
        colliders,
        sampleGroundHeight,
        dt,
      );
      this.knockbackVel.multiplyScalar(Math.exp(-dt * 6.5));
      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, -0.22, 1 - Math.exp(-dt * 12));
      this.leftShoulder.rotation.set(-0.5, 0, -0.45);
      this.rightShoulder.rotation.set(-0.5, 0, 0.45);
      if (this.staggerTimer <= 0) {
        this.state = horizDist <= 35 || this.alerted ? 'CHASE' : 'STALK';
      }
      return out;
    }

    // Detect player within 35m or nighttime aggro
    const detectDist = isNight ? 42 : 35;
    if (horizDist <= detectDist) {
      this.alerted = true;
    }

    // Transition between STALK / CHASE / ATTACK_MELEE
    if (this.state === 'STALK') {
      if (horizDist <= detectDist || this.alerted) {
        this.state = 'CHASE';
      }
    } else if (this.state === 'CHASE') {
      if (horizDist <= 2.1 && dy < 2.1 && this.attackCooldown <= 0) {
        this.state = 'ATTACK_MELEE';
        this.attackSwingTimer = 0;
        this.meleeDealtThisSwing = false;
      } else if (horizDist > 48 && !this.alerted) {
        this.state = 'STALK';
      }
    } else if (this.state === 'ATTACK_MELEE') {
      this.attackSwingTimer += dt;
      const targetYaw = Math.atan2(dx, dz);
      this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-dt * 14));
      this.group.rotation.y = this.yaw;

      const swingProgress = Math.min(1, this.attackSwingTimer / 0.44);
      const windup = swingProgress < 0.42 ? swingProgress / 0.42 : 1 - (swingProgress - 0.42) / 0.58;
      this.leftShoulder.rotation.set(-1.35 * windup - 0.55, 0.2, -0.2);
      this.rightShoulder.rotation.set(-1.55 * windup - 0.65, -0.2, 0.2);
      this.leftElbow.rotation.set(-0.45, 0, 0);
      this.rightElbow.rotation.set(-0.45, 0, 0);
      this.torso.rotation.x = 0.35 + windup * 0.28;
      const biteFlare = 0.26 + windup * 0.42;
      this.leftMandible.rotation.set(0.28 + windup * 0.28, -0.34 - biteFlare * 0.55, 0.26 + biteFlare * 0.22);
      this.rightMandible.rotation.set(0.28 + windup * 0.28, 0.34 + biteFlare * 0.55, -0.26 - biteFlare * 0.22);

      if (!this.meleeDealtThisSwing && this.attackSwingTimer >= 0.19) {
        this.meleeDealtThisSwing = true;
        if (horizDist <= 2.45 && dy < 2.2) {
          if (playerHp > 0 && playerHp < 3) {
            out.triggeredFinisher = true;
            return out;
          }
          out.dealtDamage = 18;
        }
      }

      if (this.attackSwingTimer >= 0.46) {
        this.attackCooldown = 0.95;
        this.state = 'CHASE';
      }
      return out;
    }

    // Movement & Gait Animation for STALK / CHASE
    let moveSpeed = 2.2;
    let targetYaw = this.yaw;

    if (this.state === 'CHASE') {
      moveSpeed = 7.8;
      targetYaw = Math.atan2(dx, dz);
      // Slight evasive flanking weave while closing distance
      if (horizDist > 4.5 && horizDist < 16) {
        targetYaw += Math.sin(this.animPhase * 0.6 + this.id) * 0.24;
      }
    } else {
      // STALK prowl
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrolTimer = 2.2 + Math.random() * 2.5;
        this.patrolAngle += (Math.random() - 0.5) * 1.6;
      }
      targetYaw = this.patrolAngle;
    }

    this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-dt * 9.5));
    this.group.rotation.y = this.yaw;

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    this.moveWithColliders(fwdX * moveSpeed * dt, fwdZ * moveSpeed * dt, colliders, sampleGroundHeight, dt);

    // Apply residual knockback decay
    if (this.knockbackVel.lengthSq() > 0.01) {
      this.moveWithColliders(
        this.knockbackVel.x * dt,
        this.knockbackVel.z * dt,
        colliders,
        sampleGroundHeight,
        dt,
      );
      this.knockbackVel.multiplyScalar(Math.exp(-dt * 6));
    }

    // Limb sprint / stalk animation
    const strideRate = this.state === 'CHASE' ? 14.5 : 4.8;
    const strideAmp = this.state === 'CHASE' ? 0.92 : 0.36;
    this.animPhase += dt * strideRate;
    const s = Math.sin(this.animPhase);
    const c = Math.cos(this.animPhase);

    this.torso.rotation.x = (this.state === 'CHASE' ? 0.44 : 0.35) + Math.abs(s) * 0.06;
    this.torso.rotation.z = c * 0.06;
    this.head.rotation.x = 0.14 - Math.abs(s) * 0.05;
    this.head.rotation.y = Math.sin(this.animPhase * 0.5) * 0.1;

    this.leftHip.rotation.x = s * strideAmp;
    this.rightHip.rotation.x = -s * strideAmp;
    this.leftKnee.rotation.x = Math.max(0, -s) * 0.95;
    this.rightKnee.rotation.x = Math.max(0, s) * 0.95;

    if (this.state === 'CHASE') {
      // Aggressive forward-reaching predator sprint arms
      this.leftShoulder.rotation.set(-0.95 - s * 0.68, 0.12, -0.14);
      this.rightShoulder.rotation.set(-0.95 + s * 0.68, -0.12, 0.14);
      this.leftElbow.rotation.set(-0.62, 0, 0);
      this.rightElbow.rotation.set(-0.62, 0, 0);
    } else {
      this.leftShoulder.rotation.set(-0.25 - s * 0.3, 0, -0.08);
      this.rightShoulder.rotation.set(-0.25 + s * 0.3, 0, 0.08);
      this.leftElbow.rotation.set(-0.35, 0, 0);
      this.rightElbow.rotation.set(-0.35, 0, 0);
    }

    // Snarling split mandibles flare during CHASE, subtle twitch during STALK
    const mandibleSnarl = this.state === 'CHASE' ? 0.14 + Math.abs(s) * 0.12 : Math.max(0, s) * 0.04;
    this.leftMandible.rotation.set(0.28 + mandibleSnarl * 0.5, -0.34 - mandibleSnarl, 0.26 + mandibleSnarl * 0.3);
    this.rightMandible.rotation.set(0.28 + mandibleSnarl * 0.5, 0.34 + mandibleSnarl, -0.26 - mandibleSnarl * 0.3);

    // Subtle sinister flicker on glowing fiery orange-amber eyes
    this.eyeMat.emissiveIntensity = 2.4 + Math.sin(this.animPhase * 1.4) * 0.55;

    return out;
  }

  private moveWithColliders(
    stepX: number,
    stepZ: number,
    colliders: BoxCollider[],
    sampleGroundHeight: (x: number, z: number) => number,
    dt: number,
  ): void {
    const r = 0.44;
    let nx = THREE.MathUtils.clamp(this.group.position.x + stepX, -104, 54);
    let nz = THREE.MathUtils.clamp(this.group.position.z + stepZ, -102, 48);

    const curY = this.group.position.y;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.disabled || b.ramp || b.cushion) continue;
      if (curY >= b.maxY - 0.35 || curY + 1.75 < b.minY) continue;
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const dx = nx - cx;
      const dz = nz - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < r * r) {
        const d = Math.sqrt(dSq) || 0.001;
        nx += (dx / d) * (r - d);
        nz += (dz / d) * (r - d);
      }
    }

    this.group.position.x = nx;
    this.group.position.z = nz;
    const sampledY = sampleGroundHeight(nx, nz);
    this.groundY = THREE.MathUtils.lerp(this.groundY, sampledY, 1 - Math.exp(-dt * 14));
    this.group.position.y = this.groundY;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    // Shared geometries are cached in nrGeoCache across NightRunner instances; dispose only per-instance materials
    this.fleshMat.dispose();
    this.eyeMat.dispose();
  }
}

function lerpAngle(current: number, target: number, t: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}
