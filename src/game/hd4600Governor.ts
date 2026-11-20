import * as THREE from 'three';

export interface GpuHardwareProfile {
  rendererString: string;
  isSoftwareGl: boolean;
  isIntelIntegrated: boolean;
}

export interface GovernorRenderConfig {
  pixelRatio: number;
  bloomEnabled: boolean;
  useDirectForward: boolean;
  shadowRefreshInterval: number;
}

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
 * Hardware-aware frame-time & pixel fill-rate governor tuned for
 * Intel Core i5-4690S + Intel HD Graphics 4600 (shared DDR3 bandwidth):
 *
 * - Forces initial pixel ratio strictly to 1.0 (overriding Windows 125%/150% DPI scaling).
 * - Dynamically steps internal render scale (1.0 -> 0.875 -> 0.75) with hysteresis
 *   when fragment fill-rate pushes frame time above target budget, and restores
 *   cleanly once sustained headroom returns.
 * - Throttles shadow-map re-evaluation cadence (every 2nd frame on integrated GPUs)
 *   without disabling shadows or altering scene lighting.
 * - Keeps half-resolution bloom active by default and only toggles direct-forward
 *   ACES Filmic rendering under sustained severe GPU pressure.
 */
export class HD4600Governor {
  public readonly profile: GpuHardwareProfile;
  private readonly scaleSteps = [1.0, 0.875, 0.75] as const;
  private scaleIndex = 0;
  private emaFrameMs = 16.67;
  private pressureAccumSec = 0;
  private headroomAccumSec = 0;
  private cooldownSec = 0;
  private frameCounter = 0;

  private bloomEnabled: boolean;
  private useDirectForward: boolean;
  private shadowRefreshInterval: number;
  private dirty = false;

  constructor(profile: GpuHardwareProfile) {
    this.profile = profile;
    this.bloomEnabled = !profile.isSoftwareGl;
    this.useDirectForward = profile.isSoftwareGl;
    this.shadowRefreshInterval = profile.isIntelIntegrated ? 2 : 1;
  }

  public get currentPixelRatio(): number {
    return this.scaleSteps[this.scaleIndex];
  }

  public get config(): GovernorRenderConfig {
    return {
      pixelRatio: this.scaleSteps[this.scaleIndex],
      bloomEnabled: this.bloomEnabled,
      useDirectForward: this.useDirectForward,
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
   * Feeds measured frame delta into the smoothed frame-time estimator and applies
   * any needed resolution-scale or bloom adjustments via callback (zero GC).
   */
  public sampleFrame(
    rawDtSec: number,
    onApplyScale: (pixelRatio: number, bloomEnabled: boolean, useDirectForward: boolean) => void,
  ): void {
    if (this.profile.isSoftwareGl) return;

    const frameMs = THREE.MathUtils.clamp(rawDtSec * 1000, 4, 120);
    this.emaFrameMs = this.emaFrameMs * 0.9 + frameMs * 0.1;

    if (this.cooldownSec > 0) {
      this.cooldownSec = Math.max(0, this.cooldownSec - rawDtSec);
    }

    // Downscale hysteresis: sustained > 21.5ms (~46 FPS) triggers graceful step-down
    if (this.emaFrameMs > 21.5) {
      this.pressureAccumSec += rawDtSec;
      this.headroomAccumSec = 0;
    } else if (this.emaFrameMs < 14.8) {
      this.headroomAccumSec += rawDtSec;
      this.pressureAccumSec = 0;
    } else {
      this.pressureAccumSec = Math.max(0, this.pressureAccumSec - rawDtSec * 0.5);
      this.headroomAccumSec = Math.max(0, this.headroomAccumSec - rawDtSec * 0.5);
    }

    if (this.cooldownSec <= 0) {
      if (this.pressureAccumSec >= 1.25) {
        this.pressureAccumSec = 0;
        if (this.scaleIndex < this.scaleSteps.length - 1) {
          this.scaleIndex++;
          this.dirty = true;
          this.cooldownSec = 2.0;
        } else if (this.bloomEnabled) {
          this.bloomEnabled = false;
          this.dirty = true;
          this.cooldownSec = 2.5;
        } else if (this.profile.isIntelIntegrated && !this.useDirectForward) {
          this.useDirectForward = true;
          this.dirty = true;
          this.cooldownSec = 3.0;
        }
      } else if (this.headroomAccumSec >= 3.0) {
        this.headroomAccumSec = 0;
        if (this.useDirectForward) {
          this.useDirectForward = false;
          this.dirty = true;
          this.cooldownSec = 3.0;
        } else if (!this.bloomEnabled) {
          this.bloomEnabled = true;
          this.dirty = true;
          this.cooldownSec = 2.5;
        } else if (this.scaleIndex > 0) {
          this.scaleIndex--;
          this.dirty = true;
          this.cooldownSec = 2.5;
        }
      }
    }

    if (this.dirty) {
      this.dirty = false;
      onApplyScale(this.scaleSteps[this.scaleIndex], this.bloomEnabled, this.useDirectForward);
    }
  }
}
