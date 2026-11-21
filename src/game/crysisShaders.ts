import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { ProceduralTextureSet } from './textures';

export interface CrysisShaderUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
  uWindDir: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
  uSkyZenith: { value: THREE.Color };
  uFoliageLodStart: { value: number };
  uFoliageLodEnd: { value: number };
  uPomMaxDist: { value: number };
  uWetness: { value: number };
}

export function createCrysisShaderUniforms(isSoftwareGl: boolean): CrysisShaderUniforms {
  return {
    uTime: { value: 0 },
    uWindStrength: { value: 0.78 },
    uWindDir: { value: new THREE.Vector3(0.82, 0.0, -0.57).normalize() },
    uSunDir: { value: new THREE.Vector3(0.24, 0.41, -0.88).normalize() },
    uSunColor: { value: new THREE.Color('#ffd28e') },
    uSkyHorizon: { value: new THREE.Color('#ff8c42') },
    uSkyZenith: { value: new THREE.Color('#1e2749') },
    uFoliageLodStart: { value: 28.0 },
    uFoliageLodEnd: { value: 38.0 },
    uPomMaxDist: { value: isSoftwareGl ? 0.0 : 12.0 },
    uWetness: { value: 0.38 },
  };
}

export interface SunScreenProjection {
  screenX: number;
  screenY: number;
  visibility: number;
}

const _camFwd = new THREE.Vector3();
const _sunWorld = new THREE.Vector3();
const _sunProj = new THREE.Vector3();

/**
 * Pure, testable projection of world-space sun direction into [0..1] screen UV
 * coordinates plus directional visibility attenuation when facing away from sun.
 */
export function computeSunScreenProjection(
  camera: THREE.Camera,
  sunDir: THREE.Vector3,
  sunIntensity: number,
): SunScreenProjection {
  camera.getWorldDirection(_camFwd);
  const fwdDot = _camFwd.dot(sunDir);

  // Smooth fade when sun moves behind camera hemisphere
  const rawVis = Math.max(0, Math.min(1, (fwdDot + 0.15) / 0.5));
  const smoothVis = rawVis * rawVis * (3 - 2 * rawVis) * Math.max(0, Math.min(1, sunIntensity));

  _sunWorld.copy(camera.position).addScaledVector(sunDir, 500);
  _sunProj.copy(_sunWorld).project(camera);

  const screenX = _sunProj.x * 0.5 + 0.5;
  const screenY = _sunProj.y * 0.5 + 0.5;

  // Fade softly if sun projects far outside viewport bounds
  const edgeDist = Math.max(Math.abs(screenX - 0.5), Math.abs(screenY - 0.5));
  const edgeFade = 1.0 - Math.max(0, Math.min(1, (edgeDist - 0.55) / 0.65));

  return {
    screenX,
    screenY,
    visibility: smoothVis * edgeFade,
  };
}

export interface ScaledResolution {
  width: number;
  height: number;
  pixelCount: number;
}

/**
 * Computes exact integer internal render resolution for the HD 4600 scaling matrix.
 */
export function computeScaledResolution(
  displayWidth: number,
  displayHeight: number,
  scale: number,
): ScaledResolution {
  const clampedScale = Math.max(0.5, Math.min(1.0, scale));
  const width = Math.max(320, Math.round(displayWidth * clampedScale));
  const height = Math.max(180, Math.round(displayHeight * clampedScale));
  return {
    width,
    height,
    pixelCount: width * height,
  };
}

export interface CrysisFoliageOptions {
  bendBaseY?: number;
  bendHeight: number;
  windScale: number;
  sssScale: number;
  ditherCull: boolean;
  isInstanced?: boolean;
}

/**
 * Patches a Three.js MeshStandardMaterial with Crysis-style vertex wind
 * harmonics, two-sided chlorophyll subsurface scattering, and optional 4x4
 * ordered Bayer dithered LOD culling (30-38m) to protect HD 4600 ROP fill-rate.
 */
