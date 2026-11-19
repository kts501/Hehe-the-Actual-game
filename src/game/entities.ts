import * as THREE from 'three';
import type { EnemyKind, HandPose, HumanoidVariantId, WeaponKind } from './types';
import type { ProceduralTextureSet } from './textures';

export interface VariantSpec {
  id: HumanoidVariantId;
  name: string;
  skinColor: number;
  clothColor: number;
  eyeColor: number;
  scale: number;
  speed: number;
  hp: number;
  damage: number;
  hasHelmet?: boolean;
  hasHood?: boolean;
  hasPads?: boolean;
  hasPustules?: boolean;
  hasExplosiveTank?: boolean;
  hasRiotVisor?: boolean;
}

export const HUMANOID_VARIANTS: VariantSpec[] = [
  {
    id: 'agra_biter',
    name: 'Agra Biter',
    skinColor: 0x86917a,
    clothColor: 0x3b423c,
    eyeColor: 0xfacc15,
    scale: 1.0,
    speed: 2.9,
    hp: 65,
    damage: 11,
  },
  {
    id: 'viral_runner',
    name: 'Viral Runner',
    skinColor: 0xa36d65,
    clothColor: 0x6b2c2a,
    eyeColor: 0xff3b30,
    scale: 0.96,
    speed: 5.5,
    hp: 52,
    damage: 10,
  },
  {
    id: 'hazmat_guard',
    name: 'Hazmat Guard',
    skinColor: 0x7a8f6f,
    clothColor: 0xd4a520,
    eyeColor: 0xa3e635,
    scale: 1.06,
    speed: 3.1,
    hp: 85,
    damage: 12,
    hasHood: true,
    hasExplosiveTank: true,
  },
  {
    id: 'riot_brute',
    name: 'Riot Brute',
    skinColor: 0x645b53,
    clothColor: 0x222938,
    eyeColor: 0xf97316,
    scale: 1.32,
    speed: 2.35,
    hp: 165,
    damage: 20,
    hasHelmet: true,
    hasPads: true,
    hasRiotVisor: true,
  },
  {
    id: 'shrieker',
    name: 'Night Shrieker',
    skinColor: 0x8d99ae,
    clothColor: 0x2c2738,
    eyeColor: 0x38bdf8,
    scale: 0.95,
    speed: 4.5,
    hp: 55,
    damage: 12,
  },
  {
    id: 'scavenger',
    name: 'Bazaar Scavenger',
    skinColor: 0x8f836d,
    clothColor: 0x5c4b37,
    eyeColor: 0xfde047,
    scale: 0.98,
    speed: 3.9,
    hp: 60,
    damage: 11,
    hasHood: true,
  },
  {
    id: 'stalker',
    name: 'Charbagh Stalker',
    skinColor: 0x4f5d56,
    clothColor: 0x1b2420,
    eyeColor: 0x22d3ee,
    scale: 1.02,
    speed: 4.8,
    hp: 70,
    damage: 13,
  },
  {
    id: 'blighted',
    name: 'Blighted Carrier',
    skinColor: 0x6e8554,
    clothColor: 0x394028,
    eyeColor: 0x84cc16,
    scale: 1.1,
    speed: 2.7,
    hp: 95,
    damage: 14,
    hasPustules: true,
  },
  {
    id: 'sentinel',
    name: 'Mausoleum Warden',
    skinColor: 0x918a82,
    clothColor: 0x4c1d24,
    eyeColor: 0xfef08a,
    scale: 1.14,
    speed: 3.4,
    hp: 120,
    damage: 15,
    hasHelmet: true,
  },
  {
    id: 'guard',
    name: 'Gate Trooper',
    skinColor: 0x6a7068,
    clothColor: 0x263242,
    eyeColor: 0xfbbf24,
    scale: 1.08,
    speed: 3.0,
    hp: 105,
    damage: 14,
    hasHelmet: true,
    hasPads: true,
  },
];

export interface SharedEntityAssets {
  torsoGeo: THREE.CapsuleGeometry;
  chestGeo: THREE.SphereGeometry;
  pelvisGeo: THREE.SphereGeometry;
  headGeo: THREE.SphereGeometry;
  jawGeo: THREE.SphereGeometry;
  armUpperGeo: THREE.CapsuleGeometry;
  armLowerGeo: THREE.CapsuleGeometry;
  handGeo: THREE.SphereGeometry;
  legUpperGeo: THREE.CapsuleGeometry;
  legLowerGeo: THREE.CapsuleGeometry;
  jointGeo: THREE.SphereGeometry;
  eyeGeo: THREE.SphereGeometry;
  hoodGeo: THREE.SphereGeometry;
  visorGeo: THREE.SphereGeometry;
  padGeo: THREE.SphereGeometry;
  pustuleGeo: THREE.SphereGeometry;
  tankGeo: THREE.CapsuleGeometry;
  tankValveGeo: THREE.SphereGeometry;

  houndBodyGeo: THREE.CapsuleGeometry;
  houndHaunchGeo: THREE.SphereGeometry;
  houndHeadGeo: THREE.SphereGeometry;
  houndSnoutGeo: THREE.CapsuleGeometry;
  houndLegGeo: THREE.CapsuleGeometry;
  houndSpikeGeo: THREE.ConeGeometry;

  shadowGeo: THREE.PlaneGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  lightningGeo: THREE.BufferGeometry;
  lightningMat: THREE.MeshBasicMaterial;

  skinMaterials: Map<string, THREE.MeshStandardMaterial>;
  clothMaterials: Map<string, THREE.MeshStandardMaterial>;
  eyeMaterials: Map<number, THREE.MeshBasicMaterial>;
  houndSkinMat: THREE.MeshStandardMaterial;
  houndSpikeMat: THREE.MeshStandardMaterial;
  pustuleMat: THREE.MeshStandardMaterial;
  redTankMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;

  dispose: () => void;
}

