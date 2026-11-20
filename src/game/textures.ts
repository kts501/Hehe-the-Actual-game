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
  marbleBump: THREE.CanvasTexture;
  marbleRoughness: THREE.CanvasTexture;
  sandstoneBump: THREE.CanvasTexture;
  sandstoneRoughness: THREE.CanvasTexture;
  grassBump: THREE.CanvasTexture;
  grassRoughness: THREE.CanvasTexture;
  waterRippleBump: THREE.CanvasTexture;
  zombieSkinRoughness: THREE.CanvasTexture;
  dogFurRoughness: THREE.CanvasTexture;
  nightHunterCarapace: THREE.CanvasTexture;
  nightHunterCarapaceBump: THREE.CanvasTexture;
  nightHunterCarapaceRoughness: THREE.CanvasTexture;
  bazaarWallBump: THREE.CanvasTexture;
  bazaarWallRoughness: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  rustedMetalBump: THREE.CanvasTexture;
  rustedMetalRoughness: THREE.CanvasTexture;
  dispose: () => void;
}

export interface ProceduralPBRTextureBundle {
  marbleMap: THREE.CanvasTexture;
  marbleBump: THREE.CanvasTexture;
  marbleRoughness: THREE.CanvasTexture;
  sandstoneMap: THREE.CanvasTexture;
  sandstoneBump: THREE.CanvasTexture;
  sandstoneRoughness: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  grassBump: THREE.CanvasTexture;
  grassRoughness: THREE.CanvasTexture;
  waterMap: THREE.CanvasTexture;
  waterRippleBump: THREE.CanvasTexture;
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

function hash2D(ix: number, iy: number, seed: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function tileableValueNoise(u: number, v: number, freq: number, seed: number): number {
  const fx = u * freq;
  const fy = v * freq;
  const ix0 = Math.floor(fx);
  const iy0 = Math.floor(fy);
  const tx = fx - ix0;
  const ty = fy - iy0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const x0 = ((ix0 % freq) + freq) % freq;
  const y0 = ((iy0 % freq) + freq) % freq;
  const x1 = (x0 + 1) % freq;
  const y1 = (y0 + 1) % freq;

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmTileable(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += tileableValueNoise(u, v, freq, seed + o * 19.3) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function createProceduralPBRTextures(maxAnisotropy = 8): ProceduralPBRTextureBundle {
  const SIZE = 512;
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));

  const setupColorTex = (canvas: HTMLCanvasElement, rx: number, ry: number): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
    return tex;
  };

  const setupDataTex = (canvas: HTMLCanvasElement, rx: number, ry: number): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
    return tex;
  };

  // ---------------------------------------------------------------------------
  // 1. Agra White Makrana Marble (512x512 Albedo + Bump + Polished Roughness)
  // ---------------------------------------------------------------------------
  const marbleAlbCanvas = document.createElement('canvas');
  marbleAlbCanvas.width = SIZE;
  marbleAlbCanvas.height = SIZE;
  const maCtx = marbleAlbCanvas.getContext('2d')!;
  const maImg = maCtx.createImageData(SIZE, SIZE);

  const marbleBumpCanvas = document.createElement('canvas');
  marbleBumpCanvas.width = SIZE;
  marbleBumpCanvas.height = SIZE;
  const mbCtx = marbleBumpCanvas.getContext('2d')!;
  const mbImg = mbCtx.createImageData(SIZE, SIZE);

  const marbleRoughCanvas = document.createElement('canvas');
  marbleRoughCanvas.width = SIZE;
  marbleRoughCanvas.height = SIZE;
  const mrCtx = marbleRoughCanvas.getContext('2d')!;
  const mrImg = mrCtx.createImageData(SIZE, SIZE);

  // Base #f5efe6 = (245, 239, 230), Veins #d6cec2 = (214, 206, 194)
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = (y * SIZE + x) * 4;

      const fbm1 = fbmTileable(u, v, 4, 4, 11.7);
      const fbm2 = fbmTileable(u, v, 8, 3, 37.2);
      // Organic mineral vein turbulence using multi-octave noise + sine warp
      const veinWave = Math.abs(Math.sin((u * 2.0 + v * 1.0 + fbm1 * 2.15) * Math.PI * 2));
      const primaryVein = Math.pow(1.0 - veinWave, 7.5);
      const fineWave = Math.abs(Math.sin((u * 4.0 - v * 3.0 + fbm2 * 2.6) * Math.PI * 2));
      const secondaryVein = Math.pow(1.0 - fineWave, 10.0) * 0.6;
      const veinFactor = Math.min(1, primaryVein * 0.85 + secondaryVein + (fbm2 - 0.5) * 0.14);

      const goldHint = Math.max(0, fbm1 - 0.52) * 0.35;
      const r = Math.round(245 - veinFactor * 31 - goldHint * 8);
      const g = Math.round(239 - veinFactor * 33 - goldHint * 14);
      const b = Math.round(230 - veinFactor * 36 - goldHint * 24);

      maImg.data[idx] = Math.max(0, Math.min(255, r));
      maImg.data[idx + 1] = Math.max(0, Math.min(255, g));
      maImg.data[idx + 2] = Math.max(0, Math.min(255, b));
      maImg.data[idx + 3] = 255;

      // Subtle mineral bump & polished roughness (~0.22 => ~56/255)
      const bVal = Math.round(132 - veinFactor * 26 + (fbm2 - 0.5) * 14);
      mbImg.data[idx] = bVal;
      mbImg.data[idx + 1] = bVal;
      mbImg.data[idx + 2] = bVal;
      mbImg.data[idx + 3] = 255;

