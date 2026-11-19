import * as THREE from 'three';

export const INTRO_OVERWATCH_MESSAGE =
  "OVERWATCH: Runner, sun's dropping fast over Agra. Three Antizin drops are scattered across the bazaar rooftops—grab them and reach the Taj Mahal UV Gate before Nightfall hits.";

export const INTRO_TOTAL_DURATION = 5.5;
export const TUTORIAL_HINT_DURATION = 5.0;

export interface IntroHooks {
  onStartAmbience: () => void;
  onStopAmbience: () => void;
  onTriggerBiomarkerAnim: () => void;
  onBiomarkerChirp: () => void;
  onRadioBeep: () => void;
  onSkipCleanupViewmodel: () => void;
}

export interface IntroCameraState {
  fov: number;
  pitch: number;
  roll: number;
}

function smoothstep01(x: number): number {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * State-managed 5.5s "Dying Light" first-person opening sequence controller.
 * Skippable anytime with [SPACE] or [ESC], with zero leaked timers or audio nodes on restart.
 */
export class IntroSequenceController {
  public isIntroPlaying = false;
  public elapsed = 0;

  public blackFadeOpacity = 0;
  public hudOpacity = 1;
  public introRadioVisible = false;
  public introRadioText = '';
  public tutorialHintOpacity = 0;

  private tutorialTimer = 0;
  private tutorialFadingOut = false;

  private firedAmbience = false;
  private firedHandsAnim = false;
  private firedChirp1 = false;
  private firedChirp2 = false;
  private firedRadioBeep = false;

  private readonly hooks: IntroHooks;

  constructor(hooks: IntroHooks) {
    this.hooks = hooks;
  }

  public start(): void {
    this.hooks.onStopAmbience();
    this.isIntroPlaying = true;
    this.elapsed = 0;

    this.blackFadeOpacity = 1;
    this.hudOpacity = 0;
    this.introRadioVisible = false;
    this.introRadioText = '';
    this.tutorialHintOpacity = 0;
    this.tutorialTimer = 0;
    this.tutorialFadingOut = false;

    this.firedAmbience = true;
    this.firedHandsAnim = false;
    this.firedChirp1 = false;
    this.firedChirp2 = false;
    this.firedRadioBeep = false;

    this.hooks.onStartAmbience();
  }

  public resetIdle(): void {
    this.hooks.onStopAmbience();
    this.isIntroPlaying = false;
    this.elapsed = 0;
    this.blackFadeOpacity = 0;
    this.hudOpacity = 1;
    this.introRadioVisible = false;
    this.introRadioText = '';
    this.tutorialHintOpacity = 0;
    this.tutorialTimer = 0;
    this.tutorialFadingOut = false;
  }

  public skip(): void {
    if (!this.isIntroPlaying) return;
    this.isIntroPlaying = false;
    this.elapsed = INTRO_TOTAL_DURATION;
    this.blackFadeOpacity = 0;
    this.hudOpacity = 1;
    this.introRadioVisible = false;
    this.introRadioText = '';
    this.tutorialTimer = TUTORIAL_HINT_DURATION;
    this.tutorialHintOpacity = 1;
    this.tutorialFadingOut = false;
    this.hooks.onStopAmbience();
    this.hooks.onSkipCleanupViewmodel();
  }

  public update(
    dt: number,
    playerSprinting: boolean,
    outCam: IntroCameraState,
  ): void {
    if (this.isIntroPlaying) {
      this.elapsed += dt;
      const t = this.elapsed;

      // 0.0s - 1.2s: Black fade-out + downward pitch/roll recovery + FOV pull (60° -> 75°)
      if (t < 1.2) {
        const p = smoothstep01(t / 1.2);
        this.blackFadeOpacity = 1 - p;
        outCam.pitch = THREE.MathUtils.lerp(-0.35, 0.02, p);
        outCam.roll = THREE.MathUtils.lerp(0.08, 0, p);
        outCam.fov = THREE.MathUtils.lerp(60, 75, p);
      } else {
        this.blackFadeOpacity = 0;
        outCam.pitch = 0.02;
        outCam.roll = 0;
        outCam.fov = 75;
      }

      // 1.2s - 3.4s: First-Person Biomarker & Bat Ready Animation + 2 Electronic Chirps
      if (t >= 1.2 && !this.firedHandsAnim) {
        this.firedHandsAnim = true;
        this.hooks.onTriggerBiomarkerAnim();
      }
      if (t >= 1.75 && !this.firedChirp1) {
        this.firedChirp1 = true;
        this.hooks.onBiomarkerChirp();
      }
      if (t >= 2.25 && !this.firedChirp2) {
        this.firedChirp2 = true;
        this.hooks.onBiomarkerChirp();
      }

      // 2.2s - 5.5s: Overwatch Radio Transmission & Typing Subtitle Effect
      if (t >= 2.2) {
        if (!this.firedRadioBeep) {
          this.firedRadioBeep = true;
          this.hooks.onRadioBeep();
        }
        this.introRadioVisible = true;
        const typeProgress = THREE.MathUtils.clamp((t - 2.25) / 2.95, 0, 1);
        const charCount = Math.floor(typeProgress * INTRO_OVERWATCH_MESSAGE.length);
        this.introRadioText = INTRO_OVERWATCH_MESSAGE.slice(0, charCount);
      }

      // 4.5s - 5.3s: Smoothly fade in HUD bars, compass, objective tracker & minimaps
      if (t >= 4.5) {
        this.hudOpacity = smoothstep01((t - 4.5) / 0.8);
      } else {
        this.hudOpacity = 0;
      }

      // 5.5s: Control handoff to player + 5s Tutorial Control Hint
      if (t >= INTRO_TOTAL_DURATION) {
        this.isIntroPlaying = false;
        this.hudOpacity = 1;
        this.introRadioVisible = false;
        this.introRadioText = '';
        this.tutorialTimer = TUTORIAL_HINT_DURATION;
        this.tutorialHintOpacity = 1;
        this.tutorialFadingOut = false;
        this.hooks.onStopAmbience();
      }
      return;
    }

    // Post-intro Tutorial Hint countdown (fades out early once player starts sprinting)
    if (this.tutorialTimer > 0 || this.tutorialHintOpacity > 0) {
      if (playerSprinting && !this.tutorialFadingOut) {
        this.tutorialFadingOut = true;
        this.tutorialTimer = Math.min(this.tutorialTimer, 0.45);
      }
      this.tutorialTimer = Math.max(0, this.tutorialTimer - dt);
      if (this.tutorialTimer <= 0.65) {
        this.tutorialHintOpacity = THREE.MathUtils.clamp(this.tutorialTimer / 0.65, 0, 1);
      } else {
        this.tutorialHintOpacity = 1;
      }
    }
  }
}
