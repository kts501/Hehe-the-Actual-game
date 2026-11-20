import * as THREE from 'three';

// Pre-allocated color & vector scratchpads (zero GC inside frame loop)
const _duskHorizon = new THREE.Color(0xff8c42); // Warm fiery apricot/gold horizon
const _duskMid = new THREE.Color(0xb55d6d); // Dusty rose mid-sky
const _duskZenith = new THREE.Color(0x1e2749); // Deep twilight indigo zenith

const _nightHorizon = new THREE.Color(0x0c1428); // Midnight blue horizon
const _nightMid = new THREE.Color(0x070c1a); // Deep navy mid-sky
const _nightZenith = new THREE.Color(0x040711); // Pitch starry zenith

const _duskFog = new THREE.Color(0xd99b66);
const _nightFog = new THREE.Color(0x0d1324);
const _fogCurrent = new THREE.Color();

const _sunColorDusk = new THREE.Color('#ffb259');
const _sunColorNight = new THREE.Color(0x4a6fa5);

const _hemiSkyDusk = new THREE.Color('#5f82c4');
const _hemiGroundDusk = new THREE.Color('#8c583a');
const _hemiSkyNight = new THREE.Color(0x1c2b4d);
const _hemiGroundNight = new THREE.Color(0x0c101b);

const _sunDir = new THREE.Vector3();

export const DUSK_START_HOUR = 15 + 58 / 60; // 3:58 PM — DAY 1 Golden-Hour Outbreak
export const NIGHTFALL_START_TIME = 0.09375; // Nightfall transition
export const DAWN_START_TIME = 0.46875; // Dawn transition

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
 * - 3-Point Atmospheric Lighting: Key Sun + Sky/Ground Hemisphere Fill + Cool Player Rim Backlight
 * - Exponential FogExp2 synced with horizon depth
 */
