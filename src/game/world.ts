import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BoxCollider, LadderVolume, SupplyCrateObj, ZiplineRoute } from '../types/game';
import type { ProceduralTextureSet } from './textures';

export interface WorldBuildResult {
  colliders: BoxCollider[];
  climbableMeshes: THREE.Mesh[];
  crates: SupplyCrateObj[];
  ziplines: ZiplineRoute[];
  ladders: LadderVolume[];
  uvLights: THREE.PointLight[];
  floodLights: THREE.SpotLight[];
  uvGlowMeshes: THREE.Mesh[];
  stringBulbMats: THREE.MeshStandardMaterial[];
  tajGateCenter: THREE.Vector3;
  extractionPoint: THREE.Vector3;
  guardTowerCenter: THREE.Vector3;
  tajSafeZone: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawnPos: THREE.Vector3;
  spawnYaw: number;
  setExtractionActive: (active: boolean) => void;
  updateGuard: (elapsed: number, playerPos: THREE.Vector3, radioOpen: boolean) => void;
  updateWorldProps: (elapsed: number) => void;
  getNearbyDoorPrompt: (playerPos: THREE.Vector3) => string;
  toggleNearestDoor: (playerPos: THREE.Vector3) => { label: string; open: boolean } | null;
  isNearHaveliMedkit: (playerPos: THREE.Vector3) => boolean;
  tryUseHaveliMedkit: (playerPos: THREE.Vector3) => boolean;
  resetInteractiveWorld: () => void;
  dispose: () => void;
}

const _batchPos = new THREE.Vector3();
const _batchQuat = new THREE.Quaternion();
const _batchEuler = new THREE.Euler();
const _batchScale = new THREE.Vector3(1, 1, 1);
const _batchMatrix = new THREE.Matrix4();

export interface WorldBuildOptions {
  isIntelIntegrated?: boolean;
}

