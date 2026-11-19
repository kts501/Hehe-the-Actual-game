import * as THREE from 'three';
import type { BoxCollider, ZombieKind } from '../types/game';
import type { ProceduralTextureSet } from './textures';

export type ZombieState = 'wander' | 'chase' | 'windup' | 'recover' | 'stunned' | 'dead';

export interface ZombieActor {
  id: number;
  kind: ZombieKind;
  group: THREE.Group;
  pelvisGroup: THREE.Group;
  spineGroup: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  trailMeshes: THREE.Mesh[];
  trailHistory: THREE.Vector3[];
  homePos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: ZombieState;
  stateTimer: number;
  windupDuration: number;
  attackCooldown: number;
  animPhase: number;
  groanTimer: number;
  respawnTimer: number;
  hitReactTimer: number;
  hitReactDir: number;
  alerted: boolean;
  isClimbing: boolean;
  dogJaw?: THREE.Group;
  dogTail?: THREE.Group;
  dogBaseHeight?: number;
}

const _tmpVec = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

function smoothGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an open-ended cylindrical clothing piece with ragged, frayed bottom hems
 * using vertex displacement and recomputed smooth vertex normals.
 */
function createTornClothGeo(
  rTop: number,
  rBottom: number,
  height: number,
  radialSegs = 18,
  ragAmplitude = 0.045,
): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, radialSegs, 5, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    // Fringed irregular tear along lower edge
    if (y < -height * 0.2) {
      const tear =
        Math.sin(angle * 5.0) * ragAmplitude +
        Math.cos(angle * 9.0 + 1.3) * (ragAmplitude * 0.65);
      pos.setY(i, y + tear);
      pos.setX(i, x * (1 + Math.sin(angle * 4) * 0.04));
      pos.setZ(i, z * (1 + Math.cos(angle * 4) * 0.04));
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export class ZombieManager {
  public readonly zombies: ZombieActor[] = [];
  private readonly activeIndices: number[] = [];
  private readonly scene: THREE.Scene;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private nextId = 1;
  private nightSpawned = false;

  // Shared PBR Materials
  private readonly shamblerSkinMat: THREE.MeshStandardMaterial;
  private readonly shamblerAltSkinMat: THREE.MeshStandardMaterial;
  private readonly runnerMuscleMat: THREE.MeshStandardMaterial;
  private readonly runnerPaleMat: THREE.MeshStandardMaterial;
  private readonly runnerTornMat: THREE.MeshStandardMaterial;
  private readonly boneMat: THREE.MeshStandardMaterial;
  private readonly bruteSkinMat: THREE.MeshStandardMaterial;
  private readonly socketMat: THREE.MeshStandardMaterial;
  private readonly teethMat: THREE.MeshStandardMaterial;
  private readonly armorMat: THREE.MeshStandardMaterial;
  private readonly shirtMats: THREE.MeshStandardMaterial[];
  private readonly trouserMats: THREE.MeshStandardMaterial[];
  private readonly hazmatMat: THREE.MeshStandardMaterial;
  private readonly runnerEyeMat: THREE.MeshBasicMaterial;
  private readonly shamblerEyeMat: THREE.MeshBasicMaterial;
  private readonly dogEyeMat: THREE.MeshBasicMaterial;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly dogHideMats: THREE.MeshStandardMaterial[];
  private readonly dogFleshMat: THREE.MeshStandardMaterial;
  private readonly dogChainMat: THREE.MeshStandardMaterial;
  private readonly dogNoseMat: THREE.MeshStandardMaterial;
  private readonly geoCache = new Map<string, THREE.BufferGeometry>();

  private cachedGeo<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    let g = this.geoCache.get(key) as T | undefined;
    if (!g) {
      g = smoothGeo(factory());
      this.geoCache.set(key, g);
      this.disposables.push(g);
    }
    return g;
  }

  constructor(scene: THREE.Scene, textures: ProceduralTextureSet) {
    this.scene = scene;
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.disposables.push(m);
      return m;
    };

    this.shamblerSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.028,
        roughnessMap: textures.zombieSkinBump,
        color: 0x8d9984,
        roughness: 0.78,
        metalness: 0.03,
      }),
    );

    this.shamblerAltSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.026,
        roughnessMap: textures.zombieSkinBump,
        color: 0x7b8373,
        roughness: 0.82,
        metalness: 0.02,
      }),
    );

    this.runnerMuscleMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.nightHunterMuscle,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.03,
        color: 0xb03c44,
        roughness: 0.4,
        metalness: 0.08,
      }),
    );

    this.runnerPaleMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.02,
        color: 0xc2c6cc,
        roughness: 0.58,
        metalness: 0.05,
      }),
    );

    this.runnerTornMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.nightHunterMuscle,
        color: 0x6b1118,
        roughness: 0.32,
        metalness: 0.1,
      }),
    );

    this.boneMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdfd8ca,
        roughness: 0.42,
        metalness: 0.05,
      }),
    );

    this.bruteSkinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieSkin,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.034,
        roughnessMap: textures.zombieSkinBump,
        color: 0x65695a,
        roughness: 0.82,
        metalness: 0.04,
      }),
    );

    this.socketMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x160b0d, roughness: 0.95 }));
    this.teethMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xeae2cb, roughness: 0.42 }));

    this.armorMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x4b5563,
        roughness: 0.4,
        metalness: 0.84,
      }),
    );

    this.shirtMats = [
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.zombieCloth,
          color: 0x64748b,
          roughness: 0.92,
          side: THREE.DoubleSide,
        }),
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.zombieCloth,
          color: 0x9a3412,
          roughness: 0.92,
          side: THREE.DoubleSide,
        }),
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.zombieCloth,
          color: 0x8a867b,
          roughness: 0.92,
          side: THREE.DoubleSide,
        }),
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.zombieCloth,
          color: 0x4b5e43,
          roughness: 0.92,
          side: THREE.DoubleSide,
        }),
      ),
    ];

    this.trouserMats = [
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.zombieCloth,
          color: 0x2f3540,
          roughness: 0.94,
          side: THREE.DoubleSide,
        }),
      ),
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.zombieCloth,
          color: 0x42382e,
          roughness: 0.94,
          side: THREE.DoubleSide,
        }),
      ),
    ];

    this.hazmatMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0xd4a72c,
        roughness: 0.72,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
    );

    this.runnerEyeMat = trackMat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.28, 0.16), toneMapped: false }),
    );
    this.shamblerEyeMat = trackMat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.85, 0.35), toneMapped: false }),
    );
    this.dogEyeMat = trackMat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.25, 0.18), toneMapped: false }),
    );
    this.trailMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      }),
    );
    this.shadowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.54,
      }),
    );

    this.dogHideMats = [
      // Variant 0: Doberman charred dark sable hide
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.dogFurRot,
          bumpMap: textures.dogFurBump,
          bumpScale: 0.026,
          color: 0x5c4b3d,
          roughness: 0.68,
          metalness: 0.06,
        }),
      ),
      // Variant 1: Spiked Alpha dark soot-ochre hide
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.dogFurRot,
          bumpMap: textures.dogFurBump,
          bumpScale: 0.032,
          color: 0x6b5d4e,
          roughness: 0.72,
          metalness: 0.06,
        }),
      ),
      // Variant 2: Rabid Stray dark reddish-charcoal mottled fur
      trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.dogFurRot,
          bumpMap: textures.dogFurBump,
          bumpScale: 0.028,
          color: 0x664c43,
          roughness: 0.76,
          metalness: 0.04,
        }),
      ),
    ];

    this.dogFleshMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.nightHunterMuscle,
        bumpMap: textures.zombieSkinBump,
        bumpScale: 0.024,
        color: 0x85161c,
        roughness: 0.34,
        metalness: 0.08,
      }),
    );

    this.dogChainMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x524b45,
        roughness: 0.52,
        metalness: 0.8,
      }),
    );

    this.dogNoseMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1c1415,
        roughness: 0.3,
        metalness: 0.1,
      }),
    );

    this.spawnInitialPopulation();
  }

  private buildSculptedHead(
    skinMat: THREE.Material,
    eyeMat: THREE.Material,
    scale: number,
    isRunner: boolean,
  ): THREE.Group {
    const k = scale.toFixed(2);
    const headGroup = new THREE.Group();

    const cranium = new THREE.Mesh(
      this.cachedGeo(`h_cran_${k}`, () => new THREE.SphereGeometry(0.145 * scale, 12, 10)),
      skinMat,
    );
    cranium.scale.set(0.92, 1.14, 1.04);
    cranium.castShadow = true;
    headGroup.add(cranium);

    const brow = new THREE.Mesh(
      this.cachedGeo(`h_brow_${k}`, () => new THREE.CapsuleGeometry(0.032 * scale, 0.14 * scale, 5, 10)),
      skinMat,
    );
    brow.rotation.z = Math.PI / 2;
    brow.position.set(0, 0.048 * scale, 0.118 * scale);
    headGroup.add(brow);

    const cheekGeo = this.cachedGeo(`h_chk_${k}`, () => new THREE.SphereGeometry(0.042 * scale, 10, 8));
    [-0.072 * scale, 0.072 * scale].forEach((cx) => {
      const cheek = new THREE.Mesh(cheekGeo, skinMat);
      cheek.position.set(cx, -0.015 * scale, 0.105 * scale);
      cheek.scale.set(1.0, 0.8, 0.9);
      headGroup.add(cheek);
    });

    const socketGeo = this.cachedGeo(`h_sock_${k}`, () => new THREE.SphereGeometry(0.032 * scale, 10, 8));
    const eyeGeo = this.cachedGeo(`h_eye_${k}`, () => new THREE.SphereGeometry(0.016 * scale, 8, 8));
    [-0.052 * scale, 0.052 * scale].forEach((ex) => {
      const socket = new THREE.Mesh(socketGeo, this.socketMat);
      socket.scale.set(1.05, 0.82, 0.5);
      socket.position.set(ex, 0.018 * scale, 0.125 * scale);
      headGroup.add(socket);

      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 0.018 * scale, 0.138 * scale);
      headGroup.add(eye);
    });

    const nose = new THREE.Mesh(
      this.cachedGeo(`h_nose_${k}`, () => new THREE.CapsuleGeometry(0.014 * scale, 0.035 * scale, 4, 6)),
      skinMat,
    );
    nose.position.set(0, -0.005 * scale, 0.142 * scale);
    nose.rotation.x = -0.25;
    headGroup.add(nose);

    if (isRunner) {
      const throat = new THREE.Mesh(
        this.cachedGeo(`h_rthr_${k}`, () => new THREE.SphereGeometry(0.075 * scale, 8, 8)),
        this.socketMat,
      );
      throat.position.set(0, -0.095 * scale, 0.08 * scale);
      throat.scale.set(1.0, 1.1, 0.75);
      headGroup.add(throat);

      const mandGeo = this.cachedGeo(`h_rmand_${k}`, () => new THREE.CapsuleGeometry(0.038 * scale, 0.1 * scale, 4, 8));
      const fangGeo = this.cachedGeo(`h_rfang_${k}`, () => new THREE.ConeGeometry(0.011 * scale, 0.044 * scale, 5));
      [-1, 1].forEach((side) => {
        const mandible = new THREE.Mesh(mandGeo, this.runnerTornMat);
        mandible.position.set(side * 0.075 * scale, -0.115 * scale, 0.09 * scale);
        mandible.rotation.z = side * -0.38;
        mandible.rotation.x = 0.25;
        headGroup.add(mandible);

        for (let f = 0; f < 3; f++) {
          const fang = new THREE.Mesh(fangGeo, this.teethMat);
          fang.position.set(side * -0.022 * scale, (0.025 - f * 0.032) * scale, 0.032 * scale);
          fang.rotation.z = side * 1.15;
          mandible.add(fang);
        }
      });
    } else {
      const mouthCav = new THREE.Mesh(
        this.cachedGeo(`h_mcav_${k}`, () => new THREE.SphereGeometry(0.058 * scale, 8, 6)),
        this.socketMat,
      );
      mouthCav.scale.set(1.25, 0.75, 0.6);
      mouthCav.position.set(0, -0.075 * scale, 0.115 * scale);
      headGroup.add(mouthCav);

      const jaw = new THREE.Mesh(
        this.cachedGeo(`h_jaw_${k}`, () => new THREE.CapsuleGeometry(0.045 * scale, 0.09 * scale, 4, 8)),
        skinMat,
      );
      jaw.rotation.z = Math.PI / 2;
      jaw.rotation.y = 0.06;
      jaw.position.set(0, -0.115 * scale, 0.072 * scale);
      headGroup.add(jaw);

      const toothGeo = this.cachedGeo(`h_tooth_${k}`, () => new THREE.ConeGeometry(0.009 * scale, 0.022 * scale, 4));
      [-0.038 * scale, -0.013 * scale, 0.013 * scale, 0.038 * scale].forEach((tx) => {
        const uTooth = new THREE.Mesh(toothGeo, this.teethMat);
        uTooth.rotation.x = Math.PI;
        uTooth.position.set(tx, -0.056 * scale, 0.132 * scale);
        headGroup.add(uTooth);

        const lTooth = new THREE.Mesh(toothGeo, this.teethMat);
        lTooth.position.set(tx, -0.095 * scale, 0.122 * scale);
        headGroup.add(lTooth);
      });
    }

    return headGroup;
  }

  private buildArticulatedArm(
    side: -1 | 1,
    scale: number,
    upperMat: THREE.Material,
    foreMat: THREE.Material,
    handMat: THREE.Material,
    armRadius: number,
    isClawedRunner = false,
  ): { shoulder: THREE.Group; elbow: THREE.Group } {
    const k = `${scale.toFixed(2)}_${armRadius.toFixed(3)}`;
    const shoulder = new THREE.Group();
    const shoulderCap = new THREE.Mesh(
      this.cachedGeo(`a_scap_${k}`, () => new THREE.SphereGeometry(armRadius * 1.15, 10, 8)),
      upperMat,
    );
    shoulder.add(shoulderCap);

    const upperLen = 0.25 * scale;
    const upperArm = new THREE.Mesh(
      this.cachedGeo(`a_up_${k}`, () => new THREE.CapsuleGeometry(armRadius, upperLen, 5, 10)),
      upperMat,
    );
    upperArm.position.y = -upperLen * 0.5 - 0.03 * scale;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -upperLen - 0.06 * scale;
    shoulder.add(elbow);

    const elbowJoint = new THREE.Mesh(
      this.cachedGeo(`a_elb_${k}`, () => new THREE.SphereGeometry(armRadius * 0.96, 10, 8)),
      foreMat,
    );
    elbow.add(elbowJoint);

    const foreLen = 0.24 * scale;
    const forearm = new THREE.Mesh(
      this.cachedGeo(`a_for_${k}`, () => new THREE.CapsuleGeometry(armRadius * 0.84, foreLen, 5, 10)),
      foreMat,
    );
    forearm.position.y = -foreLen * 0.5 - 0.03 * scale;
    elbow.add(forearm);

    if (isClawedRunner) {
      const elbowSpur = new THREE.Mesh(
        this.cachedGeo(`a_spur_${k}`, () => new THREE.ConeGeometry(0.028 * scale, 0.14 * scale, 5)),
        this.boneMat,
      );
      elbowSpur.position.set(0, 0.01 * scale, -0.07 * scale);
      elbowSpur.rotation.x = -0.9;
      elbow.add(elbowSpur);

      const cuff = new THREE.Mesh(
        this.cachedGeo(`a_cuff_${k}`, () => new THREE.CylinderGeometry(armRadius * 1.04, armRadius * 1.04, 0.055 * scale, 8)),
        this.runnerTornMat,
      );
      cuff.position.y = -foreLen * 0.88;
      elbow.add(cuff);
    }

    const palmSize = isClawedRunner && side === -1 ? 0.088 : 0.056;
    const palm = new THREE.Mesh(
      this.cachedGeo(`a_palm_${k}_${palmSize}`, () => new THREE.SphereGeometry(palmSize * scale, 8, 6)),
      handMat,
    );
    palm.scale.set(0.92, 1.2, 0.65);
    palm.position.set(0, -foreLen - 0.09 * scale, 0.02 * scale);
    elbow.add(palm);

    const fingerOffsets = isClawedRunner ? [-0.04, -0.013, 0.014, 0.041] : [-0.028, 0, 0.028];
    const clawGeo = isClawedRunner
      ? this.cachedGeo(`a_claw_${scale.toFixed(2)}_${side}`, () => new THREE.ConeGeometry(0.015 * scale, (side === -1 ? 0.17 : 0.11) * scale, 5))
      : null;
    const fingerGeo = !isClawedRunner
      ? this.cachedGeo(`a_fing_${scale.toFixed(2)}`, () => new THREE.CapsuleGeometry(0.012 * scale, 0.055 * scale, 4, 6))
      : null;

    fingerOffsets.forEach((fx) => {
      if (isClawedRunner && clawGeo) {
        const claw = new THREE.Mesh(clawGeo, this.boneMat);
        claw.position.set(fx * scale, -0.08 * scale, 0.032 * scale);
        claw.rotation.x = 2.68;
        palm.add(claw);
      } else if (fingerGeo) {
        const finger = new THREE.Mesh(fingerGeo, handMat);
        finger.position.set(fx * scale, -0.065 * scale, 0.022 * scale);
        finger.rotation.x = 0.35;
        palm.add(finger);
      }
    });

    return { shoulder, elbow };
  }

  private buildArticulatedLeg(
    scale: number,
    thighMat: THREE.Material,
    shinMat: THREE.Material,
    shoeMat: THREE.Material,
    legRadius: number,
  ): { hip: THREE.Group; knee: THREE.Group } {
    const k = `${scale.toFixed(2)}_${legRadius.toFixed(3)}`;
    const hip = new THREE.Group();
    const hipCap = new THREE.Mesh(
      this.cachedGeo(`l_hcap_${k}`, () => new THREE.SphereGeometry(legRadius * 1.05, 8, 6)),
      thighMat,
    );
    hip.add(hipCap);

    const thighLen = 0.28 * scale;
    const thigh = new THREE.Mesh(
      this.cachedGeo(`l_th_${k}`, () => new THREE.CapsuleGeometry(legRadius, thighLen, 6, 10)),
      thighMat,
    );
    thigh.position.y = -thighLen * 0.5 - 0.03 * scale;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -thighLen - 0.07 * scale;
    hip.add(knee);

    const kneeJoint = new THREE.Mesh(
      this.cachedGeo(`l_kn_${k}`, () => new THREE.SphereGeometry(legRadius * 0.9, 8, 6)),
      thighMat,
    );
    knee.add(kneeJoint);

    const shinLen = 0.28 * scale;
    const shin = new THREE.Mesh(
      this.cachedGeo(`l_sh_${k}`, () => new THREE.CapsuleGeometry(legRadius * 0.78, shinLen, 6, 10)),
      shinMat,
    );
    shin.position.y = -shinLen * 0.5 - 0.03 * scale;
    knee.add(shin);

    const foot = new THREE.Mesh(
      this.cachedGeo(`l_ft_${k}`, () => new THREE.CapsuleGeometry(legRadius * 0.68, 0.14 * scale, 4, 8)),
      shoeMat,
    );
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -shinLen - 0.08 * scale, 0.065 * scale);
    knee.add(foot);

    return { hip, knee };
  }

  private createNightHunterMesh(x: number, y: number, z: number): ZombieActor {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const scale = 1.22;

    const cShadow = new THREE.Mesh(
      this.cachedGeo('nh_shad', () => new THREE.PlaneGeometry(1.55, 1.55)),
      this.shadowMat,
    );
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.02;
    group.add(cShadow);

    // Pelvis root
    const pelvisGroup = new THREE.Group();
    pelvisGroup.position.set(0, 0.88 * scale, 0);
    group.add(pelvisGroup);

    const pelvisMesh = new THREE.Mesh(
      this.cachedGeo('nh_pelvis', () => new THREE.CapsuleGeometry(0.15 * scale, 0.24 * scale, 5, 12)),
      this.runnerPaleMat,
    );
    pelvisMesh.rotation.z = Math.PI / 2;
    pelvisMesh.scale.set(1, 1, 0.78);
    pelvisGroup.add(pelvisMesh);

    // Articulated Digitigrade-leaning Muscular Legs
    const leftLegRig = this.buildArticulatedLeg(scale, this.runnerMuscleMat, this.runnerPaleMat, this.runnerPaleMat, 0.105 * scale);
    leftLegRig.hip.position.set(-0.15 * scale, -0.02 * scale, 0);
    pelvisGroup.add(leftLegRig.hip);

    const rightLegRig = this.buildArticulatedLeg(scale, this.runnerMuscleMat, this.runnerPaleMat, this.runnerPaleMat, 0.105 * scale);
    rightLegRig.hip.position.set(0.15 * scale, -0.02 * scale, 0);
    pelvisGroup.add(rightLegRig.hip);

    // Hunched Hyper-Muscular Spine & Tapered Flayed Torso
    const spineGroup = new THREE.Group();
    spineGroup.position.set(0, 0.08 * scale, 0.02 * scale);
    spineGroup.rotation.x = 0.34;
    pelvisGroup.add(spineGroup);

    const abdomen = new THREE.Mesh(
      this.cachedGeo('nh_abd', () => new THREE.CapsuleGeometry(0.175 * scale, 0.24 * scale, 5, 12)),
      this.runnerPaleMat,
    );
    abdomen.position.y = 0.16 * scale;
    abdomen.scale.set(1.08, 1, 0.78);
    spineGroup.add(abdomen);

    const chest = new THREE.Mesh(
      this.cachedGeo('nh_chest', () => new THREE.CapsuleGeometry(0.245 * scale, 0.3 * scale, 5, 12)),
      this.runnerMuscleMat,
    );
    chest.position.set(0, 0.42 * scale, 0.03 * scale);
    chest.scale.set(1.25, 1, 0.76);
    chest.castShadow = true;
    spineGroup.add(chest);

    // Torn Crimson Deltoid Craters + Dorsal Bone Horns
    const craterGeo = this.cachedGeo('nh_crater', () => new THREE.SphereGeometry(0.115 * scale, 10, 8));
    const trapHornGeo = this.cachedGeo('nh_thorn', () => new THREE.ConeGeometry(0.042 * scale, 0.26 * scale, 6));
    [-0.29 * scale, 0.29 * scale].forEach((sx, idx) => {
      const crater = new THREE.Mesh(craterGeo, this.runnerTornMat);
      crater.position.set(sx, 0.53 * scale, 0.02 * scale);
      spineGroup.add(crater);

      const trapHorn = new THREE.Mesh(trapHornGeo, this.boneMat);
      trapHorn.position.set(sx * 0.85, 0.68 * scale, -0.07 * scale);
      trapHorn.rotation.set(-0.48, 0, idx === 0 ? 0.34 : -0.34);
      spineGroup.add(trapHorn);
    });

    // Exposed Curved Dorsal Spine Horns
    const spineHornGeo = this.cachedGeo('nh_shorn', () => new THREE.ConeGeometry(0.036 * scale, 0.2 * scale, 6));
    [0.54, 0.41, 0.28, 0.15].forEach((sy, idx) => {
      const spineHorn = new THREE.Mesh(spineHornGeo, this.boneMat);
      spineHorn.scale.y = 1.1 - idx * 0.1;
      spineHorn.position.set(0, sy * scale, -0.18 * scale);
      spineHorn.rotation.x = -1.12 - idx * 0.1;
      spineGroup.add(spineHorn);
    });

    // Protruding Lower Rib Hooks
    const ribHookGeo = this.cachedGeo('nh_rhook', () => new THREE.ConeGeometry(0.03 * scale, 0.21 * scale, 6));
    [-0.17 * scale, 0.17 * scale].forEach((rx, idx) => {
      const ribHook = new THREE.Mesh(ribHookGeo, this.boneMat);
      ribHook.position.set(rx, 0.22 * scale, 0.15 * scale);
      ribHook.rotation.set(0.95, 0, idx === 0 ? -0.45 : 0.45);
      spineGroup.add(ribHook);
    });

    // Neck + Anatomical Pale Head with Split Mandibles
    const neck = new THREE.Mesh(
      this.cachedGeo('nh_neck', () => new THREE.CylinderGeometry(0.075 * scale, 0.095 * scale, 0.14 * scale, 10)),
      this.runnerPaleMat,
    );
    neck.position.set(0, 0.66 * scale, 0.06 * scale);
    neck.rotation.x = 0.2;
    spineGroup.add(neck);

    const headGroup = this.buildSculptedHead(this.runnerPaleMat, this.runnerEyeMat, scale, true);
    headGroup.position.set(0, 0.78 * scale, 0.12 * scale);
    headGroup.rotation.x = -0.22;
    spineGroup.add(headGroup);

    // Asymmetrical Mutated Articulated Arms
    const leftArmRig = this.buildArticulatedArm(
      -1,
      scale,
      this.runnerMuscleMat,
      this.runnerPaleMat,
      this.runnerPaleMat,
      0.098 * scale,
      true,
    );
    leftArmRig.shoulder.position.set(-0.34 * scale, 0.53 * scale, 0.04 * scale);
    spineGroup.add(leftArmRig.shoulder);

    const rightArmRig = this.buildArticulatedArm(
      1,
      scale,
      this.runnerMuscleMat,
      this.runnerPaleMat,
      this.runnerPaleMat,
      0.084 * scale,
      true,
    );
    rightArmRig.shoulder.position.set(0.34 * scale, 0.53 * scale, 0.04 * scale);
    spineGroup.add(rightArmRig.shoulder);

    // Red Motion Trail Silhouettes (shared CapsuleGeometry!)
    const trailMeshes: THREE.Mesh[] = [];
    const trailHistory: THREE.Vector3[] = [];
    const tGeo = this.cachedGeo('nh_trail', () => new THREE.CapsuleGeometry(0.26, 0.95, 5, 10));
    for (let t = 0; t < 4; t++) {
      const tm = new THREE.Mesh(tGeo, this.trailMat);
      tm.visible = false;
      this.scene.add(tm);
      trailMeshes.push(tm);
      trailHistory.push(new THREE.Vector3(x, y + 0.95, z));
    }

    this.scene.add(group);

    const actor: ZombieActor = {
      id: this.nextId++,
      kind: 'runner',
      group,
      pelvisGroup,
      spineGroup,
      headGroup,
      leftShoulder: leftArmRig.shoulder,
      leftElbow: leftArmRig.elbow,
      rightShoulder: rightArmRig.shoulder,
      rightElbow: rightArmRig.elbow,
      leftHip: leftLegRig.hip,
      leftKnee: leftLegRig.knee,
      rightHip: rightLegRig.hip,
      rightKnee: rightLegRig.knee,
      trailMeshes,
      trailHistory,
      homePos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp: 85,
      maxHp: 85,
      speed: 7.0,
      damage: 18,
      state: 'wander',
      stateTimer: 0,
      windupDuration: 0.9,
      attackCooldown: 0,
      animPhase: Math.random() * 10,
      groanTimer: 2 + Math.random() * 6,
      respawnTimer: 0,
      hitReactTimer: 0,
      hitReactDir: 0,
      alerted: true,
      isClimbing: false,
    };
    this.zombies.push(actor);
    return actor;
  }

  private createInfectedDogMesh(x: number, y: number, z: number, variant: number): ZombieActor {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Variant 0 = Exposed-Ribs Doberman, 1 = Spiked Chained Alpha, 2 = Flayed Rabid Stray
    const scale = variant === 1 ? 1.24 : variant === 0 ? 1.06 : 0.98;
    const hideMat = this.dogHideMats[variant % this.dogHideMats.length];
    const eyeMat = this.dogEyeMat;
    const dk = scale.toFixed(2);

    // Oval Ground Contact Shadow (shared unit plane scaled by dog size)
    const cShadow = new THREE.Mesh(
      this.cachedGeo(`dog_shad_${dk}`, () => new THREE.PlaneGeometry(1.15 * scale, 1.7 * scale)),
      this.shadowMat,
    );
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.02;
    group.add(cShadow);

    // Quadruped Body Root (pelvis/hip height)
    const baseHeight = 0.66 * scale;
    const pelvisGroup = new THREE.Group();
    pelvisGroup.position.set(0, baseHeight, -0.26 * scale);
    group.add(pelvisGroup);

    // Sculpted Muscular Hindquarters / Pelvis
    const pelvisMesh = new THREE.Mesh(
      this.cachedGeo(`dog_pelv_${dk}`, () => new THREE.CapsuleGeometry(0.155 * scale, 0.24 * scale, 5, 12)),
      hideMat,
    );
    pelvisMesh.rotation.x = Math.PI / 2;
    pelvisMesh.scale.set(0.92, 1.02, 1.05);
    pelvisMesh.castShadow = true;
    pelvisGroup.add(pelvisMesh);

    // Raw torn flesh wound patch on left haunch
    const haunchWound = new THREE.Mesh(
      this.cachedGeo(`dog_wnd_${dk}`, () => new THREE.SphereGeometry(0.105 * scale, 10, 8)),
      this.dogFleshMat,
    );
    haunchWound.scale.set(0.45, 0.85, 1.15);
    haunchWound.position.set(-0.115 * scale, 0.03 * scale, -0.02 * scale);
    pelvisGroup.add(haunchWound);

    // Articulated Tail (cropped nub for Doberman, curved mangy/spiked tail for Alpha & Stray)
    const dogTail = new THREE.Group();
    dogTail.position.set(0, 0.09 * scale, -0.18 * scale);
    pelvisGroup.add(dogTail);

    if (variant === 0) {
      const nub = new THREE.Mesh(
        this.cachedGeo(`dog_nub_${dk}`, () => new THREE.CapsuleGeometry(0.032 * scale, 0.09 * scale, 4, 10)),
        hideMat,
      );
      nub.position.set(0, 0.04 * scale, -0.05 * scale);
      nub.rotation.x = -0.8;
      dogTail.add(nub);
    } else {
      const tailBase = new THREE.Mesh(
        this.cachedGeo(`dog_tb_${dk}`, () => new THREE.CapsuleGeometry(0.036 * scale, 0.24 * scale, 4, 10)),
        hideMat,
      );
      tailBase.position.set(0, 0.08 * scale, -0.14 * scale);
      tailBase.rotation.x = -1.05;
      dogTail.add(tailBase);

      const tailTip = new THREE.Mesh(
        this.cachedGeo(`dog_tt_${dk}`, () => new THREE.ConeGeometry(0.034 * scale, 0.24 * scale, 6)),
        variant === 1 ? this.dogFleshMat : hideMat,
      );
      tailTip.position.set(0, 0.22 * scale, -0.25 * scale);
      tailTip.rotation.x = -0.55;
      dogTail.add(tailTip);
    }

    // Flexible Spine & Deep Ribcage Chest (extends forward +Z)
    const spineGroup = new THREE.Group();
    spineGroup.position.set(0, 0.02 * scale, 0.14 * scale);
    pelvisGroup.add(spineGroup);

    // Gaunt Tucked Canine Abdomen/Loin
    const loin = new THREE.Mesh(
      this.cachedGeo(`dog_loin_${dk}`, () => new THREE.CapsuleGeometry(0.135 * scale, 0.24 * scale, 5, 12)),
      hideMat,
    );
    loin.rotation.x = Math.PI / 2;
    loin.position.set(0, -0.01 * scale, 0.12 * scale);
    loin.scale.set(0.84, 1.0, 0.96);
    loin.castShadow = true;
    spineGroup.add(loin);

    // Deep Barrel Ribcage / Chest
    const chest = new THREE.Mesh(
      this.cachedGeo(`dog_chst_${dk}`, () => new THREE.CapsuleGeometry(0.205 * scale, 0.34 * scale, 5, 12)),
      hideMat,
    );
    chest.rotation.x = Math.PI / 2 + 0.12;
    chest.position.set(0, 0.04 * scale, 0.38 * scale);
    chest.scale.set(0.88, 1.0, 1.18);
    chest.castShadow = true;
    spineGroup.add(chest);

    // EXPOSED FLAYED RIBCAGE ON BOTH FLANKS
    const flankCavityGeo = this.cachedGeo(`dog_flank_${dk}`, () => new THREE.SphereGeometry(0.15 * scale, 10, 8));
    const ribGeo = this.cachedGeo(`dog_rib_${dk}`, () => new THREE.TorusGeometry(0.142 * scale, 0.013 * scale, 5, 10, Math.PI * 0.72));
    [-1, 1].forEach((side) => {
      const flankCavity = new THREE.Mesh(flankCavityGeo, this.dogFleshMat);
      flankCavity.scale.set(0.32, 0.85, 1.38);
      flankCavity.position.set(side * 0.155 * scale, 0.0 * scale, 0.34 * scale);
      spineGroup.add(flankCavity);

      for (let r = 0; r < 5; r++) {
        const rib = new THREE.Mesh(ribGeo, this.boneMat);
        rib.position.set(side * 0.055 * scale, 0.01 * scale, (0.22 + r * 0.058) * scale);
        rib.rotation.y = side * (Math.PI * 0.5);
        rib.rotation.x = 0.25;
        spineGroup.add(rib);
      }
    });

    // SPIKED MUTATED ALPHA HOUND: Jagged Keratin/Bone Spikes + Broken Iron Collar & Chain!
    if (variant === 1) {
      const dorsalSpikeGeo = this.cachedGeo(`dog_dspk_${dk}`, () => new THREE.ConeGeometry(0.026 * scale, 0.15 * scale, 6));
      for (let s = 0; s < 14; s++) {
        const zOff = 0.02 + s * 0.045;
        const spikeScale = (0.14 + Math.sin(s * 0.7) * 0.06) / 0.15;
        const dorsalSpike = new THREE.Mesh(dorsalSpikeGeo, this.boneMat);
        dorsalSpike.scale.y = spikeScale;
        dorsalSpike.position.set(
          Math.sin(s * 1.9) * 0.045 * scale,
          (0.2 + (s > 7 ? 0.06 : 0)) * scale,
          zOff * scale,
        );
        dorsalSpike.rotation.x = -0.58;
        dorsalSpike.rotation.z = Math.sin(s * 2.3) * 0.38;
        spineGroup.add(dorsalSpike);
      }
      const sideSpikeGeo = this.cachedGeo(`dog_sspk_${dk}`, () => new THREE.ConeGeometry(0.024 * scale, 0.18 * scale, 6));
      [-1, 1].forEach((side) => {
        for (let k = 0; k < 4; k++) {
          const sideSpike = new THREE.Mesh(sideSpikeGeo, this.boneMat);
          sideSpike.position.set(side * 0.19 * scale, (0.14 - k * 0.03) * scale, (0.34 + k * 0.06) * scale);
          sideSpike.rotation.set(-0.45, 0, side * -0.85);
          spineGroup.add(sideSpike);
        }
      });
    } else if (variant === 2) {
      const tuftGeo = this.cachedGeo(`dog_tuft_${dk}`, () => new THREE.ConeGeometry(0.024 * scale, 0.11 * scale, 5));
      for (let s = 0; s < 6; s++) {
        const tuft = new THREE.Mesh(tuftGeo, hideMat);
        tuft.position.set(0, 0.18 * scale, (0.18 + s * 0.06) * scale);
        tuft.rotation.x = -0.7;
        spineGroup.add(tuft);
      }
    }

    // Thick Muscular Neck Angling Forward/Up
    const neck = new THREE.Mesh(
      this.cachedGeo(`dog_neck_${dk}`, () => new THREE.CapsuleGeometry(0.132 * scale, 0.24 * scale, 5, 12)),
      hideMat,
    );
    neck.position.set(0, 0.22 * scale, 0.56 * scale);
    neck.rotation.x = 0.62;
    neck.scale.set(0.88, 1.0, 1.04);
    neck.castShadow = true;
    spineGroup.add(neck);

    // Flayed Throat Muscle Strip
    const throatTear = new THREE.Mesh(
      this.cachedGeo(`dog_thr_${dk}`, () => new THREE.CapsuleGeometry(0.068 * scale, 0.18 * scale, 4, 10)),
      this.dogFleshMat,
    );
    throatTear.position.set(0, 0.15 * scale, 0.61 * scale);
    throatTear.rotation.x = 0.65;
    spineGroup.add(throatTear);

    // Rusted Collar & Heavy Draped Broken Chain Loops (Variant 0 & 1!)
    if (variant !== 2) {
      const collar = new THREE.Mesh(
        this.cachedGeo(`dog_col_${dk}`, () => new THREE.TorusGeometry(0.15 * scale, 0.024 * scale, 6, 12)),
        this.dogChainMat,
      );
      collar.position.set(0, 0.23 * scale, 0.56 * scale);
      collar.rotation.x = Math.PI / 2 + 0.55;
      spineGroup.add(collar);

      if (variant === 1) {
        const linkGeo = this.cachedGeo(`dog_lnk_${dk}`, () => new THREE.TorusGeometry(0.032 * scale, 0.01 * scale, 5, 8));
        for (let c = 0; c < 7; c++) {
          const link = new THREE.Mesh(linkGeo, this.dogChainMat);
          link.position.set(0, (0.14 - c * 0.044) * scale, (0.67 + Math.sin(c * 0.45) * 0.025) * scale);
          link.rotation.y = c % 2 === 0 ? 0 : Math.PI / 2;
          spineGroup.add(link);
        }
        [-1, 1].forEach((side) => {
          for (let c = 0; c < 5; c++) {
            const shoulderChain = new THREE.Mesh(linkGeo, this.dogChainMat);
            shoulderChain.position.set(
              side * (0.14 + c * 0.015) * scale,
              (0.18 - c * 0.04) * scale,
              (0.5 - c * 0.03) * scale,
            );
            shoulderChain.rotation.set(0.4, c % 2 === 0 ? 0.5 : -0.4, 0.3);
            spineGroup.add(shoulderChain);
          }
        });
      }
    }

    // SCULPTED CANINE SKULL, MUZZLE, EARS & ARTICULATED FANGED JAW
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.34 * scale, 0.68 * scale);
    spineGroup.add(headGroup);

    const skull = new THREE.Mesh(
      this.cachedGeo(`dog_skl_${dk}`, () => new THREE.SphereGeometry(0.132 * scale, 12, 10)),
      hideMat,
    );
    skull.scale.set(0.9, 0.92, 1.15);
    skull.castShadow = true;
    headGroup.add(skull);

    // Torn skull flesh scar
    const headScar = new THREE.Mesh(
      this.cachedGeo(`dog_scar_${dk}`, () => new THREE.SphereGeometry(0.078 * scale, 10, 8)),
      this.dogFleshMat,
    );
    headScar.scale.set(0.55, 0.5, 1.1);
    headScar.position.set(0.06 * scale, 0.06 * scale, 0.02 * scale);
    headGroup.add(headScar);

    // Brow ridges + Sunken Dark Eye Sockets + Glowing Eyes
    const dBrowGeo = this.cachedGeo(`dog_brw_${dk}`, () => new THREE.CapsuleGeometry(0.022 * scale, 0.055 * scale, 4, 8));
    const dSockGeo = this.cachedGeo(`dog_sck_${dk}`, () => new THREE.SphereGeometry(0.026 * scale, 8, 8));
    const dEyeGeo = this.cachedGeo(`dog_eye_${dk}`, () => new THREE.SphereGeometry(0.014 * scale, 8, 6));
    [-0.056 * scale, 0.056 * scale].forEach((ex) => {
      const brow = new THREE.Mesh(dBrowGeo, hideMat);
      brow.position.set(ex, 0.045 * scale, 0.095 * scale);
      brow.rotation.z = ex < 0 ? 0.25 : -0.25;
      headGroup.add(brow);

      const socket = new THREE.Mesh(dSockGeo, this.socketMat);
      socket.position.set(ex, 0.025 * scale, 0.105 * scale);
      headGroup.add(socket);

      const eye = new THREE.Mesh(dEyeGeo, eyeMat);
      eye.position.set(ex, 0.025 * scale, 0.118 * scale);
      headGroup.add(eye);
    });

    // Cropped / Torn Pointed Canine Ears
    const dEarGeo = this.cachedGeo(`dog_ear_${dk}`, () => new THREE.ConeGeometry(0.042 * scale, 0.15 * scale, 6));
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(dEarGeo, hideMat);
      ear.position.set(side * 0.08 * scale, 0.13 * scale, -0.02 * scale);
      ear.rotation.z = side * (variant === 2 ? -0.58 : -0.18);
      ear.rotation.x = variant === 2 ? 0.35 : -0.12;
      headGroup.add(ear);
    });

    // Elongated Tapered Upper Snout & Wet Nose Tip
    const snout = new THREE.Mesh(
      this.cachedGeo(`dog_snout_${dk}`, () => new THREE.CapsuleGeometry(0.062 * scale, 0.17 * scale, 5, 10)),
      hideMat,
    );
    snout.rotation.x = Math.PI / 2 + 0.06;
    snout.scale.set(0.86, 1.0, 0.78);
    snout.position.set(0, -0.005 * scale, 0.18 * scale);
    snout.castShadow = true;
    headGroup.add(snout);

    const nose = new THREE.Mesh(
      this.cachedGeo(`dog_nose_${dk}`, () => new THREE.SphereGeometry(0.03 * scale, 8, 8)),
      this.dogNoseMat,
    );
    nose.scale.set(1.1, 0.85, 0.9);
    nose.position.set(0, 0.005 * scale, 0.285 * scale);
    headGroup.add(nose);

    // Flayed cheek jowls exposing upper teeth
    const jowlGeo = this.cachedGeo(`dog_jowl_${dk}`, () => new THREE.CapsuleGeometry(0.022 * scale, 0.12 * scale, 4, 8));
    [-0.048 * scale, 0.048 * scale].forEach((jx) => {
      const jowl = new THREE.Mesh(jowlGeo, this.dogFleshMat);
      jowl.rotation.x = Math.PI / 2;
      jowl.position.set(jx, -0.026 * scale, 0.17 * scale);
      headGroup.add(jowl);
    });

    // Upper Canine Fangs & Molars
    const uFangGeo = this.cachedGeo(`dog_ufang_${dk}`, () => new THREE.ConeGeometry(0.011 * scale, 0.048 * scale, 5));
    [-0.036, 0.036].forEach((fx) => {
      const upperFang = new THREE.Mesh(uFangGeo, this.teethMat);
      upperFang.rotation.x = Math.PI;
      upperFang.position.set(fx * scale, -0.048 * scale, 0.25 * scale);
      headGroup.add(upperFang);
    });
    const molarGeo = this.cachedGeo(`dog_mol_${dk}`, () => new THREE.ConeGeometry(0.008 * scale, 0.026 * scale, 5));
    [-0.038, 0.038].forEach((mx) => {
      for (let m = 0; m < 3; m++) {
        const molar = new THREE.Mesh(molarGeo, this.teethMat);
        molar.rotation.x = Math.PI;
        molar.position.set(mx * scale, -0.04 * scale, (0.2 - m * 0.036) * scale);
        headGroup.add(molar);
      }
    });

    // Articulated Hinged Lower Jaw + Lower Fangs + Lolling Crimson Tongue
    const dogJaw = new THREE.Group();
    dogJaw.position.set(0, -0.048 * scale, 0.08 * scale);
    dogJaw.rotation.x = 0.22;
    headGroup.add(dogJaw);

    const lowerJawMesh = new THREE.Mesh(
      this.cachedGeo(`dog_ljaw_${dk}`, () => new THREE.CapsuleGeometry(0.044 * scale, 0.15 * scale, 4, 10)),
      hideMat,
    );
    lowerJawMesh.rotation.x = Math.PI / 2;
    lowerJawMesh.scale.set(0.84, 1.0, 0.62);
    lowerJawMesh.position.set(0, -0.014 * scale, 0.095 * scale);
    dogJaw.add(lowerJawMesh);

    const tongue = new THREE.Mesh(
      this.cachedGeo(`dog_tng_${dk}`, () => new THREE.CapsuleGeometry(0.024 * scale, 0.1 * scale, 4, 8)),
      this.dogFleshMat,
    );
    tongue.rotation.x = Math.PI / 2 + 0.15;
    tongue.scale.set(1.1, 1.0, 0.45);
    tongue.position.set(0, 0.008 * scale, 0.11 * scale);
    dogJaw.add(tongue);

    const lFangGeo = this.cachedGeo(`dog_lfang_${dk}`, () => new THREE.ConeGeometry(0.01 * scale, 0.044 * scale, 5));
    [-0.03, 0.03].forEach((fx) => {
      const lowerFang = new THREE.Mesh(lFangGeo, this.teethMat);
      lowerFang.position.set(fx * scale, 0.018 * scale, 0.165 * scale);
      dogJaw.add(lowerFang);
    });

    if (variant === 1) {
      const barbGeo = this.cachedGeo(`dog_barb_${dk}`, () => new THREE.ConeGeometry(0.018 * scale, 0.11 * scale, 5));
      [-1, 1].forEach((side) => {
        const cheekBarb = new THREE.Mesh(barbGeo, this.boneMat);
        cheekBarb.position.set(side * 0.1 * scale, 0.01 * scale, 0.02 * scale);
        cheekBarb.rotation.set(-0.5, 0, side * -1.1);
        headGroup.add(cheekBarb);
      });
    }

    // 4 ARTICULATED QUADRUPED LEGS (shared geometries per scale!)
    const dJointGeo = this.cachedGeo(`dog_lj_${dk}`, () => new THREE.SphereGeometry(0.056 * scale, 8, 8));
    const dShinGeo = this.cachedGeo(`dog_lsh_${dk}`, () => new THREE.CapsuleGeometry(0.044 * scale, 0.23 * scale, 5, 10));
    const dHockGeo = this.cachedGeo(`dog_lhk_${dk}`, () => new THREE.SphereGeometry(0.042 * scale, 8, 6));
    const dPastGeo = this.cachedGeo(`dog_lps_${dk}`, () => new THREE.CapsuleGeometry(0.034 * scale, 0.11 * scale, 4, 8));
    const dPawGeo = this.cachedGeo(`dog_lpw_${dk}`, () => new THREE.SphereGeometry(0.054 * scale, 10, 8));
    const dClawGeo = this.cachedGeo(`dog_lcl_${dk}`, () => new THREE.ConeGeometry(0.009 * scale, 0.042 * scale, 5));

    const buildQuadrupedLeg = (isFront: boolean): { upper: THREE.Group; lower: THREE.Group } => {
      const upper = new THREE.Group();

      const upperMesh = new THREE.Mesh(
        this.cachedGeo(
          `dog_lup_${dk}_${isFront ? 'f' : 'b'}`,
          () => new THREE.CapsuleGeometry((isFront ? 0.072 : 0.088) * scale, 0.24 * scale, 5, 10),
        ),
        hideMat,
      );
      upperMesh.position.set(0, -0.14 * scale, isFront ? -0.02 * scale : 0.03 * scale);
      upperMesh.rotation.x = isFront ? 0.22 : -0.34;
      upperMesh.castShadow = true;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.set(0, -0.28 * scale, isFront ? -0.04 * scale : 0.08 * scale);
      upper.add(lower);

      const joint = new THREE.Mesh(dJointGeo, hideMat);
      lower.add(joint);

      const midLen = 0.23 * scale;
      const shin = new THREE.Mesh(dShinGeo, hideMat);
      shin.position.set(0, -midLen * 0.5, isFront ? 0.02 * scale : -0.05 * scale);
      shin.rotation.x = isFront ? -0.12 : 0.36;
      shin.castShadow = true;
      lower.add(shin);

      const hockY = -midLen - 0.02 * scale;
      const hockZ = isFront ? 0.035 * scale : -0.095 * scale;
      const hock = new THREE.Mesh(dHockGeo, hideMat);
      hock.position.set(0, hockY, hockZ);
      lower.add(hock);

      const pastern = new THREE.Mesh(dPastGeo, hideMat);
      pastern.position.set(0, hockY - 0.07 * scale, hockZ + 0.03 * scale);
      pastern.rotation.x = -0.25;
      lower.add(pastern);

      const paw = new THREE.Mesh(dPawGeo, hideMat);
      paw.scale.set(0.95, 0.55, 1.35);
      paw.position.set(0, hockY - 0.12 * scale, hockZ + 0.075 * scale);
      paw.castShadow = true;
      lower.add(paw);

      [-0.026, 0, 0.026].forEach((cx) => {
        const claw = new THREE.Mesh(dClawGeo, this.boneMat);
        claw.rotation.x = Math.PI * 0.45;
        claw.position.set(cx * scale, -0.01 * scale, 0.058 * scale);
        paw.add(claw);
      });

      return { upper, lower };
    };

    const frontLeft = buildQuadrupedLeg(true);
    frontLeft.upper.position.set(-0.155 * scale, -0.02 * scale, 0.46 * scale);
    spineGroup.add(frontLeft.upper);

    const frontRight = buildQuadrupedLeg(true);
    frontRight.upper.position.set(0.155 * scale, -0.02 * scale, 0.46 * scale);
    spineGroup.add(frontRight.upper);

    const backLeft = buildQuadrupedLeg(false);
    backLeft.upper.position.set(-0.145 * scale, -0.01 * scale, -0.02 * scale);
    pelvisGroup.add(backLeft.upper);

    const backRight = buildQuadrupedLeg(false);
    backRight.upper.position.set(0.145 * scale, -0.01 * scale, -0.02 * scale);
    pelvisGroup.add(backRight.upper);

    this.scene.add(group);

    const hp = variant === 1 ? 75 : 55;
    const speed = variant === 1 ? 7.6 : 6.9;
    const damage = variant === 1 ? 16 : 13;

    const actor: ZombieActor = {
      id: this.nextId++,
      kind: 'dog',
      group,
      pelvisGroup,
      spineGroup,
      headGroup,
      leftShoulder: frontLeft.upper,
      leftElbow: frontLeft.lower,
      rightShoulder: frontRight.upper,
      rightElbow: frontRight.lower,
      leftHip: backLeft.upper,
      leftKnee: backLeft.lower,
      rightHip: backRight.upper,
      rightKnee: backRight.lower,
      trailMeshes: [],
      trailHistory: [],
      homePos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp,
      maxHp: hp,
      speed,
      damage,
      state: 'wander',
      stateTimer: 0,
      windupDuration: 0.78,
      attackCooldown: 0,
      animPhase: Math.random() * 10,
      groanTimer: 2 + Math.random() * 5,
      respawnTimer: 0,
      hitReactTimer: 0,
      hitReactDir: 0,
      alerted: false,
      isClimbing: false,
      dogJaw,
      dogTail,
      dogBaseHeight: baseHeight,
    };
    this.zombies.push(actor);
    return actor;
  }

  private createZombieMesh(kind: ZombieKind, x: number, y: number, z: number): ZombieActor {
    if (kind === 'runner') {
      return this.createNightHunterMesh(x, y, z);
    }
    if (kind === 'dog') {
      return this.createInfectedDogMesh(x, y, z, this.nextId % 3);
    }

    const group = new THREE.Group();
    group.position.set(x, y, z);

    const scale = kind === 'brute' ? 1.42 : 1.0;
    const zk = kind;
    const isHazmat = kind === 'shambler' && this.nextId % 4 === 0;
    const skinMat =
      kind === 'brute'
        ? this.bruteSkinMat
        : this.nextId % 2 === 0
          ? this.shamblerSkinMat
          : this.shamblerAltSkinMat;
    const shirtMat = isHazmat ? this.hazmatMat : this.shirtMats[this.nextId % this.shirtMats.length];
    const trouserMat = isHazmat ? this.hazmatMat : this.trouserMats[this.nextId % this.trouserMats.length];

    // Ground Contact Shadow (shared per kind)
    const cShadow = new THREE.Mesh(
      this.cachedGeo(`z_shad_${zk}`, () => new THREE.PlaneGeometry(1.15 * scale, 1.15 * scale)),
      this.shadowMat,
    );
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.02;
    group.add(cShadow);

    // Pelvis / Hips Root
    const pelvisGroup = new THREE.Group();
    pelvisGroup.position.set(0, 0.85 * scale, 0);
    group.add(pelvisGroup);

    const pelvisMesh = new THREE.Mesh(
      this.cachedGeo(`z_pelv_${zk}`, () => new THREE.CapsuleGeometry(0.145 * scale, 0.19 * scale, 5, 12)),
      trouserMat,
    );
    pelvisMesh.rotation.z = Math.PI / 2;
    pelvisMesh.scale.set(1, 1, 0.8);
    pelvisMesh.castShadow = true;
    pelvisGroup.add(pelvisMesh);

    // Articulated Thigh -> Knee -> Shin -> Boot Legs
    const legRadius = (kind === 'brute' ? 0.108 : 0.084) * scale;
    const leftLegRig = this.buildArticulatedLeg(scale, trouserMat, trouserMat, this.armorMat, legRadius);
    leftLegRig.hip.position.set(-0.135 * scale, -0.02 * scale, 0);
    pelvisGroup.add(leftLegRig.hip);

    const rightLegRig = this.buildArticulatedLeg(scale, trouserMat, trouserMat, this.armorMat, legRadius);
    rightLegRig.hip.position.set(0.135 * scale, -0.02 * scale, 0);
    pelvisGroup.add(rightLegRig.hip);

    // Hunched Tapered Upper Torso & Torn Layered Clothing
    const spineGroup = new THREE.Group();
    spineGroup.position.set(0, 0.06 * scale, 0);
    spineGroup.rotation.x = kind === 'shambler' ? 0.2 : 0.1;
    pelvisGroup.add(spineGroup);

    const waist = new THREE.Mesh(
      this.cachedGeo(`z_waist_${zk}`, () => new THREE.CapsuleGeometry(0.155 * scale, 0.2 * scale, 5, 12)),
      shirtMat,
    );
    waist.position.y = 0.15 * scale;
    waist.scale.set(1.06, 1, 0.78);
    waist.castShadow = true;
    spineGroup.add(waist);

    const chest = new THREE.Mesh(
      this.cachedGeo(`z_chest_${zk}`, () => new THREE.CapsuleGeometry(0.195 * scale, 0.25 * scale, 5, 12)),
      shirtMat,
    );
    chest.position.set(0, 0.38 * scale, 0.015 * scale);
    chest.scale.set(1.18, 1, 0.78);
    chest.castShadow = true;
    spineGroup.add(chest);

    // Jagged Torn Shirt / Kurta Hem around waist (shared per kind!)
    const tornHem = new THREE.Mesh(
      this.cachedGeo(`z_hem_${zk}`, () => createTornClothGeo(0.21 * scale, 0.245 * scale, 0.34 * scale, 12, 0.055 * scale)),
      shirtMat,
    );
    tornHem.position.set(0, 0.04 * scale, 0);
    tornHem.scale.set(1.06, 1, 0.78);
    tornHem.castShadow = true;
    spineGroup.add(tornHem);

    // Exposed Necrotic Neck & Anatomical Head
    const neck = new THREE.Mesh(
      this.cachedGeo(`z_neck_${zk}`, () => new THREE.CylinderGeometry(0.064 * scale, 0.08 * scale, 0.13 * scale, 10)),
      skinMat,
    );
    neck.position.set(0, 0.59 * scale, 0.03 * scale);
    neck.rotation.x = 0.15;
    spineGroup.add(neck);

    const headGroup = this.buildSculptedHead(skinMat, this.shamblerEyeMat, scale, false);
    headGroup.position.set(0, 0.72 * scale, 0.075 * scale);
    headGroup.rotation.x = -0.14;
    spineGroup.add(headGroup);

    // Articulated Shoulders -> Upper Arms -> Elbows -> Forearms -> Hands
    const armRadius = (kind === 'brute' ? 0.088 : 0.066) * scale;
    const leftArmRig = this.buildArticulatedArm(-1, scale, shirtMat, skinMat, skinMat, armRadius, false);
    leftArmRig.shoulder.position.set(-0.275 * scale, 0.48 * scale, 0.02 * scale);
    spineGroup.add(leftArmRig.shoulder);

    const rightArmRig = this.buildArticulatedArm(1, scale, shirtMat, skinMat, skinMat, armRadius, false);
    rightArmRig.shoulder.position.set(0.275 * scale, 0.48 * scale, 0.02 * scale);
    spineGroup.add(rightArmRig.shoulder);

    // Brute Curved Steel Shoulder Pauldrons, Rounded Chest Armor & Shield Vambrace
    if (kind === 'brute') {
      const pauldronGeo = this.cachedGeo(
        'z_br_pld',
        () => new THREE.SphereGeometry(0.175 * scale, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      );
      [-0.31 * scale, 0.31 * scale].forEach((ax, idx) => {
        const pauldron = new THREE.Mesh(pauldronGeo, this.armorMat);
        pauldron.position.set(ax, 0.51 * scale, 0.02 * scale);
        pauldron.rotation.z = idx === 0 ? 0.42 : -0.42;
        pauldron.castShadow = true;
        spineGroup.add(pauldron);
      });

      const chestArmor = new THREE.Mesh(
        this.cachedGeo(
          'z_br_chst',
          () => new THREE.CylinderGeometry(0.24 * scale, 0.2 * scale, 0.36 * scale, 12, 1, false, -Math.PI * 0.45, Math.PI * 0.9),
        ),
        this.armorMat,
      );
      chestArmor.position.set(0, 0.36 * scale, 0.04 * scale);
      chestArmor.scale.set(1.14, 1, 0.85);
      chestArmor.castShadow = true;
      spineGroup.add(chestArmor);

      const vambrace = new THREE.Mesh(
        this.cachedGeo('z_br_vamb', () => new THREE.CylinderGeometry(0.11 * scale, 0.092 * scale, 0.28 * scale, 12)),
        this.armorMat,
      );
      vambrace.position.set(0, -0.14 * scale, 0.02 * scale);
      leftArmRig.elbow.add(vambrace);
    }

    this.scene.add(group);

    const hp = kind === 'brute' ? 140 : 75;
    const speed = kind === 'brute' ? 2.5 : 2.35;
    const damage = kind === 'brute' ? 24 : 15;

    const actor: ZombieActor = {
      id: this.nextId++,
      kind,
      group,
      pelvisGroup,
      spineGroup,
      headGroup,
      leftShoulder: leftArmRig.shoulder,
      leftElbow: leftArmRig.elbow,
      rightShoulder: rightArmRig.shoulder,
      rightElbow: rightArmRig.elbow,
      leftHip: leftLegRig.hip,
      leftKnee: leftLegRig.knee,
      rightHip: rightLegRig.hip,
      rightKnee: rightLegRig.knee,
      trailMeshes: [],
      trailHistory: [],
      homePos: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      hp,
      maxHp: hp,
      speed,
      damage,
      state: 'wander',
      stateTimer: 0,
      windupDuration: 0.9,
      attackCooldown: 0,
      animPhase: Math.random() * 10,
      groanTimer: 2 + Math.random() * 6,
      respawnTimer: 0,
      hitReactTimer: 0,
      hitReactDir: 0,
      alerted: false,
      isClimbing: false,
    };
    this.zombies.push(actor);
    return actor;
  }

  private spawnInitialPopulation(): void {
    const shamblerSpawns: [number, number, number][] = [
      [6.8, 0, 7.5],   // Right sandstone walkway mid-distance (matching reference image!)
      [8.8, 0, 4.0],   // Right sandstone walkway mid-distance
      [15.2, 0, 3.5],  // East Charbagh lawn
      [-11.5, 0, 2.5], // West Charbagh edge
      [-7.5, 0, -4.0],
      [7.8, 0, -9.0],
      [-8.5, 0, -24],
      [8.2, 0, -32],
      [-23.5, 0, 11],
      [23.5, 0, 10],
      [-14, 0, -39],
      [14, 0, -40],
    ];
    shamblerSpawns.forEach(([x, y, z]) => this.createZombieMesh('shambler', x, y, z));

    this.createZombieMesh('brute', 34.5, 0, 6.5);
    this.createZombieMesh('brute', 2.5, 0, -18.5);
    this.createZombieMesh('brute', -18.5, 0, 8.0);

    // Foreground Infected Pack visible right down the opening Charbagh vista (matching reference image!)
    const fgDoberman = this.createInfectedDogMesh(-2.4, 0, 16.5, 0);
    fgDoberman.yaw = 1.1;
    const fgAlpha = this.createInfectedDogMesh(2.6, 0, 18.2, 1);
    fgAlpha.yaw = 0.85;
    const fgRightHound = this.createInfectedDogMesh(7.2, 0, 15.8, 0);
    fgRightHound.yaw = 0.15;

    this.createInfectedDogMesh(-14.5, 0, -6.5, 2); // Flayed Rabid Stray in west garden
    this.createInfectedDogMesh(13.5, 0, -24.0, 1); // Spiked Alpha near north lawns
  }

  public spawnNightRunners(): void {
    if (this.nightSpawned) return;
    this.nightSpawned = true;

    const runnerSpawns: [number, number, number][] = [
      [-14, 0, 28],
      [14, 0, 26],
      [-15, 0, -16],
      [15, 0, -18],
      [0, 0, -42],
    ];
    runnerSpawns.forEach(([x, y, z]) => {
      const r = this.createZombieMesh('runner', x, y, z);
      r.alerted = true;
    });
  }

  public resetAll(): void {
    this.nightSpawned = false;
    this.zombies.forEach((z) => {
      this.scene.remove(z.group);
      z.trailMeshes.forEach((tm) => this.scene.remove(tm));
    });
    this.zombies.length = 0;
    this.spawnInitialPopulation();
  }

  public damageZombie(
    z: ZombieActor,
    amount: number,
    knockbackDir: THREE.Vector3,
    knockbackForce: number,
    stunDuration = 0.45,
  ): boolean {
    if (z.state === 'dead') return false;
    z.hp -= amount;
    z.alerted = true;
    z.vel.addScaledVector(knockbackDir, knockbackForce);
    z.vel.y = Math.max(z.vel.y, 2.2);

    // Directional snap-back hit reaction relative to zombie facing
    const fwdX = Math.sin(z.yaw);
    const fwdZ = Math.cos(z.yaw);
    const cross = fwdX * knockbackDir.z - fwdZ * knockbackDir.x;
    z.hitReactTimer = 0.34;
    z.hitReactDir = Math.sign(cross || 1);

    if (z.hp <= 0) {
      z.hp = 0;
      z.state = 'dead';
      z.stateTimer = 0;
      z.respawnTimer = z.kind === 'runner' ? 14 : 22;
      z.trailMeshes.forEach((tm) => (tm.visible = false));
      return true;
    } else {
      z.state = 'stunned';
      z.stateTimer = stunDuration;
      return false;
    }
  }

  public applyAwakeningShockwave(
    origin: THREE.Vector3,
    radius = 11.0,
    baseKnockback = 18.0,
    upwardPop = 6.0,
    damage = 25,
    stunDuration = 2.0,
  ): { hitCount: number; killCount: number } {
    let hitCount = 0;
    let killCount = 0;
    const dir = new THREE.Vector3();

    for (const z of this.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - origin.x;
      const dz = z.pos.z - origin.z;
      const dy = Math.abs(z.pos.y - origin.y);
      const dist = Math.hypot(dx, dz);
      if (dist > radius || dy > 4.0) continue;

      hitCount++;
      if (dist > 0.001) {
        dir.set(dx / dist, 0, dz / dist);
      } else {
        dir.set(0, 0, -1);
      }

      const proximityScale = Math.max(0.45, 1 - (dist / radius) * 0.55);
      const pushForce = baseKnockback * proximityScale;
      const killed = this.damageZombie(z, damage, dir, pushForce, stunDuration);
      if (killed) {
        killCount++;
      } else {
        z.vel.y = Math.max(z.vel.y, upwardPop);
      }
    }

    return { hitCount, killCount };
  }

  public clearNearbyZombies(origin: THREE.Vector3, radius = 26): number {
    const radiusSq = radius * radius;
    let cleared = 0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.state === 'dead') continue;
      const dx = z.pos.x - origin.x;
      const dz = z.pos.z - origin.z;
      if (dx * dx + dz * dz <= radiusSq) {
        z.hp = 0;
        z.state = 'dead';
        z.stateTimer = 1.0;
        z.respawnTimer = 28;
        z.vel.set(0, 0, 0);
        z.group.visible = false;
        for (let t = 0; t < z.trailMeshes.length; t++) {
          z.trailMeshes[t].visible = false;
        }
        cleared++;
      }
    }
    return cleared;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    isNight: boolean,
    lurePos: THREE.Vector3 | null,
    colliders: BoxCollider[],
    tajSafeZone: { minX: number; maxX: number; minZ: number; maxZ: number },
    onPlayerHit: (damage: number, attackerPos: THREE.Vector3) => void,
    onZombieGroan: (kind: ZombieKind) => void,
  ): void {
    if (isNight && !this.nightSpawned) {
      this.spawnNightRunners();
    }

    this.activeIndices.length = 0;

    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];

      if (z.state === 'dead') {
        z.stateTimer += dt;
        const fallT = Math.min(1, z.stateTimer / 0.38);
        const ease = 1 - Math.pow(1 - fallT, 2);
        if (z.kind === 'dog') {
          // Quadruped side collapse onto the ground
          const sideSign = z.hitReactDir || 1;
          z.group.rotation.z = sideSign * ease * (Math.PI * 0.48);
          z.group.rotation.x = ease * 0.14;
          z.group.position.y = Math.max(0.14, z.pos.y * (1 - ease));
          z.leftShoulder.rotation.x = ease * 0.5;
          z.rightShoulder.rotation.x = -ease * 0.4;
          z.leftHip.rotation.x = -ease * 0.5;
          z.rightHip.rotation.x = ease * 0.45;
          if (z.dogJaw) z.dogJaw.rotation.x = 0.55 * ease;
        } else {
          // Articulated humanoid ragdoll collapse: knees buckle, torso folds & twists onto ground
          z.group.rotation.x = -ease * (Math.PI * 0.48);
          z.group.rotation.z = z.hitReactDir * ease * 0.24;
          z.group.position.y = Math.max(0.16, z.pos.y * (1 - ease));
          z.leftKnee.rotation.x = ease * 0.9;
          z.rightKnee.rotation.x = ease * 0.55;
          z.leftShoulder.rotation.x = -ease * 0.8;
          z.leftShoulder.rotation.z = -ease * 0.5;
          z.rightShoulder.rotation.x = -ease * 1.1;
          z.rightShoulder.rotation.z = ease * 0.45;
          z.headGroup.rotation.x = ease * 0.45;
        }

        z.respawnTimer -= dt;
        if (z.respawnTimer <= 0 && (z.kind !== 'runner' || isNight)) {
          z.hp = z.maxHp;
          z.state = 'wander';
          z.pos.copy(z.homePos);
          z.vel.set(0, 0, 0);
          z.group.rotation.set(0, z.yaw, 0);
          z.group.position.copy(z.pos);
          z.leftKnee.rotation.x = 0;
          z.rightKnee.rotation.x = 0;
          z.leftShoulder.rotation.set(0, 0, 0);
          z.rightShoulder.rotation.set(0, 0, 0);
          z.leftHip.rotation.set(0, 0, 0);
          z.rightHip.rotation.set(0, 0, 0);
          z.headGroup.rotation.set(z.kind === 'runner' ? -0.22 : z.kind === 'dog' ? 0 : -0.14, 0, 0);
          if (z.dogJaw) z.dogJaw.rotation.x = 0.22;
          z.alerted = isNight;
        }
        continue;
      }

      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
      z.groanTimer -= dt;
      z.hitReactTimer = Math.max(0, z.hitReactTimer - dt);
      z.isClimbing = false;

      const playerDx = playerPos.x - z.pos.x;
      const playerDz = playerPos.z - z.pos.z;
      const playerDistSq = playerDx * playerDx + playerDz * playerDz;

      const isLured = lurePos !== null && z.pos.distanceToSquared(lurePos) < 26 * 26;
      const targetPos = isLured && lurePos ? lurePos : playerPos;

      // Distance Culling (> 60m): pause AI, collider checks, and skeletal animation for distant zombies
      if (!isLured && z.state !== 'windup' && z.state !== 'stunned' && playerDistSq > 3600) {
        z.group.visible = playerDistSq < 9025;
        if (z.trailMeshes.length > 0) {
          for (let t = 0; t < z.trailMeshes.length; t++) z.trailMeshes[t].visible = false;
        }
        continue;
      }
      z.group.visible = true;
      this.activeIndices.push(i);

      _toTarget.subVectors(targetPos, z.pos);
      const horizDist = Math.hypot(_toTarget.x, _toTarget.z);
      const detectRadius =
        z.kind === 'runner' ? 40 : z.kind === 'dog' ? (isNight ? 28 : 20) : isNight ? 24 : z.alerted ? 22 : 14;

      if (z.groanTimer <= 0 && horizDist < 18) {
        z.groanTimer = z.kind === 'dog' ? 3.2 + Math.random() * 4.0 : 4.5 + Math.random() * 5.5;
        onZombieGroan(z.kind);
      }

      // UV Safe House Repulsion
      const inUvZone =
        z.pos.z < tajSafeZone.maxZ + 1.8 &&
        z.pos.x > tajSafeZone.minX - 1.5 &&
        z.pos.x < tajSafeZone.maxX + 1.5;

      if (inUvZone) {
        z.pos.z = tajSafeZone.maxZ + 1.9;
        z.vel.z = 3.5;
        z.state = 'stunned';
        z.stateTimer = 0.5;
      }

      if (z.state === 'stunned') {
        z.stateTimer -= dt;
        const snap = z.hitReactTimer > 0 ? Math.sin((z.hitReactTimer / 0.34) * Math.PI) : 0;
        if (z.kind === 'dog') {
          z.spineGroup.rotation.x = -0.22 * snap;
          z.spineGroup.rotation.z = z.hitReactDir * 0.26 * snap;
          z.headGroup.rotation.z = -z.hitReactDir * 0.35 * snap;
          if (z.dogJaw) z.dogJaw.rotation.x = 0.45 * snap + 0.18;
        } else {
          z.spineGroup.rotation.x = -0.35 * snap + 0.08;
          z.spineGroup.rotation.z = z.hitReactDir * 0.22 * snap;
          z.headGroup.rotation.x = -0.45 * snap;
          z.leftShoulder.rotation.x = -0.6 * snap;
          z.rightShoulder.rotation.x = -0.7 * snap;
          z.leftElbow.rotation.x = -0.9;
          z.rightElbow.rotation.x = -0.9;
        }
        if (z.stateTimer <= 0) {
          z.spineGroup.rotation.set(
            z.kind === 'runner' ? 0.34 : z.kind === 'shambler' ? 0.2 : z.kind === 'dog' ? 0 : 0.1,
            0,
            0,
          );
          z.headGroup.rotation.z = 0;
          z.state = 'chase';
        }
      } else if (z.state === 'windup') {
        z.stateTimer -= dt;
        const targetYaw = Math.atan2(_toTarget.x, _toTarget.z);
        z.yaw = lerpAngle(z.yaw, targetYaw, dt * (z.kind === 'dog' ? 12 : 8));

        if (z.kind === 'dog') {
          // Crouch low onto haunches, open fanged jaw wide before pouncing!
          z.pelvisGroup.position.y = (z.dogBaseHeight ?? 0.66) - 0.11;
          z.spineGroup.rotation.x = -0.22;
          z.headGroup.rotation.x = 0.28;
          z.leftHip.rotation.x = -0.6;
          z.rightHip.rotation.x = -0.6;
          z.leftShoulder.rotation.x = 0.45;
          z.rightShoulder.rotation.x = 0.45;
          if (z.dogJaw) z.dogJaw.rotation.x = 0.62;
        } else {
          z.leftShoulder.rotation.x = THREE.MathUtils.lerp(z.leftShoulder.rotation.x, -2.3, dt * 14);
          z.rightShoulder.rotation.x = THREE.MathUtils.lerp(z.rightShoulder.rotation.x, -2.5, dt * 14);
          z.leftElbow.rotation.x = -0.55;
          z.rightElbow.rotation.x = -0.55;
          z.spineGroup.rotation.x = -0.05;
        }

        if (z.stateTimer <= 0) {
          if (z.kind === 'dog') {
            // Forward canine bite pounce lunge!
            z.vel.x = Math.sin(z.yaw) * 9.6;
            z.vel.z = Math.cos(z.yaw) * 9.6;
            z.vel.y = 3.2;
          }
          if (!isLured && horizDist < (z.kind === 'brute' ? 3.1 : 2.65) && Math.abs(playerPos.y - z.pos.y) < 2.2) {
            onPlayerHit(z.damage, z.pos);
          }
          z.state = 'recover';
          z.stateTimer = 0.45;
          z.attackCooldown = z.kind === 'runner' ? 0.78 : z.kind === 'dog' ? 0.95 : 1.3;
        }
      } else if (z.state === 'recover') {
        z.stateTimer -= dt;
        if (z.kind === 'dog') {
          z.pelvisGroup.position.y = THREE.MathUtils.lerp(z.pelvisGroup.position.y, z.dogBaseHeight ?? 0.66, dt * 12);
          z.spineGroup.rotation.x = THREE.MathUtils.lerp(z.spineGroup.rotation.x, 0, dt * 12);
          if (z.dogJaw) z.dogJaw.rotation.x = THREE.MathUtils.lerp(z.dogJaw.rotation.x, 0.25, dt * 12);
        } else {
          z.leftShoulder.rotation.x = THREE.MathUtils.lerp(z.leftShoulder.rotation.x, -0.9, dt * 10);
          z.rightShoulder.rotation.x = THREE.MathUtils.lerp(z.rightShoulder.rotation.x, -0.9, dt * 10);
          z.spineGroup.rotation.x = THREE.MathUtils.lerp(z.spineGroup.rotation.x, 0.26, dt * 10);
        }
        if (z.stateTimer <= 0) {
          z.state = 'chase';
        }
      } else {
        const shouldChase = isLured || horizDist < detectRadius;
        z.state = shouldChase ? 'chase' : 'wander';

        if (z.state === 'chase') {
          const desiredYaw = Math.atan2(_toTarget.x, _toTarget.z);
          z.yaw = lerpAngle(z.yaw, desiredYaw, dt * (z.kind === 'dog' ? 9.5 : 6.5));

          const stopDist = isLured ? 1.8 : z.kind === 'brute' ? 2.2 : z.kind === 'dog' ? 2.15 : 1.9;
          if (horizDist > stopDist) {
            const chaseSpeed = z.speed * (isNight && z.kind !== 'runner' ? 1.25 : 1.0);
            z.vel.x = Math.sin(z.yaw) * chaseSpeed;
            z.vel.z = Math.cos(z.yaw) * chaseSpeed;

            if (
              z.kind === 'runner' &&
              z.pos.y <= 0.12 &&
              ((horizDist > 4.2 && horizDist < 7.2 && Math.random() < dt * 1.4) ||
                playerPos.y > z.pos.y + 1.8)
            ) {
              if (horizDist < 9.5) {
                z.vel.y = 7.6;
              }
            }
          } else {
            z.vel.x *= 0.7;
            z.vel.z *= 0.7;
            if (!isLured && z.attackCooldown <= 0 && Math.abs(playerPos.y - z.pos.y) < 2.2) {
              z.state = 'windup';
              z.stateTimer = z.windupDuration;
            }
          }
        } else {
          z.animPhase += dt * 0.6;
          _tmpVec.subVectors(z.homePos, z.pos);
          if (_tmpVec.lengthSq() > 25) {
            z.yaw = lerpAngle(z.yaw, Math.atan2(_tmpVec.x, _tmpVec.z), dt * 2.5);
          } else {
            z.yaw += Math.sin(z.animPhase * 0.5) * dt * 0.7;
          }
          z.vel.x = Math.sin(z.yaw) * (z.kind === 'dog' ? 1.35 : 0.85);
          z.vel.z = Math.cos(z.yaw) * (z.kind === 'dog' ? 1.35 : 0.85);
        }
      }

      z.vel.y -= 20 * dt;
      z.pos.x += z.vel.x * dt;
      z.pos.z += z.vel.z * dt;
      z.pos.y += z.vel.y * dt;

      if (z.state === 'stunned') {
        z.vel.x *= Math.exp(-5 * dt);
        z.vel.z *= Math.exp(-5 * dt);
      }

      if (z.pos.y <= 0) {
        z.pos.y = 0;
        z.vel.y = 0;
      }

      // Natural Multi-Joint Articulated Locomotion (Quadruped Gallop vs. Humanoid Stride)
      const moveMag = Math.hypot(z.vel.x, z.vel.z);
      if (z.kind === 'dog') {
        if (z.state !== 'windup' && z.state !== 'stunned') {
          z.animPhase += dt * (3.2 + moveMag * 2.2);
          const amp = Math.min(0.85, moveMag * 0.16 + 0.14);
          // Quadruped bounding gallop: forelegs & hindlegs pair with slight phase offset
          const fl = Math.sin(z.animPhase) * amp;
          const fr = Math.sin(z.animPhase + 0.45) * amp;
          const bl = Math.sin(z.animPhase + Math.PI) * amp;
          const br = Math.sin(z.animPhase + Math.PI + 0.45) * amp;

          z.leftShoulder.rotation.x = fl;
          z.rightShoulder.rotation.x = fr;
          z.leftElbow.rotation.x = Math.max(-0.1, -Math.cos(z.animPhase) * 0.55);
          z.rightElbow.rotation.x = Math.max(-0.1, -Math.cos(z.animPhase + 0.45) * 0.55);

          z.leftHip.rotation.x = bl;
          z.rightHip.rotation.x = br;
          z.leftKnee.rotation.x = Math.min(0.15, Math.cos(z.animPhase + Math.PI) * 0.55);
          z.rightKnee.rotation.x = Math.min(0.15, Math.cos(z.animPhase + Math.PI + 0.45) * 0.55);

          // Flexible spine pitch & vertical bound
          const boundBounce = Math.abs(Math.cos(z.animPhase)) * Math.min(0.08, moveMag * 0.012);
          z.pelvisGroup.position.y = (z.dogBaseHeight ?? 0.66) + boundBounce;
          z.spineGroup.rotation.x = Math.sin(z.animPhase) * Math.min(0.16, moveMag * 0.025);
          z.headGroup.rotation.x = -z.spineGroup.rotation.x * 0.65;
          if (z.dogTail) {
            z.dogTail.rotation.y = Math.sin(z.animPhase * 1.4) * 0.32;
            z.dogTail.rotation.x = z.state === 'chase' ? 0.25 : -0.1;
          }
          if (z.dogJaw) {
            z.dogJaw.rotation.x =
              (z.state === 'chase' ? 0.34 : 0.16) + Math.abs(Math.sin(z.animPhase * 0.7)) * 0.14;
          }
        }
      } else if (z.isClimbing || z.vel.y > 1.8) {
        z.animPhase += dt * 16;
        z.leftShoulder.rotation.x = -2.1 + Math.sin(z.animPhase) * 0.7;
        z.rightShoulder.rotation.x = -2.1 - Math.sin(z.animPhase) * 0.7;
        z.leftElbow.rotation.x = -0.8;
        z.rightElbow.rotation.x = -0.8;
        z.leftHip.rotation.x = Math.cos(z.animPhase) * 0.65;
        z.rightHip.rotation.x = -Math.cos(z.animPhase) * 0.65;
        z.leftKnee.rotation.x = 0.65;
        z.rightKnee.rotation.x = 0.65;
      } else if (z.state !== 'windup' && z.state !== 'stunned') {
        z.animPhase += dt * (2.6 + moveMag * 1.9);
        const stride = Math.sin(z.animPhase) * Math.min(0.72, moveMag * 0.22);
        const oppStride = Math.sin(z.animPhase + Math.PI) * Math.min(0.72, moveMag * 0.22);

        z.leftHip.rotation.x = stride;
        z.rightHip.rotation.x = oppStride;
        z.leftKnee.rotation.x = Math.max(0.08, -Math.cos(z.animPhase) * 0.68);
        z.rightKnee.rotation.x = Math.max(0.08, -Math.cos(z.animPhase + Math.PI) * 0.68);

        const bounce = Math.abs(Math.cos(z.animPhase)) * Math.min(0.055, moveMag * 0.012);
        z.pelvisGroup.position.y = (z.kind === 'runner' ? 0.88 * 1.22 : z.kind === 'brute' ? 0.85 * 1.42 : 0.85) + bounce;
        const baseLean = z.kind === 'runner' ? 0.34 : z.kind === 'shambler' ? 0.22 : 0.1;
        z.spineGroup.rotation.x = baseLean + Math.sin(z.animPhase * 2) * 0.04;
        z.spineGroup.rotation.z = Math.sin(z.animPhase) * 0.065;
        z.headGroup.rotation.z = -Math.sin(z.animPhase) * 0.08;

        const armBase = z.state === 'chase' ? -1.32 : -0.68;
        z.leftShoulder.rotation.x = armBase + oppStride * 0.4;
        z.rightShoulder.rotation.x = armBase + stride * 0.4;
        z.leftElbow.rotation.x = z.state === 'chase' ? -0.42 : -0.62;
        z.rightElbow.rotation.x = z.state === 'chase' ? -0.38 : -0.58;
      }

      if (z.kind === 'runner' && z.trailMeshes.length > 0) {
        for (let t = z.trailHistory.length - 1; t > 0; t--) {
          z.trailHistory[t].lerp(z.trailHistory[t - 1], Math.min(1, dt * 16));
        }
        z.trailHistory[0].set(z.pos.x, z.pos.y + 0.95, z.pos.z);

        for (let t = 0; t < z.trailMeshes.length; t++) {
          const tm = z.trailMeshes[t];
          tm.visible = moveMag > 2.2;
          tm.position.copy(z.trailHistory[t]);
          tm.rotation.y = z.yaw;
          tm.scale.setScalar(1 - t * 0.16);
        }
      }
    }

    // Crowd Separation & Semicircle Fanning Pass (prevents stacking & creates readable Arkham arcs)
    const activeCount = this.activeIndices.length;
    for (let a = 0; a < activeCount; a++) {
      const idxA = this.activeIndices[a];
      const zA = this.zombies[idxA];
      const radA = zA.kind === 'brute' ? 0.85 : zA.kind === 'runner' ? 0.65 : zA.kind === 'dog' ? 0.62 : 0.62;

      for (let b = a + 1; b < activeCount; b++) {
        const idxB = this.activeIndices[b];
        const zB = this.zombies[idxB];
        if (Math.abs(zA.pos.y - zB.pos.y) > 1.8) continue;

        const radB = zB.kind === 'brute' ? 0.85 : zB.kind === 'runner' ? 0.65 : zB.kind === 'dog' ? 0.62 : 0.62;
        const minSep = radA + radB;
        const softSep = minSep * 1.85;

        let dx = zB.pos.x - zA.pos.x;
        let dz = zB.pos.z - zA.pos.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < softSep * softSep) {
          let dist = Math.sqrt(distSq);
          if (dist < 0.001) {
            const ang = (idxA * 1.7 + idxB * 0.9) % (Math.PI * 2);
            dx = Math.cos(ang);
            dz = Math.sin(ang);
            dist = 1;
          }
          const nx = dx / dist;
          const nz = dz / dist;

          // Hard positional separation so limbs/bodies never overlap or clip
          if (dist < minSep) {
            const overlap = minSep - dist;
            const push = overlap * 0.54;
            zA.pos.x -= nx * push;
            zA.pos.z -= nz * push;
            zB.pos.x += nx * push;
            zB.pos.z += nz * push;

            const relVn = (zB.vel.x - zA.vel.x) * nx + (zB.vel.z - zA.vel.z) * nz;
            if (relVn < 0) {
              zA.vel.x += nx * relVn * 0.4;
              zA.vel.z += nz * relVn * 0.4;
              zB.vel.x -= nx * relVn * 0.4;
              zB.vel.z -= nz * relVn * 0.4;
            }
          }

          // Semicircle tangential fanning when multiple chasers converge near the player
          if ((zA.state === 'chase' || zA.state === 'windup') && (zB.state === 'chase' || zB.state === 'windup')) {
            const pAx = zA.pos.x - playerPos.x;
            const pAz = zA.pos.z - playerPos.z;
            const pAdSq = pAx * pAx + pAz * pAz;
            if (pAdSq < 64 && pAdSq > 1.0) {
              const pAd = Math.sqrt(pAdSq);
              // Tangent perpendicular to player->enemy radial line
              const tx = -pAz / pAd;
              const tz = pAx / pAd;
              const sideSign = (dx * tx + dz * tz) >= 0 ? 1 : -1;
              const fanStrength = (1 - dist / softSep) * 2.3 * dt;
              zA.pos.x -= tx * sideSign * fanStrength;
              zA.pos.z -= tz * sideSign * fanStrength;
              zB.pos.x += tx * sideSign * fanStrength;
              zB.pos.z += tz * sideSign * fanStrength;
            }
          }
        }
      }
    }

    // Final world collider resolution & transform sync after separation
    for (let a = 0; a < activeCount; a++) {
      const z = this.zombies[this.activeIndices[a]];
      const radius = z.kind === 'brute' ? 0.65 : z.kind === 'runner' ? 0.54 : z.kind === 'dog' ? 0.42 : 0.45;
      for (let c = 0; c < colliders.length; c++) {
        const b = colliders[c];
        if (!b.blocksZombies) continue;
        if (z.pos.y >= b.maxY - 0.1 || z.pos.y + 1.8 < b.minY) continue;

        const closestX = Math.max(b.minX, Math.min(z.pos.x, b.maxX));
        const closestZ = Math.max(b.minZ, Math.min(z.pos.z, b.maxZ));
        const dx = z.pos.x - closestX;
        const dz = z.pos.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (z.kind === 'runner' && b.maxY <= 4.2 && z.pos.y < b.maxY) {
            z.vel.y = 8.2;
            z.isClimbing = true;
          } else {
            const dist = Math.sqrt(distSq) || 0.001;
            const push = radius - dist;
            z.pos.x += (dx / dist) * push;
            z.pos.z += (dz / dist) * push;
          }
        }
      }

      z.pos.x = THREE.MathUtils.clamp(z.pos.x, -43, 43);
      z.pos.z = THREE.MathUtils.clamp(z.pos.z, -53, 49);

      z.group.position.copy(z.pos);
      z.group.rotation.y = z.yaw;
    }
  }

  public dispose(): void {
    this.zombies.forEach((z) => {
      this.scene.remove(z.group);
      z.trailMeshes.forEach((tm) => this.scene.remove(tm));
    });
    this.disposables.forEach((d) => d.dispose());
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}