export function applyCrysisFoliageShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CrysisShaderUniforms,
  options: CrysisFoliageOptions,
): void {
  const bendBaseY = options.bendBaseY ?? 0.0;
  const keyTag = `crysis_foliage_${options.ditherCull ? 1 : 0}_${options.isInstanced ? 1 : 0}_${bendBaseY.toFixed(1)}_${options.bendHeight.toFixed(1)}`;
  material.customProgramCacheKey = () => keyTag;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uWindDir = uniforms.uWindDir;
    shader.uniforms.uSunDir = uniforms.uSunDir;
    shader.uniforms.uSunColor = uniforms.uSunColor;
    shader.uniforms.uFoliageLodStart = uniforms.uFoliageLodStart;
    shader.uniforms.uFoliageLodEnd = uniforms.uFoliageLodEnd;

    shader.vertexShader =
      `
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec3 uWindDir;
      varying vec3 vCrysisWorldPos;
      varying float vCrysisCamDist;
      varying float vCrysisTipWeight;
      vec4 crysisSmoothCurve(vec4 x) { return x * x * (3.0 - 2.0 * x); }
      vec4 crysisTriangleWave(vec4 x) {
        vec4 t = abs(fract(x + 0.5) * 2.0 - 1.0);
        return crysisSmoothCurve(t) * 2.0 - 1.0;
      }
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 crysisBaseWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        crysisBaseWorld = instanceMatrix * crysisBaseWorld;
        vec3 crysisInstOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 crysisInstOrigin = vec3(0.0);
      #endif
      crysisBaseWorld = modelMatrix * crysisBaseWorld;

      float crysisTipW = clamp((position.y - ${bendBaseY.toFixed(3)}) / ${options.bendHeight.toFixed(3)}, 0.0, 1.0);
      vCrysisTipWeight = crysisTipW;
      float crysisObjPhase = dot(crysisInstOrigin.xz, vec2(0.37, 0.71));
      float crysisVtxPhase = dot(crysisBaseWorld.xyz, vec3(0.45, 0.25, 0.45)) + crysisObjPhase;

      vec4 crysisWavesIn = uTime * vec4(1.975, 0.793, 0.375, 0.193) + vec4(crysisVtxPhase, crysisObjPhase, crysisObjPhase * 0.7, 0.0);
      vec4 crysisWaves = crysisTriangleWave(crysisWavesIn);

      float crysisBendSq = crysisTipW * crysisTipW;
      float crysisMacro = (crysisWaves.z * 0.65 + crysisWaves.w * 0.35 + 0.28) * crysisBendSq * ${(0.18 * options.windScale).toFixed(4)} * uWindStrength;
      float crysisFlutter = (crysisWaves.x + crysisWaves.y * 0.5) * crysisTipW * ${(0.045 * options.windScale).toFixed(4)} * uWindStrength;

      vec2 crysisOrthoWind = vec2(-uWindDir.z, uWindDir.x);
      vec3 crysisDisp = vec3(0.0);
      crysisDisp.xz = uWindDir.xz * crysisMacro + crysisOrthoWind * (crysisWaves.y * crysisBendSq * ${(0.07 * options.windScale).toFixed(4)} * uWindStrength);
      crysisDisp += objectNormal * crysisFlutter;
      crysisDisp.y -= dot(crysisDisp.xz, crysisDisp.xz) * 0.32;

      transformed += crysisDisp;
      vec4 crysisFinalWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        crysisFinalWorld = instanceMatrix * crysisFinalWorld;
      #endif
      crysisFinalWorld = modelMatrix * crysisFinalWorld;
      vCrysisWorldPos = crysisFinalWorld.xyz;
      vCrysisCamDist = distance(crysisFinalWorld.xyz, cameraPosition);
      `,
    );

    shader.fragmentShader =
      `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uFoliageLodStart;
      uniform float uFoliageLodEnd;
      varying vec3 vCrysisWorldPos;
      varying float vCrysisCamDist;
      varying float vCrysisTipWeight;
      float crysisBayer4x4(vec2 p) {
        int x = int(mod(p.x, 4.0));
        int y = int(mod(p.y, 4.0));
        int idx = y * 4 + x;
        if (idx == 0) return 0.0625; if (idx == 1) return 0.5625; if (idx == 2) return 0.1875; if (idx == 3) return 0.6875;
        if (idx == 4) return 0.8125; if (idx == 5) return 0.3125; if (idx == 6) return 0.9375; if (idx == 7) return 0.4375;
        if (idx == 8) return 0.2500; if (idx == 9) return 0.7500; if (idx == 10) return 0.1250; if (idx == 11) return 0.6250;
        if (idx == 12) return 1.0000; if (idx == 13) return 0.5000; if (idx == 14) return 0.8750;
        return 0.3750;
      }
      ` + shader.fragmentShader;

    if (options.ditherCull) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `
        #include <clipping_planes_fragment>
        float crysisLodFade = 1.0 - clamp((vCrysisCamDist - uFoliageLodStart) / max(0.001, uFoliageLodEnd - uFoliageLodStart), 0.0, 1.0);
        if (crysisLodFade < 0.999 && crysisLodFade < crysisBayer4x4(gl_FragCoord.xy)) {
          discard;
        }
        `,
      );
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      // Crysis Two-Sided Chlorophyll Subsurface Backlighting (linear space before ACES)
      vec3 crysisViewDir = normalize(cameraPosition - vCrysisWorldPos);
      float crysisBackDot = clamp(dot(crysisViewDir, -normalize(uSunDir)), 0.0, 1.0);
      float crysisSss = pow(crysisBackDot, 3.0) * (0.35 + 0.65 * vCrysisTipWeight) * ${options.sssScale.toFixed(3)};
      outgoingLight += diffuseColor.rgb * vec3(1.18, 1.35, 0.45) * uSunColor * crysisSss * 0.42;
      // Subtle grounded root AO without extra texture sample
      outgoingLight *= mix(0.76, 1.0, vCrysisTipWeight);
      #include <opaque_fragment>
      `,
    );
  };
}

export interface CrysisWetPomOptions {
  porosity: number;
  pomHeightScale: number;
  wetnessBias: number;
}

/**
 * Patches primary terrain/masonry MeshStandardMaterials with low-cost distance-gated
 * Steep POM (6 linear + 2 binary steps, strictly disabled past uPomMaxDist) and
 * dynamic humid crevice wetness darkening + glossy Fresnel sheen.
 */
export function applyCrysisWetPomShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CrysisShaderUniforms,
  options: CrysisWetPomOptions,
): void {
  const keyTag = `crysis_wetpom_${options.porosity.toFixed(2)}_${options.pomHeightScale.toFixed(3)}`;
  material.customProgramCacheKey = () => keyTag;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPomMaxDist = uniforms.uPomMaxDist;
    shader.uniforms.uWetness = uniforms.uWetness;
    shader.uniforms.uSkyHorizon = uniforms.uSkyHorizon;

    shader.vertexShader =
      `
      varying vec3 vCrysisSurfaceWorldPos;
      varying vec3 vCrysisSurfaceWorldNormal;
      varying float vCrysisSurfaceCamDist;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vec4 crysisSurfWp = vec4(transformed, 1.0);
      vec3 crysisSurfWn = objectNormal;
      #ifdef USE_INSTANCING
        crysisSurfWp = instanceMatrix * crysisSurfWp;
        crysisSurfWn = mat3(instanceMatrix) * crysisSurfWn;
      #endif
      crysisSurfWp = modelMatrix * crysisSurfWp;
      vCrysisSurfaceWorldPos = crysisSurfWp.xyz;
      vCrysisSurfaceWorldNormal = normalize(mat3(modelMatrix) * crysisSurfWn);
      vCrysisSurfaceCamDist = distance(crysisSurfWp.xyz, cameraPosition);
      `,
    );

    shader.fragmentShader =
      `
      uniform float uPomMaxDist;
      uniform float uWetness;
      uniform vec3 uSkyHorizon;
      varying vec3 vCrysisSurfaceWorldPos;
      varying vec3 vCrysisSurfaceWorldNormal;
      varying float vCrysisSurfaceCamDist;
      ` + shader.fragmentShader;

    // Apply low-cost POM UV displacement + crevice height sampling when bumpMap is present
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      float crysisCreviceHeight = 0.65;
      #ifdef USE_BUMPMAP
        vec2 crysisPomUv = vBumpMapUv;
        float crysisPomFade = 1.0 - smoothstep(max(0.0, uPomMaxDist - 3.5), max(0.01, uPomMaxDist), vCrysisSurfaceCamDist);
        if (uPomMaxDist > 0.5 && crysisPomFade > 0.02) {
          vec3 crysisViewW = normalize(cameraPosition - vCrysisSurfaceWorldPos);
          // Screen-space derivatives outside branch-heavy steps
          vec2 crysisDx = dFdx(crysisPomUv);
          vec2 crysisDy = dFdy(crysisPomUv);
          vec2 crysisShiftDir = normalize(crysisViewW.xz + vec2(1e-4));
          vec2 crysisMaxOff = crysisShiftDir * (${options.pomHeightScale.toFixed(4)} * crysisPomFade);
          vec2 crysisStepUv = crysisMaxOff * (1.0 / 6.0);
          float crysisLayer = 0.0;
          float crysisSampleDepth = 1.0 - texture2D(bumpMap, crysisPomUv).x;
          for (int i = 0; i < 6; ++i) {
            if (crysisLayer >= crysisSampleDepth) break;
            crysisPomUv -= crysisStepUv;
            crysisLayer += (1.0 / 6.0);
            crysisSampleDepth = 1.0 - textureGrad(bumpMap, crysisPomUv, crysisDx, crysisDy).x;
          }
          // 2 binary refinement steps
          vec2 crysisHalfStep = crysisStepUv * 0.5;
          float crysisHalfLayer = (1.0 / 12.0);
          crysisPomUv += crysisHalfStep;
          crysisLayer -= crysisHalfLayer;
          for (int b = 0; b < 2; ++b) {
            crysisHalfStep *= 0.5;
            crysisHalfLayer *= 0.5;
            crysisSampleDepth = 1.0 - textureGrad(bumpMap, crysisPomUv, crysisDx, crysisDy).x;
            if (crysisLayer < crysisSampleDepth) {
              crysisPomUv -= crysisHalfStep;
              crysisLayer += crysisHalfLayer;
            } else {
              crysisPomUv += crysisHalfStep;
              crysisLayer -= crysisHalfLayer;
            }
          }
          crysisCreviceHeight = 1.0 - crysisSampleDepth;
        } else {
          crysisCreviceHeight = texture2D(bumpMap, vBumpMapUv).x;
        }
      #endif

      #ifdef USE_MAP
        vec2 crysisFinalMapUv = vMapUv;
        #ifdef USE_BUMPMAP
          if (uPomMaxDist > 0.5 && vCrysisSurfaceCamDist < uPomMaxDist) {
            crysisFinalMapUv += (crysisPomUv - vBumpMapUv);
          }
        #endif
        vec4 sampledDiffuseColor = texture2D(map, crysisFinalMapUv);
        diffuseColor *= sampledDiffuseColor;
      #endif

      float crysisCreviceMask = clamp((0.52 - crysisCreviceHeight) * 3.2, 0.0, 1.0);
      float crysisLocalWet = clamp(uWetness * (${options.wetnessBias.toFixed(3)} + 0.65 * crysisCreviceMask), 0.0, 1.0);
      diffuseColor.rgb *= mix(1.0, 0.52, crysisLocalWet * ${options.porosity.toFixed(3)});
      diffuseColor.rgb *= mix(0.84, 1.0, clamp(crysisCreviceHeight * 1.4, 0.0, 1.0));
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.09, clamp(crysisLocalWet * 0.85, 0.0, 0.92));
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      vec3 crysisWetV = normalize(cameraPosition - vCrysisSurfaceWorldPos);
      float crysisWetFresnel = pow(1.0 - clamp(dot(normalize(vCrysisSurfaceWorldNormal), crysisWetV), 0.0, 1.0), 4.0) * crysisLocalWet * 0.16;
      outgoingLight += uSkyHorizon * crysisWetFresnel;
      #include <opaque_fragment>
      `,
    );
  };
}

