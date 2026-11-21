export type ParkourStateId =
  | 'GROUNDED'
  | 'AIRBORNE'
  | 'WALL_RUN_LEFT'
  | 'WALL_RUN_RIGHT'
  | 'WALL_SCRAMBLE'
  | 'LEDGE_CATCH'
  | 'MUSCLE_UP'
  | 'SPEED_VAULT'
  | 'KONG_VAULT'
  | 'SLIDE'
  | 'PARKOUR_ROLL'
  | 'HEAVY_LANDING';

export type SurfaceMaterialKind = 'concrete' | 'wood' | 'metal';

export type ClimbFingerPose = 'CRIMP_LEDGE' | 'FLAT_PUSH';

export interface CameraSpringState {
  posY: number;
  velY: number;
  posX: number;
  velX: number;
  pitch: number;
  velPitch: number;
  roll: number;
  velRoll: number;
}

/**
 * Second-order spring-damper solver for diegetic head-mounted camera physics.
 * Sub-steps internally when dt > 0.02s to remain unconditionally stable at low FPS.
 */
export class CameraSpringRig {
  public readonly state: CameraSpringState = {
    posY: 0,
    velY: 0,
    posX: 0,
    velX: 0,
    pitch: 0,
    velPitch: 0,
    roll: 0,
    velRoll: 0,
  };

  private readonly posStiffness: number;
  private readonly posDamping: number;
  private readonly rotStiffness: number;
  private readonly rotDamping: number;

  constructor(
    posStiffness = 180,
    posDamping = 18,
    rotStiffness = 210,
    rotDamping = 20,
  ) {
    this.posStiffness = posStiffness;
    this.posDamping = posDamping;
    this.rotStiffness = rotStiffness;
    this.rotDamping = rotDamping;
  }

  public addImpulse(
    pitchKickRad: number,
    rollKickRad: number,
    dropYMeters: number,
    swayXMeters = 0,
  ): void {
    this.state.velPitch += pitchKickRad * 11.5;
    this.state.velRoll += rollKickRad * 11.5;
    this.state.velY += dropYMeters * 10.5;
    this.state.velX += swayXMeters * 10.5;
  }

  public step(
    dt: number,
    targetPosY = 0,
    targetPosX = 0,
    targetPitch = 0,
    targetRoll = 0,
  ): CameraSpringState {
    if (!Number.isFinite(dt) || dt <= 0) return this.state;
    const clampedDt = Math.min(0.08, dt);
    const steps = clampedDt > 0.02 ? Math.ceil(clampedDt / 0.016) : 1;
    const h = clampedDt / steps;

    const s = this.state;
    for (let i = 0; i < steps; i++) {
      const ay = -this.posStiffness * (s.posY - targetPosY) - this.posDamping * s.velY;
      s.velY += ay * h;
      s.posY += s.velY * h;

      const ax = -this.posStiffness * (s.posX - targetPosX) - this.posDamping * s.velX;
      s.velX += ax * h;
      s.posX += s.velX * h;

      const ap = -this.rotStiffness * (s.pitch - targetPitch) - this.rotDamping * s.velPitch;
      s.velPitch += ap * h;
      s.pitch += s.velPitch * h;

      const ar = -this.rotStiffness * (s.roll - targetRoll) - this.rotDamping * s.velRoll;
      s.velRoll += ar * h;
      s.roll += s.velRoll * h;
    }

    s.posY = clamp(s.posY, -0.55, 0.35);
    s.posX = clamp(s.posX, -0.25, 0.25);
    s.pitch = clamp(s.pitch, -0.55, 0.45);
    s.roll = clamp(s.roll, -0.45, 0.45);
    return s;
  }

  public reset(): void {
    this.state.posY = 0;
    this.state.velY = 0;
    this.state.posX = 0;
    this.state.velX = 0;
    this.state.pitch = 0;
    this.state.velPitch = 0;
    this.state.roll = 0;
    this.state.velRoll = 0;
  }
}

