import * as THREE from 'three';
import type { BoxCollider } from '../types/game';

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

let sharedSkinMat: THREE.MeshStandardMaterial | null = null;
let sharedHeadMat: THREE.MeshStandardMaterial | null = null;
let sharedEyeMat: THREE.MeshStandardMaterial | null = null;
let sharedClawMat: THREE.MeshStandardMaterial | null = null;
let sharedRagMat: THREE.MeshStandardMaterial | null = null;

function getNightRunnerMaterials() {
  if (!sharedSkinMat) {
    sharedSkinMat = new THREE.MeshStandardMaterial({
      color: 0x2b2629,
      roughness: 0.85,
      metalness: 0.05,
    });
    sharedHeadMat = new THREE.MeshStandardMaterial({
      color: 0x3a3235,
      roughness: 0.82,
      metalness: 0.05,
    });
    sharedEyeMat = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff2200,
      emissiveIntensity: 3.0,
      roughness: 0.2,
    });
    sharedClawMat = new THREE.MeshStandardMaterial({
      color: 0x4a1c1c,
      roughness: 0.55,
      metalness: 0.12,
    });
    sharedRagMat = new THREE.MeshStandardMaterial({
      color: 0x1d1a1c,
      roughness: 0.92,
      metalness: 0.02,
    });
  }
  return {
    skin: sharedSkinMat,
    head: sharedHeadMat!,
    eye: sharedEyeMat!,
    claw: sharedClawMat!,
    rag: sharedRagMat!,
  };
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

  constructor(id: number, x: number, y: number, z: number, scene: THREE.Scene) {
    this.id = id;
    this.groundY = y;
    const mats = getNightRunnerMaterials();

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);

    // Hunched Torso (0.55w x 0.85h x 0.32d, rotation.x = 0.35 rad forward)
    this.torso = new THREE.Group();
    this.torso.position.set(0, 1.08, 0);
    this.torso.rotation.x = 0.35;
    this.group.add(this.torso);

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), mats.skin);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    this.torso.add(torsoMesh);

    // Tattered spine & chest rib shreds for distinct silhouette
    const chestShred = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.34), mats.rag);
    chestShred.position.set(0, -0.14, 0);
    chestShred.castShadow = true;
    this.torso.add(chestShred);

    const spineRidge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), mats.head);
    spineRidge.position.set(0, 0.06, -0.16);
    this.torso.add(spineRidge);

    // Head (0.28w x 0.32h x 0.30d, slightly tilted forward)
    this.head = new THREE.Group();
    this.head.position.set(0, 1.54, 0.22);
    this.head.rotation.x = 0.14;
    this.group.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.3), mats.head);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    this.head.add(headMesh);

    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.24), mats.claw);
    jawMesh.position.set(0, -0.15, 0.04);
    jawMesh.rotation.x = 0.18;
    this.head.add(jawMesh);

    // Emissive glowing red eyes (radius 0.035) facing +Z
    const eyeGeom = new THREE.SphereGeometry(0.035, 10, 10);
    this.leftEye = new THREE.Mesh(eyeGeom, mats.eye);
    this.leftEye.position.set(-0.068, 0.04, 0.148);
    this.head.add(this.leftEye);

    this.rightEye = new THREE.Mesh(eyeGeom, mats.eye);
    this.rightEye.position.set(0.068, 0.04, 0.148);
    this.head.add(this.rightEye);

    // Articulated Left & Right Arms (shoulder at x = ±0.36, y = 1.35)
    const buildArm = (side: -1 | 1) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.36, 1.35, 0.08);
      this.group.add(shoulder);

      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), mats.skin);
      upperArm.position.set(0, -0.2, 0);
      upperArm.castShadow = true;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.42, 0);
      shoulder.add(elbow);

      const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.42, 0.115), mats.skin);
      lowerArm.position.set(0, -0.2, 0);
      lowerArm.castShadow = true;
      elbow.add(lowerArm);

      const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.09), mats.claw);
      handMesh.position.set(0, -0.44, 0.01);
      handMesh.castShadow = true;
      elbow.add(handMesh);

      // 4 blood-stained clawed fingertips
      const clawGeom = new THREE.ConeGeometry(0.016, 0.11, 5);
      for (let c = 0; c < 4; c++) {
        const claw = new THREE.Mesh(clawGeom, mats.claw);
        const offsetX = (-1.5 + c) * 0.025;
        claw.position.set(offsetX, -0.53, 0.03);
        claw.rotation.x = Math.PI + 0.25;
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

    // Articulated Sprint Legs (hip at x = ±0.16, y = 0.85)
    const buildLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.16, 0.85, 0);
      this.group.add(hip);

      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.18), mats.rag);
      thigh.position.set(0, -0.21, 0);
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -0.43, 0);
      hip.add(knee);

      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.15), mats.skin);
      shin.position.set(0, -0.21, 0);
      shin.castShadow = true;
      knee.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), mats.claw);
      foot.position.set(0, -0.42, 0.05);
      foot.castShadow = true;
      knee.add(foot);

      return { hip, knee };
    };

    const leftLeg = buildLeg(-1);
    this.leftHip = leftLeg.hip;
    this.leftKnee = leftLeg.knee;

    const rightLeg = buildLeg(1);
    this.rightHip = rightLeg.hip;
    this.rightKnee = rightLeg.knee;

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

    // Subtle sinister flicker on glowing red eyes
    const eyePulse = 2.6 + Math.sin(this.animPhase * 1.4) * 0.5;
    sharedEyeMat!.emissiveIntensity = eyePulse;

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
    this.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}

function lerpAngle(current: number, target: number, t: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}
