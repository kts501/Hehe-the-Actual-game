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
  guardTowerCenter: THREE.Vector3;
  tajSafeZone: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawnPos: THREE.Vector3;
  spawnYaw: number;
  updateGuard: (elapsed: number, playerPos: THREE.Vector3, radioOpen: boolean) => void;
  updateWorldProps: (elapsed: number) => void;
  dispose: () => void;
}

const _batchPos = new THREE.Vector3();
const _batchQuat = new THREE.Quaternion();
const _batchEuler = new THREE.Euler();
const _batchScale = new THREE.Vector3(1, 1, 1);
const _batchMatrix = new THREE.Matrix4();

export function buildAgraWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): WorldBuildResult {
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
      color: 0xf4efe6,
      roughness: 0.34,
      metalness: 0.05,
    }),
  );
  const marbleTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9d2c5,
      roughness: 0.58,
      metalness: 0.04,
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
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.05,
    }),
  );
  const yamunaWaterMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.poolWater,
      color: 0x1b4d63,
      roughness: 0.16,
      metalness: 0.36,
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
      color: 0xa25a46,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  const pavilionSandstoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      color: 0x8d4537,
      roughness: 0.84,
      metalness: 0.03,
    }),
  );
  const courtyardMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.courtyardTile,
      color: 0x6b5c4d,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const charbaghLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.charbaghGrass,
      color: 0x4b6e32,
      roughness: 0.94,
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
      color: 0x676b70,
      roughness: 0.56,
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
      color: 0xcab08c,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const plasterAltMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      color: 0xb58668,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const plasterTealMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bazaarWall,
      color: 0x5c7c79,
      roughness: 0.85,
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

  const courtyardFloor = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(126, 162)), courtyardMat);
  courtyardFloor.rotation.x = -Math.PI / 2;
  courtyardFloor.position.set(0, 0, -16);
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
  leftWalkway.receiveShadow = true;
  worldGroup.add(leftWalkway);

  const rightWalkway = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(6.8, 92)), sandstoneMat);
  rightWalkway.rotation.x = -Math.PI / 2;
  rightWalkway.position.set(8.2, 0.015, -10);
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
      false,
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
    const reflector = new Reflector(poolGeo, {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0x89a9ad,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.03, -12);

    // Throttle Reflector scene re-render to every 2nd frame (doubles FPS!)
    const origOnBeforeRender = reflector.onBeforeRender.bind(reflector);
    let reflectFrame = 0;
    reflector.onBeforeRender = (renderer, scn, cam, geometry, material, group) => {
      if (reflectFrame++ % 2 === 0) {
        origOnBeforeRender(renderer, scn, cam, geometry, material, group);
      }
    };

    worldGroup.add(reflector);
    disposables.push(reflector);
  } else {
    const poolBase = new THREE.Mesh(
      poolGeo,
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x1a464e,
          roughness: 0.14,
          metalness: 0.48,
        }),
      ),
    );
    poolBase.rotation.x = -Math.PI / 2;
    poolBase.position.set(0, 0.03, -12);
    worldGroup.add(poolBase);
  }

  // Subtle translucent water tint over mirror pool
  const poolSheenMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.poolWater,
      color: 0x4ea6b5,
      transparent: true,
      opacity: isSoftwareGl ? 0.45 : 0.12,
      roughness: 0.08,
      metalness: 0.2,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  const poolSheen = new THREE.Mesh(poolGeo, poolSheenMat);
  poolSheen.rotation.x = -Math.PI / 2;
  poolSheen.position.set(0, 0.042, -12);
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
      pushStaticGeo(cypressTrunkGeo, trunkMat, cx, 0.5 * s, cz, 0, 0, 0, s, s, s, false, true);
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
    pushStaticGeo(burjBodyGeo, pavilionSandstoneMat, bx, 4.8, bz, 0, Math.PI / 8, 0, 1, 1, 1, false, true);
    pushStaticGeo(burjDomeGeo, marbleMat, bx, 9.2, bz, 0, 0, 0, 1, 1.08, 1, false, true);
    pushStaticGeo(trackGeo(new THREE.ConeGeometry(0.16, 1.4, 6)), goldMat, bx, 11.6, bz, 0, 0, 0, 1, 1, 1, false, false);
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
  pushStaticGeo(innerPortalArchGeo, pietraDuraMat, 0, 3.0, -65.9, 0, 0, 0, 1, 1, 1, false, true);

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
    pushStaticGeo(guldastaShaftGeo, marbleTrimMat, gx, gy + 1.4, gz, 0, 0, 0, 1, 1, 1, false, true);
    pushStaticGeo(guldastaBudGeo, marbleMat, gx, gy + 3.7, gz, 0, 0, 0, 1, 1.25, 1, false, false);
    pushStaticGeo(guldastaSpireGeo, goldMat, gx, gy + 4.3, gz, 0, 0, 0, 1, 1, 1, false, false);
  });

  // Flanking 2-Tier Pointed Mughal Arched Alcoves (Lower & Upper Wings + 45° Chamfer Corners)
  const wingNicheGeo = createMughalArchFrameGeo(3.6, 5.4, 2.2, 4.2, 0.85);
  [-8.0, 8.0].forEach((nx) => {
    // Lower tier arched niche
    pushStaticGeo(wingNicheGeo, marbleMat, nx, 3.0, -65.6, 0, 0, 0, 1, 1, 1, false, true);
    addBox(worldGroup, 2.4, 4.2, 0.3, nx, 5.2, -66.1, sanctuarySlateMat);
    // Upper tier arched niche
    pushStaticGeo(wingNicheGeo, marbleMat, nx, 9.2, -65.6, 0, 0, 0, 1, 1, 1, false, true);
    addBox(worldGroup, 2.4, 4.2, 0.3, nx, 11.4, -66.1, sanctuarySlateMat);
    addBox(worldGroup, 3.6, 0.55, 0.9, nx, 8.95, -65.6, pietraDuraMat);
  });

  // East, West & North Facade Pishtaqs + Chamfered 45° Corner Alcoves
  const sidePishtaqGeo = createMughalArchFrameGeo(9.2, 13.8, 5.2, 10.6, 1.2);
  pushStaticGeo(sidePishtaqGeo, marbleMat, -10.8, 3.0, -76.5, 0, Math.PI / 2, 0, 1, 1, 1, false, true);
  pushStaticGeo(sidePishtaqGeo, marbleMat, 10.8, 3.0, -76.5, 0, -Math.PI / 2, 0, 1, 1, 1, false, true);
  pushStaticGeo(sidePishtaqGeo, marbleMat, 0, 3.0, -86.6, 0, 0, 0, 1, 1, 1, false, true);

  [
    [-10.3, -66.8, Math.PI / 4],
    [10.3, -66.8, -Math.PI / 4],
    [-10.3, -86.2, (Math.PI * 3) / 4],
    [10.3, -86.2, (-Math.PI * 3) / 4],
  ].forEach(([cx, cz, ry]) => {
    addBox(worldGroup, 3.8, 12.8, 3.8, cx, 9.4, cz, marbleTrimMat, { rotY: ry });
    pushStaticGeo(wingNicheGeo, marbleMat, cx, 3.0, cz, 0, ry, 0, 0.88, 1, 1.5, false, true);
    pushStaticGeo(wingNicheGeo, marbleMat, cx, 9.2, cz, 0, ry, 0, 0.88, 1, 1.5, false, true);
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
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(5.65, 5.85, 2.4, 24)), pietraDuraMat, 0, 17.0, -76.5, 0, 0, 0, 1, 1, 1, false, true);
  // Inverted lotus petal crown + multi-tiered golden kalash spire
  pushStaticGeo(trackGeo(new THREE.ConeGeometry(1.15, 1.1, 14)), marbleTrimMat, 0, 27.9, -76.5, 0, 0, 0, 1, 1, 1, false, false);
  pushStaticGeo(trackGeo(new THREE.CylinderGeometry(0.12, 0.36, 4.4, 8)), goldMat, 0, 30.2, -76.5, 0, 0, 0, 1, 1, 1, false, false);
  [29.1, 29.9, 30.65].forEach((ky, idx) => {
    pushStaticGeo(trackGeo(new THREE.SphereGeometry(0.58 - idx * 0.14, 10, 8)), goldMat, 0, ky, -76.5, 0, 0, 0, 1, 1, 1, false, false);
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
    pushStaticGeo(trackGeo(new THREE.CylinderGeometry(1.9, 2.0, 0.32, 8)), marbleTrimMat, kx, 16.16, kz, 0, 0, 0, 1, 1, 1, false, true);
    for (let c = 0; c < 8; c++) {
      const ca = (c / 8) * Math.PI * 2;
      pushStaticGeo(chhatriPillarGeo, marbleMat, kx + Math.cos(ca) * 1.55, 17.5, kz + Math.sin(ca) * 1.55, 0, 0, 0, 1, 1, 1, false, true);
    }
    pushStaticGeo(chhatriEaveGeo, marbleTrimMat, kx, 18.8, kz, 0, Math.PI / 8, 0, 1, 1, 1, false, true);
    pushStaticGeo(chhatriDomeGeo, marbleMat, kx, 19.3, kz, 0, 0, 0, 1, 1.08, 1, false, true);
    pushStaticGeo(kFinialGeo, goldMat, kx, 21.6, kz, 0, 0, 0, 1, 1, 1, false, false);
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
      pushStaticGeo(tg.corbel, pietraDuraMat, mx, 3.0 + tg.y + tg.h / 2 - 0.2, mz, 0, Math.PI / 8, 0, 1, 1, 1, false, true);
      pushStaticGeo(tg.balcony, marbleTrimMat, mx, 3.0 + tg.y + tg.h / 2 + 0.18, mz, 0, Math.PI / 8, 0, 1, 1, 1, false, true);
    });
    // Top open 6-pillar minaret lantern
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * Math.PI * 2;
      pushStaticGeo(minLanternPostGeo, marbleMat, mx + Math.cos(pa) * 0.92, 3.0 + 22.2, mz + Math.sin(pa) * 0.92, 0, 0, 0, 1, 1, 1, false, false);
    }
    pushStaticGeo(minCupolaGeo, marbleMat, mx, 3.0 + 23.4, mz, 0, 0, 0, 1, 1.06, 1, false, false);
    pushStaticGeo(minSpireGeo, goldMat, mx, 3.0 + 25.3, mz, 0, 0, 0, 1, 1, 1, false, false);

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
      castShadow: false,
      receiveShadow: true,
    });
    // Central arched pishtaq projection facing inward/south
    addBox(worldGroup, 11.8, 11.4, 8.0, px, 5.7, -74, pavilionSandstoneMat, {
      castShadow: false,
      receiveShadow: true,
    });
    // White marble trim frieze & corner roof chhatris
    addBox(worldGroup, 12.1, 0.7, 22.4, px, 9.4, -74, marbleTrimMat, { castShadow: false });
    // Central white marble dome + flanking smaller domes (matching left skyline of image!)
    pushStaticGeo(sideDomeGeo, marbleMat, px, 12.2, -74, 0, 0, 0, 1, 1.08, 1, false, true);
    pushStaticGeo(kFinialGeo, goldMat, px, 15.6, -74, 0, 0, 0, 1.2, 1.3, 1.2, false, false);
    [-6.8, 6.8].forEach((dz) => {
      pushStaticGeo(sideSmallDomeGeo, marbleMat, px, 10.6, -74 + dz, 0, 0, 0, 1, 1.05, 1, false, true);
      pushStaticGeo(kFinialGeo, goldMat, px, 12.8, -74 + dz, 0, 0, 0, 0.9, 1.0, 0.9, false, false);
    });
    // South-facing facade arch & corner turret
    addBox(worldGroup, 5.2, 6.2, 0.5, px, 4.2, -62.9, sanctuarySlateMat, { castShadow: false });
    addBox(worldGroup, 1.4, 11.8, 1.4, px - faceSign * 5.2, 5.9, -63.2, pavilionSandstoneMat, { castShadow: false });
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
      false,
      false,
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
    [45, 22, 1.2],
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
    [30, 42],
    [-42, -55],
    [42, -55],
  ].forEach(([px, pz], idx) => {
    pushStaticGeo(palmTrunkGeo, trunkMat, px, 4.4, pz, 0, idx * 1.1, 0.08, 1, 1, 1, false, true);
    for (let f = 0; f < 6; f++) {
      pushStaticGeo(frondGeo, palmFrondMat, px - 0.35, 8.7, pz, 0.38, (f / 6) * Math.PI * 2 + idx * 1.1, 0, 1, 1, 1, false, false);
    }
  });

  // Outer Quarantine Perimeter Walls (wallrunnable!)
  addBox(worldGroup, 116, 4.5, 2.0, 0, 2.25, 52, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 2.0, 4.5, 152, -46, 2.25, -20, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 2.0, 4.5, 152, 46, 2.25, -20, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });
  addBox(worldGroup, 94, 4.5, 2.0, 0, 2.25, -99, sandstoneMat, { collide: true, mantleable: false, wallrunnable: true });

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

  const updateWorldProps = (elapsed: number): void => {
    for (let i = 0; i < flutteringPennants.length; i++) {
      const p = flutteringPennants[i];
      p.mesh.rotation.x = Math.sin(elapsed * 3.8 + p.phase) * 0.24 + 0.14;
      p.mesh.rotation.z = p.baseRotZ + Math.cos(elapsed * 2.9 + p.phase) * 0.12;
    }
    cratePillarMat.opacity = 0.13 + Math.sin(elapsed * 2.4) * 0.04;
    uvBarrierMat.opacity = 0.12 + Math.sin(elapsed * 3.1) * 0.035;
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
    guardTowerCenter: new THREE.Vector3(wtX, 0, wtZ),
    tajSafeZone: {
      minX: -10,
      maxX: 10,
      minZ: -92,
      maxZ: -54.5,
    },
    spawnPos: new THREE.Vector3(-28.0, 4.2, 42.8),
    spawnYaw: -0.2305, // Points NNE directly across the launch ramp toward the Taj Mahal
    updateGuard,
    updateWorldProps,
    dispose: () => {
      scene.remove(worldGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