export interface StrideGaitPose {
  leftThighX: number;
  leftKneeX: number;
  leftAnkleX: number;
  rightThighX: number;
  rightKneeX: number;
  rightAnkleX: number;
  hipBobY: number;
  torsoPitch: number;
}

export function createDefaultStrideGaitPose(): StrideGaitPose {
  return {
    leftThighX: 0,
    leftKneeX: 0,
    leftAnkleX: 0,
    rightThighX: 0,
    rightKneeX: 0,
    rightAnkleX: 0,
    hipBobY: 0,
    torsoPitch: 0,
  };
}

/**
 * Computes anatomical hip/knee/ankle flexion (in radians) for the full-body lower rig.
 * Positive thighX = thigh swings forward; positive kneeX = knee bends backward (calf flexes).
 */
export function computeStrideGait(
  horizSpeed: number,
  isAirborne: boolean,
  stridePhase: number,
  state: ParkourStateId,
  out: StrideGaitPose = createDefaultStrideGaitPose(),
): StrideGaitPose {
  if (state === 'SLIDE') {
    out.leftThighX = 1.05;
    out.leftKneeX = 0.22;
    out.leftAnkleX = -0.18;
    out.rightThighX = -0.18;
    out.rightKneeX = 1.52;
    out.rightAnkleX = 0.25;
    out.hipBobY = -0.42;
    out.torsoPitch = -0.38;
    return out;
  }

  if (state === 'PARKOUR_ROLL') {
    out.leftThighX = 1.58;
    out.leftKneeX = 1.98;
    out.leftAnkleX = 0.25;
    out.rightThighX = 1.52;
    out.rightKneeX = 1.94;
    out.rightAnkleX = 0.25;
    out.hipBobY = -0.35;
    out.torsoPitch = 0.65;
    return out;
  }

  if (state === 'HEAVY_LANDING') {
    // 120-degree buckled knees brace
    out.leftThighX = 1.18;
    out.leftKneeX = 2.09;
    out.leftAnkleX = -0.35;
    out.rightThighX = 1.24;
    out.rightKneeX = 2.09;
    out.rightAnkleX = -0.35;
    out.hipBobY = -0.36;
    out.torsoPitch = 0.44;
    return out;
  }

  if (state === 'WALL_RUN_LEFT' || state === 'WALL_RUN_RIGHT') {
    const s = Math.sin(stridePhase * 1.15);
    const c = Math.cos(stridePhase * 1.15);
    out.leftThighX = 0.48 + s * 0.62;
    out.leftKneeX = 0.55 + Math.max(0, -c) * 0.95;
    out.leftAnkleX = -0.12 + s * 0.14;
    out.rightThighX = 0.48 - s * 0.62;
    out.rightKneeX = 0.55 + Math.max(0, c) * 0.95;
    out.rightAnkleX = -0.12 - s * 0.14;
    out.hipBobY = Math.abs(c) * 0.035;
    out.torsoPitch = 0.18;
    return out;
  }

  if (isAirborne || state === 'AIRBORNE') {
    const float = Math.sin(stridePhase * 0.45);
    out.leftThighX = 0.42 + float * 0.1;
    out.leftKneeX = 0.72 + float * 0.12;
    out.leftAnkleX = 0.18;
    out.rightThighX = 0.56 - float * 0.1;
    out.rightKneeX = 0.88 - float * 0.12;
    out.rightAnkleX = 0.22;
    out.hipBobY = 0;
    out.torsoPitch = 0.1;
    return out;
  }

  const speedNorm = clamp(horizSpeed / 13.5, 0, 1.15);
  if (speedNorm < 0.04) {
    // Natural athletic ready stance
    out.leftThighX = 0.06;
    out.leftKneeX = 0.08;
    out.leftAnkleX = -0.02;
    out.rightThighX = -0.05;
    out.rightKneeX = 0.07;
    out.rightAnkleX = 0.02;
    out.hipBobY = 0;
    out.torsoPitch = 0.02;
    return out;
  }

  const s = Math.sin(stridePhase);
  const c = Math.cos(stridePhase);
  const thighAmp = lerp(0.28, 0.78, clamp(speedNorm, 0, 1));
  const kneeSwingAmp = lerp(0.52, 1.28, clamp(speedNorm, 0, 1));

  out.leftThighX = s * thighAmp + 0.08 * speedNorm;
  out.leftKneeX = 0.14 + Math.max(0, -s * 0.65 + c * 0.35) * kneeSwingAmp;
  out.leftAnkleX = -0.06 + s * 0.18 * speedNorm;

  out.rightThighX = -s * thighAmp + 0.08 * speedNorm;
  out.rightKneeX = 0.14 + Math.max(0, s * 0.65 - c * 0.35) * kneeSwingAmp;
  out.rightAnkleX = -0.06 - s * 0.18 * speedNorm;

  out.hipBobY = -Math.abs(Math.sin(stridePhase)) * lerp(0.016, 0.042, speedNorm);
  out.torsoPitch = lerp(0.04, 0.18, speedNorm);
  return out;
}

