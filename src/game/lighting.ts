import * as THREE from 'three';

// Pre-allocated color & vector scratchpads (zero GC inside frame loop)
const _duskHorizon = new THREE.Color(0xff8c42); // Warm fiery apricot/gold horizon
const _duskMid = new THREE.Color(0xb55d6d); // Dusty rose mid-sky
const _duskZenith = new THREE.Color(0x1e2749); // Deep twilight indigo zenith

const _nightHorizon = new THREE.Color(0x0c1428); // Midnight blue horizon
const _nightMid = new THREE.Color(0x070c1a); // Deep navy mid-sky
const _nightZenith = new THREE.Color(0x040711); // Pitch starry zenith

const _duskFog = new THREE.Color(0xc97b5d);
const _nightFog = new THREE.Color(0x090f1d);
const _fogCurrent = new THREE.Color();

const _sunColorDusk = new THREE.Color(0xffb066);
const _sunColorNight = new THREE.Color(0x4a6fa5);

const _hemiSkyDusk = new THREE.Color(0x6d83b5);
const _hemiGroundDusk = new THREE.Color(0x4a3228);
const _hemiSkyNight = new THREE.Color(0x1c2b4d);
const _hemiGroundNight = new THREE.Color(0x0c101b);

const _sunDir = new THREE.Vector3();

export const DUSK_START_HOUR = 18.75; // 18:45 Golden Dusk
export const NIGHTFALL_START_TIME = 0.09375; // 21:00 Nightfall (18.75 + 0.09375 * 24 = 21.0)
export const DAWN_START_TIME = 0.46875; // 06:00 Agra Dawn

export interface LightingUpdateInput {
  timeOfDay: number;
  elapsed: number;
  cameraPos: THREE.Vector3;
  uvLights: THREE.PointLight[];
  floodLights: THREE.SpotLight[];
  stringBulbMats: THREE.MeshStandardMaterial[];
}

/**
 * Manages the Golden Dusk (18:45) -> Nightfall (21:00+) atmospheric lighting rig:
 * - 900m Procedural GLSL Gradient Sky Dome with sunset solar disc & twinkling stars
 * - Sun DirectionalLight + HemisphereLight bounce
 * - Exponential FogExp2 synced with horizon depth
 */
export class TimeOfDayLightingSystem {
  public readonly skyMesh: THREE.Mesh;
  public readonly skyMat: THREE.ShaderMaterial;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    this.scene = scene;
    this.scene.background = _duskFog.clone();
    this.scene.fog = new THREE.FogExp2(_duskFog.getHex(), 0.0045);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uHorizonColor: { value: _duskHorizon.clone() },
        uMidColor: { value: _duskMid.clone() },
        uZenithColor: { value: _duskZenith.clone() },
        uSunDir: { value: new THREE.Vector3(0.18, 0.13, -0.97).normalize() },
        uSunColor: { value: new THREE.Color(0xffcc7a) },
        uSunIntensity: { value: 1.0 },
        uStarVisibility: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uHorizonColor;
        uniform vec3 uMidColor;
        uniform vec3 uZenithColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSunIntensity;
        uniform float uStarVisibility;
        uniform float uTime;
        varying vec3 vWorldDir;

        float hash31(vec3 p) {
          p = fract(p * vec3(443.897, 441.423, 437.195));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);

          // 3-stop atmospheric sky gradient: Horizon -> Mid-Sky -> Zenith
          float midT = smoothstep(0.0, 0.34, h);
          float zenT = smoothstep(0.24, 0.88, h);
          vec3 sky = mix(uHorizonColor, uMidColor, midT);
          sky = mix(sky, uZenithColor, zenT);

          // Sunset solar disc + warm atmospheric Mie scatter glow behind Taj Mahal
          vec3 sDir = normalize(uSunDir);
          float sunDot = max(dot(dir, sDir), 0.0);
          float broadGlow = pow(sunDot, 5.0) * 0.32 * uSunIntensity;
          float halo = pow(sunDot, 22.0) * 0.45 * uSunIntensity;
          float disc = smoothstep(0.9968, 0.9989, sunDot) * 1.15 * uSunIntensity;
          sky += uSunColor * (broadGlow + halo + disc);

