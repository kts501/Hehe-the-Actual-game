import * as THREE from 'three';

export interface AwakeningState {
  charge: number;
  isReady: boolean;
  isActivating: boolean;
  isActive: boolean;
  activeDuration: number;
  animTimer: number;
}

export interface AwakeningViewmodelPose {
  active: boolean;
  rightPosX: number;
  rightPosY: number;
  rightPosZ: number;
  rightRotX: number;
  rightRotY: number;
  rightRotZ: number;
  leftPosX: number;
  leftPosY: number;
  leftPosZ: number;
  leftRotX: number;
  leftRotY: number;
  leftRotZ: number;
  leftPose: 'FIST_CLENCH' | 'OPEN_REACH';
  rightPose: 'WEAPON_GRIP';
  exertion: number;
}

export interface AwakeningCinematicCamera {
  active: boolean;
  lockInput: boolean;
  pitch: number;
  yaw: number;
  roll: number;
  fov: number;
  heightOffset: number;
  shakeX: number;
  shakeY: number;
}

export interface AwakeningHudSnapshot {
  charge: number;
  isReady: boolean;
  isActivating: boolean;
  isActive: boolean;
  remainingSeconds: number;
  impactFlashOpacity: number;
  impactOverlayMode: 'none' | 'whiteGold' | 'crimsonBurst';
  impactOverlayOpacity: number;
  vignetteOpacity: number;
  cinematicActive: boolean;
  cutsceneTime: number;
  letterboxProgress: number;
  vignetteDarkOpacity: number;
  desaturateProgress: number;
  hudDimOpacity: number;
  subtitleVisible: boolean;
  subtitleElapsed: number;
  subtitleFlashProgress: number;
  subtitleExitProgress: number;
}

interface ShockwaveRingEffect {
  primaryRing: THREE.Mesh;
  primaryMat: THREE.MeshBasicMaterial;
  secondaryRing: THREE.Mesh;
  secondaryMat: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
}

interface ShockwaveEmberEffect {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  age: number;
  duration: number;
}

// =============================================================================
// CINEMATIC ANIME BUILD-UP (0.00s -> 4.60s) & ACTIVATION SMACK (4.60s -> 5.55s)
// =============================================================================
const LETTERBOX_SLIDE_IN_DUR = 0.35;
const BEAT1_PITCH_END = 0.45;
const BEAT1_END = 2.0;
const BEAT2_CAM_END = 2.5;
const BEAT2_END = 4.0;
const SUBTITLE_REVEAL_TIME = 2.6;

// Part 2: Seamless Transition -> Overhead Wind-Up -> Self-Bonk -> Shockwave -> Pumped-Up
const INTRO_COMPLETE_TIME = 4.6;
const SUBTITLE_FLASH_END = 4.66;
const SUBTITLE_EXIT_END = 4.78;
const CAM_SNAP_END = 4.82;
const WINDUP_END = 4.85;
const IMPACT_TIME = 4.96;
const HOLD_END = 5.02;
const HEAD_SNAP_RECOVER_END = 5.24; // 0.28s spring recovery after 4.96s
const TRAUMA_DECAY_DUR = 0.45;
const HUD_RESTORE_START = 5.15;
const LETTERBOX_RETRACT_DUR = 0.35; // 5.15s -> 5.50s
const SEQUENCE_END = 5.55;

function easeOutCubic(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - u, 3);
}