export function createSharedEntityAssets(textures: ProceduralTextureSet): SharedEntityAssets {
  const torsoGeo = new THREE.CapsuleGeometry(0.22, 0.44, 12, 20);
  const chestGeo = new THREE.SphereGeometry(0.24, 18, 14);
  const pelvisGeo = new THREE.SphereGeometry(0.2, 16, 12);
  const headGeo = new THREE.SphereGeometry(0.175, 20, 16);
  const jawGeo = new THREE.SphereGeometry(0.105, 14, 10);
  const armUpperGeo = new THREE.CapsuleGeometry(0.075, 0.26, 10, 16);
  const armLowerGeo = new THREE.CapsuleGeometry(0.062, 0.25, 10, 16);
  const handGeo = new THREE.SphereGeometry(0.068, 12, 10);
  const legUpperGeo = new THREE.CapsuleGeometry(0.095, 0.32, 10, 16);
  const legLowerGeo = new THREE.CapsuleGeometry(0.076, 0.34, 10, 16);
  const jointGeo = new THREE.SphereGeometry(0.086, 14, 10);
  const eyeGeo = new THREE.SphereGeometry(0.028, 12, 10);
  const hoodGeo = new THREE.SphereGeometry(0.205, 18, 14);
  const visorGeo = new THREE.SphereGeometry(0.185, 16, 12, 0, Math.PI, 0.25, 0.9);
  const padGeo = new THREE.SphereGeometry(0.135, 16, 12);
  const pustuleGeo = new THREE.SphereGeometry(0.072, 12, 10);
  const tankGeo = new THREE.CapsuleGeometry(0.13, 0.36, 12, 18);
  const tankValveGeo = new THREE.SphereGeometry(0.06, 12, 10);

  const houndBodyGeo = new THREE.CapsuleGeometry(0.2, 0.62, 12, 20);
  const houndHaunchGeo = new THREE.SphereGeometry(0.22, 18, 14);
  const houndHeadGeo = new THREE.SphereGeometry(0.16, 18, 14);
  const houndSnoutGeo = new THREE.CapsuleGeometry(0.075, 0.18, 10, 14);
  const houndLegGeo = new THREE.CapsuleGeometry(0.056, 0.34, 8, 14);
  const houndSpikeGeo = new THREE.ConeGeometry(0.045, 0.22, 10);

  const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });

  const boltShape = new THREE.Shape();
  boltShape.moveTo(0.04, 0.34);
  boltShape.lineTo(-0.14, 0.02);
  boltShape.lineTo(-0.01, 0.02);
  boltShape.lineTo(-0.08, -0.32);
  boltShape.lineTo(0.16, 0.04);
  boltShape.lineTo(0.02, 0.04);
  boltShape.closePath();
  const lightningGeo = new THREE.ShapeGeometry(boltShape);
  const lightningMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    side: THREE.DoubleSide,
  });

  const skinMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const clothMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const eyeMaterials = new Map<number, THREE.MeshBasicMaterial>();

  for (const v of HUMANOID_VARIANTS) {
    skinMaterials.set(
      v.id,
      new THREE.MeshStandardMaterial({
        color: v.skinColor,
        map: textures.zombieSkin,
        roughness: 0.76,
        metalness: 0.06,
      }),
    );
    clothMaterials.set(
      v.id,
      new THREE.MeshStandardMaterial({
        color: v.clothColor,
        map: textures.zombieCloth,
        roughness: 0.86,
        metalness: v.hasHelmet || v.hasPads ? 0.34 : 0.08,
      }),
    );
    if (!eyeMaterials.has(v.eyeColor)) {
      eyeMaterials.set(v.eyeColor, new THREE.MeshBasicMaterial({ color: v.eyeColor }));
    }
  }

  const houndSkinMat = new THREE.MeshStandardMaterial({
    color: 0x4a2528,
    map: textures.zombieSkin,
    roughness: 0.72,
    metalness: 0.1,
  });
  const houndSpikeMat = new THREE.MeshStandardMaterial({
    color: 0xd6cfc2,
    roughness: 0.4,
    metalness: 0.25,
  });
  const pustuleMat = new THREE.MeshStandardMaterial({
    color: 0x84cc16,
    emissive: 0x65a30d,
    emissiveIntensity: 1.35,
    roughness: 0.35,
  });
  const redTankMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0x7f1d1d,
    emissiveIntensity: 0.85,
    roughness: 0.32,
    metalness: 0.65,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.18,
    metalness: 0.85,
  });

  if (!eyeMaterials.has(0xff3b30)) {
    eyeMaterials.set(0xff3b30, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  }

  return {
    torsoGeo,
    chestGeo,
    pelvisGeo,
    headGeo,
    jawGeo,
    armUpperGeo,
    armLowerGeo,
    handGeo,
    legUpperGeo,
    legLowerGeo,
    jointGeo,
    eyeGeo,
    hoodGeo,
    visorGeo,
    padGeo,
    pustuleGeo,
    tankGeo,
    tankValveGeo,
    houndBodyGeo,
    houndHaunchGeo,
    houndHeadGeo,
    houndSnoutGeo,
    houndLegGeo,
    houndSpikeGeo,
    shadowGeo,
    shadowMat,
    lightningGeo,
    lightningMat,
    skinMaterials,
    clothMaterials,
    eyeMaterials,
    houndSkinMat,
    houndSpikeMat,
    pustuleMat,
    redTankMat,
    visorMat,
    dispose: () => {
      torsoGeo.dispose();
      chestGeo.dispose();
      pelvisGeo.dispose();
      headGeo.dispose();
      jawGeo.dispose();
      armUpperGeo.dispose();
      armLowerGeo.dispose();
      handGeo.dispose();
      legUpperGeo.dispose();
      legLowerGeo.dispose();
      jointGeo.dispose();
      eyeGeo.dispose();
      hoodGeo.dispose();
      visorGeo.dispose();
      padGeo.dispose();
      pustuleGeo.dispose();
      tankGeo.dispose();
      tankValveGeo.dispose();
      houndBodyGeo.dispose();
      houndHaunchGeo.dispose();
      houndHeadGeo.dispose();
      houndSnoutGeo.dispose();
      houndLegGeo.dispose();
      houndSpikeGeo.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      lightningGeo.dispose();
      lightningMat.dispose();
      skinMaterials.forEach((m) => m.dispose());
      clothMaterials.forEach((m) => m.dispose());
      eyeMaterials.forEach((m) => m.dispose());
      houndSkinMat.dispose();
      houndSpikeMat.dispose();
      pustuleMat.dispose();
      redTankMat.dispose();
      visorMat.dispose();
    },
  };
}

export interface EnemyActor {
  id: number;
  kind: EnemyKind;
  name: string;
  hasExplosiveTank: boolean;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  counterIcon: THREE.Mesh;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  velocity: THREE.Vector3;
  attackCooldown: number;
  windupTimer: number;
  staggerTimer: number;
  hitFlashTimer: number;
  walkPhase: number;
  dead: boolean;
  deathTimer: number;
}

