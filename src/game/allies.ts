import * as THREE from 'three';
import type { BoxCollider } from '../types/game';
import type { InfectedEnemy } from './infectedEnemy';
import type { NightRunner } from './nightRunner';
import type { TerritoryRuntime, TerritorySector } from './territories';
import type { ZombieActor } from './zombies';

export const ALLY_NAMES = [
  'Aarav',
  'Kabir',
  'Rohan',
  'Vikram',
  'Dev',
  'Zoya',
  'Meera',
  'Tariq',
] as const;

export type AllyState = 'PATROL' | 'FOLLOW' | 'COMBAT' | 'DEAD';
export type AllyCommandMode = 'FOLLOW' | 'PATROL';

export type AllyTargetRef =
  | { kind: 'zombie'; actor: ZombieActor }
  | { kind: 'screamer'; actor: InfectedEnemy }
  | { kind: 'night_runner'; actor: NightRunner };

export interface AllyUpdateEvents {
  killDelta: number;
  impactPositions: THREE.Vector3[];
  newlyDeadNames: string[];
}

declare global {
  interface Window {
    allies?: AllySurvivor[];
  }
}

// Pre-allocated scratch helpers (zero GC inside frame loop)
const _dir = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _slotPos = new THREE.Vector3();
const _playerFwd = new THREE.Vector3();
const _playerRight = new THREE.Vector3();
const _sepVec = new THREE.Vector3();

function lerpAngle(current: number, target: number, t: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, t);
}

interface AllyMaterialSet {
  vest: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  armband: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  scarf: THREE.MeshStandardMaterial;
  pipe: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
}

export class AllySurvivor {
  public readonly id: number;
  public readonly name: string;
  public readonly mesh: THREE.Group;
  public hp = 130;
  public maxHp = 130;
  public state: AllyState;
  public homeTerritory: TerritorySector | null;
  public attackCooldown = 0;
  public staggerTimer = 0;
  public targetEnemy: AllyTargetRef | null = null;
  public walkCycleTime = Math.random() * Math.PI * 2;

  public commandMode: AllyCommandMode;
  public readonly guardCenter = new THREE.Vector3();
  public yaw = 0;
  public groundY = 0;

  private readonly leftArmGroup: THREE.Group;
  private readonly rightArmGroup: THREE.Group;
  private readonly leftLegGroup: THREE.Group;
  private readonly rightLegGroup: THREE.Group;
  private readonly torsoGroup: THREE.Group;
  private readonly headGroup: THREE.Group;

  private swingTimer = 0;
  private swingHitDone = false;
  private enemyHitCooldown = 0;
  private readonly patrolTarget = new THREE.Vector3();
  private patrolWaitTimer = 0.6;
  private hasPatrolTarget = false;

  constructor(
    id: number,
    name: string,
    x: number,
    y: number,
    z: number,
    initialMode: AllyCommandMode,
    homeTerritory: TerritorySector | null,
    mats: AllyMaterialSet,
    scene: THREE.Scene,
  ) {
    this.id = id;
    this.name = name;
    this.state = initialMode;
    this.commandMode = initialMode;
    this.homeTerritory = homeTerritory;
    this.groundY = y;

    if (homeTerritory) {
      this.guardCenter.set(homeTerritory.center.x, y, homeTerritory.center.z);
    } else {
      this.guardCenter.set(x, y, z);
    }

    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, 0, 0);

    // 2.2 Articulated Low-Poly Survivor Geometry (Total Height: 1.78m, Upright Posture)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 1.15, 0);
    this.torsoGroup.rotation.x = 0;
    this.mesh.add(this.torsoGroup);