export class TimeOfDayLightingSystem {
  public readonly skyMesh: THREE.Mesh;
  public readonly skyMat: THREE.ShaderMaterial;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly rimLight: THREE.DirectionalLight;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean, shadowMapSize = 2048) {
    this.scene = scene;
    this.scene.background = _duskFog.clone();
    this.scene.fog = new THREE.FogExp2(0xd99b66, 0.0065);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uHorizonColor: { value: _duskHorizon.clone() },
        uMidColor: { value: _duskMid.clone() },
        uZenithColor: { value: _duskZenith.clone() },
        uSunDir: { value: new THREE.Vector3(0.18, Math.sin(THREE.MathUtils.degToRad(24)), -0.9).normalize() },
        uSunColor: { value: new THREE.Color('#ffae52') },
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
          float broadGlow = pow(sunDot, 5.0) * 0.34 * uSunIntensity;
          float halo = pow(sunDot, 22.0) * 0.48 * uSunIntensity;
          float disc = smoothstep(0.9968, 0.9989, sunDot) * 1.25 * uSunIntensity;
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

    this.hemiLight = new THREE.HemisphereLight(_hemiSkyDusk.getHex(), _hemiGroundDusk.getHex(), 0.85);
    this.hemiLight.layers.enable(2); // Illuminate Layer 2 viewmodel fists with twilight/sandstone bounce
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(_sunColorDusk.getHex(), 2.6);
    this.sunLight.position.set(22, 42, -108);
    this.sunLight.target.position.set(0, 0, -22);
    this.sunLight.castShadow = !isSoftwareGl;
    this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 220;
    this.sunLight.shadow.camera.left = -75;
    this.sunLight.shadow.camera.right = 75;
    this.sunLight.shadow.camera.top = 75;
    this.sunLight.shadow.camera.bottom = -75;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = shadowMapSize <= 1024 ? 0.042 : 0.025;
    this.sunLight.layers.enable(2); // Illuminate Layer 2 viewmodel fists & weapons
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle cool rim/backlight separating zombies, Night Runners, and Silas Walker's fists from dark silhouettes
    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    this.rimLight.castShadow = false;
    this.rimLight.position.set(-18, 16, 48);
    this.rimLight.layers.enable(2);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);
  }

  public static isNightTime(timeOfDay: number): boolean {
    return timeOfDay >= NIGHTFALL_START_TIME && timeOfDay < DAWN_START_TIME;
  }

  public static formatClock24h(timeOfDay: number): string {
    const hoursFloat = (DUSK_START_HOUR + timeOfDay * 24) % 24;
    const hr24 = Math.floor(hoursFloat);
    const mn = Math.floor((hoursFloat - hr24) * 60);
    const ampm = hr24 >= 12 ? 'PM' : 'AM';
    const hr12 = hr24 % 12 === 0 ? 12 : hr24 % 12;
    return `${hr12}:${String(mn).padStart(2, '0')} ${ampm} — DAY 1`;
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

    // Map timeOfDay (0.0 = Golden Dusk -> 0.09375+ = Nightfall -> 0.47 = Dawn -> 1.0 = Dusk)
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

    // Low golden sun positioned at a dramatic 24-degree sunset angle behind/beside the Taj Mahal
    const elevRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(24, 34, nightFactor));
    const cosElev = Math.cos(elevRad);
    const sunElevY = Math.sin(elevRad);
    const sunAzimuth = 0.24 - Math.sin(t * Math.PI * 2) * 0.28;
    const horizLen = Math.hypot(sunAzimuth, -0.96);
    _sunDir.set((sunAzimuth / horizLen) * cosElev, sunElevY, (-0.96 / horizLen) * cosElev).normalize();

    this.skyMat.uniforms.uSunDir.value.copy(_sunDir);
    this.skyMat.uniforms.uSunColor.value.lerpColors(_sunColorDusk, _sunColorNight, nightFactor);
    this.skyMat.uniforms.uSunIntensity.value = THREE.MathUtils.lerp(1.0, 0.22, nightFactor);

    // Atmospheric distance FogExp2 (0.0065 golden-hour haze -> 0.011 deep indigo nightfall)
    _fogCurrent.lerpColors(_duskFog, _nightFog, nightFactor);
    (this.scene.background as THREE.Color).copy(_fogCurrent);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_fogCurrent);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0065, 0.011, nightFactor);
    }

    // 3-Point Atmospheric Lighting: Key Sun + Sky/Ground Hemisphere Fill + Cool Rim Backlight
    this.sunLight.color.lerpColors(_sunColorDusk, _sunColorNight, nightFactor);
    this.sunLight.intensity = THREE.MathUtils.lerp(2.6, 0.55, nightFactor);
    this.sunLight.position.copy(this.sunLight.target.position).addScaledVector(_sunDir, 105);

    this.hemiLight.color.lerpColors(_hemiSkyDusk, _hemiSkyNight, nightFactor);
    this.hemiLight.groundColor.lerpColors(_hemiGroundDusk, _hemiGroundNight, nightFactor);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.85, 0.42, nightFactor);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.36, 0.1, nightFactor);

    this.rimLight.intensity = THREE.MathUtils.lerp(0.45, 0.58, nightFactor);
    this.rimLight.target.position.copy(cameraPos);
    this.rimLight.position.set(
      cameraPos.x - _sunDir.x * 36,
      cameraPos.y + 14,
      cameraPos.z - _sunDir.z * 36,
    );

    // Safe-zone UV & floodlight scaling
    const uvPower = THREE.MathUtils.lerp(7.5, 14.5, nightFactor);
    const uvCount = uvLights.length;
    for (let i = 0; i < uvCount; i++) {
      uvLights[i].intensity = i === uvCount - 1 ? uvPower * 1.45 : uvPower;
    }
    const floodPower = THREE.MathUtils.lerp(4.5, 9.5, nightFactor);
    for (let i = 0; i < floodLights.length; i++) {
      floodLights[i].intensity = floodPower;
    }
    const bulbEmissive = THREE.MathUtils.lerp(1.3, 2.8, nightFactor);
    for (let i = 0; i < stringBulbMats.length; i++) {
      stringBulbMats[i].emissiveIntensity = bulbEmissive;
    }

    this.skyMesh.position.copy(cameraPos);
  }

  public dispose(): void {
    this.scene.remove(this.skyMesh);
    this.scene.remove(this.sunLight.target);
    this.scene.remove(this.rimLight.target);
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
  }
}