/**
 * Creates a low-bandwidth Crysis-style tropical water ShaderMaterial:
 * - Dual-scrolling ripple normals
 * - Schlick Fresnel (F0 = 0.02) blending deep turquoise #063B47 with sky reflection
 * - Sun specular sparkle & animated shoreline edge foam
 * Zero planar RTT cost -> ideal for Intel HD 4600 & Software WebGL.
 */
export function createCrysisWaterMaterial(
  textures: ProceduralTextureSet,
  uniforms: CrysisShaderUniforms,
  options?: { opacity?: number; uvScaleX?: number; uvScaleY?: number },
): THREE.ShaderMaterial {
  const opacity = options?.opacity ?? 0.92;
  const uvScaleX = options?.uvScaleX ?? 4.0;
  const uvScaleY = options?.uvScaleY ?? 24.0;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uSunDir: uniforms.uSunDir,
      uSunColor: uniforms.uSunColor,
      uSkyHorizon: uniforms.uSkyHorizon,
      uSkyZenith: uniforms.uSkyZenith,
      uRippleTex: { value: textures.waterRippleBump },
      uWaterTex: { value: textures.poolWater },
      uOpacity: { value: opacity },
      uUvScale: { value: new THREE.Vector2(uvScaleX, uvScaleY) },
    },
    transparent: opacity < 0.99,
    depthWrite: opacity >= 0.99,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.55 + uTime * 1.7) * cos(wp.z * 0.42 - uTime * 1.3) * 0.012;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSkyZenith;
      uniform sampler2D uRippleTex;
      uniform sampler2D uWaterTex;
      uniform float uOpacity;
      uniform vec2 uUvScale;

      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec2 uv1 = vUv * uUvScale + vec2(uTime * 0.022, uTime * 0.015);
        vec2 uv2 = vUv * (uUvScale * 1.45) + vec2(-uTime * 0.016, uTime * 0.026);

        float r1 = texture2D(uRippleTex, uv1).r * 2.0 - 1.0;
        float r2 = texture2D(uRippleTex, uv2).r * 2.0 - 1.0;

        // Derive micro-normal perturbation directly from ripple gradients
        float eps = 0.012;
        float rx = texture2D(uRippleTex, uv1 + vec2(eps, 0.0)).r - texture2D(uRippleTex, uv1 - vec2(eps, 0.0)).r;
        float rz = texture2D(uRippleTex, uv2 + vec2(0.0, eps)).r - texture2D(uRippleTex, uv2 - vec2(0.0, eps)).r;
        vec3 N = normalize(vec3(-rx * 1.15, 1.0, -rz * 1.15));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float NdotV = clamp(dot(N, V), 0.0, 1.0);

        // Schlick Fresnel with physical F0 = 0.02
        float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

        // Deep turquoise #063B47 modulated by subtle water caustics
        vec3 deepTurquoise = vec3(0.024, 0.231, 0.278);
        vec3 baseTex = texture2D(uWaterTex, uv1 * 0.45).rgb;
        vec3 waterBody = mix(deepTurquoise, baseTex * 0.68, 0.36);

        // Procedural sky dome reflection (replaces expensive planar Reflector RTT)
        vec3 R = reflect(-V, N);
        float reflElev = clamp(abs(R.y), 0.0, 1.0);
        vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.72, reflElev));

        // Sun reflection glitter (silkier twilight sheen)
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(V + L);
        float spec = pow(clamp(dot(N, H), 0.0, 1.0), 140.0) * 0.95;
        float broadGlint = pow(clamp(dot(R, L), 0.0, 1.0), 14.0) * 0.28;

        // Subtle shoreline foam along pool UV edges
        float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float edgeBand = 1.0 - smoothstep(0.0, 0.028, edgeDist);
        float foamNoise = clamp((r1 + r2) * 0.5 + 0.5, 0.0, 1.0);
        float foam = edgeBand * smoothstep(0.36, 0.76, foamNoise + edgeBand * 0.32) * 0.45;

        vec3 color = mix(waterBody, skyRefl, clamp(fresnel * 1.08 + 0.14, 0.0, 0.9));
        color += uSunColor * (spec + broadGlint);
        color = mix(color, vec3(0.84, 0.91, 0.93), foam);

        gl_FragColor = vec4(color, uOpacity);
      }
    `,
  });
}

/**
 * Quarter-Resolution Screen-Space Radial Sun Shafts (God Rays) Pass.
 * Extracts sky/sun occlusion at 1/4 res, performs 12-tap IGN-jittered radial blur,
 * and blends additively onto the main scene (< 0.55ms on Intel HD 4600).
 */
export class SunShaftsPass extends Pass {
  private readonly qtrTargetA: THREE.WebGLRenderTarget;
  private readonly qtrTargetB: THREE.WebGLRenderTarget;
  private readonly maskQuad: FullScreenQuad;
  private readonly blurQuad: FullScreenQuad;
  private readonly compositeQuad: FullScreenQuad;
  private readonly maskMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;
  private qtrW = 320;
  private qtrH = 180;

  constructor(width: number, height: number) {
    super();
    this.needsSwap = false;
    this.qtrW = Math.max(64, Math.floor(width * 0.25));
    this.qtrH = Math.max(36, Math.floor(height * 0.25));

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.qtrTargetA = new THREE.WebGLRenderTarget(this.qtrW, this.qtrH, rtOpts);
    this.qtrTargetB = new THREE.WebGLRenderTarget(this.qtrW, this.qtrH, rtOpts);

    this.maskMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uSunScreenPos: { value: new THREE.Vector2(0.5, 0.65) },
        uAspect: { value: width / Math.max(1, height) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uSunScreenPos;
        uniform float uAspect;
        varying vec2 vUv;

        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          // Extract bright sky/sunset highlights around projected sun position
          float brightMask = smoothstep(0.52, 0.96, luma);
          vec2 delta = vUv - uSunScreenPos;
          delta.x *= uAspect;
          float halo = clamp(1.0 - length(delta) * 1.15, 0.0, 1.0);
          halo = halo * halo;
          gl_FragColor = vec4(vec3(brightMask * halo), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: this.qtrTargetA.texture },
        uSunScreenPos: { value: new THREE.Vector2(0.5, 0.65) },
        uVisibility: { value: 1.0 },
        uSunTint: { value: new THREE.Color('#ffd28e') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tMask;
        uniform vec2 uSunScreenPos;
        uniform float uVisibility;
        uniform vec3 uSunTint;
        varying vec2 vUv;

        float ign(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }

        void main() {
          if (uVisibility <= 0.002) {
            gl_FragColor = vec4(0.0);
            return;
          }
          vec2 tc = vUv;
          vec2 delta = (tc - uSunScreenPos) * (0.92 / 12.0);
          float stepLen = length(delta);
          if (stepLen > 0.045) {
            delta *= (0.045 / stepLen);
          }
          tc -= delta * ign(gl_FragCoord.xy);

          float decay = 1.0;
          float accum = 0.0;
          for (int i = 0; i < 12; ++i) {
            tc -= delta;
            accum += texture2D(tMask, clamp(tc, 0.0, 1.0)).r * decay * 0.34;
            decay *= 0.925;
          }
          vec3 rays = uSunTint * (accum * 0.62 * uVisibility);
          gl_FragColor = vec4(rays, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tRays: { value: this.qtrTargetB.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tRays;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(tRays, vUv).rgb, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.maskQuad = new FullScreenQuad(this.maskMat);
    this.blurQuad = new FullScreenQuad(this.blurMat);
    this.compositeQuad = new FullScreenQuad(this.compositeMat);
  }

  public updateFromCamera(
    camera: THREE.Camera,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    sunIntensity: number,
  ): void {
    const proj = computeSunScreenProjection(camera, sunDir, sunIntensity);
    this.maskMat.uniforms.uSunScreenPos.value.set(proj.screenX, proj.screenY);
    this.blurMat.uniforms.uSunScreenPos.value.set(proj.screenX, proj.screenY);
    this.blurMat.uniforms.uVisibility.value = proj.visibility;
    this.blurMat.uniforms.uSunTint.value.copy(sunColor).lerp(new THREE.Color('#ffd28e'), 0.45);
  }

  override setSize(width: number, height: number): void {
    this.qtrW = Math.max(64, Math.floor(width * 0.25));
    this.qtrH = Math.max(36, Math.floor(height * 0.25));
    this.qtrTargetA.setSize(this.qtrW, this.qtrH);
    this.qtrTargetB.setSize(this.qtrW, this.qtrH);
    this.maskMat.uniforms.uAspect.value = width / Math.max(1, height);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    if (this.blurMat.uniforms.uVisibility.value <= 0.002) return;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    this.maskMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.qtrTargetA);
    this.maskQuad.render(renderer);

    renderer.setRenderTarget(this.qtrTargetB);
    this.blurQuad.render(renderer);

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.compositeQuad.render(renderer);

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
  }

  override dispose(): void {
    this.qtrTargetA.dispose();
    this.qtrTargetB.dispose();
    this.maskMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
    this.maskQuad.dispose();
    this.blurQuad.dispose();
    this.compositeQuad.dispose();
  }
}

/**
 * Single-Pass Crysis Cinematic Post-FX:
 * - 5-tap Contrast-Adaptive Sharpening (restores crispness at 0.67x-0.875x render scales)
 * - Subtle S-Curve Contrast + Jungle Green Chlorophyll Vibrance + Warm Highlights
 * - Cinematic Edge Vignette
 * - Triangular-PDF Blue-Noise Dithering (eliminates 8-bit sky banding)
 */
export class CrysisPostPass extends Pass {
  private readonly mat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(width: number, height: number) {
    super();
    this.needsSwap = true;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / Math.max(1, width), 1 / Math.max(1, height)) },
        uSharpen: { value: 0.56 },
        uContrast: { value: 0.16 },
        uGreenBoost: { value: 0.12 },
        uVignetteDarkness: { value: 0.38 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexelSize;
        uniform float uSharpen;
        uniform float uContrast;
        uniform float uGreenBoost;
        uniform float uVignetteDarkness;
        varying vec2 vUv;

        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uTexelSize.y)).rgb;
          vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, uTexelSize.y)).rgb;
          vec3 e = texture2D(tDiffuse, vUv + vec2(uTexelSize.x, 0.0)).rgb;
          vec3 w = texture2D(tDiffuse, vUv - vec2(uTexelSize.x, 0.0)).rgb;

          // Lightweight FidelityFX-style Contrast-Adaptive Sharpening (5-tap)
          vec3 mn = min(c, min(min(n, s), min(e, w)));
          vec3 mx = max(c, max(max(n, s), max(e, w)));
          vec3 amp = clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0);
          float sharpW = -0.14 * uSharpen;
          vec3 sharpened = (c + (n + s + e + w) * (sharpW * dot(amp, vec3(0.3333)))) / (1.0 + 4.0 * sharpW * dot(amp, vec3(0.3333)));
          vec3 col = clamp(sharpened, 0.0, 1.0);

          // Gentle S-Curve Contrast without black crush
          vec3 scurve = col * col * (3.0 - 2.0 * col);
          col = mix(col, scurve, uContrast);

          // Crysis Jungle Green Chlorophyll Boost & Warm Highlights
          float greenDom = clamp(col.g - max(col.r, col.b) * 0.85, 0.0, 1.0);
          col.g += greenDom * uGreenBoost;
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          col *= mix(vec3(1.0), vec3(1.03, 0.99, 0.94), smoothstep(0.45, 0.95, luma));

          // Soft Cinematic Edge Vignette
          vec2 vigUv = vUv * 2.0 - 1.0;
          float vig = 1.0 - dot(vigUv, vigUv) * (0.28 * uVignetteDarkness);
          col *= clamp(vig, 0.55, 1.0);

          // Triangular-PDF Blue-Noise Dither (kills 8-bit sky gradient banding)
          float n1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float n2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(37.0, 17.0), vec2(0.06711056, 0.00583715))));
          col += (n1 + n2 - 1.0) * (1.2 / 255.0);

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new FullScreenQuad(this.mat);
  }

  override setSize(width: number, height: number): void {
    this.mat.uniforms.uTexelSize.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.mat.dispose();
    this.quad.dispose();
  }
}