          // Subtle twinkling procedural starfield at Nightfall
          if (uStarVisibility > 0.01 && dir.y > 0.04) {
            vec3 cell = floor(dir * 260.0);
            float rnd = hash31(cell);
            if (rnd > 0.986) {
              vec3 center = normalize(cell + 0.5);
              float d = length(dir - center) * 260.0;
              float starMask = smoothstep(0.42, 0.05, d);
              float twinkle = 0.58 + 0.42 * sin(uTime * (2.2 + rnd * 4.5) + rnd * 62.0);
              float elevFade = smoothstep(0.04, 0.25, dir.y);
              sky += vec3(0.85, 0.91, 1.0) * starMask * twinkle * elevFade * uStarVisibility * 0.95;
            }
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    this.hemiLight = new THREE.HemisphereLight(_hemiSkyDusk.getHex(), _hemiGroundDusk.getHex(), 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(_sunColorDusk.getHex(), 2.2);
    this.sunLight.position.set(16, 15, -85);
    this.sunLight.castShadow = !isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 210;
    const d = 72;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
  }

  public static isNightTime(timeOfDay: number): boolean {
    return timeOfDay >= NIGHTFALL_START_TIME && timeOfDay < DAWN_START_TIME;
  }

  public static formatClock24h(timeOfDay: number): string {
    const hoursFloat = (DUSK_START_HOUR + timeOfDay * 24) % 24;
    const h = Math.floor(hoursFloat);
    const m = Math.floor((hoursFloat - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  public static getTimeLabel(timeOfDay: number): string {
    if (timeOfDay >= NIGHTFALL_START_TIME && timeOfDay < DAWN_START_TIME) {
      return 'Nightfall · UV Active';
    }
    if (timeOfDay >= DAWN_START_TIME && timeOfDay < 0.72) {
      return 'Agra Dawn';
    }
    return 'Golden Dusk';
  }

  public update(input: LightingUpdateInput): void {
    const { timeOfDay: t, elapsed, cameraPos, uvLights, floodLights, stringBulbMats } = input;

    // Map timeOfDay (0.0 = 18:45 Golden Dusk -> 0.09375+ = 21:00+ Nightfall -> 0.47 = Dawn -> 1.0 = Dusk)
    let nightFactor = 0;
    if (t < NIGHTFALL_START_TIME) {
      const k = t / NIGHTFALL_START_TIME;
      nightFactor = k * k * (3 - 2 * k);
    } else if (t < DAWN_START_TIME - 0.05) {
      nightFactor = 1.0;
    } else if (t < 0.62) {
      const k = (t - (DAWN_START_TIME - 0.05)) / (0.62 - (DAWN_START_TIME - 0.05));
      nightFactor = 1.0 - k * k * (3 - 2 * k);
    } else {
      nightFactor = 0;
    }

    // Sky dome 3-stop gradient & procedural stars
    this.skyMat.uniforms.uHorizonColor.value.lerpColors(_duskHorizon, _nightHorizon, nightFactor);
    this.skyMat.uniforms.uMidColor.value.lerpColors(_duskMid, _nightMid, nightFactor);
    this.skyMat.uniforms.uZenithColor.value.lerpColors(_duskZenith, _nightZenith, nightFactor);
    this.skyMat.uniforms.uStarVisibility.value = THREE.MathUtils.clamp((nightFactor - 0.35) / 0.65, 0, 1);
    this.skyMat.uniforms.uTime.value = elapsed;

    // Low golden sun disc slightly beside/behind the Taj Mahal dome (NNE/N horizon) for rim silhouette
    const sunElev = THREE.MathUtils.lerp(0.115, 0.28, nightFactor);
    const sunAzimuth = 0.21 - Math.sin(t * Math.PI * 2) * 0.28;
    _sunDir.set(sunAzimuth, sunElev, -0.96).normalize();
    this.skyMat.uniforms.uSunDir.value.copy(_sunDir);
    this.skyMat.uniforms.uSunColor.value.lerpColors(_sunColorDusk, _sunColorNight, nightFactor);
    this.skyMat.uniforms.uSunIntensity.value = THREE.MathUtils.lerp(1.0, 0.22, nightFactor);

    // Exponential Fog matching horizon transition (0.0045 dusk -> 0.0075 nightfall)
    _fogCurrent.lerpColors(_duskFog, _nightFog, nightFactor);
    (this.scene.background as THREE.Color).copy(_fogCurrent);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_fogCurrent);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0045, 0.0075, nightFactor);
    }

    // 3-Point Outdoor Sun & Hemisphere Bounce
    this.sunLight.color.lerpColors(_sunColorDusk, _sunColorNight, nightFactor);
    this.sunLight.intensity = THREE.MathUtils.lerp(2.2, 0.45, nightFactor);
    this.sunLight.position.copy(_sunDir).multiplyScalar(92);

    this.hemiLight.color.lerpColors(_hemiSkyDusk, _hemiSkyNight, nightFactor);
    this.hemiLight.groundColor.lerpColors(_hemiGroundDusk, _hemiGroundNight, nightFactor);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.72, 0.38, nightFactor);

    // Safe-zone UV & floodlight scaling
    const uvPower = THREE.MathUtils.lerp(7.5, 14.5, nightFactor);
    uvLights.forEach((l, idx) => {
      l.intensity = idx === uvLights.length - 1 ? uvPower * 1.45 : uvPower;
    });
    floodLights.forEach((f) => {
      f.intensity = THREE.MathUtils.lerp(4.5, 9.5, nightFactor);
    });
    const bulbEmissive = THREE.MathUtils.lerp(1.3, 2.8, nightFactor);
    stringBulbMats.forEach((m) => {
      m.emissiveIntensity = bulbEmissive;
    });

    this.skyMesh.position.copy(cameraPos);
  }

  public dispose(): void {
    this.scene.remove(this.skyMesh);
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
  }
}