    // Dark long-sleeve shirt base (0.48w x 0.74h x 0.27d)
    const shirtTorso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.74, 0.27), mats.shirt);
    shirtTorso.castShadow = true;
    shirtTorso.receiveShadow = true;
    this.torsoGroup.add(shirtTorso);

    // Olive-ochre tactical vest (#5a6e4c) over torso (0.52w x 0.56h x 0.30d envelope)
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.3), mats.vest);
    vestMesh.position.set(0, 0.04, 0);
    vestMesh.castShadow = true;
    vestMesh.receiveShadow = true;
    this.torsoGroup.add(vestMesh);

    // Tactical chest pouch & shoulder straps for readable survivor silhouette
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), mats.grip);
    pouch.position.set(0, -0.1, 0.16);
    this.torsoGroup.add(pouch);

    // Muted saffron/amber neck scarf (#d97706)
    const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.155, 0.11, 10), mats.scarf);
    scarf.position.set(0, 0.38, 0.01);
    scarf.castShadow = true;
    this.torsoGroup.add(scarf);

    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.05), mats.scarf);
    scarfTail.position.set(-0.07, 0.28, 0.14);
    scarfTail.rotation.z = 0.16;
    this.torsoGroup.add(scarfTail);

    // Head (#c68b6b) + Dark hair cap (#1c1a19) -> crown at y = 1.78m
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.49, 0);
    this.torsoGroup.add(this.headGroup);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.24, 0.23), mats.skin);
    headMesh.position.set(0, 0.01, 0);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.25), mats.hair);
    hairCap.position.set(0, 0.1, -0.01);
    hairCap.castShadow = true;
    this.headGroup.add(hairCap);

    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.08), mats.hair);
    hairBack.position.set(0, 0.03, -0.095);
    this.headGroup.add(hairBack);

    // Shoulder-pivoted Left & Right Arms + Bright Survivor Armbands (#00d8ff)
    const buildArm = (side: -1 | 1): THREE.Group => {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.33, 1.46, 0);
      this.mesh.add(armGroup);

      const upperSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.3, 0.135), mats.shirt);
      upperSleeve.position.set(0, -0.14, 0);
      upperSleeve.castShadow = true;
      armGroup.add(upperSleeve);

      // Bright cyan survivor armband on upper arm (#00d8ff, emissive 0x006688)
      const armband = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.085, 0.15), mats.armband);
      armband.position.set(0, -0.15, 0);
      armGroup.add(armband);

      const forearmSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.28, 0.115), mats.shirt);
      forearmSleeve.position.set(0, -0.41, 0.02);
      forearmSleeve.rotation.x = -0.12;
      forearmSleeve.castShadow = true;
      armGroup.add(forearmSleeve);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.11, 0.095), mats.skin);
      hand.position.set(0, -0.58, 0.04);
      hand.castShadow = true;
      armGroup.add(hand);

      return armGroup;
    };

    this.leftArmGroup = buildArm(-1);
    this.rightArmGroup = buildArm(1);

    // Reinforced steel pipe / cricket bat attached to rightArmGroup (#94a3b8, metalness 0.65, roughness 0.35, length 0.95m)
    const weaponPivot = new THREE.Group();
    weaponPivot.position.set(0, -0.58, 0.05);
    weaponPivot.rotation.x = Math.PI * 0.36; // angled forward in ready stance
    this.rightArmGroup.add(weaponPivot);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.26, 8), mats.grip);
    grip.position.set(0, 0.02, 0);
    weaponPivot.add(grip);

    const steelPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.022, 0.69, 8), mats.pipe);
    steelPipe.position.set(0, 0.495, 0); // total 0.26 + 0.69 = 0.95m
    steelPipe.castShadow = true;
    weaponPivot.add(steelPipe);

    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 8), mats.pipe);
    flange.position.set(0, 0.82, 0);
    weaponPivot.add(flange);

    // Hip-pivoted Left & Right Legs (y = 0.80 down to y = 0)
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const legGroup = new THREE.Group();
      legGroup.position.set(side * 0.13, 0.8, 0);
      this.mesh.add(legGroup);

      const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.68, 0.18), mats.pants);
      legMesh.position.set(0, -0.34, 0);
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      legGroup.add(legMesh);

      const bootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.14, 0.24), mats.boot);
      bootMesh.position.set(0, -0.73, 0.03);
      bootMesh.castShadow = true;
      legGroup.add(bootMesh);

      return legGroup;
    };

    this.leftLegGroup = buildLeg(-1);
    this.rightLegGroup = buildLeg(1);

    scene.add(this.mesh);
  }

  public getNameplateWorldPos(out: THREE.Vector3): THREE.Vector3 {
    out.set(this.mesh.position.x, this.mesh.position.y + 2.02, this.mesh.position.z);
    return out;
  }

  public applyHitFromEnemy(dmg: number): boolean {
    if (this.state === 'DEAD') return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.staggerTimer = Math.max(this.staggerTimer, 0.32);
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'DEAD';
      this.targetEnemy = null;
      this.swingTimer = 0;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = this.groundY + 0.15;
      return true;
    }
    return false;
  }

  public update(
    dt: number,
    elapsed: number,
    slotIndex: number,
    totalFollowers: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    allies: AllySurvivor[],
    sectors: TerritoryRuntime[],
    zombies: ZombieActor[],
    damageZombie: (z: ZombieActor, dmg: number, dir: THREE.Vector3, knockback?: number, stunDuration?: number, forceInterrupt?: boolean) => boolean,
    screamers: InfectedEnemy[],
    nightRunners: NightRunner[],
    colliders: BoxCollider[],
    sampleGroundHeight: (x: number, z: number, curY: number) => number,
    outEvents: AllyUpdateEvents,
  ): void {
    if (this.state === 'DEAD') {
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -Math.PI / 2, 1 - Math.exp(-dt * 12));
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, this.groundY + 0.15, 1 - Math.exp(-dt * 12));
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.enemyHitCooldown = Math.max(0, this.enemyHitCooldown - dt);
    if (this.staggerTimer > 0) {
      this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    }

    // Liberated UV Territory Safe-Zone Healing (+8 HP/sec)
    for (let i = 0; i < sectors.length; i++) {
      const sec = sectors[i].data;
      if (!sec.captured) continue;
      const distSq =
        (this.mesh.position.x - sec.center.x) * (this.mesh.position.x - sec.center.x) +
        (this.mesh.position.z - sec.center.z) * (this.mesh.position.z - sec.center.z);
      if (distSq <= sec.radius * sec.radius) {
        this.hp = Math.min(this.maxHp, this.hp + 8 * dt);
        break;
      }
    }

    // Enemy proximity melee strikes against this ally (8 dmg, 1.3s cooldown)
    if (this.enemyHitCooldown <= 0) {
      let struck = false;
      const ax = this.mesh.position.x;
      const ay = this.mesh.position.y;
      const az = this.mesh.position.z;

      for (let i = 0; i < nightRunners.length && !struck; i++) {
        const nr = nightRunners[i];
        if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB' || nr.state === 'STAGGER') continue;
        if (
          Math.hypot(nr.group.position.x - ax, nr.group.position.z - az) <= 2.0 &&
          Math.abs(nr.group.position.y - ay) < 1.9
        ) {
          struck = true;
        }
      }

      for (let i = 0; i < zombies.length && !struck; i++) {
        const z = zombies[i];
        if (z.state === 'dead' || z.state === 'stunned') continue;
        if (Math.hypot(z.pos.x - ax, z.pos.z - az) <= 2.0 && Math.abs(z.pos.y - ay) < 1.9) {
          struck = true;
        }
      }

      for (let i = 0; i < screamers.length && !struck; i++) {
        const sc = screamers[i];
        if (
          sc.aiState === 'DEAD' ||
          sc.aiState === 'IMPALED_DEAD' ||
          sc.aiState === 'DEAD_RAGDOLL' ||
          sc.aiState === 'GRABBED' ||
          sc.aiState === 'STAGGER' ||
          sc.aiState === 'KNOCKDOWN'
        ) {
          continue;
        }
        if (
          Math.hypot(sc.root.position.x - ax, sc.root.position.z - az) <= 2.0 &&
          Math.abs(sc.root.position.y - ay) < 1.9
        ) {
          struck = true;
        }
      }

      if (struck) {
        this.enemyHitCooldown = 1.3;
        if (this.applyHitFromEnemy(8)) {
          outEvents.newlyDeadNames.push(this.name);
          return;
        }
      }
    }

    // -------------------------------------------------------------------------
    // Target Acquisition (16.0m of ally OR 14.0m of player when FOLLOW)
    // -------------------------------------------------------------------------
    let bestTarget: AllyTargetRef | null = null;
    let bestScore = Infinity;

    const considerTarget = (ref: AllyTargetRef, tx: number, ty: number, tz: number) => {
      if (Math.abs(ty - this.mesh.position.y) > 4.2) return;
      const distAlly = Math.hypot(tx - this.mesh.position.x, tz - this.mesh.position.z);
      const distPlayer = Math.hypot(tx - playerPos.x, tz - playerPos.z);
      const inAllyRange = distAlly <= 16.0;
      const inFollowRange = this.commandMode === 'FOLLOW' && distPlayer <= 14.0;
      if (!inAllyRange && !inFollowRange) return;
      const score = distAlly - (ref.kind === 'night_runner' ? 2.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestTarget = ref;
      }
    };

    for (let i = 0; i < nightRunners.length; i++) {
      const nr = nightRunners[i];
      if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB') continue;
      considerTarget(
        { kind: 'night_runner', actor: nr },
        nr.group.position.x,
        nr.group.position.y,
        nr.group.position.z,
      );
    }

    for (let i = 0; i < screamers.length; i++) {
      const sc = screamers[i];
      if (
        sc.aiState === 'DEAD' ||
        sc.aiState === 'IMPALED_DEAD' ||
        sc.aiState === 'DEAD_RAGDOLL' ||
        sc.aiState === 'GRABBED'
      ) {
        continue;
      }
      considerTarget(
        { kind: 'screamer', actor: sc },
        sc.root.position.x,
        sc.root.position.y,
        sc.root.position.z,
      );
    }

    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.state === 'dead') continue;
      considerTarget({ kind: 'zombie', actor: z }, z.pos.x, z.pos.y, z.pos.z);
    }

    this.targetEnemy = bestTarget;
    this.state = bestTarget ? 'COMBAT' : this.commandMode;

    // -------------------------------------------------------------------------
    // Swing Timing & Melee Hit Peak (0.35s animation, peak at 0.16s, cooldown 1.15s)
    // -------------------------------------------------------------------------
    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const swingElapsed = 0.35 - this.swingTimer;
      if (!this.swingHitDone && swingElapsed >= 0.16) {
        this.swingHitDone = true;
        if (this.targetEnemy) {
          this.getTargetPosition(this.targetEnemy, _targetPos);
          const hitDist = Math.hypot(
            _targetPos.x - this.mesh.position.x,
            _targetPos.z - this.mesh.position.z,
          );
          if (hitDist <= 2.65 && Math.abs(_targetPos.y - this.mesh.position.y) < 2.3) {
            _dir.set(_targetPos.x - this.mesh.position.x, 0, _targetPos.z - this.mesh.position.z);
            if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
            else _dir.normalize();

            let killed = false;
            if (this.targetEnemy.kind === 'zombie') {
              killed = damageZombie(this.targetEnemy.actor, 15, _dir, 3.2, 0.55, true);
            } else if (this.targetEnemy.kind === 'night_runner') {
              killed = this.targetEnemy.actor.applyDamage(15, _dir, 0.55, 3.2);
            } else {
              const sc = this.targetEnemy.actor;
              sc.health -= 15;
              if (sc.health <= 0) {
                sc.markDead(_dir);
                killed = true;
              } else {
                sc.applyStagger(_dir, 'left_to_right', true);
                sc.staggerTimer = Math.max(sc.staggerTimer, 0.55);
                sc.velocity.x = _dir.x * 3.2;
                sc.velocity.z = _dir.z * 3.2;
              }
            }
            if (killed) {
              outEvents.killDelta++;
            }
            outEvents.impactPositions.push(
              new THREE.Vector3(_targetPos.x, _targetPos.y + 1.15, _targetPos.z),
            );
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Movement & Locomotion per State
    // -------------------------------------------------------------------------
    let moveSpeed = 0;
    let isSprinting = false;
    let destX = this.mesh.position.x;
    let destZ = this.mesh.position.z;
    let lookTargetYaw: number | null = null;

    if (this.staggerTimer > 0) {
      moveSpeed = 0;
    } else if (this.state === 'COMBAT' && this.targetEnemy) {
      this.getTargetPosition(this.targetEnemy, _targetPos);
      destX = _targetPos.x;
      destZ = _targetPos.z;
      const distToEnemy = Math.hypot(destX - this.mesh.position.x, destZ - this.mesh.position.z);
      lookTargetYaw = Math.atan2(destX - this.mesh.position.x, destZ - this.mesh.position.z);

      if (distToEnemy <= 2.15) {
        moveSpeed = 0;
        if (this.attackCooldown <= 0 && this.swingTimer <= 0) {
          this.attackCooldown = 1.15;
          this.swingTimer = 0.35;
          this.swingHitDone = false;
        }
      } else {
        moveSpeed = 6.6;
        isSprinting = true;
      }
    } else if (this.state === 'FOLLOW') {
      _playerFwd.set(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
      _playerRight.set(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
      const centeredIdx = slotIndex - (totalFollowers - 1) * 0.5;
      const sideOffset =
        totalFollowers === 1 ? -1.4 : centeredIdx * 1.9;
      const backDist = 3.2 + Math.floor(slotIndex / 3) * 1.6;
      _slotPos
        .copy(playerPos)
        .addScaledVector(_playerFwd, -backDist)
        .addScaledVector(_playerRight, sideOffset);

      destX = _slotPos.x;
      destZ = _slotPos.z;
      const distToSlot = Math.hypot(destX - this.mesh.position.x, destZ - this.mesh.position.z);
      if (distToSlot <= 1.8) {
        moveSpeed = 0;
        lookTargetYaw = playerYaw + Math.PI;
      } else {
        moveSpeed = distToSlot > 7.0 ? 6.4 : 3.8;
        isSprinting = distToSlot > 7.0;
        lookTargetYaw = Math.atan2(destX - this.mesh.position.x, destZ - this.mesh.position.z);
      }
    } else {
      // PATROL within 12m of homeTerritory.center or guardCenter
      const cx = this.homeTerritory ? this.homeTerritory.center.x : this.guardCenter.x;
      const cz = this.homeTerritory ? this.homeTerritory.center.z : this.guardCenter.z;
      if (!this.hasPatrolTarget) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 2.5 + Math.random() * 9.0; // within 12m radius
        this.patrolTarget.set(cx + Math.cos(ang) * rad, this.groundY, cz + Math.sin(ang) * rad);
        this.hasPatrolTarget = true;
      }
      destX = this.patrolTarget.x;
      destZ = this.patrolTarget.z;
      const distToWp = Math.hypot(destX - this.mesh.position.x, destZ - this.mesh.position.z);
      if (distToWp <= 0.65) {
        moveSpeed = 0;
        this.patrolWaitTimer -= dt;
        // Look around while guarding
        lookTargetYaw = this.yaw + Math.sin(elapsed * 1.1 + this.id) * 0.45 * dt * 2.5;
        if (this.patrolWaitTimer <= 0) {
          this.patrolWaitTimer = 2.0;
          this.hasPatrolTarget = false;
        }
      } else {
        moveSpeed = 2.3;
        lookTargetYaw = Math.atan2(destX - this.mesh.position.x, destZ - this.mesh.position.z);
      }
    }

    if (lookTargetYaw !== null) {
      this.yaw = lerpAngle(this.yaw, lookTargetYaw, dt * 10.0);
      this.mesh.rotation.y = this.yaw;
    }

    // Apply displacement + ally separation (>= 1.4m) + world collider pushout
    let nx = this.mesh.position.x;
    let nz = this.mesh.position.z;
    if (moveSpeed > 0.01) {
      const dx = destX - nx;
      const dz = destZ - nz;
      const dist = Math.hypot(dx, dz) || 1;
      const step = Math.min(dist, moveSpeed * dt);
      nx += (dx / dist) * step;
      nz += (dz / dist) * step;
    }

    // Minimum 1.4m separation between living allies so squads never stack
    _sepVec.set(0, 0, 0);
    for (let i = 0; i < allies.length; i++) {
      const other = allies[i];
      if (other === this || other.state === 'DEAD') continue;
      const sx = nx - other.mesh.position.x;
      const sz = nz - other.mesh.position.z;
      const dSq = sx * sx + sz * sz;
      if (dSq < 1.4 * 1.4) {
        const d = Math.sqrt(dSq);
        if (d < 0.001) {
          const ang = (this.id * 2.1) % (Math.PI * 2);
          _sepVec.x += Math.cos(ang) * 0.6;
          _sepVec.z += Math.sin(ang) * 0.6;
        } else {
          const push = (1.4 - d) * 0.52;
          _sepVec.x += (sx / d) * push;
          _sepVec.z += (sz / d) * push;
        }
      }
    }
    nx += _sepVec.x;
    nz += _sepVec.z;

    // World wall/crate collider pushout
    const allyRadius = 0.36;
    const cy = this.mesh.position.y;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.disabled || b.ramp || b.cushion) continue;
      if (cy >= b.maxY - 0.35 || cy + 1.75 < b.minY) continue;
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const ox = nx - cx;
      const oz = nz - cz;
      const dSq = ox * ox + oz * oz;
      if (dSq < allyRadius * allyRadius) {
        const d = Math.sqrt(dSq) || 0.001;
        nx += (ox / d) * (allyRadius - d);
        nz += (oz / d) * (allyRadius - d);
      }
    }

    nx = THREE.MathUtils.clamp(nx, -104, 54);
    nz = THREE.MathUtils.clamp(nz, -102, 48);
    this.mesh.position.x = nx;
    this.mesh.position.z = nz;

    const targetGround = sampleGroundHeight(nx, nz, this.groundY);
    this.groundY = THREE.MathUtils.lerp(this.groundY, targetGround, 1 - Math.exp(-dt * 12));
    this.mesh.position.y = this.groundY;

    // -------------------------------------------------------------------------
    // Limb & Weapon Swing Animation
    // -------------------------------------------------------------------------
    if (moveSpeed > 0.1) {
      this.walkCycleTime += dt * (isSprinting ? 1.0 : 0.55);
    }
    const stride =
      moveSpeed > 0.1
        ? Math.sin(this.walkCycleTime * 14) * (isSprinting ? 0.62 : 0.34)
        : 0;
    const idleBreath = Math.sin(elapsed * 2.4 + this.id) * 0.035;

    this.leftLegGroup.rotation.x = stride;
    this.rightLegGroup.rotation.x = -stride;
    this.leftArmGroup.rotation.x = -stride * 0.72 + (moveSpeed <= 0.1 ? idleBreath : 0);
    this.torsoGroup.rotation.x = this.staggerTimer > 0 ? -0.22 : isSprinting ? 0.12 : 0.02 + idleBreath * 0.4;

    if (this.swingTimer > 0) {
      const p = 1 - this.swingTimer / 0.35;
      // Overhead-to-diagonal cleave peaking around p = 0.46 (0.16s)
      const swingArc = p < 0.46 ? THREE.MathUtils.lerp(-2.2, -0.35, p / 0.46) : THREE.MathUtils.lerp(-0.35, -0.8, (p - 0.46) / 0.54);
      this.rightArmGroup.rotation.x = swingArc;
      this.rightArmGroup.rotation.z = -0.32 * Math.sin(p * Math.PI);
    } else {
      this.rightArmGroup.rotation.x = stride * 0.55 - 0.42 + (moveSpeed <= 0.1 ? -idleBreath : 0);
      this.rightArmGroup.rotation.z = 0;
    }
  }

  private getTargetPosition(ref: AllyTargetRef, out: THREE.Vector3): void {
    if (ref.kind === 'zombie') {
      out.copy(ref.actor.pos);
    } else if (ref.kind === 'night_runner') {
      out.copy(ref.actor.group.position);
    } else {
      out.copy(ref.actor.root.position);
    }
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}

export class AllyManager {
  public readonly allies: AllySurvivor[] = [];
  private readonly mats: AllyMaterialSet;
  private nextId = 1;
  private nameIndex = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sampleGroundHeight: (x: number, z: number, curY: number) => number,
  ) {
    this.mats = {
      vest: new THREE.MeshStandardMaterial({
        color: 0x5a6e4c,
        roughness: 0.8,
        metalness: 0.08,
      }),
      shirt: new THREE.MeshStandardMaterial({
        color: 0x252930,
        roughness: 0.85,
        metalness: 0.05,
      }),
      pants: new THREE.MeshStandardMaterial({
        color: 0x1e2229,
        roughness: 0.88,
        metalness: 0.04,
      }),
      armband: new THREE.MeshStandardMaterial({
        color: 0x00d8ff,
        emissive: 0x006688,
        emissiveIntensity: 0.9,
        roughness: 0.35,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: 0xc68b6b,
        roughness: 0.75,
      }),
      hair: new THREE.MeshStandardMaterial({
        color: 0x1c1a19,
        roughness: 0.9,
      }),
      scarf: new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.82,
      }),
      pipe: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.65,
        roughness: 0.35,
      }),
      grip: new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.9,
      }),
      boot: new THREE.MeshStandardMaterial({
        color: 0x171412,
        roughness: 0.9,
      }),
    };

    window.onTerritoryLiberated = (territory: TerritorySector) => {
      this.spawnForLiberatedTerritory(territory);
    };
    this.syncWindow();
  }

  private pickNextName(preferred?: string): string {
    if (preferred) return preferred;
    // Skip 'Kabir' after starter companion if still unused
    const candidates = ALLY_NAMES.filter((n) => n !== 'Kabir');
    const name = candidates[this.nameIndex % candidates.length];
    this.nameIndex++;
    return name;
  }

  private syncWindow(): void {
    window.allies = this.allies;
  }

  public spawnStarterCompanion(): void {
    const sx = 3.5;
    const sz = 4.0;
    const sy = this.sampleGroundHeight(sx, sz, 0);
    const kabir = new AllySurvivor(
      this.nextId++,
      'Kabir',
      sx,
      sy,
      sz,
      'FOLLOW',
      null,
      this.mats,
      this.scene,
    );
    this.allies.push(kabir);
    this.syncWindow();
  }

  public spawnForLiberatedTerritory(territory: TerritorySector): void {
    const offsets: Array<[number, number]> = [
      [2.5, 1.5],
      [-2.5, -1.5],
    ];
    for (let i = 0; i < offsets.length; i++) {
      const [ox, oz] = offsets[i];
      const sx = territory.center.x + ox;
      const sz = territory.center.z + oz;
      const sy = this.sampleGroundHeight(sx, sz, territory.baseY);
      const ally = new AllySurvivor(
        this.nextId++,
        this.pickNextName(),
        sx,
        sy,
        sz,
        'PATROL',
        territory,
        this.mats,
        this.scene,
      );
      this.allies.push(ally);
    }
    this.syncWindow();
  }

  public toggleSquadCommand(
    playerPos: THREE.Vector3,
    sectors: TerritoryRuntime[],
  ): { count: number; mode: AllyCommandMode | null; toast: string | null } {
    const nearby: AllySurvivor[] = [];
    for (let i = 0; i < this.allies.length; i++) {
      const a = this.allies[i];
      if (a.state === 'DEAD') continue;
      const d = Math.hypot(a.mesh.position.x - playerPos.x, a.mesh.position.z - playerPos.z);
      if (d <= 28.0) {
        nearby.push(a);
      }
    }

    if (nearby.length === 0) {
      return { count: 0, mode: null, toast: null };
    }

    // If any nearby living ally is in PATROL mode, switch all nearby allies to FOLLOW; else switch to PATROL
    const anyPatrol = nearby.some((a) => a.commandMode === 'PATROL');
    const nextMode: AllyCommandMode = anyPatrol ? 'FOLLOW' : 'PATROL';

    for (let i = 0; i < nearby.length; i++) {
      const a = nearby[i];
      a.commandMode = nextMode;
      if (a.state !== 'COMBAT') {
        a.state = nextMode;
      }
      if (nextMode === 'PATROL') {
        // Guard nearest liberated territory if nearby, otherwise guard current position
        let nearestLib: TerritorySector | null = null;
        let bestD = 24;
        for (let s = 0; s < sectors.length; s++) {
          const sec = sectors[s].data;
          if (!sec.captured) continue;
          const ds = Math.hypot(a.mesh.position.x - sec.center.x, a.mesh.position.z - sec.center.z);
          if (ds < bestD) {
            bestD = ds;
            nearestLib = sec;
          }
        }
        a.homeTerritory = nearestLib;
        if (nearestLib) {
          a.guardCenter.set(nearestLib.center.x, a.groundY, nearestLib.center.z);
        } else {
          a.guardCenter.copy(a.mesh.position);
        }
      }
    }

    const toast =
      nextMode === 'FOLLOW'
        ? `SQUAD COMMAND: ALLIES FOLLOWING YOU (${nearby.length})`
        : 'SQUAD COMMAND: ALLIES HOLDING POSITION';
    return { count: nearby.length, mode: nextMode, toast };
  }

  public callReinforcements(
    playerPos: THREE.Vector3,
  ): { summonedCount: number; toast: string | null } {
    const living = this.allies.filter((a) => a.state !== 'DEAD');
    if (living.length === 0) {
      return { summonedCount: 0, toast: null };
    }

    // Prioritize allies currently patrolling or furthest away across liberated territories
    const candidates = [...living].sort((a, b) => {
      const aPatrol = a.commandMode === 'PATROL' ? 0 : 1;
      const bPatrol = b.commandMode === 'PATROL' ? 0 : 1;
      if (aPatrol !== bPatrol) return aPatrol - bPatrol;
      const dA = Math.hypot(a.mesh.position.x - playerPos.x, a.mesh.position.z - playerPos.z);
      const dB = Math.hypot(b.mesh.position.x - playerPos.x, b.mesh.position.z - playerPos.z);
      return dB - dA;
    });

    const chosen = candidates.slice(0, 3);
    for (let i = 0; i < chosen.length; i++) {
      const a = chosen[i];
      a.commandMode = 'FOLLOW';
      if (a.state !== 'COMBAT') {
        a.state = 'FOLLOW';
      }
    }

    return {
      summonedCount: chosen.length,
      toast: 'REINFORCEMENTS CALLED TO YOUR POSITION',
    };
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    sectors: TerritoryRuntime[],
    zombies: ZombieActor[],
    damageZombie: (z: ZombieActor, dmg: number, dir: THREE.Vector3, knockback?: number, stunDuration?: number, forceInterrupt?: boolean) => boolean,
    screamers: InfectedEnemy[],
    nightRunners: NightRunner[],
    colliders: BoxCollider[],
    isFinisherActive: boolean,
  ): AllyUpdateEvents {
    const events: AllyUpdateEvents = {
      killDelta: 0,
      impactPositions: [],
      newlyDeadNames: [],
    };
    if (isFinisherActive) return events;

    const followers = this.allies.filter((a) => a.state !== 'DEAD' && a.commandMode === 'FOLLOW');
    const totalFollowers = Math.max(1, followers.length);

    for (let i = 0; i < this.allies.length; i++) {
      const ally = this.allies[i];
      const slotIdx = Math.max(0, followers.indexOf(ally));
      ally.update(
        dt,
        elapsed,
        slotIdx,
        totalFollowers,
        playerPos,
        playerYaw,
        this.allies,
        sectors,
        zombies,
        damageZombie,
        screamers,
        nightRunners,
        colliders,
        this.sampleGroundHeight,
        events,
      );
    }

    return events;
  }

  public resetAll(): void {
    for (let i = 0; i < this.allies.length; i++) {
      this.allies[i].dispose(this.scene);
    }
    this.allies.length = 0;
    this.nameIndex = 0;
    this.spawnStarterCompanion();
  }

  public dispose(): void {
    for (let i = 0; i < this.allies.length; i++) {
      this.allies[i].dispose(this.scene);
    }
    this.allies.length = 0;
    this.syncWindow();

    this.mats.vest.dispose();
    this.mats.shirt.dispose();
    this.mats.pants.dispose();
    this.mats.armband.dispose();
    this.mats.skin.dispose();
    this.mats.hair.dispose();
    this.mats.scarf.dispose();
    this.mats.pipe.dispose();
    this.mats.grip.dispose();
    this.mats.boot.dispose();
  }
}