function easeInOutCubic(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function easeInExpo(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u === 0 ? 0 : Math.pow(2, 10 * u - 10);
}

/**
 * Self-contained Awakening / Pumped-Up Ultimate System:
 * Part 1 (0.00s - 4.60s): Defeated stare + bat crimson glint + dripping anime subtitle.
 * Part 2 (4.60s - 5.55s): Overhead wind-up + self-bonk smack + 3D shockwave blast + 25s Pumped-Up buffs.
 */
export class AwakeningSystem {
  public readonly state: AwakeningState = {
    charge: 0,
    isReady: false,
    isActivating: false,
    isActive: false,
    activeDuration: 25.0,
    animTimer: 0,
  };

  public cutsceneTimer = 0;
  public savedCameraPitch = 0;
  public savedCameraYaw = 0;
  public savedFov = 75;

  private introCompleteFired = false;
  private impactFired = false;

  private impactFlashOpacity = 0;
  private vignetteOpacity = 0;
  private fovOffset = 0;
  private trauma = 0;

  private droneStarted = false;
  private bassStingTriggered = false;
  private lastHeartbeatPulseIdx = -1;
  private droneMasterGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneNoiseSrc: AudioBufferSourceNode | null = null;

  private readonly rings: ShockwaveRingEffect[] = [];
  private readonly embers: ShockwaveEmberEffect[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private readonly glintColor = new THREE.Color(0x000000);

  private onSelfBonkImpactCallback: (() => void) | null = null;
  private onSequenceCompleteCallback: (() => void) | null = null;

  public reset(scene?: THREE.Scene): void {
    this.stopTensionDrone();
    this.state.charge = 0;
    this.state.isReady = false;
    this.state.isActivating = false;
    this.state.isActive = false;
    this.state.activeDuration = 25.0;
    this.state.animTimer = 0;
    this.cutsceneTimer = 0;
    this.savedCameraPitch = 0;
    this.savedCameraYaw = 0;
    this.savedFov = 75;
    this.introCompleteFired = false;
    this.impactFired = false;
    this.impactFlashOpacity = 0;
    this.vignetteOpacity = 0;
    this.fovOffset = 0;
    this.trauma = 0;
    this.droneStarted = false;
    this.bassStingTriggered = false;
    this.lastHeartbeatPulseIdx = -1;
    this.onSelfBonkImpactCallback = null;
    this.onSequenceCompleteCallback = null;
    if (scene) {
      this.clearEffects(scene);
    }
  }

  public addAwakeningCharge(amount: number): void {
    if (this.state.isActive || this.state.isActivating || amount <= 0) return;
    this.state.charge = Math.max(0, Math.min(100, this.state.charge + amount));
    this.state.isReady = this.state.charge >= 100 && !this.state.isActive;
  }

  public setDebugFullCharge(): void {
    if (this.state.isActive || this.state.isActivating) return;
    this.state.charge = 100;
    this.state.isReady = true;
  }

  /**
   * Frame 0 (t = 0.00s): Saves camera pitch, yaw & FOV, locks state across the full
   * 5.55s Awakening cinematic (0.00s-4.60s intro + 4.60s-5.55s self-bonk activation).
   */
  public tryStartActivation(
    currentPitch: number,
    currentYaw: number,
    currentFov: number,
    onSelfBonkImpact?: () => void,
    onSequenceComplete?: () => void,
  ): boolean {
    if (!this.state.isReady || this.state.isActivating || this.state.isActive) {
      return false;
    }
    this.savedCameraPitch = currentPitch;
    this.savedCameraYaw = currentYaw;
    this.savedFov = currentFov > 20 ? currentFov : 75;

    this.state.isReady = false;
    this.state.isActivating = true;
    this.state.animTimer = 0;
    this.cutsceneTimer = 0;
    this.introCompleteFired = false;
    this.impactFired = false;
    this.impactFlashOpacity = 0;
    this.trauma = 0;
    this.droneStarted = false;
    this.bassStingTriggered = false;
    this.lastHeartbeatPulseIdx = -1;
    this.onSelfBonkImpactCallback = onSelfBonkImpact ?? null;
    this.onSequenceCompleteCallback = onSequenceComplete ?? null;
    return true;
  }

  /**
   * Part 2 Continuation Hook (fires at t = 4.60s right after the ground stare,
   * bat stare, and dripping crimson subtitle finish). Keeps isActivating = true
   * seamlessly through t = 5.55s into The Activation Smack & Pumped-Up State.
   */
  public onCinematicIntroComplete(): void {
    this.introCompleteFired = true;
    this.state.isActivating = true;
  }

  private finalizePumpedUpActivation(): void {
    this.stopTensionDrone();
    this.state.isActivating = false;
    this.state.isActive = true;
    this.state.activeDuration = 25.0;
    this.state.charge = 100;
    this.state.isReady = false;
    this.state.animTimer = 0;
    this.cutsceneTimer = 0;
    this.fovOffset = 5.0; // Settles to 80° (75° + 5°) during Pumped-Up mode
    this.vignetteOpacity = 0.72;
    const cb = this.onSequenceCompleteCallback;
    this.onSequenceCompleteCallback = null;
    this.onSelfBonkImpactCallback = null;
    cb?.();
  }

  public update(
    rawDt: number,
    simDt: number,
    scene: THREE.Scene,
    playerPos: THREE.Vector3,
    audioCtx: AudioContext | null,
    muted: boolean,
  ): void {
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - rawDt / TRAUMA_DECAY_DUR);
    }

    if (this.state.isActivating) {
      this.cutsceneTimer = Math.min(SEQUENCE_END, this.cutsceneTimer + rawDt);
      this.state.animTimer = this.cutsceneTimer;
      const t = this.cutsceneTimer;

      // Part 1 Audio (0.00s - 4.60s): Tension drone, heartbeats & subtitle bass sting
      if (!muted && audioCtx && audioCtx.state === 'running') {
        if (!this.droneStarted && t < IMPACT_TIME) {
          this.droneStarted = true;
          this.startTensionDrone(audioCtx);
        }
        const pulseIdx = Math.floor(t / 0.65);
        if (pulseIdx !== this.lastHeartbeatPulseIdx && t < BEAT2_END) {
          this.lastHeartbeatPulseIdx = pulseIdx;
          this.playHeartbeatThump(audioCtx);
        }
        if (!this.bassStingTriggered && t >= SUBTITLE_REVEAL_TIME) {
          this.bassStingTriggered = true;
          this.playSubtitleBassSting(audioCtx);
        }
      }

      // Fire Part 2 transition hook cleanly at t = 4.60s
      if (!this.introCompleteFired && t >= INTRO_COMPLETE_TIME) {
        this.onCinematicIntroComplete();
      }

      // Fire Exact Self-Bonk Impact Frame Events once at t = 4.96s
      if (!this.impactFired && t >= IMPACT_TIME) {
        this.impactFired = true;
        this.stopTensionDrone();
        this.trauma = 1.0;
        this.impactFlashOpacity = 0.85;
        this.vignetteOpacity = 0.72;
        if (!muted && audioCtx && audioCtx.state === 'running') {
          this.playActivationSmackAudio(audioCtx);
        }
        this.spawnShockwave(scene, playerPos);
        this.onSelfBonkImpactCallback?.();
      }

      // Fade initial white-gold impact flash into fiery crimson-orange burst -> persistent aura
      if (this.impactFired) {
        const sinceImpact = t - IMPACT_TIME;
        if (sinceImpact < 0.05) {
          this.impactFlashOpacity = 0.85;
        } else {
          const burstU = Math.min(1, (sinceImpact - 0.05) / 0.54);
          this.impactFlashOpacity = THREE.MathUtils.lerp(0.85, 0.0, easeOutCubic(burstU));
        }
      }

      if (t >= SEQUENCE_END) {
        this.finalizePumpedUpActivation();
      }
    } else if (this.state.isActive) {
      if (this.impactFlashOpacity > 0) {
        this.impactFlashOpacity = Math.max(0, this.impactFlashOpacity - rawDt * 4);
      }
      const drainPerSec = 100 / this.state.activeDuration;
      this.state.charge = Math.max(0, this.state.charge - drainPerSec * simDt);
      this.fovOffset = THREE.MathUtils.lerp(this.fovOffset, 5.0, 1 - Math.exp(-rawDt * 8));
      this.vignetteOpacity = THREE.MathUtils.lerp(this.vignetteOpacity, 0.72, 1 - Math.exp(-rawDt * 6));

      if (this.state.charge <= 0) {
        this.state.charge = 0;
        this.state.isActive = false;
        this.state.isReady = false;
      }
    } else {
      if (this.impactFlashOpacity > 0) {
        this.impactFlashOpacity = Math.max(0, this.impactFlashOpacity - rawDt * 4);
      }
      this.fovOffset = THREE.MathUtils.lerp(this.fovOffset, 0, 1 - Math.exp(-rawDt * 6));
      this.vignetteOpacity = THREE.MathUtils.lerp(this.vignetteOpacity, 0, 1 - Math.exp(-rawDt * 6));
      if (Math.abs(this.fovOffset) < 0.01) this.fovOffset = 0;
      if (this.vignetteOpacity < 0.005) this.vignetteOpacity = 0;
    }

    this.updateEffects(simDt, scene);
  }

  /**
   * Computes exact camera pitch, yaw, roll, slump height, FOV curve & trauma shake
   * across Part 1 (0.00s - 4.60s) and Part 2 (4.60s - 5.55s).
   */
  public getCinematicCamera(): AwakeningCinematicCamera {
    if (!this.state.isActivating) {
      return {
        active: false,
        lockInput: false,
        pitch: this.savedCameraPitch,
        yaw: this.savedCameraYaw,
        roll: 0,
        fov: this.savedFov,
        heightOffset: 0,
        shakeX: 0,
        shakeY: 0,
      };
    }

    const t = this.cutsceneTimer;
    let pitch: number;
    let yaw: number;
    let roll = 0;
    let heightOffset = 0;
    let fov: number;

    if (t < BEAT1_END) {
      // Beat 1: Look down at ground in defeat, slump -0.14m, FOV -> 68°
      const pEase = easeInOutCubic(t / BEAT1_PITCH_END);
      const fovEase = easeInOutCubic(t / BEAT1_END);
      pitch = THREE.MathUtils.lerp(this.savedCameraPitch, -0.78, pEase);
      yaw = this.savedCameraYaw;
      heightOffset = THREE.MathUtils.lerp(0, -0.14, pEase);
      fov = THREE.MathUtils.lerp(this.savedFov, 68, fovEase);
    } else if (t < INTRO_COMPLETE_TIME) {
      // Beat 2 & 3: Raise pitch -> -0.18, turn slightly right (-0.14 rad), zoom FOV 68° -> 62°
      const camEase = easeInOutCubic((t - BEAT1_END) / (BEAT2_CAM_END - BEAT1_END));
      const zoomEase = easeInOutCubic((t - BEAT1_END) / (BEAT2_END - BEAT1_END));
      pitch = THREE.MathUtils.lerp(-0.78, -0.18, camEase);
      yaw = THREE.MathUtils.lerp(this.savedCameraYaw, this.savedCameraYaw - 0.14, camEase);
      heightOffset = THREE.MathUtils.lerp(-0.14, 0, camEase);
      fov = THREE.MathUtils.lerp(68, 62, zoomEase);
    } else if (t < IMPACT_TIME) {
      // Part 2 Wind-Up (4.60s -> 4.96s): Fast cubic snap back to horizon + anime FOV 62° -> 58° zoom-in
      const snapU = easeOutCubic((t - INTRO_COMPLETE_TIME) / (CAM_SNAP_END - INTRO_COMPLETE_TIME));
      pitch = THREE.MathUtils.lerp(-0.18, this.savedCameraPitch, snapU);
      yaw = THREE.MathUtils.lerp(this.savedCameraYaw - 0.14, this.savedCameraYaw, snapU);
      fov = THREE.MathUtils.lerp(62, 58, snapU);
    } else {
      // Part 2 Impact & Rebound (4.96s -> 5.55s): -0.16 rad head-snap + +0.05 roll -> spring recovery; FOV 86° -> 80°
      yaw = this.savedCameraYaw;
      const snapRecU = Math.min(1, (t - IMPACT_TIME) / (HEAD_SNAP_RECOVER_END - IMPACT_TIME));
      const snapEase = easeOutCubic(snapRecU);
      pitch = THREE.MathUtils.lerp(this.savedCameraPitch - 0.16, this.savedCameraPitch, snapEase);
      roll = THREE.MathUtils.lerp(0.05, 0, snapEase);

      const fovRecU = Math.min(1, (t - IMPACT_TIME) / (SEQUENCE_END - IMPACT_TIME));
      fov = THREE.MathUtils.lerp(86, 80, easeOutCubic(fovRecU));
    }

    const shakeMag = this.trauma * this.trauma * 0.085;
    const shakeX = shakeMag > 0.0001 ? (Math.random() * 2 - 1) * shakeMag : 0;
    const shakeY = shakeMag > 0.0001 ? (Math.random() * 2 - 1) * shakeMag : 0;

    return {
      active: true,
      lockInput: true,
      pitch,
      yaw,
      roll,
      fov,
      heightOffset,
      shakeX,
      shakeY,
    };
  }

  /**
   * Bat barrel emissive curve:
   * Beat 2 (2.00s - 4.60s): 0x330000 -> 0x880808 subtle crimson glint.
   * Part 2 (4.60s - 5.55s): bright fiery crimson-orange 0xFF3300 glow.
   */
  public getBatCrimsonEmissive(): THREE.Color | null {
    if (!this.state.isActivating || this.cutsceneTimer < BEAT1_END) {
      return null;
    }
    const t = this.cutsceneTimer;
    if (t < INTRO_COMPLETE_TIME) {
      const rampIn = easeOutCubic(Math.min(1, (t - BEAT1_END) / 0.25));
      const u = easeInOutCubic((t - BEAT1_END) / (BEAT2_END - BEAT1_END));
      const pulse = 0.92 + 0.08 * Math.sin((t - BEAT1_END) * 7.5);
      const r = THREE.MathUtils.lerp(0x33 / 255, 0x88 / 255, u) * rampIn * pulse;
      const g = THREE.MathUtils.lerp(0, 0x08 / 255, u) * rampIn * pulse;
      const b = THREE.MathUtils.lerp(0, 0x08 / 255, u) * rampIn * pulse;
      return this.glintColor.setRGB(r, g, b);
    }

    const flareU = easeOutCubic(Math.min(1, (t - INTRO_COMPLETE_TIME) / 0.14));
    const r = THREE.MathUtils.lerp(0x88 / 255, 1.0, flareU);
    const g = THREE.MathUtils.lerp(0x08 / 255, 0x33 / 255, flareU);
    const b = THREE.MathUtils.lerp(0x08 / 255, 0.0, flareU);
    return this.glintColor.setRGB(r, g, b);
  }

  public getBatEmissiveIntensity(): number {
    if (!this.state.isActivating) return 1.0;
    if (this.cutsceneTimer < INTRO_COMPLETE_TIME) return 1.0;
    const flareU = easeOutCubic(Math.min(1, (this.cutsceneTimer - INTRO_COMPLETE_TIME) / 0.14));
    return THREE.MathUtils.lerp(1.0, 1.4, flareU);
  }

  /**
   * Computes viewmodel hand & bat poses across Part 1 (0.00s - 4.60s) and
   * Part 2 (4.60s - 5.55s: High Overhead Wind-Up -> Self-Bonk Slam -> Rebound -> Ready Stance).
   * Oriented cleanly for rightWeaponSocket (+70° Z socket, +Y barrel).
   */
  public getViewmodelPose(): AwakeningViewmodelPose {
    if (!this.state.isActivating) {
      return {
        active: false,
        rightPosX: 0,
        rightPosY: 0,
        rightPosZ: 0,
        rightRotX: 0,
        rightRotY: 0,
        rightRotZ: 0,
        leftPosX: 0,
        leftPosY: 0,
        leftPosZ: 0,
        leftRotX: 0,
        leftRotY: 0,
        leftRotZ: 0,
        leftPose: 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: 0,
      };
    }

    const t = this.cutsceneTimer;

    // Beat 1 Defeated Hang Pose
    const hangRPos = { x: 0.36, y: -0.32, z: -0.45 };
    const hangRRot = { x: -0.65, y: 1.08, z: -2.78 };
    const hangLPos = { x: -0.34, y: -0.34, z: -0.46 };
    const hangLRot = { x: -1.62, y: 0.28, z: -0.22 };

    // Beat 2 Hero Bat Inspection Pose
    const inspectRPos = { x: 0.16, y: -0.15, z: -0.36 };
    const inspectRRot = { x: -0.88, y: 0.38, z: -0.72 };
    const inspectLPos = { x: -0.24, y: -0.22, z: -0.44 };
    const inspectLRot = { x: -0.98, y: 0.44, z: -0.26 };

    const rTremor = Math.sin(t * 38) * 0.0025;
    const lTremor = Math.cos(t * 42) * 0.0025;

    if (t < BEAT1_END) {
      const dropU = easeInOutCubic(t / BEAT1_PITCH_END);
      const readyRPos = { x: 0.29, y: -0.26, z: -0.44 };
      const readyRRot = { x: -0.38, y: 0.95, z: -1.05 };
      const readyLPos = { x: -0.34, y: -0.24, z: -0.5 };
      const readyLRot = { x: -1.08, y: 0.36, z: -0.42 };

      return {
        active: true,
        rightPosX: THREE.MathUtils.lerp(readyRPos.x, hangRPos.x, dropU) + rTremor,
        rightPosY: THREE.MathUtils.lerp(readyRPos.y, hangRPos.y, dropU) + rTremor * 0.65,
        rightPosZ: THREE.MathUtils.lerp(readyRPos.z, hangRPos.z, dropU),
        rightRotX: THREE.MathUtils.lerp(readyRRot.x, hangRRot.x, dropU),
        rightRotY: THREE.MathUtils.lerp(readyRRot.y, hangRRot.y, dropU),
        rightRotZ: THREE.MathUtils.lerp(readyRRot.z, hangRRot.z, dropU),
        leftPosX: THREE.MathUtils.lerp(readyLPos.x, hangLPos.x, dropU) + lTremor,
        leftPosY: THREE.MathUtils.lerp(readyLPos.y, hangLPos.y, dropU) + lTremor * 0.65,
        leftPosZ: THREE.MathUtils.lerp(readyLPos.z, hangLPos.z, dropU),
        leftRotX: THREE.MathUtils.lerp(readyLRot.x, hangLRot.x, dropU),
        leftRotY: THREE.MathUtils.lerp(readyLRot.y, hangLRot.y, dropU),
        leftRotZ: THREE.MathUtils.lerp(readyLRot.z, hangLRot.z, dropU),
        leftPose: 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: 4 + 4 * dropU,
      };
    }

    if (t < INTRO_COMPLETE_TIME) {
      const raiseU = easeInOutCubic((t - BEAT1_END) / 0.65);
      const subtleBreath = Math.sin((t - BEAT1_END) * 1.4) * 0.035;
      const fineTension = Math.sin(t * 28) * 0.0012;

      return {
        active: true,
        rightPosX: THREE.MathUtils.lerp(hangRPos.x, inspectRPos.x, raiseU) + fineTension,
        rightPosY: THREE.MathUtils.lerp(hangRPos.y, inspectRPos.y, raiseU) + subtleBreath * 0.12,
        rightPosZ: THREE.MathUtils.lerp(hangRPos.z, inspectRPos.z, raiseU),
        rightRotX: THREE.MathUtils.lerp(hangRRot.x, inspectRRot.x, raiseU),
        rightRotY: THREE.MathUtils.lerp(hangRRot.y, inspectRRot.y + subtleBreath, raiseU),
        rightRotZ: THREE.MathUtils.lerp(hangRRot.z, inspectRRot.z, raiseU),
        leftPosX: THREE.MathUtils.lerp(hangLPos.x, inspectLPos.x, raiseU) - fineTension,
        leftPosY: THREE.MathUtils.lerp(hangLPos.y, inspectLPos.y, raiseU) - subtleBreath * 0.08,
        leftPosZ: THREE.MathUtils.lerp(hangLPos.z, inspectLPos.z, raiseU),
        leftRotX: THREE.MathUtils.lerp(hangLRot.x, inspectLRot.x, raiseU),
        leftRotY: THREE.MathUtils.lerp(hangLRot.y, inspectLRot.y, raiseU),
        leftRotZ: THREE.MathUtils.lerp(hangLRot.z, inspectLRot.z, raiseU),
        leftPose: raiseU > 0.35 ? 'OPEN_REACH' : 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: THREE.MathUtils.lerp(8, 10, raiseU),
      };
    }

    // Part 2 Key Poses (calibrated so the +70° Z socket cocks the bat high overhead & smashes upper-center forehead)
    const windRPos = { x: 0.24, y: -0.06, z: -0.39 };
    const windRRot = { x: 0.34, y: -0.22, z: -0.74 };
    const windLPos = { x: -0.36, y: -0.3, z: -0.48 };
    const windLRot = { x: -1.36, y: 0.22, z: -0.35 };

    // Forehead Impact Pose: thick barrel lands dead upper-center viewport (x ~ 0, y ~ +0.09, z ~ -0.22)
    const hitRPos = { x: 0.22, y: -0.04, z: -0.31 };
    const hitRRot = { x: 0.52, y: 0.14, z: -0.18 };
    const hitLPos = { x: -0.34, y: -0.28, z: -0.47 };
    const hitLRot = { x: -1.3, y: 0.26, z: -0.3 };

    // Rebound Apex before sweeping down to energized Pumped-Up Ready Stance
    const bounceRPos = { x: 0.27, y: 0.04, z: -0.36 };
    const bounceRRot = { x: 0.12, y: 0.52, z: -0.62 };

    // Energized Pumped-Up Ready Stance (matches viewmodel idle seamlessly at t = 5.55s)
    const pumpedRPos = { x: 0.29, y: -0.26, z: -0.44 };
    const pumpedRRot = { x: -0.38, y: 0.95, z: -1.05 };
    const pumpedLPos = { x: -0.32, y: -0.22, z: -0.48 };
    const pumpedLRot = { x: -1.08, y: 0.36, z: -0.42 };

    // 1. High Overhead Wind-Up (4.60s -> 4.85s)
    if (t < WINDUP_END) {
      const wU = easeOutCubic((t - INTRO_COMPLETE_TIME) / (WINDUP_END - INTRO_COMPLETE_TIME));
      return {
        active: true,
        rightPosX: THREE.MathUtils.lerp(inspectRPos.x, windRPos.x, wU),
        rightPosY: THREE.MathUtils.lerp(inspectRPos.y, windRPos.y, wU),
        rightPosZ: THREE.MathUtils.lerp(inspectRPos.z, windRPos.z, wU),
        rightRotX: THREE.MathUtils.lerp(inspectRRot.x, windRRot.x, wU),
        rightRotY: THREE.MathUtils.lerp(inspectRRot.y, windRRot.y, wU),
        rightRotZ: THREE.MathUtils.lerp(inspectRRot.z, windRRot.z, wU),
        leftPosX: THREE.MathUtils.lerp(inspectLPos.x, windLPos.x, wU),
        leftPosY: THREE.MathUtils.lerp(inspectLPos.y, windLPos.y, wU),
        leftPosZ: THREE.MathUtils.lerp(inspectLPos.z, windLPos.z, wU),
        leftRotX: THREE.MathUtils.lerp(inspectLRot.x, windLRot.x, wU),
        leftRotY: THREE.MathUtils.lerp(inspectLRot.y, windLRot.y, wU),
        leftRotZ: THREE.MathUtils.lerp(inspectLRot.z, windLRot.z, wU),
        leftPose: 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: 11,
      };
    }

    // 2. Exponential Bat Slam into Forehead (4.85s -> 4.96s)
    if (t < IMPACT_TIME) {
      const sU = easeInExpo((t - WINDUP_END) / (IMPACT_TIME - WINDUP_END));
      return {
        active: true,
        rightPosX: THREE.MathUtils.lerp(windRPos.x, hitRPos.x, sU),
        rightPosY: THREE.MathUtils.lerp(windRPos.y, hitRPos.y, sU),
        rightPosZ: THREE.MathUtils.lerp(windRPos.z, hitRPos.z, sU),
        rightRotX: THREE.MathUtils.lerp(windRRot.x, hitRRot.x, sU),
        rightRotY: THREE.MathUtils.lerp(windRRot.y, hitRRot.y, sU),
        rightRotZ: THREE.MathUtils.lerp(windRRot.z, hitRRot.z, sU),
        leftPosX: THREE.MathUtils.lerp(windLPos.x, hitLPos.x, sU),
        leftPosY: THREE.MathUtils.lerp(windLPos.y, hitLPos.y, sU),
        leftPosZ: THREE.MathUtils.lerp(windLPos.z, hitLPos.z, sU),
        leftRotX: THREE.MathUtils.lerp(windLRot.x, hitLRot.x, sU),
        leftRotY: THREE.MathUtils.lerp(windLRot.y, hitLRot.y, sU),
        leftRotZ: THREE.MathUtils.lerp(windLRot.z, hitLRot.z, sU),
        leftPose: 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: 14,
      };
    }

    // 3. 60ms Forehead Contact Hold with ±0.01 Micro-Vibration (4.96s -> 5.02s)
    if (t < HOLD_END) {
      const vibX = Math.sin(t * 210) * 0.01;
      const vibY = Math.cos(t * 240) * 0.01;
      return {
        active: true,
        rightPosX: hitRPos.x + vibX,
        rightPosY: hitRPos.y + vibY,
        rightPosZ: hitRPos.z,
        rightRotX: hitRRot.x,
        rightRotY: hitRRot.y,
        rightRotZ: hitRRot.z,
        leftPosX: hitLPos.x,
        leftPosY: hitLPos.y,
        leftPosZ: hitLPos.z,
        leftRotX: hitLRot.x,
        leftRotY: hitLRot.y,
        leftRotZ: hitLRot.z,
        leftPose: 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: 14,
      };
    }

    // 4. Rebound Bounce & Sweep Down to Energized Pumped-Up Ready Stance (5.02s -> 5.55s)
    const bounceEnd = 5.18;
    if (t < bounceEnd) {
      const bU = easeOutCubic((t - HOLD_END) / (bounceEnd - HOLD_END));
      return {
        active: true,
        rightPosX: THREE.MathUtils.lerp(hitRPos.x, bounceRPos.x, bU),
        rightPosY: THREE.MathUtils.lerp(hitRPos.y, bounceRPos.y, bU),
        rightPosZ: THREE.MathUtils.lerp(hitRPos.z, bounceRPos.z, bU),
        rightRotX: THREE.MathUtils.lerp(hitRRot.x, bounceRRot.x, bU),
        rightRotY: THREE.MathUtils.lerp(hitRRot.y, bounceRRot.y, bU),
        rightRotZ: THREE.MathUtils.lerp(hitRRot.z, bounceRRot.z, bU),
        leftPosX: THREE.MathUtils.lerp(hitLPos.x, pumpedLPos.x, bU * 0.4),
        leftPosY: THREE.MathUtils.lerp(hitLPos.y, pumpedLPos.y, bU * 0.4),
        leftPosZ: THREE.MathUtils.lerp(hitLPos.z, pumpedLPos.z, bU * 0.4),
        leftRotX: THREE.MathUtils.lerp(hitLRot.x, pumpedLRot.x, bU * 0.4),
        leftRotY: THREE.MathUtils.lerp(hitLRot.y, pumpedLRot.y, bU * 0.4),
        leftRotZ: THREE.MathUtils.lerp(hitLRot.z, pumpedLRot.z, bU * 0.4),
        leftPose: 'FIST_CLENCH',
        rightPose: 'WEAPON_GRIP',
        exertion: 12,
      };
    }

    const dropU = easeInOutCubic((t - bounceEnd) / (SEQUENCE_END - bounceEnd));
    return {
      active: true,
      rightPosX: THREE.MathUtils.lerp(bounceRPos.x, pumpedRPos.x, dropU),
      rightPosY: THREE.MathUtils.lerp(bounceRPos.y, pumpedRPos.y, dropU),
      rightPosZ: THREE.MathUtils.lerp(bounceRPos.z, pumpedRPos.z, dropU),
      rightRotX: THREE.MathUtils.lerp(bounceRRot.x, pumpedRRot.x, dropU),
      rightRotY: THREE.MathUtils.lerp(bounceRRot.y, pumpedRRot.y, dropU),
      rightRotZ: THREE.MathUtils.lerp(bounceRRot.z, pumpedRRot.z, dropU),
      leftPosX: THREE.MathUtils.lerp(hitLPos.x, pumpedLPos.x, 0.4 + 0.6 * dropU),
      leftPosY: THREE.MathUtils.lerp(hitLPos.y, pumpedLPos.y, 0.4 + 0.6 * dropU),
      leftPosZ: THREE.MathUtils.lerp(hitLPos.z, pumpedLPos.z, 0.4 + 0.6 * dropU),
      leftRotX: THREE.MathUtils.lerp(hitLRot.x, pumpedLRot.x, 0.4 + 0.6 * dropU),
      leftRotY: THREE.MathUtils.lerp(hitLRot.y, pumpedLRot.y, 0.4 + 0.6 * dropU),
      leftRotZ: THREE.MathUtils.lerp(hitLRot.z, pumpedLRot.z, 0.4 + 0.6 * dropU),
      leftPose: 'FIST_CLENCH',
      rightPose: 'WEAPON_GRIP',
      exertion: THREE.MathUtils.lerp(12, 8, dropU),
    };
  }

  public getFovOffset(): number {
    return this.fovOffset;
  }

  public getMoveSpeedMultiplier(): number {
    return this.state.isActive ? 1.2 : 1.0; // +20% sprint/movement speed
  }

  public getSwingSpeedMultiplier(): number {
    return this.state.isActive ? 1.3 : 1.0; // +30% bat swing speed
  }

  public getDamageMultiplier(): number {
    return this.state.isActive ? 1.4 : 1.0; // +40% bat damage
  }

  public getKnockbackMultiplier(): number {
    return this.state.isActive ? 1.4 : 1.0; // +40% bat knockback
  }

  public getHitstopBonus(): number {
    return this.state.isActive ? 0.025 : 0;
  }

  public getHudSnapshot(): AwakeningHudSnapshot {
    const t = this.cutsceneTimer;
    let letterboxProgress = 0;
    let desaturateProgress = 0;
    let vignetteDarkOpacity = 0;
    let hudDimOpacity = 1;

    if (this.state.isActivating) {
      if (t < HUD_RESTORE_START) {
        letterboxProgress = easeOutCubic(Math.min(1, t / LETTERBOX_SLIDE_IN_DUR));
        desaturateProgress = Math.min(1, t / LETTERBOX_SLIDE_IN_DUR);
        vignetteDarkOpacity = Math.min(1, t / 0.45);
        hudDimOpacity = 0.15;
      } else {
        const retractU = Math.min(1, (t - HUD_RESTORE_START) / LETTERBOX_RETRACT_DUR);
        const restoreU = Math.min(1, (t - HUD_RESTORE_START) / (SEQUENCE_END - HUD_RESTORE_START));
        letterboxProgress = 1 - easeOutCubic(retractU);
        desaturateProgress = 1 - easeOutCubic(restoreU);
        vignetteDarkOpacity = 1 - easeOutCubic(restoreU);
        hudDimOpacity = THREE.MathUtils.lerp(0.15, 1.0, easeOutCubic(restoreU));
      }
    }

    const subtitleVisible =
      this.state.isActivating && t >= SUBTITLE_REVEAL_TIME && t < SUBTITLE_EXIT_END;
    const subtitleFlashProgress =
      this.state.isActivating && t >= INTRO_COMPLETE_TIME && t < SUBTITLE_FLASH_END
        ? Math.sin(((t - INTRO_COMPLETE_TIME) / (SUBTITLE_FLASH_END - INTRO_COMPLETE_TIME)) * Math.PI)
        : 0;
    const subtitleExitProgress =
      this.state.isActivating && t >= SUBTITLE_FLASH_END
        ? Math.min(1, (t - SUBTITLE_FLASH_END) / (SUBTITLE_EXIT_END - SUBTITLE_FLASH_END))
        : 0;

    let impactOverlayMode: 'none' | 'whiteGold' | 'crimsonBurst' = 'none';
    let impactOverlayOpacity = 0;
    if (this.state.isActivating && this.impactFired) {
      const sinceImpact = t - IMPACT_TIME;
      if (sinceImpact < 0.05) {
        impactOverlayMode = 'whiteGold';
        impactOverlayOpacity = 1;
      } else if (sinceImpact < 0.59) {
        impactOverlayMode = 'crimsonBurst';
        impactOverlayOpacity = Math.max(0, 1 - easeOutCubic((sinceImpact - 0.05) / 0.54));
      }
    }

    return {
      charge: Math.round(this.state.charge),
      isReady: this.state.isReady,
      isActivating: this.state.isActivating,
      isActive: this.state.isActive,
      remainingSeconds: this.state.isActive
        ? Number(((this.state.charge / 100) * this.state.activeDuration).toFixed(1))
        : 0,
      impactFlashOpacity: Number(this.impactFlashOpacity.toFixed(3)),
      impactOverlayMode,
      impactOverlayOpacity: Number(impactOverlayOpacity.toFixed(3)),
      vignetteOpacity: Number(this.vignetteOpacity.toFixed(3)),
      cinematicActive: this.state.isActivating,
      cutsceneTime: Number(t.toFixed(3)),
      letterboxProgress: Number(letterboxProgress.toFixed(3)),
      vignetteDarkOpacity: Number(vignetteDarkOpacity.toFixed(3)),
      desaturateProgress: Number(desaturateProgress.toFixed(3)),
      hudDimOpacity: Number(hudDimOpacity.toFixed(3)),
      subtitleVisible,
      subtitleElapsed: this.state.isActivating ? Number(Math.max(0, t - SUBTITLE_REVEAL_TIME).toFixed(3)) : 0,
      subtitleFlashProgress: Number(subtitleFlashProgress.toFixed(3)),
      subtitleExitProgress: Number(subtitleExitProgress.toFixed(3)),
    };
  }

  // ===========================================================================
  // PROCEDURAL 3D SHOCKWAVE RINGS & 24 EMBER SPARK CUBES (SECTION 3)
  // ===========================================================================
  public spawnShockwave(scene: THREE.Scene, origin: THREE.Vector3): void {
    // Outer Ground Blast Ring: RingGeometry(0.5, 1.4, 40) @ y + 0.15
    const primaryGeo = new THREE.RingGeometry(0.5, 1.4, 40);
    const primaryMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const primaryRing = new THREE.Mesh(primaryGeo, primaryMat);
    primaryRing.rotation.x = -Math.PI / 2;
    primaryRing.position.set(origin.x, origin.y + 0.15, origin.z);
    scene.add(primaryRing);

    // Inner Golden Pressure Ring: RingGeometry(0.3, 0.85, 40) @ y + 0.45
    const secondaryGeo = new THREE.RingGeometry(0.3, 0.85, 40);
    const secondaryMat = new THREE.MeshBasicMaterial({
      color: 0xffd93b,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const secondaryRing = new THREE.Mesh(secondaryGeo, secondaryMat);
    secondaryRing.rotation.x = -Math.PI / 2;
    secondaryRing.position.set(origin.x, origin.y + 0.45, origin.z);
    scene.add(secondaryRing);

    this.rings.push({
      primaryRing,
      primaryMat,
      secondaryRing,
      secondaryMat,
      age: 0,
      duration: 0.5,
    });

    // 24 Flying Ember & Debris Sparks (0.07m cubes, alternating 0xFF4500 & 0xFFC800, 8-15 m/s radial, +3..+7 m/s Y)
    const colors = [0xff4500, 0xffc800];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const speed = 8.0 + Math.random() * 7.0;
      const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % 2],
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(origin.x + Math.cos(angle) * 0.4, origin.y + 0.55, origin.z + Math.sin(angle) * 0.4);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      scene.add(mesh);

      this.embers.push({
        mesh,
        mat,
        vel: new THREE.Vector3(Math.cos(angle) * speed, 3.0 + Math.random() * 4.0, Math.sin(angle) * speed),
        age: 0,
        duration: 0.6,
      });
    }
  }

  private updateEffects(dt: number, scene: THREE.Scene): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const u = Math.min(1, r.age / r.duration);
      const scale = THREE.MathUtils.lerp(1.0, 10.5, easeOutCubic(u));
      const opacity = Math.max(0, 1.0 - u);

      r.primaryRing.scale.setScalar(scale);
      r.primaryMat.opacity = opacity;
      r.secondaryRing.scale.setScalar(scale);
      r.secondaryMat.opacity = opacity;

      if (r.age >= r.duration) {
        scene.remove(r.primaryRing);
        scene.remove(r.secondaryRing);
        r.primaryRing.geometry.dispose();
        r.primaryMat.dispose();
        r.secondaryRing.geometry.dispose();
        r.secondaryMat.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.age += dt;
      e.vel.y -= 16.0 * dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      e.mesh.rotation.x += dt * 10;
      e.mesh.rotation.y += dt * 8;
      if (e.mesh.position.y < 0.04) {
        e.mesh.position.y = 0.04;
        e.vel.y *= -0.3;
      }
      const u = Math.min(1, e.age / e.duration);
      e.mat.opacity = Math.max(0, 1.0 - u);

      if (e.age >= e.duration) {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mat.dispose();
        this.embers.splice(i, 1);
      }
    }
  }

  public clearEffects(scene: THREE.Scene): void {
    for (const r of this.rings) {
      scene.remove(r.primaryRing);
      scene.remove(r.secondaryRing);
      r.primaryRing.geometry.dispose();
      r.primaryMat.dispose();
      r.secondaryRing.geometry.dispose();
      r.secondaryMat.dispose();
    }
    this.rings.length = 0;

    for (const e of this.embers) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mat.dispose();
    }
    this.embers.length = 0;
  }

  // ===========================================================================
  // PROCEDURAL WEB AUDIO: DRONE, HEARTBEAT, SUBTITLE STING & BONK SHOCKWAVE
  // ===========================================================================
  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private startTensionDrone(ctx: AudioContext): void {
    this.stopTensionDrone();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(0.32, now + 0.45);
    master.connect(ctx.destination);
    this.droneMasterGain = master;

    const osc55 = ctx.createOscillator();
    osc55.type = 'sine';
    osc55.frequency.setValueAtTime(55, now);
    const gain55 = ctx.createGain();
    gain55.gain.setValueAtTime(0.62, now);
    osc55.connect(gain55);
    gain55.connect(master);
    osc55.start(now);

    const osc110 = ctx.createOscillator();
    osc110.type = 'triangle';
    osc110.frequency.setValueAtTime(82.4, now);
    const lp110 = ctx.createBiquadFilter();
    lp110.type = 'lowpass';
    lp110.frequency.setValueAtTime(160, now);
    const gain110 = ctx.createGain();
    gain110.gain.setValueAtTime(0.18, now);
    osc110.connect(lp110);
    lp110.connect(gain110);
    gain110.connect(master);
    osc110.start(now);

    this.droneOscs = [osc55, osc110];

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.ensureNoiseBuffer(ctx);
    noiseSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.setValueAtTime(220, now);
    windFilter.Q.value = 1.6;

    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.28, now);

    noiseSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noiseSrc.start(now);
    this.droneNoiseSrc = noiseSrc;
  }

  private playHeartbeatThump(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const triggerLubDub = (offset: number, peakFreq: number, peakGain: number) => {
      const t0 = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(peakFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(34, t0 + 0.14);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    };

    triggerLubDub(0, 64, 0.36);
    triggerLubDub(0.14, 54, 0.24);
  }

  private playSubtitleBassSting(ctx: AudioContext): void {
    const now = ctx.currentTime;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(65, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.65);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.7, now + 0.018);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.88);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.ensureNoiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(240, now);
    lp.frequency.exponentialRampToValueAtTime(75, now + 0.35);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.32, now + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    noiseSrc.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.42);
  }

  public stopTensionDrone(): void {
    for (const osc of this.droneOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // already stopped
      }
    }
    this.droneOscs = [];

    if (this.droneNoiseSrc) {
      try {
        this.droneNoiseSrc.stop();
        this.droneNoiseSrc.disconnect();
      } catch {
        // already stopped
      }
      this.droneNoiseSrc = null;
    }

    if (this.droneMasterGain) {
      try {
        this.droneMasterGain.disconnect();
      } catch {
        // already disconnected
      }
      this.droneMasterGain = null;
    }
  }

  /**
   * Procedural Web Audio BONK! + Anime Shockwave Sub-Drop (t = 4.96s):
   * - Triangle skull-bonk 260 Hz -> 110 Hz (0.15s) + hollow sine 520 Hz -> 290 Hz via 440 Hz bandpass
   * - Layered simultaneously with 130 Hz -> 28 Hz sub-drop (0.55s) + low-pass filtered white noise burst
   */
  public playActivationSmackAudio(ctx: AudioContext): void {
    const now = ctx.currentTime;

    const bonkFilter = ctx.createBiquadFilter();
    bonkFilter.type = 'bandpass';
    bonkFilter.frequency.setValueAtTime(440, now);
    bonkFilter.Q.value = 4.2;

    const bonkGain = ctx.createGain();
    bonkGain.gain.setValueAtTime(0.001, now);
    bonkGain.gain.linearRampToValueAtTime(0.95, now + 0.004);
    bonkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.165);

    bonkFilter.connect(bonkGain);
    bonkGain.connect(ctx.destination);

    // Resonant wooden bat skull-bonk (260 -> 110 Hz over 0.15s)
    const primaryWood = ctx.createOscillator();
    primaryWood.type = 'triangle';
    primaryWood.frequency.setValueAtTime(260, now);
    primaryWood.frequency.exponentialRampToValueAtTime(110, now + 0.15);
    primaryWood.connect(bonkFilter);
    primaryWood.start(now);
    primaryWood.stop(now + 0.17);

    // Hollow wooden overtone (520 -> 290 Hz)
    const overtoneWood = ctx.createOscillator();
    overtoneWood.type = 'sine';
    overtoneWood.frequency.setValueAtTime(520, now);
    overtoneWood.frequency.exponentialRampToValueAtTime(290, now + 0.12);
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.62, now);
    overtoneWood.connect(overtoneGain);
    overtoneGain.connect(bonkFilter);
    overtoneWood.start(now);
    overtoneWood.stop(now + 0.15);

    // Massive anime bass shockwave explosion (130 -> 28 Hz over 0.55s)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.55);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.75, now + 0.015);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.57);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.6);

    // Low-pass filtered white noise shockwave burst
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.ensureNoiseBuffer(ctx);
    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(420, now);
    lpFilter.frequency.exponentialRampToValueAtTime(95, now + 0.48);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.42, now + 0.014);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    noiseSrc.connect(lpFilter);
    lpFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.52);
  }
}