      const rVal = Math.round(220 + veinFactor * 35); // scaled by material.roughness=0.22
      mrImg.data[idx] = Math.min(255, rVal);
      mrImg.data[idx + 1] = Math.min(255, rVal);
      mrImg.data[idx + 2] = Math.min(255, rVal);
      mrImg.data[idx + 3] = 255;
    }
  }
  maCtx.putImageData(maImg, 0, 0);
  mbCtx.putImageData(mbImg, 0, 0);
  mrCtx.putImageData(mrImg, 0, 0);

  // Inlaid Mughal geometric border trim & slab seams on Makrana marble
  maCtx.strokeStyle = 'rgba(182, 168, 148, 0.48)';
  maCtx.lineWidth = 2;
  mbCtx.strokeStyle = 'rgb(74, 74, 74)';
  mbCtx.lineWidth = 2.5;
  mrCtx.strokeStyle = 'rgb(255, 255, 255)';
  mrCtx.lineWidth = 2.5;
  for (let i = 0; i <= SIZE; i += 128) {
    [maCtx, mbCtx, mrCtx].forEach((ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(SIZE, i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, SIZE);
      ctx.stroke();
    });
  }
  // Delicate Mughal pietra dura geometric border trim band
  maCtx.strokeStyle = 'rgba(164, 146, 120, 0.42)';
  maCtx.lineWidth = 1.5;
  maCtx.strokeRect(10, 10, SIZE - 20, SIZE - 20);
  maCtx.strokeStyle = 'rgba(130, 118, 104, 0.35)';
  maCtx.strokeRect(18, 18, SIZE - 36, SIZE - 36);
  for (let k = 32; k < SIZE; k += 64) {
    maCtx.beginPath();
    maCtx.moveTo(k, 10);
    maCtx.lineTo(k + 8, 14);
    maCtx.lineTo(k, 18);
    maCtx.lineTo(k - 8, 14);
    maCtx.closePath();
    maCtx.stroke();
  }

  const marbleMap = setupColorTex(marbleAlbCanvas, 3, 3);
  const marbleBump = setupDataTex(marbleBumpCanvas, 3, 3);
  const marbleRoughness = setupDataTex(marbleRoughCanvas, 3, 3);

  // ---------------------------------------------------------------------------
  // 2. Red Agra Sandstone (512x512 Albedo + Ashlar Mortar Bump + Matte Roughness)
  // ---------------------------------------------------------------------------
  const sandAlbCanvas = document.createElement('canvas');
  sandAlbCanvas.width = SIZE;
  sandAlbCanvas.height = SIZE;
  const saCtx = sandAlbCanvas.getContext('2d')!;
  const saImg = saCtx.createImageData(SIZE, SIZE);

  const sandBumpCanvas = document.createElement('canvas');
  sandBumpCanvas.width = SIZE;
  sandBumpCanvas.height = SIZE;
  const sbCtx = sandBumpCanvas.getContext('2d')!;
  const sbImg = sbCtx.createImageData(SIZE, SIZE);

  const sandRoughCanvas = document.createElement('canvas');
  sandRoughCanvas.width = SIZE;
  sandRoughCanvas.height = SIZE;
  const srCtx = sandRoughCanvas.getContext('2d')!;
  const srImg = srCtx.createImageData(SIZE, SIZE);

  // Base #a8523a = (168, 82, 58)
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    const row = Math.floor(y / 64);
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = (y * SIZE + x) * 4;
      const col = Math.floor((x + (row % 2) * 64) / 128);
      const blockTint = (hash2D(col, row, 9.1) - 0.5) * 18;

      const grain = (hash2D(x, y, 3.7) - 0.5) * 22;
      const strata = fbmTileable(u * 0.5, v * 2.0, 6, 3, 51.3);
      const strataShift = (strata - 0.5) * 26;

      const r = Math.round(168 + blockTint + grain + strataShift);
      const g = Math.round(82 + blockTint * 0.55 + grain * 0.65 + strataShift * 0.55);
      const b = Math.round(58 + blockTint * 0.4 + grain * 0.5 + strataShift * 0.4);

      saImg.data[idx] = Math.max(0, Math.min(255, r));
      saImg.data[idx + 1] = Math.max(0, Math.min(255, g));
      saImg.data[idx + 2] = Math.max(0, Math.min(255, b));
      saImg.data[idx + 3] = 255;

      const bVal = Math.max(40, Math.min(235, Math.round(148 + grain * 1.4 + strataShift * 1.1)));
      sbImg.data[idx] = bVal;
      sbImg.data[idx + 1] = bVal;
      sbImg.data[idx + 2] = bVal;
      sbImg.data[idx + 3] = 255;

      const rVal = Math.max(190, Math.min(255, Math.round(224 + (strata - 0.5) * 32)));
      srImg.data[idx] = rVal;
      srImg.data[idx + 1] = rVal;
      srImg.data[idx + 2] = rVal;
      srImg.data[idx + 3] = 255;
    }
  }
  saCtx.putImageData(saImg, 0, 0);
  sbCtx.putImageData(sbImg, 0, 0);
  srCtx.putImageData(srImg, 0, 0);

  // Carved ashlar stone block mortar grid lines
  saCtx.strokeStyle = 'rgba(64, 28, 20, 0.68)';
  saCtx.lineWidth = 3.5;
  sbCtx.strokeStyle = 'rgb(34, 34, 34)';
  sbCtx.lineWidth = 4.0;
  srCtx.strokeStyle = 'rgb(255, 255, 255)';
  srCtx.lineWidth = 4.0;
  for (let y = 0; y <= SIZE; y += 64) {
    const offset = ((y / 64) % 2) * 64;
    [saCtx, sbCtx, srCtx].forEach((ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
      ctx.stroke();
      for (let x = offset; x < SIZE; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 64);
        ctx.stroke();
      }
    });
  }
  // Subtle sunlit upper-edge bevel on ashlar blocks
  saCtx.strokeStyle = 'rgba(222, 138, 108, 0.25)';
  saCtx.lineWidth = 1.5;
  for (let y = 3; y < SIZE; y += 64) {
    saCtx.beginPath();
    saCtx.moveTo(0, y);
    saCtx.lineTo(SIZE, y);
    saCtx.stroke();
  }

  const sandstoneMap = setupColorTex(sandAlbCanvas, 4, 4);
  const sandstoneBump = setupDataTex(sandBumpCanvas, 4, 4);
  const sandstoneRoughness = setupDataTex(sandRoughCanvas, 4, 4);

  // ---------------------------------------------------------------------------
  // 3. Charbagh Courtyard Grass & Garden Beds (512x512 Emerald/Olive + Micro-Bump)
  // ---------------------------------------------------------------------------
  const grassAlbCanvas = document.createElement('canvas');
  grassAlbCanvas.width = SIZE;
  grassAlbCanvas.height = SIZE;
  const gaCtx = grassAlbCanvas.getContext('2d')!;
  const gaImg = gaCtx.createImageData(SIZE, SIZE);

  const grassBumpCanvas = document.createElement('canvas');
  grassBumpCanvas.width = SIZE;
  grassBumpCanvas.height = SIZE;
  const gbCtx = grassBumpCanvas.getContext('2d')!;
  const gbImg = gbCtx.createImageData(SIZE, SIZE);

  const grassRoughCanvas = document.createElement('canvas');
  grassRoughCanvas.width = SIZE;
  grassRoughCanvas.height = SIZE;
  const grCtx = grassRoughCanvas.getContext('2d')!;

  // Base gradient between #3a5a32 (58,90,50) and #4d703f (77,112,63)
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = (y * SIZE + x) * 4;
      const patch = fbmTileable(u, v, 6, 3, 21.4);
      const blade = hash2D(x, y, 71.3);
      const t = Math.min(1, Math.max(0, patch * 0.72 + blade * 0.28));

      gaImg.data[idx] = Math.round(54 + t * 25);
      gaImg.data[idx + 1] = Math.round(86 + t * 30);
      gaImg.data[idx + 2] = Math.round(46 + t * 20);
      gaImg.data[idx + 3] = 255;

      const bVal = Math.round(92 + blade * 90 + (patch - 0.5) * 40);
      gbImg.data[idx] = bVal;
      gbImg.data[idx + 1] = bVal;
      gbImg.data[idx + 2] = bVal;
      gbImg.data[idx + 3] = 255;
    }
  }
  gaCtx.putImageData(gaImg, 0, 0);
  gbCtx.putImageData(gbImg, 0, 0);
  grCtx.fillStyle = '#ebebe9'; // ~0.92 high matte roughness
  grCtx.fillRect(0, 0, SIZE, SIZE);

  // Crisp grass blade strokes in emerald & olive tones
  for (let i = 0; i < 3600; i++) {
    const gx = (hash2D(i, 1, 5.5) * SIZE) | 0;
    const gy = (hash2D(i, 2, 8.9) * SIZE) | 0;
    const len = 5 + (i % 7);
    const lean = ((i % 5) - 2) * 1.1;
    gaCtx.strokeStyle =
      i % 4 === 0
        ? 'rgba(77, 112, 63, 0.58)'
        : i % 4 === 1
          ? 'rgba(58, 90, 50, 0.62)'
          : i % 4 === 2
            ? 'rgba(92, 128, 68, 0.42)'
            : 'rgba(42, 66, 36, 0.52)';
    gaCtx.lineWidth = 1.4;
    gaCtx.beginPath();
    gaCtx.moveTo(gx, gy);
    gaCtx.lineTo(gx + lean, gy - len);
    gaCtx.stroke();

    const bv = 135 + (i % 90);
    gbCtx.strokeStyle = `rgb(${bv},${bv},${bv})`;
    gbCtx.lineWidth = 1.4;
    gbCtx.beginPath();
    gbCtx.moveTo(gx, gy);
    gbCtx.lineTo(gx + lean, gy - len);
    gbCtx.stroke();
  }

  const grassMap = setupColorTex(grassAlbCanvas, 6, 12);
  const grassBump = setupDataTex(grassBumpCanvas, 6, 12);
  const grassRoughness = setupDataTex(grassRoughCanvas, 6, 12);

  // ---------------------------------------------------------------------------
  // 4. Charbagh Reflecting Pool Water (512x512 Seamless Procedural Ripple Bump)
  // ---------------------------------------------------------------------------
  const waterAlbCanvas = document.createElement('canvas');
  waterAlbCanvas.width = SIZE;
  waterAlbCanvas.height = SIZE;
  const waCtx = waterAlbCanvas.getContext('2d')!;
  const waImg = waCtx.createImageData(SIZE, SIZE);

  const waterBumpCanvas = document.createElement('canvas');
  waterBumpCanvas.width = SIZE;
  waterBumpCanvas.height = SIZE;
  const wb2Ctx = waterBumpCanvas.getContext('2d')!;
  const wb2Img = wb2Ctx.createImageData(SIZE, SIZE);

  const TAU = Math.PI * 2;
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = (y * SIZE + x) * 4;

      // Multi-directional periodic ripples so UV scrolling is 100% seamless
      const w1 = Math.sin((u * 4 + v * 3) * TAU);
      const w2 = Math.sin((u * -3 + v * 5) * TAU + 1.2);
      const w3 = Math.cos((u * 7 + v * 2) * TAU + 2.4) * 0.55;
      const w4 = Math.sin((u * 2 - v * 8) * TAU + 0.7) * 0.45;
      const ripple = (w1 + w2 + w3 + w4) / 3.0; // [-1..1]

      // Base #1c3d4a = (28, 61, 74)
      const crest = Math.max(0, ripple);
      waImg.data[idx] = Math.round(28 + crest * 22);
      waImg.data[idx + 1] = Math.round(61 + crest * 44);
      waImg.data[idx + 2] = Math.round(74 + crest * 48);
      waImg.data[idx + 3] = 255;

      const bVal = Math.max(0, Math.min(255, Math.round(128 + ripple * 96)));
      wb2Img.data[idx] = bVal;
      wb2Img.data[idx + 1] = bVal;
      wb2Img.data[idx + 2] = bVal;
      wb2Img.data[idx + 3] = 255;
    }
  }
  waCtx.putImageData(waImg, 0, 0);
  wb2Ctx.putImageData(wb2Img, 0, 0);

  const waterMap = setupColorTex(waterAlbCanvas, 2, 12);
  const waterRippleBump = setupDataTex(waterBumpCanvas, 3, 18);

  return {
    marbleMap,
    marbleBump,
    marbleRoughness,
    sandstoneMap,
    sandstoneBump,
    sandstoneRoughness,
    grassMap,
    grassBump,
    grassRoughness,
    waterMap,
    waterRippleBump,
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const pbr = createProceduralPBRTextures(maxAnisotropy);
  const marble = pbr.marbleMap;
  const marbleBump = pbr.marbleBump;
  const marbleRoughness = pbr.marbleRoughness;
  const sandstone = pbr.sandstoneMap;
  const sandstoneBump = pbr.sandstoneBump;
  const sandstoneRoughness = pbr.sandstoneRoughness;

  // 3. Cracked Courtyard Flagstone Pavement (512x512 beveled slabs, mortar joints & mineral grit)
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = 512;
  tileCanvas.height = 512;
  const tCtx = tileCanvas.getContext('2d')!;
  tCtx.fillStyle = '#4e4a44';
  tCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const y = row * 64;
    const offset = (row % 2) * 32;
    for (let col = -1; col < 9; col++) {
      const x = col * 64 + offset;
      const h = hash2D(col + 10, row + 10, 14.3);
      const tone = Math.round(78 + h * 26);
      const warm = Math.round((h - 0.5) * 10);
      tCtx.fillStyle = `rgb(${tone + 8 + warm}, ${tone + 3}, ${tone - 5 - warm})`;
      tCtx.fillRect(x + 2, y + 2, 60, 60);
      // Sunlit top-left bevel highlight & shadow bottom-right bevel
      tCtx.fillStyle = 'rgba(220, 208, 190, 0.14)';
      tCtx.fillRect(x + 2, y + 2, 60, 3);
      tCtx.fillRect(x + 2, y + 2, 3, 60);
      tCtx.fillStyle = 'rgba(18, 16, 14, 0.28)';
      tCtx.fillRect(x + 2, y + 59, 60, 3);
      tCtx.fillRect(x + 59, y + 2, 3, 60);
    }
  }
  // Fine aggregate speckles & weathered dust
  for (let i = 0; i < 1800; i++) {
    const gx = (i * 73 + (i % 9) * 17) % 512;
    const gy = (i * 41 + (i % 13) * 19) % 512;
    tCtx.fillStyle = i % 3 === 0 ? 'rgba(210, 196, 174, 0.12)' : 'rgba(28, 25, 22, 0.16)';
    tCtx.fillRect(gx, gy, 2 + (i % 2), 2);
  }
  tCtx.strokeStyle = 'rgba(22, 20, 18, 0.65)';
  tCtx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    tCtx.beginPath();
    const sx = (i * 89) % 512;
    const sy = (i * 127) % 512;
    tCtx.moveTo(sx, sy);
    tCtx.lineTo(sx + 26, sy + 18);
    tCtx.lineTo(sx + 44, sy + 42);
    tCtx.stroke();
  }
  const courtyardTile = finalizeTexture(tileCanvas, 18, 18, maxAnisotropy);

  // 4. Weathered Sun-Bleached Wood Planks + Wood Grain Bump Map
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wCtx = woodCanvas.getContext('2d')!;
  const wbCanvas = document.createElement('canvas');
  wbCanvas.width = 256;
  wbCanvas.height = 256;
  const wBCtx = wbCanvas.getContext('2d')!;
  wCtx.fillStyle = '#754c2e';
  wCtx.fillRect(0, 0, 256, 256);
  wBCtx.fillStyle = '#808080';
  wBCtx.fillRect(0, 0, 256, 256);
  for (let p = 0; p < 4; p++) {
    const x = p * 64;
    const tone = p % 2 === 0 ? '#744c2e' : p === 1 ? '#865b3a' : '#6c472c';
    wCtx.fillStyle = tone;
    wCtx.fillRect(x + 2, 0, 60, 256);
    wBCtx.fillStyle = '#929292';
    wBCtx.fillRect(x + 2, 0, 60, 256);
    // Plank gap shadow & bump seam
    wCtx.fillStyle = 'rgba(24, 14, 8, 0.72)';
    wCtx.fillRect(x, 0, 2, 256);
    wBCtx.fillStyle = '#242424';
    wBCtx.fillRect(x, 0, 3, 256);
    // Cathedral grain fibers
    for (let g = 0; g < 14; g++) {
      const gx = x + 5 + g * 4;
      wCtx.strokeStyle = g % 3 === 0 ? 'rgba(38, 22, 10, 0.45)' : 'rgba(176, 134, 92, 0.24)';
      wCtx.lineWidth = g % 3 === 0 ? 1.6 : 1.1;
      wBCtx.strokeStyle = g % 3 === 0 ? '#525252' : '#ababab';
      wBCtx.lineWidth = 1.4;
      wCtx.beginPath();
      wBCtx.beginPath();
      wCtx.moveTo(gx, 0);
      wBCtx.moveTo(gx, 0);
      for (let y = 16; y <= 256; y += 16) {
        const wave = Math.sin(y * 0.04 + g + p * 1.7) * 3.2;
        wCtx.lineTo(gx + wave, y);
        wBCtx.lineTo(gx + wave, y);
      }
      wCtx.stroke();
      wBCtx.stroke();
    }
    // Iron nail heads
    wCtx.fillStyle = '#26221e';
    wBCtx.fillStyle = '#383838';
    [16, 238].forEach((ny) => {
      wCtx.beginPath();
      wCtx.arc(x + 12, ny, 2.2, 0, Math.PI * 2);
      wCtx.arc(x + 50, ny, 2.2, 0, Math.PI * 2);
      wCtx.fill();
      wBCtx.beginPath();
      wBCtx.arc(x + 12, ny, 2.5, 0, Math.PI * 2);
      wBCtx.arc(x + 50, ny, 2.5, 0, Math.PI * 2);
      wBCtx.fill();
    });
  }
  const woodPlank = finalizeTexture(woodCanvas, 2, 2, maxAnisotropy);
  const woodBump = finalizeLinearTexture(wbCanvas, 2, 2, maxAnisotropy);

  // 5. Rusted Corrugated Metal + Bump & Oxide Roughness Maps
  const metalCanvas = document.createElement('canvas');
  metalCanvas.width = 256;
  metalCanvas.height = 256;
  const rCtx = metalCanvas.getContext('2d')!;
  const rmBumpCanvas = document.createElement('canvas');
  rmBumpCanvas.width = 256;
  rmBumpCanvas.height = 256;
  const rmBCtx = rmBumpCanvas.getContext('2d')!;
  const rmRoughCanvas = document.createElement('canvas');
  rmRoughCanvas.width = 256;
  rmRoughCanvas.height = 256;
  const rmRCtx = rmRoughCanvas.getContext('2d')!;

  rCtx.fillStyle = '#4f555c';
  rCtx.fillRect(0, 0, 256, 256);
  rmRCtx.fillStyle = '#787878'; // bare steel semi-shiny
  rmRCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x++) {
    const corr = Math.sin((x / 16) * Math.PI * 2);
    const shade = Math.round(128 + corr * 72);
    rmBCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    rmBCtx.fillRect(x, 0, 1, 256);
    if (corr > 0.25) {
      rCtx.fillStyle = `rgba(255,255,255,${(corr - 0.25) * 0.14})`;
      rCtx.fillRect(x, 0, 1, 256);
    } else if (corr < -0.25) {
      rCtx.fillStyle = `rgba(0,0,0,${(-corr - 0.25) * 0.24})`;
      rCtx.fillRect(x, 0, 1, 256);
    }
  }
  // Oxidized rust bloom patches (rough & pitted)
  for (let i = 0; i < 72; i++) {
    const rx = (i * 47) % 256;
    const ry = (i * 89) % 256;
    const rad = 6 + (i % 15);
    rCtx.fillStyle = i % 3 === 0 ? 'rgba(148, 64, 28, 0.42)' : 'rgba(104, 46, 24, 0.34)';
    rCtx.beginPath();
    rCtx.ellipse(rx, ry, rad, rad * 0.7, (i % 4) * 0.5, 0, Math.PI * 2);
    rCtx.fill();

    rmRCtx.fillStyle = 'rgba(235, 235, 235, 0.75)'; // rust is very matte
    rmRCtx.beginPath();
    rmRCtx.ellipse(rx, ry, rad, rad * 0.7, (i % 4) * 0.5, 0, Math.PI * 2);
    rmRCtx.fill();

    rmBCtx.fillStyle = 'rgba(48, 48, 48, 0.35)';
    rmBCtx.beginPath();
    rmBCtx.ellipse(rx, ry, rad * 0.8, rad * 0.55, (i % 4) * 0.5, 0, Math.PI * 2);
    rmBCtx.fill();
  }
  // Horizontal sheet overlap seam & rivets
  rCtx.fillStyle = 'rgba(16, 18, 22, 0.52)';
  rCtx.fillRect(0, 126, 256, 4);
  rmBCtx.fillStyle = '#282828';
  rmBCtx.fillRect(0, 126, 256, 4);
  const rustedMetal = finalizeTexture(metalCanvas, 2, 2, maxAnisotropy);
  const rustedMetalBump = finalizeLinearTexture(rmBumpCanvas, 2, 2, maxAnisotropy);
  const rustedMetalRoughness = finalizeLinearTexture(rmRoughCanvas, 2, 2, maxAnisotropy);

  // 6. Weathered Bazaar Stucco Plaster Wall (512x512 Albedo + Bump + Roughness, Dying Light Golden-Hour Feel)
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512;
  wallCanvas.height = 512;
  const bCtx = wallCanvas.getContext('2d')!;
  const wallBumpCanvas = document.createElement('canvas');
  wallBumpCanvas.width = 512;
  wallBumpCanvas.height = 512;
  const bBCtx = wallBumpCanvas.getContext('2d')!;
  const wallRoughCanvas = document.createElement('canvas');
  wallRoughCanvas.width = 512;
  wallRoughCanvas.height = 512;
  const bRCtx = wallRoughCanvas.getContext('2d')!;

  const wallAlbImg = bCtx.createImageData(512, 512);
  const wallBumpImg = bBCtx.createImageData(512, 512);
  const wallRoughImg = bRCtx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    const v = y / 512;
    const damp = Math.pow(Math.max(0, (v - 0.72) / 0.28), 1.6);
    for (let x = 0; x < 512; x++) {
      const u = x / 512;
      const idx = (y * 512 + x) * 4;
      const stucco = fbmTileable(u, v, 6, 3, 19.7);
      const fine = (hash2D(x, y, 42.1) - 0.5) * 16;
      const streak = fbmTileable(u * 4, v * 0.5, 4, 2, 7.3);
      const grime = damp * (0.45 + streak * 0.55);

      const baseR = 204 + (stucco - 0.5) * 34 + fine - grime * 74;
      const baseG = 178 + (stucco - 0.5) * 30 + fine - grime * 66;
      const baseB = 142 + (stucco - 0.5) * 26 + fine - grime * 52;

      wallAlbImg.data[idx] = Math.max(0, Math.min(255, Math.round(baseR)));
      wallAlbImg.data[idx + 1] = Math.max(0, Math.min(255, Math.round(baseG)));
      wallAlbImg.data[idx + 2] = Math.max(0, Math.min(255, Math.round(baseB)));
      wallAlbImg.data[idx + 3] = 255;

      const bVal = Math.max(20, Math.min(240, Math.round(134 + (stucco - 0.5) * 56 + fine * 1.3)));
      wallBumpImg.data[idx] = bVal;
      wallBumpImg.data[idx + 1] = bVal;
      wallBumpImg.data[idx + 2] = bVal;
      wallBumpImg.data[idx + 3] = 255;

      const rVal = Math.max(170, Math.min(255, Math.round(224 + (stucco - 0.5) * 30 - grime * 28)));
      wallRoughImg.data[idx] = rVal;
      wallRoughImg.data[idx + 1] = rVal;
      wallRoughImg.data[idx + 2] = rVal;
      wallRoughImg.data[idx + 3] = 255;
    }
  }
  bCtx.putImageData(wallAlbImg, 0, 0);
  bBCtx.putImageData(wallBumpImg, 0, 0);
  bRCtx.putImageData(wallRoughImg, 0, 0);

  // Peeling plaster patches revealing weathered underlying brick masonry
  for (let p = 0; p < 5; p++) {
    const px = 56 + ((p * 113) % 380);
    const py = 72 + ((p * 149) % 340);
    const pw = 54 + (p % 3) * 18;
    const ph = 36 + (p % 2) * 14;
    bCtx.fillStyle = '#8b523b';
    bCtx.fillRect(px, py, pw, ph);
    bCtx.strokeStyle = 'rgba(240, 224, 198, 0.6)';
    bCtx.lineWidth = 2.5;
    bCtx.strokeRect(px, py, pw, ph);
    bBCtx.fillStyle = '#565656';
    bBCtx.fillRect(px, py, pw, ph);
    bBCtx.strokeStyle = '#bcbcbc';
    bBCtx.lineWidth = 3;
    bBCtx.strokeRect(px, py, pw, ph);
    bCtx.strokeStyle = 'rgba(54, 34, 24, 0.55)';
    bCtx.lineWidth = 1.5;
    for (let by = py + 10; by < py + ph; by += 10) {
      bCtx.beginPath();
      bCtx.moveTo(px, by);
      bCtx.lineTo(px + pw, by);
      bCtx.stroke();
    }
  }
  // Hairline stucco cracks
  bCtx.strokeStyle = 'rgba(62, 46, 34, 0.48)';
  bCtx.lineWidth = 1.5;
  bBCtx.strokeStyle = '#2e2e2e';
  bBCtx.lineWidth = 2;
  for (let c = 0; c < 9; c++) {
    let cx = (c * 83 + 29) % 512;
    let cy = (c * 67 + 19) % 512;
    bCtx.beginPath();
    bBCtx.beginPath();
    bCtx.moveTo(cx, cy);
    bBCtx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += Math.sin(c * 1.9 + s * 2.1) * 18;
      cy += 16 + (s % 2) * 8;
      bCtx.lineTo(cx, cy);
      bBCtx.lineTo(cx, cy);
    }
    bCtx.stroke();
    bBCtx.stroke();
  }
  const bazaarWall = finalizeTexture(wallCanvas, 2, 2, maxAnisotropy);
  const bazaarWallBump = finalizeLinearTexture(wallBumpCanvas, 2, 2, maxAnisotropy);
  const bazaarWallRoughness = finalizeLinearTexture(wallRoughCanvas, 2, 2, maxAnisotropy);

  // 7. Reflecting Pool Water Albedo & Procedural Ripple Bump (512x512)
  const poolWater = pbr.waterMap;
  const waterRippleBump = pbr.waterRippleBump;

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

  // 14. Night Hunter Exposed Flayed Pale Fascia & Striated Crimson Muscle + Iridescent Chitin Carapace
  const nhCanvas = document.createElement('canvas');
  nhCanvas.width = 512;
  nhCanvas.height = 512;
  const nhCtx = nhCanvas.getContext('2d')!;
  nhCtx.fillStyle = '#6c2428';
  nhCtx.fillRect(0, 0, 512, 512);
  // Mottled pale-grey flayed skin/fascia patches over crimson sinew
  for (let i = 0; i < 42; i++) {
    nhCtx.fillStyle =
      i % 3 === 0
        ? 'rgba(196, 178, 170, 0.36)'
        : i % 3 === 1
          ? 'rgba(42, 12, 16, 0.56)'
          : 'rgba(156, 34, 38, 0.52)';
    nhCtx.beginPath();
    nhCtx.ellipse((i * 83) % 512, (i * 119) % 512, 34 + (i % 20), 16 + (i % 12), (i % 5) * 0.4, 0, Math.PI * 2);
    nhCtx.fill();
  }
  // Striated muscle fibers & glistening tendon cords
  for (let i = 0; i < 84; i++) {
    nhCtx.strokeStyle =
      i % 4 === 0
        ? 'rgba(226, 212, 204, 0.45)'
        : i % 2 === 0
          ? 'rgba(168, 28, 36, 0.72)'
          : 'rgba(92, 14, 18, 0.64)';
    nhCtx.lineWidth = i % 4 === 0 ? 2.2 : 3.8;
    nhCtx.beginPath();
    const y0 = (i * 13) % 512;
    nhCtx.moveTo(0, y0);
    nhCtx.bezierCurveTo(170, y0 + Math.sin(i) * 28, 340, y0 - Math.cos(i) * 28, 512, (y0 + 36) % 512);
    nhCtx.stroke();
  }
  // Dark arterial veins
  nhCtx.strokeStyle = 'rgba(26, 12, 22, 0.6)';
  nhCtx.lineWidth = 1.6;
  for (let v = 0; v < 22; v++) {
    let vx = (v * 67) % 512;
    let vy = (v * 97) % 512;
    nhCtx.beginPath();
    nhCtx.moveTo(vx, vy);
    for (let s = 0; s < 6; s++) {
      vx += Math.sin(v * 1.4 + s * 1.8) * 24;
      vy += 22;
      nhCtx.lineTo(vx, vy);
    }
    nhCtx.stroke();
  }
  const nightHunterMuscle = finalizeTexture(nhCanvas, 2, 2, maxAnisotropy);

  // 14B. Night Hunter Iridescent Dark Slate-Blue / Charcoal Armored Chitin Carapace (Albedo + Bump + Roughness)
  const ncCanvas = document.createElement('canvas');
  ncCanvas.width = 512;
  ncCanvas.height = 512;
  const ncCtx = ncCanvas.getContext('2d')!;
  const ncBumpCanvas = document.createElement('canvas');
  ncBumpCanvas.width = 512;
  ncBumpCanvas.height = 512;
  const ncBCtx = ncBumpCanvas.getContext('2d')!;
  const ncRoughCanvas = document.createElement('canvas');
  ncRoughCanvas.width = 512;
  ncRoughCanvas.height = 512;
  const ncRCtx = ncRoughCanvas.getContext('2d')!;

  const ncAlbImg = ncCtx.createImageData(512, 512);
  const ncBmpImg = ncBCtx.createImageData(512, 512);
  const ncRghImg = ncRCtx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    const v = y / 512;
    for (let x = 0; x < 512; x++) {
      const u = x / 512;
      const idx = (y * 512 + x) * 4;
      const f1 = fbmTileable(u, v, 5, 4, 31.4);
      const f2 = fbmTileable(u * 2, v, 10, 3, 64.9);
      const ridgeWave = Math.sin((u * 6 + v * 3 + f1 * 2.4) * Math.PI * 2);
      const ridge = Math.pow(Math.max(0, ridgeWave), 2.2);
      const irid = Math.max(0, Math.sin((u * 3 - v * 2 + f2 * 3.0) * Math.PI * 2));

      // Deep slate-charcoal #1a2230 with cool blue-teal chitin ridge highlights & subtle crimson battle grime
      const r = Math.round(28 + ridge * 28 + f2 * 16 + (1 - f1) * 14);
      const g = Math.round(38 + ridge * 42 + irid * 22 + f2 * 14);
      const b = Math.round(54 + ridge * 64 + irid * 34 + f2 * 18);

      ncAlbImg.data[idx] = Math.min(255, r);
      ncAlbImg.data[idx + 1] = Math.min(255, g);
      ncAlbImg.data[idx + 2] = Math.min(255, b);
      ncAlbImg.data[idx + 3] = 255;

      const bVal = Math.max(20, Math.min(245, Math.round(96 + ridge * 110 + (f2 - 0.5) * 48)));
      ncBmpImg.data[idx] = bVal;
      ncBmpImg.data[idx + 1] = bVal;
      ncBmpImg.data[idx + 2] = bVal;
      ncBmpImg.data[idx + 3] = 255;

      // Polished wet chitin crests (~0.30) vs matte armored seams (~0.72)
      const rVal = Math.max(60, Math.min(230, Math.round(182 - ridge * 92 - irid * 24)));
      ncRghImg.data[idx] = rVal;
      ncRghImg.data[idx + 1] = rVal;
      ncRghImg.data[idx + 2] = rVal;
      ncRghImg.data[idx + 3] = 255;
    }
  }
  ncCtx.putImageData(ncAlbImg, 0, 0);
  ncBCtx.putImageData(ncBmpImg, 0, 0);
  ncRCtx.putImageData(ncRghImg, 0, 0);

  // Battle scars & crimson gore streaks across chitin plates
  for (let s = 0; s < 18; s++) {
    const sx = (s * 79 + 23) % 512;
    const sy = (s * 113 + 17) % 512;
    ncCtx.strokeStyle = s % 3 === 0 ? 'rgba(130, 18, 24, 0.55)' : 'rgba(148, 178, 210, 0.34)';
    ncCtx.lineWidth = s % 3 === 0 ? 3 : 1.6;
    ncCtx.beginPath();
    ncCtx.moveTo(sx, sy);
    ncCtx.lineTo(sx + 38, sy + (s % 2 === 0 ? 18 : -16));
    ncCtx.stroke();

    ncBCtx.strokeStyle = '#303030';
    ncBCtx.lineWidth = 2.5;
    ncBCtx.beginPath();
    ncBCtx.moveTo(sx, sy);
    ncBCtx.lineTo(sx + 38, sy + (s % 2 === 0 ? 18 : -16));
    ncBCtx.stroke();
  }
  const nightHunterCarapace = finalizeTexture(ncCanvas, 2, 2, maxAnisotropy);
  const nightHunterCarapaceBump = finalizeLinearTexture(ncBumpCanvas, 2, 2, maxAnisotropy);
  const nightHunterCarapaceRoughness = finalizeLinearTexture(ncRoughCanvas, 2, 2, maxAnisotropy);

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

  // 17. Charbagh Lush Overgrown Garden Lawn Turf + Micro-Bump (512x512)
  const charbaghGrass = pbr.grassMap;
  const grassBump = pbr.grassBump;
  const grassRoughness = pbr.grassRoughness;

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

  // 19. Necrotic Zombie Skin + Bump + Wet Blood Roughness (512x512 crisp lesions & veins)
  const zsCanvas = document.createElement('canvas');
  zsCanvas.width = 512;
  zsCanvas.height = 512;
  const zsCtx = zsCanvas.getContext('2d')!;
  const zbCanvas = document.createElement('canvas');
  zbCanvas.width = 512;
  zbCanvas.height = 512;
  const zbCtx = zbCanvas.getContext('2d')!;
  const zrCanvas = document.createElement('canvas');
  zrCanvas.width = 512;
  zrCanvas.height = 512;
  const zrCtx = zrCanvas.getContext('2d')!;

  zsCtx.fillStyle = '#7e8c74';
  zsCtx.fillRect(0, 0, 512, 512);
  zbCtx.fillStyle = '#808080';
  zbCtx.fillRect(0, 0, 512, 512);
  zrCtx.fillStyle = '#d4d4d4'; // Dry matte necrotic skin
  zrCtx.fillRect(0, 0, 512, 512);

  // Bruised necrotic mottling & livor mortis patches
  for (let i = 0; i < 84; i++) {
    const mx = (i * 83) % 512;
    const my = (i * 127) % 512;
    const rx = 28 + (i % 22);
    const ry = 16 + (i % 14);
    zsCtx.fillStyle =
      i % 3 === 0
        ? 'rgba(54, 42, 62, 0.34)'
        : i % 2 === 0
          ? 'rgba(84, 96, 66, 0.38)'
          : 'rgba(156, 166, 140, 0.28)';
    zsCtx.beginPath();
    zsCtx.ellipse(mx, my, rx, ry, (i % 5) * 0.4, 0, Math.PI * 2);
    zsCtx.fill();
  }
  // Skin pores & necrotic pitting in bump map
  for (let i = 0; i < 900; i++) {
    const shade = 95 + ((i * 29) % 72);
    zbCtx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    zbCtx.fillRect((i * 67) % 512, (i * 113) % 512, 4, 4);
  }
  // Dark branching necrotic veins (raised slightly in bump)
  zsCtx.strokeStyle = 'rgba(26, 32, 38, 0.56)';
  zsCtx.lineWidth = 2.0;
  zbCtx.strokeStyle = 'rgba(195, 195, 195, 0.65)';
  zbCtx.lineWidth = 2.4;
  for (let v = 0; v < 28; v++) {
    let vx = (v * 59) % 512;
    let vy = (v * 97) % 512;
    zsCtx.beginPath();
    zbCtx.beginPath();
    zsCtx.moveTo(vx, vy);
    zbCtx.moveTo(vx, vy);
    for (let s = 0; s < 6; s++) {
      vx += Math.sin(v + s * 1.3) * 22;
      vy += 20;
      zsCtx.lineTo(vx, vy);
      zbCtx.lineTo(vx, vy);
    }
    zsCtx.stroke();
    zbCtx.stroke();
  }
  // Open lacerations & wet crimson blood splatters (glossy dark in roughnessMap!)
  for (let b = 0; b < 36; b++) {
    const bx = (b * 103 + 29) % 512;
    const by = (b * 79 + 17) % 512;
    const rx = 14 + (b % 16);
    const ry = 8 + (b % 10);
    const rot = (b % 5) * 0.45;
    zsCtx.fillStyle = b % 2 === 0 ? 'rgba(136, 14, 18, 0.72)' : 'rgba(72, 10, 12, 0.66)';
    zsCtx.beginPath();
    zsCtx.ellipse(bx, by, rx, ry, rot, 0, Math.PI * 2);
    zsCtx.fill();

    // Wet blood patches shine under golden-hour & flashlight specular!
    zrCtx.fillStyle = b % 2 === 0 ? 'rgba(42, 42, 42, 0.9)' : 'rgba(68, 68, 68, 0.85)';
    zrCtx.beginPath();
    zrCtx.ellipse(bx, by, rx, ry, rot, 0, Math.PI * 2);
    zrCtx.fill();

    // Recessed wound groove in bump
    zbCtx.fillStyle = 'rgba(42, 42, 42, 0.65)';
    zbCtx.beginPath();
    zbCtx.ellipse(bx, by, rx * 0.7, ry * 0.55, rot, 0, Math.PI * 2);
    zbCtx.fill();
  }
  const zombieSkin = finalizeTexture(zsCanvas, 1, 1, maxAnisotropy);
  const zombieSkinBump = finalizeLinearTexture(zbCanvas, 1, 1, maxAnisotropy);
  const zombieSkinRoughness = finalizeLinearTexture(zrCanvas, 1, 1, maxAnisotropy);

  // 21. Ragged Grimy Clothing Fabric Texture
  const zcCanvas = document.createElement('canvas');
  zcCanvas.width = 256;
  zcCanvas.height = 256;
  const zcCtx = zcCanvas.getContext('2d')!;
  zcCtx.fillStyle = '#c8c4bc';
  zcCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    zcCtx.fillStyle = y % 8 === 0 ? 'rgba(54, 50, 44, 0.2)' : 'rgba(255, 255, 255, 0.12)';
    zcCtx.fillRect(0, y, 256, 2);
  }
  for (let x = 0; x < 256; x += 4) {
    zcCtx.fillStyle = x % 8 === 0 ? 'rgba(46, 42, 36, 0.18)' : 'rgba(240, 236, 228, 0.1)';
    zcCtx.fillRect(x, 0, 2, 256);
  }
  for (let i = 0; i < 42; i++) {
    zcCtx.fillStyle = i % 3 === 0 ? 'rgba(112, 16, 18, 0.52)' : 'rgba(48, 40, 32, 0.38)';
    zcCtx.beginPath();
    zcCtx.ellipse((i * 57) % 256, (i * 89) % 256, 16, 10, 0.4, 0, Math.PI * 2);
    zcCtx.fill();
  }
  const zombieCloth = finalizeTexture(zcCanvas, 1, 1, maxAnisotropy);

  // 22. Infected Dog Sleek Charred-Sable Doberman Coat + Flayed Muscle Lesions + Bump + Wet Gore Roughness (512x512)
  const dfCanvas = document.createElement('canvas');
  dfCanvas.width = 512;
  dfCanvas.height = 512;
  const dfCtx = dfCanvas.getContext('2d')!;
  const dbCanvas = document.createElement('canvas');
  dbCanvas.width = 512;
  dbCanvas.height = 512;
  const dbCtx = dbCanvas.getContext('2d')!;
  const drCanvas = document.createElement('canvas');
  drCanvas.width = 512;
  drCanvas.height = 512;
  const drCtx = drCanvas.getContext('2d')!;

  dfCtx.fillStyle = '#201916';
  dfCtx.fillRect(0, 0, 512, 512);
  dbCtx.fillStyle = '#7c7c7c';
  dbCtx.fillRect(0, 0, 512, 512);
  drCtx.fillStyle = '#bcbcbc'; // Sleek short fur coat
  drCtx.fillRect(0, 0, 512, 512);

  // Subtle dark charcoal & mahogany Doberman coat fur strokes
  for (let i = 0; i < 1400; i++) {
    const fx = (i * 53) % 512;
    const fy = (i * 97) % 512;
    dfCtx.strokeStyle =
      i % 4 === 0
        ? 'rgba(14, 11, 10, 0.78)'
        : i % 4 === 1
          ? 'rgba(72, 48, 34, 0.36)'
          : 'rgba(34, 26, 22, 0.62)';
    dfCtx.lineWidth = 1.6;
    dfCtx.beginPath();
    dfCtx.moveTo(fx, fy);
    dfCtx.lineTo(fx + ((i % 5) - 2) * 1.8, fy + 12 + (i % 7));
    dfCtx.stroke();

    const bv = 92 + ((i * 31) % 116);
    dbCtx.strokeStyle = `rgb(${bv}, ${bv}, ${bv})`;
    dbCtx.lineWidth = 1.6;
    dbCtx.beginPath();
    dbCtx.moveTo(fx, fy);
    dbCtx.lineTo(fx + ((i % 3) - 1) * 1.8, fy + 11);
    dbCtx.stroke();
  }
  // Raw flayed crimson muscle tears with pale fascia streaks & wet specular roughness
  for (let w = 0; w < 28; w++) {
    const wx = (w * 97 + 23) % 512;
    const wy = (w * 131 + 19) % 512;
    const rx = 20 + (w % 18);
    const ry = 12 + (w % 10);
    const rot = (w % 4) * 0.5;
    dfCtx.fillStyle = w % 2 === 0 ? 'rgba(138, 18, 22, 0.85)' : 'rgba(84, 12, 16, 0.78)';
    dfCtx.beginPath();
    dfCtx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
    dfCtx.fill();

    // Striated muscle fibers inside wound
    dfCtx.strokeStyle = 'rgba(210, 110, 104, 0.5)';
    dfCtx.lineWidth = 1.4;
    dfCtx.beginPath();
    dfCtx.moveTo(wx - rx * 0.6, wy);
    dfCtx.lineTo(wx + rx * 0.6, wy + 2);
    dfCtx.stroke();

    // Glossy wet flesh in roughness map
    drCtx.fillStyle = 'rgba(48, 48, 48, 0.9)';
    drCtx.beginPath();
    drCtx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
    drCtx.fill();

    // Torn hide rim in bump map
    dbCtx.strokeStyle = '#dcdcdc';
    dbCtx.lineWidth = 2.4;
    dbCtx.beginPath();
    dbCtx.ellipse(wx, wy, rx, ry, rot, 0, Math.PI * 2);
    dbCtx.stroke();
  }
  const dogFurRot = finalizeTexture(dfCanvas, 1, 1, maxAnisotropy);
  const dogFurBump = finalizeLinearTexture(dbCanvas, 1, 1, maxAnisotropy);
  const dogFurRoughness = finalizeLinearTexture(drCanvas, 1, 1, maxAnisotropy);

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
    marbleBump,
    marbleRoughness,
    sandstoneBump,
    sandstoneRoughness,
    grassBump,
    grassRoughness,
    waterRippleBump,
    zombieSkinRoughness,
    dogFurRoughness,
    nightHunterCarapace,
    nightHunterCarapaceBump,
    nightHunterCarapaceRoughness,
    bazaarWallBump,
    bazaarWallRoughness,
    woodBump,
    rustedMetalBump,
    rustedMetalRoughness,
    dispose: () => {
      marble.dispose();
      marbleBump.dispose();
      marbleRoughness.dispose();
      sandstone.dispose();
      sandstoneBump.dispose();
      sandstoneRoughness.dispose();
      courtyardTile.dispose();
      woodPlank.dispose();
      woodBump.dispose();
      rustedMetal.dispose();
      rustedMetalBump.dispose();
      rustedMetalRoughness.dispose();
      bazaarWall.dispose();
      bazaarWallBump.dispose();
      bazaarWallRoughness.dispose();
      poolWater.dispose();
      waterRippleBump.dispose();
      contactShadow.dispose();
      chainLink.dispose();
      blueTarp.dispose();
      jaliLattice.dispose();
      domeRibs.dispose();
      tealWindow.dispose();
      nightHunterMuscle.dispose();
      nightHunterCarapace.dispose();
      nightHunterCarapaceBump.dispose();
      nightHunterCarapaceRoughness.dispose();
      diamondPlate.dispose();
      skinDetail.dispose();
      wristWrapTape.dispose();
      tacticalGlove.dispose();
      charbaghGrass.dispose();
      grassBump.dispose();
      grassRoughness.dispose();
      baseballBatWood.dispose();
      batGripTape.dispose();
      zombieSkin.dispose();
      zombieSkinBump.dispose();
      zombieSkinRoughness.dispose();
      zombieCloth.dispose();
      dogFurRot.dispose();
      dogFurBump.dispose();
      dogFurRoughness.dispose();
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
