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
    },
  };
}