export function buildAgraWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
  options?: WorldBuildOptions,
): WorldBuildResult {
  const isIntelIntegrated = Boolean(options?.isIntelIntegrated);
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const colliders: BoxCollider[] = [];
  const climbableMeshes: THREE.Mesh[] = [];
  const crates: SupplyCrateObj[] = [];
  const ziplines: ZiplineRoute[] = [];
  const ladders: LadderVolume[] = [];
  const uvLights: THREE.PointLight[] = [];
  const floodLights: THREE.SpotLight[] = [];
  const uvGlowMeshes: THREE.Mesh[] = [];
  const stringBulbMats: THREE.MeshStandardMaterial[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // =========================================================================
  // STATIC GEOMETRY BATCHER (Collapses ~650+ world draw calls into ~25!)
  // =========================================================================
  interface BatchBucket {
    mat: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
    geos: THREE.BufferGeometry[];
  }
  const batchMap = new Map<string, BatchBucket>();
  const matIds = new Map<THREE.Material, number>();
  let nextMatId = 1;

  function getMatId(mat: THREE.Material): number {
    let id = matIds.get(mat);
    if (!id) {
      id = nextMatId++;
      matIds.set(mat, id);
    }
    return id;
  }

  function pushStaticGeo(
    sourceGeo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
    scaleX = 1,
    scaleY = 1,
    scaleZ = 1,
    castShadow = true,
    receiveShadow = true,
  ): void {
    const g = sourceGeo.index ? sourceGeo.toNonIndexed() : sourceGeo.clone();
    // Ensure consistent attributes (position, normal, uv) for safe mergeGeometries
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    // Strip tangent or extra attributes so all geos in same bucket match strictly
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        g.deleteAttribute(key);
      }
    }

    _batchPos.set(x, y, z);
    _batchEuler.set(rotX, rotY, rotZ);
    _batchQuat.setFromEuler(_batchEuler);
    _batchScale.set(scaleX, scaleY, scaleZ);
    _batchMatrix.compose(_batchPos, _batchQuat, _batchScale);
    g.applyMatrix4(_batchMatrix);

    const key = `${getMatId(mat)}_${castShadow ? 1 : 0}_${receiveShadow ? 1 : 0}`;
    let bucket = batchMap.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, geos: [] };
      batchMap.set(key, bucket);
    }
    bucket.geos.push(g);
  }

  function flushStaticBatches(): void {
    const nonClimbableMats = new Set<THREE.Material>([
      foliageMat,
      cypressMat,
      palmFrondMat,
      trunkMat,
      parkourSmudgeMat,
      chevronGuideMat,
      buntingMat,
      bulbMat,
      ropeMat,
      floodBulbMat,
      uvTubeMat,
      radioBeaconMat,
      nozzleFoamMat,
    ]);
    batchMap.forEach((bucket) => {
      if (bucket.geos.length === 0) return;
      const merged = mergeGeometries(bucket.geos, false);
      bucket.geos.forEach((g) => g.dispose());
      if (merged) {
        trackGeo(merged);
        const mesh = new THREE.Mesh(merged, bucket.mat);
        mesh.castShadow = bucket.castShadow;
        mesh.receiveShadow = bucket.receiveShadow;
        worldGroup.add(mesh);
        if (!nonClimbableMats.has(bucket.mat)) {
          climbableMeshes.push(mesh);
        }
      }
    });
    batchMap.clear();
  }

  // Calibrated PBR Materials
  const marbleMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.marble,
      bumpMap: textures.marbleBump,
      bumpScale: 0.015,
      roughnessMap: textures.marbleRoughness,
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.08,
    }),
  );
  const marbleTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.marble,
      bumpMap: textures.marbleBump,
      bumpScale: 0.015,
      roughnessMap: textures.marbleRoughness,
      color: 0xe8e2d8,
      roughness: 0.28,
      metalness: 0.06,
    }),
  );
  const pietraDuraMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.pietraDura,
      color: 0xf7f2ea,
      roughness: 0.36,
      metalness: 0.06,
    }),
  );
  const domeInteriorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.domeRibs,
      color: 0xebe5da,
      roughness: 0.45,
      metalness: 0.04,
      side: THREE.BackSide,
    }),
  );
  const jaliMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.jaliLattice,
      color: 0xf3eee6,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.46,
      metalness: 0.05,
    }),
  );
  const flowerbedMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.charbaghFlowerbed,
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  const parkourWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.parkourWallPaint,
      bumpMap: textures.woodBump,
      bumpScale: 0.02,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.05,
    }),
  );
  const yamunaWaterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1c3d4a,
      bumpMap: textures.waterRippleBump,
      bumpScale: 0.038,
      roughness: 0.08,
      metalness: 0.75,
    }),
  );
  const brassLampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4a438,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0.88,
    }),
  );
  const tealWindowMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.tealWindow,
      color: 0x7ec4cf,
      emissive: 0x155e75,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.15,
    }),
  );
  const sanctuarySlateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2c33,
      roughness: 0.36,
      metalness: 0.16,
    }),
  );
  const crimsonLotusMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x881d24,
      roughness: 0.42,
      metalness: 0.22,
    }),
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4a438,
      roughness: 0.22,
      metalness: 0.9,
    }),
  );
  const sandstoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      bumpMap: textures.sandstoneBump,
      bumpScale: 0.04,
      roughnessMap: textures.sandstoneRoughness,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  const pavilionSandstoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      bumpMap: textures.sandstoneBump,
      bumpScale: 0.04,
      roughnessMap: textures.sandstoneRoughness,
      color: 0xeddcd4,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  const courtyardMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.courtyardAsphalt,
      bumpMap: textures.courtyardAsphaltBump,
      bumpScale: 0.045,
      roughnessMap: textures.courtyardAsphaltRoughness,
      color: 0xbab2a8,
      roughness: 0.95,
      metalness: 0.06,
    }),
  );
  const charbaghLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.charbaghGrass,
      bumpMap: textures.grassBump,
      bumpScale: 0.03,
      roughnessMap: textures.grassRoughness,
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  const outerGroundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x40372b,
      roughness: 0.96,
      metalness: 0.0,
    }),
  );
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.woodPlank,
      bumpMap: textures.woodBump,
      bumpScale: 0.026,
      color: 0x8e613e,
      roughness: 0.84,
      metalness: 0.04,
    }),
  );
  const ropeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb69362,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const rustMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.rustedMetal,
      bumpMap: textures.rustedMetalBump,
      bumpScale: 0.036,
      roughnessMap: textures.rustedMetalRoughness,
      color: 0x676b70,
      roughness: 0.88,
      metalness: 0.72,
    }),
  );
  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x26292e,
      roughness: 0.4,
      metalness: 0.84,
    }),
  );
  const diamondPlateMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.diamondPlate,
      color: 0x64748b,
      roughness: 0.36,
      metalness: 0.78,
    }),
  );
  const plasterMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      bumpMap: textures.bazaarWallBump,
      bumpScale: 0.028,
      roughnessMap: textures.bazaarWallRoughness,
      color: 0xcab08c,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const plasterAltMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      bumpMap: textures.bazaarWallBump,
      bumpScale: 0.028,
      roughnessMap: textures.bazaarWallRoughness,
      color: 0xb58668,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const plasterTealMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      bumpMap: textures.bazaarWallBump,
      bumpScale: 0.028,
      roughnessMap: textures.bazaarWallRoughness,
      color: 0x5c7c79,
      roughness: 0.9,
      metalness: 0.03,
    }),
  );
  const blueTarpMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.blueTarp,
      color: 0x38bdf8,
      roughness: 0.65,
      metalness: 0.05,
    }),
  );
  const chainLinkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.chainLink,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.45,
      metalness: 0.75,
    }),
  );
  const turquoiseFountainMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x164e55,
      roughness: 0.3,
      metalness: 0.25,
    }),
  );
  const cypressMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b341e,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x344e2b,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  const palmFrondMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2f4724,
      roughness: 0.84,
      side: THREE.DoubleSide,
    }),
  );
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x453325,
      roughness: 0.94,
      metalness: 0.0,
    }),
  );
  const uvTubeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8b4fe,
      emissive: 0xa855f7,
      emissiveIntensity: 3.4,
      roughness: 0.2,
      metalness: 0.1,
    }),
  );
  const floodBulbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff7ed,
      emissive: 0xffedd5,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    }),
  );

  const parkourSmudgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.parkourPaintSmudge,
      color: 0xffffff,
      emissive: 0x6b5816,
      emissiveIntensity: 0.24,
      transparent: true,
      alphaTest: 0.14,
      roughness: 0.85,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  // Reusable primitive unit box & parkour smudge plane geometries for static batching
  const unitBoxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const smudgeGeo = trackGeo(new THREE.PlaneGeometry(1, 0.34));
  smudgeGeo.rotateX(-Math.PI / 2);
  const smudgeGeoZ = trackGeo(smudgeGeo.clone());
  smudgeGeoZ.rotateY(Math.PI / 2);

  let colliderIdx = 0;
  function addBox(
    _parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    options: {
      collide?: boolean;
      mantleable?: boolean;
      blocksZombies?: boolean;
      cushion?: boolean;
      wallrunnable?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      rotY?: number;
      rotX?: number;
      rotZ?: number;
      id?: string;
    } = {},
  ): void {
    pushStaticGeo(
      unitBoxGeo,
      mat,
      x,
      y,
      z,
      options.rotX ?? 0,
      options.rotY ?? 0,
      options.rotZ ?? 0,
      w,
      h,
      d,
      options.castShadow ?? true,
      options.receiveShadow ?? true,
    );

    if (options.collide) {
      colliders.push({
        id: options.id ?? `col_${colliderIdx++}`,
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y - h / 2,
        maxY: y + h / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
        mantleable: options.mantleable ?? true,
        blocksZombies: options.blocksZombies ?? true,
        cushion: options.cushion ?? false,
        wallrunnable: options.wallrunnable ?? false,
      });
    }
  }

  // =========================================================================
  // 1. EXTENDED TERRAIN & COURTYARD
  // =========================================================================
  const outerGround = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(480, 480)), outerGroundMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.04;
  outerGround.receiveShadow = true;
  worldGroup.add(outerGround);

  const courtyardFloor = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(186, 166)), courtyardMat);
  courtyardFloor.rotation.x = -Math.PI / 2;
  courtyardFloor.position.set(-18, 0, -16);
  courtyardFloor.receiveShadow = true;
  worldGroup.add(courtyardFloor);
  climbableMeshes.push(courtyardFloor);

  // Starting Overlook Terrace behind player spawn (South end)
  addBox(worldGroup, 14, 1.6, 8, 0, 0.8, 44, sandstoneMat, {
    collide: true,
    mantleable: true,
    id: 'start_terrace',
  });
  addBox(worldGroup, 6, 0.8, 3, 0, 0.4, 38.5, sandstoneMat, {
    collide: true,
    mantleable: true,
  });

  // =========================================================================
  // 2. CHARBAGH GARDENS: RED-SANDSTONE WALKWAYS, LUSH LAWNS, POOL & FOUNTAINS
  // =========================================================================
  const leftWalkway = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(6.8, 92)), sandstoneMat);
  leftWalkway.rotation.x = -Math.PI / 2;
  leftWalkway.position.set(-8.2, 0.015, -10);
  leftWalkway.castShadow = true;
  leftWalkway.receiveShadow = true;
  worldGroup.add(leftWalkway);

  const rightWalkway = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(6.8, 92)), sandstoneMat);
  rightWalkway.rotation.x = -Math.PI / 2;
  rightWalkway.position.set(8.2, 0.015, -10);
  rightWalkway.castShadow = true;
  rightWalkway.receiveShadow = true;
  worldGroup.add(rightWalkway);

  // Transverse Red-Sandstone Charbagh Cross-Paths
  [30.0, -13.0, -52.0].forEach((cz, idx) => {
    const crossPath = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(idx === 2 ? 48 : 38, idx === 2 ? 6.5 : 5.2)),
      sandstoneMat,
    );
    crossPath.rotation.x = -Math.PI / 2;
    crossPath.position.set(0, 0.016, cz);
    crossPath.castShadow = true;
    crossPath.receiveShadow = true;
    worldGroup.add(crossPath);
  });

  // Flanking Charbagh Flowerbed Parterres bordering the red-sandstone walkways (matches front photo!)
  [-5.35, 5.35].forEach((fx) => {
    [9.5, -32.0].forEach((fz, idx) => {
      const len = idx === 0 ? 33.0 : 29.0;
      const bed = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.15, len)), flowerbedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(fx < 0 ? -11.0 : 11.0, 0.022, fz);
      bed.receiveShadow = true;
      worldGroup.add(bed);
    });
  });

  // Lush Green Charbagh Garden Lawns flanking the sandstone walkways
  const lawnBeds: Array<[number, number, number, number]> = [
    [-16.8, 8.5, 9.6, 36.0],   // Southwest lawn
    [16.8, 8.5, 9.6, 36.0],    // Southeast lawn
    [-16.8, -32.5, 9.6, 32.5], // Northwest lawn
    [16.8, -32.5, 9.6, 32.5],  // Northeast lawn
  ];
  const lawnGrassPositions: THREE.Vector3[] = [];
  const flowerPositions: THREE.Vector3[] = [];
  const curbGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.14, 1));
  lawnBeds.forEach(([lx, lz, lw, ld]) => {
    const lawn = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(lw, ld)), charbaghLawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(lx, 0.014, lz);
    lawn.receiveShadow = true;
    worldGroup.add(lawn);

    pushStaticGeo(
      curbGeo,
      sandstoneMat,
      lx < 0 ? lx + lw / 2 : lx - lw / 2,
      0.07,
      lz,
      0,
      0,
      0,
      1,
      1,
      ld,
      true,
      true,
    );

    for (let g = 0; g < 26; g++) {
      const gx = lx + (((g * 37) % 100) / 100 - 0.5) * (lw - 0.8);
      const gz = lz + (((g * 67) % 100) / 100 - 0.5) * (ld - 1.2);
      lawnGrassPositions.push(new THREE.Vector3(gx, 0.015, gz));
    }
    for (let f = 0; f < 16; f++) {
      const fx = (lx < 0 ? -11.0 : 11.0) + (((f * 23) % 100) / 100 - 0.5) * 0.9;
      const fz = lz + (((f * 53) % 100) / 100 - 0.5) * (ld - 2.0);
      flowerPositions.push(new THREE.Vector3(fx, 0.02, fz));
    }
  });

  // Instanced Pink/White/Marigold Charbagh Rose Clusters (Layer 1 so Reflector skips!)
  if (flowerPositions.length > 0) {
    const flGeo = trackGeo(new THREE.DodecahedronGeometry(0.22, 0));
    flGeo.translate(0, 0.14, 0);
    const flMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        flatShading: true,
      }),
    );
    const instFlowers = new THREE.InstancedMesh(flGeo, flMat, flowerPositions.length);
    instFlowers.layers.set(1);
    const dummy = new THREE.Object3D();
    const flPalette = [0xf472b6, 0xfdf2f8, 0xfb7185, 0xfacc15, 0x3f6212];
    const tint = new THREE.Color();
    flowerPositions.forEach((pos, idx) => {
      dummy.position.copy(pos);
      dummy.rotation.y = (idx * 1.4) % (Math.PI * 2);
      const s = 0.75 + (idx % 4) * 0.18;
      dummy.scale.set(s * 1.25, s * 0.85, s * 1.25);
      dummy.updateMatrix();
      instFlowers.setMatrixAt(idx, dummy.matrix);
      tint.setHex(flPalette[idx % flPalette.length]);
      instFlowers.setColorAt(idx, tint);
    });
    instFlowers.instanceMatrix.needsUpdate = true;
    if (instFlowers.instanceColor) instFlowers.instanceColor.needsUpdate = true;
    instFlowers.computeBoundingSphere();
    worldGroup.add(instFlowers);
  }

  // Instanced Overgrown Garden Grass Tufts (placed on Layer 1 so Reflector skips them!)
  if (lawnGrassPositions.length > 0) {
    const tuftGeo = trackGeo(new THREE.ConeGeometry(0.26, 0.62, 5));
    tuftGeo.translate(0, 0.31, 0);
    const tuftMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4f7434,
        roughness: 0.9,
        flatShading: true,
      }),
    );
    const instLawnGrass = new THREE.InstancedMesh(tuftGeo, tuftMat, lawnGrassPositions.length);
    instLawnGrass.layers.set(1);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    lawnGrassPositions.forEach((pos, idx) => {
      dummy.position.copy(pos);
      dummy.rotation.y = (idx * 2.1) % (Math.PI * 2);
      const s = 0.75 + ((idx * 11) % 6) * 0.14;
      dummy.scale.set(s * 1.15, s * (0.85 + (idx % 3) * 0.25), s * 1.15);
      dummy.updateMatrix();
      instLawnGrass.setMatrixAt(idx, dummy.matrix);

      tint.setHSL(0.24 + (idx % 5) * 0.018, 0.42, 0.26 + (idx % 4) * 0.04);
      instLawnGrass.setColorAt(idx, tint);
    });
    instLawnGrass.instanceMatrix.needsUpdate = true;
    if (instLawnGrass.instanceColor) instLawnGrass.instanceColor.needsUpdate = true;
    instLawnGrass.computeBoundingSphere();
    worldGroup.add(instLawnGrass);
  }

  // Long Central Marble Reflecting Pool (crisp Taj reflection, throttled every 2nd frame for high FPS!)
  const poolGeo = trackGeo(new THREE.PlaneGeometry(8.8, 76));

  if (!isSoftwareGl) {
    const reflectorSize = isIntelIntegrated ? 256 : 512;
    const reflectorInterval = isIntelIntegrated ? 4 : 2;
    const reflector = new Reflector(poolGeo, {
      clipBias: 0.003,
      textureWidth: reflectorSize,
      textureHeight: reflectorSize,
      color: 0x89a9ad,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.03, -12);

    // Throttle Reflector scene re-render & skip offscreen pass when camera is inside Haveli/Railway Station
    const origOnBeforeRender = reflector.onBeforeRender.bind(reflector);
    let reflectFrame = 0;
    reflector.onBeforeRender = (renderer, scn, cam, geometry, material, group) => {
      const idx = reflectFrame++;
      if (idx > 0 && idx % reflectorInterval !== 0) return;
      if (cam.position.z < -92 || cam.position.z > 42 || Math.abs(cam.position.x) > 48) return;
      origOnBeforeRender(renderer, scn, cam, geometry, material, group);
    };

    worldGroup.add(reflector);
    disposables.push(reflector);
  } else {
    const poolBase = new THREE.Mesh(
      poolGeo,
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x1c3d4a,
          bumpMap: textures.waterRippleBump,
          bumpScale: 0.038,
          roughness: 0.08,
          metalness: 0.75,
        }),
      ),
    );
    poolBase.rotation.x = -Math.PI / 2;
    poolBase.position.set(0, 0.03, -12);
    poolBase.receiveShadow = true;
    worldGroup.add(poolBase);
  }

  // Glossy reflective water ripple surface over mirror pool
  const poolSheenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1c3d4a,
      bumpMap: textures.waterRippleBump,
      bumpScale: 0.038,
      transparent: true,
      opacity: isSoftwareGl ? 0.92 : 0.42,
      roughness: 0.08,
      metalness: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  const poolSheen = new THREE.Mesh(poolGeo, poolSheenMat);
  poolSheen.rotation.x = -Math.PI / 2;
  poolSheen.position.set(0, 0.042, -12);
  poolSheen.receiveShadow = true;
  worldGroup.add(poolSheen);

  // White Marble Pool Curbs bordering the sandstone walkways
  addBox(worldGroup, 0.68, 0.24, 76, -4.74, 0.12, -12, marbleMat, {
    collide: true,
    mantleable: false,
  });
  addBox(worldGroup, 0.68, 0.24, 76, 4.74, 0.12, -12, marbleMat, {
    collide: true,
    mantleable: false,
  });
  addBox(worldGroup, 10.2, 0.24, 0.68, 0, 0.12, 26.3, marbleMat, {
    collide: true,
    mantleable: false,
  });

  // Row of Small Central Fountain Nozzles running straight down the centerline of the pool (matching image!)
  const nozzlePts: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.28, 0),
    new THREE.Vector2(0.24, 0.16),
    new THREE.Vector2(0.16, 0.44),
    new THREE.Vector2(0.21, 0.56),
    new THREE.Vector2(0.12, 0.76),
    new THREE.Vector2(0.03, 0.96),
  ];
  const nozzleGeo = trackGeo(new THREE.LatheGeometry(nozzlePts, 8));
  const finialGeo = trackGeo(new THREE.ConeGeometry(0.05, 0.16, 6));
  const rippleGeo = trackGeo(new THREE.RingGeometry(0.3, 0.48, 12));
  const nozzleFoamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const nozzleZCoords = [22, 14, 6, -2, -21, -28, -35, -42];
  nozzleZCoords.forEach((nz) => {
    pushStaticGeo(nozzleGeo, turquoiseFountainMat, 0, 0.04, nz, 0, 0, 0, 1, 1, 1, false, true);
    pushStaticGeo(finialGeo, goldMat, 0, 1.04, nz, 0, 0, 0, 1, 1, 1, false, false);
    pushStaticGeo(rippleGeo, nozzleFoamMat, 0, 0.052, nz, -Math.PI / 2, 0, 0, 1, 1, 1, false, false);
  });

  // Compact Central Marble Pool Platform (holds Crate #2)
  addBox(worldGroup, 6.2, 0.72, 6.2, 0, 0.36, -13, marbleTrimMat, {
    collide: true,
    mantleable: true,
    id: 'pool_pavilion',
  });
  addBox(worldGroup, 0.65, 2.0, 0.65, -2.5, 1.36, -15.5, sandstoneMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.65, 1.7, 0.65, 2.5, 1.21, -15.5, sandstoneMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.65, 1.5, 0.65, -2.5, 1.11, -10.5, sandstoneMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.65, 1.9, 0.65, 2.5, 1.31, -10.5, sandstoneMat, { collide: true, mantleable: false });
  addBox(worldGroup, 2.4, 0.14, 2.0, -3.5, 0.42, -13, woodMat, { collide: true, mantleable: false });

  // Weathered Wooden Parkour Ramps & Jump Boards flanking the pool (matching image silhouettes & reflection!)
  function addWoodenParkourRamp(
    id: string,
    cx: number,
    cz: number,
    width: number,
    length: number,
    height: number,
    slopeDir: 'north' | 'south' | 'east' | 'west',
    withRails = true,
  ) {
    const isZ = slopeDir === 'north' || slopeDir === 'south';
    const angle = Math.atan2(height, length);
    const deckLen = Math.hypot(length, height);
    const rx = slopeDir === 'north' ? angle : slopeDir === 'south' ? -angle : 0;
    const rz = slopeDir === 'east' ? angle : slopeDir === 'west' ? -angle : 0;

    // Sloped weathered wooden plank deck
    pushStaticGeo(
      unitBoxGeo,
      woodMat,
      cx,
      height * 0.5,
      cz,
      rx,
      0,
      rz,
      isZ ? width : deckLen,
      0.14,
      isZ ? deckLen : width,
      true,
      true,
    );

    // Timber A-frame support legs & diagonal bracing at the high end
    const highOff = length * 0.42;
    const hx = slopeDir === 'east' ? highOff : slopeDir === 'west' ? -highOff : 0;
    const hz = slopeDir === 'south' ? highOff : slopeDir === 'north' ? -highOff : 0;
    const lateral = isZ ? [[-width * 0.42, 0], [width * 0.42, 0]] : [[0, -width * 0.42], [0, width * 0.42]];
    lateral.forEach(([ox, oz]) => {
      pushStaticGeo(
        unitBoxGeo,
        woodMat,
        cx + hx + ox,
        height * 0.5,
        cz + hz + oz,
        0,
        0,
        0,
        0.16,
        height + 0.1,
        0.16,
        true,
        true,
      );
    });
    // Crossbar under high end
    pushStaticGeo(
      unitBoxGeo,
      woodMat,
      cx + hx,
      height * 0.65,
      cz + hz,
      0,
      0,
      0,
      isZ ? width * 0.88 : 0.14,
      0.14,
      isZ ? 0.14 : width * 0.88,
      false,
      true,
    );

    // Subtle weathered yellow/white parkour paint smudge at the high launch lip
    if (isZ) {
      pushStaticGeo(
        smudgeGeo,
        parkourSmudgeMat,
        cx + hx,
        height * 0.92 + 0.085,
        cz + hz,
        rx,
        0,
        0,
        width * 0.86,
        1,
        1,
        false,
        false,
      );
    } else {
      pushStaticGeo(
        smudgeGeoZ,
        parkourSmudgeMat,
        cx + hx,
        height * 0.92 + 0.085,
        cz + hz,
        0,
        0,
        rz,
        1,
        1,
        width * 0.86,
        false,
        false,
      );
    }

    if (withRails) {
      const railH = 0.72;
      lateral.forEach(([ox, oz]) => {
        pushStaticGeo(
          unitBoxGeo,
          woodMat,
          cx + ox,
          height * 0.5 + railH,
          cz + oz,
          rx,
          0,
          rz,
          isZ ? 0.1 : deckLen,
          0.1,
          isZ ? deckLen : 0.1,
          false,
          true,
        );
        pushStaticGeo(
          unitBoxGeo,
          woodMat,
          cx + hx + ox,
          (height + railH) * 0.5,
          cz + hz + oz,
          0,
          0,
          0,
          0.1,
          height + railH,
          0.1,
          false,
          true,
        );
      });
    }

    const halfW = (isZ ? width : length) / 2;
    const halfD = (isZ ? length : width) / 2;
    colliders.push({
      id,
      minX: cx - halfW,
      maxX: cx + halfW,
      minY: 0,
      maxY: height + 0.08,
      minZ: cz - halfD,
      maxZ: cz + halfD,
      mantleable: true,
      blocksZombies: false,
      ramp: {
        axis: isZ ? 'z' : 'x',
        lowCoord: isZ
          ? slopeDir === 'north'
            ? cz + halfD
            : cz - halfD
          : slopeDir === 'east'
            ? cx - halfW
            : cx + halfW,
        highCoord: isZ
          ? slopeDir === 'north'
            ? cz - halfD
            : cz + halfD
          : slopeDir === 'east'
            ? cx + halfW
            : cx - halfW,
        lowY: 0.06,
        highY: height + 0.08,
      },
    });
  }

  // Prominent weathered wooden ramps along the pool edge matching the uploaded reference photo!
  addWoodenParkourRamp('pool_ramp_left_fg', -6.8, 12.0, 2.8, 5.4, 1.75, 'north', false);
  addWoodenParkourRamp('pool_ramp_left_mid', -6.8, -19.0, 2.8, 5.2, 1.75, 'north', false);
  addWoodenParkourRamp('pool_jump_se', 6.4, 10.5, 2.2, 3.6, 1.1, 'west', true);
  addWoodenParkourRamp('pool_jump_ne', 6.4, -27.5, 2.2, 3.6, 1.1, 'west', true);

  // Symmetrical Conical Cypress Tree Rows lining BOTH sides of the sandstone walkways
  const cypressPts: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.68, 0.25),
    new THREE.Vector2(0.74, 1.6),
    new THREE.Vector2(0.6, 3.6),
    new THREE.Vector2(0.36, 5.5),
    new THREE.Vector2(0.05, 6.9),
  ];
  const cypressCanopyGeo = trackGeo(new THREE.LatheGeometry(cypressPts, 9));
  const cypressTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 1.0, 6));
  const cypressZPositions = [-46, -38, -30, -22, -14, -6, 2, 10, 18, 25];
  cypressZPositions.forEach((cz, idx) => {
    [-11.8, 11.8].forEach((cx) => {
      if (cx === 11.8 && cz === -46) return; // Clear space for Taj Gate Watchtower
      const s = 0.94 + ((idx * 17) % 5) * 0.06;
      pushStaticGeo(cypressTrunkGeo, trunkMat, cx, 0.5 * s, cz, 0, 0, 0, s, s, s, true, true);
      pushStaticGeo(cypressCanopyGeo, cypressMat, cx, 0.7 * s, cz, 0, idx * 0.7, 0, s, s, s, true, true);
      colliders.push({
        id: `cypress_${cx}_${cz}`,
        minX: cx - 0.42,
        maxX: cx + 0.42,
        minY: 0,
        maxY: 6.2,
        minZ: cz - 0.42,
        maxZ: cz + 0.42,
        mantleable: false,
        blocksZombies: true,
      });
    });
  });

  // =========================================================================
  // 3. ARCHITECTURAL PERFECTION TAJ MAHAL + YAMUNA RIVER + OCTAGONAL INTERIOR
  // =========================================================================
  // Shimmering Yamuna River behind the Taj Mahal (visible from rooftops & aerial vista!)
  const yamunaRiver = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(260, 72)), yamunaWaterMat);
  yamunaRiver.rotation.x = -Math.PI / 2;
  yamunaRiver.position.set(0, 0.02, -138);
  yamunaRiver.receiveShadow = true;
  worldGroup.add(yamunaRiver);

  // Helper: Pointed Four-Centered Mughal Arch Portal / Niche Frame (ExtrudeGeometry!)
  function createMughalArchFrameGeo(outerW: number, outerH: number, archW: number, archH: number, depth: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const hw = outerW / 2;
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(hw, outerH);
    shape.lineTo(-hw, outerH);
    shape.closePath();

    const hole = new THREE.Path();
    const ahw = archW / 2;
    const springY = archH * 0.58;
    hole.moveTo(-ahw, 0);
    hole.lineTo(ahw, 0);
    hole.lineTo(ahw, springY);
    hole.quadraticCurveTo(ahw * 0.85, archH * 0.9, 0, archH);
    hole.quadraticCurveTo(-ahw * 0.85, archH * 0.9, -ahw, springY);
    hole.closePath();
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 10,
    });
    geo.translate(0, 0, -depth / 2);
    return trackGeo(geo);
  }

  // Lower Red-Sandstone Outer Terrace ("Chameli Farsh", y = 0..1.0m) + Riverfront Corner Burj Towers
  addBox(worldGroup, 62, 1.0, 42, 0, 0.5, -77, sandstoneMat, {
    collide: true,
    mantleable: true,
    id: 'taj_chameli_farsh',
  });
  // Wide smooth sandstone approach steps (4 shallow steps, 0.25m rise each!)
  for (let s = 0; s < 4; s++) {
    addBox(worldGroup, 18, 0.25, 1.1, 0, 0.125 + s * 0.25, -52.8 - s * 0.85, sandstoneMat, {
      collide: true,
      mantleable: false,
    });
  }
  // Riverfront Red-Sandstone Octagonal Corner Towers (Burj)
  const burjBodyGeo = trackGeo(new THREE.CylinderGeometry(2.4, 2.6, 7.6, 8));
  const burjDomeGeo = trackGeo(new THREE.SphereGeometry(2.1, 12, 8));
  [
    [-29.5, -96.5],
    [29.5, -96.5],
  ].forEach(([bx, bz]) => {
    pushStaticGeo(burjBodyGeo, pavilionSandstoneMat, bx, 4.8, bz, 0, Math.PI / 8, 0, 1, 1, 1, true, true);
    pushStaticGeo(burjDomeGeo, marbleMat, bx, 9.2, bz, 0, 0, 0, 1, 1.08, 1, true, true);
    pushStaticGeo(trackGeo(new THREE.ConeGeometry(0.16, 1.4, 6)), goldMat, bx, 11.6, bz, 0, 0, 0, 1, 1, 1, true, true);
  });

  // Vast White Marble Plinth (world Z: -59.5 to -93.5, X: -25 to +25, Y: 1.0 to 3.0)
  addBox(worldGroup, 50, 2.0, 34, 0, 2.0, -76.5, marbleMat, {
    collide: true,
    mantleable: true,
    id: 'taj_plinth',
  });
  // Carved Marble Coping & Parapet Trim around Plinth Deck
  addBox(worldGroup, 17, 0.35, 0.45, -16.5, 3.17, -59.6, marbleTrimMat);
  addBox(worldGroup, 17, 0.35, 0.45, 16.5, 3.17, -59.6, marbleTrimMat);

  // Double Symmetrical White Marble Steps up onto the Taj Marble Plinth (smooth 0.33m rise!)
  for (let s = 0; s < 6; s++) {
    addBox(worldGroup, 14, 0.34, 0.85, 0, 1.17 + s * 0.33, -55.8 - s * 0.72, marbleTrimMat, {
      collide: true,
      mantleable: false,
    });
  }

  // Hollow Mausoleum Enclosure (Base Y = 3.0m) enclosing Enterable Octagonal Sanctuary
  addBox(worldGroup, 7.6, 12.8, 2.2, -7.2, 9.4, -67, marbleMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 7.6, 12.8, 2.2, 7.2, 9.4, -67, marbleMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 6.8, 6.2, 2.2, 0, 12.7, -67, marbleMat, { collide: true, mantleable: false });
  addBox(worldGroup, 2.2, 12.8, 20, -10.1, 9.4, -76.5, marbleMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 2.2, 12.8, 20, 10.1, 9.4, -76.5, marbleMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 22.4, 12.8, 2.2, 0, 9.4, -86, marbleMat, { collide: true, mantleable: false, wallrunnable: true });
  // Mausoleum Roof Slab (climbable upper terrace at y = 16.0m!)
  addBox(worldGroup, 22.4, 0.8, 20, 0, 15.6, -76.5, marbleMat, {
    collide: true,
    mantleable: true,
    id: 'taj_roof_terrace',
  });

  // Grand Central Mughal Pointed Pishtaq Arch (Iwan) + Calligraphy Pietra Dura Frame + Guldasta Pinnacles
  const mainPishtaqGeo = createMughalArchFrameGeo(11.6, 14.8, 6.8, 12.2, 1.6);
  pushStaticGeo(mainPishtaqGeo, marbleMat, 0, 3.0, -65.2, 0, 0, 0, 1, 1, 1, true, true);
  // Pietra Dura floral/calligraphy outer pishtaq border frame
  addBox(worldGroup, 12.1, 0.9, 1.7, 0, 17.6, -65.15, pietraDuraMat);
  addBox(worldGroup, 0.85, 14.8, 1.7, -5.6, 10.4, -65.15, pietraDuraMat);
  addBox(worldGroup, 0.85, 14.8, 1.7, 5.6, 10.4, -65.15, pietraDuraMat);

  // Inner vaulted semi-arch recess inside Pishtaq
  const innerPortalArchGeo = createMughalArchFrameGeo(6.8, 9.4, 4.6, 7.6, 1.2);
  pushStaticGeo(innerPortalArchGeo, pietraDuraMat, 0, 3.0, -65.9, 0, 0, 0, 1, 1, 1, true, true);

  // Slender Guldasta Lotus Pinnacles crowning the Pishtaq & Chamfer Corners
  const guldastaShaftGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 4.4, 8));
  const guldastaBudGeo = trackGeo(new THREE.SphereGeometry(0.28, 8, 6));
  const guldastaSpireGeo = trackGeo(new THREE.ConeGeometry(0.12, 0.65, 6));
  [
    [-5.8, 17.8, -65.1],
    [5.8, 17.8, -65.1],
    [-10.4, 16.2, -66.5],
    [10.4, 16.2, -66.5],
    [-10.4, 16.2, -86.2],
    [10.4, 16.2, -86.2],
  ].forEach(([gx, gy, gz]) => {
    pushStaticGeo(guldastaShaftGeo, marbleTrimMat, gx, gy + 1.4, gz, 0, 0, 0, 1, 1, 1, true, true);
    pushStaticGeo(guldastaBudGeo, marbleMat, gx, gy + 3.7, gz, 0, 0, 0, 1, 1.25, 1, true, true);
    pushStaticGeo(guldastaSpireGeo, goldMat, gx, gy + 4.3, gz, 0, 0, 0, 1, 1, 1, true, true);
  });

  // Flanking 2-Tier Pointed Mughal Arched Alcoves (Lower & Upper Wings + 45° Chamfer Corners)
  const wingNicheGeo = createMughalArchFrameGeo(3.6, 5.4, 2.2, 4.2, 0.85);
  [-8.0, 8.0].forEach((nx) => {
    // Lower tier arched niche
    pushStaticGeo(wingNicheGeo, marbleMat, nx, 3.0, -65.6, 0, 0, 0, 1, 1, 1, true, true);
    addBox(worldGroup, 2.4, 4.2, 0.3, nx, 5.2, -66.1, sanctuarySlateMat);
    // Upper tier arched niche
    pushStaticGeo(wingNicheGeo, marbleMat, nx, 9.2, -65.6, 0, 0, 0, 1, 1, 1, true, true);
    addBox(worldGroup, 2.4, 4.2, 0.3, nx, 11.4, -66.1, sanctuarySlateMat);
    addBox(worldGroup, 3.6, 0.55, 0.9, nx, 8.95, -65.6, pietraDuraMat);
  });

  // East, West & North Facade Pishtaqs + Chamfered 45° Corner Alcoves
  const sidePishtaqGeo = createMughalArchFrameGeo(9.2, 13.8, 5.2, 10.6, 1.2);
  pushStaticGeo(sidePishtaqGeo, marbleMat, -10.8, 3.0, -76.5, 0, Math.PI / 2, 0, 1, 1, 1, true, true);
  pushStaticGeo(sidePishtaqGeo, marbleMat, 10.8, 3.0, -76.5, 0, -Math.PI / 2, 0, 1, 1, 1, true, true);
  pushStaticGeo(sidePishtaqGeo, marbleMat, 0, 3.0, -86.6, 0, 0, 0, 1, 1, 1, true, true);

  [
    [-10.3, -66.8, Math.PI / 4],
    [10.3, -66.8, -Math.PI / 4],
    [-10.3, -86.2, (Math.PI * 3) / 4],
    [10.3, -86.2, (-Math.PI * 3) / 4],
  ].forEach(([cx, cz, ry]) => {
    addBox(worldGroup, 3.8, 12.8, 3.8, cx, 9.4, cz, marbleTrimMat, { rotY: ry });
    pushStaticGeo(wingNicheGeo, marbleMat, cx, 3.0, cz, 0, ry, 0, 0.88, 1, 1.5, true, true);
    pushStaticGeo(wingNicheGeo, marbleMat, cx, 9.2, cz, 0, ry, 0, 0.88, 1, 1.5, true, true);
  });

  // Octagonal Checkered Inlaid Marble Floor inside chamber (y = 3.02m)
  const chamberFloor = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(7.9, 8)), marbleMat);
  chamberFloor.rotation.x = -Math.PI / 2;
  chamberFloor.rotation.z = Math.PI / 8;
  chamberFloor.position.set(0, 3.02, -76.5);
  chamberFloor.receiveShadow = true;
  worldGroup.add(chamberFloor);
  climbableMeshes.push(chamberFloor);

  const inlayRing = new THREE.Mesh(trackGeo(new THREE.RingGeometry(4.3, 4.75, 8)), pietraDuraMat);
  inlayRing.rotation.x = -Math.PI / 2;
  inlayRing.rotation.z = Math.PI / 8;
  inlayRing.position.set(0, 3.03, -76.5);
  worldGroup.add(inlayRing);

  // 2-Tier Octagonal Interior Chamber Bays + Carved Floral Spandrels
  const octRadius = 7.65;
  const bayBackGeo = trackGeo(new THREE.BoxGeometry(5.6, 10.6, 0.45));
  const bayDadoGeo = trackGeo(new THREE.BoxGeometry(5.5, 1.45, 0.24));
  const bayJaliGeo = trackGeo(new THREE.BoxGeometry(2.8, 3.1, 0.16));
  const bayPilasterGeo = trackGeo(new THREE.BoxGeometry(0.65, 3.8, 0.32));
  const bayHeaderGeo = trackGeo(new THREE.BoxGeometry(4.2, 0.65, 0.32));
  const bayCorniceGeo = trackGeo(new THREE.BoxGeometry(5.9, 0.45, 0.55));
  const bayWinGeo = trackGeo(new THREE.BoxGeometry(2.5, 3.3, 0.16));
  const bayUpPilGeo = trackGeo(new THREE.BoxGeometry(0.7, 3.9, 0.3));
  const bayUpCapGeo = trackGeo(new THREE.BoxGeometry(4.0, 0.75, 0.3));

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const bx = Math.sin(ang) * octRadius;
    const bz = -76.5 + Math.cos(ang) * octRadius;

    const vAng = ang + Math.PI / 8;
    const vx = Math.sin(vAng) * (octRadius + 0.35);
    const vz = -76.5 + Math.cos(vAng) * (octRadius + 0.35);
    addBox(worldGroup, 0.95, 10.6, 0.95, vx, 8.3, vz, marbleTrimMat, { rotY: vAng });

    if (i === 0) continue; // South entrance bay stays open!

    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const placeBay = (geo: THREE.BufferGeometry, mat: THREE.Material, lx: number, ly: number, lz: number) => {
      const wx = bx + lx * cosA + lz * sinA;
      const wz = bz - lx * sinA + lz * cosA;
      pushStaticGeo(geo, mat, wx, 3.0 + ly, wz, 0, ang, 0, 1, 1, 1, false, true);
    };

    placeBay(bayBackGeo, marbleMat, 0, 5.3, 0.25);
    placeBay(bayDadoGeo, pietraDuraMat, 0, 0.72, -0.05);
    placeBay(bayJaliGeo, jaliMat, 0, 2.95, -0.02);
    placeBay(bayPilasterGeo, pietraDuraMat, -1.7, 3.2, -0.08);
    placeBay(bayPilasterGeo, pietraDuraMat, 1.7, 3.2, -0.08);
    placeBay(bayHeaderGeo, pietraDuraMat, 0, 4.75, -0.08);
    placeBay(bayCorniceGeo, marbleTrimMat, 0, 5.35, -0.15);
    placeBay(bayWinGeo, tealWindowMat, 0, 7.45, -0.02);
    placeBay(bayUpPilGeo, marbleMat, -1.55, 7.55, -0.08);
    placeBay(bayUpPilGeo, marbleMat, 1.55, 7.55, -0.08);
    placeBay(bayUpCapGeo, pietraDuraMat, 0, 9.55, -0.08);
  }

  // Carved Interior Muqarnas Ceiling Dome + Apex Lotus Rosette + Hanging Cairo Brass Lamp!
  const innerDome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(8.05, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.54)),
    domeInteriorMat,
  );
  innerDome.position.set(0, 12.4, -76.5);
  worldGroup.add(innerDome);

  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(1.75, 1.75, 0.14, 14)), goldMat, 0, 20.3, -76.5, 0, 0, 0, 1, 1, 1, false, false);
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(1.25, 1.25, 0.18, 12)), crimsonLotusMat, 0, 20.3, -76.5, 0, 0, 0, 1, 1, 1, false, false);

  // Lord Curzon's Hanging Brass Filigree Mosque Lamp suspended over the Central Cenotaph
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 11.4, 6)), goldMat, 0, 14.5, -76.5, 0, 0, 0, 1, 1, 1, false, false);
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.56, 0.34, 0.65, 10)), brassLampMat, 0, 8.65, -76.5, 0, 0, 0, 1, 1, 1, false, false);
  pushStaticGeo(trackGeo(new THREE.SphereGeometry(0.42, 10, 8)), brassLampMat, 0, 8.15, -76.5, 0, 0, 0, 1, 1.2, 1, false, false);
  pushStaticGeo(trackGeo(new THREE.ConeGeometry(0.2, 0.45, 8)), goldMat, 0, 7.55, -76.5, Math.PI, 0, 0, 1, 1, 1, false, false);

  // Central Octagonal Pierced-Jali Sanctuary Screen & Ornate Twin Cenotaphs (Mumtaz Mahal & Shah Jahan)
  const jaliRadius = 3.25;
  const slatePanelGeo = trackGeo(new THREE.BoxGeometry(2.35, 1.1, 0.14));
  const jaliFriezeGeo = trackGeo(new THREE.BoxGeometry(2.35, 1.05, 0.1));
  const jaliPostGeo = trackGeo(new THREE.BoxGeometry(0.2, 2.35, 0.22));
  const jaliCrestGeo = trackGeo(new THREE.BoxGeometry(2.45, 0.16, 0.18));
  const postFinialGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.38, 6));

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const jx = Math.sin(ang) * jaliRadius;
    const jz = -76.5 + Math.cos(ang) * jaliRadius;
    if (i === 0) {
      addBox(worldGroup, 0.42, 2.8, 0.3, -1.05, 4.4, jz, marbleMat);
      addBox(worldGroup, 0.42, 2.8, 0.3, 1.05, 4.4, jz, marbleMat);
      addBox(worldGroup, 2.55, 0.65, 0.3, 0, 5.6, jz, jaliMat);
      addBox(worldGroup, 2.65, 0.18, 0.34, 0, 5.98, jz, pietraDuraMat);
      continue;
    }
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const placePanel = (geo: THREE.BufferGeometry, mat: THREE.Material, lx: number, ly: number) => {
      pushStaticGeo(geo, mat, jx + lx * cosA, 3.0 + ly, jz - lx * sinA, 0, ang, 0, 1, 1, 1, false, true);
    };
    placePanel(slatePanelGeo, pietraDuraMat, 0, 0.55);
    placePanel(jaliFriezeGeo, jaliMat, 0, 1.62);
    placePanel(jaliPostGeo, marbleMat, -1.18, 1.18);
    placePanel(jaliPostGeo, marbleMat, 1.18, 1.18);
    placePanel(jaliCrestGeo, pietraDuraMat, 0, 2.28);
    placePanel(postFinialGeo, marbleTrimMat, 1.18, 2.55);
  }

  // Mumtaz Mahal Cenotaph (dead center) + Shah Jahan Larger Cenotaph (west side, stepped qalamdan)
  addBox(worldGroup, 1.15, 0.38, 1.95, 0.45, 3.21, -76.5, pietraDuraMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.72, 0.34, 1.45, 0.45, 3.57, -76.5, marbleMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.46, 0.22, 1.05, 0.45, 3.85, -76.5, pietraDuraMat, { collide: true, mantleable: false });

  addBox(worldGroup, 1.38, 0.46, 2.25, -0.95, 3.25, -76.5, pietraDuraMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.88, 0.42, 1.68, -0.95, 3.69, -76.5, marbleMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.54, 0.26, 1.2, -0.95, 4.03, -76.5, pietraDuraMat, { collide: true, mantleable: false });

  // Sculpted Central Bulbous Onion Dome + Tall Inlaid Drum + Inverted Lotus Cap + Golden Kalash Finial
  const domePoints: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(5.45, 0.0),
    new THREE.Vector2(5.55, 2.0),
    new THREE.Vector2(6.48, 4.3),
    new THREE.Vector2(6.15, 6.7),
    new THREE.Vector2(4.45, 9.0),
    new THREE.Vector2(2.05, 10.6),
    new THREE.Vector2(0.6, 11.7),
    new THREE.Vector2(0.01, 12.0),
  ];
  const onionDomeGeo = trackGeo(new THREE.LatheGeometry(domePoints, 26));
  pushStaticGeo(onionDomeGeo, marbleMat, 0, 16.0, -76.5, 0, 0, 0, 1, 1, 1, true, true);
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(5.65, 5.85, 2.4, 24)), pietraDuraMat, 0, 17.0, -76.5, 0, 0, 0, 1, 1, 1, true, true);
  // Inverted lotus petal crown + multi-tiered golden kalash spire
  pushStaticGeo(trackGeo(new THREE.ConeGeometry(1.15, 1.1, 14)), marbleTrimMat, 0, 27.9, -76.5, 0, 0, 0, 1, 1, 1, true, true);
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.12, 0.36, 4.4, 8)), goldMat, 0, 30.2, -76.5, 0, 0, 0, 1, 1, 1, true, true);
  [29.1, 29.9, 30.65].forEach((ky, idx) => {
    pushStaticGeo(trackGeo(new THREE.SphereGeometry(0.58 - idx * 0.14, 10, 8)), goldMat, 0, ky, -76.5, 0, 0, 0, 1, 1, 1, true, true);
  });

  // 4 Open 8-Pillared Rooftop Chhatri Kiosks (authentic octagonal colonnade + chhajja eaves + dome)
  const chhatriPillarGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.15, 2.4, 7));
  const chhatriEaveGeo = trackGeo(new THREE.CylinderGeometry(2.15, 2.38, 0.28, 8));
  const chhatriDomeGeo = trackGeo(new THREE.SphereGeometry(1.9, 14, 9));
  const kFinialGeo = trackGeo(new THREE.ConeGeometry(0.18, 1.1, 6));
  [
    [-6.8, -69.6],
    [6.8, -69.6],
    [-6.8, -83.4],
    [6.8, -83.4],
  ].forEach(([kx, kz]) => {
    pushStaticGeo(trackGeo(new THREE.CylinderGeometry(1.9, 2.0, 0.32, 8)), marbleTrimMat, kx, 16.16, kz, 0, 0, 0, 1, 1, 1, true, true);
    for (let c = 0; c < 8; c++) {
      const ca = (c / 8) * Math.PI * 2;
      pushStaticGeo(chhatriPillarGeo, marbleMat, kx + Math.cos(ca) * 1.55, 17.5, kz + Math.sin(ca) * 1.55, 0, 0, 0, 1, 1, 1, true, true);
    }
    pushStaticGeo(chhatriEaveGeo, marbleTrimMat, kx, 18.8, kz, 0, Math.PI / 8, 0, 1, 1, 1, true, true);
    pushStaticGeo(chhatriDomeGeo, marbleMat, kx, 19.3, kz, 0, 0, 0, 1, 1.08, 1, true, true);
    pushStaticGeo(kFinialGeo, goldMat, kx, 21.6, kz, 0, 0, 0, 1, 1, 1, true, true);
  });

  // 4 Tall 3-Tier Octagonal Corner Minarets with Carved Balconies, Corbel Rings & Open Chhatri Lanterns
  const minaretPositions: [number, number][] = [
    [-21.2, -61.8],
    [21.2, -61.8],
    [-21.2, -91.2],
    [21.2, -91.2],
  ];
  const minBaseGeo = trackGeo(new THREE.CylinderGeometry(2.15, 2.35, 2.2, 8));
  const minCupolaGeo = trackGeo(new THREE.SphereGeometry(1.3, 12, 8));
  const minSpireGeo = trackGeo(new THREE.ConeGeometry(0.15, 1.9, 6));
  const minLanternPostGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 1.6, 6));
  const tiers = [
    { y: 5.5, h: 6.8, rTop: 1.54, rBot: 1.76 },
    { y: 12.2, h: 6.4, rTop: 1.3, rBot: 1.5 },
    { y: 18.4, h: 5.9, rTop: 1.1, rBot: 1.28 },
  ];
  const tierGeos = tiers.map((t) => ({
    shaft: trackGeo(new THREE.CylinderGeometry(t.rTop, t.rBot, t.h, 8)),
    corbel: trackGeo(new THREE.CylinderGeometry(t.rTop + 0.5, t.rTop, 0.45, 8)),
    balcony: trackGeo(new THREE.CylinderGeometry(t.rTop + 0.58, t.rTop + 0.54, 0.42, 8)),
    y: t.y,
    h: t.h,
  }));

  minaretPositions.forEach(([mx, mz]) => {
    pushStaticGeo(minBaseGeo, marbleTrimMat, mx, 3.0 + 1.1, mz, 0, Math.PI / 8, 0, 1, 1, 1, true, true);
    tierGeos.forEach((tg) => {
      pushStaticGeo(tg.shaft, marbleMat, mx, 3.0 + tg.y, mz, 0, Math.PI / 8, 0, 1, 1, 1, true, true);
      pushStaticGeo(tg.corbel, pietraDuraMat, mx, 3.0 + tg.y + tg.h / 2 - 0.2, mz, 0, Math.PI / 8, 0, 1, 1, 1, true, true);
      pushStaticGeo(tg.balcony, marbleTrimMat, mx, 3.0 + tg.y + tg.h / 2 + 0.18, mz, 0, Math.PI / 8, 0, 1, 1, 1, true, true);
    });
    // Top open 6-pillar minaret lantern
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * Math.PI * 2;
      pushStaticGeo(minLanternPostGeo, marbleMat, mx + Math.cos(pa) * 0.92, 3.0 + 22.2, mz + Math.sin(pa) * 0.92, 0, 0, 0, 1, 1, 1, true, true);
    }
    pushStaticGeo(minCupolaGeo, marbleMat, mx, 3.0 + 23.4, mz, 0, 0, 0, 1, 1.06, 1, true, true);
    pushStaticGeo(minSpireGeo, goldMat, mx, 3.0 + 25.3, mz, 0, 0, 0, 1, 1, 1, true, true);

    colliders.push({
      id: `minaret_${mx}_${mz}`,
      minX: mx - 2.1,
      maxX: mx + 2.1,
      minY: 3.0,
      maxY: 28,
      minZ: mz - 2.1,
      maxZ: mz + 2.1,
      mantleable: false,
      blocksZombies: true,
      wallrunnable: true,
    });
  });

  // Taj Mahal Side Parkour Scaffolding & Wooden Platforms leading up onto the Mausoleum Roof Terrace!
  [-15.2, 15.2].forEach((sx, sideIdx) => {
    const sign = sideIdx === 0 ? -1 : 1;
    // Lower scaffolding deck on marble plinth (y = 3.0 -> 5.2m)
    addBox(worldGroup, 3.4, 0.25, 4.4, sx, 5.2, -64.5, woodMat, { collide: true, mantleable: true });
    addBox(worldGroup, 0.2, 2.2, 0.2, sx - 1.4, 4.1, -66.4, darkMetalMat);
    addBox(worldGroup, 0.2, 2.2, 0.2, sx + 1.4, 4.1, -66.4, darkMetalMat);
    // Mid scaffolding deck (y = 7.6m)
    addBox(worldGroup, 3.2, 0.25, 4.2, sx - sign * 1.2, 7.6, -70.5, diamondPlateMat, { collide: true, mantleable: true });
    // Vertical timber wall-run board connecting mid deck to upper roof deck!
    addBox(worldGroup, 0.35, 4.2, 7.5, sx - sign * 2.6, 10.6, -74.5, parkourWallMat, {
      collide: true,
      mantleable: true,
      wallrunnable: true,
    });
    // Upper catwalk onto Taj Roof Terrace (y = 12.2 -> 16.0m)
    addBox(worldGroup, 3.2, 0.25, 4.6, sx - sign * 1.6, 12.2, -79.5, woodMat, { collide: true, mantleable: true });
    addBox(worldGroup, 3.6, 0.25, 3.2, sx - sign * 3.4, 14.6, -82.5, diamondPlateMat, { collide: true, mantleable: true });
  });

  // FLANKING RED SANDSTONE WEST MOSQUE & EAST JAWAB PAVILIONS (Matches target image skyline!)
  const sideDomeGeo = trackGeo(new THREE.SphereGeometry(3.0, 14, 10));
  const sideSmallDomeGeo = trackGeo(new THREE.SphereGeometry(1.9, 12, 8));
  [-36, 36].forEach((px, idx) => {
    const faceSign = idx === 0 ? 1 : -1;
    // Main red sandstone pavilion hall
    addBox(worldGroup, 11, 9.2, 22, px, 4.6, -74, pavilionSandstoneMat, {
      castShadow: true,
      receiveShadow: true,
    });
    // Central arched pishtaq projection facing inward/south
    addBox(worldGroup, 11.8, 11.4, 8.0, px, 5.7, -74, pavilionSandstoneMat, {
      castShadow: true,
      receiveShadow: true,
    });
    // White marble trim frieze & corner roof chhatris
    addBox(worldGroup, 12.1, 0.7, 22.4, px, 9.4, -74, marbleTrimMat, { castShadow: true, receiveShadow: true });
    // Central white marble dome + flanking smaller domes (matching left skyline of image!)
    pushStaticGeo(sideDomeGeo, marbleMat, px, 12.2, -74, 0, 0, 0, 1, 1.08, 1, true, true);
    pushStaticGeo(kFinialGeo, goldMat, px, 15.6, -74, 0, 0, 0, 1.2, 1.3, 1.2, true, true);
    [-6.8, 6.8].forEach((dz) => {
      pushStaticGeo(sideSmallDomeGeo, marbleMat, px, 10.6, -74 + dz, 0, 0, 0, 1, 1.05, 1, true, true);
      pushStaticGeo(kFinialGeo, goldMat, px, 12.8, -74 + dz, 0, 0, 0, 0.9, 1.0, 0.9, true, true);
    });
    // South-facing facade arch & corner turret
    addBox(worldGroup, 5.2, 6.2, 0.5, px, 4.2, -62.9, sanctuarySlateMat, { castShadow: true, receiveShadow: true });
    addBox(worldGroup, 1.4, 11.8, 1.4, px - faceSign * 5.2, 5.9, -63.2, pavilionSandstoneMat, { castShadow: true, receiveShadow: true });
    pushStaticGeo(
      trackGeo(new THREE.SphereGeometry(0.9, 10, 8)),
      marbleMat,
      px - faceSign * 5.2,
      12.1,
      -63.2,
      0,
      0,
      0,
      1,
      1,
      1,
      true,
      true,
    );
  });

  // =========================================================================
  // 4. UV SAFE HOUSE BARRICADES, "SAFE HOUSE" SIGN & PURPLE UV LIGHT SHAFTS
  // =========================================================================
  [-12.2, 12.2].forEach((bx) => {
    addBox(worldGroup, 6.2, 2.2, 1.4, bx, 1.1, -51.6, rustMat, {
      collide: true,
      mantleable: false,
    });
    addBox(worldGroup, 5.4, 0.35, 0.35, bx, 1.8, -50.8, woodMat, { rotZ: 0.14 });
    addBox(worldGroup, 5.4, 0.35, 0.35, bx, 0.9, -50.8, woodMat, { rotZ: -0.1 });
  });

  // Overhead UV Gantry Arch + Illuminated "SAFE HOUSE" Banner Sign framing the Taj entrance stairs
  addBox(worldGroup, 0.55, 5.4, 0.55, -8.8, 2.7, -51.6, darkMetalMat, { collide: true, mantleable: false });
  addBox(worldGroup, 0.55, 5.4, 0.55, 8.8, 2.7, -51.6, darkMetalMat, { collide: true, mantleable: false });
  addBox(worldGroup, 18.2, 0.55, 0.6, 0, 5.4, -51.6, darkMetalMat);

  const safeHouseSignMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.safeHouseSign,
    }),
  );
  const safeHouseSignMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(6.2, 1.55)), safeHouseSignMat);
  safeHouseSignMesh.position.set(0, 4.6, -51.22);
  worldGroup.add(safeHouseSignMesh);

  // Additive Purple UV Light Beam Shafts illuminating the Taj Mahal central arch
  const uvBeamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const uvBeamGeo = trackGeo(new THREE.CylinderGeometry(0.85, 2.6, 13.5, 12, 1, true));
  [
    [-3.4, 9.2, -64.4, 0.12],
    [3.4, 9.2, -64.4, -0.12],
    [-8.2, 8.6, -65.2, 0.08],
    [8.2, 8.6, -65.2, -0.08],
  ].forEach(([bx, by, bz, rz]) => {
    const beam = new THREE.Mesh(uvBeamGeo, uvBeamMat);
    beam.position.set(bx, by, bz);
    beam.rotation.z = rz;
    worldGroup.add(beam);
  });

  // UV Tubes (meshes batched, only 2 real PointLights for ultra-fast fragment shaders!)
  const uvSpots: [number, number, number][] = [
    [-4.8, 5.25, -51.3],
    [0, 5.25, -51.3],
    [4.8, 5.25, -51.3],
    [-6.2, 4.6, -63.8],
    [6.2, 4.6, -63.8],
    [0, 6.8, -76],
  ];
  const uvTubeGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 8));
  uvSpots.forEach(([ux, uy, uz]) => {
    const tube = new THREE.Mesh(uvTubeGeo, uvTubeMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(ux, uy, uz);
    worldGroup.add(tube);
    uvGlowMeshes.push(tube);
  });

  // Consolidated UV PointLights (2 total for ultra-fast fragment shaders)
  const gantryUvLight = new THREE.PointLight(0xa855f7, 14, 34, 1.5);
  gantryUvLight.castShadow = false;
  gantryUvLight.position.set(0, 5.2, -50.8);
  worldGroup.add(gantryUvLight);
  uvLights.push(gantryUvLight);

  const domeUvLight = new THREE.PointLight(0x9333ea, 22, 52, 1.35);
  domeUvLight.castShadow = false;
  domeUvLight.position.set(0, 14.5, -62);
  worldGroup.add(domeUvLight);
  uvLights.push(domeUvLight);

  // Survivor Floodlight Towers + 1 Wide Consolidated SpotLight
  const floodBulbGeo = trackGeo(new THREE.PlaneGeometry(0.75, 0.38));
  [-9.8, 9.8].forEach((fx) => {
    addBox(worldGroup, 0.35, 3.2, 0.35, fx, 1.6, -49.8, darkMetalMat);
    addBox(worldGroup, 0.9, 0.5, 0.45, fx, 3.3, -49.8, darkMetalMat, { rotX: 0.25 });
    pushStaticGeo(floodBulbGeo, floodBulbMat, fx, 3.28, -49.56, 0.25, 0, 0, 1, 1, 1, false, false);
  });

  const mainFloodSpot = new THREE.SpotLight(0xfff1d6, 9, 44, Math.PI / 3.2, 0.55, 1.5);
  mainFloodSpot.castShadow = false;
  mainFloodSpot.position.set(0, 4.5, -49.5);
  mainFloodSpot.target.position.set(0, 0, -30);
  worldGroup.add(mainFloodSpot);
  worldGroup.add(mainFloodSpot.target);
  floodLights.push(mainFloodSpot);

  const uvFloorStrip = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(17.2, 1.0)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x7e22ce,
        emissiveIntensity: 2.4,
        roughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    ),
  );
  uvFloorStrip.rotation.x = -Math.PI / 2;
  uvFloorStrip.position.set(0, 0.03, -51.6);
  worldGroup.add(uvFloorStrip);

  // Glowing purple-blue UV Light Barrier Curtain under the Taj Safe House gantry arch
  const uvBarrierMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const uvBarrierMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(17.0, 5.0)), uvBarrierMat);
  uvBarrierMesh.position.set(0, 2.55, -51.6);
  worldGroup.add(uvBarrierMesh);

  // =========================================================================
  // 5. OVERGROWN ROOFTOP BUILDINGS, MULTI-TIER CLIMB ROUTES & ROPE BRIDGES
  // =========================================================================
  const roofGrassPositions: THREE.Vector3[] = [];
  const tankGeo = trackGeo(new THREE.CylinderGeometry(0.85, 0.85, 1.4, 8));
  const solarMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.25, metalness: 0.7 }),
  );

  interface BuildingSpec {
    id: string;
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    wallMat: THREE.Material;
    awningSide: 'south' | 'north' | 'east' | 'west';
  }

  function createParkourBuilding(spec: BuildingSpec) {
    const { id, x, z, w, h, d, wallMat, awningSide } = spec;
    addBox(worldGroup, w, h, d, x, h / 2, z, wallMat, {
      collide: true,
      mantleable: true,
      wallrunnable: true,
      id,
    });

    const rimH = 0.32;
    addBox(worldGroup, w + 0.3, rimH, 0.32, x, h + rimH / 2, z - d / 2, sandstoneMat);
    addBox(worldGroup, w + 0.3, rimH, 0.32, x, h + rimH / 2, z + d / 2, sandstoneMat);
    addBox(worldGroup, 0.32, rimH, d, x - w / 2, h + rimH / 2, z, sandstoneMat);
    addBox(worldGroup, 0.32, rimH, d, x + w / 2, h + rimH / 2, z, sandstoneMat);

    pushStaticGeo(tankGeo, darkMetalMat, x - w * 0.28, h + 0.7, z - d * 0.28, 0, 0, 0, 1, 1, 1, true, true);
    pushStaticGeo(unitBoxGeo, solarMat, x + w * 0.24, h + 0.45, z - d * 0.25, 0.35, 0, 0, 2.2, 0.1, 1.3, false, true);

    addBox(worldGroup, 2.4, 0.45, 1.2, x - w * 0.22, h + 0.225, z + d * 0.25, woodMat, {
      collide: true,
      mantleable: true,
    });

    for (let g = 0; g < 18; g++) {
      const gx = x + (((g * 37) % 100) / 100 - 0.5) * (w - 1.4);
      const gz = z + (((g * 61) % 100) / 100 - 0.5) * (d - 1.4);
      roofGrassPositions.push(new THREE.Vector3(gx, h, gz));
    }

    addBox(
      worldGroup,
      w * 0.45,
      2.3,
      0.2,
      x,
      1.15,
      z + (awningSide === 'north' ? -d / 2 - 0.1 : d / 2 + 0.1),
      rustMat,
    );

    const dirX = awningSide === 'east' ? 1 : awningSide === 'west' ? -1 : 0;
    const dirZ = awningSide === 'south' ? 1 : awningSide === 'north' ? -1 : 0;

    const step1X = x + dirX * (w / 2 + 2.4) + (dirX === 0 ? 1.8 : 0);
    const step1Z = z + dirZ * (d / 2 + 2.4) + (dirZ === 0 ? 1.8 : 0);
    addBox(worldGroup, 2.2, 1.25, 2.2, step1X, 0.625, step1Z, woodMat, {
      collide: true,
      mantleable: true,
      id: `${id}_step1`,
    });
    pushStaticGeo(smudgeGeo, parkourSmudgeMat, step1X, 1.266, step1Z, 0, 0, 0, 1.7, 1, 1, false, false);

    const awX = x + dirX * (w / 2 + 1.3);
    const awZ = z + dirZ * (d / 2 + 1.3);
    const awW = dirX === 0 ? w * 0.65 : 2.6;
    const awD = dirZ === 0 ? d * 0.65 : 2.6;
    addBox(worldGroup, awW, 0.3, awD, awX, 2.35, awZ, rustMat, {
      collide: true,
      mantleable: true,
      id: `${id}_awning`,
    });
    if (dirX === 0) {
      pushStaticGeo(
        smudgeGeo,
        parkourSmudgeMat,
        awX,
        2.515,
        awZ + dirZ * (awD * 0.34),
        0,
        0,
        0,
        awW * 0.72,
        1,
        1,
        false,
        false,
      );
    } else {
      pushStaticGeo(
        smudgeGeoZ,
        parkourSmudgeMat,
        awX + dirX * (awW * 0.34),
        2.515,
        awZ,
        0,
        0,
        0,
        1,
        1,
        awD * 0.72,
        false,
        false,
      );
    }

    // Subtle weathered yellow/white paint smudges on the climbable rooftop parapet rim
    if (awningSide === 'north') {
      pushStaticGeo(smudgeGeo, parkourSmudgeMat, x, h + rimH + 0.016, z - d / 2, 0, 0, 0, w * 0.62, 1, 1, false, false);
    } else if (awningSide === 'south') {
      pushStaticGeo(smudgeGeo, parkourSmudgeMat, x, h + rimH + 0.016, z + d / 2, 0, 0, 0, w * 0.62, 1, 1, false, false);
    } else if (awningSide === 'west') {
      pushStaticGeo(smudgeGeoZ, parkourSmudgeMat, x - w / 2, h + rimH + 0.016, z, 0, 0, 0, 1, 1, d * 0.62, false, false);
    } else {
      pushStaticGeo(smudgeGeoZ, parkourSmudgeMat, x + w / 2, h + rimH + 0.016, z, 0, 0, 0, 1, 1, d * 0.62, false, false);
    }

    if (h > 4.2) {
      const midH = Math.max(3.6, h - 1.5);
      const balX = x + dirX * (w / 2 + 1.15) - (dirX === 0 ? 1.8 : 0);
      const balZ = z + dirZ * (d / 2 + 1.15) - (dirZ === 0 ? 1.8 : 0);
      addBox(worldGroup, dirX === 0 ? 3.2 : 2.3, 0.32, dirZ === 0 ? 3.2 : 2.3, balX, midH, balZ, woodMat, {
        collide: true,
        mantleable: true,
        id: `${id}_balcony`,
      });
      pushStaticGeo(
        dirX === 0 ? smudgeGeo : smudgeGeoZ,
        parkourSmudgeMat,
        balX,
        midH + 0.175,
        balZ,
        0,
        0,
        0,
        dirX === 0 ? 2.1 : 1,
        1,
        dirX === 0 ? 1 : 2.1,
        false,
        false,
      );
      addBox(worldGroup, 0.14, midH, 0.14, balX + 0.9, midH / 2, balZ + 0.9, darkMetalMat);
      addBox(worldGroup, 0.14, midH, 0.14, balX - 0.9, midH / 2, balZ - 0.9, darkMetalMat);
    }
  }

  // Outer West & East Flank Buildings (shifted to x = ±27.5 so central Charbagh & Mosque/Jawab vista stays clean!)
  createParkourBuilding({
    id: 'bldg_w1',
    x: -27.5,
    z: 22,
    w: 10,
    h: 4.0,
    d: 10,
    wallMat: plasterMat,
    awningSide: 'south',
  });
  createParkourBuilding({
    id: 'bldg_w2',
    x: -27.5,
    z: 3,
    w: 10,
    h: 5.8,
    d: 12,
    wallMat: plasterAltMat,
    awningSide: 'east',
  });
  createParkourBuilding({
    id: 'bldg_w3',
    x: -27.5,
    z: -19,
    w: 10,
    h: 4.4,
    d: 11,
    wallMat: plasterTealMat,
    awningSide: 'south',
  });

  createParkourBuilding({
    id: 'bldg_e1',
    x: 27.5,
    z: 23,
    w: 10,
    h: 3.9,
    d: 10,
    wallMat: plasterTealMat,
    awningSide: 'south',
  });
  createParkourBuilding({
    id: 'bldg_e2',
    x: 27.5,
    z: 4,
    w: 10,
    h: 5.5,
    d: 11,
    wallMat: plasterMat,
    awningSide: 'west',
  });
  createParkourBuilding({
    id: 'bldg_e3',
    x: 27.5,
    z: -18,
    w: 10,
    h: 4.3,
    d: 11,
    wallMat: plasterAltMat,
    awningSide: 'north',
  });

  const hazardYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    }),
  );
  const cableMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.6 }));
  const bulbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
  );
  stringBulbMats.push(bulbMat);
  const bulbGeo = trackGeo(new THREE.SphereGeometry(0.11, 6, 6));

  function addParkourBridge(x: number, y: number, z: number, lenZ: number, steel = false) {
    addBox(worldGroup, 2.5, 0.24, lenZ, x, y, z, steel ? diamondPlateMat : woodMat, {
      collide: true,
      mantleable: true,
    });
    const postCount = Math.max(2, Math.floor(lenZ / 3.5) + 1);
    for (let p = 0; p < postCount; p++) {
      const pz = z - lenZ / 2 + (p / (postCount - 1)) * lenZ;
      [-1.18, 1.18].forEach((px) => {
        addBox(worldGroup, 0.12, 1.05, 0.12, x + px, y + 0.52, pz, steel ? darkMetalMat : woodMat);
      });
      if (p % 2 === 1) {
        pushStaticGeo(bulbGeo, bulbMat, x, y + 1.45, pz, 0, 0, 0, 1, 1, 1, false, false);
      }
    }
    [-1.18, 1.18].forEach((px) => {
      addBox(worldGroup, 0.05, 0.05, lenZ, x + px, y + 0.92, z, steel ? darkMetalMat : ropeMat);
    });
    pushStaticGeo(smudgeGeo, parkourSmudgeMat, x, y + 0.135, z - lenZ * 0.44, 0, 0, 0, 2.0, 1, 1, false, false);
    pushStaticGeo(smudgeGeo, parkourSmudgeMat, x, y + 0.135, z + lenZ * 0.44, 0, 0, 0, 2.0, 1, 1, false, false);
  }

  addParkourBridge(-27.5, 4.1, 14.5, 5.4, true);
  addBox(worldGroup, 3.2, 1.0, 3.2, -27.5, 4.45, 10.6, diamondPlateMat, { collide: true, mantleable: true });
  addParkourBridge(-27.5, 5.1, -8.2, 11.4, false);

  addParkourBridge(27.5, 4.0, 15.5, 5.4, true);
  addBox(worldGroup, 3.2, 1.0, 3.2, 27.5, 4.35, 11.2, diamondPlateMat, { collide: true, mantleable: true });
  addParkourBridge(27.5, 4.9, -7.0, 11.6, true);

  // Dedicated Slatted Parkour Wall-Run Boards & Tic-Tac Alley Walls (with yellow runner chevrons!)
  const wallRunPanels: Array<[number, number, number, number, number, number]> = [
    [-21.2, 2.8, 13.5, 0.4, 3.4, 7.8],   // West rooftop run-wall bridging W1 -> W2
    [-21.2, 3.2, -8.0, 0.4, 3.6, 8.2],   // West rooftop run-wall bridging W2 -> W3
    [21.2, 2.8, 14.5, 0.4, 3.4, 7.8],    // East rooftop run-wall bridging E1 -> E2
    [21.2, 3.2, -7.0, 0.4, 3.6, 8.2],    // East rooftop run-wall bridging E2 -> E3
    [-19.5, 2.4, -36.0, 0.4, 3.2, 8.5],  // North-West approach run-wall toward Taj plinth
    [19.5, 2.4, -36.0, 0.4, 3.2, 8.5],   // North-East approach run-wall toward Taj plinth
  ];
  wallRunPanels.forEach(([wx, wy, wz, ww, wh, wd], idx) => {
    addBox(worldGroup, ww, wh, wd, wx, wy, wz, parkourWallMat, {
      collide: true,
      mantleable: true,
      wallrunnable: true,
      id: `wallrun_board_${idx}`,
    });
  });

  // Charbagh Walkway Speed-Vault Hurdles (low wooden barriers for rhythmic Vault / Slide-Hop chains!)
  [
    [-8.2, 14.5],
    [8.2, 1.5],
    [-8.2, -26.5],
    [8.2, -36.5],
  ].forEach(([hx, hz], idx) => {
    addBox(worldGroup, 2.4, 0.92, 0.24, hx, 0.46, hz, woodMat, {
      collide: true,
      mantleable: true,
      id: `vault_hurdle_${idx}`,
    });
    addBox(worldGroup, 2.45, 0.14, 0.28, hx, 0.94, hz, hazardYellowMat, { castShadow: false });
    pushStaticGeo(smudgeGeo, parkourSmudgeMat, hx, 1.024, hz, 0, 0, 0, 2.1, 1, 0.85, false, false);
  });

  addBox(worldGroup, 0.35, 8.8, 0.35, 21.6, 4.4, 2.5, rustMat);
  addBox(worldGroup, 0.35, 8.8, 0.35, 21.6, 4.4, 5.5, rustMat);
  addBox(worldGroup, 3.6, 0.24, 3.4, 22.5, 5.5, 4.0, diamondPlateMat, { collide: true, mantleable: true });

  const pylonGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfb923c,
      emissive: 0xf97316,
      emissiveIntensity: 1.55,
      roughness: 0.25,
    }),
  );

  function addZipline(id: string, sx: number, sy: number, sz: number, ex: number, ey: number, ez: number) {
    const start = new THREE.Vector3(sx, sy, sz);
    const end = new THREE.Vector3(ex, ey, ez);
    ziplines.push({ id, start, end });

    [start, end].forEach((pt) => {
      // Sturdy dark steel pylon + glowing yellow/orange hazard housing & pulley beacon
      addBox(worldGroup, 0.28, 2.15, 0.28, pt.x, pt.y + 0.98, pt.z, darkMetalMat);
      addBox(worldGroup, 0.46, 0.34, 0.46, pt.x, pt.y + 2.02, pt.z, hazardYellowMat, { castShadow: false });
      addBox(worldGroup, 0.34, 0.2, 0.34, pt.x, pt.y + 2.28, pt.z, pylonGlowMat, { castShadow: false });
    });

    const p0 = new THREE.Vector3(start.x, start.y + 1.88, start.z);
    const p2 = new THREE.Vector3(end.x, end.y + 1.88, end.z);
    const mid = new THREE.Vector3().addVectors(p0, p2).multiplyScalar(0.5);
    mid.y -= 0.42; // Matches ZIPLINE_SAG parabolic cable dip
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const cableGeo = trackGeo(new THREE.TubeGeometry(curve, 14, 0.032, 5, false));
    const cable = new THREE.Mesh(cableGeo, cableMat);
    worldGroup.add(cable);
  }

  // 5 distinct rooftop zip-line cables connecting Agra bazaar rooftops toward the Taj Mahal avenue
  addZipline('zip_south_bazaar', -23.0, 4.0, 21.5, 23.0, 3.9, 22.5);
  addZipline('zip_pool_cross', -23.0, 5.8, 3.0, 22.2, 5.5, 4.0);
  addZipline('zip_mid_diagonal', -23.2, 5.8, -1.5, 23.2, 4.3, -16.5);
  addZipline('zip_east_to_taj', 25.0, 4.3, -22.5, 4.5, 1.0, -51.0);
  addZipline('zip_west_to_taj', -25.0, 4.4, -23.0, -4.5, 1.0, -51.0);

  // Blue Cushioned Parkour Landing Tarps below rooftop drops & Taj roof scaffolding
  [
    [-20.5, 22],
    [-26.8, 29.2],
    [-20.5, -19],
    [20.5, 23],
    [20.5, -18],
    [-16.5, -56.5],
    [16.5, -56.5],
  ].forEach(([tx, tz], idx) => {
    addBox(worldGroup, 3.4, 0.36, 3.4, tx, 0.18, tz, blueTarpMat, {
      collide: true,
      mantleable: true,
      cushion: true,
      id: `blue_tarp_${idx}`,
    });
  });

  // =========================================================================
  // 5B. AGRA BAZAAR SAFEHOUSE ROOFTOP SPAWN & DIRECT PARKOUR LAUNCH ROUTE
  // =========================================================================
  const shX = -27.5;
  const shZ = 41.5;
  const shW = 11.0;
  const shD = 9.6;
  const shH = 4.2;

  // Main Sandstone & Plastered Safehouse Building
  addBox(worldGroup, shW, shH, shD, shX, shH * 0.5, shZ, plasterAltMat, {
    collide: true,
    mantleable: true,
    wallrunnable: true,
    id: 'safehouse_rooftop',
  });
  // Rooftop Deck Trim & Parapet Walls (leave North ramp opening clear at x = -28.6..-24.6)
  addBox(worldGroup, shW + 0.3, 0.32, 0.32, shX, shH + 0.16, shZ + shD * 0.5, sandstoneMat); // South rim
  addBox(worldGroup, 0.32, 0.32, shD, shX - shW * 0.5, shH + 0.16, shZ, sandstoneMat); // West rim
  addBox(worldGroup, 0.32, 0.32, shD, shX + shW * 0.5, shH + 0.16, shZ, sandstoneMat); // East rim
  addBox(worldGroup, 4.2, 0.32, 0.32, -30.9, shH + 0.16, shZ - shD * 0.5, sandstoneMat); // North-West rim
  addBox(worldGroup, 2.6, 0.32, 0.32, -23.3, shH + 0.16, shZ - shD * 0.5, sandstoneMat); // North-East rim
  // Ground-floor wooden shuttered door & warm bazaar awning on East street side
  addBox(worldGroup, 0.2, 2.3, 2.2, shX + shW * 0.5 + 0.1, 1.15, shZ, rustMat);
  addBox(worldGroup, 1.6, 0.14, 4.8, shX + shW * 0.5 + 0.8, 2.55, shZ, woodMat, { rotZ: -0.18 });

  // Clear Intuitive Parkour Launch Route: Wooden Planked Catwalk + Upward Ramp -> Gap Jump to bldg_w1
  const rampCenterX = -26.6;
  const rampW = 3.2;
  const rampStartZ = 36.7;
  const rampEndZ = 31.2;
  const rampLowY = shH;
  const rampHighY = 4.85;
  const rampLen = rampStartZ - rampEndZ; // 5.5m
  const rampRise = rampHighY - rampLowY;
  const rampAngle = Math.atan2(rampRise, rampLen);
  const rampHypot = Math.hypot(rampLen, rampRise);
  const rampMidZ = (rampStartZ + rampEndZ) * 0.5;
  const rampMidY = (rampLowY + rampHighY) * 0.5;

  // Catwalk deck connecting spawn across north half of Safehouse roof onto ramp
  addBox(worldGroup, rampW, 0.12, 3.4, rampCenterX, shH + 0.04, 38.4, woodMat, {
    collide: true,
    mantleable: false,
    id: 'safehouse_catwalk',
  });
  // Sloped Launch Ramp Plank Deck + Timber Support Struts
  pushStaticGeo(
    unitBoxGeo,
    woodMat,
    rampCenterX,
    rampMidY - 0.06,
    rampMidZ,
    rampAngle,
    0,
    0,
    rampW,
    0.14,
    rampHypot,
    true,
    true,
  );
  [-rampW * 0.42, rampW * 0.42].forEach((ox) => {
    pushStaticGeo(unitBoxGeo, woodMat, rampCenterX + ox, rampHighY * 0.5, rampEndZ + 0.25, 0, 0, 0, 0.18, rampHighY, 0.18, true, true);
  });
  pushStaticGeo(unitBoxGeo, woodMat, rampCenterX, rampHighY - 0.35, rampEndZ + 0.25, 0, 0, 0, rampW * 0.9, 0.16, 0.16, false, true);

  // Sloped Ramp Collider (smooth transition off Safehouse Roof)
  colliders.push({
    id: 'safehouse_launch_ramp',
    minX: rampCenterX - rampW * 0.5,
    maxX: rampCenterX + rampW * 0.5,
    minY: 3.6,
    maxY: rampHighY + 0.08,
    minZ: rampEndZ,
    maxZ: rampStartZ,
    mantleable: true,
    blocksZombies: false,
    ramp: {
      axis: 'z',
      lowCoord: rampStartZ,
      highCoord: rampEndZ,
      lowY: rampLowY,
      highY: rampHighY,
    },
  });

  // Painted Yellow/Orange Parkour Chevron Guide Stripes (`>>>`) on Launch Lip & Neighboring Landing Apron
  const chevronGuideMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.parkourChevronGuide,
      color: 0xffffff,
      emissive: 0xd97706,
      emissiveIntensity: 0.42,
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const chevronPlaneGeo = trackGeo(new THREE.PlaneGeometry(2.6, 1.15));
  chevronPlaneGeo.rotateX(-Math.PI / 2);

  // Launch chevron stripe right at north end of ramp
  pushStaticGeo(
    chevronPlaneGeo,
    chevronGuideMat,
    rampCenterX,
    rampHighY + 0.025,
    rampEndZ + 0.62,
    rampAngle,
    0,
    0,
    1,
    1,
    1,
    false,
    false,
  );
  // Wooden landing bridge lip on south edge of bldg_w1 (covers visual parapet rim seamlessly)
  addBox(worldGroup, 3.6, 0.18, 2.2, -26.4, 4.12, 26.8, woodMat, {
    collide: true,
    mantleable: true,
    id: 'bldg_w1_landing_apron',
  });
  pushStaticGeo(chevronPlaneGeo, chevronGuideMat, -26.4, 4.23, 26.7, 0, 0, 0, 1, 1, 1, false, false);

  // Corner Portable UV Safe-Zone Floodlight Pole behind/beside player spawn (-31.8, 4.2, 44.8)
  const uvPoleX = -31.8;
  const uvPoleZ = 44.8;
  pushStaticGeo(unitBoxGeo, darkMetalMat, uvPoleX, shH + 0.25, uvPoleZ, 0, 0, 0, 0.72, 0.5, 0.56, true, true);
  pushStaticGeo(unitBoxGeo, rustMat, uvPoleX, shH + 1.45, uvPoleZ, 0, 0, 0, 0.1, 2.9, 0.1, true, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, uvPoleX, shH + 2.85, uvPoleZ, 0.35, 0.65, 0, 0.95, 0.28, 0.22, false, true);
  const safeZoneUvTube = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8)), uvTubeMat);
  safeZoneUvTube.rotation.set(0.35, 0.65, Math.PI / 2);
  safeZoneUvTube.position.set(uvPoleX + 0.08, shH + 2.78, uvPoleZ - 0.08);
  worldGroup.add(safeZoneUvTube);
  uvGlowMeshes.push(safeZoneUvTube);

  const safehouseUvLight = new THREE.PointLight(0x8b5cf6, 11, 18, 1.5);
  safehouseUvLight.castShadow = false;
  safehouseUvLight.position.set(uvPoleX + 0.4, shH + 2.55, uvPoleZ - 0.4);
  worldGroup.add(safehouseUvLight);
  // Insert before domeUvLight (last element) so TimeOfDayLightingSystem keeps dome boost intact
  uvLights.unshift(safehouseUvLight);

  // Stacked Wooden Supply Crates on Safehouse Rooftop Edges
  addBox(worldGroup, 1.15, 0.95, 1.15, -31.7, shH + 0.475, 41.2, woodMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.85, 0.72, 0.85, -31.6, shH + 1.31, 41.35, woodMat, { collide: true, mantleable: true, rotY: 0.28 });
  addBox(worldGroup, 1.1, 0.82, 0.95, -23.1, shH + 0.41, 43.9, woodMat, { collide: true, mantleable: true, rotY: -0.2 });

  // Rusted Satellite Dish & Radio Antenna Mast on East Corner (-23.0, 4.2, 38.4)
  const satX = -23.0;
  const satZ = 38.4;
  pushStaticGeo(unitBoxGeo, rustMat, satX, shH + 0.55, satZ, 0, 0, 0, 0.14, 1.1, 0.14, true, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, satX + 0.35, shH + 1.45, satZ + 0.25, 0, 0, 0, 0.05, 2.9, 0.05, false, false);
  const dishPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.32, 0.08),
    new THREE.Vector2(0.62, 0.24),
    new THREE.Vector2(0.76, 0.44),
  ];
  const dishGeo = trackGeo(new THREE.LatheGeometry(dishPts, 14));
  pushStaticGeo(dishGeo, rustMat, satX, shH + 1.18, satZ, 0.85, 0.4, 0, 1, 1, 1, true, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, satX - 0.18, shH + 1.42, satZ - 0.32, 0.85, 0.4, 0, 0.06, 0.65, 0.06, false, false);

  // Colorful Indian Bazaar Fabric Awnings & Fluttering Bunting Line across Safehouse Rooftop
  const buntingMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarBunting,
      color: 0xffffff,
      roughness: 0.82,
      side: THREE.DoubleSide,
    }),
  );
  // Side pergola awning framing West edge without blocking center vista
  pushStaticGeo(unitBoxGeo, woodMat, -32.2, shH + 1.35, 38.5, 0, 0, 0, 0.12, 2.7, 0.12, true, true);
  pushStaticGeo(unitBoxGeo, woodMat, -32.2, shH + 1.35, 42.4, 0, 0, 0, 0.12, 2.7, 0.12, true, true);
  pushStaticGeo(unitBoxGeo, woodMat, -29.8, shH + 1.35, 44.6, 0, 0, 0, 0.12, 2.7, 0.12, true, true);
  pushStaticGeo(unitBoxGeo, woodMat, -23.1, shH + 1.35, 41.2, 0, 0, 0, 0.12, 2.7, 0.12, true, true);
  pushStaticGeo(unitBoxGeo, buntingMat, -31.1, shH + 2.45, 40.4, 0, 0.12, -0.24, 2.4, 0.06, 4.2, true, true);

  // Overhead string line + dynamically fluttering cloth pennants in the evening breeze
  const buntingStart = new THREE.Vector3(-32.2, shH + 2.65, 38.5);
  const buntingEnd = new THREE.Vector3(-23.1, shH + 2.65, 41.2);
  const buntingSpan = buntingStart.distanceTo(buntingEnd);
  const buntingYaw = Math.atan2(buntingEnd.x - buntingStart.x, buntingEnd.z - buntingStart.z);
  const buntingMid = new THREE.Vector3().addVectors(buntingStart, buntingEnd).multiplyScalar(0.5);
  pushStaticGeo(
    unitBoxGeo,
    ropeMat,
    buntingMid.x,
    buntingMid.y,
    buntingMid.z,
    0,
    buntingYaw,
    0,
    0.03,
    0.03,
    buntingSpan,
    false,
    false,
  );

  const pennantColors = [0xf97316, 0xeab308, 0xec4899, 0x06b6d4, 0xef4444, 0x22c55e];
  const pennantGeo = trackGeo(new THREE.ConeGeometry(0.18, 0.36, 3));
  pennantGeo.rotateX(Math.PI);
  pennantGeo.translate(0, -0.18, 0);
  const flutteringPennants: Array<{ mesh: THREE.Mesh; phase: number; baseRotZ: number }> = [];
  for (let p = 0; p < 11; p++) {
    const u = (p + 0.5) / 11;
    const sag = Math.sin(u * Math.PI) * 0.24;
    const pMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pennantColors[p % pennantColors.length],
        roughness: 0.78,
        side: THREE.DoubleSide,
      }),
    );
    const pennant = new THREE.Mesh(pennantGeo, pMat);
    pennant.position.lerpVectors(buntingStart, buntingEnd, u);
    pennant.position.y -= sag;
    pennant.rotation.y = buntingYaw + Math.PI * 0.5;
    worldGroup.add(pennant);
    flutteringPennants.push({ mesh: pennant, phase: p * 0.72, baseRotZ: 0.08 });
  }

  // Instanced Overgrown Rooftop Grass Tufts (Layer 1)
  if (roofGrassPositions.length > 0) {
    const grassGeo = trackGeo(new THREE.ConeGeometry(0.16, 0.55, 5));
    grassGeo.translate(0, 0.275, 0);
    const grassMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xa17c3a,
        roughness: 0.9,
        flatShading: true,
      }),
    );
    const instGrass = new THREE.InstancedMesh(grassGeo, grassMat, roofGrassPositions.length);
    instGrass.layers.set(1);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    roofGrassPositions.forEach((pos, idx) => {
      dummy.position.copy(pos);
      dummy.rotation.y = (idx * 1.7) % (Math.PI * 2);
      const s = 0.8 + ((idx * 13) % 7) * 0.1;
      dummy.scale.set(s, s * (0.9 + (idx % 3) * 0.2), s);
      dummy.updateMatrix();
      instGrass.setMatrixAt(idx, dummy.matrix);

      tint.setHSL(0.11 + (idx % 5) * 0.012, 0.45, 0.36 + (idx % 4) * 0.04);
      instGrass.setColorAt(idx, tint);
    });
    instGrass.instanceMatrix.needsUpdate = true;
    if (instGrass.instanceColor) instGrass.instanceColor.needsUpdate = true;
    instGrass.computeBoundingSphere();
    worldGroup.add(instGrass);
  }

  // =========================================================================
  // 6. GUARDED MARKET ALLEY, CHAIN-LINK FENCES, STALLS & 12-PART AUTO-RICKSHAWS
  // =========================================================================
  addBox(worldGroup, 1.2, 3.4, 16, 43.5, 1.7, 6, sandstoneMat, { collide: true, mantleable: true });
  addBox(worldGroup, 14, 3.4, 1.2, 37, 1.7, -2, sandstoneMat, { collide: true, mantleable: true });
  addBox(worldGroup, 8, 3.4, 1.2, 39.5, 1.7, 14, sandstoneMat, { collide: true, mantleable: true });

  // Weathered Wooden Barricades along Outer Garden Paths
  const barricadeSpecs: Array<[number, number, number]> = [
    [-14.6, 2.5, 0.15],
    [14.6, 19.5, -0.18],
    [-14.2, -35.0, 0.25],
    [14.2, -21.0, -0.22],
  ];
  barricadeSpecs.forEach(([bx, bz, rotY], idx) => {
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    const placeBar = (w: number, h: number, d: number, lx: number, ly: number, lz: number, rz = 0) => {
      pushStaticGeo(
        unitBoxGeo,
        woodMat,
        bx + lx * cosR + lz * sinR,
        ly,
        bz - lx * sinR + lz * cosR,
        0,
        rotY,
        rz,
        w,
        h,
        d,
        true,
        true,
      );
    };
    placeBar(0.16, 1.15, 0.2, -1.25, 0.575, 0);
    placeBar(0.16, 1.15, 0.2, 1.25, 0.575, 0);
    placeBar(3.2, 0.18, 0.14, 0, 0.36, 0);
    placeBar(3.2, 0.18, 0.14, 0, 0.72, 0);
    placeBar(3.2, 0.18, 0.14, 0, 1.04, 0);
    placeBar(2.6, 0.14, 0.12, 0, 0.65, 0.08, 0.38);
    pushStaticGeo(smudgeGeo, parkourSmudgeMat, bx, 1.145, bz, 0, rotY, 0, 2.6, 1, 0.7, false, false);

    colliders.push({
      id: `wood_barricade_${idx}`,
      minX: bx - 1.6,
      maxX: bx + 1.6,
      minY: 0,
      maxY: 1.15,
      minZ: bz - 0.35,
      maxZ: bz + 0.35,
      mantleable: true,
      blocksZombies: true,
    });
  });

  // Chain-Link Quarantine Fences
  const fenceLines: Array<[number, number, number, number]> = [
    [-14.5, 34, 10, 0],
    [14.5, 34, 10, 0],
    [-14.5, -45, 9, Math.PI / 2],
    [14.5, -45, 9, Math.PI / 2],
  ];
  const fencePostGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6));
  const fenceRailGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 1, 6));
  const fencePanelGeo = trackGeo(new THREE.PlaneGeometry(1, 2.3));
  fenceLines.forEach(([fx, fz, len, rotY], idx) => {
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    pushStaticGeo(fencePanelGeo, chainLinkMat, fx, 1.15, fz, 0, rotY, 0, len, 1, 1, false, false);
    pushStaticGeo(fenceRailGeo, darkMetalMat, fx, 2.3, fz, 0, rotY, Math.PI / 2, 1, len, 1, false, true);
    [-len / 2, 0, len / 2].forEach((lx) => {
      pushStaticGeo(fencePostGeo, darkMetalMat, fx + lx * cosR, 1.2, fz - lx * sinR, 0, 0, 0, 1, 1, 1, false, true);
    });

    const isRotated = Math.abs(rotY) > 0.5;
    colliders.push({
      id: `fence_${idx}`,
      minX: fx - (isRotated ? 0.3 : len / 2),
      maxX: fx + (isRotated ? 0.3 : len / 2),
      minY: 0,
      maxY: 2.3,
      minZ: fz - (isRotated ? len / 2 : 0.3),
      maxZ: fz + (isRotated ? len / 2 : 0.3),
      mantleable: true,
      blocksZombies: true,
    });
  });

  // Abandoned Bazaar Stalls
  const canopyColors = [0xd97706, 0x0f766e, 0x991b1b, 0xb45309, 0x1d4ed8];
  const stallPositions: [number, number, number][] = [
    [-16.5, 17, 0],
    [-16.5, -5, 0],
    [16.5, 15, Math.PI],
    [16.5, -6, Math.PI],
    [35.5, 11, -Math.PI / 2],
  ];
  stallPositions.forEach(([sx, sz, rot], idx) => {
    const canopyMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: canopyColors[idx % canopyColors.length],
        roughness: 0.92,
        metalness: 0.0,
      }),
    );
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const placeStall = (w: number, h: number, d: number, mat: THREE.Material, lx: number, ly: number, lz: number, rx = 0) => {
      pushStaticGeo(
        unitBoxGeo,
        mat,
        sx + lx * cosR + lz * sinR,
        ly,
        sz - lx * sinR + lz * cosR,
        rx,
        rot,
        0,
        w,
        h,
        d,
        true,
        true,
      );
    };
    [
      [-1.8, -1.2],
      [1.8, -1.2],
      [-1.8, 1.2],
      [1.8, 1.2],
    ].forEach(([px, pz]) => placeStall(0.16, 2.5, 0.16, woodMat, px, 1.25, pz));
    placeStall(4.2, 0.14, 3.0, canopyMat, 0, 2.55, 0, 0.12);
    placeStall(3.6, 0.95, 1.1, woodMat, 0, 0.475, 0.5);

    colliders.push({
      id: `stall_${idx}`,
      minX: sx - 2.0,
      maxX: sx + 2.0,
      minY: 0,
      maxY: 2.6,
      minZ: sz - 1.6,
      maxZ: sz + 1.6,
      mantleable: true,
      blocksZombies: true,
    });
  });

  // =========================================================================
  // AUTHENTIC INDIAN AUTO-RICKSHAW (TUK-TUK) MODELS (Batched by material!)
  // =========================================================================
  const tukYellowMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.25 }));
  const tukGreenMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.48, metalness: 0.22 }));
  const tukCanopyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85, metalness: 0.05 }));
  const tukVinylRedMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.72, metalness: 0.05 }));
  const chromeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.92 }));
  const tireMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9, metalness: 0.05 }));

  const cowlShape = new THREE.Shape();
  cowlShape.moveTo(-0.55, 0);
  cowlShape.lineTo(0.55, 0);
  cowlShape.lineTo(0.45, 0.92);
  cowlShape.lineTo(0.28, 1.08);
  cowlShape.lineTo(-0.28, 1.08);
  cowlShape.lineTo(-0.45, 0.92);
  cowlShape.closePath();
  const frontCowlGeo = trackGeo(
    new THREE.ExtrudeGeometry(cowlShape, {
      depth: 0.46,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    }),
  );
  frontCowlGeo.center();

  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12));
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 8));
  const fenderGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.36, 10, 1, false, 0, Math.PI));
  const bezelGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10));

  const rickshawSpecs: [number, number, number, number][] = [
    [-15.2, 22.5, 0.42, 0.07],
    [15.4, 3.2, -0.68, -0.08],
    [-15.4, -22.5, 1.15, 0.05],
    [15.2, -30.5, -0.45, -0.05],
    [-49.5, -13.5, 0.12, 0.0],
    [-50.2, 16.5, -0.25, 0.0],
  ];

  const _tukM4 = new THREE.Matrix4();
  const _partM4 = new THREE.Matrix4();
  const _tukQ = new THREE.Quaternion();
  const _partQ = new THREE.Quaternion();
  const _partE = new THREE.Euler();
  const _partV = new THREE.Vector3();
  const _partS = new THREE.Vector3();

  rickshawSpecs.forEach(([rx, rz, rotY, tiltZ], idx) => {
    _partE.set(0, rotY, tiltZ);
    _tukQ.setFromEuler(_partE);
    _tukM4.compose(_partV.set(rx, 0, rz), _tukQ, _partS.set(1, 1, 1));

    const pushTuk = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      lx: number,
      ly: number,
      lz: number,
      rxL = 0,
      ryL = 0,
      rzL = 0,
      sx = 1,
      sy = 1,
      sz = 1,
    ) => {
      _partE.set(rxL, ryL, rzL);
      _partQ.setFromEuler(_partE);
      _partM4.compose(_partV.set(lx, ly, lz), _partQ, _partS.set(sx, sy, sz));
      _partM4.premultiply(_tukM4);
      _partM4.decompose(_partV, _partQ, _partS);
      _partE.setFromQuaternion(_partQ);
      pushStaticGeo(geo, mat, _partV.x, _partV.y, _partV.z, _partE.x, _partE.y, _partE.z, _partS.x, _partS.y, _partS.z, true, true);
    };

    pushTuk(unitBoxGeo, darkMetalMat, 0, 0.28, -0.05, 0, 0, 0, 1.42, 0.14, 2.55);
    pushTuk(unitBoxGeo, tukGreenMat, 0, 0.68, -0.58, 0, 0, 0, 1.48, 0.72, 1.45);
    pushTuk(unitBoxGeo, darkMetalMat, 0, 0.62, -1.32, 0, 0, 0, 1.3, 0.52, 0.14);
    pushTuk(frontCowlGeo, tukYellowMat, 0, 0.84, 0.96, -0.18, 0, 0);
    pushTuk(fenderGeo, tukYellowMat, 0, 0.38, 1.12, 0, 0, Math.PI / 2);
    [-0.36, 0.36].forEach((hx) => pushTuk(bezelGeo, chromeMat, hx, 0.78, 1.23, Math.PI / 2, 0, 0));
    pushTuk(unitBoxGeo, darkMetalMat, 0, 1.54, 0.82, -0.22, 0, 0, 1.16, 0.62, 0.06);
    pushTuk(unitBoxGeo, chromeMat, 0, 1.16, 0.53, 0, 0, Math.PI / 2, 0.05, 0.68, 0.05);
    pushTuk(unitBoxGeo, tukVinylRedMat, 0, 0.66, 0.15, 0, 0, 0, 0.45, 0.18, 0.42);
    pushTuk(unitBoxGeo, tukVinylRedMat, 0, 0.72, -0.78, 0, 0, 0, 1.3, 0.22, 0.55);
    pushTuk(unitBoxGeo, tukVinylRedMat, 0, 1.05, -1.04, 0, 0, 0, 1.3, 0.55, 0.16);
    pushTuk(unitBoxGeo, tukCanopyMat, 0, 1.92, -0.22, 0, 0, 0, 1.5, 0.16, 2.08);
    pushTuk(unitBoxGeo, tukYellowMat, 0, 1.88, 0.88, 0.25, 0, 0, 1.34, 0.12, 0.34);
    [-0.74, 0.74].forEach((sx) => pushTuk(unitBoxGeo, tukCanopyMat, sx, 1.44, -0.72, 0, 0, 0, 0.06, 0.95, 1.1));
    [
      [0, 0.28, 1.1],
      [-0.72, 0.28, -0.82],
      [0.72, 0.28, -0.82],
    ].forEach(([wx, wy, wz]) => {
      pushTuk(tireGeo, tireMat, wx, wy, wz, 0, 0, Math.PI / 2);
      pushTuk(hubGeo, tukYellowMat, wx, wy, wz, 0, 0, Math.PI / 2);
    });
    pushTuk(tireGeo, tireMat, 0, 0.74, -1.4, Math.PI / 2, 0, 0);

    colliders.push({
      id: `rickshaw_${idx}`,
      minX: rx - 1.15,
      maxX: rx + 1.15,
      minY: 0,
      maxY: 1.98,
      minZ: rz - 1.35,
      maxZ: rz + 1.35,
      mantleable: true,
      blocksZombies: true,
    });
  });

  // =========================================================================
  // 7. OVERGROWN BANYAN TREES, SILHOUETTED PALM TREES & PERIMETER WALLS
  // =========================================================================
  const treeCoords: [number, number, number][] = [
    [-16.5, -45, 1.3],
    [16.5, -45, 1.2],
    [-19, -14, 1.1],
    [19, 28, 1.15],
    [-38, 12, 1.3],
    [-38, -28, 1.25],
    [44, -22, 1.3],
    [53.5, 16.5, 1.15],
  ];
  const banyanTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.45, 3.6, 7));
  const banyanCrownGeo = trackGeo(new THREE.DodecahedronGeometry(1.9, 0));
  treeCoords.forEach(([tx, tz, scale], idx) => {
    pushStaticGeo(banyanTrunkGeo, trunkMat, tx, 1.8 * scale, tz, 0, 0, 0, scale, scale, scale, true, true);
    pushStaticGeo(banyanCrownGeo, foliageMat, tx, 4.1 * scale, tz, 0, idx * 0.5, 0, scale, scale, scale, true, true);
    pushStaticGeo(banyanCrownGeo, foliageMat, tx + 1.1 * scale, 3.5 * scale, tz + 0.5 * scale, 0, 0.4, 0, 0.74 * scale, 0.74 * scale, 0.74 * scale, false, true);
    pushStaticGeo(banyanCrownGeo, foliageMat, tx - 1.0 * scale, 3.6 * scale, tz - 0.4 * scale, 0, 1.1, 0, 0.71 * scale, 0.71 * scale, 0.71 * scale, false, true);

    colliders.push({
      id: `tree_${idx}`,
      minX: tx - 0.6 * scale,
      maxX: tx + 0.6 * scale,
      minY: 0,
      maxY: 4.5 * scale,
      minZ: tz - 0.6 * scale,
      maxZ: tz + 0.6 * scale,
      mantleable: false,
      blocksZombies: true,
    });
  });

  // Silhouetted Palm Trees framing horizon
  const palmTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.34, 8.8, 6));
  const frondGeo = trackGeo(new THREE.BoxGeometry(0.55, 0.06, 3.2));
  frondGeo.translate(0, 0, 1.5);
  [
    [-39, 44],
    [21.5, 43.5],
    [-42, -55],
    [42, -55],
  ].forEach(([px, pz], idx) => {
    pushStaticGeo(palmTrunkGeo, trunkMat, px, 4.4, pz, 0, idx * 1.1, 0.08, 1, 1, 1, false, true);
    for (let f = 0; f < 6; f++) {
      pushStaticGeo(frondGeo, palmFrondMat, px - 0.35, 8.7, pz, 0.38, (f / 6) * Math.PI * 2 + idx * 1.1, 0, 1, 1, 1, false, false);
    }
  });

  // Outer Quarantine Perimeter Walls (expanded east for Agra Haveli & west for Agra Cantt Railway Station)
  addBox(worldGroup, 168, 4.5, 2.0, -25, 2.25, 52, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  // Open Forecourt Gateway along x = -46 leaving z = -26..+26 wide open into Station Forecourt!
  addBox(worldGroup, 2.0, 4.5, 52, -46, 2.25, -52, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 2.0, 4.5, 26, -46, 2.25, 39, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  // Outer West Railway Yard Boundary Wall at x = -108
  addBox(worldGroup, 2.0, 4.5, 152, -108, 2.25, -24, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 2.0, 4.5, 152, 58, 2.25, -20, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 168, 4.5, 2.0, -25, 2.25, -99, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });

  // =========================================================================
  // 7B. TAJ UV GATE WATCHTOWER, SANDBAGS, CLIMBABLE LADDER & HAVILDAR VIKRAM
  // =========================================================================
  const wtX = 11.8;
  const wtZ = -47.4;
  const wtDeckY = 4.1;
  const wtHalf = 1.48;
  const wtRoofY = 6.55;

  const sandbagMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b7153,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const sandbagGeo = trackGeo(new THREE.CapsuleGeometry(0.15, 0.34, 4, 8));
  sandbagGeo.computeVertexNormals();

  // Concrete corner footings & 4 heavy steel tower legs
  [
    [-wtHalf, -wtHalf],
    [wtHalf, -wtHalf],
    [-wtHalf, wtHalf],
    [wtHalf, wtHalf],
  ].forEach(([ox, oz], idx) => {
    pushStaticGeo(unitBoxGeo, sandstoneMat, wtX + ox, 0.14, wtZ + oz, 0, 0, 0, 0.48, 0.28, 0.48, false, true);
    pushStaticGeo(unitBoxGeo, darkMetalMat, wtX + ox, wtRoofY * 0.5, wtZ + oz, 0, 0, 0, 0.22, wtRoofY, 0.22, true, true);
    colliders.push({
      id: `watchtower_leg_${idx}`,
      minX: wtX + ox - 0.18,
      maxX: wtX + ox + 0.18,
      minY: 0,
      maxY: wtDeckY,
      minZ: wtZ + oz - 0.18,
      maxZ: wtZ + oz + 0.18,
      mantleable: false,
      blocksZombies: true,
    });
  });

  // Diagonal steel cross-bracing on North, East, and South sides (West face stays open for ladder!)
  const braceLen = Math.hypot(wtHalf * 2, wtDeckY - 0.2);
  const braceTilt = Math.atan2(wtHalf * 2, wtDeckY - 0.2);
  // North & South X-braces
  [-wtHalf, wtHalf].forEach((oz) => {
    pushStaticGeo(unitBoxGeo, darkMetalMat, wtX, wtDeckY * 0.5, wtZ + oz, 0, 0, braceTilt, 0.08, braceLen, 0.08, false, true);
    pushStaticGeo(unitBoxGeo, darkMetalMat, wtX, wtDeckY * 0.5, wtZ + oz, 0, 0, -braceTilt, 0.08, braceLen, 0.08, false, true);
    pushStaticGeo(unitBoxGeo, darkMetalMat, wtX, 2.05, wtZ + oz, 0, 0, 0, wtHalf * 2, 0.1, 0.1, false, true);
  });
  // East X-brace & mid-girder
  pushStaticGeo(unitBoxGeo, darkMetalMat, wtX + wtHalf, wtDeckY * 0.5, wtZ, braceTilt, 0, 0, 0.08, braceLen, 0.08, false, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, wtX + wtHalf, wtDeckY * 0.5, wtZ, -braceTilt, 0, 0, 0.08, braceLen, 0.08, false, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, wtX + wtHalf, 2.05, wtZ, 0, 0, 0, 0.1, 0.1, wtHalf * 2, false, true);

  // Timber Platform Deck (walkable at y = 4.22)
  addBox(worldGroup, 3.4, 0.24, 3.4, wtX, wtDeckY, wtZ, woodMat, {
    collide: true,
    mantleable: true,
    id: 'watchtower_deck',
  });

  // Timber & Steel Parapet Waist Walls (leave ladder gap on West-South edge z = wtZ + 0.2..1.1)
  pushStaticGeo(unitBoxGeo, woodMat, wtX, wtDeckY + 0.54, wtZ - 1.56, 0, 0, 0, 3.2, 0.88, 0.14, true, true); // North
  pushStaticGeo(unitBoxGeo, woodMat, wtX + 1.56, wtDeckY + 0.54, wtZ, 0, 0, 0, 0.14, 0.88, 3.2, true, true); // East
  pushStaticGeo(unitBoxGeo, woodMat, wtX, wtDeckY + 0.54, wtZ + 1.56, 0, 0, 0, 3.2, 0.88, 0.14, true, true); // South
  pushStaticGeo(unitBoxGeo, woodMat, wtX - 1.56, wtDeckY + 0.54, wtZ - 0.72, 0, 0, 0, 0.14, 0.88, 1.65, true, true); // West-North

  // Stacked Sandbags around Watchtower Base (South & North-West defensive skirt) & Upper Parapet
  for (let row = 0; row < 2; row++) {
    const bagY = 0.14 + row * 0.22;
    const shift = row * 0.24;
    for (let i = 0; i < 5; i++) {
      const sx = wtX - 1.2 + i * 0.58 + (row === 1 ? -0.15 : 0);
      pushStaticGeo(sandbagGeo, sandbagMat, sx, bagY, wtZ + 1.68, 0, 0, Math.PI / 2, 0.75, 1.0, 1.05, true, true);
    }
    for (let i = 0; i < 3; i++) {
      const sz = wtZ - 1.25 + i * 0.56 + shift * 0.5;
      pushStaticGeo(sandbagGeo, sandbagMat, wtX - 1.68, bagY, sz, Math.PI / 2, 0, 0, 1.05, 1.0, 0.75, true, true);
    }
  }
  // Upper parapet sandbag courses (South & West-North facing courtyard)
  for (let row = 0; row < 2; row++) {
    const pBagY = wtDeckY + 1.02 + row * 0.2;
    for (let i = 0; i < 5; i++) {
      const sx = wtX - 1.15 + i * 0.56 + row * 0.12;
      pushStaticGeo(sandbagGeo, sandbagMat, sx, pBagY, wtZ + 1.56, 0, 0, Math.PI / 2, 0.72, 0.95, 1.0, false, true);
    }
    for (let i = 0; i < 3; i++) {
      const sz = wtZ - 1.25 + i * 0.54;
      pushStaticGeo(sandbagGeo, sandbagMat, wtX - 1.56, pBagY, sz, Math.PI / 2, 0, 0, 1.0, 0.95, 0.72, false, true);
    }
  }

  // Corrugated Metal Canopy Roof & Steel Eaves + Military Radio Antenna Mast
  pushStaticGeo(unitBoxGeo, rustMat, wtX, wtRoofY + 0.08, wtZ, -0.07, 0, 0, 3.75, 0.12, 3.75, true, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, wtX + 1.48, wtRoofY + 1.1, wtZ - 1.48, 0, 0, 0, 0.06, 2.2, 0.06, false, false);
  const radioBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
  );
  pushStaticGeo(
    trackGeo(new THREE.SphereGeometry(0.11, 8, 6)),
    radioBeaconMat,
    wtX + 1.48,
    wtRoofY + 2.24,
    wtZ - 1.48,
    0,
    0,
    0,
    1,
    1,
    1,
    false,
    false,
  );

  // Field Radio Transceiver Box on South-West Parapet Shelf
  pushStaticGeo(unitBoxGeo, darkMetalMat, wtX - 0.92, wtDeckY + 1.14, wtZ + 1.38, 0, 0.25, 0, 0.44, 0.26, 0.28, false, true);
  pushStaticGeo(unitBoxGeo, crateAccentMatSafe(), wtX - 0.94, wtDeckY + 1.16, wtZ + 1.23, 0, 0.25, 0, 0.16, 0.07, 0.02, false, false);
  function crateAccentMatSafe(): THREE.Material {
    return trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x10b981,
        emissiveIntensity: 1.8,
        roughness: 0.3,
      }),
    );
  }

  // Watchtower Floodlight Housings + Courtyard SpotLight
  [wtZ + 1.58, wtZ - 1.58].forEach((fz) => {
    pushStaticGeo(unitBoxGeo, darkMetalMat, wtX - 1.58, wtRoofY - 0.18, fz, 0.32, -0.45, 0, 0.54, 0.34, 0.38, false, false);
    pushStaticGeo(floodBulbGeo, floodBulbMat, wtX - 1.72, wtRoofY - 0.23, fz + 0.12, 0.32, -Math.PI / 2 - 0.45, 0, 0.65, 0.65, 1, false, false);
  });
  const towerFloodSpot = new THREE.SpotLight(0xfff1d6, 7.5, 36, Math.PI / 3.4, 0.6, 1.5);
  towerFloodSpot.castShadow = false;
  towerFloodSpot.position.set(wtX - 1.6, wtRoofY - 0.25, wtZ + 1.4);
  towerFloodSpot.target.position.set(2.5, 0, -34);
  worldGroup.add(towerFloodSpot);
  worldGroup.add(towerFloodSpot.target);
  floodLights.push(towerFloodSpot);

  // Climbable Steel Ladder on West Face facing the East Sandstone Walkway
  const ladX = wtX - 1.78;
  const ladZ = wtZ + 0.65;
  const ladHeight = wtDeckY + 0.28;
  const ladRailGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.036, ladHeight, 6));
  const ladRungGeo = trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.58, 6));
  pushStaticGeo(ladRailGeo, darkMetalMat, ladX, ladHeight * 0.5, ladZ - 0.29, 0, 0, 0, 1, 1, 1, true, true);
  pushStaticGeo(ladRailGeo, darkMetalMat, ladX, ladHeight * 0.5, ladZ + 0.29, 0, 0, 0, 1, 1, 1, true, true);
  for (let r = 0; r < 12; r++) {
    const ry = 0.32 + r * 0.355;
    pushStaticGeo(ladRungGeo, darkMetalMat, ladX, ry, ladZ, Math.PI / 2, 0, 0, 1, 1, 1, false, true);
  }
  pushStaticGeo(smudgeGeoZ, parkourSmudgeMat, wtX - 1.52, wtDeckY + 0.135, ladZ, 0, 0, 0, 1, 1, 0.85, false, false);
  ladders.push({
    id: 'watchtower_ladder',
    minX: ladX - 0.72,
    maxX: ladX + 0.62,
    minY: 0,
    maxY: wtDeckY + 0.32,
    minZ: ladZ - 0.55,
    maxZ: ladZ + 0.55,
    exitX: wtX - 1.05,
    exitY: wtDeckY + 0.14,
    exitZ: ladZ,
  });

  // =========================================================================
  // 6B. EXPLORABLE 2-STORY AGRA HAVELI & TAJ GANJ TERRACED HOUSES
  // =========================================================================
  const haveliWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe6dcc8,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  const haveliMintTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x94c9ab,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  const haveliFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.polishedCreamTile,
      color: 0xf6f0e4,
      roughness: 0.16,
      metalness: 0.08,
    }),
  );
  const haveliDoorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.haveliDoorWood,
      color: 0xffffff,
      roughness: 0.44,
      metalness: 0.06,
    }),
  );
  const haveliWindowMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.blueMullionWindow,
      color: 0xdff6ff,
      emissive: 0x3b82a6,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.15,
    }),
  );
  const haveliWoodDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.woodPlank,
      bumpMap: textures.woodBump,
      bumpScale: 0.024,
      color: 0x472d1c,
      roughness: 0.58,
      metalness: 0.06,
    }),
  );
  const haveliBookshelfMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.64,
      metalness: 0.08,
    }),
  );
  const haveliOchreMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      bumpMap: textures.bazaarWallBump,
      bumpScale: 0.026,
      roughnessMap: textures.bazaarWallRoughness,
      color: 0xd98a3c,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  const haveliPeachMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      bumpMap: textures.bazaarWallBump,
      bumpScale: 0.026,
      roughnessMap: textures.bazaarWallRoughness,
      color: 0xd69b86,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  const haveliTerracottaMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      bumpMap: textures.sandstoneBump,
      bumpScale: 0.032,
      roughnessMap: textures.sandstoneRoughness,
      color: 0x9e5a47,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  const haveliSconceGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff3d1,
      emissive: 0xfbbf24,
      emissiveIntensity: 2.2,
      roughness: 0.25,
    }),
  );
  const haveliWaterTankMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.48,
      metalness: 0.1,
    }),
  );

  // Interactive Doors Registry
  interface InteractiveDoorPivot {
    group: THREE.Group;
    closedY: number;
    openY: number;
  }
  interface InteractiveDoorObj {
    id: string;
    label: string;
    pivots: InteractiveDoorPivot[];
    collider: BoxCollider;
    centerPos: THREE.Vector3;
    open: boolean;
    currentProgress: number;
  }
  const interactiveDoors: InteractiveDoorObj[] = [];

  const registerInteractiveDoor = (opts: {
    id: string;
    label: string;
    x: number;
    yBase: number;
    z: number;
    width: number;
    height: number;
    axis: 'z' | 'x'; // 'z' means wall runs along Z (door spans Z, faces X); 'x' means wall runs along X (door spans X, faces Z)
    doubleLeaf?: boolean;
    openSign?: 1 | -1;
  }): void => {
    const { id, label, x, yBase, z, width, height, axis, doubleLeaf = false, openSign = 1 } = opts;
    const thick = 0.09;
    const frameThick = 0.12;

    // Dark timber door surround frame
    if (axis === 'z') {
      pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, x, yBase + height * 0.5, z - width * 0.5 - 0.05, 0, 0, 0, 0.42, height, frameThick, true, true);
      pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, x, yBase + height * 0.5, z + width * 0.5 + 0.05, 0, 0, 0, 0.42, height, frameThick, true, true);
      pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, x, yBase + height + 0.06, z, 0, 0, 0, 0.44, frameThick, width + 0.22, true, true);
    } else {
      pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, x - width * 0.5 - 0.05, yBase + height * 0.5, z, 0, 0, 0, frameThick, height, 0.42, true, true);
      pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, x + width * 0.5 + 0.05, yBase + height * 0.5, z, 0, 0, 0, frameThick, height, 0.42, true, true);
      pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, x, yBase + height + 0.06, z, 0, 0, 0, width + 0.22, frameThick, 0.44, true, true);
    }

    const pivots: InteractiveDoorPivot[] = [];
    const handleGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.18, 0.04));

    const buildLeaf = (hingeX: number, hingeZ: number, leafW: number, dirSign: 1 | -1, swingSign: 1 | -1) => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, yBase + height * 0.5, hingeZ);
      worldGroup.add(pivot);

      const leafGeo = trackGeo(
        axis === 'z'
          ? new THREE.BoxGeometry(thick, height - 0.04, leafW)
          : new THREE.BoxGeometry(leafW, height - 0.04, thick),
      );
      const leafMesh = new THREE.Mesh(leafGeo, haveliDoorMat);
      if (axis === 'z') {
        leafMesh.position.z = dirSign * (leafW * 0.5);
      } else {
        leafMesh.position.x = dirSign * (leafW * 0.5);
      }
      leafMesh.castShadow = !isSoftwareGl;
      leafMesh.receiveShadow = true;
      pivot.add(leafMesh);

      const knob = new THREE.Mesh(handleGeo, goldMat);
      if (axis === 'z') {
        knob.position.set(thick * 0.55, -0.05, dirSign * (leafW - 0.14));
      } else {
        knob.position.set(dirSign * (leafW - 0.14), -0.05, thick * 0.55);
      }
      pivot.add(knob);

      const knobBack = knob.clone();
      if (axis === 'z') knobBack.position.x = -thick * 0.55;
      else knobBack.position.z = -thick * 0.55;
      pivot.add(knobBack);

      pivots.push({
        group: pivot,
        closedY: 0,
        openY: swingSign * (Math.PI * 0.52),
      });
    };

    if (doubleLeaf) {
      const leafW = width * 0.5 - 0.02;
      if (axis === 'z') {
        buildLeaf(x, z - width * 0.5, leafW, 1, (openSign) as 1 | -1);
        buildLeaf(x, z + width * 0.5, leafW, -1, (-openSign) as 1 | -1);
      } else {
        buildLeaf(x - width * 0.5, z, leafW, 1, (-openSign) as 1 | -1);
        buildLeaf(x + width * 0.5, z, leafW, -1, (openSign) as 1 | -1);
      }
    } else {
      const leafW = width - 0.03;
      if (axis === 'z') {
        buildLeaf(x, z - width * 0.5, leafW, 1, openSign);
      } else {
        buildLeaf(x - width * 0.5, z, leafW, 1, openSign);
      }
    }

    const collider: BoxCollider = {
      id,
      minX: x - (axis === 'z' ? 0.18 : width * 0.5),
      maxX: x + (axis === 'z' ? 0.18 : width * 0.5),
      minY: yBase,
      maxY: yBase + height,
      minZ: z - (axis === 'z' ? width * 0.5 : 0.18),
      maxZ: z + (axis === 'z' ? width * 0.5 : 0.18),
      mantleable: false,
      blocksZombies: true,
      disabled: false,
    };
    colliders.push(collider);

    interactiveDoors.push({
      id,
      label,
      pivots,
      collider,
      centerPos: new THREE.Vector3(x, yBase + 1.0, z),
      open: false,
      currentProgress: 0,
    });
  };

  // Agra Haveli Bounds: X = 34.0..50.0, Z = 27.0..43.0
  // Ground slab top = 0.24m, Second Floor top = 4.00m (slab 3.72..4.00), Roof top = 7.40m (slab 7.12..7.40)
  addBox(worldGroup, 16.4, 0.24, 16.4, 42.0, 0.12, 35.0, sandstoneMat, {
    collide: true,
    mantleable: false,
    id: 'haveli_plinth',
  });
  // Polished Cream Porcelain Interior Floor
  const haveliTilePlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(15.6, 15.6)), haveliFloorMat);
  haveliTilePlane.rotation.x = -Math.PI / 2;
  haveliTilePlane.position.set(42.0, 0.244, 35.0);
  haveliTilePlane.receiveShadow = true;
  worldGroup.add(haveliTilePlane);

  // Entry Porch Step (West Door at x = 34.0, z = 34.0)
  addBox(worldGroup, 1.8, 0.14, 3.8, 33.1, 0.07, 34.0, sandstoneMat, {
    collide: true,
    mantleable: false,
    id: 'haveli_front_step',
  });

  // Helper for Haveli walls (ground to roof or custom heights)
  const addHaveliWall = (x: number, yMin: number, yMax: number, z: number, w: number, d: number, id?: string) => {
    const h = yMax - yMin;
    addBox(worldGroup, w, h, d, x, yMin + h * 0.5, z, haveliWallMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
      id,
    });
  };

  // --- EXTERIOR PERIMETER WALLS (with proper doorway and window gaps) ---
  // 1. WEST WALL (x = 34.0, z = 27.0..43.0)
  // Front Double Door opening at z = 32.8..35.2, y = 0.24..2.94
  addHaveliWall(34.0, 0.24, 7.40, 29.8, 0.36, 5.8, 'haveli_w_n');   // z = 26.9..32.7
  addHaveliWall(34.0, 0.24, 7.40, 39.2, 0.36, 7.8, 'haveli_w_s');   // z = 35.3..43.1
  addHaveliWall(34.0, 2.94, 7.40, 34.0, 0.36, 2.6, 'haveli_w_hdr'); // lintel over front doors

  // Exterior Mint Canopy & Trim Band on West Facade
  addBox(worldGroup, 1.5, 0.16, 4.2, 33.25, 3.12, 34.0, haveliMintTrimMat, { collide: false });
  addBox(worldGroup, 0.42, 0.24, 16.3, 34.0, 4.02, 35.0, haveliMintTrimMat, { collide: false });

  // 2. SOUTH WALL (z = 43.0, x = 34.0..50.0)
  addHaveliWall(42.0, 0.24, 7.40, 43.0, 16.2, 0.36, 'haveli_s_wall');
  addBox(worldGroup, 15.6, 0.24, 0.08, 42.0, 4.12, 42.78, haveliMintTrimMat, { collide: false });

  // 3. EAST WALL (x = 50.0, z = 27.0..43.0) with centered dark-mullioned living room window (z = 32.0..35.4, y = 1.35..2.85)
  addHaveliWall(50.0, 0.24, 7.40, 29.4, 0.36, 5.1, 'haveli_e_n');
  addHaveliWall(50.0, 0.24, 7.40, 39.3, 0.36, 7.6, 'haveli_e_s');
  addHaveliWall(50.0, 0.24, 1.35, 33.7, 0.36, 3.5, 'haveli_e_win_bot');
  addHaveliWall(50.0, 2.85, 7.40, 33.7, 0.36, 3.5, 'haveli_e_win_top');
  pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, 49.96, 2.1, 33.7, 0, 0, 0, 0.12, 1.54, 3.44, false, true);
  pushStaticGeo(unitBoxGeo, tealWindowMat, 49.98, 2.1, 33.7, 0, 0, 0, 0.06, 1.42, 3.3, false, false);
  // Interior Mint Trim Band on East Double-Height Wall (matches reference!)
  addBox(worldGroup, 0.08, 0.24, 15.6, 49.78, 4.15, 35.0, haveliMintTrimMat, { collide: false });

  // 4. NORTH WALL (z = 27.0, x = 34.0..50.0)
  // Upper Veranda Doorway at x = 34.9..36.3, y = 4.00..6.35; Tall Staircase Blue-Mullion Window at x = 37.8..41.8, y = 2.35..6.35
  addHaveliWall(34.45, 0.24, 7.40, 27.0, 0.9, 0.36, 'haveli_n_nw');    // x = 34.0..34.9
  addHaveliWall(35.6, 0.24, 4.00, 27.0, 1.4, 0.36, 'haveli_n_door_lo'); // below upper terrace door
  addHaveliWall(35.6, 6.35, 7.40, 27.0, 1.4, 0.36, 'haveli_n_door_hi'); // lintel above upper terrace door
  addHaveliWall(37.05, 0.24, 7.40, 27.0, 1.5, 0.36, 'haveli_n_mid');   // x = 36.3..37.8
  addHaveliWall(39.8, 0.24, 2.35, 27.0, 4.0, 0.36, 'haveli_n_win_bot'); // under tall staircase window
  addHaveliWall(39.8, 6.35, 7.40, 27.0, 4.0, 0.36, 'haveli_n_win_top'); // above tall staircase window
  addHaveliWall(46.0, 0.24, 7.40, 27.0, 8.4, 0.36, 'haveli_n_ne');    // x = 41.8..50.2
  // Tall Blue-Mullioned Frosted Staircase Window (x = 37.8..41.8, y = 2.35..6.35)
  pushStaticGeo(unitBoxGeo, haveliWindowMat, 39.8, 4.35, 27.0, 0, 0, 0, 4.0, 4.0, 0.08, false, false);
  // Interior Mint Trim Band on North Double-Height Wall
  addBox(worldGroup, 8.0, 0.24, 0.08, 45.8, 4.15, 27.22, haveliMintTrimMat, { collide: false });

  // --- GROUND STUDY ROOM PARTITION (SW Corner: x = 34.2..42.4, z = 37.3..42.8) ---
  // Partition wall along z = 37.3 with Interactive Study Door at x = 37.1..38.5 (y = 0.24..2.74)
  addHaveliWall(35.65, 0.24, 3.72, 37.3, 2.9, 0.28, 'haveli_study_n1'); // x = 34.2..37.1
  addHaveliWall(40.45, 0.24, 3.72, 37.3, 3.9, 0.28, 'haveli_study_n2'); // x = 38.5..42.4
  addHaveliWall(37.8, 2.74, 3.72, 37.3, 1.4, 0.28, 'haveli_study_hdr'); // lintel over study door
  // East partition wall of Ground Study (x = 42.4, z = 37.3..42.8)
  addHaveliWall(42.4, 0.24, 3.72, 40.05, 0.28, 5.5, 'haveli_study_e');

  // --- SECOND FLOOR DECKS (y = 3.72..4.00, top = 4.00m) ---
  // 1. NW 2nd Floor Gallery at top of stairs (x = 34.2..37.2, z = 27.2..31.4)
  addBox(worldGroup, 3.0, 0.28, 4.2, 35.7, 3.86, 29.3, haveliWallMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
    id: 'haveli_2f_nw',
  });
  // 2. West Upper Catwalk bridging NW Gallery -> SW Upper Wing over front door (x = 34.2..36.8, z = 31.4..37.3)
  addBox(worldGroup, 2.6, 0.28, 5.9, 35.5, 3.86, 34.35, haveliWallMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
    id: 'haveli_2f_catwalk',
  });
  // 3. SW Upper Bedroom/Study Ceiling Deck (x = 34.2..42.4, z = 37.3..42.8)
  addBox(worldGroup, 8.2, 0.28, 5.5, 38.3, 3.86, 40.05, haveliWallMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
    id: 'haveli_2f_sw',
  });
  // 4. SE Overlooking Balcony protruding into Double-Height Atrium (x = 42.4..49.6, z = 38.6..42.8)
  addBox(worldGroup, 7.2, 0.28, 4.2, 46.0, 3.86, 40.7, haveliWallMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
    id: 'haveli_2f_balcony',
  });
  // Mint-green balcony fascia + dark wooden railing with carved balusters overlooking Living Hall!
  addBox(worldGroup, 7.3, 0.34, 0.14, 46.0, 3.88, 38.58, haveliMintTrimMat, { collide: false });
  addBox(worldGroup, 2.7, 0.34, 0.14, 38.2, 3.88, 31.4, haveliMintTrimMat, { collide: false });
  addBox(worldGroup, 0.14, 0.34, 5.9, 36.8, 3.88, 34.35, haveliMintTrimMat, { collide: false });

  // Upper Floor Polished Tile Overlays & Balcony Guard Rails
  pushStaticGeo(unitBoxGeo, haveliFloorMat, 35.7, 4.003, 29.3, 0, 0, 0, 2.9, 0.01, 4.0, false, true);
  pushStaticGeo(unitBoxGeo, haveliFloorMat, 35.5, 4.003, 34.35, 0, 0, 0, 2.4, 0.01, 5.8, false, true);
  pushStaticGeo(unitBoxGeo, haveliFloorMat, 42.1, 4.003, 40.2, 0, 0, 0, 14.8, 0.01, 5.2, false, true);

  // Guard railings along NW Gallery, West Catwalk, and SE Overlooking Balcony
  const addBalconyRailing = (x1: number, z1: number, x2: number, z2: number, railY = 4.0) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const midX = (x1 + x2) * 0.5;
    const midZ = (z1 + z2) * 0.5;
    const isX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    // Handrail + low curb + balusters
    addBox(worldGroup, isX ? len : 0.1, 0.08, isX ? 0.1 : len, midX, railY + 0.96, midZ, haveliWoodDarkMat, { collide: false });
    addBox(worldGroup, isX ? len : 0.12, 0.96, isX ? 0.12 : len, midX, railY + 0.48, midZ, haveliWoodDarkMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });
    const steps = Math.max(3, Math.floor(len / 0.48));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const bx = THREE.MathUtils.lerp(x1, x2, u);
      const bz = THREE.MathUtils.lerp(z1, z2, u);
      pushStaticGeo(unitBoxGeo, darkMetalMat, bx, railY + 0.48, bz, 0, 0, 0, 0.04, 0.9, 0.04, false, true);
    }
  };
  addBalconyRailing(36.75, 31.45, 36.75, 38.55); // West Catwalk rail overlooking Living Hall
  addBalconyRailing(42.4, 38.6, 49.6, 38.6);   // SE Overlooking Balcony rail!

  // Upper Room Partition separating SW Upper Room from SE Overlooking Balcony (at x = 42.4, z = 38.6..42.8)
  // Leaves Interactive Balcony Door #4 at z = 39.8..41.2 (y = 4.00..6.35)
  addHaveliWall(42.4, 4.00, 7.12, 39.2, 0.28, 1.2, 'haveli_2f_part_n');
  addHaveliWall(42.4, 4.00, 7.12, 42.05, 0.28, 1.7, 'haveli_2f_part_s');
  addHaveliWall(42.4, 6.35, 7.12, 40.5, 0.28, 1.4, 'haveli_2f_part_hdr');

  // --- WALKABLE L-SHAPED INTERIOR STAIRCASE (Flight 1 Eastbound -> Mid-Landing -> Flight 2 Westbound) ---
  // Flight 1: x = 36.4 (y=0.24) -> x = 40.4 (y=2.12), z = 29.3..31.1
  const flight1Count = 9;
  for (let i = 0; i < flight1Count; i++) {
    const t0 = i / flight1Count;
    const t1 = (i + 1) / flight1Count;
    const stepTop = THREE.MathUtils.lerp(0.24, 2.12, t1);
    const stepX = THREE.MathUtils.lerp(36.4, 40.4, (t0 + t1) * 0.5);
    const stepW = 4.0 / flight1Count;
    pushStaticGeo(unitBoxGeo, haveliWallMat, stepX, stepTop * 0.5 + 0.12, 30.2, 0, 0, 0, stepW + 0.02, stepTop - 0.24, 1.8, true, true);
    pushStaticGeo(unitBoxGeo, haveliMintTrimMat, stepX, stepTop - 0.02, 31.12, 0, 0, 0, stepW + 0.02, 0.09, 0.06, false, true);
    if (i % 2 === 0) {
      pushStaticGeo(unitBoxGeo, darkMetalMat, stepX, stepTop + 0.44, 31.08, 0, 0, 0, 0.04, 0.88, 0.04, false, false);
    }
  }
  pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, 38.4, 2.12, 31.08, 0, 0, 0.44, 4.45, 0.08, 0.08, false, true);
  colliders.push({
    id: 'haveli_stair_flight1',
    minX: 36.4,
    maxX: 40.4,
    minY: 0.2,
    maxY: 2.2,
    minZ: 29.3,
    maxZ: 31.1,
    mantleable: false,
    blocksZombies: false,
    ramp: { axis: 'x', lowCoord: 36.4, highCoord: 40.4, lowY: 0.24, highY: 2.12 },
  });

  // Mid-Landing (x = 40.4..42.6, z = 27.2..31.1, top = 2.12m)
  addBox(worldGroup, 2.2, 0.28, 3.9, 41.5, 1.98, 29.15, haveliWallMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
    id: 'haveli_stair_midlanding',
  });
  addBox(worldGroup, 0.12, 0.96, 3.9, 42.55, 2.6, 29.15, haveliWoodDarkMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
  });

  // Flight 2: x = 40.4 (y=2.12) -> x = 36.8 (y=4.00), z = 27.3..29.1
  const flight2Count = 9;
  for (let i = 0; i < flight2Count; i++) {
    const t0 = i / flight2Count;
    const t1 = (i + 1) / flight2Count;
    const stepTop = THREE.MathUtils.lerp(2.12, 4.00, t1);
    const stepX = THREE.MathUtils.lerp(40.4, 36.8, (t0 + t1) * 0.5);
    const stepW = 3.6 / flight2Count;
    pushStaticGeo(unitBoxGeo, haveliWallMat, stepX, stepTop - 0.18, 28.2, 0, 0, 0, stepW + 0.02, 0.36, 1.8, true, true);
    pushStaticGeo(unitBoxGeo, haveliMintTrimMat, stepX, stepTop - 0.02, 29.12, 0, 0, 0, stepW + 0.02, 0.09, 0.06, false, true);
    if (i % 2 === 0) {
      pushStaticGeo(unitBoxGeo, darkMetalMat, stepX, stepTop + 0.44, 29.08, 0, 0, 0, 0.04, 0.88, 0.04, false, false);
    }
  }
  pushStaticGeo(unitBoxGeo, haveliWoodDarkMat, 38.6, 4.0, 29.08, 0, 0, -0.48, 4.05, 0.08, 0.08, false, true);
  colliders.push({
    id: 'haveli_stair_flight2',
    minX: 36.8,
    maxX: 40.4,
    minY: 2.0,
    maxY: 4.08,
    minZ: 27.3,
    maxZ: 29.1,
    mantleable: false,
    blocksZombies: false,
    ramp: { axis: 'x', lowCoord: 40.4, highCoord: 36.8, lowY: 2.12, highY: 4.00 },
  });

  // --- ROOFTOP DECK (y = 7.12..7.40, top = 7.40m) & PARAPETS ---
  addBox(worldGroup, 16.4, 0.28, 16.4, 42.0, 7.26, 35.0, sandstoneMat, {
    collide: true,
    mantleable: true,
    blocksZombies: true,
    id: 'haveli_roof_slab',
  });
  // Rooftop Parapet Walls (leave gap at NE stair exit x = 47.6..49.8, z = 27.0)
  addBox(worldGroup, 16.2, 0.85, 0.28, 42.0, 7.82, 43.05, haveliPeachMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.28, 0.85, 16.2, 34.0, 7.82, 35.0, haveliPeachMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.28, 0.85, 16.2, 50.0, 7.82, 35.0, haveliPeachMat, { collide: true, mantleable: true });
  addBox(worldGroup, 13.6, 0.85, 0.28, 40.8, 7.82, 27.0, haveliPeachMat, { collide: true, mantleable: true });
  // Rooftop Water Tank & Parkour Edge Smudge
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 1.35, 12)), haveliWaterTankMat, 36.2, 8.08, 40.5, 0, 0, 0, 1, 1, 1, true, true);
  pushStaticGeo(smudgeGeo, parkourSmudgeMat, 42.0, 8.26, 27.0, 0, 0, 0, 4.5, 1, 1, false, false);

  // --- 2ND FLOOR EXTERIOR VERANDA (z = 23.0..27.0, x = 33.4..49.8, top = 4.00m) + PARKOUR BRIDGE TO bldg_e1 ---
  addBox(worldGroup, 16.4, 0.26, 4.0, 41.6, 3.87, 25.0, sandstoneMat, {
    collide: true,
    mantleable: true,
    blocksZombies: true,
    id: 'haveli_2f_veranda',
  });
  // Support Columns under Veranda
  [33.8, 41.6, 49.4].forEach((vx) => {
    addBox(worldGroup, 0.34, 3.74, 0.34, vx, 1.87, 23.2, sandstoneMat, { collide: true, mantleable: false });
  });
  // Veranda North Railing (gap at x = 33.4..35.0 for plank bridge to bldg_e1!)
  addBox(worldGroup, 14.4, 0.92, 0.16, 42.5, 4.46, 23.08, haveliWoodDarkMat, { collide: true, mantleable: true });

  // Exterior Stair from 2F Veranda (x = 43.8, y = 4.00) up to Haveli Rooftop (x = 49.4, y = 7.40) along z = 23.4..25.6
  for (let i = 0; i < 12; i++) {
    const t = (i + 1) / 12;
    const sy = THREE.MathUtils.lerp(4.0, 7.4, t);
    const sx = THREE.MathUtils.lerp(43.8, 49.4, (i + 0.5) / 12);
    pushStaticGeo(unitBoxGeo, sandstoneMat, sx, sy - 0.14, 24.5, 0, 0, 0, 0.48, 0.28, 2.0, true, true);
  }
  colliders.push({
    id: 'haveli_roof_stair',
    minX: 43.8,
    maxX: 49.4,
    minY: 3.9,
    maxY: 7.48,
    minZ: 23.5,
    maxZ: 25.6,
    mantleable: false,
    blocksZombies: false,
    ramp: { axis: 'x', lowCoord: 43.8, highCoord: 49.4, lowY: 4.0, highY: 7.4 },
  });

  // Wooden Parkour Bridge linking bldg_e1 (x=27.5..32.5, h=3.9, z=18..28) -> Haveli 2F Veranda (x=33.4, y=4.0, z=24.8)
  addBox(worldGroup, 2.4, 0.22, 2.5, 32.8, 3.95, 24.8, woodMat, {
    collide: true,
    mantleable: true,
    blocksZombies: false,
    id: 'bridge_e1_to_haveli',
  });
  pushStaticGeo(smudgeGeoZ, parkourSmudgeMat, 32.8, 4.075, 24.8, 0, 0, 0, 1, 1, 2.0, false, false);

  // --- INDOOR FURNITURE, BOOKSHELF, LIGHTING & SPINNING CEILING FAN ---
  // Coffee Table & Cushioned Divan Sofa + 4 Wooden Armchairs in Living Hall
  addBox(worldGroup, 1.4, 0.44, 2.3, 44.6, 0.46, 36.2, haveliWoodDarkMat, { collide: true, mantleable: true });
  addBox(worldGroup, 1.0, 0.46, 2.5, 46.8, 0.47, 36.2, haveliWoodDarkMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.9, 0.14, 2.3, 46.8, 0.74, 36.2, marbleTrimMat, { collide: false });
  [
    [44.6, 32.2],
    [44.6, 33.4],
    [46.8, 32.2],
    [46.8, 33.4],
  ].forEach(([cx, cz]) => {
    addBox(worldGroup, 0.72, 0.48, 0.72, cx, 0.48, cz, haveliWoodDarkMat, { collide: true, mantleable: true });
    addBox(worldGroup, 0.12, 0.56, 0.72, cx + 0.3, 0.92, cz, haveliWoodDarkMat, { collide: false });
  });
  // Dark Blue Recessed Bookshelf along East Wall (x = 49.3, z = 37.2)
  addBox(worldGroup, 0.7, 2.5, 2.8, 49.4, 1.49, 37.2, haveliBookshelfMat, { collide: true, mantleable: true });
  // Study Desk + Supply Shelf in SW Ground Study Room
  addBox(worldGroup, 2.1, 0.78, 0.95, 35.6, 0.63, 41.6, haveliWoodDarkMat, { collide: true, mantleable: true });

  // Interactive First-Aid Medkits Registry (Haveli Study Desk + Train S7 Berth)
  interface WorldMedkit {
    pos: THREE.Vector3;
    group: THREE.Group;
    used: boolean;
  }
  const worldMedkits: WorldMedkit[] = [];
  const medCrossMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    }),
  );
  const medkitCaseGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.18, 0.3));
  const medCrossAGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.03, 0.06));
  const medCrossBGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.03, 0.18));
  const addInteractiveMedkit = (mx: number, my: number, mz: number) => {
    const pos = new THREE.Vector3(mx, my, mz);
    const group = new THREE.Group();
    group.position.copy(pos);
    worldGroup.add(group);
    group.add(new THREE.Mesh(medkitCaseGeo, marbleMat));
    const cA = new THREE.Mesh(medCrossAGeo, medCrossMat);
    cA.position.y = 0.095;
    group.add(cA);
    const cB = new THREE.Mesh(medCrossBGeo, medCrossMat);
    cB.position.y = 0.095;
    group.add(cB);
    worldMedkits.push({ pos, group, used: false });
  };
  addInteractiveMedkit(35.7, 1.15, 41.5); // Haveli Study Desk

  // Warm Indoor Wall Sconces & Non-Shadow-Casting PointLights
  pushStaticGeo(unitBoxGeo, haveliSconceGlowMat, 47.4, 3.3, 42.74, 0, 0, 0, 0.24, 0.28, 0.12, false, false);
  pushStaticGeo(unitBoxGeo, haveliSconceGlowMat, 49.74, 3.1, 33.7, 0, 0, 0, 0.12, 0.18, 1.4, false, false);
  const haveliMainLight = new THREE.PointLight(0xffe1b0, 3.2, 20, 1.5);
  haveliMainLight.castShadow = false;
  haveliMainLight.position.set(44.5, 5.4, 34.5);
  worldGroup.add(haveliMainLight);

  const haveliStudyLight = new THREE.PointLight(0xffdfb0, 2.1, 11, 1.6);
  haveliStudyLight.castShadow = false;
  haveliStudyLight.position.set(37.5, 3.2, 40.2);
  worldGroup.add(haveliStudyLight);

  // Slowly Spinning Double-Height Ceiling Fan at (44.8, 6.25, 33.4)
  const haveliFanGroup = new THREE.Group();
  haveliFanGroup.position.set(44.8, 6.25, 33.4);
  worldGroup.add(haveliFanGroup);
  const fanRod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8)), darkMetalMat);
  fanRod.position.y = 0.45;
  haveliFanGroup.add(fanRod);
  const fanHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 12)), darkMetalMat);
  haveliFanGroup.add(fanHub);
  const fanBladeGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.025, 0.18));
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(fanBladeGeo, haveliWoodDarkMat);
    const ang = (b / 4) * Math.PI * 2;
    blade.position.set(Math.cos(ang) * 0.56, 0, Math.sin(ang) * 0.56);
    blade.rotation.y = -ang;
    blade.rotation.x = 0.14;
    haveliFanGroup.add(blade);
  }

  // Register the 4 Interactive Hinged Mint-and-Teak Doors
  registerInteractiveDoor({
    id: 'haveli_door_front',
    label: 'Haveli Front Double Doors',
    x: 34.0,
    yBase: 0.24,
    z: 34.0,
    width: 2.38,
    height: 2.66,
    axis: 'z',
    doubleLeaf: true,
    openSign: -1,
  });
  registerInteractiveDoor({
    id: 'haveli_door_study',
    label: 'Study Room Door',
    x: 37.8,
    yBase: 0.24,
    z: 37.3,
    width: 1.36,
    height: 2.46,
    axis: 'x',
    doubleLeaf: false,
    openSign: 1,
  });
  registerInteractiveDoor({
    id: 'haveli_door_veranda',
    label: 'Upper Veranda Door',
    x: 35.6,
    yBase: 4.00,
    z: 27.0,
    width: 1.36,
    height: 2.32,
    axis: 'x',
    doubleLeaf: false,
    openSign: -1,
  });
  registerInteractiveDoor({
    id: 'haveli_door_balcony',
    label: 'Upper Balcony Door',
    x: 42.4,
    yBase: 4.00,
    z: 40.5,
    width: 1.36,
    height: 2.32,
    axis: 'z',
    doubleLeaf: false,
    openSign: 1,
  });

  // --- FLANKING TAJ GANJ TERRACED NEIGHBORHOOD HOUSES (matching photo 1) ---
  const tajGanjHouses: Array<{
    id: string;
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    mat: THREE.Material;
    hasTank?: boolean;
  }> = [
    { id: 'tg_house_ne', x: 53.6, z: 22.0, w: 5.8, h: 4.2, d: 7.2, mat: haveliOchreMat, hasTank: true },
    { id: 'tg_house_se', x: 53.6, z: 36.5, w: 6.2, h: 5.6, d: 8.6, mat: haveliPeachMat, hasTank: true },
    { id: 'tg_house_s1', x: 43.0, z: 46.8, w: 9.2, h: 4.1, d: 5.2, mat: haveliTerracottaMat, hasTank: false },
    { id: 'tg_house_s2', x: 30.0, z: 47.2, w: 8.4, h: 3.6, d: 4.8, mat: haveliOchreMat, hasTank: true },
  ];
  tajGanjHouses.forEach((h) => {
    addBox(worldGroup, h.w, h.h, h.d, h.x, h.h * 0.5, h.z, h.mat, {
      collide: true,
      mantleable: true,
      wallrunnable: true,
      blocksZombies: true,
      id: h.id,
    });
    // Rooftop parapets & cornice trim
    addBox(worldGroup, h.w + 0.2, 0.55, 0.22, h.x, h.h + 0.275, h.z - h.d * 0.5 + 0.11, marbleTrimMat);
    addBox(worldGroup, h.w + 0.2, 0.55, 0.22, h.x, h.h + 0.275, h.z + h.d * 0.5 - 0.11, marbleTrimMat);
    addBox(worldGroup, 0.22, 0.55, h.d, h.x - h.w * 0.5 + 0.11, h.h + 0.275, h.z, marbleTrimMat);
    addBox(worldGroup, 0.22, 0.55, h.d, h.x + h.w * 0.5 - 0.11, h.h + 0.275, h.z, marbleTrimMat);
    // Decorative recessed Taj Ganj facade windows
    pushStaticGeo(unitBoxGeo, tealWindowMat, h.x - h.w * 0.5 - 0.04, h.h * 0.56, h.z - h.d * 0.22, 0, 0, 0, 0.08, 1.0, 0.9, false, false);
    pushStaticGeo(unitBoxGeo, tealWindowMat, h.x - h.w * 0.5 - 0.04, h.h * 0.56, h.z + h.d * 0.22, 0, 0, 0, 0.08, 1.0, 0.9, false, false);
    if (h.hasTank) {
      pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.55, 0.55, 1.15, 10)), haveliWaterTankMat, h.x + 0.8, h.h + 0.58, h.z - 0.8, 0, 0, 0, 1, 1, 1, true, true);
    }
    pushStaticGeo(smudgeGeo, parkourSmudgeMat, h.x - h.w * 0.5 + 0.18, h.h + 0.565, h.z, 0, Math.PI / 2, 0, 2.2, 1, 1, false, false);
  });

  // =========================================================================
  // 6C. AGRA CANTT & AGRA CITY RAILWAY STATION, FOOT-OVERBRIDGE & 3 TRAINS
  // =========================================================================
  const stBrickRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayBrickRed,
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.03,
    }),
  );
  const stBrickWhiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayWhiteBrick,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.03,
    }),
  );
  const stTrimRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.72,
      metalness: 0.06,
    }),
  );
  const stRoofTileMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2412c,
      roughness: 0.78,
      metalness: 0.06,
    }),
  );
  const stChhatriMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc8372d,
      roughness: 0.68,
      metalness: 0.08,
    }),
  );
  const stPlinthMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5d463c,
      roughness: 0.88,
      metalness: 0.04,
    }),
  );
  const stPlatformDeckMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.courtyardTile,
      bumpMap: textures.stoneBump,
      bumpScale: 0.026,
      roughnessMap: textures.stoneRoughness,
      color: 0x6b7280,
      roughness: 0.72,
      metalness: 0.08,
    }),
  );
  const stTactileYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.74,
      metalness: 0.05,
    }),
  );
  const stCanopySheetMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.rustedMetal,
      bumpMap: textures.rustedMetalBump,
      bumpScale: 0.032,
      roughnessMap: textures.rustedMetalRoughness,
      color: 0x94a3b8,
      roughness: 0.82,
      metalness: 0.48,
    }),
  );
  const stFobBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.54,
      metalness: 0.35,
    }),
  );
  const stFobYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.52,
      metalness: 0.25,
    }),
  );
  const stRailSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.26,
      metalness: 0.88,
    }),
  );
  const stSleeperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x64625e,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const stBallastMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayBallast,
      color: 0xb8b2aa,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  const stBoardCanttMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayBoardCantt,
      roughness: 0.48,
      metalness: 0.08,
    }),
  );
  const stBoardCityMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayBoardCity,
      roughness: 0.48,
      metalness: 0.08,
    }),
  );
  const stFacadeNcrMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayFacadeNcr,
      roughness: 0.42,
      metalness: 0.14,
    }),
  );
  const stDropDriveMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayDropDrive,
      roughness: 0.44,
      metalness: 0.1,
    }),
  );
  const stClock1207Mat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayClock1207,
      emissiveMap: textures.railwayClock1207,
      emissive: 0xff3b3b,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    }),
  );
  const stClock1744Mat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayClock1744,
      emissiveMap: textures.railwayClock1744,
      emissive: 0xff3b3b,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    }),
  );
  const stExecSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayExecSign,
      roughness: 0.46,
      metalness: 0.06,
    }),
  );
  const stLedTubeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
  );
  const stIcfBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayIcfBlue,
      roughness: 0.42,
      metalness: 0.34,
    }),
  );
  const stCreamExpressMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayCreamExpress,
      roughness: 0.46,
      metalness: 0.28,
    }),
  );
  const stGaribGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.railwayGaribGreen,
      roughness: 0.44,
      metalness: 0.3,
    }),
  );
  const stCoachRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.58,
      metalness: 0.46,
    }),
  );
  const stCoachInteriorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd6d3cd,
      roughness: 0.72,
      metalness: 0.08,
    }),
  );
  const stBerthBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.78,
      metalness: 0.04,
    }),
  );
  const stBerthMaroonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      roughness: 0.76,
      metalness: 0.04,
    }),
  );
  const stVestibuleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
      metalness: 0.12,
    }),
  );
  const stLocoSaffronMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.42,
      metalness: 0.38,
    }),
  );

  // 1) Station Forecourt Road & Drop-and-Drive Steel Pedestrian Railings (x = -46..-56, z = -42..+42)
  addBox(worldGroup, 10.2, 0.06, 84.0, -51.0, 0.03, 0, stPlatformDeckMat, {
    collide: false,
    receiveShadow: true,
  });
  // Stainless steel crowd guardrail along forecourt sidewalk (x = -54.2), leaving central portico arches open (z = -10..+10)
  [
    [-34, -12],
    [12, 34],
  ].forEach(([z0, z1]) => {
    const segLen = z1 - z0;
    const midZ = (z0 + z1) * 0.5;
    pushStaticGeo(unitBoxGeo, chromeMat, -54.2, 0.92, midZ, 0, 0, 0, 0.06, 0.06, segLen, false, false);
    pushStaticGeo(unitBoxGeo, chromeMat, -54.2, 0.5, midZ, 0, 0, 0, 0.04, 0.04, segLen, false, false);
    for (let pz = z0; pz <= z1 + 0.01; pz += 2.2) {
      pushStaticGeo(unitBoxGeo, chromeMat, -54.2, 0.48, pz, 0, 0, 0, 0.06, 0.96, 0.06, true, true);
    }
    colliders.push({
      id: `st_forecourt_rail_${z0}`,
      minX: -54.35,
      maxX: -54.05,
      minY: 0,
      maxY: 0.98,
      minZ: z0,
      maxZ: z1,
      mantleable: true,
      blocksZombies: true,
    });
  });

  // Green "ENTRY / DROP & DRIVE" Sign in Front of Portico (x = -52.5, z = 4.2)
  pushStaticGeo(unitBoxGeo, chromeMat, -52.5, 1.5, 3.05, 0, 0, 0, 0.09, 3.0, 0.09, true, true);
  pushStaticGeo(unitBoxGeo, chromeMat, -52.5, 1.5, 5.35, 0, 0, 0, 0.09, 3.0, 0.09, true, true);
  addBox(worldGroup, 0.14, 2.0, 2.5, -52.5, 2.05, 4.2, stDropDriveMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
  });

  // High-Mast Floodlight Tower in South Forecourt (x = -50.2, z = 24.0)
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.14, 0.34, 14.5, 8)), chromeMat, -50.2, 7.25, 24.0, 0, 0, 0, 1, 1, 1, true, true);
  pushStaticGeo(unitBoxGeo, darkMetalMat, -50.2, 14.4, 24.0, 0, 0, 0, 1.4, 0.16, 1.4, false, false);
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2;
    pushStaticGeo(unitBoxGeo, stLedTubeMat, -50.2 + Math.cos(ang) * 0.55, 14.28, 24.0 + Math.sin(ang) * 0.55, 0, ang, 0.35, 0.35, 0.16, 0.25, false, false);
  }
  const stMastLight = new THREE.PointLight(0xffeed4, 5.5, 38, 1.3);
  stMastLight.castShadow = false;
  stMastLight.position.set(-50.2, 13.8, 24.0);
  worldGroup.add(stMastLight);

  // 2) MAIN AGRA CANTT HERITAGE STATION BUILDING (x = -56.0 .. -66.0, z = -34 .. +34)
  // Raised station plinth & concourse floor (y = 0.25m, sloped access apron on East Forecourt)
  addBox(worldGroup, 10.6, 0.25, 68.4, -61.0, 0.125, 0, stPlinthMat, {
    collide: true,
    mantleable: false,
    id: 'station_concourse_plinth',
  });
  addBox(worldGroup, 1.4, 0.14, 24.0, -55.2, 0.07, 0, stPlinthMat, {
    collide: false,
  });
  colliders.push({
    id: 'st_forecourt_apron_ramp',
    minX: -55.9,
    maxX: -54.5,
    minY: 0,
    maxY: 0.3,
    minZ: -12,
    maxZ: 12,
    mantleable: false,
    blocksZombies: false,
    ramp: { axis: 'x', lowCoord: -54.5, highCoord: -55.9, lowY: 0, highY: 0.25 },
  });

  // Central Whitewashed Portico (z = -11 .. +11, East Wall x = -56.2, West Platform Wall x = -65.8)
  // 3 Walk-through Archways at z = -7.0, 0.0, +7.0 (each 3.2m wide x 3.6m tall)
  const buildPorticoArchedWall = (wx: number, idPrefix: string) => {
    const piers = [-10.5, -3.5, 3.5, 10.5];
    piers.forEach((pz, idx) => {
      addBox(worldGroup, 0.78, 3.8, 1.75, wx, 2.15, pz, stBrickWhiteMat, {
        collide: true,
        mantleable: false,
        blocksZombies: true,
        id: `${idPrefix}_pier_${idx}`,
      });
      // Red sandstone plinth & capital accent
      addBox(worldGroup, 0.92, 1.35, 1.9, wx, 0.92, pz, stPlinthMat, { collide: false });
      addBox(worldGroup, 0.96, 0.26, 2.0, wx, 3.85, pz, stTrimRedMat, { collide: false });
    });
    // Stepped red arch corbels inside each opening
    [-7.0, 0.0, 7.0].forEach((az) => {
      [-1.55, 1.55].forEach((dz) => {
        pushStaticGeo(unitBoxGeo, stTrimRedMat, wx, 3.45, az + dz * 0.88, 0, 0, 0, 0.84, 0.42, 0.5, false, false);
        pushStaticGeo(unitBoxGeo, stTrimRedMat, wx, 3.72, az + dz * 0.62, 0, 0, 0, 0.84, 0.32, 0.5, false, false);
      });
    });
    // Upper whitewashed brick spandrel frieze & overhang cornice (y = 3.85..6.15)
    addBox(worldGroup, 0.78, 2.3, 22.8, wx, 5.0, 0, stBrickWhiteMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
      id: `${idPrefix}_frieze`,
    });
    addBox(worldGroup, 1.7, 0.24, 24.4, wx + (wx > -61 ? 0.55 : -0.55), 5.95, 0, stTrimRedMat, { collide: false });
  };
  buildPorticoArchedWall(-56.2, 'portico_e');
  buildPorticoArchedWall(-65.8, 'portico_w');

  // Portico White & Red Facade Name Plaques ("AGRA CANTT / आगरा छावनी / آگرہ چھاؤنی") above the 3 Arches
  [-7.0, 0.0, 7.0].forEach((pz) => {
    pushStaticGeo(unitBoxGeo, stBoardCanttMat, -55.76, 4.95, pz, 0, 0, 0, 0.08, 0.95, 3.4, false, false);
  });

  // Portico Roof Slab (walkable at y = 6.20m)
  addBox(worldGroup, 10.6, 0.34, 22.8, -61.0, 6.03, 0, stBrickWhiteMat, {
    collide: true,
    mantleable: true,
    blocksZombies: true,
    id: 'station_portico_roof',
  });
  // Portico Roof Parapet Trim
  addBox(worldGroup, 0.28, 0.72, 22.8, -56.1, 6.56, 0, stBrickWhiteMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.28, 0.72, 22.8, -65.9, 6.56, 0, stBrickWhiteMat, { collide: true, mantleable: true });

  // Overhead Black Steel Truss + Deep Blue "उत्तर मध्य रेलवे / आगरा छावनी" Signboard (image_49628ea6.png)
  [-56.4, -57.1].forEach((tx) => {
    [-6.6, -2.2, 2.2, 6.6].forEach((tz) => {
      pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 7.65, tz, 0, 0, 0, 0.14, 2.6, 0.14, true, true);
    });
    pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 8.95, 0, 0, 0, 0, 0.14, 0.16, 13.6, false, false);
    pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 6.42, 0, 0, 0, 0, 0.14, 0.16, 13.6, false, false);
  });
  pushStaticGeo(unitBoxGeo, stFacadeNcrMat, -56.28, 7.68, 0, 0, 0, 0, 0.16, 2.25, 11.4, false, false);

  // 3 Crowning Red Terracotta Chhatri Cupolas on Station Portico Roof (image_49628ea6.png)
  const buildStationChhatri = (cx: number, cy: number, cz: number, scale: number) => {
    // Pedestal base
    pushStaticGeo(unitBoxGeo, stBrickWhiteMat, cx, cy + 0.35 * scale, cz, 0, 0, 0, 1.9 * scale, 0.7 * scale, 1.9 * scale, true, true);
    // 4 Red sandstone colonnettes
    [
      [-0.65, -0.65],
      [0.65, -0.65],
      [-0.65, 0.65],
      [0.65, 0.65],
    ].forEach(([ox, oz]) => {
      pushStaticGeo(
        trackGeo(new THREE.CylinderGeometry(0.11 * scale, 0.13 * scale, 1.45 * scale, 8)),
        stChhatriMat,
        cx + ox * scale,
        cy + 1.42 * scale,
        cz + oz * scale,
        0,
        0,
        0,
        1,
        1,
        1,
        true,
        true,
      );
    });
    // Flared Chhajja eave ring
    pushStaticGeo(
      trackGeo(new THREE.CylinderGeometry(1.05 * scale, 1.55 * scale, 0.32 * scale, 8)),
      stChhatriMat,
      cx,
      cy + 2.25 * scale,
      cz,
      0,
      Math.PI / 8,
      0,
      1,
      1,
      1,
      true,
      true,
    );
    // Ribbed dome + kalash finial
    pushStaticGeo(
      trackGeo(new THREE.SphereGeometry(0.92 * scale, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.68)),
      stChhatriMat,
      cx,
      cy + 2.55 * scale,
      cz,
      0,
      0,
      0,
      1,
      1.15,
      1,
      true,
      true,
    );
    pushStaticGeo(
      trackGeo(new THREE.ConeGeometry(0.16 * scale, 0.65 * scale, 8)),
      goldMat,
      cx,
      cy + 3.85 * scale,
      cz,
      0,
      0,
      0,
      1,
      1,
      1,
      false,
      false,
    );
  };
  buildStationChhatri(-61.0, 6.2, 0, 1.38);    // Grand Center Chhatri
  buildStationChhatri(-60.4, 6.2, -8.2, 0.88); // North Chhatri
  buildStationChhatri(-60.4, 6.2, 8.2, 0.88);  // South Chhatri

  // Colonial Red-Brick North & South Station Wings (z = -34..-11.2 & z = +11.2..+34, walkable indoors!)
  const buildColonialWing = (zMin: number, zMax: number, wingPrefix: string, doorZ: number, doorOpenSign: 1 | -1) => {
    const zMid = (zMin + zMax) * 0.5;
    const len = zMax - zMin;
    // East Red-Brick Facade with white-bordered arched window recesses
    addBox(worldGroup, 0.5, 5.95, len, -56.25, 3.22, zMid, stBrickRedMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
      id: `${wingPrefix}_east_wall`,
    });
    for (let wz = zMin + 3.2; wz <= zMax - 3.0; wz += 4.2) {
      pushStaticGeo(unitBoxGeo, stBrickWhiteMat, -55.94, 3.1, wz, 0, 0, 0, 0.14, 2.7, 2.25, false, false);
      pushStaticGeo(unitBoxGeo, tealWindowMat, -55.86, 2.95, wz, 0, 0, 0, 0.08, 2.2, 1.5, false, false);
    }
    // White colonial cornice along roofline
    addBox(worldGroup, 0.9, 0.34, len + 0.4, -56.2, 6.1, zMid, stBrickWhiteMat, { collide: false });

    // West Platform Wall (x = -65.75) leaving a wide open platform exit at z = zMid - 1.4 .. zMid + 1.4
    addBox(worldGroup, 0.5, 5.95, len * 0.5 - 1.5, -65.75, 3.22, zMin + (len * 0.5 - 1.5) * 0.5, stBrickRedMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });
    addBox(worldGroup, 0.5, 5.95, len * 0.5 - 1.5, -65.75, 3.22, zMax - (len * 0.5 - 1.5) * 0.5, stBrickRedMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });
    addBox(worldGroup, 0.5, 2.6, 3.2, -65.75, 4.9, zMid, stBrickRedMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });

    // Outer Wing End Wall (North at -34 or South at +34)
    const outerZ = zMin < 0 ? zMin : zMax;
    addBox(worldGroup, 9.8, 5.95, 0.5, -61.0, 3.22, outerZ, stBrickRedMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });

    // Interior Partition Wall between Central Concourse & Wing (with Interactive Door!)
    addBox(worldGroup, 4.2, 5.95, 0.4, -58.4, 3.22, doorZ, stBrickWhiteMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });
    addBox(worldGroup, 3.8, 5.95, 0.4, -63.8, 3.22, doorZ, stBrickWhiteMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });
    addBox(worldGroup, 2.0, 3.2, 0.4, -61.2, 4.6, doorZ, stBrickWhiteMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
    });
    registerInteractiveDoor({
      id: `${wingPrefix}_door`,
      label: wingPrefix === 'st_n_wing' ? 'Executive Lounge Door' : 'Station Waiting Hall Door',
      x: -61.2,
      yBase: 0.25,
      z: doorZ,
      width: 1.48,
      height: 2.68,
      axis: 'x',
      doubleLeaf: false,
      openSign: doorOpenSign,
    });

    // Walkable Wing Roof + Pitched Red Colonial Gable Caps
    addBox(worldGroup, 10.2, 0.34, len, -61.0, 6.03, zMid, stRoofTileMat, {
      collide: true,
      mantleable: true,
      blocksZombies: true,
      id: `${wingPrefix}_roof`,
    });
    pushStaticGeo(unitBoxGeo, stRoofTileMat, -61.0, 6.9, zMid, 0, 0, 0.32, 5.4, 0.25, len - 0.4, true, true);
    pushStaticGeo(unitBoxGeo, stRoofTileMat, -61.0, 6.9, zMid, 0, 0, -0.32, 5.4, 0.25, len - 0.4, true, true);
  };
  buildColonialWing(-34.0, -11.3, 'st_n_wing', -11.3, -1);
  buildColonialWing(11.3, 34.0, 'st_s_wing', 11.3, 1);

  // Heritage Red Colonial Turret Clock Tower at South Wing Corner (x = -60.5, z = +31.0, image_b58851a5.png)
  addBox(worldGroup, 6.2, 9.6, 5.8, -60.5, 4.8, 31.0, stBrickRedMat, { collide: false });
  pushStaticGeo(trackGeo(new THREE.ConeGeometry(4.2, 3.2, 4)), stRoofTileMat, -60.5, 11.2, 31.0, 0, Math.PI / 4, 0, 1, 1, 1, true, true);
  pushStaticGeo(unitBoxGeo, stBrickWhiteMat, -57.3, 8.2, 31.0, 0, 0, 0, 0.14, 1.3, 1.3, false, false);

  // Concourse & Waiting Hall Interiors: Ticket Counter, Benches, Digital LED Clock 17:44, Executive Lounge Sign (image_f9525a35.png)
  addBox(worldGroup, 1.4, 1.15, 7.5, -58.2, 0.82, -20.5, stPlinthMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.22, 1.5, 7.4, -58.2, 2.15, -20.5, darkMetalMat, { collide: true, mantleable: false });
  // Waiting benches inside South Waiting Room & Central Concourse
  [
    [-61.5, 18.0],
    [-61.5, 24.0],
    [-58.6, 3.5],
    [-58.6, -3.5],
  ].forEach(([bx, bz]) => {
    addBox(worldGroup, 0.72, 0.48, 2.6, bx, 0.49, bz, stRailSteelMat, { collide: true, mantleable: true });
    addBox(worldGroup, 0.12, 0.52, 2.6, bx + 0.3, 0.92, bz, stRailSteelMat, { collide: false });
  });
  // Hanging Concourse LED Clock "17:44" + Yellow "EXECUTIVE LOUNGE" Board
  pushStaticGeo(unitBoxGeo, darkMetalMat, -61.0, 4.85, 0, 0, 0, 0, 0.16, 0.8, 0.16, false, false);
  pushStaticGeo(unitBoxGeo, stClock1744Mat, -61.0, 4.35, 0, 0, 0, 0, 1.95, 0.76, 0.24, false, false);
  pushStaticGeo(unitBoxGeo, stExecSignMat, -61.0, 4.35, -6.5, 0, 0, 0, 0.18, 1.45, 2.1, false, false);
  const concourseLight = new THREE.PointLight(0xffe7c2, 3.6, 28, 1.4);
  concourseLight.castShadow = false;
  concourseLight.position.set(-61.0, 4.9, 0);
  worldGroup.add(concourseLight);

  // Ramp steps from Concourse Floor (x = -64.4, y = 0.25) -> Platform 1 (x = -66.5, y = 1.05) across all 3 arch bays
  for (let i = 0; i < 4; i++) {
    const sy = THREE.MathUtils.lerp(0.25, 1.05, (i + 1) / 4);
    const sx = THREE.MathUtils.lerp(-64.4, -66.2, (i + 0.5) / 4);
    pushStaticGeo(unitBoxGeo, stPlinthMat, sx, sy * 0.5, 0, 0, 0, 0, 0.46, sy, 20.5, true, true);
    pushStaticGeo(unitBoxGeo, stPlinthMat, sx, sy * 0.5, -22.5, 0, 0, 0, 0.46, sy, 4.0, true, true);
    pushStaticGeo(unitBoxGeo, stPlinthMat, sx, sy * 0.5, 22.5, 0, 0, 0, 0.46, sy, 4.0, true, true);
  }
  [
    [-10.2, 10.2, 'st_p1_ramp_main'],
    [-24.5, -20.5, 'st_p1_ramp_n'],
    [20.5, 24.5, 'st_p1_ramp_s'],
  ].forEach(([z0, z1, rid]) => {
    colliders.push({
      id: rid as string,
      minX: -66.3,
      maxX: -64.4,
      minY: 0.2,
      maxY: 1.12,
      minZ: z0 as number,
      maxZ: z1 as number,
      mantleable: false,
      blocksZombies: false,
      ramp: { axis: 'x', lowCoord: -64.4, highCoord: -66.3, lowY: 0.25, highY: 1.05 },
    });
  });

  // 3) PLATFORM 1 (x = -66.0 .. -76.2, z = -46 .. +46, top y = 1.05m) & ISLAND PLATFORM 2 (x = -90.0 .. -100.0, top y = 1.05m)
  const buildRailwayPlatform = (id: string, pxMin: number, pxMax: number, tactileEdges: Array<number>) => {
    const pw = pxMax - pxMin;
    const pMid = (pxMin + pxMax) * 0.5;
    addBox(worldGroup, pw, 1.05, 92.0, pMid, 0.525, 0, stPlatformDeckMat, {
      collide: true,
      mantleable: true,
      blocksZombies: true,
      id,
    });
    // Yellow tactile coping edge strips
    tactileEdges.forEach((ex) => {
      pushStaticGeo(unitBoxGeo, stTactileYellowMat, ex, 1.058, 0, 0, 0, 0, 0.42, 0.018, 91.6, false, true);
    });
    // End ramps down to track ballast at z = ±46..±49.5
    [
      { z0: -49.5, z1: -46.0, low: -49.5, high: -46.0 },
      { z0: 46.0, z1: 49.5, low: 49.5, high: 46.0 },
    ].forEach((er, idx) => {
      for (let s = 0; s < 5; s++) {
        const sy = THREE.MathUtils.lerp(0.0, 1.05, (s + 1) / 5);
        const sz = THREE.MathUtils.lerp(er.low, er.high, (s + 0.5) / 5);
        pushStaticGeo(unitBoxGeo, stPlatformDeckMat, pMid, sy * 0.5, sz, 0, 0, 0, pw * 0.72, sy, 0.72, true, true);
      }
      colliders.push({
        id: `${id}_end_ramp_${idx}`,
        minX: pMid - pw * 0.36,
        maxX: pMid + pw * 0.36,
        minY: 0,
        maxY: 1.1,
        minZ: er.z0,
        maxZ: er.z1,
        mantleable: false,
        blocksZombies: false,
        ramp: { axis: 'z', lowCoord: er.low, highCoord: er.high, lowY: 0, highY: 1.05 },
      });
    });
  };
  buildRailwayPlatform('platform_1', -76.2, -66.0, [-75.9]);
  buildRailwayPlatform('platform_2', -100.0, -90.0, [-90.3, -99.7]);

  // Platform Canopy Sheds + H-Columns + LED Strips + Spinning Ceiling Fans (image_73862bf9.png & image_f9525a35.png)
  const stPlatformFans: THREE.Group[] = [];
  const buildPlatformCanopy = (centerX: number, width: number, zMin: number, zMax: number, fanZList: number[]) => {
    const len = zMax - zMin;
    const zMid = (zMin + zMax) * 0.5;
    // Central H-pillar columns & transverse steel trusses every 12m
    for (let pz = zMin + 4; pz <= zMax - 4; pz += 12) {
      pushStaticGeo(unitBoxGeo, stPlinthMat, centerX, 1.32, pz, 0, 0, 0, 0.85, 0.55, 0.85, true, true);
      pushStaticGeo(unitBoxGeo, chromeMat, centerX, 3.45, pz, 0, 0, 0, 0.34, 4.4, 0.34, true, true);
      pushStaticGeo(unitBoxGeo, darkMetalMat, centerX, 5.42, pz, 0, 0, 0, width - 0.5, 0.16, 0.22, false, false);
    }
    // Pitched corrugated steel canopy roof (walkable at y = 5.75m!)
    addBox(worldGroup, width * 0.52, 0.14, len, centerX - width * 0.25, 5.65, zMid, stCanopySheetMat, {
      collide: true,
      mantleable: true,
      rotZ: 0.08,
    });
    addBox(worldGroup, width * 0.52, 0.14, len, centerX + width * 0.25, 5.65, zMid, stCanopySheetMat, {
      collide: true,
      mantleable: true,
      rotZ: -0.08,
    });
    // Overhead longitudinal LED lighting strips + Spinning platform ceiling fans
    for (let lz = zMin + 5; lz <= zMax - 5; lz += 8) {
      pushStaticGeo(unitBoxGeo, stLedTubeMat, centerX - 1.6, 5.28, lz, 0, 0, 0, 0.14, 0.08, 2.2, false, false);
      pushStaticGeo(unitBoxGeo, stLedTubeMat, centerX + 1.6, 5.28, lz, 0, 0, 0, 0.14, 0.08, 2.2, false, false);
    }
    fanZList.forEach((fz) => {
      const fGrp = new THREE.Group();
      fGrp.position.set(centerX, 4.88, fz);
      worldGroup.add(fGrp);
      const rod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 6)), darkMetalMat);
      rod.position.y = 0.32;
      fGrp.add(rod);
      const hub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10)), darkMetalMat);
      fGrp.add(hub);
      for (let b = 0; b < 3; b++) {
        const bl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.02, 0.14)), chromeMat);
        const ang = (b / 3) * Math.PI * 2;
        bl.position.set(Math.cos(ang) * 0.45, 0, Math.sin(ang) * 0.45);
        bl.rotation.y = -ang;
        fGrp.add(bl);
      }
      stPlatformFans.push(fGrp);
    });
  };
  buildPlatformCanopy(-71.0, 9.6, -34, 34, [-22, -10, 14, 26]);
  buildPlatformCanopy(-95.0, 9.4, -34, 34, [-22, -10, 14, 26]);

  // Platform 1 LED Digital Clock "12:07", Chai Stall, Rolling Luggage Trolley (image_73862bf9.png)
  pushStaticGeo(unitBoxGeo, stClock1207Mat, -71.0, 4.35, -14.0, 0, Math.PI / 2, 0, 1.8, 0.68, 0.22, false, false);
  const p1Light = new THREE.PointLight(0xe0f2fe, 2.8, 28, 1.5);
  p1Light.castShadow = false;
  p1Light.position.set(-71.0, 4.8, -14.0);
  worldGroup.add(p1Light);
  const p2Light = new THREE.PointLight(0xe0f2fe, 2.5, 28, 1.5);
  p2Light.castShadow = false;
  p2Light.position.set(-95.0, 4.8, -12.0);
  worldGroup.add(p2Light);

  // Refreshment Chai/Book Stall & Blue Rolling Trolley on Platform 1
  addBox(worldGroup, 2.2, 2.4, 3.8, -68.2, 2.25, -24.5, stFobBlueMat, { collide: true, mantleable: true });
  addBox(worldGroup, 2.4, 0.18, 4.0, -68.2, 3.5, -24.5, stFobYellowMat, { collide: false });
  addBox(worldGroup, 0.9, 0.72, 1.4, -72.8, 1.41, -18.5, stFobBlueMat, { collide: true, mantleable: true });
  addBox(worldGroup, 0.8, 0.25, 1.2, -72.8, 1.9, -18.5, woodMat, { collide: false });

  // ICONIC YELLOW PLATFORM SIGNBOARDS:
  // A) "आगरा छावनी / AGRA CANTT / M.S.L. 167.30 M." on Platform 1 North End (image_b7206d60.png)
  pushStaticGeo(unitBoxGeo, stFobYellowMat, -71.0, 2.95, -41.3, 0, 0, 0, 0.14, 3.8, 0.14, true, true);
  pushStaticGeo(unitBoxGeo, stFobYellowMat, -71.0, 2.95, -37.7, 0, 0, 0, 0.14, 3.8, 0.14, true, true);
  addBox(worldGroup, 0.16, 1.85, 3.7, -71.0, 3.9, -39.5, stBoardCanttMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
  });

  // B) "आगरा शहर / AGRA CITY" on Platform 2 Concrete Plinths (image_9dc66cab.png)
  [-41.0, -38.0].forEach((bz) => {
    pushStaticGeo(unitBoxGeo, stBrickWhiteMat, -95.0, 1.32, bz, 0, 0, 0, 0.55, 0.55, 0.55, true, true);
    pushStaticGeo(unitBoxGeo, stFobYellowMat, -95.0, 2.55, bz, 0, 0, 0, 0.12, 2.2, 0.12, true, true);
  });
  addBox(worldGroup, 0.14, 1.55, 3.1, -95.0, 3.15, -39.5, stBoardCityMat, {
    collide: true,
    mantleable: false,
    blocksZombies: true,
  });

  // 4) WALKABLE STEEL FOOT-OVERBRIDGE (FOB) WITH BLUE & YELLOW STRIPED STAIRCASES (z = -5.6..-1.6, x = -69.5..-96.5, deck y = 6.8m)
  const buildFobStaircase = (sx: number, idPrefix: string) => {
    const lowZ = 7.6;
    const highZ = -1.6;
    const lowY = 1.05;
    const highY = 6.80;
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      const stepY = THREE.MathUtils.lerp(lowY, highY, t);
      const stepZ = THREE.MathUtils.lerp(lowZ, highZ, (i + 0.5) / steps);
      const stepMat = i % 2 === 0 ? stFobBlueMat : stFobYellowMat;
      pushStaticGeo(unitBoxGeo, stepMat, sx, stepY - 0.14, stepZ, 0, 0, 0, 2.4, 0.28, 0.6, true, true);
    }
    // Handrails flanking staircase
    [-1.24, 1.24].forEach((ox) => {
      pushStaticGeo(unitBoxGeo, stFobBlueMat, sx + ox, 4.45, 3.0, -0.56, 0, 0, 0.08, 0.1, 10.9, false, false);
    });
    colliders.push({
      id: idPrefix,
      minX: sx - 1.2,
      maxX: sx + 1.2,
      minY: 1.0,
      maxY: 6.9,
      minZ: highZ,
      maxZ: lowZ,
      mantleable: false,
      blocksZombies: false,
      ramp: { axis: 'z', lowCoord: lowZ, highCoord: highZ, lowY, highY },
    });
  };
  buildFobStaircase(-71.0, 'fob_stair_p1');
  buildFobStaircase(-95.0, 'fob_stair_p2');

  // FOB Bridge Deck & Truss Overpass spanning Tracks 1 & 2 (x = -69.5..-96.5, z = -5.4..-1.6, deck y = 6.80m)
  addBox(worldGroup, 27.6, 0.28, 3.8, -83.0, 6.66, -3.5, stPlatformDeckMat, {
    collide: true,
    mantleable: true,
    blocksZombies: true,
    id: 'fob_overpass_deck',
  });
  // Lattice safety parapets & arched corrugated roof over FOB
  [-5.35, -1.65].forEach((fz) => {
    addBox(worldGroup, 27.4, 1.15, 0.12, -83.0, 7.38, fz, stFobBlueMat, { collide: true, mantleable: false });
    for (let tx = -96.0; tx <= -70.0; tx += 2.6) {
      pushStaticGeo(unitBoxGeo, chromeMat, tx, 8.2, fz, 0, 0, 0, 0.12, 2.8, 0.12, false, false);
    }
  });
  addBox(worldGroup, 28.0, 0.16, 4.3, -83.0, 9.65, -3.5, stCanopySheetMat, {
    collide: true,
    mantleable: true,
  });
  // Parkour Bridge & Zipline linking bldg_w2 rooftop (x=-27.5, y=5.8, z=3) -> Station Portico Roof (x=-56, y=6.2, z=3) -> Platform 1 Canopy (y=5.7)
  addZipline('zip_bazaar_to_station', -32.2, 5.8, 3.0, -56.4, 6.2, 3.0);
  addBox(worldGroup, 2.8, 0.22, 3.2, -66.8, 5.95, 2.0, woodMat, {
    collide: true,
    mantleable: true,
    id: 'bridge_portico_to_p1_canopy',
  });
  pushStaticGeo(smudgeGeoZ, parkourSmudgeMat, -66.8, 6.08, 2.0, 0, 0, 0, 1, 1, 2.2, false, false);

  // 5) 3 BALLASTED BROAD-GAUGE TRACKS & 25kV OHE CATENARY SYSTEM
  const trackXs = [-78.8, -87.2, -102.6];
  trackXs.forEach((tx) => {
    // Crushed granite ballast strip
    pushStaticGeo(unitBoxGeo, stBallastMat, tx, 0.08, 0, 0, 0, 0, 4.2, 0.16, 102.0, false, true);
    // Sleepers every 1.4m
    for (let sz = -48; sz <= 48; sz += 1.4) {
      pushStaticGeo(unitBoxGeo, stSleeperMat, tx, 0.19, sz, 0, 0, 0, 2.55, 0.12, 0.24, false, true);
    }
    // Twin steel rails (1.676m broad gauge)
    [-0.84, 0.84].forEach((rx) => {
      pushStaticGeo(unitBoxGeo, stRailSteelMat, tx + rx, 0.3, 0, 0, 0, 0, 0.08, 0.14, 102.0, false, true);
    });
  });

  // 25kV OHE Masts & Overhead Catenary Wires (along x = -83.0 between Tracks 1 & 2, and x = -105.4 west of Track 3)
  for (let mz = -40; mz <= 40; mz += 16) {
    if (Math.abs(mz + 3.5) < 4) continue; // skip mast directly inside FOB deck
    // Central H-mast serving Track 1 (-78.8) and Track 2 (-87.2)
    pushStaticGeo(unitBoxGeo, chromeMat, -83.0, 3.3, mz, 0, 0, 0, 0.22, 6.6, 0.22, true, true);
    pushStaticGeo(unitBoxGeo, chromeMat, -78.8, 5.65, mz, 0, 0, 0, 8.6, 0.09, 0.09, false, false);
    pushStaticGeo(unitBoxGeo, chromeMat, -87.2, 5.65, mz, 0, 0, 0, 8.6, 0.09, 0.09, false, false);
    // West mast serving Track 3 (-102.6)
    pushStaticGeo(unitBoxGeo, chromeMat, -105.4, 3.3, mz, 0, 0, 0, 0.22, 6.6, 0.22, true, true);
    pushStaticGeo(unitBoxGeo, chromeMat, -104.0, 5.65, mz, 0, 0, 0, 3.0, 0.09, 0.09, false, false);
  }
  trackXs.forEach((tx) => {
    pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 5.35, 0, 0, 0, 0, 0.03, 0.03, 98.0, false, false);
    pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 6.05, 0, 0, 0, 0, 0.025, 0.025, 98.0, false, false);
  });

  // 6) 3 DETAILED INDIAN RAILWAYS TRAINS (Locomotives + Walkable Coupled Passenger Coaches)
  const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 12));
  const locoHornGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.14, 0.35, 8));

  const buildLocomotive = (tx: number, zCenter: number, bodyMat: THREE.Material, stripeMat: THREE.Material, facingNorth: boolean) => {
    const dir = facingNorth ? -1 : 1;
    // Heavy underframe chassis & cowcatcher
    addBox(worldGroup, 2.86, 0.65, 12.6, tx, 0.85, zCenter, stVestibuleMat, {
      collide: true,
      mantleable: true,
      blocksZombies: true,
    });
    pushStaticGeo(unitBoxGeo, stLocoSaffronMat, tx, 0.56, zCenter + dir * 6.55, dir * 0.32, 0, 0, 2.75, 0.48, 0.55, true, true);
    // Two 6-wheel bogies (3 axles per side = 6 wheels visible per side)
    [-3.6, 3.6].forEach((bz) => {
      pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 0.52, zCenter + bz, 0, 0, 0, 2.35, 0.28, 3.5, true, true);
      [-1.1, 0, 1.1].forEach((wz) => {
        [-0.95, 0.95].forEach((wx) => {
          pushStaticGeo(wheelGeo, stRailSteelMat, tx + wx, 0.52, zCenter + bz + wz, 0, 0, Math.PI / 2, 1, 1, 1, true, true);
        });
      });
    });
    // Locomotive main hood body (walkable top at y = 3.88m!)
    addBox(worldGroup, 2.88, 2.65, 12.2, tx, 2.5, zCenter, bodyMat, {
      collide: true,
      mantleable: true,
      blocksZombies: true,
    });
    // Racing stripe + front cab windshields + glowing twin headlight
    pushStaticGeo(unitBoxGeo, stripeMat, tx, 2.25, zCenter, 0, 0, 0, 2.94, 0.34, 12.24, false, false);
    [-0.65, 0.65].forEach((wx) => {
      pushStaticGeo(unitBoxGeo, tealWindowMat, tx + wx, 2.95, zCenter + dir * 6.13, 0, 0, 0, 0.78, 0.68, 0.08, false, false);
    });
    pushStaticGeo(unitBoxGeo, stLedTubeMat, tx, 2.15, zCenter + dir * 6.14, 0, 0, 0, 0.56, 0.28, 0.08, false, false);
    // Roof equipment + twin Diamond Pantograph raised toward 25kV OHE wire
    pushStaticGeo(unitBoxGeo, stCoachRoofMat, tx, 3.92, zCenter, 0, 0, 0, 2.55, 0.22, 11.4, true, true);
    pushStaticGeo(locoHornGeo, stRailSteelMat, tx - 0.35, 4.18, zCenter + dir * 4.4, Math.PI / 2, 0, 0, 1, 1, 1, false, false);
    [-3.2, 3.2].forEach((pz) => {
      pushStaticGeo(unitBoxGeo, stLocoSaffronMat, tx, 4.42, zCenter + pz, 0.58, 0, 0, 0.08, 1.05, 0.08, false, false);
      pushStaticGeo(unitBoxGeo, stLocoSaffronMat, tx, 4.86, zCenter + pz, -0.58, 0, 0, 0.08, 1.05, 0.08, false, false);
      pushStaticGeo(unitBoxGeo, stRailSteelMat, tx, 5.26, zCenter + pz, 0, 0, 0, 1.7, 0.06, 0.18, false, false);
    });
  };

  const buildWalkableCoach = (opts: {
    id: string;
    tx: number;
    zCenter: number;
    length: number;
    liveryMat: THREE.Material;
    berthMat: THREE.Material;
    interactiveDoors?: boolean;
    medkitInside?: boolean;
  }) => {
    const { id, tx, zCenter, length, liveryMat, berthMat, interactiveDoors = false, medkitInside = false } = opts;
    const halfL = length * 0.5;
    // Bogies & flanged steel wheels
    [-halfL + 3.0, halfL - 3.0].forEach((bz) => {
      pushStaticGeo(unitBoxGeo, darkMetalMat, tx, 0.52, zCenter + bz, 0, 0, 0, 2.3, 0.28, 2.8, true, true);
      [-0.88, 0.88].forEach((wz) => {
        [-0.95, 0.95].forEach((wx) => {
          pushStaticGeo(wheelGeo, stRailSteelMat, tx + wx, 0.52, zCenter + bz + wz, 0, 0, Math.PI / 2, 1, 1, 1, true, true);
        });
      });
    });

    // Underframe & Coach Floor (walkable at y = 1.18m!)
    addBox(worldGroup, 2.88, 0.52, length, tx, 0.92, zCenter, stVestibuleMat, {
      collide: true,
      mantleable: false,
      blocksZombies: true,
      id: `${id}_floor`,
    });
    pushStaticGeo(unitBoxGeo, stCoachInteriorMat, tx, 1.186, zCenter, 0, 0, 0, 2.55, 0.014, length - 0.2, false, true);

    // Boarding metal steps on East & West doorways (near ends of coach, matching image_2b80f84f.png!)
    [-halfL + 1.65, halfL - 1.65].forEach((dz) => {
      [-1.48, 1.48].forEach((sx) => {
        pushStaticGeo(unitBoxGeo, darkMetalMat, tx + sx, 0.98, zCenter + dz, 0, 0, 0, 0.28, 0.08, 1.15, true, true);
        pushStaticGeo(unitBoxGeo, darkMetalMat, tx + sx * 0.98, 0.72, zCenter + dz, 0, 0, 0, 0.24, 0.08, 1.15, true, true);
      });
    });

    // Side Walls with open 1.3m Vestibule Doorways near North & South ends (walk straight in from Platform!)
    const midWallLen = length - 5.2;
    [-1.38, 1.38].forEach((wx, sideIdx) => {
      // Main passenger cabin sidewall (center)
      addBox(worldGroup, 0.14, 2.48, midWallLen, tx + wx, 2.42, zCenter, liveryMat, {
        collide: true,
        mantleable: false,
        blocksZombies: true,
      });
      // End vestibule corner pillars
      addBox(worldGroup, 0.14, 2.48, 0.95, tx + wx, 2.42, zCenter - halfL + 0.48, liveryMat, {
        collide: true,
        mantleable: false,
        blocksZombies: true,
      });
      addBox(worldGroup, 0.14, 2.48, 0.95, tx + wx, 2.42, zCenter + halfL - 0.48, liveryMat, {
        collide: true,
        mantleable: false,
        blocksZombies: true,
      });
      // Door lintels above the 1.6m doorway gaps
      addBox(worldGroup, 0.14, 0.36, 1.7, tx + wx, 3.48, zCenter - halfL + 1.75, liveryMat, { collide: false });
      addBox(worldGroup, 0.14, 0.36, 1.7, tx + wx, 3.48, zCenter + halfL - 1.75, liveryMat, { collide: false });

      if (interactiveDoors && sideIdx === 1) {
        registerInteractiveDoor({
          id: `${id}_door_n`,
          label: `Coach ${id.toUpperCase()} Door`,
          x: tx + wx,
          yBase: 1.18,
          z: zCenter - halfL + 1.75,
          width: 1.28,
          height: 2.12,
          axis: 'z',
          doubleLeaf: false,
          openSign: 1,
        });
      }
    });

    // End Bulkheads with open central vestibule corridor (width 1.1m so you can walk coach-to-coach!)
    [-halfL + 0.08, halfL - 0.08].forEach((ez) => {
      addBox(worldGroup, 0.9, 2.48, 0.14, tx - 0.96, 2.42, zCenter + ez, liveryMat, {
        collide: true,
        mantleable: false,
        blocksZombies: true,
      });
      addBox(worldGroup, 0.9, 2.48, 0.14, tx + 0.96, 2.42, zCenter + ez, liveryMat, {
        collide: true,
        mantleable: false,
        blocksZombies: true,
      });
      addBox(worldGroup, 1.1, 0.42, 0.14, tx, 3.45, zCenter + ez, liveryMat, { collide: false });
    });

    // Interior Sleeper Berths & Seats flanking 0.95m Central Walkable Aisle
    for (let bz = zCenter - halfL + 3.2; bz <= zCenter + halfL - 3.2; bz += 2.2) {
      [-0.86, 0.86].forEach((bx) => {
        // Lower cushioned berth
        addBox(worldGroup, 0.78, 0.42, 0.95, tx + bx, 1.4, bz, berthMat, { collide: true, mantleable: true });
        // Upper folding berth
        pushStaticGeo(unitBoxGeo, berthMat, tx + bx, 2.52, bz, 0, 0, 0, 0.72, 0.12, 0.92, false, true);
      });
    }

    // Climbable Curved Coach Roof (y = 3.74..3.94m) + Roof Ventilator Cowls + Parkour Smudge
    addBox(worldGroup, 2.94, 0.22, length + 0.1, tx, 3.78, zCenter, stCoachRoofMat, {
      collide: true,
      mantleable: true,
      blocksZombies: true,
      id: `${id}_roof`,
    });
    for (let vz = zCenter - halfL + 2.4; vz <= zCenter + halfL - 2.4; vz += 3.6) {
      pushStaticGeo(unitBoxGeo, chromeMat, tx, 3.96, vz, 0, 0, 0, 0.56, 0.14, 0.62, false, true);
    }
    pushStaticGeo(smudgeGeoZ, parkourSmudgeMat, tx + 1.35, 3.905, zCenter, 0, 0, 0, 1, 1, 2.4, false, false);

    if (medkitInside) {
      addInteractiveMedkit(tx + 0.85, 1.72, zCenter + 1.1);
    }
  };

  const addGangwayVestibule = (tx: number, zCenter: number) => {
    // Hollow accordion rubber tunnel connecting adjacent coaches (floor walkable at y = 1.18m)
    addBox(worldGroup, 1.25, 0.46, 1.1, tx, 0.95, zCenter, stVestibuleMat, { collide: true, mantleable: false });
    pushStaticGeo(unitBoxGeo, stVestibuleMat, tx - 0.62, 2.38, zCenter, 0, 0, 0, 0.12, 2.38, 1.05, true, true);
    pushStaticGeo(unitBoxGeo, stVestibuleMat, tx + 0.62, 2.38, zCenter, 0, 0, 0, 0.12, 2.38, 1.05, true, true);
    pushStaticGeo(unitBoxGeo, stVestibuleMat, tx, 3.55, zCenter, 0, 0, 0, 1.32, 0.14, 1.05, false, false);
  };

  // TRAIN A (Track 1, x = -78.8, right along Platform 1!): Electric Loco + Blue ICF Coaches S5, S6, S7
  buildLocomotive(-78.8, -32.0, stIcfBlueMat, stLocoSaffronMat, true);
  buildWalkableCoach({ id: 's5', tx: -78.8, zCenter: -17.0, length: 15.6, liveryMat: stIcfBlueMat, berthMat: stBerthBlueMat });
  addGangwayVestibule(-78.8, -8.7);
  buildWalkableCoach({ id: 's6', tx: -78.8, zCenter: -0.4, length: 15.6, liveryMat: stIcfBlueMat, berthMat: stBerthBlueMat, interactiveDoors: true });
  addGangwayVestibule(-78.8, 7.9);
  buildWalkableCoach({ id: 's7', tx: -78.8, zCenter: 16.2, length: 15.6, liveryMat: stIcfBlueMat, berthMat: stBerthBlueMat, interactiveDoors: true, medkitInside: true });
  const trainInteriorLight = new THREE.PointLight(0xfff3d6, 2.4, 24, 1.5);
  trainInteriorLight.castShadow = false;
  trainInteriorLight.position.set(-78.8, 3.35, 16.2);
  worldGroup.add(trainInteriorLight);

  // TRAIN B (Track 2, x = -87.2, alongside Island Platform 2!): Cream & Maroon Express (image_73862bf9.png)
  buildLocomotive(-87.2, 31.5, stCreamExpressMat, stTrimRedMat, false);
  buildWalkableCoach({ id: 'b1', tx: -87.2, zCenter: 16.5, length: 15.4, liveryMat: stCreamExpressMat, berthMat: stBerthMaroonMat });
  addGangwayVestibule(-87.2, 8.3);
  buildWalkableCoach({ id: 'b2', tx: -87.2, zCenter: 0.1, length: 15.4, liveryMat: stCreamExpressMat, berthMat: stBerthMaroonMat });
  addGangwayVestibule(-87.2, -8.1);
  buildWalkableCoach({ id: 'b3', tx: -87.2, zCenter: -16.3, length: 15.4, liveryMat: stCreamExpressMat, berthMat: stBerthMaroonMat });

  // TRAIN C (Track 3, x = -102.6, west side of Platform 2!): Green & Yellow Garib Rath / Commuter (image_9dc66cab.png)
  buildLocomotive(-102.6, -31.0, stGaribGreenMat, stFobYellowMat, true);
  buildWalkableCoach({ id: 'g1', tx: -102.6, zCenter: -16.0, length: 15.4, liveryMat: stGaribGreenMat, berthMat: stBerthBlueMat });
  addGangwayVestibule(-102.6, -7.8);
  buildWalkableCoach({ id: 'g2', tx: -102.6, zCenter: 0.4, length: 15.4, liveryMat: stGaribGreenMat, berthMat: stBerthBlueMat });
  addGangwayVestibule(-102.6, 8.6);
  buildWalkableCoach({ id: 'g3', tx: -102.6, zCenter: 16.8, length: 15.4, liveryMat: stGaribGreenMat, berthMat: stBerthBlueMat });

  // Merge all static batches into ~25 draw calls!
  flushStaticBatches();

  // =========================================================================
  // 7C. SCULPTED 3D TACTICAL WATCHTOWER GUARD NPC ("HAVILDAR VIKRAM")
  // =========================================================================
  const guardGroup = new THREE.Group();
  const guardBaseYaw = -0.62; // Overlooks Taj UV gate & Charbagh courtyard
  guardGroup.position.set(wtX - 0.18, wtDeckY + 0.12, wtZ + 0.35);
  guardGroup.rotation.y = guardBaseYaw;
  worldGroup.add(guardGroup);

  const guardArmorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x36422c,
      roughness: 0.68,
      metalness: 0.18,
    }),
  );
  const guardFatigueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b5739,
      roughness: 0.84,
      metalness: 0.04,
    }),
  );
  const guardDarkGearMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b1f23,
      roughness: 0.54,
      metalness: 0.36,
    }),
  );
  const guardSkinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9e6f4d,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  const guardVisorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b1520,
      roughness: 0.14,
      metalness: 0.82,
    }),
  );
  const guardGunMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x252a30,
      roughness: 0.38,
      metalness: 0.76,
    }),
  );
  const guardBadgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x78350f,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    }),
  );

  // Sculpted lower body (boots, shins, knees, thighs, tactical belt & articulated hip weight-shift)
  const gThighGeo = trackGeo(new THREE.CapsuleGeometry(0.086, 0.34, 6, 14));
  gThighGeo.computeVertexNormals();
  const gShinGeo = trackGeo(new THREE.CapsuleGeometry(0.068, 0.34, 6, 14));
  gShinGeo.computeVertexNormals();
  const gBootGeo = trackGeo(new THREE.CapsuleGeometry(0.062, 0.12, 5, 12));
  gBootGeo.computeVertexNormals();
  const gPelvisGeo = trackGeo(new THREE.SphereGeometry(0.165, 16, 12));
  gPelvisGeo.computeVertexNormals();

  const guardLeftLeg: { thigh: THREE.Mesh; knee: THREE.Mesh; shin: THREE.Mesh }[] = [];
  [-0.135, 0.135].forEach((lx) => {
    const thigh = new THREE.Mesh(gThighGeo, guardFatigueMat);
    thigh.position.set(lx, 0.68, 0);
    thigh.rotation.z = lx < 0 ? 0.04 : -0.04;
    guardGroup.add(thigh);

    const kneePad = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.072, 12, 10)), guardDarkGearMat);
    kneePad.position.set(lx, 0.46, 0.025);
    kneePad.scale.set(0.95, 1.0, 0.85);
    guardGroup.add(kneePad);

    const shin = new THREE.Mesh(gShinGeo, guardFatigueMat);
    shin.position.set(lx, 0.27, -0.01);
    guardGroup.add(shin);

    const boot = new THREE.Mesh(gBootGeo, guardDarkGearMat);
    boot.rotation.x = Math.PI / 2;
    boot.position.set(lx, 0.06, 0.045);
    guardGroup.add(boot);

    guardLeftLeg.push({ thigh, knee: kneePad, shin });
  });

  const guardHipPivot = new THREE.Group();
  guardHipPivot.position.set(0, 0.89, 0);
  guardGroup.add(guardHipPivot);

  const pelvis = new THREE.Mesh(gPelvisGeo, guardFatigueMat);
  pelvis.scale.set(1.06, 0.72, 0.84);
  guardHipPivot.add(pelvis);

  const belt = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.175, 0.175, 0.06, 16)), guardDarkGearMat);
  belt.position.set(0, 0.06, 0);
  belt.scale.set(1.04, 1, 0.82);
  guardHipPivot.add(belt);

  // Articulated Upper Torso + Quarantine Plate Carrier + Head + Arms + M16 Rifle
  const guardTorsoPivot = new THREE.Group();
  guardTorsoPivot.position.set(0, 0.07, 0);
  guardHipPivot.add(guardTorsoPivot);

  const gTorsoGeo = trackGeo(new THREE.CapsuleGeometry(0.17, 0.34, 6, 16));
  gTorsoGeo.computeVertexNormals();
  const torso = new THREE.Mesh(gTorsoGeo, guardFatigueMat);
  torso.position.set(0, 0.26, 0);
  torso.scale.set(1.14, 1.0, 0.78);
  guardTorsoPivot.add(torso);

  // Olive Quarantine-Force Tactical Armor Vest + Shoulder Pads + Mag Pouches + Chest Binoculars
  const vestGeo = trackGeo(new THREE.CapsuleGeometry(0.185, 0.25, 6, 16));
  vestGeo.computeVertexNormals();
  const vest = new THREE.Mesh(vestGeo, guardArmorMat);
  vest.position.set(0, 0.28, 0.005);
  vest.scale.set(1.14, 1.02, 0.84);
  guardTorsoPivot.add(vest);

  const pouchGeo = trackGeo(new THREE.CapsuleGeometry(0.028, 0.06, 4, 8));
  [-0.08, 0, 0.08].forEach((px) => {
    const pouch = new THREE.Mesh(pouchGeo, guardDarkGearMat);
    pouch.position.set(px, 0.19, 0.155);
    guardTorsoPivot.add(pouch);
  });

  // Helper to build a pair of dual-barrel military field binoculars
  const createBinoculars = () => {
    const binoc = new THREE.Group();
    const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.026, 0.11, 10));
    const lensGeo = trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10));
    [-0.028, 0.028].forEach((bx) => {
      const tube = new THREE.Mesh(barrelGeo, guardDarkGearMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(bx, 0, 0);
      binoc.add(tube);
      const lens = new THREE.Mesh(lensGeo, guardVisorMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(bx, 0, 0.056);
      binoc.add(lens);
    });
    const bridge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.055, 0.016, 0.045)), guardGunMat);
    binoc.add(bridge);
    return binoc;
  };

  // Binoculars resting on chest sling when patrol-ready
  const chestBinoculars = createBinoculars();
  chestBinoculars.position.set(-0.08, 0.34, 0.175);
  chestBinoculars.rotation.set(Math.PI / 2 - 0.15, 0.22, -0.35);
  guardTorsoPivot.add(chestBinoculars);

  [-0.22, 0.22].forEach((sx) => {
    const pauldron = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.088, 12, 10)), guardArmorMat);
    pauldron.position.set(sx, 0.42, 0);
    pauldron.scale.set(0.9, 0.95, 0.95);
    guardTorsoPivot.add(pauldron);
  });
  const rankPatch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.02, 0.055, 0.055)), guardBadgeMat);
  rankPatch.position.set(-0.295, 0.39, 0);
  guardTorsoPivot.add(rankPatch);

  // Neck & Head Pivot (for natural courtyard scanning + watch checking)
  const neck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.058, 0.068, 0.11, 12)), guardSkinMat);
  neck.position.set(0, 0.51, 0.01);
  guardTorsoPivot.add(neck);

  const guardHeadPivot = new THREE.Group();
  guardHeadPivot.position.set(0, 0.57, 0.015);
  guardTorsoPivot.add(guardHeadPivot);

  const headGeo = trackGeo(new THREE.SphereGeometry(0.125, 16, 12));
  headGeo.computeVertexNormals();
  const head = new THREE.Mesh(headGeo, guardSkinMat);
  head.position.set(0, 0.085, 0);
  head.scale.set(0.92, 1.12, 1.02);
  guardHeadPivot.add(head);

  // Tactical Olive Helmet Dome + Rim + Curved Polycarbonate Visor + Radio Headset Mic
  const helmetGeo = trackGeo(new THREE.SphereGeometry(0.156, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58));
  helmetGeo.computeVertexNormals();
  const helmet = new THREE.Mesh(helmetGeo, guardArmorMat);
  helmet.position.set(0, 0.115, -0.008);
  helmet.scale.set(0.98, 1.02, 1.06);
  guardHeadPivot.add(helmet);

  const helmetBrim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.152, 0.016, 6, 18)), guardDarkGearMat);
  helmetBrim.rotation.x = Math.PI / 2;
  helmetBrim.position.set(0, 0.095, -0.008);
  helmetBrim.scale.set(0.96, 1.06, 1);
  guardHeadPivot.add(helmetBrim);

  const visorGeo = trackGeo(new THREE.CylinderGeometry(0.144, 0.148, 0.072, 16, 1, true, -0.95, 1.9));
  const visor = new THREE.Mesh(visorGeo, guardVisorMat);
  visor.position.set(0, 0.092, 0.014);
  guardHeadPivot.add(visor);

  const earCup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.028, 10)), guardDarkGearMat);
  earCup.rotation.z = Math.PI / 2;
  earCup.position.set(-0.132, 0.072, -0.01);
  guardHeadPivot.add(earCup);

  const micArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6)), guardDarkGearMat);
  micArm.rotation.set(Math.PI / 2 - 0.18, 0, -0.35);
  micArm.position.set(-0.088, 0.042, 0.062);
  guardHeadPivot.add(micArm);

  // Articulated Shoulder -> Elbow -> Forearm -> Hand Pivots
  const gUpperArmGeo = trackGeo(new THREE.CapsuleGeometry(0.054, 0.18, 5, 12));
  gUpperArmGeo.computeVertexNormals();
  const gForearmGeo = trackGeo(new THREE.CapsuleGeometry(0.044, 0.17, 5, 12));
  gForearmGeo.computeVertexNormals();
  const gHandGeo = trackGeo(new THREE.SphereGeometry(0.046, 10, 8));
  const gElbowGeo = trackGeo(new THREE.SphereGeometry(0.05, 10, 8));

  // Right Arm Rig
  const rShoulderPivot = new THREE.Group();
  rShoulderPivot.position.set(0.24, 0.42, 0.01);
  guardTorsoPivot.add(rShoulderPivot);

  const rUpper = new THREE.Mesh(gUpperArmGeo, guardFatigueMat);
  rUpper.position.set(0, -0.11, 0);
  rShoulderPivot.add(rUpper);

  const rElbowPivot = new THREE.Group();
  rElbowPivot.position.set(0, -0.22, 0);
  rShoulderPivot.add(rElbowPivot);

  const rElbowJoint = new THREE.Mesh(gElbowGeo, guardArmorMat);
  rElbowPivot.add(rElbowJoint);

  const rFore = new THREE.Mesh(gForearmGeo, guardFatigueMat);
  rFore.position.set(0, -0.105, 0);
  rElbowPivot.add(rFore);

  const rHand = new THREE.Mesh(gHandGeo, guardDarkGearMat);
  rHand.position.set(0, -0.22, 0);
  rElbowPivot.add(rHand);

  // Left Arm Rig + Tactical Wristwatch + Held Binoculars
  const lShoulderPivot = new THREE.Group();
  lShoulderPivot.position.set(-0.24, 0.42, 0.01);
  guardTorsoPivot.add(lShoulderPivot);

  const lUpper = new THREE.Mesh(gUpperArmGeo, guardFatigueMat);
  lUpper.position.set(0, -0.11, 0);
  lShoulderPivot.add(lUpper);

  const lElbowPivot = new THREE.Group();
  lElbowPivot.position.set(0, -0.22, 0);
  lShoulderPivot.add(lElbowPivot);

  const lElbowJoint = new THREE.Mesh(gElbowGeo, guardArmorMat);
  lElbowPivot.add(lElbowJoint);

  const lFore = new THREE.Mesh(gForearmGeo, guardFatigueMat);
  lFore.position.set(0, -0.105, 0);
  lElbowPivot.add(lFore);

  const watchBand = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.028, 12)), guardDarkGearMat);
  watchBand.position.set(0, -0.175, 0);
  lElbowPivot.add(watchBand);

  const watchFace = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.9,
        roughness: 0.2,
      }),
    ),
  );
  watchFace.rotation.z = Math.PI / 2;
  watchFace.position.set(-0.046, -0.175, 0.008);
  lElbowPivot.add(watchFace);

  const lHand = new THREE.Mesh(gHandGeo, guardDarkGearMat);
  lHand.position.set(0, -0.22, 0);
  lElbowPivot.add(lHand);

  const handBinoculars = createBinoculars();
  handBinoculars.position.set(0.045, -0.245, 0.03);
  handBinoculars.rotation.set(0.28, -0.22, -0.78);
  handBinoculars.visible = false;
  lElbowPivot.add(handBinoculars);

  // Detailed Low-Poly M16 Assault Rifle Held Across Chest
  const rifleGroup = new THREE.Group();
  rifleGroup.position.set(0.03, 0.24, 0.28);
  rifleGroup.rotation.set(0.14, -1.24, 0.16);
  guardTorsoPivot.add(rifleGroup);

  const receiver = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.046, 0.088, 0.24)), guardGunMat);
  rifleGroup.add(receiver);
  const carryHandle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 0.044, 0.18)), guardGunMat);
  carryHandle.position.set(0, 0.066, 0);
  rifleGroup.add(carryHandle);
  const stock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, 0.1, 0.24)), guardDarkGearMat);
  stock.position.set(0, -0.015, -0.23);
  stock.rotation.x = 0.06;
  rifleGroup.add(stock);
  const grip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.032, 0.1, 0.042)), guardDarkGearMat);
  grip.position.set(0, -0.078, -0.075);
  grip.rotation.x = -0.35;
  rifleGroup.add(grip);
  const mag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 0.15, 0.062)), guardGunMat);
  mag.position.set(0, -0.105, 0.055);
  mag.rotation.x = 0.22;
  rifleGroup.add(mag);
  const handguard = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.03, 0.034, 0.26, 8)), guardDarkGearMat);
  handguard.rotation.x = Math.PI / 2;
  handguard.position.set(0, 0.014, 0.25);
  rifleGroup.add(handguard);
  const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8)), guardGunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.016, 0.48);
  rifleGroup.add(barrel);
  const frontSight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.014, 0.065, 0.036)), guardGunMat);
  frontSight.position.set(0, 0.048, 0.41);
  rifleGroup.add(frontSight);

  // Initialize default patrol rifle-ready pose
  rShoulderPivot.rotation.set(-0.32, 0.05, 0.22);
  rElbowPivot.rotation.set(-1.35, 0, -0.68);
  lShoulderPivot.rotation.set(-0.46, -0.05, -0.2);
  lElbowPivot.rotation.set(-1.38, 0, 0.72);

  const smoothWindow = (t: number, start: number, end: number, fade = 0.65): number => {
    if (t <= start || t >= end) return 0;
    const up = Math.min(1, (t - start) / fade);
    const down = Math.min(1, (end - t) / fade);
    const s = Math.min(up, down);
    return s * s * (3 - 2 * s);
  };

  const guardWorldPos = new THREE.Vector3(wtX - 0.18, wtDeckY + 0.12, wtZ + 0.35);
  const updateGuard = (elapsed: number, playerPos: THREE.Vector3, radioOpen: boolean) => {
    // Subtle breathing & rhythmic platform weight shift
    const breath = Math.sin(elapsed * 1.9) * 0.008;
    const weightWave = Math.sin(elapsed * 0.55);
    const weightShiftX = weightWave * 0.036;
    const hipDip = Math.abs(weightWave) * 0.014;

    guardHipPivot.position.set(weightShiftX, 0.89 - hipDip, 0);
    guardHipPivot.rotation.z = -weightWave * 0.035;
    guardTorsoPivot.position.y = 0.07 + breath;

    // Subtle leg knee/thigh bend matching weight shift while boots stay anchored
    guardLeftLeg[0].thigh.position.x = -0.135 + weightShiftX * 0.5;
    guardLeftLeg[0].thigh.rotation.z = 0.04 - weightWave * 0.045;
    guardLeftLeg[0].knee.position.x = -0.135 + weightShiftX * 0.25;
    guardLeftLeg[0].shin.position.x = -0.135 + weightShiftX * 0.12;

    guardLeftLeg[1].thigh.position.x = 0.135 + weightShiftX * 0.5;
    guardLeftLeg[1].thigh.rotation.z = -0.04 - weightWave * 0.045;
    guardLeftLeg[1].knee.position.x = 0.135 + weightShiftX * 0.25;
    guardLeftLeg[1].shin.position.x = 0.135 + weightShiftX * 0.12;

    const distToPlayer = Math.hypot(playerPos.x - guardWorldPos.x, playerPos.z - guardWorldPos.z);
    const engagingPlayer = radioOpen || distToPlayer < 7.0;

    // 18-second idle sequence: patrol -> check wristwatch (3.8..6.8s) -> patrol -> binocular scan (9.8..15.2s)
    const cycleT = elapsed % 18.0;
    const watchBlend = engagingPlayer ? 0 : smoothWindow(cycleT, 3.8, 6.8, 0.65);
    const binocBlend = engagingPlayer ? 0 : smoothWindow(cycleT, 9.8, 15.2, 0.72);
    const offRifleBlend = Math.max(watchBlend, binocBlend);

    // Swap binoculars between chest sling and left hand mid-reach
    const holdingBinocs = binocBlend > 0.35;
    chestBinoculars.visible = !holdingBinocs;
    handBinoculars.visible = holdingBinocs;

    if (engagingPlayer) {
      const targetWorldYaw = Math.atan2(playerPos.x - guardWorldPos.x, playerPos.z - guardWorldPos.z);
      let relYaw = targetWorldYaw - guardBaseYaw;
      while (relYaw > Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      const clampedBodyYaw = THREE.MathUtils.clamp(relYaw * 0.45, -0.45, 0.45);
      const clampedHeadYaw = THREE.MathUtils.clamp(relYaw - clampedBodyYaw, -0.65, 0.65);
      guardTorsoPivot.rotation.y = THREE.MathUtils.lerp(guardTorsoPivot.rotation.y, clampedBodyYaw, 0.09);
      guardTorsoPivot.rotation.x = THREE.MathUtils.lerp(guardTorsoPivot.rotation.x, 0, 0.08);
      guardHeadPivot.rotation.y = THREE.MathUtils.lerp(guardHeadPivot.rotation.y, clampedHeadYaw, 0.12);
      const lookPitch = THREE.MathUtils.clamp((guardWorldPos.y + 1.5 - (playerPos.y + 1.6)) * 0.06, -0.25, 0.38);
      guardHeadPivot.rotation.x = THREE.MathUtils.lerp(guardHeadPivot.rotation.x, lookPitch, 0.1);
    } else {
      const binocSweep = binocBlend > 0.05 ? Math.sin(((cycleT - 9.8) / 5.4) * Math.PI * 2 - Math.PI * 0.5) * 0.42 : 0;
      const bodyScan = Math.sin(elapsed * 0.32) * 0.12 + binocSweep * 0.32;
      const headScan =
        watchBlend > 0.05
          ? THREE.MathUtils.lerp(Math.sin(elapsed * 0.65) * 0.24, 0.18, watchBlend)
          : binocBlend > 0.05
            ? binocSweep * 0.72
            : Math.sin(elapsed * 0.65) * 0.26;
      const targetHeadPitch =
        watchBlend > 0.05
          ? THREE.MathUtils.lerp(0.08, 0.34, watchBlend)
          : binocBlend > 0.05
            ? THREE.MathUtils.lerp(0.08, -0.06, binocBlend)
            : 0.08;
      const targetTorsoPitch = watchBlend * 0.06 - binocBlend * 0.03;

      guardTorsoPivot.rotation.y = THREE.MathUtils.lerp(guardTorsoPivot.rotation.y, bodyScan, 0.06);
      guardTorsoPivot.rotation.x = THREE.MathUtils.lerp(guardTorsoPivot.rotation.x, targetTorsoPitch, 0.06);
      guardHeadPivot.rotation.y = THREE.MathUtils.lerp(guardHeadPivot.rotation.y, headScan, 0.07);
      guardHeadPivot.rotation.x = THREE.MathUtils.lerp(guardHeadPivot.rotation.x, targetHeadPitch, 0.07);
    }

    // Right arm keeps rifle slung/braced smoothly when left hand checks watch or raises binoculars
    rShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(-0.32, -0.18, offRifleBlend),
      THREE.MathUtils.lerp(0.05, -0.08, offRifleBlend),
      THREE.MathUtils.lerp(0.22, 0.16, offRifleBlend),
    );
    rElbowPivot.rotation.set(
      THREE.MathUtils.lerp(-1.35, -1.12, offRifleBlend),
      0,
      THREE.MathUtils.lerp(-0.68, -0.52, offRifleBlend),
    );

    // M16 tilts gently downward on sling when left hand lets go
    rifleGroup.position.set(
      THREE.MathUtils.lerp(0.03, 0.09, offRifleBlend),
      THREE.MathUtils.lerp(0.24, 0.16, offRifleBlend),
      THREE.MathUtils.lerp(0.28, 0.23, offRifleBlend),
    );
    rifleGroup.rotation.set(
      THREE.MathUtils.lerp(0.14, 0.48, offRifleBlend),
      THREE.MathUtils.lerp(-1.24, -1.18, offRifleBlend),
      THREE.MathUtils.lerp(0.16, 0.36, offRifleBlend),
    );

    // Left arm blends between Rifle-Ready, Watch-Check, and Binoculars-Scan poses
    let targetLSx = -0.46;
    let targetLSy = -0.05;
    let targetLSz = -0.2;
    let targetLEx = -1.38;
    let targetLEy = 0;
    let targetLEz = 0.72;

    if (watchBlend > 0.01) {
      targetLSx = THREE.MathUtils.lerp(targetLSx, -1.06, watchBlend);
      targetLSy = THREE.MathUtils.lerp(targetLSy, 0.08, watchBlend);
      targetLSz = THREE.MathUtils.lerp(targetLSz, -0.08, watchBlend);
      targetLEx = THREE.MathUtils.lerp(targetLEx, -1.52, watchBlend);
      targetLEy = THREE.MathUtils.lerp(targetLEy, 0.28, watchBlend);
      targetLEz = THREE.MathUtils.lerp(targetLEz, 0.94, watchBlend);
    }
    if (binocBlend > 0.01) {
      targetLSx = THREE.MathUtils.lerp(targetLSx, -1.78, binocBlend);
      targetLSy = THREE.MathUtils.lerp(targetLSy, 0.14 + guardHeadPivot.rotation.y * 0.35, binocBlend);
      targetLSz = THREE.MathUtils.lerp(targetLSz, -0.06, binocBlend);
      targetLEx = THREE.MathUtils.lerp(targetLEx, -1.34, binocBlend);
      targetLEy = THREE.MathUtils.lerp(targetLEy, 0.06, binocBlend);
      targetLEz = THREE.MathUtils.lerp(targetLEz, 0.88, binocBlend);
    }

    lShoulderPivot.rotation.x = THREE.MathUtils.lerp(lShoulderPivot.rotation.x, targetLSx, 0.14);
    lShoulderPivot.rotation.y = THREE.MathUtils.lerp(lShoulderPivot.rotation.y, targetLSy, 0.14);
    lShoulderPivot.rotation.z = THREE.MathUtils.lerp(lShoulderPivot.rotation.z, targetLSz, 0.14);
    lElbowPivot.rotation.x = THREE.MathUtils.lerp(lElbowPivot.rotation.x, targetLEx, 0.14);
    lElbowPivot.rotation.y = THREE.MathUtils.lerp(lElbowPivot.rotation.y, targetLEy, 0.14);
    lElbowPivot.rotation.z = THREE.MathUtils.lerp(lElbowPivot.rotation.z, targetLEz, 0.14);
  };

  // =========================================================================
  // 8. 3 GLOWING ANTIZIN MEDICAL SUPPLY CRATES (Emissive beacons, zero PointLight lag!)
  // =========================================================================
  const crateDefs: Array<{ id: string; label: string; locationHint: string; pos: [number, number, number] }> = [
    {
      id: 'crate_rooftop',
      label: 'Antizin Case Alpha',
      locationHint: 'High West Bazaar Rooftop',
      pos: [-27.5, 5.8, 3],
    },
    {
      id: 'crate_pool',
      label: 'Antizin Case Bravo',
      locationHint: 'Reflecting Pool Ruins',
      pos: [0, 0.85, -13],
    },
    {
      id: 'crate_alley',
      label: 'Antizin Case Charlie',
      locationHint: 'Guarded East Market Alley',
      pos: [38.5, 0, 6.5],
    },
  ];

  const crateBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.35,
      metalness: 0.45,
    }),
  );
  const crateAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.6,
      roughness: 0.25,
    }),
  );
  const beaconMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.25, 1.85, 2.05),
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    }),
  );
  const crateGlowDiscMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Shared unattached dummy PointLight to satisfy interface without hurting fragment shader performance
  const dummyCrateLight = new THREE.PointLight(0x10b981, 0, 1);
  dummyCrateLight.castShadow = false;

  // Shared crate geometries reused across all 3 Antizin supply crates
  const crateBaseGeo = trackGeo(new THREE.BoxGeometry(1.15, 0.56, 0.78));
  const crateLidGeo = trackGeo(new THREE.BoxGeometry(1.2, 0.14, 0.82));
  const crateStripGeo = trackGeo(new THREE.BoxGeometry(1.22, 0.1, 0.84));
  const crateRingGeo = trackGeo(new THREE.TorusGeometry(0.45, 0.04, 8, 14));
  const crateGlowDiscGeo = trackGeo(new THREE.CircleGeometry(1.4, 12));

  const cratePillarGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.44, 18, 12, 1, true));
  const cratePillarMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  crateDefs.forEach((def) => {
    const group = new THREE.Group();
    group.position.set(def.pos[0], def.pos[1], def.pos[2]);

    const caseBase = new THREE.Mesh(crateBaseGeo, crateBodyMat);
    caseBase.position.y = 0.28;
    group.add(caseBase);

    const lid = new THREE.Mesh(crateLidGeo, darkMetalMat);
    lid.position.y = 0.62;
    group.add(lid);

    const strip = new THREE.Mesh(crateStripGeo, crateAccentMat);
    strip.position.y = 0.48;
    group.add(strip);

    const ring = new THREE.Mesh(crateRingGeo, beaconMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.25;
    group.add(ring);

    const glowDisc = new THREE.Mesh(crateGlowDiscGeo, crateGlowDiscMat);
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.y = 0.03;
    group.add(glowDisc);

    // Subtle vertical light-shaft beacon rising above uncollected crate
    const beaconPillar = new THREE.Mesh(cratePillarGeo, cratePillarMat);
    beaconPillar.position.y = 9.2;
    group.add(beaconPillar);

    worldGroup.add(group);

    crates.push({
      id: def.id,
      label: def.label,
      locationHint: def.locationHint,
      position: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
      collected: false,
      group,
      beaconLight: dummyCrateLight,
      beaconRing: ring,
    });
  });

  // =========================================================================
  // 9. ATMOSPHERIC DUST/ASH MOTES, EMERGENCY BARREL FLARES & EXTRACTION BEACON
  // =========================================================================
  const dustCount = isSoftwareGl ? 140 : isIntelIntegrated ? 200 : 280;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustPhase = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (((i * 73) % 1000) / 1000 - 0.5) * 96;
    dustPositions[i * 3 + 1] = 0.5 + (((i * 41) % 1000) / 1000) * 14.5;
    dustPositions[i * 3 + 2] = (((i * 97) % 1000) / 1000 - 0.5) * 125 - 10;
    dustPhase[i] = (i * 0.37) % (Math.PI * 2);
  }
  const dustGeo = trackGeo(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(dustPhase, 1));
  const dustElapsedUniform = { value: 0 };
  const dustMat = trackMat(
    new THREE.PointsMaterial({
      map: textures.dustMote,
      color: 0xffd7a8,
      size: 0.24,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  dustMat.onBeforeCompile = (shader) => {
    shader.uniforms.uElapsed = dustElapsedUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uElapsed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y = 0.4 + mod(transformed.y - 0.4 + uElapsed * 0.27, 15.1);
        transformed.x += sin(uElapsed * 0.55 + aPhase) * 0.65;
        transformed.z += cos(uElapsed * 0.48 + aPhase) * 0.65;`,
      );
  };
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  worldGroup.add(dustPoints);

  // Warm flickering burn barrels / emergency flares around key parkour chokepoints
  interface FlickerLightEntry {
    light: THREE.PointLight;
    flame: THREE.Mesh;
    baseIntensity: number;
    phase: number;
  }
  const flickerLights: FlickerLightEntry[] = [];
  const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.36, 0.34, 0.92, 10));
  const barrelEmberMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xff6b1a }),
  );
  const barrelFlameGeo = trackGeo(new THREE.ConeGeometry(0.24, 0.58, 7));
  const barrelSpecs: Array<{ x: number; y: number; z: number; phase: number }> = [
    { x: -17.5, y: 0, z: 25.0, phase: 0.4 },
    { x: 17.5, y: 0, z: 10.5, phase: 1.9 },
    { x: -27.5, y: 4.0, z: 22.0, phase: 3.1 },
    { x: 27.5, y: 4.3, z: -18.0, phase: 4.7 },
  ];
  barrelSpecs.forEach((b) => {
    const drum = new THREE.Mesh(barrelGeo, rustMat);
    drum.position.set(b.x, b.y + 0.46, b.z);
    drum.castShadow = !isSoftwareGl;
    drum.receiveShadow = true;
    worldGroup.add(drum);

    const flame = new THREE.Mesh(barrelFlameGeo, barrelEmberMat);
    flame.position.set(b.x, b.y + 1.05, b.z);
    worldGroup.add(flame);

    const pLight = new THREE.PointLight(0xff7828, 3.6, 17, 1.7);
    pLight.castShadow = false;
    pLight.position.set(b.x, b.y + 1.35, b.z);
    worldGroup.add(pLight);

    flickerLights.push({ light: pLight, flame, baseIntensity: 3.6, phase: b.phase });
  });

  // Extraction Flare Beacon at Taj Safe-House Plinth Approach (unlocked at 15 kills)
  const extractionPoint = new THREE.Vector3(0, 1.5, -49.2);
  const extractionGroup = new THREE.Group();
  extractionGroup.position.set(extractionPoint.x, 0.04, extractionPoint.z);
  worldGroup.add(extractionGroup);

  const flareCanister = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.52, 10)),
    darkMetalMat,
  );
  flareCanister.position.y = 0.26;
  flareCanister.castShadow = !isSoftwareGl;
  flareCanister.receiveShadow = true;
  extractionGroup.add(flareCanister);

  const flareTipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x34d399,
      emissiveIntensity: 0,
      roughness: 0.2,
      metalness: 0.1,
    }),
  );
  const flareTip = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.16, 12, 10)),
    flareTipMat,
  );
  flareTip.position.y = 0.56;
  flareTip.visible = false;
  extractionGroup.add(flareTip);

  const extractionBeamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.25, 2.2, 1.35),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const extractionBeam = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.22, 0.68, 28, 12, 1, true)),
    extractionBeamMat,
  );
  extractionBeam.position.y = 14.0;
  extractionBeam.visible = false;
  extractionGroup.add(extractionBeam);

  const extractionRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.35, 2.4, 1.5),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const extractionRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(1.15, 1.5, 24)),
    extractionRingMat,
  );
  extractionRing.rotation.x = -Math.PI / 2;
  extractionRing.position.y = 0.05;
  extractionRing.visible = false;
  extractionGroup.add(extractionRing);

  const extractionLight = new THREE.PointLight(0x10b981, 0, 22, 1.5);
  extractionLight.position.set(0, 1.4, 0);
  extractionGroup.add(extractionLight);

  let extractionActive = false;
  const setExtractionActive = (active: boolean): void => {
    extractionActive = active;
    extractionBeam.visible = active;
    extractionRing.visible = active;
    flareTip.visible = active;
    if (!active) {
      extractionBeamMat.opacity = 0;
      extractionRingMat.opacity = 0;
      extractionLight.intensity = 0;
      flareTipMat.emissiveIntensity = 0;
    }
  };

  let lastPropsElapsed = 0;
  const updateWorldProps = (elapsed: number): void => {
    const dt = Math.max(0.001, Math.min(0.05, elapsed - lastPropsElapsed));
    lastPropsElapsed = elapsed;

    // Animate Charbagh reflecting pool & Yamuna ripple bump UV coordinates smoothly
    textures.waterRippleBump.offset.x = (textures.waterRippleBump.offset.x + dt * 0.03) % 1;
    textures.waterRippleBump.offset.y = (textures.waterRippleBump.offset.y + dt * 0.02) % 1;
    textures.poolWater.offset.x = (textures.poolWater.offset.x + dt * 0.015) % 1;
    textures.poolWater.offset.y = (textures.poolWater.offset.y + dt * 0.01) % 1;

    // Spin Haveli ceiling fan & Railway platform fans smoothly
    haveliFanGroup.rotation.y = elapsed * 2.5;
    for (let i = 0; i < stPlatformFans.length; i++) {
      stPlatformFans[i].rotation.y = elapsed * 3.1 + i * 0.8;
    }

    // Smoothly swing interactive Haveli & Railway Station doors
    for (let i = 0; i < interactiveDoors.length; i++) {
      const door = interactiveDoors[i];
      const target = door.open ? 1 : 0;
      if (Math.abs(door.currentProgress - target) > 0.001) {
        door.currentProgress = THREE.MathUtils.lerp(
          door.currentProgress,
          target,
          1 - Math.exp(-10 * dt),
        );
        for (let p = 0; p < door.pivots.length; p++) {
          const pv = door.pivots[p];
          pv.group.rotation.y = THREE.MathUtils.lerp(pv.closedY, pv.openY, door.currentProgress);
        }
      }
    }

    for (let i = 0; i < worldMedkits.length; i++) {
      const mk = worldMedkits[i];
      if (!mk.used) {
        mk.group.position.y = mk.pos.y + Math.sin(elapsed * 2.8 + i) * 0.03;
        mk.group.rotation.y = elapsed * 1.1 + i * 1.2;
      }
    }

    for (let i = 0; i < flutteringPennants.length; i++) {
      const p = flutteringPennants[i];
      p.mesh.rotation.x = Math.sin(elapsed * 3.8 + p.phase) * 0.24 + 0.14;
      p.mesh.rotation.z = p.baseRotZ + Math.cos(elapsed * 2.9 + p.phase) * 0.12;
    }
    cratePillarMat.opacity = 0.13 + Math.sin(elapsed * 2.4) * 0.04;
    uvBarrierMat.opacity = 0.12 + Math.sin(elapsed * 3.1) * 0.035;

    // Drift floating atmospheric dust/ash motes gently on GPU (zero CPU buffer uploads)
    dustElapsedUniform.value = elapsed;

    // Flicker emergency burn barrels
    for (let i = 0; i < flickerLights.length; i++) {
      const fl = flickerLights[i];
      const wave =
        Math.sin(elapsed * 11.3 + fl.phase) * 0.45 +
        Math.sin(elapsed * 19.7 + fl.phase * 1.7) * 0.28;
      fl.light.intensity = Math.max(1.8, fl.baseIntensity + wave);
      const s = 0.88 + Math.max(0, wave) * 0.35;
      fl.flame.scale.set(1, s, 1);
    }

    if (extractionActive) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4.8);
      flareTipMat.emissiveIntensity = 3.2 + pulse * 1.4;
      extractionBeamMat.opacity = 0.28 + pulse * 0.16;
      extractionRingMat.opacity = 0.52 + pulse * 0.35;
      extractionRing.scale.setScalar(0.95 + pulse * 0.18);
      extractionLight.intensity = 6.2 + pulse * 3.8;
    }
  };

  const findNearestDoor = (playerPos: THREE.Vector3): InteractiveDoorObj | null => {
    let best: InteractiveDoorObj | null = null;
    let bestDist = 3.0;
    for (let i = 0; i < interactiveDoors.length; i++) {
      const d = interactiveDoors[i];
      const horiz = Math.hypot(playerPos.x - d.centerPos.x, playerPos.z - d.centerPos.z);
      const vert = Math.abs(playerPos.y + 0.9 - d.centerPos.y);
      if (horiz < bestDist && vert < 2.2) {
        bestDist = horiz;
        best = d;
      }
    }
    return best;
  };

  const getNearbyDoorPrompt = (playerPos: THREE.Vector3): string => {
    const d = findNearestDoor(playerPos);
    if (!d) return '';
    return d.open ? `[E] Close ${d.label}` : `[E] Open ${d.label}`;
  };

  const toggleNearestDoor = (playerPos: THREE.Vector3): { label: string; open: boolean } | null => {
    const d = findNearestDoor(playerPos);
    if (!d) return null;
    d.open = !d.open;
    d.collider.disabled = d.open;
    return { label: d.label, open: d.open };
  };

  const isNearHaveliMedkit = (playerPos: THREE.Vector3): boolean => {
    for (let i = 0; i < worldMedkits.length; i++) {
      const mk = worldMedkits[i];
      if (mk.used) continue;
      const horiz = Math.hypot(playerPos.x - mk.pos.x, playerPos.z - mk.pos.z);
      const vert = Math.abs(playerPos.y + 0.8 - mk.pos.y);
      if (horiz < 2.6 && vert < 2.0) return true;
    }
    return false;
  };

  const tryUseHaveliMedkit = (playerPos: THREE.Vector3): boolean => {
    for (let i = 0; i < worldMedkits.length; i++) {
      const mk = worldMedkits[i];
      if (mk.used) continue;
      const horiz = Math.hypot(playerPos.x - mk.pos.x, playerPos.z - mk.pos.z);
      const vert = Math.abs(playerPos.y + 0.8 - mk.pos.y);
      if (horiz < 2.6 && vert < 2.0) {
        mk.used = true;
        mk.group.visible = false;
        return true;
      }
    }
    return false;
  };

  const resetInteractiveWorld = (): void => {
    for (let i = 0; i < interactiveDoors.length; i++) {
      const d = interactiveDoors[i];
      d.open = false;
      d.currentProgress = 0;
      d.collider.disabled = false;
      for (let p = 0; p < d.pivots.length; p++) {
        d.pivots[p].group.rotation.y = d.pivots[p].closedY;
      }
    }
    for (let i = 0; i < worldMedkits.length; i++) {
      const mk = worldMedkits[i];
      mk.used = false;
      mk.group.visible = true;
      mk.group.position.copy(mk.pos);
    }
  };

  return {
    colliders,
    climbableMeshes,
    crates,
    ziplines,
    ladders,
    uvLights,
    floodLights,
    uvGlowMeshes,
    stringBulbMats,
    tajGateCenter: new THREE.Vector3(0, 1.5, -51.6),
    extractionPoint,
    guardTowerCenter: new THREE.Vector3(wtX, 0, wtZ),
    tajSafeZone: {
      minX: -10,
      maxX: 10,
      minZ: -92,
      maxZ: -54.5,
    },
    spawnPos: new THREE.Vector3(-28.0, 4.2, 42.8),
    spawnYaw: -0.2305, // Points NNE directly across the launch ramp toward the Taj Mahal
    setExtractionActive,
    updateGuard,
    updateWorldProps,
    getNearbyDoorPrompt,
    toggleNearestDoor,
    isNearHaveliMedkit,
    tryUseHaveliMedkit,
    resetInteractiveWorld,
    dispose: () => {
      scene.remove(worldGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
