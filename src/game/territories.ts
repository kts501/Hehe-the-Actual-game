import * as THREE from 'three';
import type { NightRunner } from './nightRunner';
import type { ZombieActor } from './zombies';

export interface TerritorySector {
  id: 'sector_plinth' | 'sector_charbagh' | 'sector_mausoleum';
  name: string;
  center: { x: number; z: number };
  radius: number;
  captured: boolean;
  progress: number; // 0..100
  defenderWalkers: number;
  defenderNightRunners: number;
  defenderIds: number[];
  nightRunnerIds: number[];
  aliveDefenders: number;
  baseY: number;
}

export interface TerritoryMeshRig {
  group: THREE.Group;
  banner: THREE.Mesh;
  bannerMat: THREE.MeshStandardMaterial;
  bannerBasePos: Float32Array;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  beaconMat: THREE.MeshStandardMaterial;
  uvLight: THREE.PointLight;
  lastClickStep: number;
}

export interface TerritoryRuntime {
  data: TerritorySector;
  rig: TerritoryMeshRig;
}

export interface ActiveTerritoryHudInfo {
  id: string;
  name: string;
  captured: boolean;
  progress: number;
  aliveDefenders: number;
  isLocked: boolean;
}

export interface TerritoryUpdateEvents {
  pulleyClicked: boolean;
  newlyLiberatedName: string | null;
  playerInsideLiberated: boolean;
  playerInsideSectorName: string | null;
  activeHudTerritory: ActiveTerritoryHudInfo | null;
  killDelta: number;
}

declare global {
  interface Window {
    territories?: TerritorySector[];
    onTerritoryLiberated?: (territory: TerritorySector) => void;
  }
}

const _uvDir = new THREE.Vector3();

