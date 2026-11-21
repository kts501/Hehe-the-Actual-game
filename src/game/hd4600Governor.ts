import * as THREE from 'three';

export interface GpuHardwareProfile {
  rendererString: string;
  isSoftwareGl: boolean;
  isIntelIntegrated: boolean;
}

export interface GovernorRenderConfig {
  tier: 0 | 1 | 2 | 3;
  pixelRatio: number;
  foliageCullMeters: number;
  pomMaxMeters: number;
  shadowDistance: number;
  sunShaftsEnabled: boolean;
  bloomEnabled: boolean;
  useDirectForward: boolean;
  shadowRefreshInterval: number;
}

const CRYSIS_GOVERNOR_TIERS: ReadonlyArray<
  Omit<GovernorRenderConfig, 'shadowRefreshInterval'>
> = [
  {
    tier: 0,
    pixelRatio: 1.0,
    foliageCullMeters: 38,
    pomMaxMeters: 12,
    shadowDistance: 75,
    sunShaftsEnabled: true,
    bloomEnabled: true,
    useDirectForward: false,
  },
  {
    tier: 1,
    pixelRatio: 0.875,
    foliageCullMeters: 28,
    pomMaxMeters: 7,
    shadowDistance: 62,
    sunShaftsEnabled: true,
    bloomEnabled: true,
    useDirectForward: false,
  },
  {
    tier: 2,
    pixelRatio: 0.75,
    foliageCullMeters: 25,
    pomMaxMeters: 0,
    shadowDistance: 48,
    sunShaftsEnabled: true,
    bloomEnabled: false,
    useDirectForward: false,
  },
  {
    tier: 3,
    pixelRatio: 0.667,
    foliageCullMeters: 22,
    pomMaxMeters: 0,
    shadowDistance: 40,
    sunShaftsEnabled: false,
    bloomEnabled: false,
    useDirectForward: true,
  },
];

/**
 * Probes WebGL2 UNMASKED_RENDERER_WEBGL once during engine startup and immediately
 * releases the temporary probe context so zero VRAM is leaked.
 */
export function probeGpuHardwareProfile(): GpuHardwareProfile {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) {
    return {
      rendererString: 'Software/Fallback',
      isSoftwareGl: true,
      isIntelIntegrated: false,
    };
  }

  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const rendererString = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererString);
  const isIntelIntegrated =
    !isSoftwareGl &&
    /Intel.*(?:HD|UHD|Iris|Haswell|Broadwell|Skylake|Kaby|Coffee|Graphics)|Mesa.*Intel/i.test(
      rendererString,
    );

  return {
    rendererString,
    isSoftwareGl,
    isIntelIntegrated,
  };
}

/**
 * Hardware-aware 500ms-window frame-time & pixel fill-rate governor tuned for
 * Intel Core i5-4690/5690 + Intel HD Graphics 4600 (30 FPS / 33.3ms frame budget):
 *
 * - Evaluates rolling average frame time every 500ms.
 * - If frame time exceeds 31.5ms (approaching 33.3ms 30 FPS ceiling), gracefully
 *   steps down through Tiers 0 -> 3 (trimming foliage cull radius 38m->22m,
 *   POM distance 12m->0m, shadow frustum 75m->40m, and render scale 1.0->0.667).
 * - Asymmetric recovery hysteresis: restores one tier only after 3.5s of
 *   sustained < 26.5ms headroom to avoid visual oscillation.
 * - Throttles shadow-map updates (every 2nd frame on integrated GPUs) while
 *   keeping frame 0 immediately valid.
 */
export class HD4600Governor {
  public readonly profile: GpuHardwareProfile;
  private tierIndex = 0;
  private windowMsAccum = 0;
  private windowFrames = 0;
  private recoveryTimerMs = 0;
  private cooldownMs = 0;
  private frameCounter = 0;
  private shadowRefreshInterval: number;

  private readonly triggerThresholdMs = 31.5;
  private readonly recoveryThresholdMs = 26.5;
  private readonly sampleIntervalMs = 500.0;

  constructor(profile: GpuHardwareProfile) {
    this.profile = profile;
    // Software WebGL stays on direct forward path with zero multi-pass stalls
    this.tierIndex = profile.isSoftwareGl ? 3 : 0;
    this.shadowRefreshInterval = profile.isIntelIntegrated ? 2 : 1;
  }

  public get currentPixelRatio(): number {
    return this.profile.isSoftwareGl ? 1.0 : CRYSIS_GOVERNOR_TIERS[this.tierIndex].pixelRatio;
  }

  public get config(): GovernorRenderConfig {
    const base = CRYSIS_GOVERNOR_TIERS[this.tierIndex];
    if (this.profile.isSoftwareGl) {
      return {
        ...base,
        pixelRatio: 1.0,
        pomMaxMeters: 0,
        sunShaftsEnabled: false,
        bloomEnabled: false,
        useDirectForward: true,
        shadowRefreshInterval: 1,
      };
    }
    return {
      ...base,
      shadowRefreshInterval: this.shadowRefreshInterval,
    };
  }

  /**
   * Returns true on frames when the directional shadow map should re-render.
   * Always returns true on frame 0 so initial scene shadows are immediately valid.
   */
  public shouldUpdateShadows(isSoftwareGl: boolean): boolean {
    if (isSoftwareGl) return false;
    const idx = this.frameCounter++;
    return idx === 0 || idx % this.shadowRefreshInterval === 0;
  }

  /**
   * Feeds measured frame delta (in seconds) into the 500ms window estimator and
   * invokes onApplyConfig whenever quality tier transitions occur.
   */
  public sampleFrame(
    rawDtSec: number,
    onApplyConfig: (config: GovernorRenderConfig) => void,
  ): void {
    if (this.profile.isSoftwareGl) return;

    const frameMs = THREE.MathUtils.clamp(rawDtSec * 1000, 4.0, 100.0);
    this.windowMsAccum += frameMs;
    this.windowFrames++;

    if (this.cooldownMs > 0) {
      this.cooldownMs = Math.max(0, this.cooldownMs - frameMs);
    }

    if (this.windowMsAccum < this.sampleIntervalMs) return;

    const avgFrameMs = this.windowMsAccum / Math.max(1, this.windowFrames);
    const elapsedWindowMs = this.windowMsAccum;
    this.windowMsAccum = 0;
    this.windowFrames = 0;

    if (avgFrameMs > this.triggerThresholdMs && this.cooldownMs <= 0) {
      this.recoveryTimerMs = 0;
      if (this.tierIndex < CRYSIS_GOVERNOR_TIERS.length - 1) {
        this.tierIndex++;
        this.cooldownMs = 1500;
        this.shadowRefreshInterval = this.tierIndex >= 2 ? 2 : this.profile.isIntelIntegrated ? 2 : 1;
        onApplyConfig(this.config);
      }
      return;
    }

    if (avgFrameMs < this.recoveryThresholdMs) {
      this.recoveryTimerMs += elapsedWindowMs;
      if (this.recoveryTimerMs >= 3500 && this.cooldownMs <= 0 && this.tierIndex > 0) {
        this.tierIndex--;
        this.recoveryTimerMs = 0;
        this.cooldownMs = 2500;
        this.shadowRefreshInterval = this.tierIndex >= 2 ? 2 : this.profile.isIntelIntegrated ? 2 : 1;
        onApplyConfig(this.config);
      }
    } else {
      this.recoveryTimerMs = Math.max(0, this.recoveryTimerMs - elapsedWindowMs * 0.5);
    }
  }
}