export function buildEnemyActor(
  id: number,
  kind: EnemyKind,
  assets: SharedEntityAssets,
): EnemyActor {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const shadow = new THREE.Mesh(assets.shadowGeo, assets.shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);

  const counterIcon = new THREE.Mesh(assets.lightningGeo, assets.lightningMat);
  counterIcon.visible = false;
  root.add(counterIcon);

  if (kind === 'hound') {
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();

    const torso = new THREE.Mesh(assets.houndBodyGeo, assets.houndSkinMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.52, 0);
    torso.castShadow = true;
    bodyPivot.add(torso);

    const chest = new THREE.Mesh(assets.houndHaunchGeo, assets.houndSkinMat);
    chest.position.set(0, 0.56, 0.24);
    bodyPivot.add(chest);

    const head = new THREE.Mesh(assets.houndHeadGeo, assets.houndSkinMat);
    head.position.set(0, 0.68, 0.5);
    bodyPivot.add(head);

    const snout = new THREE.Mesh(assets.houndSnoutGeo, assets.houndSkinMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.64, 0.66);
    bodyPivot.add(snout);

    const eyeMat = assets.eyeMaterials.get(0xff3b30)!;
    const eyeL = new THREE.Mesh(assets.eyeGeo, eyeMat);
    eyeL.position.set(-0.07, 0.72, 0.62);
    const eyeR = new THREE.Mesh(assets.eyeGeo, eyeMat);
    eyeR.position.set(0.07, 0.72, 0.62);
    bodyPivot.add(eyeL, eyeR);

    for (let s = 0; s < 5; s++) {
      const spike = new THREE.Mesh(assets.houndSpikeGeo, assets.houndSpikeMat);
      spike.position.set(0, 0.76 - s * 0.02, 0.28 - s * 0.16);
      spike.rotation.x = -0.35;
      bodyPivot.add(spike);
    }

    const flMesh = new THREE.Mesh(assets.houndLegGeo, assets.houndSkinMat);
    flMesh.position.y = -0.2;
    leftArm.position.set(-0.15, 0.45, 0.26);
    leftArm.add(flMesh);

    const frMesh = new THREE.Mesh(assets.houndLegGeo, assets.houndSkinMat);
    frMesh.position.y = -0.2;
    rightArm.position.set(0.15, 0.45, 0.26);
    rightArm.add(frMesh);

    const rlMesh = new THREE.Mesh(assets.houndLegGeo, assets.houndSkinMat);
    rlMesh.position.y = -0.2;
    leftLeg.position.set(-0.15, 0.45, -0.28);
    leftLeg.add(rlMesh);

    const rrMesh = new THREE.Mesh(assets.houndLegGeo, assets.houndSkinMat);
    rrMesh.position.y = -0.2;
    rightLeg.position.set(0.15, 0.45, -0.28);
    rightLeg.add(rrMesh);

    bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
    counterIcon.position.set(0, 1.35, 0);

    return {
      id,
      kind,
      name: 'Spiked Hound',
      hasExplosiveTank: false,
      root,
      bodyPivot,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      counterIcon,
      hp: 45,
      maxHp: 45,
      speed: 6.2,
      damage: 12,
      radius: 0.55,
      velocity: new THREE.Vector3(),
      attackCooldown: 0.6,
      windupTimer: 0,
      staggerTimer: 0,
      hitFlashTimer: 0,
      walkPhase: Math.random() * Math.PI * 2,
      dead: false,
      deathTimer: 0,
    };
  }

  // Smooth, articulated humanoid zombie (Capsule + Sphere only, zero blocks!)
  const spec = HUMANOID_VARIANTS.find((v) => v.id === kind) ?? HUMANOID_VARIANTS[0];
  const skinMat = assets.skinMaterials.get(spec.id)!;
  const clothMat = assets.clothMaterials.get(spec.id)!;
  const eyeMat = assets.eyeMaterials.get(spec.eyeColor)!;

  bodyPivot.scale.setScalar(spec.scale);

  // Articulated legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.13, 0.86, 0);
  const lThigh = new THREE.Mesh(assets.legUpperGeo, clothMat);
  lThigh.position.y = -0.22;
  const lKnee = new THREE.Mesh(assets.jointGeo, skinMat);
  lKnee.position.y = -0.44;
  const lShin = new THREE.Mesh(assets.legLowerGeo, skinMat);
  lShin.position.y = -0.64;
  leftLeg.add(lThigh, lKnee, lShin);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.13, 0.86, 0);
  const rThigh = new THREE.Mesh(assets.legUpperGeo, clothMat);
  rThigh.position.y = -0.22;
  const rKnee = new THREE.Mesh(assets.jointGeo, skinMat);
  rKnee.position.y = -0.44;
  const rShin = new THREE.Mesh(assets.legLowerGeo, skinMat);
  rShin.position.y = -0.64;
  rightLeg.add(rThigh, rKnee, rShin);

  // Sculpted torso (pelvis + ribcage + waist)
  const pelvis = new THREE.Mesh(assets.pelvisGeo, clothMat);
  pelvis.position.set(0, 0.94, 0);
  const torso = new THREE.Mesh(assets.torsoGeo, clothMat);
  torso.position.set(0, 1.24, 0);
  torso.castShadow = true;
  const chest = new THREE.Mesh(assets.chestGeo, clothMat);
  chest.position.set(0, 1.4, 0.02);
  chest.scale.set(1.12, 0.92, 0.9);

  // Head + Jaw + Glowing Eyes
  const head = new THREE.Mesh(assets.headGeo, skinMat);
  head.position.set(0, 1.78, 0.04);
  head.castShadow = true;

  const jaw = new THREE.Mesh(assets.jawGeo, skinMat);
  jaw.position.set(0, 1.67, 0.12);

  const eyeL = new THREE.Mesh(assets.eyeGeo, eyeMat);
  eyeL.position.set(-0.06, 1.8, 0.17);
  const eyeR = new THREE.Mesh(assets.eyeGeo, eyeMat);
  eyeR.position.set(0.06, 1.8, 0.17);

  // Articulated arms with elbow joints & fists
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 1.48, 0);
  const lShoulder = new THREE.Mesh(assets.jointGeo, clothMat);
  const lUpper = new THREE.Mesh(assets.armUpperGeo, clothMat);
  lUpper.position.y = -0.19;
  const lElbow = new THREE.Mesh(assets.jointGeo, skinMat);
  lElbow.scale.setScalar(0.8);
  lElbow.position.y = -0.36;
  const lFore = new THREE.Mesh(assets.armLowerGeo, skinMat);
  lFore.position.set(0, -0.5, 0.1);
  lFore.rotation.x = -0.52;
  const lHand = new THREE.Mesh(assets.handGeo, skinMat);
  lHand.position.set(0, -0.63, 0.2);
  leftArm.add(lShoulder, lUpper, lElbow, lFore, lHand);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 1.48, 0);
  const rShoulder = new THREE.Mesh(assets.jointGeo, clothMat);
  const rUpper = new THREE.Mesh(assets.armUpperGeo, clothMat);
  rUpper.position.y = -0.19;
  const rElbow = new THREE.Mesh(assets.jointGeo, skinMat);
  rElbow.scale.setScalar(0.8);
  rElbow.position.y = -0.36;
  const rFore = new THREE.Mesh(assets.armLowerGeo, skinMat);
  rFore.position.set(0, -0.5, 0.1);
  rFore.rotation.x = -0.52;
  const rHand = new THREE.Mesh(assets.handGeo, skinMat);
  rHand.position.set(0, -0.63, 0.2);
  rightArm.add(rShoulder, rUpper, rElbow, rFore, rHand);

  bodyPivot.add(leftLeg, rightLeg, pelvis, torso, chest, head, jaw, eyeL, eyeR, leftArm, rightArm);

  if (spec.hasHelmet || spec.hasHood) {
    const cap = new THREE.Mesh(assets.hoodGeo, clothMat);
    cap.position.set(0, 1.82, 0.01);
    cap.scale.set(1, 0.85, 1.05);
    bodyPivot.add(cap);
  }
  if (spec.hasRiotVisor) {
    const visor = new THREE.Mesh(assets.visorGeo, assets.visorMat);
    visor.position.set(0, 1.8, 0.04);
    visor.rotation.y = Math.PI / 2;
    bodyPivot.add(visor);
  }
  if (spec.hasPads) {
    const padL = new THREE.Mesh(assets.padGeo, clothMat);
    padL.position.set(-0.34, 1.5, 0);
    const padR = new THREE.Mesh(assets.padGeo, clothMat);
    padR.position.set(0.34, 1.5, 0);
    bodyPivot.add(padL, padR);
  }
  if (spec.hasPustules) {
    const p1 = new THREE.Mesh(assets.pustuleGeo, assets.pustuleMat);
    p1.position.set(-0.14, 1.38, 0.22);
    const p2 = new THREE.Mesh(assets.pustuleGeo, assets.pustuleMat);
    p2.position.set(0.18, 1.18, 0.21);
    const p3 = new THREE.Mesh(assets.pustuleGeo, assets.pustuleMat);
    p3.position.set(0.05, 1.45, -0.21);
    bodyPivot.add(p1, p2, p3);
  }
  if (spec.hasExplosiveTank) {
    const tank = new THREE.Mesh(assets.tankGeo, assets.redTankMat);
    tank.position.set(0, 1.32, -0.29);
    const valve = new THREE.Mesh(assets.tankValveGeo, assets.visorMat);
    valve.position.set(0, 1.62, -0.29);
    bodyPivot.add(tank, valve);
  }

  counterIcon.position.set(0, 2.32 * spec.scale, 0);

  return {
    id,
    kind,
    name: spec.name,
    hasExplosiveTank: Boolean(spec.hasExplosiveTank),
    root,
    bodyPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    counterIcon,
    hp: spec.hp,
    maxHp: spec.hp,
    speed: spec.speed,
    damage: spec.damage,
    radius: 0.45 * spec.scale,
    velocity: new THREE.Vector3(),
    attackCooldown: 0.7,
    windupTimer: 0,
    staggerTimer: 0,
    hitFlashTimer: 0,
    walkPhase: Math.random() * Math.PI * 2,
    dead: false,
    deathTimer: 0,
  };
}

