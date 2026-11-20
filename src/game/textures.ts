import * as THREE from 'three';

export interface ProceduralTextureSet {
  marble: THREE.CanvasTexture;
  sandstone: THREE.CanvasTexture;
  courtyardTile: THREE.CanvasTexture;
  woodPlank: THREE.CanvasTexture;
  rustedMetal: THREE.CanvasTexture;
  bazaarWall: THREE.CanvasTexture;
  poolWater: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  chainLink: THREE.CanvasTexture;
  blueTarp: THREE.CanvasTexture;
  jaliLattice: THREE.CanvasTexture;
  domeRibs: THREE.CanvasTexture;
  tealWindow: THREE.CanvasTexture;
  nightHunterMuscle: THREE.CanvasTexture;
  diamondPlate: THREE.CanvasTexture;
  skinDetail: THREE.CanvasTexture;
  wristWrapTape: THREE.CanvasTexture;
  tacticalGlove: THREE.CanvasTexture;
  charbaghGrass: THREE.CanvasTexture;
  baseballBatWood: THREE.CanvasTexture;
  batGripTape: THREE.CanvasTexture;
  zombieSkin: THREE.CanvasTexture;
  zombieSkinBump: THREE.CanvasTexture;
  zombieCloth: THREE.CanvasTexture;
  dogFurRot: THREE.CanvasTexture;
  dogFurBump: THREE.CanvasTexture;
  safeHouseSign: THREE.CanvasTexture;
  pietraDura: THREE.CanvasTexture;
  charbaghFlowerbed: THREE.CanvasTexture;
  parkourWallPaint: THREE.CanvasTexture;
  parkourPaintSmudge: THREE.CanvasTexture;
  parkourChevronGuide: THREE.CanvasTexture;
  bazaarBunting: THREE.CanvasTexture;
  courtyardAsphalt: THREE.CanvasTexture;
  courtyardAsphaltBump: THREE.CanvasTexture;
  courtyardAsphaltRoughness: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  stoneRoughness: THREE.CanvasTexture;
  batWoodBump: THREE.CanvasTexture;
  batWoodRoughness: THREE.CanvasTexture;
  clothWrapBump: THREE.CanvasTexture;
  clothWrapRoughness: THREE.CanvasTexture;
  dustMote: THREE.CanvasTexture;
  bloodSpatter: THREE.CanvasTexture;
  polishedCreamTile: THREE.CanvasTexture;
  haveliDoorWood: THREE.CanvasTexture;
  blueMullionWindow: THREE.CanvasTexture;
  railwayBoardCantt: THREE.CanvasTexture;
  railwayBoardCity: THREE.CanvasTexture;
  railwayFacadeNcr: THREE.CanvasTexture;
  railwayDropDrive: THREE.CanvasTexture;
  railwayClock1207: THREE.CanvasTexture;
  railwayClock1744: THREE.CanvasTexture;
  railwayExecSign: THREE.CanvasTexture;
  railwayBrickRed: THREE.CanvasTexture;
  railwayWhiteBrick: THREE.CanvasTexture;
  railwayBallast: THREE.CanvasTexture;
  railwayIcfBlue: THREE.CanvasTexture;
  railwayCreamExpress: THREE.CanvasTexture;
  railwayGaribGreen: THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function finalizeLinearTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Agra White Marble with subtle grey veins & weathered cracks
  const marbleCanvas = document.createElement('canvas');
  marbleCanvas.width = 256;
  marbleCanvas.height = 256;
  const mCtx = marbleCanvas.getContext('2d')!;
  mCtx.fillStyle = '#efe9df';
  mCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 24; i++) {
    mCtx.strokeStyle = `rgba(145, 140, 134, ${0.12 + (i % 3) * 0.06})`;
    mCtx.lineWidth = 1 + (i % 2);
    mCtx.beginPath();
    let x = (i * 37) % 256;
    let y = 0;
    mCtx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += Math.sin(i + s * 1.4) * 18;
      y += 32;
      mCtx.lineTo(x, y);
    }
    mCtx.stroke();
  }
  mCtx.strokeStyle = 'rgba(110, 104, 96, 0.22)';
  mCtx.lineWidth = 1;
  for (let y = 0; y < 256; y += 64) {
    mCtx.beginPath();
    mCtx.moveTo(0, y);
    mCtx.lineTo(256, y);
    mCtx.stroke();
  }
  const marble = finalizeTexture(marbleCanvas, 3, 3, maxAnisotropy);

  // 2. Red Agra Sandstone Flagstones (Charbagh walkways)
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 256;
  sandCanvas.height = 256;
  const sCtx = sandCanvas.getContext('2d')!;
  sCtx.fillStyle = '#9c5240';
  sCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 480; i++) {
    const shade = (i % 5) * 9 - 18;
    sCtx.fillStyle = `rgb(${156 + shade}, ${82 + shade * 0.55}, ${64 + shade * 0.45})`;
    sCtx.fillRect((i * 73) % 256, (i * 41) % 256, 8, 5);
  }
  sCtx.strokeStyle = 'rgba(46, 20, 15, 0.48)';
  sCtx.lineWidth = 2.5;
  for (let y = 0; y < 256; y += 32) {
    sCtx.beginPath();
    sCtx.moveTo(0, y);
    sCtx.lineTo(256, y);
    sCtx.stroke();
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 256; x += 64) {
      sCtx.beginPath();
      sCtx.moveTo(x, y);
      sCtx.lineTo(x, y + 32);
      sCtx.stroke();
    }
  }
  const sandstone = finalizeTexture(sandCanvas, 4, 4, maxAnisotropy);

  // 3. Cracked Courtyard Stone Pavement
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = 256;
  tileCanvas.height = 256;
  const tCtx = tileCanvas.getContext('2d')!;
  tCtx.fillStyle = '#57534e';
  tCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      const tone = 72 + ((x * 3 + y * 5) % 24);
      tCtx.fillStyle = `rgb(${tone + 6}, ${tone + 2}, ${tone - 4})`;
      tCtx.fillRect(x + 2, y + 2, 60, 60);
    }
  }
  tCtx.strokeStyle = 'rgba(24, 24, 27, 0.55)';
  tCtx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    tCtx.beginPath();
    const sx = (i * 59) % 256;
    const sy = (i * 83) % 256;
    tCtx.moveTo(sx, sy);
    tCtx.lineTo(sx + 22, sy + 16);
    tCtx.lineTo(sx + 34, sy + 36);
    tCtx.stroke();
  }
  const courtyardTile = finalizeTexture(tileCanvas, 18, 18, maxAnisotropy);

  // 4. Weathered Wood Planks
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wCtx = woodCanvas.getContext('2d')!;
  wCtx.fillStyle = '#7c5333';
  wCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 64) {
    wCtx.fillStyle = x % 128 === 0 ? '#744c2e' : '#855a39';
    wCtx.fillRect(x + 2, 0, 60, 256);
    wCtx.strokeStyle = 'rgba(46, 28, 14, 0.45)';
    wCtx.lineWidth = 1.5;
    for (let g = 0; g < 10; g++) {
      const gx = x + 6 + g * 5;
      wCtx.beginPath();
      wCtx.moveTo(gx, 0);
      wCtx.lineTo(gx + Math.sin(g) * 3, 256);
      wCtx.stroke();
    }
  }
  const woodPlank = finalizeTexture(woodCanvas, 2, 2, maxAnisotropy);

  // 5. Rusted Corrugated Metal
  const metalCanvas = document.createElement('canvas');
  metalCanvas.width = 256;
  metalCanvas.height = 256;
  const rCtx = metalCanvas.getContext('2d')!;
  rCtx.fillStyle = '#474c52';
  rCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    rCtx.fillStyle = x % 32 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)';
    rCtx.fillRect(x, 0, 8, 256);
  }
  for (let i = 0; i < 60; i++) {
    rCtx.fillStyle = `rgba(138, 66, 32, ${0.22 + (i % 4) * 0.1})`;
    rCtx.beginPath();
    rCtx.arc((i * 47) % 256, (i * 89) % 256, 6 + (i % 14), 0, Math.PI * 2);
    rCtx.fill();
  }
  const rustedMetal = finalizeTexture(metalCanvas, 2, 2, maxAnisotropy);

  // 6. Weathered Bazaar Plaster Wall
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 256;
  wallCanvas.height = 256;
  const bCtx = wallCanvas.getContext('2d')!;
  bCtx.fillStyle = '#c4a987';
  bCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    bCtx.fillStyle = i % 2 === 0 ? 'rgba(92, 74, 52, 0.14)' : 'rgba(235, 220, 198, 0.14)';
    bCtx.fillRect((i * 53) % 256, (i * 37) % 256, 26, 18);
  }
  bCtx.fillStyle = 'rgba(48, 36, 28, 0.35)';
  bCtx.fillRect(0, 224, 256, 32);
  const bazaarWall = finalizeTexture(wallCanvas, 2, 2, maxAnisotropy);

  // 7. Reflecting Pool Turquoise Rippled Water Sheen
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 256;
  poolCanvas.height = 256;
  const pCtx = poolCanvas.getContext('2d')!;
  pCtx.fillStyle = '#1b5b63';
  pCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 64; i++) {
    pCtx.fillStyle = i % 2 === 0 ? 'rgba(110, 210, 215, 0.22)' : 'rgba(14, 52, 60, 0.3)';
    pCtx.beginPath();
    pCtx.ellipse((i * 61) % 256, (i * 43) % 256, 26, 6, 0.1, 0, Math.PI * 2);
    pCtx.fill();
  }
  const poolWater = finalizeTexture(poolCanvas, 2, 12, maxAnisotropy);

  // 8. Soft Radial Contact Shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shCtx = shadowCanvas.getContext('2d')!;
  const grad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  // 9. Chain-Link Quarantine Fence (transparent diamond wire mesh)
  const fenceCanvas = document.createElement('canvas');
  fenceCanvas.width = 128;
  fenceCanvas.height = 128;
  const fCtx = fenceCanvas.getContext('2d')!;
  fCtx.clearRect(0, 0, 128, 128);
  fCtx.strokeStyle = '#9ca3af';
  fCtx.lineWidth = 3;
  for (let i = -128; i < 256; i += 24) {
    fCtx.beginPath();
    fCtx.moveTo(i, 0);
    fCtx.lineTo(i + 128, 128);
    fCtx.stroke();
    fCtx.beginPath();
    fCtx.moveTo(i + 128, 0);
    fCtx.lineTo(i, 128);
    fCtx.stroke();
  }
  const chainLink = finalizeTexture(fenceCanvas, 4, 2, maxAnisotropy);

  // 10. Blue Parkour Landing Tarp (with stitched grid & white landing arrow/cross)
  const tarpCanvas = document.createElement('canvas');
  tarpCanvas.width = 256;
  tarpCanvas.height = 256;
  const tpCtx = tarpCanvas.getContext('2d')!;
  tpCtx.fillStyle = '#0284c7';
  tpCtx.fillRect(0, 0, 256, 256);
  tpCtx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
  tpCtx.lineWidth = 2;
  for (let i = 0; i < 256; i += 32) {
    tpCtx.beginPath();
    tpCtx.moveTo(i, 0);
    tpCtx.lineTo(i, 256);
    tpCtx.stroke();
    tpCtx.beginPath();
    tpCtx.moveTo(0, i);
    tpCtx.lineTo(256, i);
    tpCtx.stroke();
  }
  tpCtx.strokeStyle = '#f8fafc';
  tpCtx.lineWidth = 8;
  tpCtx.strokeRect(18, 18, 220, 220);
  tpCtx.fillStyle = 'rgba(250, 204, 21, 0.9)';
  tpCtx.fillRect(114, 72, 28, 112);
  tpCtx.fillRect(72, 114, 112, 28);
  const blueTarp = finalizeTexture(tarpCanvas, 1, 1, maxAnisotropy);

  // 11. Pierced Carved Mughal Marble Jali Lattice Screen (alpha cutout matching Taj interior photos!)
  const jaliCanvas = document.createElement('canvas');
  jaliCanvas.width = 128;
  jaliCanvas.height = 128;
  const jCtx = jaliCanvas.getContext('2d')!;
  jCtx.fillStyle = '#ede7dc';
  jCtx.fillRect(0, 0, 128, 128);
  // Subtle pietra dura border around screen
  jCtx.strokeStyle = '#991b1b';
  jCtx.lineWidth = 3;
  jCtx.strokeRect(5, 5, 118, 118);
  jCtx.strokeStyle = '#15803d';
  jCtx.lineWidth = 1.5;
  jCtx.strokeRect(9, 9, 110, 110);
  // Carve transparent lattice diamonds through marble
  jCtx.globalCompositeOperation = 'destination-out';
  for (let y = 14; y < 114; y += 16) {
    for (let x = 14; x < 114; x += 16) {
      jCtx.beginPath();
      jCtx.moveTo(x + 6, y);
      jCtx.lineTo(x + 12, y + 6);
      jCtx.lineTo(x + 6, y + 12);
      jCtx.lineTo(x, y + 6);
      jCtx.closePath();
      jCtx.fill();
    }
  }
  jCtx.globalCompositeOperation = 'source-over';
  const jaliLattice = finalizeTexture(jaliCanvas, 2, 1, maxAnisotropy);

  // 12. Taj Interior Concentric Diamond Muqarnas Dome Pattern + Dark Teal Window Glass
  const domeCanvas = document.createElement('canvas');
  domeCanvas.width = 256;
  domeCanvas.height = 256;
  const dCtx = domeCanvas.getContext('2d')!;
  dCtx.fillStyle = '#eae4da';
  dCtx.fillRect(0, 0, 256, 256);
  dCtx.strokeStyle = 'rgba(100, 92, 82, 0.55)';
  dCtx.lineWidth = 2;
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      dCtx.beginPath();
      dCtx.moveTo(x + 8, y);
      dCtx.lineTo(x + 16, y + 8);
      dCtx.lineTo(x + 8, y + 16);
      dCtx.lineTo(x, y + 8);
      dCtx.closePath();
      dCtx.stroke();
    }
  }
  const domeRibs = finalizeTexture(domeCanvas, 10, 5, maxAnisotropy);

  // 13. Upper Gallery Teal-Tinted Leaded Glass Window
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 128;
  winCanvas.height = 128;
  const wnCtx = winCanvas.getContext('2d')!;
  wnCtx.fillStyle = '#5f8d96';
  wnCtx.fillRect(0, 0, 128, 128);
  wnCtx.strokeStyle = '#e5dfd5';
  wnCtx.lineWidth = 4;
  for (let x = 0; x <= 128; x += 24) {
    wnCtx.beginPath();
    wnCtx.moveTo(x, 0);
    wnCtx.lineTo(x, 128);
    wnCtx.stroke();
  }
  for (let y = 0; y <= 128; y += 24) {
    wnCtx.beginPath();
    wnCtx.moveTo(0, y);
    wnCtx.lineTo(128, y);
    wnCtx.stroke();
  }
  const tealWindow = finalizeTexture(winCanvas, 1, 1, maxAnisotropy);

  // 14. Night Hunter Exposed Striated Crimson Muscle & Scarred Pale Fascia
  const nhCanvas = document.createElement('canvas');
  nhCanvas.width = 256;
  nhCanvas.height = 256;
  const nhCtx = nhCanvas.getContext('2d')!;
  nhCtx.fillStyle = '#4a181e';
  nhCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 42; i++) {
    nhCtx.strokeStyle = i % 3 === 0 ? 'rgba(218, 205, 200, 0.35)' : 'rgba(138, 24, 34, 0.65)';
    nhCtx.lineWidth = i % 3 === 0 ? 2 : 3.5;
    nhCtx.beginPath();
    const y0 = (i * 11) % 256;
    nhCtx.moveTo(0, y0);
    nhCtx.bezierCurveTo(85, y0 + Math.sin(i) * 18, 170, y0 - Math.cos(i) * 18, 256, (y0 + 24) % 256);
    nhCtx.stroke();
  }
  for (let i = 0; i < 28; i++) {
    nhCtx.fillStyle = i % 2 === 0 ? 'rgba(30, 8, 12, 0.5)' : 'rgba(185, 38, 46, 0.42)';
    nhCtx.beginPath();
    nhCtx.ellipse((i * 59) % 256, (i * 83) % 256, 14, 7, (i % 5) * 0.4, 0, Math.PI * 2);
    nhCtx.fill();
  }
  const nightHunterMuscle = finalizeTexture(nhCanvas, 2, 2, maxAnisotropy);

  // 15. Industrial Steel Diamond-Plate Catwalk Grating (Pic 2!)
  const dpCanvas = document.createElement('canvas');
  dpCanvas.width = 128;
  dpCanvas.height = 128;
  const dpCtx = dpCanvas.getContext('2d')!;
  dpCtx.fillStyle = '#383e46';
  dpCtx.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 128; y += 16) {
    for (let x = 8; x < 128; x += 16) {
      dpCtx.save();
      dpCtx.translate(x, y);
      dpCtx.rotate(((x + y) / 16) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4);
      dpCtx.fillStyle = '#646e7a';
      dpCtx.fillRect(-4, -1.5, 8, 3);
      dpCtx.restore();
    }
  }
  const diamondPlate = finalizeTexture(dpCanvas, 4, 2, maxAnisotropy);

  // 16. Detailed Human Skin Texture (#d89b78 warm base, knuckle/crease shading, veins & forearm hair)
  const skCanvas = document.createElement('canvas');
  skCanvas.width = 256;
  skCanvas.height = 256;
  const skCtx = skCanvas.getContext('2d')!;
  skCtx.fillStyle = '#d89b78';
  skCtx.fillRect(0, 0, 256, 256);
  // Subtle organic skin tone mottling & warm/sunlit patches
  for (let i = 0; i < 64; i++) {
    skCtx.fillStyle =
      i % 3 === 0
        ? 'rgba(166, 102, 72, 0.12)'
        : i % 3 === 1
          ? 'rgba(236, 190, 158, 0.14)'
          : 'rgba(190, 122, 88, 0.11)';
    skCtx.beginPath();
    skCtx.ellipse((i * 47) % 256, (i * 61) % 256, 18 + (i % 12), 10 + (i % 7), (i % 4) * 0.35, 0, Math.PI * 2);
    skCtx.fill();
  }
  // Darker knuckle / skin crease shading bands
  for (let c = 0; c < 6; c++) {
    const cy = 28 + c * 38;
    const grad = skCtx.createLinearGradient(0, cy - 6, 0, cy + 6);
    grad.addColorStop(0, 'rgba(130, 74, 52, 0)');
    grad.addColorStop(0.5, 'rgba(130, 74, 52, 0.18)');
    grad.addColorStop(1, 'rgba(130, 74, 52, 0)');
    skCtx.fillStyle = grad;
    skCtx.fillRect(0, cy - 6, 256, 12);
  }
  // Subtle forearm veins
  skCtx.strokeStyle = 'rgba(78, 96, 106, 0.14)';
  skCtx.lineWidth = 2.0;
  for (let v = 0; v < 7; v++) {
    skCtx.beginPath();
    let vx = 16 + v * 34;
    let vy = 0;
    skCtx.moveTo(vx, vy);
    for (let s = 0; s < 8; s++) {
      vx += Math.sin(v * 1.7 + s * 0.9) * 6;
      vy += 32;
      skCtx.lineTo(vx, vy);
    }
    skCtx.stroke();
  }
  // Fine subtle forearm hairs & pores
  skCtx.strokeStyle = 'rgba(58, 38, 28, 0.18)';
  skCtx.lineWidth = 0.9;
  for (let h = 0; h < 260; h++) {
    const hx = (h * 53 + 11) % 256;
    const hy = (h * 89 + 7) % 256;
    skCtx.beginPath();
    skCtx.moveTo(hx, hy);
    skCtx.lineTo(hx + ((h % 3) - 1) * 1.6, hy + 5 + (h % 4));
    skCtx.stroke();
  }
  for (let p = 0; p < 340; p++) {
    skCtx.fillStyle = p % 2 === 0 ? 'rgba(116, 68, 48, 0.08)' : 'rgba(246, 206, 178, 0.08)';
    skCtx.fillRect((p * 71) % 256, (p * 43) % 256, 1.5, 1.5);
  }
  const skinDetail = finalizeTexture(skCanvas, 1, 1, maxAnisotropy);

  // 16B. Athletic White/Grey Wrist-Wrap Tape with Diagonal Cloth Weave
  const wwCanvas = document.createElement('canvas');
  wwCanvas.width = 256;
  wwCanvas.height = 256;
  const wwCtx = wwCanvas.getContext('2d')!;
  wwCtx.fillStyle = '#dbd5c9';
  wwCtx.fillRect(0, 0, 256, 256);
  // Diagonal athletic cloth weave
  for (let i = -256; i < 512; i += 6) {
    wwCtx.strokeStyle = i % 12 === 0 ? 'rgba(130, 124, 114, 0.24)' : 'rgba(255, 252, 245, 0.3)';
    wwCtx.lineWidth = 1.6;
    wwCtx.beginPath();
    wwCtx.moveTo(i, 0);
    wwCtx.lineTo(i + 256, 256);
    wwCtx.stroke();

    wwCtx.strokeStyle = 'rgba(118, 112, 102, 0.14)';
    wwCtx.beginPath();
    wwCtx.moveTo(i + 256, 0);
    wwCtx.lineTo(i, 256);
    wwCtx.stroke();
  }
  // Subtle wrap overlap seam shadows & grime smudges
  for (let y = 24; y < 256; y += 44) {
    wwCtx.fillStyle = 'rgba(72, 64, 54, 0.2)';
    wwCtx.fillRect(0, y, 256, 3);
  }
  for (let g = 0; g < 18; g++) {
    wwCtx.fillStyle = 'rgba(92, 76, 62, 0.14)';
    wwCtx.beginPath();
    wwCtx.ellipse((g * 67) % 256, (g * 43) % 256, 16, 8, 0.3, 0, Math.PI * 2);
    wwCtx.fill();
  }
  const wristWrapTape = finalizeTexture(wwCanvas, 2, 2, maxAnisotropy);

  // 16C. Fingerless Tactical Glove Pebbled Leather / Neoprene Micro-Grain
  const tgCanvas = document.createElement('canvas');
  tgCanvas.width = 256;
  tgCanvas.height = 256;
  const tgCtx = tgCanvas.getContext('2d')!;
  tgCtx.fillStyle = '#1c1e22';
  tgCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const gx = (i * 37 + (i % 7) * 3) % 256;
    const gy = (i * 61 + (i % 5) * 2) % 256;
    const v = 20 + (i % 24);
    tgCtx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    tgCtx.beginPath();
    tgCtx.arc(gx, gy, 1.8 + (i % 2) * 0.7, 0, Math.PI * 2);
    tgCtx.fill();
  }
  // Subtle tactical reinforcement seam stitching
  tgCtx.strokeStyle = 'rgba(72, 78, 88, 0.45)';
  tgCtx.lineWidth = 1.5;
  tgCtx.setLineDash([5, 4]);
  tgCtx.strokeRect(12, 12, 232, 232);
  tgCtx.setLineDash([]);
  const tacticalGlove = finalizeTexture(tgCanvas, 2, 2, maxAnisotropy);

  // 17. Charbagh Lush Overgrown Garden Lawn Turf
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 256;
  grassCanvas.height = 256;
  const gCtx = grassCanvas.getContext('2d')!;
  gCtx.fillStyle = '#3f5e2c';
  gCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 650; i++) {
    const gx = (i * 47) % 256;
    const gy = (i * 83) % 256;
    gCtx.fillStyle =
      i % 4 === 0
        ? 'rgba(104, 134, 58, 0.36)'
        : i % 3 === 0
          ? 'rgba(42, 68, 28, 0.42)'
          : 'rgba(132, 128, 62, 0.22)';
    gCtx.fillRect(gx, gy, 3, 7);
  }
  const charbaghGrass = finalizeTexture(grassCanvas, 6, 12, maxAnisotropy);

  // 18. Oak/Ash Hardwood Baseball Bat Grain, Scuffs, Dirt Smudges & Subtle Dried Blood near Barrel Tip
  const batCanvas = document.createElement('canvas');
  batCanvas.width = 512;
  batCanvas.height = 512;
  const btCtx = batCanvas.getContext('2d')!;
  btCtx.fillStyle = '#b98c5a';
  btCtx.fillRect(0, 0, 512, 512);
  // Natural oak/ash longitudinal grain & cathedral ring curves
  for (let x = 0; x < 512; x += 4) {
    btCtx.strokeStyle =
      x % 12 === 0
        ? 'rgba(84, 50, 24, 0.38)'
        : x % 8 === 0
          ? 'rgba(128, 84, 44, 0.26)'
          : 'rgba(226, 192, 146, 0.22)';
    btCtx.lineWidth = x % 12 === 0 ? 2.2 : 1.4;
    btCtx.beginPath();
    btCtx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) {
      btCtx.lineTo(x + Math.sin(y * 0.024 + x * 0.07) * 7, y);
    }
    btCtx.stroke();
  }
  // Wood knots / growth rings
  for (let k = 0; k < 4; k++) {
    const kx = 80 + k * 115;
    const ky = 160 + (k % 2) * 140;
    for (let r = 1; r <= 4; r++) {
      btCtx.strokeStyle = 'rgba(86, 52, 26, 0.22)';
      btCtx.lineWidth = 1.4;
      btCtx.beginPath();
      btCtx.ellipse(kx, ky, r * 6, r * 20, 0.06, 0, Math.PI * 2);
      btCtx.stroke();
    }
  }
  // Scuff marks & dirt smudges along barrel
  for (let s = 0; s < 38; s++) {
    btCtx.fillStyle = s % 2 === 0 ? 'rgba(48, 36, 26, 0.26)' : 'rgba(66, 52, 38, 0.18)';
    btCtx.beginPath();
    btCtx.ellipse(
      (s * 73) % 512,
      60 + ((s * 97) % 410),
      10 + (s % 10),
      3 + (s % 4),
      (s % 5) * 0.35,
      0,
      Math.PI * 2,
    );
    btCtx.fill();
  }
  // Subtle dried dark crimson blood spatters concentrated near the upper barrel tip (Lathe UV v=0.6..0.95 -> canvas top y=20..190)
  for (let b = 0; b < 24; b++) {
    const bx = (b * 67 + 29) % 512;
    const by = 18 + ((b * 41) % 165);
    btCtx.fillStyle = b % 3 === 0 ? 'rgba(96, 14, 14, 0.56)' : 'rgba(68, 12, 12, 0.42)';
    btCtx.beginPath();
    btCtx.ellipse(bx, by, 7 + (b % 9), 4 + (b % 6), (b % 4) * 0.45, 0, Math.PI * 2);
    btCtx.fill();
  }
  const baseballBatWood = finalizeTexture(batCanvas, 1, 1, maxAnisotropy);

  // 18B. Ribbed Black Rubber / Cloth Bat Grip Tape
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 256;
  bgCanvas.height = 256;
  const bgCtx = bgCanvas.getContext('2d')!;
  bgCtx.fillStyle = '#15171b';
  bgCtx.fillRect(0, 0, 256, 256);
  // Diagonal wrap ribs
  for (let i = -256; i < 512; i += 22) {
    bgCtx.strokeStyle = 'rgba(48, 52, 60, 0.65)';
    bgCtx.lineWidth = 4;
    bgCtx.beginPath();
    bgCtx.moveTo(i, 0);
    bgCtx.lineTo(i + 256, 128);
    bgCtx.stroke();
    bgCtx.strokeStyle = 'rgba(8, 9, 12, 0.85)';
    bgCtx.lineWidth = 3;
    bgCtx.beginPath();
    bgCtx.moveTo(i, 4);
    bgCtx.lineTo(i + 256, 132);
    bgCtx.stroke();
  }
  for (let p = 0; p < 700; p++) {
    bgCtx.fillStyle = p % 2 === 0 ? 'rgba(38, 42, 48, 0.35)' : 'rgba(10, 11, 14, 0.45)';
    bgCtx.fillRect((p * 41) % 256, (p * 59) % 256, 2, 2);
  }
  const batGripTape = finalizeTexture(bgCanvas, 1, 2, maxAnisotropy);

  // 19. Necrotic Zombie Skin (pale gray-green mottled flesh, dark veins, bruises & crimson blood splatters)
  const zsCanvas = document.createElement('canvas');
  zsCanvas.width = 256;
  zsCanvas.height = 256;
  const zsCtx = zsCanvas.getContext('2d')!;
  zsCtx.fillStyle = '#7e8f77';
  zsCtx.fillRect(0, 0, 256, 256);
  // Bruised necrotic mottling
  for (let i = 0; i < 48; i++) {
    zsCtx.fillStyle = i % 3 === 0 ? 'rgba(64, 54, 72, 0.28)' : i % 2 === 0 ? 'rgba(84, 96, 68, 0.34)' : 'rgba(148, 160, 134, 0.24)';
    zsCtx.beginPath();
    zsCtx.ellipse((i * 53) % 256, (i * 79) % 256, 18 + (i % 14), 10 + (i % 8), (i % 5) * 0.4, 0, Math.PI * 2);
    zsCtx.fill();
  }
  // Dark branching necrotic veins
  zsCtx.strokeStyle = 'rgba(32, 38, 44, 0.46)';
  zsCtx.lineWidth = 1.6;
  for (let v = 0; v < 18; v++) {
    zsCtx.beginPath();
    let vx = (v * 37) % 256;
    let vy = (v * 59) % 256;
    zsCtx.moveTo(vx, vy);
    for (let s = 0; s < 5; s++) {
      vx += Math.sin(v + s * 1.3) * 14;
      vy += 12;
      zsCtx.lineTo(vx, vy);
    }
    zsCtx.stroke();
  }
  // Crimson blood splatters & grime
  for (let b = 0; b < 22; b++) {
    zsCtx.fillStyle = b % 2 === 0 ? 'rgba(138, 18, 22, 0.62)' : 'rgba(78, 12, 14, 0.55)';
    zsCtx.beginPath();
    zsCtx.ellipse((b * 71) % 256, (b * 43) % 256, 9 + (b % 10), 6 + (b % 7), (b % 4) * 0.5, 0, Math.PI * 2);
    zsCtx.fill();
  }
  const zombieSkin = finalizeTexture(zsCanvas, 1, 1, maxAnisotropy);

  // 20. Zombie Skin Bump/Roughness Map (linear grayscale height detail)
  const zbCanvas = document.createElement('canvas');
  zbCanvas.width = 256;
  zbCanvas.height = 256;
  const zbCtx = zbCanvas.getContext('2d')!;
  zbCtx.fillStyle = '#808080';
  zbCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 320; i++) {
    const shade = 95 + ((i * 29) % 70);
    zbCtx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    zbCtx.fillRect((i * 41) % 256, (i * 67) % 256, 5, 4);
  }
  zbCtx.strokeStyle = 'rgba(40, 40, 40, 0.55)';
  zbCtx.lineWidth = 2;
  for (let v = 0; v < 18; v++) {
    zbCtx.beginPath();
    let vx = (v * 37) % 256;
    let vy = (v * 59) % 256;
    zbCtx.moveTo(vx, vy);
    for (let s = 0; s < 5; s++) {
      vx += Math.sin(v + s * 1.3) * 14;
      vy += 12;
      zbCtx.lineTo(vx, vy);
    }
    zbCtx.stroke();
  }
  const zombieSkinBump = new THREE.CanvasTexture(zbCanvas);
  zombieSkinBump.colorSpace = THREE.NoColorSpace;
  zombieSkinBump.wrapS = THREE.RepeatWrapping;
  zombieSkinBump.wrapT = THREE.RepeatWrapping;
  zombieSkinBump.anisotropy = Math.min(8, maxAnisotropy);
  zombieSkinBump.needsUpdate = true;

  // 21. Ragged Grimy Clothing Fabric Texture
  const zcCanvas = document.createElement('canvas');
  zcCanvas.width = 256;
  zcCanvas.height = 256;
  const zcCtx = zcCanvas.getContext('2d')!;
  zcCtx.fillStyle = '#c8c4bc';
  zcCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    zcCtx.fillStyle = y % 8 === 0 ? 'rgba(60, 56, 48, 0.16)' : 'rgba(255, 255, 255, 0.1)';
    zcCtx.fillRect(0, y, 256, 2);
  }
  for (let x = 0; x < 256; x += 4) {
    zcCtx.fillStyle = x % 8 === 0 ? 'rgba(50, 46, 40, 0.14)' : 'rgba(240, 236, 228, 0.08)';
    zcCtx.fillRect(x, 0, 2, 256);
  }
  for (let i = 0; i < 34; i++) {
    zcCtx.fillStyle = i % 3 === 0 ? 'rgba(115, 22, 22, 0.45)' : 'rgba(54, 46, 36, 0.35)';
    zcCtx.beginPath();
    zcCtx.ellipse((i * 57) % 256, (i * 89) % 256, 16, 11, 0.4, 0, Math.PI * 2);
    zcCtx.fill();
  }
  const zombieCloth = finalizeTexture(zcCanvas, 1, 1, maxAnisotropy);

  // 22. Infected Dog Dark Charred-Sable Fur, Mange & Blood Lesion Texture
  const dfCanvas = document.createElement('canvas');
  dfCanvas.width = 256;
  dfCanvas.height = 256;
  const dfCtx = dfCanvas.getContext('2d')!;
  dfCtx.fillStyle = '#2d241e';
  dfCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const fx = (i * 37) % 256;
    const fy = (i * 73) % 256;
    dfCtx.strokeStyle =
      i % 3 === 0 ? 'rgba(18, 14, 12, 0.7)' : i % 3 === 1 ? 'rgba(84, 66, 52, 0.42)' : 'rgba(42, 32, 26, 0.56)';
    dfCtx.lineWidth = 1.6;
    dfCtx.beginPath();
    dfCtx.moveTo(fx, fy);
    dfCtx.lineTo(fx + ((i % 5) - 2) * 2, fy + 10 + (i % 6));
    dfCtx.stroke();
  }
  // Patchy mange & raw crimson flesh tears
  for (let w = 0; w < 24; w++) {
    const wx = (w * 61 + 19) % 256;
    const wy = (w * 89 + 11) % 256;
    dfCtx.fillStyle = w % 2 === 0 ? 'rgba(128, 20, 22, 0.78)' : 'rgba(72, 14, 14, 0.68)';
    dfCtx.beginPath();
    dfCtx.ellipse(wx, wy, 12 + (w % 10), 8 + (w % 6), (w % 3) * 0.6, 0, Math.PI * 2);
    dfCtx.fill();
  }
  const dogFurRot = finalizeTexture(dfCanvas, 1, 1, maxAnisotropy);

  // 23. Infected Dog Fur & Tendon Bump Map (NoColorSpace)
  const dbCanvas = document.createElement('canvas');
  dbCanvas.width = 256;
  dbCanvas.height = 256;
  const dbCtx = dbCanvas.getContext('2d')!;
  dbCtx.fillStyle = '#7c7c7c';
  dbCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 520; i++) {
    const fx = (i * 43) % 256;
    const fy = (i * 67) % 256;
    const v = 90 + ((i * 31) % 110);
    dbCtx.strokeStyle = `rgb(${v}, ${v}, ${v})`;
    dbCtx.lineWidth = 1.5;
    dbCtx.beginPath();
    dbCtx.moveTo(fx, fy);
    dbCtx.lineTo(fx + ((i % 3) - 1) * 2, fy + 9);
    dbCtx.stroke();
  }
  const dogFurBump = new THREE.CanvasTexture(dbCanvas);
  dogFurBump.colorSpace = THREE.NoColorSpace;
  dogFurBump.wrapS = THREE.RepeatWrapping;
  dogFurBump.wrapT = THREE.RepeatWrapping;
  dogFurBump.anisotropy = Math.min(8, maxAnisotropy);
  dogFurBump.needsUpdate = true;

  // 24. Glowing SAFE HOUSE Banner Sign Texture (Taj Mahal UV Gate)
  const shSignCanvas = document.createElement('canvas');
  shSignCanvas.width = 512;
  shSignCanvas.height = 128;
  const ssCtx = shSignCanvas.getContext('2d')!;
  ssCtx.fillStyle = '#072219';
  ssCtx.fillRect(0, 0, 512, 128);
  ssCtx.strokeStyle = '#34d399';
  ssCtx.lineWidth = 8;
  ssCtx.strokeRect(8, 8, 496, 112);
  ssCtx.fillStyle = '#ecfdf5';
  ssCtx.font = 'bold 62px sans-serif';
  ssCtx.textAlign = 'center';
  ssCtx.textBaseline = 'middle';
  ssCtx.fillText('SAFE HOUSE', 256, 66);
  const safeHouseSign = finalizeTexture(shSignCanvas, 1, 1, maxAnisotropy);
  safeHouseSign.wrapS = THREE.ClampToEdgeWrapping;
  safeHouseSign.wrapT = THREE.ClampToEdgeWrapping;

  // 25. Taj Mahal Pietra Dura Floral Inlay & Calligraphic Frieze Marble Texture
  const pdCanvas = document.createElement('canvas');
  pdCanvas.width = 256;
  pdCanvas.height = 256;
  const pdCtx = pdCanvas.getContext('2d')!;
  pdCtx.fillStyle = '#f3ede2';
  pdCtx.fillRect(0, 0, 256, 256);
  // Subtle marble veining
  pdCtx.strokeStyle = 'rgba(145, 140, 132, 0.16)';
  pdCtx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    pdCtx.beginPath();
    pdCtx.moveTo((i * 29) % 256, 0);
    pdCtx.lineTo(((i * 29) % 256) + 22, 256);
    pdCtx.stroke();
  }
  // Outer dark calligraphic / inlay border frame
  pdCtx.strokeStyle = '#292524';
  pdCtx.lineWidth = 6;
  pdCtx.strokeRect(10, 10, 236, 236);
  pdCtx.strokeStyle = '#a16207';
  pdCtx.lineWidth = 2;
  pdCtx.strokeRect(20, 20, 216, 216);
  // Repeating Mughal floral lotus & vine motifs (carnelian red + malachite green stems)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const fx = 44 + col * 56;
      const fy = 52 + row * 74;
      pdCtx.strokeStyle = '#166534';
      pdCtx.lineWidth = 2.2;
      pdCtx.beginPath();
      pdCtx.moveTo(fx, fy + 24);
      pdCtx.quadraticCurveTo(fx - 10, fy + 10, fx, fy);
      pdCtx.moveTo(fx, fy + 18);
      pdCtx.lineTo(fx - 10, fy + 10);
      pdCtx.moveTo(fx, fy + 18);
      pdCtx.lineTo(fx + 10, fy + 10);
      pdCtx.stroke();
      // Carnelian flower petals
      pdCtx.fillStyle = '#b91c1c';
      pdCtx.beginPath();
      pdCtx.ellipse(fx, fy - 4, 5, 8, 0, 0, Math.PI * 2);
      pdCtx.fill();
      pdCtx.fillStyle = '#0369a1';
      pdCtx.beginPath();
      pdCtx.arc(fx - 6, fy, 3, 0, Math.PI * 2);
      pdCtx.arc(fx + 6, fy, 3, 0, Math.PI * 2);
      pdCtx.fill();
    }
  }
  const pietraDura = finalizeTexture(pdCanvas, 1, 1, maxAnisotropy);

  // 26. Charbagh Parterre Flowerbed (rich garden soil + pink/white/marigold rose blooms)
  const fbCanvas = document.createElement('canvas');
  fbCanvas.width = 256;
  fbCanvas.height = 256;
  const fbCtx = fbCanvas.getContext('2d')!;
  fbCtx.fillStyle = '#2d4720';
  fbCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const bx = (i * 53) % 256;
    const by = (i * 79) % 256;
    fbCtx.fillStyle = i % 3 === 0 ? '#1f3816' : '#3a5d29';
    fbCtx.beginPath();
    fbCtx.arc(bx, by, 5 + (i % 5), 0, Math.PI * 2);
    fbCtx.fill();
  }
  const bloomColors = ['#f472b6', '#fbcfe8', '#ffffff', '#fb7185', '#facc15'];
  for (let i = 0; i < 160; i++) {
    const bx = (i * 67 + 13) % 256;
    const by = (i * 41 + 9) % 256;
    fbCtx.fillStyle = bloomColors[i % bloomColors.length];
    fbCtx.beginPath();
    fbCtx.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2);
    fbCtx.fill();
  }
  const charbaghFlowerbed = finalizeTexture(fbCanvas, 2, 10, maxAnisotropy);

  // 27. Parkour Wall-Run Slatted Timber with Runner Yellow Chevrons
  const pwCanvas = document.createElement('canvas');
  pwCanvas.width = 256;
  pwCanvas.height = 256;
  const pwCtx = pwCanvas.getContext('2d')!;
  pwCtx.fillStyle = '#5c3f28';
  pwCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    pwCtx.fillStyle = y % 64 === 0 ? '#69482e' : '#533823';
    pwCtx.fillRect(0, y + 2, 256, 28);
  }
  pwCtx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
  pwCtx.lineWidth = 10;
  for (let cx = 42; cx < 230; cx += 64) {
    pwCtx.beginPath();
    pwCtx.moveTo(cx - 14, 96);
    pwCtx.lineTo(cx + 14, 128);
    pwCtx.lineTo(cx - 14, 160);
    pwCtx.stroke();
  }
  const parkourWallPaint = finalizeTexture(pwCanvas, 2, 1, maxAnisotropy);

  // 28. Weathered Yellow & Chalk-White Parkour Edge Paint Smudge (Dying Light Sightlines)
  const smCanvas = document.createElement('canvas');
  smCanvas.width = 256;
  smCanvas.height = 64;
  const smCtx = smCanvas.getContext('2d')!;
  smCtx.clearRect(0, 0, 256, 64);
  // Base worn chalk-white undercoat smears
  for (let i = 0; i < 24; i++) {
    const sx = (i * 19 + (i % 3) * 7) % 244;
    const sy = 10 + ((i * 11) % 22);
    const w = 16 + (i % 5) * 8;
    const h = 8 + (i % 4) * 5;
    smCtx.fillStyle = `rgba(241, 245, 249, ${0.42 + (i % 3) * 0.14})`;
    smCtx.beginPath();
    smCtx.ellipse(sx + 6, sy + 6, w * 0.55, h * 0.5, ((i % 5) - 2) * 0.08, 0, Math.PI * 2);
    smCtx.fill();
  }
  // Primary weathered yellow parkour brush strokes & handprint/scuff streaks
  for (let i = 0; i < 32; i++) {
    const sx = (i * 15 + 4) % 246;
    const sy = 14 + ((i * 7) % 20);
    const w = 14 + (i % 4) * 7;
    const h = 7 + (i % 3) * 4;
    smCtx.fillStyle = i % 4 === 0 ? 'rgba(250, 204, 21, 0.72)' : 'rgba(234, 179, 8, 0.58)';
    smCtx.beginPath();
    smCtx.ellipse(sx + 4, sy + 4, w * 0.5, h * 0.45, ((i % 3) - 1) * 0.1, 0, Math.PI * 2);
    smCtx.fill();
  }
  // Subtle paint drips & chipped gaps for aged realism
  for (let d = 0; d < 14; d++) {
    const dx = 10 + ((d * 23) % 236);
    smCtx.fillStyle = d % 2 === 0 ? 'rgba(234, 179, 8, 0.52)' : 'rgba(241, 245, 249, 0.45)';
    smCtx.fillRect(dx, 28, 3 + (d % 3), 14 + (d % 16));
  }
  const parkourPaintSmudge = finalizeTexture(smCanvas, 1, 1, maxAnisotropy);
  parkourPaintSmudge.wrapS = THREE.RepeatWrapping;
  parkourPaintSmudge.wrapT = THREE.ClampToEdgeWrapping;

  // 29. Warm Yellow/Orange Painted Parkour Chevron Guide Stripes (>>>) for Rooftop Launch Edges
  const chCanvas = document.createElement('canvas');
  chCanvas.width = 256;
  chCanvas.height = 128;
  const chCtx = chCanvas.getContext('2d')!;
  chCtx.clearRect(0, 0, 256, 128);
  chCtx.fillStyle = 'rgba(24, 18, 14, 0.22)';
  chCtx.fillRect(0, 8, 256, 112);
  // 3 bold weathered >>> chevrons pointing upward/forward (-Z when mapped on horizontal plank)
  for (let c = 0; c < 3; c++) {
    const cx = 48 + c * 68;
    chCtx.strokeStyle = c === 2 ? '#fb923c' : '#facc15';
    chCtx.lineWidth = 14;
    chCtx.lineCap = 'round';
    chCtx.lineJoin = 'round';
    chCtx.beginPath();
    chCtx.moveTo(cx - 18, 28);
    chCtx.lineTo(cx + 16, 64);
    chCtx.lineTo(cx - 18, 100);
    chCtx.stroke();
  }
  // Distressed paint scuff chips
  for (let s = 0; s < 36; s++) {
    chCtx.clearRect((s * 31) % 248, (s * 19) % 120, 4 + (s % 5), 3 + (s % 4));
  }
  const parkourChevronGuide = finalizeTexture(chCanvas, 1, 1, maxAnisotropy);
  parkourChevronGuide.wrapS = THREE.ClampToEdgeWrapping;
  parkourChevronGuide.wrapT = THREE.ClampToEdgeWrapping;

  // 30. Colorful Indian Bazaar Fabric Awning & Bunting Pattern
  const bzCanvas = document.createElement('canvas');
  bzCanvas.width = 256;
  bzCanvas.height = 256;
  const bzCtx = bzCanvas.getContext('2d')!;
  const stripeColors = ['#ea580c', '#db2777', '#eab308', '#0d9488', '#dc2626', '#f59e0b'];
  const stripeW = 256 / stripeColors.length;
  stripeColors.forEach((col, idx) => {
    bzCtx.fillStyle = col;
    bzCtx.fillRect(idx * stripeW, 0, stripeW + 1, 256);
  });
  // Woven cotton trim bands & festive gold diamond block print
  bzCtx.fillStyle = 'rgba(255, 245, 220, 0.25)';
  for (let y = 16; y < 256; y += 48) {
    bzCtx.fillRect(0, y, 256, 5);
  }
  bzCtx.fillStyle = 'rgba(254, 240, 138, 0.65)';
  for (let y = 40; y < 256; y += 48) {
    for (let x = 20; x < 256; x += 42) {
      bzCtx.beginPath();
      bzCtx.moveTo(x, y - 8);
      bzCtx.lineTo(x + 8, y);
      bzCtx.lineTo(x, y + 8);
      bzCtx.lineTo(x - 8, y);
      bzCtx.closePath();
      bzCtx.fill();
    }
  }
  const bazaarBunting = finalizeTexture(bzCanvas, 2, 1, maxAnisotropy);

  // 31. Cracked Damp Asphalt (Albedo + Bump + Roughness for sunset specular sheen)
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = 256;
  aspCanvas.height = 256;
  const aspCtx = aspCanvas.getContext('2d')!;
  const aspBumpCanvas = document.createElement('canvas');
  aspBumpCanvas.width = 256;
  aspBumpCanvas.height = 256;
  const aspBCtx = aspBumpCanvas.getContext('2d')!;
  const aspRoughCanvas = document.createElement('canvas');
  aspRoughCanvas.width = 256;
  aspRoughCanvas.height = 256;
  const aspRCtx = aspRoughCanvas.getContext('2d')!;

  aspCtx.fillStyle = '#3a3836';
  aspCtx.fillRect(0, 0, 256, 256);
  aspBCtx.fillStyle = '#808080';
  aspBCtx.fillRect(0, 0, 256, 256);
  aspRCtx.fillStyle = '#dcdcdc';
  aspRCtx.fillRect(0, 0, 256, 256);

  // Aggregate mineral grit
  for (let i = 0; i < 1600; i++) {
    const gx = (i * 53 + (i % 7) * 19) % 256;
    const gy = (i * 97 + (i % 11) * 13) % 256;
    const v = (i % 5) * 9 - 18;
    aspCtx.fillStyle = `rgb(${58 + v},${56 + v},${54 + v})`;
    aspCtx.fillRect(gx, gy, 2, 2);
    const bv = 128 + v * 2;
    aspBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    aspBCtx.fillRect(gx, gy, 2, 2);
  }
  // Damp puddle patches catching warm golden-hour reflection (darker roughness = glossy)
  for (let p = 0; p < 5; p++) {
    const px = 42 + ((p * 67) % 175);
    const py = 36 + ((p * 89) % 184);
    const pr = 26 + (p % 3) * 14;
    const rGrad = aspRCtx.createRadialGradient(px, py, 4, px, py, pr);
    rGrad.addColorStop(0, 'rgba(38, 38, 38, 0.92)');
    rGrad.addColorStop(0.65, 'rgba(85, 85, 85, 0.65)');
    rGrad.addColorStop(1, 'rgba(220, 220, 220, 0)');
    aspRCtx.fillStyle = rGrad;
    aspRCtx.beginPath();
    aspRCtx.arc(px, py, pr, 0, Math.PI * 2);
    aspRCtx.fill();

    aspCtx.fillStyle = 'rgba(22, 23, 26, 0.28)';
    aspCtx.beginPath();
    aspCtx.arc(px, py, pr * 0.88, 0, Math.PI * 2);
    aspCtx.fill();
  }
  // Deep asphalt stress cracks
  for (let c = 0; c < 11; c++) {
    let cx = (c * 43) % 256;
    let cy = (c * 71) % 256;
    aspCtx.strokeStyle = 'rgba(16, 15, 14, 0.72)';
    aspCtx.lineWidth = 1.6;
    aspBCtx.strokeStyle = '#1a1a1a';
    aspBCtx.lineWidth = 2.0;
    aspCtx.beginPath();
    aspBCtx.beginPath();
    aspCtx.moveTo(cx, cy);
    aspBCtx.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += Math.sin(c * 2.1 + s * 1.9) * 22;
      cy += Math.cos(c * 1.7 + s * 2.3) * 18;
      aspCtx.lineTo(cx, cy);
      aspBCtx.lineTo(cx, cy);
    }
    aspCtx.stroke();
    aspBCtx.stroke();
  }
  const courtyardAsphalt = finalizeTexture(aspCanvas, 16, 16, maxAnisotropy);
  const courtyardAsphaltBump = finalizeLinearTexture(aspBumpCanvas, 16, 16, maxAnisotropy);
  const courtyardAsphaltRoughness = finalizeLinearTexture(aspRoughCanvas, 16, 16, maxAnisotropy);

  // 32. Weathered Stone / Brick Bump & Roughness
  const stBumpCanvas = document.createElement('canvas');
  stBumpCanvas.width = 256;
  stBumpCanvas.height = 256;
  const stBCtx = stBumpCanvas.getContext('2d')!;
  const stRoughCanvas = document.createElement('canvas');
  stRoughCanvas.width = 256;
  stRoughCanvas.height = 256;
  const stRCtx = stRoughCanvas.getContext('2d')!;
  stBCtx.fillStyle = '#909090';
  stBCtx.fillRect(0, 0, 256, 256);
  stRCtx.fillStyle = '#d4d4d4';
  stRCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 650; i++) {
    const sx = (i * 73) % 256;
    const sy = (i * 41) % 256;
    const shade = 110 + (i % 7) * 14;
    stBCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    stBCtx.fillRect(sx, sy, 6, 4);
    const rShade = 175 + (i % 6) * 12;
    stRCtx.fillStyle = `rgb(${rShade},${rShade},${rShade})`;
    stRCtx.fillRect(sx, sy, 7, 5);
  }
  stBCtx.strokeStyle = '#303030';
  stBCtx.lineWidth = 2.5;
  for (let y = 0; y < 256; y += 32) {
    stBCtx.beginPath();
    stBCtx.moveTo(0, y);
    stBCtx.lineTo(256, y);
    stBCtx.stroke();
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 256; x += 64) {
      stBCtx.beginPath();
      stBCtx.moveTo(x, y);
      stBCtx.lineTo(x, y + 32);
      stBCtx.stroke();
    }
  }
  const stoneBump = finalizeLinearTexture(stBumpCanvas, 4, 4, maxAnisotropy);
  const stoneRoughness = finalizeLinearTexture(stRoughCanvas, 4, 4, maxAnisotropy);

  // 33. Hardwood Baseball Bat Grain Bump & Roughness
  const bwBumpCanvas = document.createElement('canvas');
  bwBumpCanvas.width = 256;
  bwBumpCanvas.height = 256;
  const bwBCtx = bwBumpCanvas.getContext('2d')!;
  const bwRoughCanvas = document.createElement('canvas');
  bwRoughCanvas.width = 256;
  bwRoughCanvas.height = 256;
  const bwRCtx = bwRoughCanvas.getContext('2d')!;
  bwBCtx.fillStyle = '#848484';
  bwBCtx.fillRect(0, 0, 256, 256);
  bwRCtx.fillStyle = '#9a9a9a';
  bwRCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 3) {
    const wave = Math.sin(x * 0.24) * 26;
    const bVal = Math.max(40, Math.min(220, Math.round(128 + wave)));
    bwBCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bwBCtx.fillRect(x, 0, 2, 256);
    const rVal = Math.max(95, Math.min(225, Math.round(150 - wave * 0.6)));
    bwRCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    bwRCtx.fillRect(x, 0, 2, 256);
  }
  // Scratches & battle gouges across bat barrel
  bwBCtx.strokeStyle = '#383838';
  bwBCtx.lineWidth = 1.4;
  bwRCtx.strokeStyle = '#e5e5e5';
  bwRCtx.lineWidth = 1.6;
  for (let g = 0; g < 16; g++) {
    const gx = (g * 37) % 230;
    const gy = (g * 59) % 220;
    bwBCtx.beginPath();
    bwBCtx.moveTo(gx, gy);
    bwBCtx.lineTo(gx + 18 + (g % 14), gy + 8);
    bwBCtx.stroke();
    bwRCtx.beginPath();
    bwRCtx.moveTo(gx, gy);
    bwRCtx.lineTo(gx + 18 + (g % 14), gy + 8);
    bwRCtx.stroke();
  }
  const batWoodBump = finalizeLinearTexture(bwBumpCanvas, 1, 1, maxAnisotropy);
  const batWoodRoughness = finalizeLinearTexture(bwRoughCanvas, 1, 1, maxAnisotropy);

  // 34. Woven Cloth Wrap Bump & Roughness
  const cwBumpCanvas = document.createElement('canvas');
  cwBumpCanvas.width = 128;
  cwBumpCanvas.height = 128;
  const cwBCtx = cwBumpCanvas.getContext('2d')!;
  const cwRoughCanvas = document.createElement('canvas');
  cwRoughCanvas.width = 128;
  cwRoughCanvas.height = 128;
  const cwRCtx = cwRoughCanvas.getContext('2d')!;
  cwBCtx.fillStyle = '#787878';
  cwBCtx.fillRect(0, 0, 128, 128);
  cwRCtx.fillStyle = '#dedede';
  cwRCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    for (let x = 0; x < 128; x += 4) {
      const checker = ((x + y) / 4) % 2 === 0;
      cwBCtx.fillStyle = checker ? '#a8a8a8' : '#585858';
      cwBCtx.fillRect(x, y, 3, 3);
      cwRCtx.fillStyle = checker ? '#ededed' : '#cccccc';
      cwRCtx.fillRect(x, y, 3, 3);
    }
  }
  const clothWrapBump = finalizeLinearTexture(cwBumpCanvas, 4, 4, maxAnisotropy);
  const clothWrapRoughness = finalizeLinearTexture(cwRoughCanvas, 4, 4, maxAnisotropy);

  // 35. Soft Floating Atmospheric Dust / Ash Mote Sprite
  const dustCanvas = document.createElement('canvas');
  dustCanvas.width = 64;
  dustCanvas.height = 64;
  const dustCtx = dustCanvas.getContext('2d')!;
  const dGrad = dustCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
  dGrad.addColorStop(0, 'rgba(255, 240, 214, 0.95)');
  dGrad.addColorStop(0.45, 'rgba(245, 210, 175, 0.45)');
  dGrad.addColorStop(1, 'rgba(245, 210, 175, 0)');
  dustCtx.fillStyle = dGrad;
  dustCtx.fillRect(0, 0, 64, 64);
  const dustMote = finalizeTexture(dustCanvas, 1, 1, maxAnisotropy);
  dustMote.wrapS = THREE.ClampToEdgeWrapping;
  dustMote.wrapT = THREE.ClampToEdgeWrapping;

  // 36. Organic Crimson Ground Blood Spatter Decal Texture (alpha-masked multi-lobe splatter + satellite drops)
  const bsCanvas = document.createElement('canvas');
  bsCanvas.width = 256;
  bsCanvas.height = 256;
  const bsCtx = bsCanvas.getContext('2d')!;
  bsCtx.clearRect(0, 0, 256, 256);

  // Outer crimson splatter halo & radial spray lobes
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + (i % 3) * 0.14;
    const dist = 24 + ((i * 37) % 44);
    const rx = 18 + (i % 4) * 9;
    const ry = 10 + (i % 3) * 6;
    const cx = 128 + Math.cos(ang) * dist;
    const cy = 128 + Math.sin(ang) * dist;
    bsCtx.save();
    bsCtx.translate(cx, cy);
    bsCtx.rotate(ang);
    const g = bsCtx.createRadialGradient(0, 0, 2, 0, 0, rx);
    g.addColorStop(0, 'rgba(98, 4, 8, 0.94)');
    g.addColorStop(0.65, 'rgba(136, 8, 12, 0.84)');
    g.addColorStop(1, 'rgba(110, 4, 8, 0)');
    bsCtx.fillStyle = g;
    bsCtx.beginPath();
    bsCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    bsCtx.fill();
    bsCtx.restore();
  }
  // Dense central pooled blood core
  const coreGrad = bsCtx.createRadialGradient(128, 128, 8, 128, 128, 62);
  coreGrad.addColorStop(0, 'rgba(64, 2, 4, 0.98)');
  coreGrad.addColorStop(0.55, 'rgba(118, 6, 10, 0.94)');
  coreGrad.addColorStop(0.88, 'rgba(148, 12, 14, 0.72)');
  coreGrad.addColorStop(1, 'rgba(120, 6, 10, 0)');
  bsCtx.fillStyle = coreGrad;
  bsCtx.beginPath();
  bsCtx.arc(128, 128, 62, 0, Math.PI * 2);
  bsCtx.fill();
  // Fine radial satellite spray droplets
  for (let d = 0; d < 42; d++) {
    const ang = d * 2.39996;
    const rDist = 66 + ((d * 29) % 52);
    const dx = 128 + Math.cos(ang) * rDist;
    const dy = 128 + Math.sin(ang) * rDist;
    const rad = 2.2 + (d % 5) * 1.4;
    bsCtx.fillStyle = d % 2 === 0 ? 'rgba(128, 8, 12, 0.88)' : 'rgba(84, 4, 8, 0.82)';
    bsCtx.beginPath();
    bsCtx.ellipse(dx, dy, rad * 1.35, rad * 0.8, ang, 0, Math.PI * 2);
    bsCtx.fill();
  }
  const bloodSpatter = finalizeTexture(bsCanvas, 1, 1, maxAnisotropy);
  bloodSpatter.wrapS = THREE.ClampToEdgeWrapping;
  bloodSpatter.wrapT = THREE.ClampToEdgeWrapping;

  // 37. Polished Cream Interior Porcelain Tile Floor (Agra Haveli Living Hall)
  const pctCanvas = document.createElement('canvas');
  pctCanvas.width = 256;
  pctCanvas.height = 256;
  const pctCtx = pctCanvas.getContext('2d')!;
  pctCtx.fillStyle = '#e7dfd1';
  pctCtx.fillRect(0, 0, 256, 256);
  for (let ty = 0; ty < 256; ty += 64) {
    for (let tx = 0; tx < 256; tx += 64) {
      const tint = ((tx * 3 + ty * 7) % 10) - 5;
      pctCtx.fillStyle = `rgb(${232 + tint}, ${223 + tint}, ${209 + tint})`;
      pctCtx.fillRect(tx + 2, ty + 2, 60, 60);
      // Soft diagonal specular sheen on tile
      pctCtx.strokeStyle = 'rgba(182, 168, 148, 0.16)';
      pctCtx.lineWidth = 1.2;
      pctCtx.beginPath();
      pctCtx.moveTo(tx + 8, ty + 14);
      pctCtx.quadraticCurveTo(tx + 32, ty + 28, tx + 54, ty + 48);
      pctCtx.stroke();
    }
  }
  pctCtx.strokeStyle = 'rgba(155, 142, 124, 0.34)';
  pctCtx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    pctCtx.beginPath();
    pctCtx.moveTo(0, i);
    pctCtx.lineTo(256, i);
    pctCtx.stroke();
    pctCtx.beginPath();
    pctCtx.moveTo(i, 0);
    pctCtx.lineTo(i, 256);
    pctCtx.stroke();
  }
  const polishedCreamTile = finalizeTexture(pctCanvas, 4, 4, maxAnisotropy);

  // 38. Mint-Green & Teak Wood Paneled Haveli Door Leaf (matches interior reference!)
  const hdwCanvas = document.createElement('canvas');
  hdwCanvas.width = 256;
  hdwCanvas.height = 512;
  const hdwCtx = hdwCanvas.getContext('2d')!;
  // Soft mint-green outer stiles and rails
  hdwCtx.fillStyle = '#99c5a9';
  hdwCtx.fillRect(0, 0, 256, 512);
  // Subtle mint bevel highlights
  hdwCtx.strokeStyle = '#b4dcc2';
  hdwCtx.lineWidth = 4;
  hdwCtx.strokeRect(4, 4, 248, 504);
  hdwCtx.strokeStyle = '#6c987d';
  hdwCtx.lineWidth = 3;
  hdwCtx.strokeRect(10, 10, 236, 492);
  // Upper & lower recessed warm teak wood panels
  const drawWoodPanel = (px: number, py: number, pw: number, ph: number) => {
    hdwCtx.fillStyle = '#6f4226';
    hdwCtx.fillRect(px, py, pw, ph);
    hdwCtx.strokeStyle = '#472814';
    hdwCtx.lineWidth = 5;
    hdwCtx.strokeRect(px, py, pw, ph);
    hdwCtx.strokeStyle = 'rgba(148, 96, 58, 0.45)';
    hdwCtx.lineWidth = 2;
    for (let gx = px + 8; gx < px + pw - 6; gx += 10) {
      hdwCtx.beginPath();
      hdwCtx.moveTo(gx, py + 4);
      hdwCtx.lineTo(gx + Math.sin(gx * 0.15) * 2, py + ph - 4);
      hdwCtx.stroke();
    }
  };
  drawWoodPanel(34, 34, 188, 236);
  drawWoodPanel(34, 306, 188, 172);
  // Brass handle plate & latch knob near edge
  hdwCtx.fillStyle = '#d4a438';
  hdwCtx.fillRect(202, 244, 14, 54);
  hdwCtx.fillStyle = '#fde68a';
  hdwCtx.beginPath();
  hdwCtx.arc(209, 266, 7, 0, Math.PI * 2);
  hdwCtx.fill();
  const haveliDoorWood = finalizeTexture(hdwCanvas, 1, 1, maxAnisotropy);
  haveliDoorWood.wrapS = THREE.ClampToEdgeWrapping;
  haveliDoorWood.wrapT = THREE.ClampToEdgeWrapping;

  // 39. Tall Blue-Mullioned Daylight Staircase Window
  const bmwCanvas = document.createElement('canvas');
  bmwCanvas.width = 256;
  bmwCanvas.height = 256;
  const bmwCtx = bmwCanvas.getContext('2d')!;
  const winSky = bmwCtx.createLinearGradient(0, 0, 0, 256);
  winSky.addColorStop(0, '#c6e5f5');
  winSky.addColorStop(0.55, '#a8d5ea');
  winSky.addColorStop(1, '#e6d8be');
  bmwCtx.fillStyle = winSky;
  bmwCtx.fillRect(0, 0, 256, 256);
  bmwCtx.strokeStyle = '#1e3a5f';
  bmwCtx.lineWidth = 8;
  bmwCtx.strokeRect(4, 4, 248, 248);
  bmwCtx.lineWidth = 5;
  for (let x = 64; x < 256; x += 64) {
    bmwCtx.beginPath();
    bmwCtx.moveTo(x, 0);
    bmwCtx.lineTo(x, 256);
    bmwCtx.stroke();
  }
  for (let y = 64; y < 256; y += 64) {
    bmwCtx.beginPath();
    bmwCtx.moveTo(0, y);
    bmwCtx.lineTo(256, y);
    bmwCtx.stroke();
  }
  const blueMullionWindow = finalizeTexture(bmwCanvas, 1, 1, maxAnisotropy);
  blueMullionWindow.wrapS = THREE.ClampToEdgeWrapping;
  blueMullionWindow.wrapT = THREE.ClampToEdgeWrapping;

  // 40. Iconic Yellow Indian Railways Board: "आगरा छावनी / AGRA CANTT / M.S.L. 167.30 M."
  const canttCanvas = document.createElement('canvas');
  canttCanvas.width = 1024;
  canttCanvas.height = 512;
  const cCtx = canttCanvas.getContext('2d')!;
  const canttGrad = cCtx.createLinearGradient(0, 0, 1024, 512);
  canttGrad.addColorStop(0, '#f8c325');
  canttGrad.addColorStop(0.55, '#f2b114');
  canttGrad.addColorStop(1, '#e19c0a');
  cCtx.fillStyle = canttGrad;
  cCtx.fillRect(0, 0, 1024, 512);
  // Subtle sunlit weathering streaks
  for (let i = 0; i < 160; i++) {
    cCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 245, 200, 0.08)' : 'rgba(130, 82, 0, 0.07)';
    cCtx.fillRect((i * 73) % 1024, (i * 41) % 512, 48, 8);
  }
  cCtx.strokeStyle = '#6c4204';
  cCtx.lineWidth = 10;
  cCtx.strokeRect(18, 18, 988, 476);
  cCtx.fillStyle = '#181410';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  cCtx.font = 'bold 148px "Noto Sans Devanagari", "Kohinoor Devanagari", sans-serif';
  cCtx.fillText('आगरा छावनी', 512, 165);
  cCtx.font = '900 84px "Arial Black", "Segoe UI", sans-serif';
  cCtx.textAlign = 'left';
  cCtx.fillText('AGRA CANTT', 64, 336);
  cCtx.font = 'bold 74px "Noto Nastaliq Urdu", serif';
  cCtx.textAlign = 'right';
  cCtx.fillText('آگرہ چھاؤنی', 956, 332);
  cCtx.fillStyle = '#b91c1c';
  cCtx.textAlign = 'center';
  cCtx.font = 'bold 34px "Arial", sans-serif';
  cCtx.fillText('M.S.L. - 167.30 M.', 512, 434);
  const railwayBoardCantt = finalizeTexture(canttCanvas, 1, 1, maxAnisotropy);
  railwayBoardCantt.wrapS = THREE.ClampToEdgeWrapping;
  railwayBoardCantt.wrapT = THREE.ClampToEdgeWrapping;

  // 41. Platform 2 Yellow Indian Railways Board: "आगरा शहर / AGRA CITY"
  const cityCanvas = document.createElement('canvas');
  cityCanvas.width = 768;
  cityCanvas.height = 384;
  const cyCtx = cityCanvas.getContext('2d')!;
  cyCtx.fillStyle = '#f6c31c';
  cyCtx.fillRect(0, 0, 768, 384);
  cyCtx.strokeStyle = '#4a3204';
  cyCtx.lineWidth = 8;
  cyCtx.strokeRect(14, 14, 740, 356);
  cyCtx.fillStyle = '#161310';
  cyCtx.textAlign = 'center';
  cyCtx.textBaseline = 'middle';
  cyCtx.font = 'bold 112px "Noto Sans Devanagari", sans-serif';
  cyCtx.fillText('आगरा शहर', 384, 134);
  cyCtx.font = '900 66px "Arial Black", sans-serif';
  cyCtx.textAlign = 'left';
  cyCtx.fillText('AGRA CITY', 56, 272);
  cyCtx.font = 'bold 58px "Noto Nastaliq Urdu", serif';
  cyCtx.textAlign = 'right';
  cyCtx.fillText('آگرہ شہر', 712, 268);
  const railwayBoardCity = finalizeTexture(cityCanvas, 1, 1, maxAnisotropy);
  railwayBoardCity.wrapS = THREE.ClampToEdgeWrapping;
  railwayBoardCity.wrapT = THREE.ClampToEdgeWrapping;

  // 42. Deep Blue North Central Railway Facade Sign: "उत्तर मध्य रेलवे / आगरा छावनी"
  const ncrCanvas = document.createElement('canvas');
  ncrCanvas.width = 1024;
  ncrCanvas.height = 320;
  const nCtx = ncrCanvas.getContext('2d')!;
  nCtx.fillStyle = '#183c7c';
  nCtx.fillRect(0, 0, 1024, 320);
  nCtx.strokeStyle = '#dbeafe';
  nCtx.lineWidth = 8;
  nCtx.strokeRect(14, 14, 996, 292);
  nCtx.fillStyle = '#f8fafc';
  nCtx.textAlign = 'center';
  nCtx.textBaseline = 'middle';
  nCtx.font = 'bold 46px "Noto Sans Devanagari", sans-serif';
  nCtx.fillText('उत्तर मध्य रेलवे', 512, 74);
  nCtx.font = 'bold 132px "Noto Sans Devanagari", sans-serif';
  nCtx.fillText('आगरा छावनी', 512, 206);
  const railwayFacadeNcr = finalizeTexture(ncrCanvas, 1, 1, maxAnisotropy);
  railwayFacadeNcr.wrapS = THREE.ClampToEdgeWrapping;
  railwayFacadeNcr.wrapT = THREE.ClampToEdgeWrapping;

  // 43. Green Forecourt Entry Sign: "प्रवेश / ENTRY - DROP & DRIVE"
  const ddCanvas = document.createElement('canvas');
  ddCanvas.width = 512;
  ddCanvas.height = 384;
  const ddCtx = ddCanvas.getContext('2d')!;
  ddCtx.fillStyle = '#157347';
  ddCtx.fillRect(0, 0, 512, 384);
  ddCtx.strokeStyle = '#ecfdf5';
  ddCtx.lineWidth = 10;
  ddCtx.strokeRect(14, 14, 484, 356);
  ddCtx.fillStyle = '#ffffff';
  ddCtx.textAlign = 'center';
  ddCtx.textBaseline = 'middle';
  ddCtx.font = 'bold 46px "Noto Sans Devanagari", sans-serif';
  ddCtx.fillText('प्रवेश', 256, 68);
  ddCtx.font = 'bold 30px "Noto Sans Devanagari", sans-serif';
  ddCtx.fillText('ड्राप एण्ड ड्राइव', 256, 126);
  ddCtx.fillText('वी आई पी लेन', 256, 170);
  ddCtx.font = '900 58px "Arial Black", sans-serif';
  ddCtx.fillText('ENTRY', 256, 248);
  ddCtx.font = 'bold 34px "Arial", sans-serif';
  ddCtx.fillText('DROP & DRIVE', 256, 314);
  const railwayDropDrive = finalizeTexture(ddCanvas, 1, 1, maxAnisotropy);
  railwayDropDrive.wrapS = THREE.ClampToEdgeWrapping;
  railwayDropDrive.wrapT = THREE.ClampToEdgeWrapping;

  // 44 & 45. Glowing Red Digital LED Clocks (12:07 and 17:44)
  const makeLedClockTex = (timeStr: string) => {
    const ckCanvas = document.createElement('canvas');
    ckCanvas.width = 512;
    ckCanvas.height = 192;
    const ckCtx = ckCanvas.getContext('2d')!;
    ckCtx.fillStyle = '#090a0d';
    ckCtx.fillRect(0, 0, 512, 192);
    ckCtx.strokeStyle = '#334155';
    ckCtx.lineWidth = 10;
    ckCtx.strokeRect(8, 8, 496, 176);
    ckCtx.shadowColor = '#ef4444';
    ckCtx.shadowBlur = 18;
    ckCtx.fillStyle = '#ff2e2e';
    ckCtx.textAlign = 'center';
    ckCtx.textBaseline = 'middle';
    ckCtx.font = '900 122px "Courier New", monospace';
    ckCtx.fillText(timeStr, 256, 102);
    const tex = finalizeTexture(ckCanvas, 1, 1, maxAnisotropy);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };
  const railwayClock1207 = makeLedClockTex('12:07');
  const railwayClock1744 = makeLedClockTex('17:44');

  // 46. Yellow Hanging Concourse Board: "EXECUTIVE LOUNGE / PLATFORMS 1-3"
  const exCanvas = document.createElement('canvas');
  exCanvas.width = 512;
  exCanvas.height = 384;
  const exCtx = exCanvas.getContext('2d')!;
  exCtx.fillStyle = '#facc15';
  exCtx.fillRect(0, 0, 512, 384);
  exCtx.strokeStyle = '#713f12';
  exCtx.lineWidth = 8;
  exCtx.strokeRect(10, 10, 492, 364);
  exCtx.fillStyle = '#18181b';
  exCtx.textAlign = 'center';
  exCtx.font = 'bold 34px "Noto Sans Devanagari", sans-serif';
  exCtx.fillText('एग्जीक्यूटिव लाउंज', 256, 56);
  exCtx.font = '900 32px "Arial Black", sans-serif';
  exCtx.fillText('EXECUTIVE LOUNGE', 256, 100);
  exCtx.fillStyle = '#b91c1c';
  exCtx.font = 'bold 26px "Arial", sans-serif';
  exCtx.fillText('PLATFORM NO. 1-3  |  WAITING HALL', 256, 144);
  exCtx.fillStyle = '#27272a';
  exCtx.font = '22px "Arial", sans-serif';
  exCtx.fillText('• Fully A.C.   • Reclining Chairs', 256, 198);
  exCtx.fillText('• Refreshment  • Wi-Fi & Washroom', 256, 236);
  exCtx.fillText('• Luggage Rack • Train Display', 256, 274);
  // Red directional arrow at bottom
  exCtx.fillStyle = '#dc2626';
  exCtx.fillRect(116, 326, 280, 14);
  exCtx.beginPath();
  exCtx.moveTo(86, 333);
  exCtx.lineTo(126, 310);
  exCtx.lineTo(126, 356);
  exCtx.closePath();
  exCtx.fill();
  const railwayExecSign = finalizeTexture(exCanvas, 1, 1, maxAnisotropy);
  railwayExecSign.wrapS = THREE.ClampToEdgeWrapping;
  railwayExecSign.wrapT = THREE.ClampToEdgeWrapping;

  // 47. Colonial Painted Red Station Brick (Agra Cantt Wings)
  const rbrCanvas = document.createElement('canvas');
  rbrCanvas.width = 256;
  rbrCanvas.height = 256;
  const rbCtx = rbrCanvas.getContext('2d')!;
  rbCtx.fillStyle = '#a6201b';
  rbCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    const y = row * 16;
    const offset = (row % 2) * 24;
    for (let col = -1; col < 6; col++) {
      const x = col * 48 + offset;
      const tone = ((row * 13 + col * 19) % 16) - 8;
      rbCtx.fillStyle = `rgb(${168 + tone}, ${32 + Math.floor(tone * 0.4)}, ${28 + Math.floor(tone * 0.3)})`;
      rbCtx.fillRect(x + 2, y + 2, 44, 12);
    }
  }
  rbCtx.strokeStyle = 'rgba(235, 224, 212, 0.25)';
  rbCtx.lineWidth = 1.5;
  for (let y = 0; y <= 256; y += 16) {
    rbCtx.beginPath();
    rbCtx.moveTo(0, y);
    rbCtx.lineTo(256, y);
    rbCtx.stroke();
  }
  const railwayBrickRed = finalizeTexture(rbrCanvas, 4, 2, maxAnisotropy);

  // 48. Whitewashed Colonial Station Portico Brick
  const wbrCanvas = document.createElement('canvas');
  wbrCanvas.width = 256;
  wbrCanvas.height = 256;
  const wbCtx = wbrCanvas.getContext('2d')!;
  wbCtx.fillStyle = '#ece7de';
  wbCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    const y = row * 16;
    const offset = (row % 2) * 24;
    for (let col = -1; col < 6; col++) {
      const x = col * 48 + offset;
      const v = 232 + (((row * 17 + col * 23) % 12) - 6);
      wbCtx.fillStyle = `rgb(${v}, ${v - 4}, ${v - 11})`;
      wbCtx.fillRect(x + 2, y + 2, 44, 12);
    }
  }
  wbCtx.strokeStyle = 'rgba(130, 122, 112, 0.32)';
  wbCtx.lineWidth = 1.5;
  for (let y = 0; y <= 256; y += 16) {
    wbCtx.beginPath();
    wbCtx.moveTo(0, y);
    wbCtx.lineTo(256, y);
    wbCtx.stroke();
  }
  const railwayWhiteBrick = finalizeTexture(wbrCanvas, 3, 2, maxAnisotropy);

  // 49. Crushed Granite Railway Ballast Bed
  const balCanvas = document.createElement('canvas');
  balCanvas.width = 256;
  balCanvas.height = 256;
  const blCtx = balCanvas.getContext('2d')!;
  blCtx.fillStyle = '#494542';
  blCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const gx = (i * 73 + (i % 7) * 19) % 256;
    const gy = (i * 41 + (i % 11) * 13) % 256;
    const shade = 52 + ((i * 29) % 62);
    const warm = i % 9 === 0 ? 18 : 0;
    blCtx.fillStyle = `rgb(${shade + warm}, ${shade + Math.floor(warm * 0.4)}, ${shade - 4})`;
    blCtx.fillRect(gx, gy, 4 + (i % 4), 3 + (i % 3));
  }
  const railwayBallast = finalizeTexture(balCanvas, 2, 18, maxAnisotropy);

  // 50, 51, 52. Indian Railways Coach Exterior Liveries (ICF Blue Sleeper, Cream & Maroon Express, Green & Yellow Garib Rath)
  const makeCoachLiveryTex = (opts: {
    baseHex: string;
    bandHex: string;
    stripeHex: string;
    accentStripeHex?: string;
    coachCode: string;
    tricolor?: boolean;
  }) => {
    const lvCanvas = document.createElement('canvas');
    lvCanvas.width = 1024;
    lvCanvas.height = 256;
    const lvCtx = lvCanvas.getContext('2d')!;
    lvCtx.fillStyle = opts.baseHex;
    lvCtx.fillRect(0, 0, 1024, 256);
    // Window belt band
    lvCtx.fillStyle = opts.bandHex;
    lvCtx.fillRect(0, 54, 1024, 108);
    // Horizontal railway stripes
    lvCtx.fillStyle = opts.stripeHex;
    lvCtx.fillRect(0, 44, 1024, 10);
    lvCtx.fillRect(0, 162, 1024, 14);
    if (opts.accentStripeHex) {
      lvCtx.fillStyle = opts.accentStripeHex;
      lvCtx.fillRect(0, 176, 1024, 8);
    }
    // Weathered underframe grime
    const grime = lvCtx.createLinearGradient(0, 210, 0, 256);
    grime.addColorStop(0, 'rgba(35, 28, 22, 0)');
    grime.addColorStop(1, 'rgba(30, 24, 18, 0.55)');
    lvCtx.fillStyle = grime;
    lvCtx.fillRect(0, 210, 1024, 46);
    // Panel seam lines & steel rivets
    lvCtx.strokeStyle = 'rgba(0,0,0,0.22)';
    lvCtx.lineWidth = 2;
    for (let x = 0; x < 1024; x += 128) {
      lvCtx.beginPath();
      lvCtx.moveTo(x, 0);
      lvCtx.lineTo(x, 256);
      lvCtx.stroke();
    }
    // Indian Tricolor Flag Emblem near vestibule
    if (opts.tricolor) {
      lvCtx.fillStyle = '#ff9933';
      lvCtx.fillRect(28, 66, 56, 12);
      lvCtx.fillStyle = '#ffffff';
      lvCtx.fillRect(28, 78, 56, 12);
      lvCtx.fillStyle = '#138808';
      lvCtx.fillRect(28, 90, 56, 12);
      lvCtx.strokeStyle = '#1e3a8a';
      lvCtx.lineWidth = 2;
      lvCtx.beginPath();
      lvCtx.arc(56, 84, 4.5, 0, Math.PI * 2);
      lvCtx.stroke();
    }
    // Coach number & destination plate
    lvCtx.fillStyle = '#fef08a';
    lvCtx.font = '900 32px "Arial Black", sans-serif';
    lvCtx.textAlign = 'left';
    lvCtx.fillText(opts.coachCode, 102, 118);
    lvCtx.fillStyle = '#f8fafc';
    lvCtx.font = 'bold 20px "Arial", sans-serif';
    lvCtx.fillText('NORTH CENTRAL RLY', 740, 34);
    const tex = finalizeTexture(lvCanvas, 1, 1, maxAnisotropy);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  const railwayIcfBlue = makeCoachLiveryTex({
    baseHex: '#1888cc',
    bandHex: '#0d4f8b',
    stripeHex: '#cbd5e1',
    accentStripeHex: '#e2e8f0',
    coachCode: 'S7',
    tricolor: true,
  });
  const railwayCreamExpress = makeCoachLiveryTex({
    baseHex: '#e2d7bc',
    bandHex: '#cfc09d',
    stripeHex: '#7f1d1d',
    accentStripeHex: '#991b1b',
    coachCode: 'B3',
  });
  const railwayGaribGreen = makeCoachLiveryTex({
    baseHex: '#198754',
    bandHex: '#facc15',
    stripeHex: '#fef9c3',
    accentStripeHex: '#14532d',
    coachCode: 'G4',
  });

  return {
    marble,
    sandstone,
    courtyardTile,
    woodPlank,
    rustedMetal,
    bazaarWall,
    poolWater,
    contactShadow,
    chainLink,
    blueTarp,
    jaliLattice,
    domeRibs,
    tealWindow,
    nightHunterMuscle,
    diamondPlate,
    skinDetail,
    wristWrapTape,
    tacticalGlove,
    charbaghGrass,
    baseballBatWood,
    batGripTape,
    zombieSkin,
    zombieSkinBump,
    zombieCloth,
    dogFurRot,
    dogFurBump,
    safeHouseSign,
    pietraDura,
    charbaghFlowerbed,
    parkourWallPaint,
    parkourPaintSmudge,
    parkourChevronGuide,
    bazaarBunting,
    courtyardAsphalt,
    courtyardAsphaltBump,
    courtyardAsphaltRoughness,
    stoneBump,
    stoneRoughness,
    batWoodBump,
    batWoodRoughness,
    clothWrapBump,
    clothWrapRoughness,
    dustMote,
    bloodSpatter,
    polishedCreamTile,
    haveliDoorWood,
    blueMullionWindow,
    railwayBoardCantt,
    railwayBoardCity,
    railwayFacadeNcr,
    railwayDropDrive,
    railwayClock1207,
    railwayClock1744,
    railwayExecSign,
    railwayBrickRed,
    railwayWhiteBrick,
    railwayBallast,
    railwayIcfBlue,
    railwayCreamExpress,
    railwayGaribGreen,
    dispose: () => {
      marble.dispose();
      sandstone.dispose();
      courtyardTile.dispose();
      woodPlank.dispose();
      rustedMetal.dispose();
      bazaarWall.dispose();
      poolWater.dispose();
      contactShadow.dispose();
      chainLink.dispose();
      blueTarp.dispose();
      jaliLattice.dispose();
      domeRibs.dispose();
      tealWindow.dispose();
      nightHunterMuscle.dispose();
      diamondPlate.dispose();
      skinDetail.dispose();
      wristWrapTape.dispose();
      tacticalGlove.dispose();
      charbaghGrass.dispose();
      baseballBatWood.dispose();
      batGripTape.dispose();
      zombieSkin.dispose();
      zombieSkinBump.dispose();
      zombieCloth.dispose();
      dogFurRot.dispose();
      dogFurBump.dispose();
      safeHouseSign.dispose();
      pietraDura.dispose();
      charbaghFlowerbed.dispose();
      parkourWallPaint.dispose();
      parkourPaintSmudge.dispose();
      parkourChevronGuide.dispose();
      bazaarBunting.dispose();
      courtyardAsphalt.dispose();
      courtyardAsphaltBump.dispose();
      courtyardAsphaltRoughness.dispose();
      stoneBump.dispose();
      stoneRoughness.dispose();
      batWoodBump.dispose();
      batWoodRoughness.dispose();
      clothWrapBump.dispose();
      clothWrapRoughness.dispose();
      dustMote.dispose();
      bloodSpatter.dispose();
      polishedCreamTile.dispose();
      haveliDoorWood.dispose();
      blueMullionWindow.dispose();
      railwayBoardCantt.dispose();
      railwayBoardCity.dispose();
      railwayFacadeNcr.dispose();
      railwayDropDrive.dispose();
      railwayClock1207.dispose();
      railwayClock1744.dispose();
      railwayExecSign.dispose();
      railwayBrickRed.dispose();
      railwayWhiteBrick.dispose();
      railwayBallast.dispose();
      railwayIcfBlue.dispose();
      railwayCreamExpress.dispose();
      railwayGaribGreen.dispose();
    },
  };
}