interface UvSmokeParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class TerritoryManager {
  public readonly sectors: TerritoryRuntime[] = [];
  private readonly smokePool: UvSmokeParticle[] = [];
  private smokeTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sampleGroundHeight: (x: number, z: number) => number,
  ) {
    this.buildInitialTerritories();
    this.initSmokePool();
  }

  private initSmokePool(): void {
    const geom = new THREE.SphereGeometry(0.14, 6, 5);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa5f3fc,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.smokePool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6,
      });
    }
  }

  private spawnUvSmoke(x: number, y: number, z: number): void {
    for (let i = 0; i < this.smokePool.length; i++) {
      const p = this.smokePool[i];
      if (p.life <= 0) {
        p.life = 0.52;
        p.maxLife = 0.52;
        p.mesh.visible = true;
        p.mesh.position.set(
          x + (Math.random() - 0.5) * 0.45,
          y + 0.8 + Math.random() * 0.7,
          z + (Math.random() - 0.5) * 0.45,
        );
        p.mesh.scale.setScalar(0.8);
        p.vel.set((Math.random() - 0.5) * 0.6, 1.8 + Math.random() * 1.1, (Math.random() - 0.5) * 0.6);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
        return;
      }
    }
  }

  private buildInitialTerritories(): void {
    const defs: Array<{
      id: TerritorySector['id'];
      name: string;
      center: { x: number; z: number };
      radius: number;
      defenderWalkers: number;
      defenderNightRunners: number;
    }> = [
      {
        id: 'sector_plinth',
        name: 'TAJ COURTYARD PLINTH',
        center: { x: 0, z: 12 },
        radius: 18.0,
        defenderWalkers: 4,
        defenderNightRunners: 1,
      },
      {
        id: 'sector_charbagh',
        name: 'CHARBAGH REFLECTING GARDENS',
        center: { x: 0, z: -35 },
        radius: 18.0,
        defenderWalkers: 5,
        defenderNightRunners: 2,
      },
      {
        id: 'sector_mausoleum',
        name: 'MUGHAL MARBLE GATEHOUSE',
        center: { x: 0, z: -82 },
        radius: 20.0,
        defenderWalkers: 6,
        defenderNightRunners: 3,
      },
    ];

    for (const def of defs) {
      const baseY = this.sampleGroundHeight(def.center.x, def.center.z);
      const data: TerritorySector = {
        id: def.id,
        name: def.name,
        center: { ...def.center },
        radius: def.radius,
        captured: false,
        progress: 0,
        defenderWalkers: def.defenderWalkers,
        defenderNightRunners: def.defenderNightRunners,
        defenderIds: [],
        nightRunnerIds: [],
        aliveDefenders: def.defenderWalkers + def.defenderNightRunners,
        baseY,
      };
      const rig = this.createFlagpoleRig(data);
      this.sectors.push({ data, rig });
    }

    this.syncWindowGlobals();
  }

  private createFlagpoleRig(data: TerritorySector): TerritoryMeshRig {
    const group = new THREE.Group();
    group.position.set(data.center.x, data.baseY, data.center.z);

    // Sandstone pedestal (#b87a56)
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xb87a56,
      roughness: 0.85,
      metalness: 0.04,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.84, 0.72, 12), pedestalMat);
    pedestal.position.y = 0.36;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    group.add(pedestal);

    const trimRing = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.12, 12), pedestalMat);
    trimRing.position.y = 0.72;
    group.add(trimRing);

    // Tall 6.8m metallic pole (#4a4f55)
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x4a4f55,
      roughness: 0.38,
      metalness: 0.75,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 6.8, 10), poleMat);
    pole.position.y = 3.4;
    pole.castShadow = true;
    group.add(pole);

    // Emissive Top Beacon
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xdc2626,
      emissiveIntensity: 2.2,
      roughness: 0.25,
    });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), beaconMat);
    beacon.position.y = 6.88;
    group.add(beacon);

    // Vertex-Animated Hoist Banner (PlaneGeometry 1.7 x 1.05, 8 x 4 segs)
    const bannerGeo = new THREE.PlaneGeometry(1.7, 1.05, 8, 4);
    bannerGeo.translate(0.85, 0, 0);
    const bannerBasePos = new Float32Array(bannerGeo.attributes.position.array);
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x550808,
      emissiveIntensity: 0.75,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0.06, 1.4, 0);
    banner.castShadow = true;
    group.add(banner);

    // Perimeter Boundary Ring (RingGeometry(radius - 0.35, radius, 64))
    const ringGeo = new THREE.RingGeometry(data.radius - 0.35, data.radius, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.08;
    group.add(ringMesh);

    // Liberated UV Safe Zone PointLight
    const uvLight = new THREE.PointLight(0x38bdf8, 0, data.radius * 1.45, 1.6);
    uvLight.position.set(0, 5.8, 0);
    group.add(uvLight);

    this.scene.add(group);

    return {
      group,
      banner,
      bannerMat,
      bannerBasePos,
      ringMesh,
      ringMat,
      beaconMat,
      uvLight,
      lastClickStep: 0,
    };
  }

  public syncWindowGlobals(): void {
    window.territories = this.sectors.map((s) => s.data);
  }

  public resetAll(): void {
    for (let i = 0; i < this.sectors.length; i++) {
      const s = this.sectors[i];
      s.data.captured = false;
      s.data.progress = 0;
      s.data.defenderIds = [];
      s.data.nightRunnerIds = [];
      s.data.aliveDefenders = s.data.defenderWalkers + s.data.defenderNightRunners;

      s.rig.banner.position.y = 1.4;
      s.rig.bannerMat.color.setHex(0xdc2626);
      s.rig.bannerMat.emissive.setHex(0x550808);
      s.rig.ringMat.color.setHex(0xdc2626);
      s.rig.beaconMat.color.setHex(0xdc2626);
      s.rig.beaconMat.emissive.setHex(0xdc2626);
      s.rig.uvLight.intensity = 0;
      s.rig.lastClickStep = 0;
    }

    for (let i = 0; i < this.smokePool.length; i++) {
      this.smokePool[i].life = 0;
      this.smokePool[i].mesh.visible = false;
    }

    this.syncWindowGlobals();
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    zombies: ZombieActor[],
    damageZombie: (z: ZombieActor, dmg: number, dir: THREE.Vector3, knockback?: number) => boolean,
    screamers: Array<{
      root: THREE.Group;
      aiState: string;
      health: number;
      applyKnockdown: (impulse: THREE.Vector3) => void;
      markDead: (dir: THREE.Vector3) => void;
    }>,
    nightRunners: NightRunner[],
    isFinisherActive: boolean,
  ): TerritoryUpdateEvents {
    const events: TerritoryUpdateEvents = {
      pulleyClicked: false,
      newlyLiberatedName: null,
      playerInsideLiberated: false,
      playerInsideSectorName: null,
      activeHudTerritory: null,
      killDelta: 0,
    };

    this.smokeTimer += dt;
    const emitSmokeTick = this.smokeTimer >= 0.14;
    if (emitSmokeTick) this.smokeTimer = 0;

    // Animate smoke pool
    for (let i = 0; i < this.smokePool.length; i++) {
      const p = this.smokePool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.addScalar(dt * 1.4);
        const ratio = Math.max(0, p.life / p.maxLife);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * 0.55;
        if (p.life <= 0) {
          p.mesh.visible = false;
        }
      }
    }

    // Update each territory sector
    for (let i = 0; i < this.sectors.length; i++) {
      const { data, rig } = this.sectors[i];

      // Count living defenders bound to this sector
      let alive = 0;
      if (!data.captured) {
        for (let k = 0; k < data.defenderIds.length; k++) {
          const zId = data.defenderIds[k];
          const found = zombies.find((z) => z.id === zId);
          if (found && found.state !== 'dead') alive++;
        }
        for (let k = 0; k < data.nightRunnerIds.length; k++) {
          const nrId = data.nightRunnerIds[k];
          const foundNr = nightRunners.find((n) => n.id === nrId);
          if (foundNr && foundNr.state !== 'DEAD') alive++;
        }
      }
      data.aliveDefenders = alive;

      // Cloth wind ripple on banner vertices
      const posAttr = rig.banner.geometry.attributes.position as THREE.BufferAttribute;
      const base = rig.bannerBasePos;
      for (let v = 0; v < posAttr.count; v++) {
        const bx = base[v * 3];
        const by = base[v * 3 + 1];
        const distRatio = Math.min(1, bx / 1.7);
        const wave = Math.sin(elapsed * 5.8 + bx * 3.8 + by * 1.5 + i) * 0.14 * distRatio;
        posAttr.setZ(v, base[v * 3 + 2] + wave);
      }
      posAttr.needsUpdate = true;

      // Player proximity check (horizontal XZ distance)
      const distPlayer = Math.hypot(playerPos.x - data.center.x, playerPos.z - data.center.z);
      const inside = distPlayer <= data.radius;

      if (inside) {
        if (data.captured) {
          events.playerInsideLiberated = true;
          events.playerInsideSectorName = data.name;
        } else {
          if (data.aliveDefenders === 0 && !isFinisherActive) {
            data.progress = Math.min(100, data.progress + 18 * dt);
            const step = Math.floor(data.progress / 10);
            if (step > rig.lastClickStep && data.progress < 100) {
              rig.lastClickStep = step;
              events.pulleyClicked = true;
            }
            if (data.progress >= 100 && !data.captured) {
              data.captured = true;
              data.progress = 100;
              rig.bannerMat.color.setHex(0x38bdf8);
              rig.bannerMat.emissive.setHex(0x0c4a6e);
              rig.ringMat.color.setHex(0x38bdf8);
              rig.beaconMat.color.setHex(0x38bdf8);
              rig.beaconMat.emissive.setHex(0x38bdf8);
              events.newlyLiberatedName = data.name;
              events.playerInsideLiberated = true;
              events.playerInsideSectorName = data.name;
              window.onTerritoryLiberated?.(data);
            }
          }
          events.activeHudTerritory = {
            id: data.id,
            name: data.name,
            captured: data.captured,
            progress: Math.round(data.progress),
            aliveDefenders: data.aliveDefenders,
            isLocked: data.aliveDefenders > 0,
          };
        }
      }

      // Banner elevation & UV Light activation
      rig.banner.position.y = 1.4 + (data.progress / 100) * 4.8;
      if (data.captured) {
        rig.uvLight.intensity = THREE.MathUtils.lerp(rig.uvLight.intensity, 2.8, 1 - Math.exp(-dt * 4.5));
        rig.ringMat.opacity = 0.24 + Math.sin(elapsed * 2.5 + i) * 0.05;

        // Liberated UV Safe Zone deterrence: 15 dmg/sec burn + sizzling smoke + knockback
        for (let zi = 0; zi < zombies.length; zi++) {
          const z = zombies[zi];
          if (z.state === 'dead') continue;
          const dx = z.pos.x - data.center.x;
          const dz = z.pos.z - data.center.z;
          const dist = Math.hypot(dx, dz);
          if (dist < data.radius - 0.35) {
            const len = dist || 1;
            _uvDir.set(dx / len, 0, dz / len);
            if (damageZombie(z, 15 * dt, _uvDir, 5.2)) {
              events.killDelta++;
            }
            if (emitSmokeTick) this.spawnUvSmoke(z.pos.x, z.pos.y, z.pos.z);
          }
        }

        for (let si = 0; si < screamers.length; si++) {
          const sc = screamers[si];
          if (
            sc.aiState === 'DEAD' ||
            sc.aiState === 'IMPALED_DEAD' ||
            sc.aiState === 'DEAD_RAGDOLL' ||
            sc.aiState === 'GRABBED'
          ) {
            continue;
          }
          const dx = sc.root.position.x - data.center.x;
          const dz = sc.root.position.z - data.center.z;
          const dist = Math.hypot(dx, dz);
          if (dist < data.radius - 0.35) {
            const len = dist || 1;
            _uvDir.set(dx / len, 0, dz / len);
            sc.health -= 15 * dt;
            if (sc.health <= 0) {
              sc.markDead(_uvDir);
              events.killDelta++;
            } else {
              sc.root.position.x += _uvDir.x * 5.0 * dt;
              sc.root.position.z += _uvDir.z * 5.0 * dt;
            }
            if (emitSmokeTick) {
              this.spawnUvSmoke(sc.root.position.x, sc.root.position.y, sc.root.position.z);
            }
          }
        }

        for (let ni = 0; ni < nightRunners.length; ni++) {
          const nr = nightRunners[ni];
          if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB') continue;
          const dx = nr.group.position.x - data.center.x;
          const dz = nr.group.position.z - data.center.z;
          const dist = Math.hypot(dx, dz);
          if (dist < data.radius - 0.35) {
            const len = dist || 1;
            _uvDir.set(dx / len, 0, dz / len);
            if (nr.applyDamage(15 * dt, _uvDir, 0.35, 6.2)) {
              events.killDelta++;
            }
            if (emitSmokeTick) {
              this.spawnUvSmoke(nr.group.position.x, nr.group.position.y, nr.group.position.z);
            }
          }
        }
      } else {
        rig.uvLight.intensity = 0;
        rig.ringMat.opacity = inside ? 0.34 : 0.22;
      }
    }

    // Also show liberated zone badge subtly if inside captured zone and no uncaptured banner takes priority
    if (!events.activeHudTerritory && events.playerInsideLiberated && events.playerInsideSectorName) {
      const sec = this.sectors.find((s) => s.data.name === events.playerInsideSectorName);
      if (sec) {
        events.activeHudTerritory = {
          id: sec.data.id,
          name: sec.data.name,
          captured: true,
          progress: 100,
          aliveDefenders: 0,
          isLocked: false,
        };
      }
    }

    return events;
  }

  public dispose(): void {
    for (let i = 0; i < this.sectors.length; i++) {
      const { rig } = this.sectors[i];
      this.scene.remove(rig.group);
      rig.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
        }
      });
    }
    this.sectors.length = 0;

    for (let i = 0; i < this.smokePool.length; i++) {
      this.scene.remove(this.smokePool[i].mesh);
      (this.smokePool[i].mesh.material as THREE.Material).dispose();
    }
    if (this.smokePool.length > 0) {
      this.smokePool[0].mesh.geometry.dispose();
    }
    this.smokePool.length = 0;
  }
}