/**
 * Builds Havildar Vikram NPC (matching reference character sheet: buzzcut,
 * salt-and-pepper beard, charcoal tee, olive MOLLE plate carrier with 3 mag
 * pouches, ammo belt, drop-leg holster, knee pads, combat boots) armed with a
 * classic M16 rifle (tapered buttstock, arched carry handle, curved magazine,
 * ribbed handguard, A-frame front sight) + muzzle flash mesh.
 * All humanoid anatomy uses smooth CapsuleGeometry & SphereGeometry (zero blocks).
 */
export function buildVikramNpc(textures: ProceduralTextureSet): {
  group: THREE.Group;
  muzzleFlash: THREE.Mesh;
} {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x8d5b3e,
    roughness: 0.68,
    metalness: 0.04,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1d1c1b,
    roughness: 0.92,
  });
  const beardMat = new THREE.MeshStandardMaterial({
    color: 0x2d2c2b,
    roughness: 0.9,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: 0x43484a,
    map: textures.zombieCloth,
    roughness: 0.88,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: 0x4b5637,
    map: textures.zombieCloth,
    roughness: 0.84,
    metalness: 0.08,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x3e4730,
    map: textures.zombieCloth,
    roughness: 0.86,
  });
  const gearDarkMat = new THREE.MeshStandardMaterial({
    color: 0x2b3025,
    roughness: 0.78,
    metalness: 0.14,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x4c3f34,
    roughness: 0.85,
  });
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x9e2a2b,
    roughness: 0.45,
    metalness: 0.2,
  });
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x292d33,
    roughness: 0.36,
    metalness: 0.86,
  });
  const gunSteelMat = new THREE.MeshStandardMaterial({
    color: 0x3e444c,
    roughness: 0.28,
    metalness: 0.92,
  });

  // Legs: Olive cargo trousers + molded knee pads + combat boots
  const buildLeg = (side: -1 | 1) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.9, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 10, 16), pantsMat);
    thigh.position.y = -0.2;
    const cargoPocket = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.14, 8, 12), vestMat);
    cargoPocket.position.set(side * 0.08, -0.24, 0.01);

    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), gearDarkMat);
    kneePad.position.set(0, -0.43, 0.05);
    kneePad.scale.set(0.95, 1.1, 0.65);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.092, 0.32, 10, 16), pantsMat);
    shin.position.y = -0.64;

    const bootAnkle = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.12, 8, 14), bootMat);
    bootAnkle.position.set(0, -0.8, 0.01);
    const bootToe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), bootMat);
    bootToe.position.set(0, -0.85, 0.07);
    bootToe.scale.set(0.92, 0.62, 1.45);

    leg.add(thigh, cargoPocket, kneePad, shin, bootAnkle, bootToe);

    // Right thigh drop-leg pistol holster
    if (side === 1) {
      const holster = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 8, 12), vestMat);
      holster.position.set(0.11, -0.22, 0.02);
      const strap1 = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 6, 18), gearDarkMat);
      strap1.rotation.x = Math.PI / 2;
      strap1.position.y = -0.17;
      const strap2 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 18), gearDarkMat);
      strap2.rotation.x = Math.PI / 2;
      strap2.position.y = -0.27;
      leg.add(holster, strap1, strap2);
    }

    return leg;
  };

  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // Pelvis & Tactical Belt with Shotgun Shells
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), pantsMat);
  pelvis.position.set(0, 0.94, 0);
  pelvis.scale.set(1.08, 0.78, 0.88);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.075, 20), gearDarkMat);
  belt.position.set(0, 0.99, 0);
  belt.scale.set(1.08, 1, 0.88);

  for (let s = 0; s < 4; s++) {
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.045, 6, 8), shellMat);
    shell.position.set(-0.18 + s * 0.036, 0.99, 0.165);
    group.add(shell);
  }

  // Charcoal T-Shirt Torso + Olive MOLLE Plate Carrier Vest & 3 Front Mag Pouches
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.225, 0.48, 12, 18), shirtMat);
  torso.position.set(0, 1.27, 0);
  torso.scale.set(1.12, 1, 0.86);

  const vestPlateFront = new THREE.Mesh(new THREE.CapsuleGeometry(0.195, 0.28, 10, 16), vestMat);
  vestPlateFront.position.set(0, 1.31, 0.06);
  vestPlateFront.scale.set(1.08, 1, 0.65);

  const vestPlateBack = new THREE.Mesh(new THREE.CapsuleGeometry(0.195, 0.3, 10, 16), vestMat);
  vestPlateBack.position.set(0, 1.31, -0.06);
  vestPlateBack.scale.set(1.08, 1, 0.62);

  // 3 front rifle mag pouches on plate carrier
  for (let p = -1; p <= 1; p++) {
    const pouch = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.11, 8, 12), vestMat);
    pouch.position.set(p * 0.095, 1.15, 0.195);
    pouch.scale.set(0.92, 1, 0.65);
    group.add(pouch);
  }

  // Shoulder straps connecting front & back plate carrier
  [-0.14, 0.14].forEach((sx) => {
    const strap = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 6, 10), vestMat);
    strap.position.set(sx, 1.54, 0);
    strap.rotation.x = Math.PI / 2;
    group.add(strap);
  });

  // Head: Buzzcut dark hair + weathered skin + salt-and-pepper beard
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.1, 8, 12), skinMat);
  neck.position.set(0, 1.6, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skinMat);
  head.position.set(0, 1.74, 0.01);
  head.scale.set(0.94, 1.06, 0.98);

  const buzzcut = new THREE.Mesh(new THREE.SphereGeometry(0.163, 18, 14), hairMat);
  buzzcut.position.set(0, 1.77, -0.005);
  buzzcut.scale.set(0.95, 0.98, 0.98);

  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 12), beardMat);
  beard.position.set(0, 1.67, 0.045);
  beard.scale.set(0.92, 0.82, 0.88);

  // Arms: Charcoal short sleeves + bare muscular forearms + fingerless knuckle gloves
  const buildArm = (side: -1 | 1, rotX: number, rotZ: number, posZ: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 1.48, 0.02);
    arm.rotation.set(rotX, 0, rotZ);

    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.16, 10, 14), shirtMat);
    sleeve.position.y = -0.11;

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.24, 10, 14), skinMat);
    forearm.position.set(0, -0.32, posZ);
    forearm.rotation.x = -0.45;

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), vestMat);
    glove.position.set(0, -0.46, posZ + 0.09);
    glove.scale.set(0.85, 0.9, 1.15);

    arm.add(sleeve, forearm, glove);
    return arm;
  };

  const armL = buildArm(-1, -0.82, -0.34, 0.07);
  const armR = buildArm(1, -0.78, 0.12, 0.05);

  // Classic M16 Rifle Assembly (matching reference sheet: tapered stock, carry handle, curved mag, ribbed handguard, A-frame front sight)
  const m16Group = new THREE.Group();
  m16Group.position.set(0.05, 1.28, 0.34);

  // Tapered fixed buttstock (ExtrudeGeometry side profile)
  const stockShape = new THREE.Shape();
  stockShape.moveTo(0, 0.02);
  stockShape.lineTo(-0.28, 0.03);
  stockShape.lineTo(-0.28, -0.11);
  stockShape.lineTo(-0.02, -0.04);
  stockShape.closePath();
  const stockGeo = new THREE.ExtrudeGeometry(stockShape, {
    depth: 0.034,
    bevelEnabled: true,
    bevelSize: 0.005,
    bevelThickness: 0.005,
  });
  stockGeo.translate(0, 0, -0.017);
  const buttstock = new THREE.Mesh(stockGeo, gunMat);
  buttstock.rotation.y = -Math.PI / 2;
  buttstock.position.set(0, 0, -0.1);

  // Upper/Lower Receiver + Angled Pistol Grip
  const receiver = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.24, 8, 14), gunSteelMat);
  receiver.rotation.x = Math.PI / 2;
  receiver.position.set(0, 0.01, 0.02);

  const pistolGrip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.1, 8, 10), gunMat);
  pistolGrip.position.set(0, -0.075, -0.05);
  pistolGrip.rotation.x = 0.42;

  // Arched Carrying Handle over receiver
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.04, -0.07),
    new THREE.Vector3(0, 0.095, -0.03),
    new THREE.Vector3(0, 0.095, 0.07),
    new THREE.Vector3(0, 0.04, 0.11),
  ]);
  const carryHandle = new THREE.Mesh(
    new THREE.TubeGeometry(handleCurve, 14, 0.014, 8, false),
    gunSteelMat,
  );

  // Curved 30-Round Magazine
  const magCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.01, 0.08),
    new THREE.Vector3(0, -0.11, 0.095),
    new THREE.Vector3(0, -0.2, 0.135),
  ]);
  const magazine = new THREE.Mesh(
    new THREE.TubeGeometry(magCurve, 10, 0.024, 8, false),
    gunSteelMat,
  );
  magazine.scale.set(0.65, 1, 1.35);

  // Long Ribbed Cylindrical Handguard
  const handguard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.035, 0.34, 14),
    gunMat,
  );
  handguard.rotation.x = Math.PI / 2;
  handguard.position.set(0, 0.015, 0.32);

  // Barrel & Flash Hider
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.32, 10), gunSteelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, 0.6);

  // Triangular A-Frame Front Sight Post
  const sightShape = new THREE.Shape();
  sightShape.moveTo(-0.025, 0);
  sightShape.lineTo(0.025, 0);
  sightShape.lineTo(0.006, 0.068);
  sightShape.lineTo(-0.01, 0.068);
  sightShape.closePath();
  const sightGeo = new THREE.ExtrudeGeometry(sightShape, {
    depth: 0.016,
    bevelEnabled: false,
  });
  sightGeo.translate(0, 0, -0.008);
  const frontSight = new THREE.Mesh(sightGeo, gunSteelMat);
  frontSight.rotation.y = -Math.PI / 2;
  frontSight.position.set(0, 0.025, 0.54);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfef08a }),
  );
  muzzleFlash.position.set(0, 0.015, 0.78);
  muzzleFlash.visible = false;

  m16Group.add(
    buttstock,
    receiver,
    pistolGrip,
    carryHandle,
    magazine,
    handguard,
    barrel,
    frontSight,
    muzzleFlash,
  );
  group.add(
    legL,
    legR,
    pelvis,
    belt,
    torso,
    vestPlateFront,
    vestPlateBack,
    neck,
    head,
    buzzcut,
    beard,
    armL,
    armR,
    m16Group,
  );

  return { group, muzzleFlash };
}