export interface MuscleUpPose {
  stage: 1 | 2 | 3 | 4;
  leftArmReach: number;
  rightArmReach: number;
  wristFlexion: number;
  fingerPose: ClimbFingerPose;
  camPitchOffset: number;
  camYOffset: number;
  leftThighX: number;
  leftKneeX: number;
  rightThighX: number;
  rightKneeX: number;
  forwardProgress: number;
}

export function createDefaultMuscleUpPose(): MuscleUpPose {
  return {
    stage: 1,
    leftArmReach: 1,
    rightArmReach: 1,
    wristFlexion: 0,
    fingerPose: 'CRIMP_LEDGE',
    camPitchOffset: 0,
    camYOffset: 0,
    leftThighX: 0,
    leftKneeX: 0,
    rightThighX: 0,
    rightKneeX: 0,
    forwardProgress: 0,
  };
}

/**
 * Exact 4-stage Dying Light Ledge Grab & Muscle-Up sequence (0.0s to 1.15s):
 * 1. Impact Catch (0.00 - 0.22s): Crimp fingers, -11° pitch jolt, legs pendulum forward.
 * 2. Hip Kip & Wall Push (0.22 - 0.48s): Right knee drives +85° toward chest, left foot presses wall.
 * 3. Muscle-Up Turnover (0.48 - 0.80s): Wrists flex to FLAT_PUSH, left leg kicks back -40°, right plants.
 * 4. Dip Press & Sprint Exit (0.80 - 1.15s): Triceps extend, legs settle into sprint carry-through.
 */