interface FingerBones {
  root: THREE.Group;
  mid: THREE.Group;
  tip: THREE.Group;
  baseRootX: number;
  baseSpreadZ: number;
}

type HandBoneMap = {
  thumb: FingerBones;
  index: FingerBones;
  middle: FingerBones;
  ring: FingerBones;
  pinky: FingerBones;
};

/**
 * Builds First-Person articulated arms, bare left hand with chunky cyan LED watch,
 * tan/black tactical right glove, and 3 weapons: [1] Serrated Kukri, [2] Heavy Pipe, [3] Subcompact Pistol.
 * Strictly uses smooth CapsuleGeometry and SphereGeometry for all hands, fingers, and limbs.
 */
export function buildFirstPersonRig(textures: ProceduralTextureSet): {
  rig: THREE.Group;
  rightArmGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  leftHandPivot: THREE.Group;
  rightHandPivot: THREE.Group;
  dropkickLeg: THREE.Group;
  kukriGroup: THREE.Group;
  pipeGroup: THREE.Group;
  pistolGroup: THREE.Group;
  pistolMuzzleFlash: THREE.Mesh;
  setWeapon: (w: WeaponKind) => void;
  updateHandPoses: (leftPose: HandPose, rightPose: HandPose, dt: number, slideKick: number) => void;
  dispose: () => void;
} {
  const rig = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const tg = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const tm = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };

  const sleeveMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x3b443b,
      map: textures.zombieCloth,
      roughness: 0.85,
    }),
  );
  const skinMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0xe3b18c,
      map: textures.skinDetail,
      roughness: 0.68,
      metalness: 0.04,
    }),
  );
  const nailMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0xdcc4b0,
      roughness: 0.45,
      metalness: 0.05,
    }),
  );
  const gloveBlackMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x1d2025,
      map: textures.tacticalGlove,
      roughness: 0.74,
      metalness: 0.14,
    }),
  );
  const gloveTanMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0xd4c8ae,
      map: textures.wristWrapTape,
      roughness: 0.82,
      metalness: 0.04,
    }),
  );
  const armorPlateMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x262930,
      roughness: 0.5,
      metalness: 0.35,
    }),
  );
  const watchRubberMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.65,
      metalness: 0.18,
    }),
  );
  const watchDialMat = tm(
    new THREE.MeshStandardMaterial({
      map: textures.tealWindow,
      emissiveMap: textures.tealWindow,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.2,
    }),
  );
  const bladeSteelMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0xd1d7e0,
      map: textures.diamondPlate,
      roughness: 0.28,
      metalness: 0.88,
    }),
  );
  const bladeSpineMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x3f4652,
      roughness: 0.42,
      metalness: 0.82,
    }),
  );
  const rustedPipeMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x7a5c48,
      roughness: 0.56,
      metalness: 0.74,
    }),
  );
  const wrapMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 0.9,
    }),
  );
  const pistolFrameMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x22252a,
      map: textures.batGripTape,
      roughness: 0.78,
      metalness: 0.15,
    }),
  );
  const pistolSlideMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0xd4d8de,
      map: textures.rustedMetal,
      roughness: 0.28,
      metalness: 0.82,
    }),
  );
  const pistolDarkMetalMat = tm(
    new THREE.MeshStandardMaterial({
      color: 0x15171b,
      roughness: 0.38,
      metalness: 0.8,
    }),
  );
  const muzzleMat = tm(
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Smooth 3-phalanx articulated finger builder (CapsuleGeometry + SphereGeometry joints, zero cubes)
  const buildArticulatedFinger = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    basePos: [number, number, number],
    rotEuler: [number, number, number],
    radius: number,
    proxLen: number,
    midLen: number,
    distLen: number,
    withNail: boolean,
  ): FingerBones => {
    const root = new THREE.Group();
    root.position.set(basePos[0], basePos[1], basePos[2]);
    root.rotation.set(rotEuler[0], rotEuler[1], rotEuler[2]);

    const knuckle = new THREE.Mesh(tg(new THREE.SphereGeometry(radius * 1.18, 10, 8)), mat);
    root.add(knuckle);

    const prox = new THREE.Mesh(tg(new THREE.CapsuleGeometry(radius, proxLen, 6, 10)), mat);
    prox.position.set(0, proxLen * 0.5 + radius * 0.35, 0);
    root.add(prox);

    const mid = new THREE.Group();
    mid.position.set(0, proxLen + radius * 0.65, 0);
    const midSph = new THREE.Mesh(tg(new THREE.SphereGeometry(radius * 0.98, 8, 8)), mat);
    const midPhalanx = new THREE.Mesh(
      tg(new THREE.CapsuleGeometry(radius * 0.9, midLen, 6, 10)),
      mat,
    );
    midPhalanx.position.set(0, midLen * 0.5 + radius * 0.2, 0);
    mid.add(midSph, midPhalanx);

    const tip = new THREE.Group();
    tip.position.set(0, midLen + radius * 0.45, 0);
    const tipSph = new THREE.Mesh(tg(new THREE.SphereGeometry(radius * 0.85, 8, 8)), mat);
    const distPhalanx = new THREE.Mesh(
      tg(new THREE.CapsuleGeometry(radius * 0.8, distLen, 6, 10)),
      mat,
    );
    distPhalanx.position.set(0, distLen * 0.5 + radius * 0.15, 0);
    tip.add(tipSph, distPhalanx);

    if (withNail) {
      const nail = new THREE.Mesh(tg(new THREE.SphereGeometry(radius * 0.58, 8, 6)), nailMat);
      nail.scale.set(0.85, 1.15, 0.35);
      nail.position.set(0, distLen + radius * 0.25, radius * 0.48);
      tip.add(nail);
    }

    mid.add(tip);
    root.add(mid);
    parent.add(root);

    return {
      root,
      mid,
      tip,
      baseRootX: rotEuler[0],
      baseSpreadZ: rotEuler[2],
    };
  };

  // =========================================================================
  // LEFT ARM & BARE WEATHERED HAND + CHUNKY CYAN DIGITAL WATCH (Bottom-Left)
  // Supports ALL poses from image_6b81e5ea.png: open, fist, point, peace, thumbsUp
  // =========================================================================
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.34, -0.27, -0.43);

  const leftHandPivot = new THREE.Group();
  leftHandPivot.rotation.set(-0.46, 0.24, -0.78);
  leftArmGroup.add(leftHandPivot);

  const lForearm = new THREE.Mesh(tg(new THREE.CapsuleGeometry(0.056, 0.28, 10, 16)), skinMat);
  lForearm.position.set(0, -0.18, 0.03);
  lForearm.rotation.x = 0.22;
  leftHandPivot.add(lForearm);

  // Chunky matte-black digital tactical wristwatch around wrist
  const watchGroup = new THREE.Group();
  watchGroup.position.set(0, -0.085, 0.014);
  watchGroup.rotation.x = 0.14;
  const watchStrap = new THREE.Mesh(
    tg(new THREE.TorusGeometry(0.058, 0.015, 10, 22)),
    watchRubberMat,
  );
  watchStrap.rotation.x = Math.PI / 2;
  watchStrap.scale.set(1.06, 0.9, 1.3);
  const watchBezel = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.036, 0.04, 0.018, 20)),
    watchRubberMat,
  );
  watchBezel.position.set(0.008, 0.004, 0.052);
  watchBezel.rotation.x = Math.PI / 2;
  const watchDial = new THREE.Mesh(tg(new THREE.CircleGeometry(0.029, 20)), watchDialMat);
  watchDial.position.set(0.008, 0.004, 0.062);
  watchGroup.add(watchStrap, watchBezel, watchDial);
  leftHandPivot.add(watchGroup);

  const lPalm = new THREE.Mesh(tg(new THREE.SphereGeometry(0.062, 18, 14)), skinMat);
  lPalm.scale.set(0.95, 1.15, 0.42);
  lPalm.position.set(0, 0.015, 0);
  leftHandPivot.add(lPalm);

  const leftBones: HandBoneMap = {
    thumb: buildArticulatedFinger(leftHandPivot, skinMat, [0.052, -0.012, 0.008], [0.18, 0.0, -0.82], 0.0135, 0.032, 0.024, 0.018, true),
    index: buildArticulatedFinger(leftHandPivot, skinMat, [0.038, 0.072, 0.004], [0.22, 0.0, -0.24], 0.0115, 0.036, 0.026, 0.018, true),
    middle: buildArticulatedFinger(leftHandPivot, skinMat, [0.011, 0.078, 0.003], [0.24, 0.0, -0.04], 0.012, 0.04, 0.028, 0.02, true),
    ring: buildArticulatedFinger(leftHandPivot, skinMat, [-0.017, 0.073, 0.002], [0.26, 0.0, 0.14], 0.011, 0.037, 0.026, 0.018, true),
    pinky: buildArticulatedFinger(leftHandPivot, skinMat, [-0.042, 0.062, 0.0], [0.28, 0.0, 0.34], 0.0098, 0.028, 0.02, 0.016, true),
  };

  // =========================================================================
  // RIGHT ARM, TAN/BLACK TACTICAL GLOVE & WEAPONS (Kukri, Pipe, Subcompact Pistol)
  // Matches both image_c1a33172.png (Kukri grip) & image_70c3ca82.png (Pistol & Tan/Black Glove)
  // =========================================================================
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.32, -0.28, -0.41);

  const rightHandPivot = new THREE.Group();
  rightHandPivot.rotation.set(0.18, 0.32, 0.36);
  rightArmGroup.add(rightHandPivot);

  // Bare weathered dirty forearm entering from bottom-right (matches image_70c3ca82.png)
  const rForearm = new THREE.Mesh(tg(new THREE.CapsuleGeometry(0.058, 0.31, 10, 16)), skinMat);
  rForearm.position.set(0.08, -0.15, 0.12);
  rForearm.rotation.set(0.85, 0, -0.45);
  rightHandPivot.add(rForearm);

  // Dark velcro wrist cuff strap
  const rCuff = new THREE.Mesh(tg(new THREE.TorusGeometry(0.055, 0.014, 8, 18)), gloveBlackMat);
  rCuff.position.set(0.02, -0.055, 0.03);
  rCuff.rotation.x = Math.PI / 2.2;
  rightHandPivot.add(rCuff);

  // Black synthetic palm base + tan/cream weathered back-of-hand overlay
  const rPalm = new THREE.Mesh(tg(new THREE.SphereGeometry(0.058, 18, 14)), gloveBlackMat);
  rPalm.scale.set(0.95, 1.05, 0.62);
  rPalm.position.set(0, 0.01, -0.01);
  const rPalmTanOverlay = new THREE.Mesh(tg(new THREE.SphereGeometry(0.054, 14, 10)), gloveTanMat);
  rPalmTanOverlay.scale.set(0.92, 0.98, 0.42);
  rPalmTanOverlay.position.set(0.005, 0.016, 0.014);
  rightHandPivot.add(rPalm, rPalmTanOverlay);

  // Molded knuckle bridge
  const knuckleBridge = new THREE.Mesh(
    tg(new THREE.CapsuleGeometry(0.016, 0.072, 8, 12)),
    armorPlateMat,
  );
  knuckleBridge.rotation.z = Math.PI / 2 - 0.1;
  knuckleBridge.position.set(-0.008, 0.048, 0.016);
  rightHandPivot.add(knuckleBridge);

  // Right articulated gloved fingers (Tan thumb/index/middle/ring, dark pinky wrap)
  const rightBones: HandBoneMap = {
    thumb: buildArticulatedFinger(rightHandPivot, gloveTanMat, [-0.048, 0.015, -0.01], [-0.45, -0.35, -0.82], 0.0145, 0.028, 0.022, 0.018, false),
    index: buildArticulatedFinger(rightHandPivot, gloveTanMat, [-0.032, 0.045, 0.012], [-1.25, 0, -0.12], 0.0125, 0.028, 0.022, 0.016, false),
    middle: buildArticulatedFinger(rightHandPivot, gloveTanMat, [-0.01, 0.046, 0.012], [-1.35, 0, -0.04], 0.0125, 0.03, 0.024, 0.017, false),
    ring: buildArticulatedFinger(rightHandPivot, gloveTanMat, [0.012, 0.045, 0.012], [-1.35, 0, 0.04], 0.012, 0.028, 0.022, 0.016, false),
    pinky: buildArticulatedFinger(rightHandPivot, gloveBlackMat, [0.032, 0.042, 0.01], [-1.38, 0, 0.12], 0.0108, 0.024, 0.018, 0.014, false),
  };

  // Weapon 1: Long Dark-Brushed Forged Steel Serrated Kukri / Machete sweeping diagonally UP & LEFT
  const kukriGroup = new THREE.Group();
  kukriGroup.position.set(-0.02, 0.02, -0.03);
  kukriGroup.rotation.set(0.28, -0.22, Math.PI - 0.34);

  const kHandle = new THREE.Mesh(tg(new THREE.CapsuleGeometry(0.018, 0.14, 8, 12)), wrapMat);
  kHandle.rotation.z = Math.PI / 2;
  kHandle.position.set(-0.06, 0, 0);

  const kGuard = new THREE.Mesh(tg(new THREE.CapsuleGeometry(0.024, 0.035, 8, 12)), bladeSpineMat);
  kGuard.position.set(0.008, 0, 0);

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.01, 0.022);
  bladeShape.lineTo(0.46, 0.021);
  bladeShape.lineTo(0.56, 0.015);
  bladeShape.lineTo(0.73, 0.001);
  bladeShape.lineTo(0.50, -0.019);
  bladeShape.lineTo(0.22, -0.024);
  const teethStart = 0.21;
  const toothPitch = 0.036;
  for (let t = 0; t < 5; t++) {
    const xBase = teethStart - t * toothPitch;
    bladeShape.lineTo(xBase - toothPitch * 0.45, -0.009);
    bladeShape.lineTo(xBase - toothPitch * 0.85, -0.022);
  }
  bladeShape.lineTo(0.01, -0.021);
  bladeShape.closePath();

  const bladeGeo = tg(
    new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.0055,
      bevelEnabled: true,
      bevelThickness: 0.0022,
      bevelSize: 0.0022,
      bevelSegments: 2,
    }),
  );
  bladeGeo.translate(0, 0, -0.00275);
  const kBladeMesh = new THREE.Mesh(bladeGeo, bladeSteelMat);

  const spineShape = new THREE.Shape();
  spineShape.moveTo(0.01, 0.023);
  spineShape.lineTo(0.46, 0.022);
  spineShape.lineTo(0.54, 0.016);
  spineShape.lineTo(0.44, 0.012);
  spineShape.lineTo(0.01, 0.012);
  spineShape.closePath();
  const spineGeo = tg(
    new THREE.ExtrudeGeometry(spineShape, {
      depth: 0.0085,
      bevelEnabled: false,
    }),
  );
  spineGeo.translate(0, 0, -0.00425);
  const kSpineMesh = new THREE.Mesh(spineGeo, bladeSpineMat);

  kukriGroup.add(kHandle, kGuard, kBladeMesh, kSpineMesh);

  // Weapon 2: Heavy Iron Pipe
  const pipeGroup = new THREE.Group();
  pipeGroup.position.set(-0.02, 0.02, -0.03);
  pipeGroup.rotation.set(0.28, -0.22, Math.PI - 0.34);

  const pipeShaft = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 12)),
    rustedPipeMat,
  );
  pipeShaft.rotation.z = Math.PI / 2;
  pipeShaft.position.set(0.24, 0, 0);
  const pipeElbow = new THREE.Mesh(tg(new THREE.SphereGeometry(0.038, 12, 10)), rustedPipeMat);
  pipeElbow.position.set(0.55, -0.01, 0);
  const pipeGrip = new THREE.Mesh(tg(new THREE.CapsuleGeometry(0.025, 0.16, 8, 12)), wrapMat);
  pipeGrip.rotation.z = Math.PI / 2;
  pipeGrip.position.set(-0.05, 0, 0);
  pipeGroup.add(pipeShaft, pipeElbow, pipeGrip);
  pipeGroup.visible = false;

  // Weapon 3: Two-Tone Subcompact Tactical Pistol (matches image_70c3ca82.png)
  // Oriented forward along -Z with subtle ready cant inside the tan/black gloved fist
  const pistolGroup = new THREE.Group();
  pistolGroup.position.set(-0.018, 0.018, -0.035);
  pistolGroup.rotation.set(0.08, 0.08, -0.18);

  // Matte-black stippled polymer lower frame + angled grip + extended baseplate + rail
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-0.085, 0.005); // rear tang
  frameShape.lineTo(0.115, 0.005); // dust cover front
  frameShape.lineTo(0.115, -0.018); // underbarrel rail tip
  frameShape.lineTo(0.055, -0.018); // trigger guard front
  frameShape.lineTo(0.045, -0.055); // trigger guard bottom
  frameShape.lineTo(0.002, -0.055); // guard rear
  frameShape.lineTo(-0.012, -0.115); // front grip strap
  frameShape.lineTo(-0.056, -0.122); // extended mag baseplate front
  frameShape.lineTo(-0.072, -0.112); // mag heel
  frameShape.lineTo(-0.056, -0.028); // backstrap
  frameShape.lineTo(-0.085, -0.008); // beavertail
  frameShape.closePath();

  const frameGeo = tg(
    new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.0025,
      bevelSize: 0.002,
      bevelSegments: 2,
    }),
  );
  frameGeo.translate(0, 0, -0.013);
  // Extrude was along +X = forward, rotate -PI/2 around Y so +X points forward along -Z
  const pistolModelRoot = new THREE.Group();
  pistolModelRoot.rotation.y = Math.PI / 2;
  pistolGroup.add(pistolModelRoot);

  const frameMesh = new THREE.Mesh(frameGeo, pistolFrameMat);
  pistolModelRoot.add(frameMesh);

  // Trigger guard cutout accent & curved trigger
  const trigger = new THREE.Mesh(
    tg(new THREE.CapsuleGeometry(0.0035, 0.022, 4, 8)),
    pistolDarkMetalMat,
  );
  trigger.position.set(0.025, -0.032, 0);
  trigger.rotation.z = 0.45;
  pistolModelRoot.add(trigger);

  // Brushed Satin-Silver Machined Slide (animated blowback on fire)
  const slideGroup = new THREE.Group();
  const slideShape = new THREE.Shape();
  slideShape.moveTo(-0.088, 0.006);
  slideShape.lineTo(0.116, 0.006);
  slideShape.lineTo(0.116, 0.034);
  slideShape.lineTo(0.106, 0.041);
  slideShape.lineTo(-0.076, 0.041);
  slideShape.lineTo(-0.088, 0.028);
  slideShape.closePath();

  const slideGeo = tg(
    new THREE.ExtrudeGeometry(slideShape, {
      depth: 0.025,
      bevelEnabled: true,
      bevelThickness: 0.0025,
      bevelSize: 0.002,
      bevelSegments: 2,
    }),
  );
  slideGeo.translate(0, 0, -0.0125);
  const slideMesh = new THREE.Mesh(slideGeo, pistolSlideMat);
  slideGroup.add(slideMesh);

  // Dark front lightening port cutout & rear vertical serrations (crisp machined detail)
  const portCut = new THREE.Mesh(
    tg(new THREE.CapsuleGeometry(0.0045, 0.022, 4, 8)),
    pistolDarkMetalMat,
  );
  portCut.rotation.z = Math.PI / 2;
  portCut.position.set(0.074, 0.028, 0);
  slideGroup.add(portCut);

  for (let s = 0; s < 6; s++) {
    const groove = new THREE.Mesh(
      tg(new THREE.CapsuleGeometry(0.0014, 0.019, 4, 6)),
      pistolDarkMetalMat,
    );
    groove.rotation.z = 0.14;
    groove.position.set(-0.068 + s * 0.007, 0.023, 0.0135);
    const grooveR = groove.clone();
    grooveR.position.z = -0.0135;
    slideGroup.add(groove, grooveR);
  }

  // Front & Rear Iron Sights
  const frontSight = new THREE.Mesh(
    tg(new THREE.CapsuleGeometry(0.003, 0.005, 4, 6)),
    pistolDarkMetalMat,
  );
  frontSight.position.set(0.102, 0.045, 0);
  const rearSight = new THREE.Mesh(
    tg(new THREE.CapsuleGeometry(0.004, 0.012, 4, 8)),
    pistolDarkMetalMat,
  );
  rearSight.rotation.x = Math.PI / 2;
  rearSight.position.set(-0.072, 0.045, 0);
  slideGroup.add(frontSight, rearSight);

  pistolModelRoot.add(slideGroup);

  // Black recessed muzzle barrel + additive muzzle flash
  const barrel = new THREE.Mesh(
    tg(new THREE.CylinderGeometry(0.0065, 0.0065, 0.025, 10)),
    pistolDarkMetalMat,
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.112, 0.022, 0);
  pistolModelRoot.add(barrel);

  const pistolMuzzleFlash = new THREE.Mesh(
    tg(new THREE.SphereGeometry(0.055, 8, 8)),
    muzzleMat,
  );
  pistolMuzzleFlash.scale.set(1.9, 0.9, 0.9);
  pistolMuzzleFlash.position.set(0.165, 0.022, 0);
  pistolMuzzleFlash.visible = false;
  pistolModelRoot.add(pistolMuzzleFlash);

  pistolGroup.visible = false;
  rightHandPivot.add(kukriGroup, pipeGroup, pistolGroup);

  // Dropkick leg mesh (smooth capsules/spheres)
  const dropkickLeg = new THREE.Group();
  dropkickLeg.position.set(0.08, -0.52, -0.35);
  dropkickLeg.visible = false;
  const kickShin = new THREE.Mesh(tg(new THREE.CapsuleGeometry(0.095, 0.52, 10, 14)), sleeveMat);
  kickShin.rotation.x = Math.PI / 2.1;
  const kickBoot = new THREE.Mesh(tg(new THREE.SphereGeometry(0.11, 14, 10)), gloveBlackMat);
  kickBoot.position.set(0, 0.04, -0.32);
  kickBoot.scale.set(0.85, 0.85, 1.35);
  dropkickLeg.add(kickShin, kickBoot);

  rig.add(rightArmGroup, leftArmGroup, dropkickLeg);

  // Pose interpolation targets matching all 5 poses in image_6b81e5ea.png + weapon grips
  const applyHandPose = (bones: HandBoneMap, pose: HandPose, dt: number, isLeft: boolean) => {
    const lambda = 16;
    // Tuple: [rootX, midX, tipX, spreadZOffset]
    type FT = [number, number, number, number];
    let tThumb: FT = [0, 0.22, 0.18, 0];
    let tIndex: FT = [0, 0.28, 0.22, 0];
    let tMiddle: FT = [0, 0.3, 0.24, 0];
    let tRing: FT = [0, 0.34, 0.26, 0];
    let tPinky: FT = [0, 0.38, 0.28, 0];

    if (pose === 'fist') {
      tThumb = [0.65, 0.95, 0.72, 0.45];
      tIndex = [1.05, 1.38, 1.05, 0.14];
      tMiddle = [1.12, 1.42, 1.08, 0.02];
      tRing = [1.15, 1.42, 1.08, -0.1];
      tPinky = [1.18, 1.38, 1.04, -0.22];
    } else if (pose === 'point') {
      tThumb = [0.62, 0.92, 0.7, 0.42];
      tIndex = [-0.14, 0.08, 0.06, 0.12];
      tMiddle = [1.12, 1.42, 1.08, 0.02];
      tRing = [1.15, 1.42, 1.08, -0.1];
      tPinky = [1.18, 1.38, 1.04, -0.22];
    } else if (pose === 'peace') {
      tThumb = [0.68, 0.96, 0.74, 0.48];
      tIndex = [-0.16, 0.08, 0.05, -0.14];
      tMiddle = [-0.14, 0.09, 0.06, 0.14];
      tRing = [1.16, 1.44, 1.1, -0.06];
      tPinky = [1.2, 1.4, 1.06, -0.18];
    } else if (pose === 'thumbsUp') {
      tThumb = [-0.36, 0.08, 0.06, -0.18];
      tIndex = [1.08, 1.42, 1.08, 0.14];
      tMiddle = [1.12, 1.44, 1.1, 0.02];
      tRing = [1.15, 1.44, 1.1, -0.1];
      tPinky = [1.18, 1.4, 1.06, -0.22];
    } else if (pose === 'gripMelee') {
      tThumb = [0.05, 0.85, 0.55, 0];
      tIndex = [-0.05, 1.12, 0.95, 0];
      tMiddle = [0, 1.18, 0.98, 0];
      tRing = [0, 1.18, 0.98, 0];
      tPinky = [0, 1.15, 0.95, 0];
    } else if (pose === 'gripPistol') {
      // Matches image_70c3ca82.png: thumb high along frame/slide, index along trigger guard, 3 fingers wrapped
      tThumb = [-0.28, 0.16, 0.12, 0.36];
      tIndex = [0.62, 0.42, 0.36, 0.18];
      tMiddle = [0.12, 1.16, 0.94, 0.04];
      tRing = [0.14, 1.18, 0.96, 0];
      tPinky = [0.16, 1.14, 0.92, -0.06];
    }

    const dampBone = (b: FingerBones, target: FT) => {
      const sign = isLeft ? 1 : -1;
      b.root.rotation.x = THREE.MathUtils.damp(b.root.rotation.x, b.baseRootX + target[0], lambda, dt);
      b.root.rotation.z = THREE.MathUtils.damp(
        b.root.rotation.z,
        b.baseSpreadZ + target[3] * sign,
        lambda,
        dt,
      );
      b.mid.rotation.x = THREE.MathUtils.damp(b.mid.rotation.x, target[1], lambda, dt);
      b.tip.rotation.x = THREE.MathUtils.damp(b.tip.rotation.x, target[2], lambda, dt);
    };

    dampBone(bones.thumb, tThumb);
    dampBone(bones.index, tIndex);
    dampBone(bones.middle, tMiddle);
    dampBone(bones.ring, tRing);
    dampBone(bones.pinky, tPinky);
  };

  return {
    rig,
    rightArmGroup,
    leftArmGroup,
    leftHandPivot,
    rightHandPivot,
    dropkickLeg,
    kukriGroup,
    pipeGroup,
    pistolGroup,
    pistolMuzzleFlash,
    setWeapon: (w: WeaponKind) => {
      kukriGroup.visible = w === 'kukri';
      pipeGroup.visible = w === 'pipe';
      pistolGroup.visible = w === 'pistol';
    },
    updateHandPoses: (leftPose: HandPose, rightPose: HandPose, dt: number, slideKick: number) => {
      applyHandPose(leftBones, leftPose, dt, true);
      applyHandPose(rightBones, rightPose, dt, false);
      slideGroup.position.x = -slideKick * 0.038;
    },
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