export function computeMuscleUpStage(
  tSec: number,
  totalDur = 1.15,
  out: MuscleUpPose = createDefaultMuscleUpPose(),
): MuscleUpPose {
  const scale = totalDur > 0.01 ? 1.15 / totalDur : 1;
  const t = clamp(tSec * scale, 0, 1.15);

  if (t < 0.22) {
    // Stage 1: Impact Catch & Leg Pendulum
    const u = smoothstep01(t / 0.22);
    const pendulum = Math.sin(u * Math.PI * 0.85);
    out.stage = 1;
    out.leftArmReach = 1.0;
    out.rightArmReach = 1.0;
    out.wristFlexion = 0.0;
    out.fingerPose = 'CRIMP_LEDGE';
    out.camPitchOffset = -0.192 * Math.sin(u * Math.PI); // ~ -11 deg impact jolt
    out.camYOffset = -0.14 * Math.sin(u * Math.PI);
    out.leftThighX = lerp(0.12, 0.56, pendulum);
    out.leftKneeX = lerp(0.28, 0.46, pendulum);
    out.rightThighX = lerp(0.16, 0.62, pendulum);
    out.rightKneeX = lerp(0.32, 0.52, pendulum);
    out.forwardProgress = u * 0.08;
    return out;
  }

  if (t < 0.48) {
    // Stage 2: Hip Kip & Wall Push
    const u = smoothstep01((t - 0.22) / 0.26);
    out.stage = 2;
    out.leftArmReach = lerp(1.0, 0.72, u);
    out.rightArmReach = lerp(1.0, 0.72, u);
    out.wristFlexion = lerp(0.0, 0.28, u);
    out.fingerPose = 'CRIMP_LEDGE';
    out.camPitchOffset = lerp(-0.04, 0.09, u);
    out.camYOffset = lerp(0.0, 0.34, u);
    // Right knee drives upward +85 deg (~1.48 rad) toward chest; left foot braces against vertical wall
    out.rightThighX = lerp(0.62, 1.48, u);
    out.rightKneeX = lerp(0.52, 1.65, u);
    out.leftThighX = lerp(0.56, 0.32, u);
    out.leftKneeX = lerp(0.46, 0.88, u);
    out.forwardProgress = lerp(0.08, 0.32, u);
    return out;
  }

  if (t < 0.8) {
    // Stage 3: Muscle-Up Turnover (FLAT_PUSH + Left Counterbalance Kick -40° + Right Plant)
    const u = smoothstep01((t - 0.48) / 0.32);
    out.stage = 3;
    out.leftArmReach = lerp(0.72, 0.42, u);
    out.rightArmReach = lerp(0.72, 0.42, u);
    out.wristFlexion = lerp(0.28, 1.05, u);
    out.fingerPose = 'FLAT_PUSH';
    out.camPitchOffset = lerp(0.09, -0.14, u);
    out.camYOffset = lerp(0.34, 0.78, u);
    // Left leg kicks back -40 deg (-0.70 rad) as counterweight while right plants beside right hand
    out.leftThighX = lerp(0.32, -0.7, u);
    out.leftKneeX = lerp(0.88, 0.16, u);
    out.rightThighX = lerp(1.48, 1.24, u);
    out.rightKneeX = lerp(1.65, 1.42, u);
    out.forwardProgress = lerp(0.32, 0.76, u);
    return out;
  }

  // Stage 4: Dip Press & Sprint Exit
  const u = smoothstep01((t - 0.8) / 0.35);
  out.stage = 4;
  out.leftArmReach = lerp(0.42, 0.0, u);
  out.rightArmReach = lerp(0.42, 0.0, u);
  out.wristFlexion = lerp(1.05, 0.0, u);
  out.fingerPose = 'FLAT_PUSH';
  out.camPitchOffset = lerp(-0.14, 0.0, u);
  out.camYOffset = lerp(0.78, 1.0, u);
  out.leftThighX = lerp(-0.7, 0.46, u);
  out.leftKneeX = lerp(0.16, 0.48, u);
  out.rightThighX = lerp(1.24, -0.22, u);
  out.rightKneeX = lerp(1.42, 0.32, u);
  out.forwardProgress = lerp(0.76, 1.0, u);
  return out;
}

export interface VaultKinematicsPose {
  leftHandPlant: number;
  rightHandPlant: number;
  camRollRad: number;
  camPitchRad: number;
  leftThighX: number;
  leftKneeX: number;
  rightThighX: number;
  rightKneeX: number;
}

export function createDefaultVaultKinematicsPose(): VaultKinematicsPose {
  return {
    leftHandPlant: 0,
    rightHandPlant: 0,
    camRollRad: 0,
    camPitchRad: 0,
    leftThighX: 0,
    leftKneeX: 0,
    rightThighX: 0,
    rightKneeX: 0,
  };
}

export function computeVaultKinematics(
  kind: 'SPEED_VAULT' | 'KONG_VAULT',
  progress01: number,
  out: VaultKinematicsPose = createDefaultVaultKinematicsPose(),
): VaultKinematicsPose {
  const p = clamp(progress01, 0, 1);
  const arc = Math.sin(p * Math.PI);

  if (kind === 'KONG_VAULT') {
    out.leftHandPlant = arc;
    out.rightHandPlant = arc;
    out.camRollRad = 0;
    out.camPitchRad = -0.22 * arc;
    out.leftThighX = lerp(0.3, 1.48, arc);
    out.leftKneeX = lerp(0.5, 1.88, arc);
    out.rightThighX = lerp(0.3, 1.48, arc);
    out.rightKneeX = lerp(0.5, 1.88, arc);
    return out;
  }

  // SPEED_VAULT: left hand plants, 10 deg right roll, lateral scissor legs
  out.leftHandPlant = arc;
  out.rightHandPlant = 0;
  out.camRollRad = -0.1745 * arc; // 10 deg tilt to right (-Z roll)
  out.camPitchRad = -0.11 * arc;
  out.leftThighX = lerp(0.25, 1.22, arc);
  out.leftKneeX = lerp(0.35, 1.15, arc);
  out.rightThighX = lerp(0.25, 0.72, arc);
  out.rightKneeX = lerp(0.35, 0.92, arc);
  return out;
}

export interface LandingImpactResult {
  tier: 'LIGHT' | 'HEAVY_BRACE' | 'PARKOUR_ROLL' | 'CRITICAL_IMPACT';
  damage: number;
  stunDuration: number;
  camPitchKick: number;
  camDropY: number;
  fovPunch: number;
}

/**
 * 4-Tier Landing Shock Evaluator driven by peak downward speed (m/s).
 */
export function classifyLandingImpact(
  peakFallSpeed: number,
  rollBuffered: boolean,
  onCushion: boolean,
): LandingImpactResult {
  const speed = Math.max(0, peakFallSpeed);

  if (onCushion || speed < 10.0) {
    const lightSeverity = clamp((speed - 3.0) / 7.0, 0.1, 1.0);
    return {
      tier: 'LIGHT',
      damage: 0,
      stunDuration: 0,
      camPitchKick: -0.04 * lightSeverity,
      camDropY: -0.12 * lightSeverity,
      fovPunch: -1.5 * lightSeverity,
    };
  }

  if (rollBuffered) {
    // Timing Safety Roll negates heavy/critical stun and almost all fall damage
    const extremeDmg = speed > 21.0 ? Math.min(20, Math.round((speed - 21.0) * 4)) : 0;
    return {
      tier: 'PARKOUR_ROLL',
      damage: extremeDmg,
      stunDuration: 0,
      camPitchKick: -0.14,
      camDropY: -0.22,
      fovPunch: 4.0,
    };
  }

  if (speed <= 16.0) {
    // Tier 2: Heavy Stumble Brace (10-16 m/s) -> knees buckle 120°, hands slam ground, 0.65s stun
    const sev = clamp((speed - 10.0) / 6.0, 0.15, 1.0);
    return {
      tier: 'HEAVY_BRACE',
      damage: speed > 14.5 ? Math.round((speed - 14.5) * 4) : 0,
      stunDuration: 0.65,
      camPitchKick: -(0.18 + sev * 0.08),
      camDropY: -(0.28 + sev * 0.1),
      fovPunch: -(5.0 + sev * 2.5),
    };
  }

  // Tier 4: Critical Impact (> 16 m/s) -> heavy trauma, 1.4s recovery
  const critDamage = Math.min(58, Math.round(24 + (speed - 16.0) * 4.5));
  return {
    tier: 'CRITICAL_IMPACT',
    damage: critDamage,
    stunDuration: 1.4,
    camPitchKick: -0.38,
    camDropY: -0.46,
    fovPunch: -9.5,
  };
}

export function classifySurfaceType(colliderId?: string): SurfaceMaterialKind {
  if (!colliderId) return 'concrete';
  const id = colliderId.toLowerCase();
  if (
    id.includes('wood') ||
    id.includes('plank') ||
    id.includes('bridge') ||
    id.includes('crate') ||
    id.includes('scaffold') ||
    id.includes('cart') ||
    id.includes('door')
  ) {
    return 'wood';
  }
  if (
    id.includes('metal') ||
    id.includes('train') ||
    id.includes('coach') ||
    id.includes('rail') ||
    id.includes('tank') ||
    id.includes('gate') ||
    id.includes('tower') ||
    id.includes('antenna') ||
    id.includes('shed') ||
    id.includes('pipe') ||
    id.includes('container')
  ) {
    return 'metal';
  }
  return 'concrete';
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
