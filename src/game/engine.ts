import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type {
  BoxCollider,
  CounterIndicator,
  DirectionalDamageIndicator,
  GamePhase,
  HudSnapshot,
  LadderVolume,
  MinimapTelemetry,
  ZiplineRoute,
} from '../types/game';
import { SoundEngine } from './audio';
import { IntroSequenceController } from './intro';
import { TimeOfDayLightingSystem } from './lighting';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { WeaponAndEffects } from './viewmodel';
import { buildAgraWorld, type WorldBuildResult } from './world';
import { ZombieManager, type ZombieActor } from './zombies';

// Pre-allocated math helpers (zero GC inside animation loop)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();

const FULL_CYCLE_SECONDS = 180; // 3 minutes per full 24h cycle so Golden Dusk lingers warmly

export const MOVEMENT_CONFIG = {
  // Ground & Air Speeds / Acceleration Curves
  WALK_SPEED: 7.5, // m/s
  WALK_RAMP_UP_TIME: 0.15, // seconds to reach full walk speed
  WALK_DECEL_TIME: 0.12, // seconds to decelerate to stop
  SPRINT_SPEED: 13.5, // m/s
  SPRINT_RAMP_UP_TIME: 0.45, // seconds of continuous forward movement to reach full sprint momentum
  CROUCH_SPEED: 4.1, // m/s stealth crouch speed
  STRAFE_SCALE: 0.85, // 85% sideways speed
  BACKPEDAL_SCALE: 0.65, // 65% backward speed
  AIR_CONTROL_FACTOR: 0.35, // 35% directional air-control while preserving takeoff momentum
  STAMINA_DRAIN_RATE: 18, // stamina drained per second while sprinting
  STAMINA_REGEN_RATE: 28, // stamina regenerated per second
  STAMINA_RECOVERY_THRESHOLD: 20, // % stamina required before sprint unlocks after exhaustion

  // Collider & Eye Height Geometry
  STAND_EYE_HEIGHT: 1.7,
  CROUCH_EYE_HEIGHT: 0.95,
  SLIDE_EYE_HEIGHT: 0.75,
  PLAYER_RADIUS: 0.4,
  PLAYER_STAND_HEIGHT: 1.8,
  PLAYER_CROUCH_HEIGHT: 1.05,
  PLAYER_SLIDE_HEIGHT: 0.85,

  // Parkour Slide Physics
  SLIDE_TRIGGER_SPEED: 9.0, // m/s threshold for slide vs stealth crouch
  SLIDE_IMPULSE: 15.5, // m/s initial burst impulse
  SLIDE_MIN_DURATION: 0.85,
  SLIDE_MAX_DURATION: 1.1,
  SLIDE_STOP_SPEED: 4.5, // m/s below which slide ends / stands up
  SLIDE_DOWNHILL_MAX_SPEED: 18.0, // m/s max speed on downhill ramps/rooftops
  SLIDE_STEER_RATE: 0.42, // restricted turning rate multiplier during slide
  SLIDE_JUMP_BOOST: 1.15, // 115% horizontal slide velocity on slide-jump cancel
  SLIDE_FREEFLOW_TIME: 0.6, // 0.6s+ slide or under low obstacle refreshes combo + adds +50 style

  // Procedural Camera Kinematics
  BASE_FOV: 75,
  SPRINT_FOV: 84,
  MAX_FOV: 90,
  BOB_WALK_FREQ: 9,
  BOB_WALK_AMP: 0.04,
  BOB_SPRINT_FREQ: 14,
  BOB_SPRINT_AMP: 0.085,
  STRAFE_TILT_DEG: 2.5,
  SPRINT_TURN_TILT_DEG: 4.0,
  SLIDE_ROLL_DEG: -6.0,

  // Audio Thresholds
  WIND_RUSH_SPEED: 12.5,
} as const;

export const PARKOUR_CONFIG = {
  // Jumping, Variable Jump Height, Coyote Time & Jump Buffering
  GRAVITY: 21, // m/s^2
  JUMP_FORCE: 10.05, // ~2.40m max jump height when Space held (v^2 / 2g)
  CROUCH_JUMP_FORCE: 7.4,
  RAMP_JUMP_FORCE: 10.9,
  JUMP_CUT_MULTIPLIER: 0.45, // early Space release cut for short controlled hops
  COYOTE_TIME: 0.15, // seconds after leaving a ledge where jump still fires
  JUMP_BUFFER_TIME: 0.15, // seconds before landing where Space queues an instant bounce

  // Landing Recovery & Safety Roll
  HARD_LAND_FALL_DIST: 3.5, // meters fall distance triggering compression dip & FOV punch
  ROLL_WINDOW: 0.25, // seconds before or after touchdown where C/Ctrl triggers Safety Roll
  ROLL_DURATION: 0.55, // 360-degree forward camera pitch duration
  ROLL_STYLE_POINTS: 100,

  // Multi-Height Obstacle Vaulting & Ledge Mantling
  PROBE_SHIN_Y: 0.5,
  PROBE_WAIST_Y: 1.1,
  PROBE_CHEST_Y: 1.7,
  PROBE_OVERHEAD_Y: 2.4,
  VAULT_MIN_HEIGHT: 0.5,
  VAULT_MAX_HEIGHT: 1.25,
  VAULT_DURATION: 0.35,
  VAULT_TILT_DEG: 10, // 10 deg right roll tilt during left-hand plant vault
  VAULT_STYLE_POINTS: 50,
  LEDGE_MIN_HEIGHT: 1.3,
  LEDGE_MAX_HEIGHT: 2.5,
  LEDGE_REACH: 1.75,
  LEDGE_CATCH_DURATION: 0.1, // brief fall-arrest catch dip
  LEDGE_CLIMB_DURATION: 0.45, // upward & forward climb onto rooftop
  LEDGE_STYLE_POINTS: 50,

  // Rooftop Zip-Line Traversal
  ZIPLINE_SPEED: 19.0, // m/s
  ZIPLINE_FOV: 88, // degrees
  ZIPLINE_SAG: 0.42, // parabolic gravity sag amplitude
  ZIPLINE_ATTACH_RADIUS: 3.0,
  ZIPLINE_AIR_GRAB_RADIUS: 1.85,
  ZIPLINE_STYLE_POINTS: 75,
} as const;

const PLAYER_EYE_HEIGHT = MOVEMENT_CONFIG.STAND_EYE_HEIGHT;
const PLAYER_RADIUS = MOVEMENT_CONFIG.PLAYER_RADIUS;

export class AgraSurvivalEngine {
  private readonly mountEl: HTMLElement;
  private readonly onHudUpdate: (hud: HudSnapshot) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null = null;
  private readonly bloomPass: UnrealBloomPass | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;
  private readonly textures: ProceduralTextureSet;
  private readonly world: WorldBuildResult;
  private readonly viewmodel: WeaponAndEffects;
  private readonly zombies: ZombieManager;
  public readonly sound = new SoundEngine();

  // SkyDome Shader, Atmospheric Lighting & Intro Sequence rig
  private readonly lighting: TimeOfDayLightingSystem;
  private readonly intro: IntroSequenceController;
  private readonly introCamState = { fov: 60, pitch: -0.35, roll: 0.08 };
  private readonly flashlight: THREE.SpotLight;
  private readonly flashlightTarget = new THREE.Object3D();

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private lastNow = performance.now();
  private elapsed = 0;
  private hudThrottle = 0;

  // Game & Player state
  private phase: GamePhase = 'start';
  private pointerLocked = false;
  private readonly playerPos = new THREE.Vector3(5.8, 0, 24.5);
  private readonly playerVel = new THREE.Vector3();
  private yaw = 0.11;
  private pitch = -0.04;
  private onGround = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private canMantle = false;

  // Mantle, Speed Vault & Lunge kinematics
  private mantling = false;
  private mantleTimer = 0;
  private readonly mantleStart = new THREE.Vector3();
  private readonly mantleEnd = new THREE.Vector3();

  private vaulting = false;
  private vaultTimer = 0;
  private readonly vaultStart = new THREE.Vector3();
  private readonly vaultEnd = new THREE.Vector3();
  private vaultPeakY = 0;

  private lungeTimer = 0;
  private readonly lungeVel = new THREE.Vector3();
  private targetYawGoal: number | null = null;

  // Parkour Slide, Crouch, Wall-Run, Safety Roll, Momentum Flow & Zipline state
  private isCrouching = false;
  private sprintMomentum = 0;
  private sprintExhausted = false;
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideDustTimer = 0;
  private slideSpeed = 0;
  private slideDuration = 0;
  private slideRewarded = false;
  private slideUnderObstacle = false;
  private readonly slideDir = new THREE.Vector3();
  private bobPhase = 0;
  private bobStrength = 0;
  private prevBobCos = 1;
  private bobX = 0;
  private bobY = 0;
  private yawRate = 0;
  private lastYawMove = 0;
  private viewmodelYawDelta = 0;
  private viewmodelPitchDelta = 0;
  private stylePoints = 0;
  private wallRunTimer = 0;
  private wallRunCooldown = 0;
  private wallRunSide: -1 | 0 | 1 = 0;
  private readonly wallRunNormal = new THREE.Vector3();
  private readonly wallRunTangent = new THREE.Vector3();
  private wallRunStepTimer = 0;
  private wallRunStepCount = 0;
  private lastWallColliderId = '';
  private rollBufferTimer = 0;
  private postLandRollTimer = 0;
  private pendingHardFallDist = 0;
  private preRollSpeed = 0;
  private rollSpeed = 0;
  private rollTimer = 0;
  private readonly rollDir = new THREE.Vector3();
  private rollPitchOffset = 0;
  private airPeakY = 0;
  private isVariableJump = false;
  private fovPunch = 0;
  private parkourFlow = 0;
  private flowDecayTimer = 0;
  private parkourMoveLabel = '';
  private parkourMoveTimer = 0;
  private eyeHeightOffset = 0;
  private landingDipOffset = 0;
  private activeZipline: ZiplineRoute | null = null;
  private ziplineReverse = false;
  private ziplineT = 0;
  private ziplineDetachCooldown = 0;
  private activeLadder: LadderVolume | null = null;
  private ladderStepTimer = 0;
  private radioOpen = false;

  // Player stats, combat & camera feedback
  private health = 100;
  private readonly maxHealth = 100;
  private stamina = 100;
  private readonly maxStamina = 100;
  private staminaPauseTimer = 0;
  private comboCount = 0;
  private maxCombo = 0;
  private comboTimer = 0;
  private killCount = 0;
  private attackCooldown = 0;
  private kickCooldown = 0;
  private dropkickTimer = 0;
  private mantlePitchOffset = 0;
  private mantleRollOffset = 0;
  private slowMoTimer = 0;
  private hitstopTimer = 0;
  private cameraShake = 0;
  private damageFlash = 0;
  private parryFlash = 0;
  private preVaultSpeed = 0;
  private preMantleSpeed = 0;
  private directionalHits: DirectionalDamageIndicator[] = [];
  private nextHitId = 1;

  // Gadgets & Day/Night
  private flashlightOn = false;
  private firecrackerCooldown = 0;
  private timeOfDay = 0.0; // Starts at 17:15 warm golden sunset
  private wasNight = false;
  private nightSubtitleShown = false;

  // Story & Subtitles
  private subtitleSpeaker = 'OVERWATCH RADIO';
  private subtitleText = '';
  private subtitleTimer = 0;
  private playTimeSeconds = 0;

  private readonly keys: Record<string, boolean> = {};

  constructor(mountEl: HTMLElement, onHudUpdate: (hud: HudSnapshot) => void) {
    this.mountEl = mountEl;
    this.onHudUpdate = onHudUpdate;

    // 1. Software WebGL detection
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(mountEl.clientWidth || window.innerWidth, mountEl.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    mountEl.appendChild(this.renderer.domElement);

    // 2. Scene, Camera, RoomEnvironment IBL & Golden Dusk -> Nightfall Lighting Rig
    this.scene = new THREE.Scene();

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(
      MOVEMENT_CONFIG.BASE_FOV,
      (mountEl.clientWidth || window.innerWidth) / (mountEl.clientHeight || window.innerHeight),
      0.05,
      1400,
    );
    this.camera.layers.enable(1); // Render Layer 1 instanced grass tufts while Reflector skips them
    this.scene.add(this.camera);

    // 3. Three-point / Outdoor Golden Dusk-Nightfall Lighting + Player Flashlight
    this.lighting = new TimeOfDayLightingSystem(this.scene, this.isSoftwareGl);

    this.flashlight = new THREE.SpotLight(0xfef9c3, 0, 42, Math.PI / 4.2, 0.55, 1.55);
    this.flashlight.castShadow = false;
    this.flashlight.position.set(0.18, -0.08, 0);
    this.flashlightTarget.position.set(0, 0, -12);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // 4. Build World, Textures, Viewmodel, Zombies & Intro Controller
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.world = buildAgraWorld(this.scene, this.textures, this.isSoftwareGl);
    this.viewmodel = new WeaponAndEffects(this.scene, this.camera, this.textures);
    this.zombies = new ZombieManager(this.scene, this.textures);

    this.playerPos.copy(this.world.spawnPos);
    this.yaw = this.world.spawnYaw;

    this.intro = new IntroSequenceController({
      onStartAmbience: () => this.sound.playIntroAmbience(),
      onStopAmbience: () => this.sound.stopIntroAmbience(),
      onTriggerBiomarkerAnim: () => this.viewmodel.triggerIntroReady(),
      onBiomarkerChirp: () => this.sound.playBiomarkerChirp(),
      onRadioBeep: () => this.sound.playRadioBeep(),
      onSkipCleanupViewmodel: () => this.viewmodel.cancelIntroReady(),
    });

    if (!this.isSoftwareGl) {
      const w = mountEl.clientWidth || window.innerWidth;
      const h = mountEl.clientHeight || window.innerHeight;
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.4, 0.85);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.syncCameraToPlayer(0);
    this.updateAtmosphere(0);
    this.emitHud();
    this.startLoop();
  }

  public startGame(shouldLockPointer = true): void {
    this.sound.unlock();
    this.resetState();
    this.phase = 'playing';
    this.intro.start();
    this.pitch = -0.35;
    this.camera.fov = 60;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.world.spawnYaw;
    this.camera.rotation.x = -0.35;
    this.camera.rotation.z = 0.08;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + PLAYER_EYE_HEIGHT,
      this.playerPos.z,
    );
    if (shouldLockPointer) {
      this.lockPointer();
    }
    this.emitHud();
  }

  public restartGame(): void {
    this.startGame();
  }

  public lockPointer(): void {
    this.sound.unlock();
    if (this.radioOpen || this.phase !== 'playing') return;
    const canvas = this.renderer.domElement;
    if (document.pointerLockElement !== canvas) {
      try {
        const maybePromise = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {
            // Ignore Chromium pointer-lock Promise rejections (cooldown / iframe / non-mouse gesture)
          });
        }
      } catch {
        // Ignore if browser rejects outside gesture
      }
    }
  }

  private safeExitPointerLock(): void {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch {
      // Ignore browser pointer-lock exit errors
    }
  }

  public skipTime(): void {
    this.timeOfDay = (this.timeOfDay + 0.14) % 1;
    this.updateAtmosphere(0);
    if (this.isNightTime()) {
      this.zombies.spawnNightRunners();
    }
    this.emitHud();
  }

  public isNearGuardTower(): boolean {
    return (
      Math.hypot(
        this.playerPos.x - this.world.guardTowerCenter.x,
        this.playerPos.z - this.world.guardTowerCenter.z,
      ) <= 5.2
    );
  }

  public openRadio(): void {
    if (this.phase !== 'playing' || this.radioOpen) return;
    this.radioOpen = true;
    for (const k of Object.keys(this.keys)) {
      this.keys[k] = false;
    }
    this.sound.stopContinuousLoops();
    this.safeExitPointerLock();
    this.sound.playFlashlightClick();
    this.emitHud();
  }

  public closeRadio(relockPointer = true): void {
    if (!this.radioOpen) return;
    this.radioOpen = false;
    this.sound.playFlashlightClick();
    if (relockPointer) {
      this.lockPointer();
    }
    this.emitHud();
  }

  private resetState(): void {
    this.sound.stopContinuousLoops();
    this.intro.resetIdle();
    this.viewmodel.cancelIntroReady();
    this.playerPos.copy(this.world.spawnPos);
    this.playerVel.set(0, 0, 0);
    this.yaw = this.world.spawnYaw;
    this.pitch = -0.04;
    this.onGround = true;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.canMantle = false;
    this.mantling = false;
    this.vaulting = false;
    this.vaultTimer = 0;
    this.lungeTimer = 0;
    this.targetYawGoal = null;
    this.isCrouching = false;
    this.sprintMomentum = 0;
    this.sprintExhausted = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.slideDustTimer = 0;
    this.slideSpeed = 0;
    this.slideDuration = 0;
    this.slideRewarded = false;
    this.slideUnderObstacle = false;
    this.bobPhase = 0;
    this.bobStrength = 0;
    this.prevBobCos = 1;
    this.bobX = 0;
    this.bobY = 0;
    this.yawRate = 0;
    this.lastYawMove = 0;
    this.viewmodelYawDelta = 0;
    this.viewmodelPitchDelta = 0;
    this.stylePoints = 0;
    this.wallRunTimer = 0;
    this.wallRunCooldown = 0;
    this.wallRunSide = 0;
    this.wallRunStepTimer = 0;
    this.wallRunStepCount = 0;
    this.lastWallColliderId = '';
    this.rollBufferTimer = 0;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.preRollSpeed = 0;
    this.rollSpeed = 0;
    this.rollTimer = 0;
    this.rollPitchOffset = 0;
    this.airPeakY = 0;
    this.isVariableJump = false;
    this.fovPunch = 0;
    this.parkourFlow = 0;
    this.flowDecayTimer = 0;
    this.parkourMoveLabel = '';
    this.parkourMoveTimer = 0;
    this.eyeHeightOffset = 0;
    this.landingDipOffset = 0;
    this.activeZipline = null;
    this.ziplineT = 0;
    this.ziplineDetachCooldown = 0;
    this.activeLadder = null;
    this.ladderStepTimer = 0;
    this.radioOpen = false;
    this.camera.fov = MOVEMENT_CONFIG.BASE_FOV;
    this.camera.updateProjectionMatrix();

    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.staminaPauseTimer = 0;
    this.comboCount = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.killCount = 0;
    this.attackCooldown = 0;
    this.kickCooldown = 0;
    this.dropkickTimer = 0;
    this.mantlePitchOffset = 0;
    this.mantleRollOffset = 0;
    this.slowMoTimer = 0;
    this.hitstopTimer = 0;
    this.cameraShake = 0;
    this.damageFlash = 0;
    this.parryFlash = 0;
    this.preVaultSpeed = 0;
    this.preMantleSpeed = 0;
    this.directionalHits = [];
    this.firecrackerCooldown = 0;
    this.flashlightOn = false;
    this.flashlight.intensity = 0;

    this.timeOfDay = 0.0;
    this.wasNight = false;
    this.nightSubtitleShown = false;
    this.playTimeSeconds = 0;

    this.world.crates.forEach((c) => {
      c.collected = false;
      c.group.visible = true;
    });

    this.zombies.resetAll();
  }

  private setSubtitle(speaker: string, text: string, duration = 7.5): void {
    this.subtitleSpeaker = speaker;
    this.subtitleText = text;
    this.subtitleTimer = duration;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onResize = () => {
    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = this.mountEl.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    if (this.composer && this.bloomPass) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloomPass.setSize(w, h);
    }
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onPointerLockError = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked || this.phase !== 'playing' || this.intro.isIntroPlaying) return;
    const baseSens = 0.0022;
    const steerScale = this.slideTimer > 0 ? MOVEMENT_CONFIG.SLIDE_STEER_RATE : 1.0;
    const deltaYaw = -e.movementX * baseSens * steerScale;
    const deltaPitch = -e.movementY * baseSens;
    this.yaw += deltaYaw;
    this.lastYawMove += deltaYaw;
    this.viewmodelYawDelta += deltaYaw;
    this.viewmodelPitchDelta += deltaPitch;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitch, -1.42, 1.42);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing' || this.radioOpen) return;
    this.sound.unlock();
    if (!this.pointerLocked) {
      this.lockPointer();
      return;
    }
    if (this.intro.isIntroPlaying) return;

    if (e.button === 0) {
      this.performMeleeAttack();
    } else if (e.button === 2) {
      this.performCounterParry();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.sound.unlock();
    if (this.radioOpen) {
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        this.closeRadio(false);
      }
      return;
    }
    if (this.phase === 'playing' && this.intro.isIntroPlaying) {
      if ((e.code === 'Space' || e.code === 'Escape') && !e.repeat) {
        e.preventDefault();
        this.intro.skip();
        this.pitch = 0.02;
        this.camera.fov = MOVEMENT_CONFIG.BASE_FOV;
        this.camera.rotation.z = 0;
        this.camera.updateProjectionMatrix();
        this.emitHud();
      }
      return;
    }
    this.keys[e.code] = true;
    if (this.phase === 'start') {
      const ignored = [
        'Escape',
        'Tab',
        'ShiftLeft',
        'ShiftRight',
        'ControlLeft',
        'ControlRight',
        'AltLeft',
        'AltRight',
        'MetaLeft',
        'MetaRight',
      ];
      if (!e.repeat && !ignored.includes(e.code)) {
        e.preventDefault();
        this.startGame(false);
      }
      return;
    }
    if (this.phase !== 'playing') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        if (this.activeZipline) {
          this.dismountZipline(true);
          return;
        }
        if (this.wallRunSide !== 0) {
          this.performWallKick();
          return;
        }
        if (this.slideTimer > 0) {
          // Slide-Cancel & Jump Boost: 115% of current slide horizontal velocity
          const currentSlideHoriz = Math.hypot(this.playerVel.x, this.playerVel.z);
          const launchSpeed = Math.max(
            MOVEMENT_CONFIG.WALK_SPEED,
            currentSlideHoriz * MOVEMENT_CONFIG.SLIDE_JUMP_BOOST,
          );
          this.slideTimer = 0;
          this.isCrouching = !this.hasStandingClearance();
          this.sprintMomentum = 1.0;
          this.playerVel.x = -Math.sin(this.yaw) * launchSpeed;
          this.playerVel.z = -Math.cos(this.yaw) * launchSpeed;
          this.playerVel.y = this.isCrouching ? 6.4 : 9.4;
          this.isVariableJump = false;
          this.onGround = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
          this.sound.updateSlideLoop(false, 0);
          this.triggerFlowBoost('SLIDE-HOP', 0.38);
          this.sound.playWindRush(0.85);
          return;
        }
        const zipHit = this.findNearbyZipline();
        if (zipHit && this.ziplineDetachCooldown <= 0) {
          this.attachZipline(zipHit.route, zipHit.reverse, 0);
          return;
        }
        this.jumpBufferTimer = PARKOUR_CONFIG.JUMP_BUFFER_TIME;
        this.tryJumpOrMantle();
      }
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlashlight();
    } else if (e.code === 'KeyQ' && !e.repeat) {
      this.throwFirecracker();
    } else if (e.code === 'KeyE' && !e.repeat) {
      this.tryInteract();
    } else if (e.code === 'KeyR' && !e.repeat) {
      this.performHeavyTakedown();
    } else if (e.code === 'KeyC' && !e.repeat) {
      if (this.postLandRollTimer > 0 && this.rollTimer <= 0) {
        this.startSafetyRoll(this.pendingHardFallDist);
      } else if (!this.onGround && !this.mantling && !this.vaulting && !this.activeZipline) {
        this.rollBufferTimer = PARKOUR_CONFIG.ROLL_WINDOW;
        if (this.playerVel.y > -7.5) {
          this.performParkourKick();
        }
      } else {
        const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
        const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.sprintExhausted;
        if (this.onGround && ((wantsSprint && horizSpeed > 7.5) || horizSpeed >= MOVEMENT_CONFIG.SLIDE_TRIGGER_SPEED)) {
          this.tryParkourSlide();
        } else if (this.hasEnemyInKickRange() || horizSpeed < 1.5) {
          this.performParkourKick();
        } else {
          this.isCrouching = true;
        }
      }
    } else if (e.code === 'KeyV' && !e.repeat) {
      this.performParkourKick();
    } else if ((e.code === 'ControlLeft' || e.code === 'KeyX') && !e.repeat) {
      if (this.postLandRollTimer > 0 && this.rollTimer <= 0) {
        this.startSafetyRoll(this.pendingHardFallDist);
      } else if (!this.onGround) {
        this.rollBufferTimer = PARKOUR_CONFIG.ROLL_WINDOW;
      } else {
        const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
        const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.sprintExhausted;
        if ((wantsSprint && horizSpeed > 7.5) || horizSpeed >= MOVEMENT_CONFIG.SLIDE_TRIGGER_SPEED) {
          this.tryParkourSlide();
        } else {
          this.isCrouching = true;
        }
      }
    } else if (e.code === 'Digit1' && !e.repeat) {
      this.viewmodel.setWeapon('bat');
      this.emitHud();
    } else if (e.code === 'Digit2' && !e.repeat) {
      this.viewmodel.setWeapon('machete');
      this.emitHud();
    } else if (e.code === 'Digit3' && !e.repeat) {
      this.viewmodel.setWeapon('pipe');
      this.emitHud();
    } else if ((e.code === 'KeyB' || e.code === 'KeyI') && !e.repeat) {
      this.viewmodel.triggerInspect();
    } else if (e.code === 'KeyT' && !e.repeat) {
      this.skipTime();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
    if (
      e.code === 'Space' &&
      this.isVariableJump &&
      this.playerVel.y > 2.2 &&
      !this.mantling &&
      !this.vaulting &&
      !this.activeZipline &&
      !this.activeLadder &&
      this.wallRunSide === 0
    ) {
      this.playerVel.y *= PARKOUR_CONFIG.JUMP_CUT_MULTIPLIER;
      this.isVariableJump = false;
    }
  };

  private toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 6.5 : 0;
    this.sound.playFlashlightClick();
    this.emitHud();
  }

  private throwFirecracker(): void {
    if (this.firecrackerCooldown > 0) return;
    this.firecrackerCooldown = 3.2;

    _tmpVecA.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    _tmpVecB.copy(this.camera.position).addScaledVector(_tmpVecA, 0.7);
    this.viewmodel.throwFirecracker(_tmpVecB, _tmpVecA);
    this.sound.playFirecrackerFuse();
  }

  private findNearbyZipline(): { route: ZiplineRoute; reverse: boolean } | null {
    for (let i = 0; i < this.world.ziplines.length; i++) {
      const z = this.world.ziplines[i];
      if (this.playerPos.distanceTo(z.start) <= PARKOUR_CONFIG.ZIPLINE_ATTACH_RADIUS) {
        return { route: z, reverse: false };
      }
      if (this.playerPos.distanceTo(z.end) <= PARKOUR_CONFIG.ZIPLINE_ATTACH_RADIUS) {
        return { route: z, reverse: true };
      }
    }
    return null;
  }

  private findAirborneZipline(): { route: ZiplineRoute; reverse: boolean; t: number } | null {
    if (this.onGround || this.activeZipline || this.ziplineDetachCooldown > 0) return null;
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    for (let i = 0; i < this.world.ziplines.length; i++) {
      const z = this.world.ziplines[i];
      _tmpVecA.subVectors(z.end, z.start);
      const lenSq = _tmpVecA.lengthSq();
      if (lenSq < 0.1) continue;
      _tmpVecB.subVectors(this.playerPos, z.start);
      const rawT = THREE.MathUtils.clamp(_tmpVecB.dot(_tmpVecA) / lenSq, 0.02, 0.92);
      _tmpVecB.lerpVectors(z.start, z.end, rawT);
      const horizDist = Math.hypot(this.playerPos.x - _tmpVecB.x, this.playerPos.z - _tmpVecB.z);
      const vertDist = Math.abs(this.playerPos.y - _tmpVecB.y);
      if (horizDist <= PARKOUR_CONFIG.ZIPLINE_AIR_GRAB_RADIUS && vertDist <= 1.85) {
        const dirLen = Math.sqrt(lenSq);
        const dotFwd = (_tmpVecA.x * fwdX + _tmpVecA.z * fwdZ) / dirLen;
        const reverse = rawT > 0.55 && dotFwd < -0.25;
        return {
          route: z,
          reverse,
          t: reverse ? 1 - rawT : rawT,
        };
      }
    }
    return null;
  }

  private attachZipline(route: ZiplineRoute, reverse: boolean, startT: number): void {
    this.activeZipline = route;
    this.ziplineReverse = reverse;
    this.ziplineT = THREE.MathUtils.clamp(startT, 0, 0.92);
    this.slideTimer = 0;
    this.mantling = false;
    this.vaulting = false;
    this.wallRunSide = 0;
    this.onGround = false;
    this.isVariableJump = false;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.airPeakY = this.playerPos.y;
    this.sound.updateSlideLoop(false, 0);
    this.sound.playLedgeGrab(true);
    this.sound.updateZiplineLoop(true, PARKOUR_CONFIG.ZIPLINE_SPEED);
  }

  private dismountZipline(midAirJump: boolean): void {
    if (!this.activeZipline) return;
    const a = this.ziplineReverse ? this.activeZipline.end : this.activeZipline.start;
    const b = this.ziplineReverse ? this.activeZipline.start : this.activeZipline.end;
    const cableDir = _tmpVecA.subVectors(b, a).setY(0);
    if (cableDir.lengthSq() > 0.001) cableDir.normalize();
    else cableDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));

    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const launchX = midAirJump ? fwdX : cableDir.x * 0.7 + fwdX * 0.3;
    const launchZ = midAirJump ? fwdZ : cableDir.z * 0.7 + fwdZ * 0.3;
    const lLen = Math.hypot(launchX, launchZ) || 1;
    const launchSpeed = midAirJump ? 13.5 : 11.8;

    this.activeZipline = null;
    this.ziplineDetachCooldown = 0.45;
    this.sound.updateZiplineLoop(false, 0);
    this.playerVel.x = (launchX / lLen) * launchSpeed;
    this.playerVel.z = (launchZ / lLen) * launchSpeed;
    this.playerVel.y = midAirJump ? 8.8 : 5.6;
    this.onGround = false;
    this.isVariableJump = false;
    this.airPeakY = this.playerPos.y;
    this.awardParkourCombo(PARKOUR_CONFIG.ZIPLINE_STYLE_POINTS, 'ZIPLINE LAUNCH', 0.4);
    this.sound.playWindRush(0.8);
  }

  private tryInteract(): void {
    for (let i = 0; i < this.world.crates.length; i++) {
      const c = this.world.crates[i];
      if (c.collected) continue;
      if (this.playerPos.distanceTo(c.position) < 3.6) {
        c.collected = true;
        c.group.visible = false;
        this.sound.playScavenge();

        const collectedCount = this.world.crates.filter((cr) => cr.collected).length;
        if (collectedCount === 1) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'First Antizin crate secured! Two left — watch the alleys, armored Brutes guard the heavy caches.',
            7.5,
          );
        } else if (collectedCount === 2) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'Two Antizin crates recovered! One remaining. Use rooftop ziplines if Night Hunters chase!',
            7.5,
          );
        } else if (collectedCount === 3) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'All 3 Antizin crates secured! Zip or sprint north to the Taj Mahal UV Safe House gate now!',
            9.5,
          );
        }
        this.emitHud();
        return;
      }
    }

    if (this.isNearGuardTower()) {
      this.openRadio();
      return;
    }

    const zipHit = this.findNearbyZipline();
    if (zipHit && !this.activeZipline && this.ziplineDetachCooldown <= 0) {
      this.attachZipline(zipHit.route, zipHit.reverse, 0);
    }
  }

  private hasEnemyInKickRange(): boolean {
    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);
    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 4.0 || Math.abs(z.pos.y - this.playerPos.y) > 2.4) continue;
      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.25) return true;
    }
    return false;
  }

  private sampleGroundHeight(x: number, z: number): number {
    let groundHeight = 0;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (
        x + PLAYER_RADIUS * 0.6 > b.minX &&
        x - PLAYER_RADIUS * 0.6 < b.maxX &&
        z + PLAYER_RADIUS * 0.6 > b.minZ &&
        z - PLAYER_RADIUS * 0.6 < b.maxZ
      ) {
        const topY = this.getColliderTopAt(b, x, z);
        if (topY <= this.playerPos.y + 0.8 && topY >= groundHeight) {
          groundHeight = topY;
        }
      }
    }
    return groundHeight;
  }

  private hasStandingClearance(): boolean {
    const standTop = this.playerPos.y + MOVEMENT_CONFIG.PLAYER_STAND_HEIGHT;
    const minCheckY = this.playerPos.y + 0.55;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (
        this.playerPos.x + PLAYER_RADIUS * 0.85 > b.minX &&
        this.playerPos.x - PLAYER_RADIUS * 0.85 < b.maxX &&
        this.playerPos.z + PLAYER_RADIUS * 0.85 > b.minZ &&
        this.playerPos.z - PLAYER_RADIUS * 0.85 < b.maxZ
      ) {
        if (b.minY > minCheckY && b.minY < standTop) {
          return false;
        }
      }
    }
    return true;
  }

  private tryParkourSlide(): void {
    if (
      !this.onGround ||
      this.mantling ||
      this.vaulting ||
      this.activeZipline ||
      this.slideTimer > 0 ||
      this.slideCooldown > 0
    ) {
      return;
    }
    const speed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (speed < 5.0) return;

    this.isCrouching = false;
    this.slideTimer = 1.0; // Decays over 0.85s - 1.1s unless downhill boost sustains it
    this.slideDuration = 0;
    this.slideRewarded = false;
    this.slideUnderObstacle = false;
    this.slideSpeed = Math.max(MOVEMENT_CONFIG.SLIDE_IMPULSE, speed);
    this.slideCooldown = 0.25;
    this.slideDustTimer = 0.06;
    this.slideDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.playerVel.x = this.slideDir.x * this.slideSpeed;
    this.playerVel.z = this.slideDir.z * this.slideSpeed;
    this.viewmodel.spawnDustPuffs(this.playerPos, 6);
    this.sound.updateSlideLoop(true, this.slideSpeed);
    this.sound.playWindRush(0.55);
  }

  // =========================================================================
  // ARKHAM-STYLE FREEFLOW COMBAT: STRIKE + LUNGE, COUNTER, KICK, TAKEDOWN
  // =========================================================================
  private performMeleeAttack(): void {
    if (this.attackCooldown > 0 || this.mantling) return;
    this.attackCooldown = 0.34;
    this.viewmodel.triggerSwing();
    this.sound.playPipeSwing();

    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);
    let bestTarget: ZombieActor | null = null;
    let bestScore = Infinity;

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dy = Math.abs(z.pos.y - this.playerPos.y);
      const dist = Math.hypot(dx, dz);
      if (dist > 4.6 || dy > 2.2) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.25) {
        const score = dist - dot * 1.4;
        if (score < bestScore) {
          bestScore = score;
          bestTarget = z;
        }
      }
    }

    if (bestTarget) {
      const dx = bestTarget.pos.x - this.playerPos.x;
      const dz = bestTarget.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const nx = dx / dist;
      const nz = dz / dist;

      this.targetYawGoal = Math.atan2(-nx, -nz);
      if (dist > 1.65) {
        this.lungeTimer = 0.14;
        this.lungeVel.set(nx * 14, 0, nz * 14);
      }

      const bruteToPlayerX = -nx;
      const bruteToPlayerZ = -nz;
      const bruteForwardX = Math.sin(bestTarget.yaw);
      const bruteForwardZ = Math.cos(bestTarget.yaw);
      const facingPlayer = bruteToPlayerX * bruteForwardX + bruteToPlayerZ * bruteForwardZ;
      const lureActive = this.viewmodel.getActiveLurePosition() !== null;

      if (bestTarget.kind === 'brute' && bestTarget.state !== 'stunned' && facingPlayer > 0.2 && !lureActive) {
        this.viewmodel.triggerBlocked();
        this.sound.playPipeHit(false, true);
        this.cameraShake = 0.22;
        _tmpVecA.copy(bestTarget.pos).setY(bestTarget.pos.y + 1.3);
        this.viewmodel.spawnSparks(_tmpVecA, 0x94a3b8, 12);
        this.setSubtitle(
          'COMBAT TIP',
          'Brute blocked frontal strike! Counter [Right-Click], Kick [C], or lure with Firecracker [Q]!',
          4.2,
        );
        return;
      }

      const damage = 32 + Math.min(20, this.comboCount * 3);
      _tmpVecB.set(nx, 0, nz);
      const killed = this.zombies.damageZombie(bestTarget, damage, _tmpVecB, 5.4, 0.45);
      if (killed) this.killCount++;

      this.hitstopTimer = 0.04;
      this.cameraShake = 0.18;
      this.registerComboHit(1);
      this.sound.playPipeHit(false, false);
      const sparkY = bestTarget.kind === 'dog' ? 0.65 : 1.35;
      _tmpVecA.copy(bestTarget.pos).setY(bestTarget.pos.y + sparkY);
      this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 11);
    }
  }

  private performParkourKick(): void {
    if (this.kickCooldown > 0 || this.mantling) return;
    const airborne = !this.onGround;
    this.kickCooldown = airborne ? 1.05 : 0.85;
    this.viewmodel.triggerKick(airborne);

    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);

    if (airborne) {
      // Flying Dropkick forward kinetic boost!
      this.dropkickTimer = 0.36;
      this.playerVel.x += lookX * 5.5;
      this.playerVel.z += lookZ * 5.5;
      this.playerVel.y = Math.max(this.playerVel.y, 1.8);
    }

    const reach = airborne ? 4.2 : 3.6;
    const damage = airborne ? 38 : 24;
    const knockForce = airborne ? 15.5 : 12.5;
    const stunDur = airborne ? 1.7 : 1.35;
    let kickedAny = false;

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(z.pos.y - this.playerPos.y) > 2.4) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.32) {
        kickedAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(z, damage, _tmpVecB, knockForce, stunDur);
        if (killed) this.killCount++;
        const sparkY = z.kind === 'dog' ? 0.6 : 1.1;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, airborne ? 10 : 7);
      }
    }

    this.sound.playKick(kickedAny);
    if (kickedAny) {
      this.hitstopTimer = airborne ? 0.055 : 0.04;
      this.cameraShake = airborne ? 0.3 : 0.22;
      this.registerComboHit(1);
    }
  }

  private performCounterParry(): void {
    if (this.mantling) return;
    let counteredAny = false;

    for (const z of this.zombies.zombies) {
      if (z.state !== 'windup') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 5.5 && Math.abs(z.pos.y - this.playerPos.y) < 2.5) {
        counteredAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        this.targetYawGoal = Math.atan2(-nx, -nz);

        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(z, 52, _tmpVecB, 12.5, 1.85);
        if (killed) this.killCount++;

        const sparkY = z.kind === 'dog' ? 0.72 : 1.4;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnSparks(_tmpVecA, 0xfef08a, 14);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 10);
        this.registerComboHit(2);
      }
    }

    this.viewmodel.triggerParry();
    if (counteredAny) {
      this.parryFlash = 0.48;
      this.hitstopTimer = 0.045;
      this.cameraShake = 0.24;
      this.sound.playCounterClang();
      this.attackCooldown = 0.14;
    } else {
      this.sound.playPipeSwing();
      this.attackCooldown = 0.22;
    }
  }

  private performHeavyTakedown(): void {
    if (this.comboCount < 5 || this.mantling) return;

    this.comboCount = 0;
    this.comboTimer = 0;
    this.slowMoTimer = 0.38;
    this.cameraShake = 0.4;
    this.parryFlash = 0.5;
    this.viewmodel.triggerTakedown(this.playerPos);
    this.sound.playHeavyTakedown();

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 7.0 && Math.abs(z.pos.y - this.playerPos.y) < 3.0) {
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(z, 95, _tmpVecB, 13.5, 2.2);
        if (killed) this.killCount++;
        const sparkY = z.kind === 'dog' ? 0.65 : 1.2;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 12);
      }
    }
    this.emitHud();
  }

  private registerComboHit(amount = 1): void {
    this.comboCount += amount;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    this.comboTimer = 4.8;
    this.sound.playComboChime(this.comboCount);
  }

  // =========================================================================
  // FIXED PARKOUR JUMPING, COYOTE TIME & STRICT UPWARD LEDGE MANTLING
  // =========================================================================
  private getColliderTopAt(b: BoxCollider, x: number, z: number): number {
    if (!b.ramp) return b.maxY;
    const coord = b.ramp.axis === 'x' ? x : z;
    const span = b.ramp.highCoord - b.ramp.lowCoord;
    const t = span !== 0 ? THREE.MathUtils.clamp((coord - b.ramp.lowCoord) / span, 0, 1) : 1;
    return THREE.MathUtils.lerp(b.ramp.lowY, b.ramp.highY, t);
  }

  private triggerFlowBoost(label: string, amount = 0.36): void {
    this.parkourFlow = Math.min(1, this.parkourFlow + amount);
    this.flowDecayTimer = 2.8;
    this.parkourMoveLabel = label;
    this.parkourMoveTimer = 1.35;
  }

  private awardParkourCombo(points: number, label: string, flowAmount = 0.36): void {
    this.stylePoints += points;
    this.comboCount += 1;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    this.comboTimer = 4.8;
    this.triggerFlowBoost(`${label} · +${points}`, flowAmount);
    this.sound.playComboChime(this.comboCount);
  }

  private startSafetyRoll(fallDist = 0): void {
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.rollTimer = PARKOUR_CONFIG.ROLL_DURATION;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.rollBufferTimer = 0;
    this.isCrouching = false;
    this.slideTimer = 0;
    this.sprintMomentum = 1.0;
    this.rollSpeed = Math.max(this.preRollSpeed, horizSpeed, MOVEMENT_CONFIG.SPRINT_SPEED);
    this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.playerVel.x = this.rollDir.x * this.rollSpeed;
    this.playerVel.z = this.rollDir.z * this.rollSpeed;
    this.sound.playSafetyRoll();
    this.cameraShake = 0.08;
    this.landingDipOffset = -0.22;
    this.fovPunch = 3.5;
    this.viewmodel.spawnDustPuffs(this.playerPos, fallDist > 4 ? 10 : 7);
    this.awardParkourCombo(PARKOUR_CONFIG.ROLL_STYLE_POINTS, 'SAFETY ROLL', 0.45);
  }

  private performWallKick(): void {
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    this.playerVel.x = this.wallRunNormal.x * 7.6 + fwdX * 8.8;
    this.playerVel.z = this.wallRunNormal.z * 7.6 + fwdZ * 8.8;
    this.playerVel.y = 9.9;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.wallRunCooldown = 0.22;
    this.onGround = false;
    this.jumpBufferTimer = 0;
    this.triggerFlowBoost('WALL KICK', 0.42);
    this.sound.playLedgeGrab();
    this.sound.playWindRush(0.78);
  }

  private probeWallRunSurface(): {
    side: -1 | 1;
    normalX: number;
    normalZ: number;
    tangentX: number;
    tangentZ: number;
    id: string;
  } | null {
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    const probeReach = PLAYER_RADIUS + 0.58;
    const sides: Array<-1 | 1> = [-1, 1];

    for (const side of sides) {
      const dirX = _right.x * side;
      const dirZ = _right.z * side;
      const px = this.playerPos.x + dirX * probeReach;
      const pz = this.playerPos.z + dirZ * probeReach;

      for (let i = 0; i < this.world.colliders.length; i++) {
        const b = this.world.colliders[i];
        if (b.ramp) continue;
        if (!b.wallrunnable && b.maxY - b.minY < 2.2) continue;
        if (b.id && b.id === this.lastWallColliderId) continue;
        if (this.playerPos.y < b.minY - 0.35 || this.playerPos.y > b.maxY - 0.85) continue;

        if (px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ) {
          // Determine outward normal of the closest vertical face of the box
          const dMinX = Math.abs(this.playerPos.x - b.minX);
          const dMaxX = Math.abs(b.maxX - this.playerPos.x);
          const dMinZ = Math.abs(this.playerPos.z - b.minZ);
          const dMaxZ = Math.abs(b.maxZ - this.playerPos.z);
          const minDist = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);

          let nx = 0;
          let nz = 0;
          if (minDist === dMinX) nx = -1;
          else if (minDist === dMaxX) nx = 1;
          else if (minDist === dMinZ) nz = -1;
          else nz = 1;

          // Must be oriented somewhat along the wall (not running head-on into it)
          const fwdDot = Math.abs(_forward.x * nx + _forward.z * nz);
          if (fwdDot > 0.68) continue;

          // Tangent direction along wall matching player's forward heading
          let tx = _forward.x - (_forward.x * nx + _forward.z * nz) * nx;
          let tz = _forward.z - (_forward.x * nx + _forward.z * nz) * nz;
          const tLen = Math.hypot(tx, tz) || 1;
          tx /= tLen;
          tz /= tLen;

          return {
            side,
            normalX: nx,
            normalZ: nz,
            tangentX: tx,
            tangentZ: tz,
            id: b.id ?? `wall_${i}`,
          };
        }
      }
    }
    return null;
  }

  private hasOverheadLandingClearance(tx: number, topY: number, tz: number, ignoreId: string): boolean {
    const checkMinY = topY + 0.25;
    const checkMaxY = topY + 1.68;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (b.id === ignoreId || b.ramp) continue;
      if (b.maxY <= checkMinY || b.minY >= checkMaxY) continue;
      if (
        tx + PLAYER_RADIUS * 0.65 > b.minX &&
        tx - PLAYER_RADIUS * 0.65 < b.maxX &&
        tz + PLAYER_RADIUS * 0.65 > b.minZ &&
        tz - PLAYER_RADIUS * 0.65 < b.maxZ
      ) {
        return false;
      }
    }
    return true;
  }

  private findMantleTarget(): {
    box: BoxCollider;
    targetX: number;
    targetZ: number;
    isLowVault: boolean;
  } | null {
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();

    // Multi-height forward capsule sweep (0.5m shin, 1.1m waist, 1.7m chest, 2.4m overhead reach)
    const probeDists = [0.55, 0.95, 1.35, PARKOUR_CONFIG.LEDGE_REACH];
    const shinAbsY = this.playerPos.y + PARKOUR_CONFIG.PROBE_SHIN_Y;
    const waistAbsY = this.playerPos.y + PARKOUR_CONFIG.PROBE_WAIST_Y;
    const chestAbsY = this.playerPos.y + PARKOUR_CONFIG.PROBE_CHEST_Y;
    const overheadAbsY = this.playerPos.y + PARKOUR_CONFIG.PROBE_OVERHEAD_Y;

    let bestBox: BoxCollider | null = null;
    let bestY = -Infinity;
    let bestTX = 0;
    let bestTZ = 0;
    let bestLowVault = false;

    for (const d of probeDists) {
      const px = this.playerPos.x + _forward.x * d;
      const pz = this.playerPos.z + _forward.z * d;

      for (let i = 0; i < this.world.colliders.length; i++) {
        const b = this.world.colliders[i];
        if (!b.mantleable || b.ramp) continue;

        if (
          px >= b.minX - PLAYER_RADIUS * 0.9 &&
          px <= b.maxX + PLAYER_RADIUS * 0.9 &&
          pz >= b.minZ - PLAYER_RADIUS * 0.9 &&
          pz <= b.maxZ + PLAYER_RADIUS * 0.9
        ) {
          const ledgeDelta = b.maxY - this.playerPos.y;
          const shinHits = b.maxY >= shinAbsY - 0.14 && b.minY <= shinAbsY + 0.35;
          const waistOrChestHits = b.maxY >= waistAbsY - 0.1 && b.minY <= chestAbsY + 0.3;
          const overheadClear = b.maxY <= overheadAbsY + 0.15;
          if (!overheadClear) continue;

          const spanX = b.maxX - b.minX;
          const spanZ = b.maxZ - b.minZ;
          const isThinCross = Math.abs(_forward.x) > Math.abs(_forward.z) ? spanX < 2.85 : spanZ < 2.85;

          // 1. Speed Vault window: 0.5m - 1.25m tall obstacles (shin/waist contact, chest clear)
          if (
            (shinHits || ledgeDelta >= PARKOUR_CONFIG.VAULT_MIN_HEIGHT) &&
            ledgeDelta >= PARKOUR_CONFIG.VAULT_MIN_HEIGHT - 0.12 &&
            ledgeDelta <= PARKOUR_CONFIG.VAULT_MAX_HEIGHT &&
            b.maxY > bestY
          ) {
            let candidateTX: number;
            let candidateTZ: number;
            if (isThinCross) {
              const txMin = Math.abs(_forward.x) > 0.001 ? ((b.minX - 0.62) - this.playerPos.x) / _forward.x : Infinity;
              const txMax = Math.abs(_forward.x) > 0.001 ? ((b.maxX + 0.62) - this.playerPos.x) / _forward.x : Infinity;
              const tzMin = Math.abs(_forward.z) > 0.001 ? ((b.minZ - 0.62) - this.playerPos.z) / _forward.z : Infinity;
              const tzMax = Math.abs(_forward.z) > 0.001 ? ((b.maxZ + 0.62) - this.playerPos.z) / _forward.z : Infinity;
              const exitT = Math.min(Math.max(txMin, txMax), Math.max(tzMin, tzMax));
              const stepDist = Number.isFinite(exitT) && exitT > d && exitT < 3.6 ? exitT : d + 1.85;
              candidateTX = this.playerPos.x + _forward.x * stepDist;
              candidateTZ = this.playerPos.z + _forward.z * stepDist;
            } else {
              const padX = Math.min(0.45, spanX * 0.35);
              const padZ = Math.min(0.45, spanZ * 0.35);
              candidateTX = THREE.MathUtils.clamp(this.playerPos.x + _forward.x * (d + 0.72), b.minX + padX, b.maxX - padX);
              candidateTZ = THREE.MathUtils.clamp(this.playerPos.z + _forward.z * (d + 0.72), b.minZ + padZ, b.maxZ - padZ);
            }

            if (this.hasOverheadLandingClearance(candidateTX, b.maxY, candidateTZ, b.id)) {
              bestY = b.maxY;
              bestBox = b;
              bestLowVault = true;
              bestTX = candidateTX;
              bestTZ = candidateTZ;
            }
          } else if (
            (waistOrChestHits || (!this.onGround && ledgeDelta >= 0.4)) &&
            ledgeDelta >= 0.4 &&
            ledgeDelta <= PARKOUR_CONFIG.LEDGE_MAX_HEIGHT + 0.08 &&
            b.maxY > bestY
          ) {
            // 2. Ledge Grab & Mantle window: 1.3m - 2.5m walls or mid-air rooftop lips
            const padX = Math.min(0.46, spanX * 0.35);
            const padZ = Math.min(0.46, spanZ * 0.35);
            const candidateTX = THREE.MathUtils.clamp(this.playerPos.x + _forward.x * (d + 0.45), b.minX + padX, b.maxX - padX);
            const candidateTZ = THREE.MathUtils.clamp(this.playerPos.z + _forward.z * (d + 0.45), b.minZ + padZ, b.maxZ - padZ);
            if (this.hasOverheadLandingClearance(candidateTX, b.maxY, candidateTZ, b.id)) {
              bestY = b.maxY;
              bestBox = b;
              bestLowVault = false;
              bestTX = candidateTX;
              bestTZ = candidateTZ;
            }
          }
        }
      }
    }

    return bestBox ? { box: bestBox, targetX: bestTX, targetZ: bestTZ, isLowVault: bestLowVault } : null;
  }

  private tryJumpOrMantle(): void {
    if (this.mantling || this.vaulting || this.rollTimer > 0) return;

    const movingFwd = Boolean(this.keys['KeyW']);
    const mantle = this.findMantleTarget();

    // 1. Moving forward (W) + Space right in front of a low obstacle triggers an instant Speed Vault!
    if (movingFwd && mantle && mantle.isLowVault) {
      this.beginVault(mantle.box, mantle.targetX, mantle.targetZ);
      return;
    }

    // 2. If grounded or inside 150ms coyote window, execute variable-height jump!
    if (this.onGround || this.coyoteTimer > 0) {
      const onRamp = this.playerPos.y > 0.16 && this.world.colliders.some(
        (b) =>
          b.ramp &&
          this.playerPos.x >= b.minX - 0.35 &&
          this.playerPos.x <= b.maxX + 0.35 &&
          this.playerPos.z >= b.minZ - 0.35 &&
          this.playerPos.z <= b.maxZ + 0.35,
      );
      if (onRamp) {
        this.playerVel.y = PARKOUR_CONFIG.RAMP_JUMP_FORCE;
        this.playerVel.x *= 1.18;
        this.playerVel.z *= 1.18;
        this.isVariableJump = false;
        this.triggerFlowBoost('RAMP LAUNCH', 0.28);
      } else {
        this.playerVel.y = this.isCrouching ? PARKOUR_CONFIG.CROUCH_JUMP_FORCE : PARKOUR_CONFIG.JUMP_FORCE;
        this.isVariableJump = true;
      }
      this.onGround = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.slideTimer = 0;
      this.airPeakY = this.playerPos.y;
      this.sound.playWindRush(0.45);
      return;
    }

    // 3. If airborne (or facing climbable wall) and pressing Space near an upper ledge, vault or mantle!
    if (mantle && movingFwd) {
      if (mantle.isLowVault) {
        this.beginVault(mantle.box, mantle.targetX, mantle.targetZ);
      } else {
        this.beginMantle(mantle.box, mantle.targetX, mantle.targetZ);
      }
    }
  }

  private beginMantle(b: BoxCollider, targetX: number, targetZ: number): void {
    this.preMantleSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.mantling = true;
    this.mantleTimer = 0;
    this.slideTimer = 0;
    this.isCrouching = false;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.isVariableJump = false;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.mantleStart.copy(this.playerPos);
    this.mantleEnd.set(targetX, b.maxY + 0.02, targetZ);
    this.airPeakY = this.mantleEnd.y;
    this.playerVel.set(0, 0, 0);
    this.jumpBufferTimer = 0;
    this.awardParkourCombo(PARKOUR_CONFIG.LEDGE_STYLE_POINTS, 'LEDGE MANTLE', 0.32);
    this.sound.playLedgeGrab(false);
  }

  private beginVault(b: BoxCollider, targetX: number, targetZ: number): void {
    this.preVaultSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.vaulting = true;
    this.vaultTimer = 0;
    this.slideTimer = 0;
    this.isCrouching = false;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.isVariableJump = false;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.vaultStart.copy(this.playerPos);
    const landedPast =
      targetX <= b.minX - PLAYER_RADIUS ||
      targetX >= b.maxX + PLAYER_RADIUS ||
      targetZ <= b.minZ - PLAYER_RADIUS ||
      targetZ >= b.maxZ + PLAYER_RADIUS;
    this.vaultEnd.set(targetX, landedPast ? Math.min(this.playerPos.y, b.minY) : b.maxY + 0.02, targetZ);
    this.vaultPeakY = b.maxY + 0.45;
    this.airPeakY = this.vaultEnd.y;
    this.jumpBufferTimer = 0;
    this.awardParkourCombo(PARKOUR_CONFIG.VAULT_STYLE_POINTS, 'SPEED VAULT', 0.36);
    this.sound.playLedgeGrab(true);
  }

  private updatePlayerPhysics(dt: number): void {
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - dt);
    this.rollBufferTimer = Math.max(0, this.rollBufferTimer - dt);
    this.ziplineDetachCooldown = Math.max(0, this.ziplineDetachCooldown - dt);
    this.parkourMoveTimer = Math.max(0, this.parkourMoveTimer - dt);

    if (this.postLandRollTimer > 0) {
      this.postLandRollTimer = Math.max(0, this.postLandRollTimer - dt);
      if (this.postLandRollTimer <= 0 && this.pendingHardFallDist > 4.8) {
        const fallDmg = Math.min(26, Math.round((this.pendingHardFallDist - 4.6) * 5));
        this.pendingHardFallDist = 0;
        if (fallDmg > 0) {
          this.health = Math.max(0, this.health - fallDmg);
          this.damageFlash = 0.48;
          this.sound.playPlayerHurt();
          if (this.health <= 0) {
            this.phase = 'gameover';
            this.intro.resetIdle();
            this.sound.stopContinuousLoops();
            this.sound.playGameOver();
            this.safeExitPointerLock();
          }
        }
      } else if (this.postLandRollTimer <= 0) {
        this.pendingHardFallDist = 0;
      }
    }

    if (this.flowDecayTimer > 0) {
      this.flowDecayTimer = Math.max(0, this.flowDecayTimer - dt);
    } else if (this.parkourFlow > 0) {
      this.parkourFlow = Math.max(0, this.parkourFlow - dt * 0.25);
    }

    this.fovPunch = THREE.MathUtils.lerp(this.fovPunch, 0, 1 - Math.exp(-dt * 10));

    // 0A. Zipline aerial traversal across Agra rooftops (19.0 m/s with parabolic sag)
    if (this.activeZipline) {
      const a = this.ziplineReverse ? this.activeZipline.end : this.activeZipline.start;
      const b = this.ziplineReverse ? this.activeZipline.start : this.activeZipline.end;
      const totalLen = a.distanceTo(b) || 1;
      this.ziplineT += (PARKOUR_CONFIG.ZIPLINE_SPEED * dt) / totalLen;
      const sag = Math.sin(Math.min(1, this.ziplineT) * Math.PI) * PARKOUR_CONFIG.ZIPLINE_SAG;
      if (Math.random() < dt * 16) {
        _tmpVecA.copy(this.playerPos).setY(this.playerPos.y + 1.88);
        this.viewmodel.spawnSparks(_tmpVecA, 0xfde047, 1);
      }
      this.sound.updateZiplineLoop(true, PARKOUR_CONFIG.ZIPLINE_SPEED);
      this.sound.updateWindLoop(true, PARKOUR_CONFIG.ZIPLINE_SPEED, this.comboCount);
      if (this.ziplineT >= 1) {
        this.playerPos.copy(b);
        this.dismountZipline(false);
      } else {
        this.playerPos.lerpVectors(a, b, this.ziplineT);
        this.playerPos.y -= sag;
        this.airPeakY = this.playerPos.y;
      }
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, PARKOUR_CONFIG.ZIPLINE_FOV, 1 - Math.exp(-dt * 10));
      this.camera.updateProjectionMatrix();
      return;
    } else {
      this.sound.updateZiplineLoop(false, 0);
    }

    // 0B. Watchtower Ladder Climbing
    if (!this.activeLadder && !this.mantling && !this.vaulting) {
      const climbUpInput = Boolean(this.keys['KeyW'] || this.keys['Space']);
      const climbDownInput = Boolean(this.keys['KeyS']);
      for (const lad of this.world.ladders) {
        if (
          this.playerPos.x >= lad.minX &&
          this.playerPos.x <= lad.maxX &&
          this.playerPos.z >= lad.minZ &&
          this.playerPos.z <= lad.maxZ &&
          this.playerPos.y >= lad.minY - 0.1 &&
          this.playerPos.y <= lad.maxY + 0.1
        ) {
          if ((climbUpInput && this.playerPos.y < lad.maxY - 0.12) || (climbDownInput && this.playerPos.y > 0.25)) {
            this.activeLadder = lad;
            this.slideTimer = 0;
            this.wallRunSide = 0;
            this.playerVel.set(0, 0, 0);
            break;
          }
        }
      }
    }

    if (this.activeLadder) {
      const lad = this.activeLadder;
      const cx = (lad.minX + lad.maxX) * 0.5;
      const cz = (lad.minZ + lad.maxZ) * 0.5;
      this.playerPos.x = THREE.MathUtils.lerp(this.playerPos.x, cx, Math.min(1, dt * 12));
      this.playerPos.z = THREE.MathUtils.lerp(this.playerPos.z, cz, Math.min(1, dt * 12));

      const climbDir =
        this.keys['KeyW'] || this.keys['Space'] ? 1 : this.keys['KeyS'] ? -1 : 0;
      this.playerPos.y += climbDir * (climbDir > 0 ? 3.85 : 3.4) * dt;
      this.playerVel.set(0, 0, 0);
      this.onGround = false;
      this.airPeakY = this.playerPos.y;

      if (climbDir !== 0) {
        this.ladderStepTimer -= dt;
        if (this.ladderStepTimer <= 0) {
          this.ladderStepTimer = 0.28;
          this.sound.playWallStep(Math.floor(this.elapsed * 4) % 4);
        }
      }

      if (this.playerPos.y >= lad.maxY - 0.08 && climbDir >= 0) {
        this.playerPos.set(lad.exitX, lad.exitY, lad.exitZ);
        this.activeLadder = null;
        this.onGround = true;
        this.airPeakY = this.playerPos.y;
        this.triggerFlowBoost('LADDER CLIMB', 0.2);
      } else if (this.playerPos.y <= lad.minY + 0.02 && climbDir < 0) {
        this.playerPos.y = lad.minY;
        this.activeLadder = null;
        this.onGround = true;
        this.airPeakY = this.playerPos.y;
      } else if (this.keys['KeyA'] || this.keys['KeyD']) {
        this.activeLadder = null;
      }
      return;
    }

    // 1A. Handle active Speed Vault (0.35s, 10 deg right camera tilt, left hand plants on top, full speed kept!)
    if (this.vaulting) {
      this.vaultTimer += dt;
      const t = Math.min(1, this.vaultTimer / PARKOUR_CONFIG.VAULT_DURATION);
      this.playerPos.x = THREE.MathUtils.lerp(this.vaultStart.x, this.vaultEnd.x, t);
      this.playerPos.z = THREE.MathUtils.lerp(this.vaultStart.z, this.vaultEnd.z, t);
      const baseY = THREE.MathUtils.lerp(this.vaultStart.y, this.vaultEnd.y, t);
      const lift = Math.max(0, this.vaultPeakY - baseY);
      this.playerPos.y = baseY + Math.sin(t * Math.PI) * lift;
      this.mantlePitchOffset = -Math.sin(t * Math.PI) * 0.11;
      // 10-degree tilt to the right (-Z roll in Three.js camera)
      this.mantleRollOffset = -Math.sin(t * Math.PI) * THREE.MathUtils.degToRad(PARKOUR_CONFIG.VAULT_TILT_DEG);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 86 + this.parkourFlow * 3, 1 - Math.exp(-dt * 12));
      this.camera.updateProjectionMatrix();
      if (t >= 1) {
        this.playerPos.copy(this.vaultEnd);
        this.vaulting = false;
        this.onGround = true;
        this.coyoteTimer = PARKOUR_CONFIG.COYOTE_TIME;
        this.airPeakY = this.playerPos.y;
        this.mantlePitchOffset = 0;
        this.mantleRollOffset = 0;
        const carrySpeed = Math.max(this.preVaultSpeed, MOVEMENT_CONFIG.SPRINT_SPEED * 0.92);
        this.playerVel.x = -Math.sin(this.yaw) * carrySpeed;
        this.playerVel.z = -Math.cos(this.yaw) * carrySpeed;
      }
      return;
    }

    // 1B. Handle active Ledge Mantle (0.1s catch fall-arrest dip + 0.45s upward/forward climb)
    if (this.mantling) {
      this.mantleTimer += dt;
      const catchDur = PARKOUR_CONFIG.LEDGE_CATCH_DURATION;
      const climbDur = PARKOUR_CONFIG.LEDGE_CLIMB_DURATION;
      const totalDur = catchDur + climbDur;
      if (this.mantleTimer < catchDur) {
        const ct = this.mantleTimer / catchDur;
        this.playerPos.x = THREE.MathUtils.lerp(this.mantleStart.x, this.mantleEnd.x, ct * 0.08);
        this.playerPos.z = THREE.MathUtils.lerp(this.mantleStart.z, this.mantleEnd.z, ct * 0.08);
        this.playerPos.y = this.mantleStart.y - Math.sin(ct * Math.PI) * 0.16;
        this.mantlePitchOffset = Math.sin(ct * Math.PI) * 0.11;
        this.mantleRollOffset = Math.sin(ct * Math.PI) * 0.04;
      } else {
        const u = Math.min(1, (this.mantleTimer - catchDur) / climbDur);
        const ease = 1 - Math.pow(1 - u, 3);
        this.playerPos.x = THREE.MathUtils.lerp(this.mantleStart.x, this.mantleEnd.x, 0.08 + ease * 0.92);
        this.playerPos.z = THREE.MathUtils.lerp(this.mantleStart.z, this.mantleEnd.z, 0.08 + ease * 0.92);
        this.playerPos.y = THREE.MathUtils.lerp(this.mantleStart.y, this.mantleEnd.y, ease) + Math.sin(u * Math.PI) * 0.14;
        this.mantlePitchOffset = -Math.sin(u * Math.PI) * 0.16;
        this.mantleRollOffset = Math.sin(u * Math.PI) * 0.055;
      }
      if (this.mantleTimer >= totalDur) {
        this.playerPos.copy(this.mantleEnd);
        this.mantling = false;
        this.onGround = true;
        this.coyoteTimer = PARKOUR_CONFIG.COYOTE_TIME;
        this.airPeakY = this.playerPos.y;
        this.mantlePitchOffset = 0;
        this.mantleRollOffset = 0;
        const wantsSprintCarry = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) || this.preMantleSpeed > 8.5;
        if (this.keys['KeyW'] || wantsSprintCarry) {
          const fwdSpeed = wantsSprintCarry ? Math.max(this.preMantleSpeed, 11.2 + this.parkourFlow * 2.0) : MOVEMENT_CONFIG.WALK_SPEED;
          this.playerVel.x = -Math.sin(this.yaw) * fwdSpeed;
          this.playerVel.z = -Math.cos(this.yaw) * fwdSpeed;
        }
      }
      return;
    }

    this.mantlePitchOffset = THREE.MathUtils.lerp(this.mantlePitchOffset, 0, Math.min(1, dt * 14));
    this.mantleRollOffset = THREE.MathUtils.lerp(this.mantleRollOffset, 0, Math.min(1, dt * 14));
    this.landingDipOffset = THREE.MathUtils.lerp(this.landingDipOffset, 0, Math.min(1, dt * 11));

    // Smooth yaw angular velocity for sprint-turn camera tilt
    const instYawRate = dt > 0.0001 ? this.lastYawMove / dt : 0;
    this.lastYawMove = 0;
    this.yawRate = THREE.MathUtils.lerp(this.yawRate, instYawRate, 1 - Math.exp(-dt * 14));

    // Smooth camera yaw toward Arkham lunge target
    if (this.targetYawGoal !== null) {
      let diff = ((this.targetYawGoal - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 16);
      if (Math.abs(diff) < 0.03) this.targetYawGoal = null;
    }

    // 2. Normalized directional input with Strafe (85%) & Backpedal (65%) scaling
    const rawFwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const rawStrafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    let inputX = rawStrafe;
    let inputZ = rawFwd;
    const inputLen = Math.hypot(inputX, inputZ);
    if (inputLen > 1) {
      inputX /= inputLen;
      inputZ /= inputLen;
    }
    const moving = inputLen > 0.001;

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const fwdScale = inputZ >= 0 ? 1.0 : MOVEMENT_CONFIG.BACKPEDAL_SCALE;
    const scaledRight = inputX * MOVEMENT_CONFIG.STRAFE_SCALE;
    const scaledFwd = inputZ * fwdScale;
    _moveDir.set(0, 0, 0).addScaledVector(_forward, scaledFwd).addScaledVector(_right, scaledRight);
    // Clamp combined vector length to 1.0 so diagonal movement never exceeds max speed
    const scaledLen = _moveDir.length();
    if (scaledLen > 1) {
      _moveDir.multiplyScalar(1 / scaledLen);
    }

    // Crouch state: hold C/Ctrl while slow, or remain crouched under low overhangs until clear
    const crouchHeld = Boolean(this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['KeyX']);
    if (this.slideTimer <= 0 && this.isCrouching && !crouchHeld && this.hasStandingClearance()) {
      this.isCrouching = false;
    }

    // Stamina & exhaustion lockout (cannot sprint again until stamina regenerates past 20%)
    const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    if (this.sprintExhausted && this.stamina >= MOVEMENT_CONFIG.STAMINA_RECOVERY_THRESHOLD) {
      this.sprintExhausted = false;
    }
    const isSprinting =
      wantsSprint &&
      rawFwd > 0 &&
      !this.sprintExhausted &&
      !this.isCrouching &&
      this.slideTimer <= 0 &&
      this.stamina > 0;

    if (isSprinting) {
      this.stamina = Math.max(0, this.stamina - MOVEMENT_CONFIG.STAMINA_DRAIN_RATE * dt);
      this.staminaPauseTimer = 0.65;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.sprintExhausted = true;
      }
    } else {
      this.staminaPauseTimer = Math.max(0, this.staminaPauseTimer - dt);
      if (this.staminaPauseTimer <= 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + MOVEMENT_CONFIG.STAMINA_REGEN_RATE * dt);
      }
    }

    // 0.45s continuous forward sprint momentum ramp
    if (isSprinting && rawFwd > 0) {
      this.sprintMomentum = Math.min(1, this.sprintMomentum + dt / MOVEMENT_CONFIG.SPRINT_RAMP_UP_TIME);
    } else {
      this.sprintMomentum = Math.max(0, this.sprintMomentum - dt / 0.28);
    }

    // Active Safety Landing Roll (360-degree forward camera pitch over 0.55s + 100% sprint momentum carry)
    if (this.rollTimer > 0) {
      this.rollTimer = Math.max(0, this.rollTimer - dt);
      const p = 1 - this.rollTimer / PARKOUR_CONFIG.ROLL_DURATION;
      this.rollPitchOffset = -p * Math.PI * 2;
      this.playerVel.x = this.rollDir.x * this.rollSpeed;
      this.playerVel.z = this.rollDir.z * this.rollSpeed;
      if (this.rollTimer <= 0) {
        this.rollPitchOffset = 0;
      }
    } else {
      this.rollPitchOffset = 0;
    }

    // Wall Run Detection & Traversal when airborne near vertical walls
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (!this.onGround && this.rollTimer <= 0 && rawFwd > 0) {
      const probe = this.probeWallRunSurface();
      if (this.wallRunSide !== 0) {
        if (this.wallRunTimer > 0 && probe && probe.side === this.wallRunSide) {
          this.wallRunTimer -= dt;
          this.wallRunNormal.set(probe.normalX, 0, probe.normalZ);
          this.wallRunTangent.set(probe.tangentX, 0, probe.tangentZ);
          this.wallRunStepTimer -= dt;
          if (this.wallRunStepTimer <= 0) {
            this.wallRunStepTimer = 0.22;
            this.wallRunStepCount++;
            this.sound.playWallStep(this.wallRunStepCount);
          }
          const wrSpeed = 12.2 + this.parkourFlow * 1.6;
          this.playerVel.x = this.wallRunTangent.x * wrSpeed;
          this.playerVel.z = this.wallRunTangent.z * wrSpeed;
          this.playerVel.y = Math.max(-1.8, this.playerVel.y - 7.0 * dt);
        } else {
          this.wallRunSide = 0;
          this.wallRunCooldown = 0.24;
        }
      } else if (
        this.wallRunCooldown <= 0 &&
        (wantsSprint || horizSpeed > 5.4) &&
        this.playerVel.y > -8.5 &&
        probe
      ) {
        this.wallRunSide = probe.side;
        this.wallRunTimer = 1.15;
        this.wallRunNormal.set(probe.normalX, 0, probe.normalZ);
        this.wallRunTangent.set(probe.tangentX, 0, probe.tangentZ);
        this.lastWallColliderId = probe.id;
        this.wallRunStepTimer = 0.03;
        this.wallRunStepCount = 1;
        this.playerVel.y = Math.max(this.playerVel.y, 2.5);
        this.triggerFlowBoost('WALL RUN', 0.35);
        this.sound.playWallStep(1);
        this.sound.playWindRush(0.55);
      }
    } else if (this.onGround || rawFwd <= 0) {
      this.wallRunSide = 0;
    }

    // 3. Smooth Ground Acceleration/Deceleration, Air Momentum, and Physics-Driven Parkour Slide
    const smoothSprint = this.sprintMomentum * this.sprintMomentum * (3 - 2 * this.sprintMomentum);
    const activeTopSpeed = this.isCrouching
      ? MOVEMENT_CONFIG.CROUCH_SPEED
      : THREE.MathUtils.lerp(MOVEMENT_CONFIG.WALK_SPEED, MOVEMENT_CONFIG.SPRINT_SPEED, smoothSprint);

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      this.playerVel.x = this.lungeVel.x;
      this.playerVel.z = this.lungeVel.z;
      this.sound.updateSlideLoop(false, 0);
    } else if (this.rollTimer > 0) {
      this.sound.updateSlideLoop(false, 0);
    } else if (this.wallRunSide !== 0) {
      this.sound.updateSlideLoop(false, 0);
    } else if (this.slideTimer > 0) {
      this.slideDuration += dt;
      this.slideDustTimer -= dt;
      if (this.slideDustTimer <= 0) {
        this.slideDustTimer = 0.085;
        this.viewmodel.spawnDustPuffs(this.playerPos, 3);
      }

      // Subtle steering along facing direction during slide
      const faceX = -Math.sin(this.yaw);
      const faceZ = -Math.cos(this.yaw);
      this.slideDir.x = THREE.MathUtils.lerp(this.slideDir.x, faceX, 1 - Math.exp(-dt * 2.2));
      this.slideDir.z = THREE.MathUtils.lerp(this.slideDir.z, faceZ, 1 - Math.exp(-dt * 2.2));
      this.slideDir.normalize();

      // Downhill slope detection beneath player
      const hAhead = this.sampleGroundHeight(
        this.playerPos.x + this.slideDir.x * 0.45,
        this.playerPos.z + this.slideDir.z * 0.45,
      );
      const hBehind = this.sampleGroundHeight(
        this.playerPos.x - this.slideDir.x * 0.45,
        this.playerPos.z - this.slideDir.z * 0.45,
      );
      const slopeAlongDir = (hAhead - hBehind) / 0.9;

      if (this.onGround && slopeAlongDir < -0.05) {
        // Sliding downhill on a ramp/rooftop: reduce friction & accelerate up to 18.0 m/s
        const sinTheta = -slopeAlongDir / Math.hypot(1, slopeAlongDir);
        this.slideSpeed = Math.min(
          MOVEMENT_CONFIG.SLIDE_DOWNHILL_MAX_SPEED,
          this.slideSpeed + 22 * sinTheta * dt,
        );
        this.slideTimer = Math.max(this.slideTimer, 0.35);
      } else {
        // Flat/uphill ground friction decaying 15.5 -> 4.5 m/s over ~0.95s (0.85s-1.1s)
        const uphillExtra = slopeAlongDir > 0.05 ? slopeAlongDir * 2.4 : 0;
        this.slideSpeed *= Math.exp(-(1.3 + uphillExtra) * dt);
        this.slideTimer -= dt;
      }

      this.playerVel.x = this.slideDir.x * this.slideSpeed;
      this.playerVel.z = this.slideDir.z * this.slideSpeed;

      // Continuous velocity-scaled slide foley loop
      this.sound.updateSlideLoop(this.onGround, this.slideSpeed);

      // Slide knocks down/trips zombies in path
      for (const z of this.zombies.zombies) {
        if (z.state === 'dead' || z.state === 'stunned') continue;
        if (this.playerPos.distanceTo(z.pos) < 1.9 && Math.abs(this.playerPos.y - z.pos.y) < 1.5) {
          const killed = this.zombies.damageZombie(z, 14, this.slideDir, 10.2, 1.25);
          if (killed) this.killCount++;
          this.sound.playKick(true);
        }
      }

      // Freeflow Combo integration: sliding under low obstacle OR maintaining slide >= 0.6s
      if (!this.hasStandingClearance()) {
        this.slideUnderObstacle = true;
      }
      if (
        !this.slideRewarded &&
        (this.slideUnderObstacle || this.slideDuration >= MOVEMENT_CONFIG.SLIDE_FREEFLOW_TIME)
      ) {
        this.slideRewarded = true;
        this.stylePoints += 50;
        if (this.comboCount === 0) {
          this.comboCount = 1;
        }
        if (this.comboCount > this.maxCombo) {
          this.maxCombo = this.comboCount;
        }
        this.comboTimer = 4.8;
        this.triggerFlowBoost(
          this.slideUnderObstacle ? 'LOW SLIDE · +50 STYLE' : 'POWER SLIDE · +50 STYLE',
          0.35,
        );
        this.sound.playComboChime(this.comboCount);
      }

      // End slide on release, dropping below 4.5 m/s, or duration end (checking ceiling clearance)
      if (!crouchHeld || this.slideSpeed < MOVEMENT_CONFIG.SLIDE_STOP_SPEED || this.slideTimer <= 0) {
        this.slideTimer = 0;
        this.sound.updateSlideLoop(false, 0);
        const clear = this.hasStandingClearance();
        this.isCrouching = crouchHeld || !clear;
      }
    } else {
      this.sound.updateSlideLoop(false, 0);
      const desiredVx = _moveDir.x * activeTopSpeed;
      const desiredVz = _moveDir.z * activeTopSpeed;

      if (this.onGround) {
        if (moving) {
          // Smooth ramp up over 0.15s (frame-rate independent exponential curve)
          const tau = MOVEMENT_CONFIG.WALK_RAMP_UP_TIME / 3;
          const alpha = 1 - Math.exp(-dt / tau);
          this.playerVel.x = THREE.MathUtils.lerp(this.playerVel.x, desiredVx, alpha);
          this.playerVel.z = THREE.MathUtils.lerp(this.playerVel.z, desiredVz, alpha);
        } else {
          // Grounded deceleration stop over 0.12s
          const tau = MOVEMENT_CONFIG.WALK_DECEL_TIME / 3;
          const alpha = 1 - Math.exp(-dt / tau);
          this.playerVel.x = THREE.MathUtils.lerp(this.playerVel.x, 0, alpha);
          this.playerVel.z = THREE.MathUtils.lerp(this.playerVel.z, 0, alpha);
          if (Math.hypot(this.playerVel.x, this.playerVel.z) < 0.04) {
            this.playerVel.x = 0;
            this.playerVel.z = 0;
          }
        }
      } else {
        // Airborne: preserve horizontal takeoff momentum while allowing 35% directional air-control
        if (moving) {
          const wishSpeed = rawFwd > 0 ? Math.max(horizSpeed, activeTopSpeed) : activeTopSpeed;
          const wishDirLen = _moveDir.length() || 1;
          const wishVx = (_moveDir.x / wishDirLen) * wishSpeed;
          const wishVz = (_moveDir.z / wishDirLen) * wishSpeed;
          const airTau = (MOVEMENT_CONFIG.WALK_RAMP_UP_TIME / 3) / MOVEMENT_CONFIG.AIR_CONTROL_FACTOR;
          const airAlpha = 1 - Math.exp(-dt / airTau);
          const nextVx = THREE.MathUtils.lerp(this.playerVel.x, wishVx, airAlpha);
          const nextVz = THREE.MathUtils.lerp(this.playerVel.z, wishVz, airAlpha);
          const nextSpd = Math.hypot(nextVx, nextVz);
          const airCap = Math.max(horizSpeed, activeTopSpeed);
          if (nextSpd > airCap && nextSpd > 0.001) {
            const scale = airCap / nextSpd;
            this.playerVel.x = nextVx * scale;
            this.playerVel.z = nextVz * scale;
          } else {
            this.playerVel.x = nextVx;
            this.playerVel.z = nextVz;
          }
        }
      }
    }

    // Smooth camera eye height interpolation (1.7m stand -> 0.95m crouch -> 0.75m slide)
    const targetEyeOff =
      this.rollTimer > 0
        ? -Math.sin((1 - this.rollTimer / PARKOUR_CONFIG.ROLL_DURATION) * Math.PI) * 0.78
        : this.slideTimer > 0
          ? MOVEMENT_CONFIG.SLIDE_EYE_HEIGHT - MOVEMENT_CONFIG.STAND_EYE_HEIGHT
          : this.isCrouching
            ? MOVEMENT_CONFIG.CROUCH_EYE_HEIGHT - MOVEMENT_CONFIG.STAND_EYE_HEIGHT
            : 0;
    this.eyeHeightOffset = THREE.MathUtils.lerp(
      this.eyeHeightOffset,
      targetEyeOff,
      1 - Math.exp(-dt * 15),
    );

    // Update coyote & jump buffer timers + airborne fall peak tracking
    if (this.onGround) {
      this.coyoteTimer = PARKOUR_CONFIG.COYOTE_TIME;
      this.lastWallColliderId = '';
      this.airPeakY = this.playerPos.y;
      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer = 0;
        this.playerVel.y = this.isCrouching ? PARKOUR_CONFIG.CROUCH_JUMP_FORCE : PARKOUR_CONFIG.JUMP_FORCE;
        this.isVariableJump = true;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.sound.playWindRush(0.42);
      }
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      this.airPeakY = Math.max(this.airPeakY, this.playerPos.y);
    }

    // Gravity (skip full gravity while wall-running)
    if (this.wallRunSide === 0) {
      this.playerVel.y -= PARKOUR_CONFIG.GRAVITY * dt;
    }

    // Auto-attach airborne zip-line if flying near a rooftop cable
    const airZip = this.findAirborneZipline();
    if (airZip) {
      this.attachZipline(airZip.route, airZip.reverse, airZip.t);
      return;
    }

    // Context-sensitive Speed Vault & Ledge Grab / Auto-Mantle detection
    const mantlePreview = this.findMantleTarget();
    this.canMantle = mantlePreview !== null;
    const autoVaultIntoLow =
      this.onGround &&
      isSprinting &&
      rawFwd > 0 &&
      this.slideTimer <= 0 &&
      mantlePreview !== null &&
      mantlePreview.isLowVault;
    const autoAirLedge =
      !this.onGround &&
      this.rollTimer <= 0 &&
      rawFwd > 0 &&
      (this.playerVel.y < 6.4 || this.keys['Space'] || this.wallRunSide !== 0) &&
      mantlePreview !== null;
    const holdSpaceClimb =
      this.onGround &&
      Boolean(this.keys['Space']) &&
      rawFwd > 0 &&
      mantlePreview !== null &&
      !mantlePreview.isLowVault;

    if (autoVaultIntoLow || autoAirLedge || holdSpaceClimb) {
      if (mantlePreview!.isLowVault && (isSprinting || wantsSprint)) {
        this.beginVault(mantlePreview!.box, mantlePreview!.targetX, mantlePreview!.targetZ);
      } else {
        this.beginMantle(mantlePreview!.box, mantlePreview!.targetX, mantlePreview!.targetZ);
      }
      return;
    }

    // Integrate X/Z then resolve horizontal collisions using dynamic crouch/slide height
    this.playerPos.x += this.playerVel.x * dt;
    this.playerPos.z += this.playerVel.z * dt;

    const currentPlayerHeight =
      this.slideTimer > 0
        ? MOVEMENT_CONFIG.PLAYER_SLIDE_HEIGHT
        : this.isCrouching
          ? MOVEMENT_CONFIG.PLAYER_CROUCH_HEIGHT
          : MOVEMENT_CONFIG.PLAYER_STAND_HEIGHT;

    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      const boxTop = this.getColliderTopAt(b, this.playerPos.x, this.playerPos.z);
      if (this.playerPos.y >= boxTop - 0.12 || this.playerPos.y + currentPlayerHeight < b.minY) continue;

      const closestX = Math.max(b.minX, Math.min(this.playerPos.x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(this.playerPos.z, b.maxZ));
      const dx = this.playerPos.x - closestX;
      const dz = this.playerPos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (b.ramp && this.playerPos.y >= boxTop - 0.72) {
          this.playerPos.y = boxTop;
        } else if (this.onGround && boxTop - this.playerPos.y <= 0.64) {
          this.playerPos.y = boxTop;
        } else {
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = dx / dist;
          const nz = dz / dist;
          const push = PLAYER_RADIUS - dist;
          this.playerPos.x += nx * push;
          this.playerPos.z += nz * push;
          // Slide velocity cleanly along corners/edges instead of dead-stopping momentum
          const vn = this.playerVel.x * nx + this.playerVel.z * nz;
          if (vn < 0) {
            this.playerVel.x -= nx * vn;
            this.playerVel.z -= nz * vn;
          }
        }
      }
    }

    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -44.2, 44.2);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -93, 49.5);

    // Integrate Y and resolve ground / roof / thin bridge planks / sloped ramps
    const prevY = this.playerPos.y;
    const impactVel = this.playerVel.y;
    this.playerPos.y += this.playerVel.y * dt;

    let groundHeight = 0;
    let landedCushion = false;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (
        this.playerPos.x + PLAYER_RADIUS * 0.72 > b.minX &&
        this.playerPos.x - PLAYER_RADIUS * 0.72 < b.maxX &&
        this.playerPos.z + PLAYER_RADIUS * 0.72 > b.minZ &&
        this.playerPos.z - PLAYER_RADIUS * 0.72 < b.maxZ
      ) {
        const topY = this.getColliderTopAt(b, this.playerPos.x, this.playerPos.z);
        const snapMargin = b.ramp ? 0.7 : 0.34;
        if (prevY >= topY - snapMargin && this.playerPos.y <= topY + (b.ramp ? 0.28 : 0.04)) {
          if (topY >= groundHeight) {
            groundHeight = topY;
            landedCushion = Boolean(b.cushion);
          }
        }
      }
    }

    if (this.playerPos.y <= groundHeight) {
      if (!this.onGround) {
        const fallDistance = Math.max(0, this.airPeakY - groundHeight);
        const absImpact = Math.abs(impactVel);
        const isHardFall = fallDistance > PARKOUR_CONFIG.HARD_LAND_FALL_DIST || absImpact > 12.2;

        if (isHardFall && (this.rollBufferTimer > 0 || landedCushion)) {
          this.preRollSpeed = Math.max(horizSpeed, MOVEMENT_CONFIG.SPRINT_SPEED);
          this.startSafetyRoll(fallDistance);
          if (landedCushion) this.sound.playTarpLand();
        } else if (landedCushion) {
          this.sound.playTarpLand();
          this.landingDipOffset = -0.18;
        } else if (isHardFall) {
          // Hard landing (> 3.5m): downward compression dip, FOV punch, velocity-scaled 80Hz thud, & 0.25s Safety Roll window
          const severity = THREE.MathUtils.clamp((fallDistance - 3.5) / 5.0, 0.2, 1.0);
          this.sound.playLandingThud(true, absImpact);
          this.cameraShake = 0.16 + severity * 0.16;
          this.landingDipOffset = -(0.24 + severity * 0.2);
          this.fovPunch = -(4.5 + severity * 4.5);
          this.viewmodel.spawnDustPuffs(this.playerPos, 9 + Math.round(severity * 4));
          this.postLandRollTimer = PARKOUR_CONFIG.ROLL_WINDOW;
          this.pendingHardFallDist = fallDistance;
          this.preRollSpeed = Math.max(horizSpeed, MOVEMENT_CONFIG.SPRINT_SPEED);
        } else if (impactVel < -5.8) {
          this.sound.playLandingThud(false, absImpact);
          this.cameraShake = 0.08;
          this.landingDipOffset = -0.13;
          this.viewmodel.spawnDustPuffs(this.playerPos, 4);
        }
      }

      this.playerPos.y = groundHeight;
      this.playerVel.y = 0;
      this.onGround = true;
      this.isVariableJump = false;
      this.wallRunSide = 0;
      this.airPeakY = groundHeight;

      // Immediate buffered jump bounce on touchdown!
      if (this.jumpBufferTimer > 0 && this.rollTimer <= 0) {
        this.jumpBufferTimer = 0;
        this.playerVel.y = this.isCrouching ? PARKOUR_CONFIG.CROUCH_JUMP_FORCE : PARKOUR_CONFIG.JUMP_FORCE;
        this.isVariableJump = true;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.sound.playWindRush(0.45);
      }
    } else {
      this.onGround = false;
    }

    // Smooth Dynamic FOV: 75° Base -> 84° Full Sprint -> 90° Sprint + 2x Freeflow Combo (plus landing FOV punch)
    const postHorizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    const speedSprintFactor = THREE.MathUtils.clamp(
      (postHorizSpeed - MOVEMENT_CONFIG.WALK_SPEED) /
        (MOVEMENT_CONFIG.SPRINT_SPEED - MOVEMENT_CONFIG.WALK_SPEED),
      0,
      1,
    );
    const sprintTargetFov =
      isSprinting && this.comboCount >= 2
        ? THREE.MathUtils.lerp(MOVEMENT_CONFIG.BASE_FOV, MOVEMENT_CONFIG.MAX_FOV, speedSprintFactor)
        : THREE.MathUtils.lerp(MOVEMENT_CONFIG.BASE_FOV, MOVEMENT_CONFIG.SPRINT_FOV, speedSprintFactor);

    const targetFov =
      (this.dropkickTimer > 0 || this.slideTimer > 0 || this.rollTimer > 0
        ? MOVEMENT_CONFIG.MAX_FOV
        : this.wallRunSide !== 0
          ? 87
          : sprintTargetFov) + this.fovPunch;

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-dt * 11));
      this.camera.updateProjectionMatrix();
    }

    // Continuous subtle high-pass wind rush when > 12.5 m/s or during 2x+ Freeflow Combo
    this.sound.updateWindLoop(true, postHorizSpeed, this.comboCount);
  }

  private syncCameraToPlayer(dt: number): void {
    const safeDt = dt > 0 ? dt : 0.016;
    const moveMag = Math.hypot(this.playerVel.x, this.playerVel.z);
    const isBobbing =
      (this.onGround || this.wallRunSide !== 0) &&
      moveMag > 0.7 &&
      !this.mantling &&
      !this.vaulting &&
      this.slideTimer <= 0 &&
      this.rollTimer <= 0 &&
      !this.activeLadder &&
      !this.activeZipline;

    const sprintRatio = THREE.MathUtils.clamp(
      (moveMag - MOVEMENT_CONFIG.WALK_SPEED) /
        (MOVEMENT_CONFIG.SPRINT_SPEED - MOVEMENT_CONFIG.WALK_SPEED),
      0,
      1,
    );

    if (isBobbing) {
      const freq = THREE.MathUtils.lerp(
        MOVEMENT_CONFIG.BOB_WALK_FREQ,
        MOVEMENT_CONFIG.BOB_SPRINT_FREQ,
        sprintRatio,
      );
      const ampBase = THREE.MathUtils.lerp(
        MOVEMENT_CONFIG.BOB_WALK_AMP,
        MOVEMENT_CONFIG.BOB_SPRINT_AMP,
        sprintRatio,
      );
      const amp = this.isCrouching ? ampBase * 0.65 : ampBase;

      this.bobPhase += safeDt * freq;
      const cosVal = Math.cos(this.bobPhase);
      // Trigger footstep foley exactly at the bottom trough of every head-bob cycle (sin = -1)
      if (this.onGround && this.prevBobCos < 0 && cosVal >= 0) {
        this.sound.playFootstep(sprintRatio, this.isCrouching);
      }
      this.prevBobCos = cosVal;

      const targetStrength = THREE.MathUtils.clamp(moveMag / MOVEMENT_CONFIG.WALK_SPEED, 0, 1);
      this.bobStrength = THREE.MathUtils.lerp(this.bobStrength, targetStrength, 1 - Math.exp(-safeDt * 14));
      this.bobY = Math.sin(this.bobPhase) * amp * this.bobStrength;
      this.bobX = Math.cos(this.bobPhase * 0.5) * amp * 0.55 * this.bobStrength;
    } else {
      // Smoothly damp head-bob back to 0 when idle, airborne, or sliding
      this.bobStrength = THREE.MathUtils.lerp(this.bobStrength, 0, 1 - Math.exp(-safeDt * 12));
      this.bobY = THREE.MathUtils.lerp(this.bobY, 0, 1 - Math.exp(-safeDt * 12));
      this.bobX = THREE.MathUtils.lerp(this.bobX, 0, 1 - Math.exp(-safeDt * 12));
      this.prevBobCos = 1;
    }

    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shakeX = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.25 : 0;
    const shakeY = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.25 : 0;
    const zipVibX = this.activeZipline ? Math.sin(this.elapsed * 68) * 0.009 : 0;
    const zipVibY = this.activeZipline ? Math.cos(this.elapsed * 74) * 0.009 : 0;

    this.camera.position.set(
      this.playerPos.x + _right.x * this.bobX + shakeX + zipVibX,
      this.playerPos.y + PLAYER_EYE_HEIGHT + this.eyeHeightOffset + this.landingDipOffset + this.bobY + shakeY + zipVibY,
      this.playerPos.z + _right.z * this.bobX,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = THREE.MathUtils.clamp(this.pitch + this.mantlePitchOffset, -1.45, 1.45) + this.rollPitchOffset;

    // Strafe Roll (±2.5 deg), Sprint Turn Roll (±4.0 deg), Slide Roll (-6.0 deg), & Zip-line sway
    const strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const strafeTiltRad = -strafe * THREE.MathUtils.degToRad(MOVEMENT_CONFIG.STRAFE_TILT_DEG);
    const sprintTurnFactor =
      moveMag > MOVEMENT_CONFIG.WALK_SPEED + 1.0
        ? THREE.MathUtils.clamp(this.yawRate * 0.25, -1, 1) * sprintRatio
        : 0;
    const sprintTurnTiltRad = sprintTurnFactor * THREE.MathUtils.degToRad(MOVEMENT_CONFIG.SPRINT_TURN_TILT_DEG);
    const slideRollRad = this.slideTimer > 0 ? THREE.MathUtils.degToRad(MOVEMENT_CONFIG.SLIDE_ROLL_DEG) : 0;
    const wallRunRollRad = this.wallRunSide * -0.22;
    const zipSwayRollRad = this.activeZipline ? Math.sin(this.elapsed * 4.5) * 0.032 : 0;

    const targetRoll =
      strafeTiltRad + sprintTurnTiltRad + this.mantleRollOffset + slideRollRad + wallRunRollRad + zipSwayRollRad;
    this.camera.rotation.z = THREE.MathUtils.lerp(
      this.camera.rotation.z,
      targetRoll,
      1 - Math.exp(-safeDt * 12),
    );
  }

  private computeViewmodelWallPullback(): number {
    _tmpVecA.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let closestHit = 1.0;
    const steps = 6;
    const maxDist = 0.88;
    const minDist = 0.24;

    for (let s = 1; s <= steps; s++) {
      const dist = (s / steps) * maxDist;
      const px = this.camera.position.x + _tmpVecA.x * dist;
      const py = this.camera.position.y + _tmpVecA.y * dist;
      const pz = this.camera.position.z + _tmpVecA.z * dist;

      for (let i = 0; i < this.world.colliders.length; i++) {
        const b = this.world.colliders[i];
        if (b.ramp) continue;
        if (
          px >= b.minX - 0.14 &&
          px <= b.maxX + 0.14 &&
          pz >= b.minZ - 0.14 &&
          pz <= b.maxZ + 0.14 &&
          py >= b.minY - 0.12 &&
          py <= b.maxY + 0.12
        ) {
          closestHit = Math.min(closestHit, dist);
          break;
        }
      }
      if (closestHit < maxDist) break;
    }

    if (closestHit >= maxDist) return 0;
    return THREE.MathUtils.clamp((maxDist - closestHit) / (maxDist - minDist), 0, 1);
  }

  // =========================================================================
  // DYNAMIC DAY / NIGHT CYCLE WITH GOLDEN DUSK SKY & NIGHTFALL ATMOSPHERE
  // =========================================================================
  private isNightTime(): boolean {
    return TimeOfDayLightingSystem.isNightTime(this.timeOfDay);
  }

  private formatClock24h(): string {
    return TimeOfDayLightingSystem.formatClock24h(this.timeOfDay);
  }

  private getTimeLabel(): string {
    return TimeOfDayLightingSystem.getTimeLabel(this.timeOfDay);
  }

  private updateAtmosphere(dt: number): void {
    if (this.phase === 'playing' && !this.intro.isIntroPlaying) {
      this.timeOfDay = (this.timeOfDay + dt / FULL_CYCLE_SECONDS) % 1;
    }

    const isNight = this.isNightTime();

    if (this.phase === 'playing' && isNight && !this.wasNight) {
      if (!this.flashlightOn) {
        this.flashlightOn = true;
        this.flashlight.intensity = 6.5;
        this.sound.playFlashlightClick();
      }
      if (!this.nightSubtitleShown) {
        this.nightSubtitleShown = true;
        this.setSubtitle(
          'OVERWATCH RADIO',
          'Nightfall! UV lights are active at the Taj Mahal. Night Runners are hunting — watch your back!',
          8.5,
        );
      }
    }
    this.wasNight = isNight;

    this.lighting.update({
      timeOfDay: this.timeOfDay,
      elapsed: this.elapsed,
      cameraPos: this.camera.position,
      uvLights: this.world.uvLights,
      floodLights: this.world.floodLights,
      stringBulbMats: this.world.stringBulbMats,
    });
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000));
      this.lastNow = now;

      let timeScale = 1.0;
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
        timeScale = 0.03;
      } else if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - rawDt);
        timeScale = 0.28;
      }
      const dt = rawDt * timeScale;
      this.elapsed += dt;

      if (this.phase === 'playing') {
        this.world.updateWorldProps(this.elapsed);
        if (!this.radioOpen) {
          if (this.intro.isIntroPlaying) {
            this.intro.update(rawDt, false, this.introCamState);
            if (this.intro.isIntroPlaying) {
              this.pitch = this.introCamState.pitch;
              this.camera.fov = this.introCamState.fov;
              this.camera.updateProjectionMatrix();
              this.camera.position.set(
                this.playerPos.x,
                this.playerPos.y + PLAYER_EYE_HEIGHT,
                this.playerPos.z,
              );
              this.camera.rotation.order = 'YXZ';
              this.camera.rotation.y = this.world.spawnYaw;
              this.camera.rotation.x = this.introCamState.pitch;
              this.camera.rotation.z = this.introCamState.roll;
            } else {
              this.pitch = 0.02;
              this.camera.fov = MOVEMENT_CONFIG.BASE_FOV;
              this.camera.rotation.z = 0;
              this.camera.updateProjectionMatrix();
            }

            this.viewmodel.update(
              dt,
              this.elapsed,
              0,
              false,
              false,
              false,
              false,
              false,
              false,
              false,
              false,
              0,
              false,
              () => {},
              {
                bobX: 0,
                bobY: 0,
                strafeInput: 0,
                vaultProgress: 0,
                mantleProgress: 0,
                rollProgress: 0,
                isNight: false,
                inSafeZone: true,
                horizSpeed: 0,
                yawDelta: 0,
                pitchDelta: 0,
                wallPullback: 0,
              },
            );
          } else {
            this.playTimeSeconds += rawDt;
            this.attackCooldown = Math.max(0, this.attackCooldown - rawDt);
            this.kickCooldown = Math.max(0, this.kickCooldown - rawDt);
            this.dropkickTimer = Math.max(0, this.dropkickTimer - rawDt);
            this.slideCooldown = Math.max(0, this.slideCooldown - rawDt);
            this.firecrackerCooldown = Math.max(0, this.firecrackerCooldown - rawDt);
            this.cameraShake = Math.max(0, this.cameraShake - rawDt * 1.6);
            this.damageFlash = Math.max(0, this.damageFlash - rawDt * 2.2);
            this.parryFlash = Math.max(0, this.parryFlash - rawDt * 2.4);

            for (let i = this.directionalHits.length - 1; i >= 0; i--) {
              this.directionalHits[i].intensity -= rawDt * 1.35;
              if (this.directionalHits[i].intensity <= 0) {
                this.directionalHits.splice(i, 1);
              }
            }

            if (this.comboCount > 0) {
              this.comboTimer -= rawDt;
              if (this.comboTimer <= 0) {
                this.comboCount = 0;
                this.comboTimer = 0;
              }
            }

            if (this.subtitleTimer > 0) {
              this.subtitleTimer = Math.max(0, this.subtitleTimer - rawDt);
            }

            this.updatePlayerPhysics(dt);
            this.syncCameraToPlayer(dt);

            const horizVelMag = Math.hypot(this.playerVel.x, this.playerVel.z);
            const moveSpeedRatio = Math.min(1, horizVelMag / MOVEMENT_CONFIG.WALK_SPEED);
            const isSprinting =
              Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
              !this.sprintExhausted &&
              !this.isCrouching &&
              this.sprintMomentum > 0.25 &&
              horizVelMag > MOVEMENT_CONFIG.WALK_SPEED + 0.5;
            this.intro.update(rawDt, isSprinting, this.introCamState);
            const isLookingDown = this.onGround && this.pitch < -0.72;

            const strafeInput = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
            const mantleTotalDur = PARKOUR_CONFIG.LEDGE_CATCH_DURATION + PARKOUR_CONFIG.LEDGE_CLIMB_DURATION;
            const safeZone = this.world.tajSafeZone;
            const inSafeZone =
              this.playerPos.z <= safeZone.maxZ &&
              this.playerPos.x >= safeZone.minX &&
              this.playerPos.x <= safeZone.maxX;

            this.viewmodel.update(
              dt,
              this.elapsed,
              moveSpeedRatio,
              isSprinting,
              this.mantling,
              !this.onGround,
              this.canMantle,
              this.slideTimer > 0,
              this.activeZipline !== null,
              this.vaulting,
              isLookingDown,
              this.wallRunSide,
              this.rollTimer > 0,
              () => {
                this.sound.playFirecrackerBang();
              },
              {
                bobX: this.bobX,
                bobY: this.bobY,
                strafeInput,
                vaultProgress: this.vaulting ? Math.min(1, this.vaultTimer / PARKOUR_CONFIG.VAULT_DURATION) : 0,
                mantleProgress: this.mantling ? Math.min(1, this.mantleTimer / mantleTotalDur) : 0,
                rollProgress: this.rollTimer > 0 ? 1 - this.rollTimer / PARKOUR_CONFIG.ROLL_DURATION : 0,
                isNight: this.isNightTime(),
                inSafeZone,
                horizSpeed: horizVelMag,
                yawDelta: this.viewmodelYawDelta,
                pitchDelta: this.viewmodelPitchDelta,
                wallPullback: this.computeViewmodelWallPullback(),
              },
            );
            this.viewmodelYawDelta = 0;
            this.viewmodelPitchDelta = 0;

            const lurePos = this.viewmodel.getActiveLurePosition();
            this.zombies.update(
              dt,
              this.playerPos,
              this.isNightTime(),
              lurePos,
              this.world.colliders,
              this.world.tajSafeZone,
              (dmg, attackerPos) => {
                this.health = Math.max(0, this.health - dmg);
                this.comboCount = 0;
                this.comboTimer = 0;
                this.damageFlash = 0.72;
                this.cameraShake = 0.28;
                this.sound.playPlayerHurt();

                // Directional damage indicator pointing toward side/rear attacker
                const dx = attackerPos.x - this.playerPos.x;
                const dz = attackerPos.z - this.playerPos.z;
                const fwdX = -Math.sin(this.yaw);
                const fwdZ = -Math.cos(this.yaw);
                const rightX = Math.cos(this.yaw);
                const rightZ = -Math.sin(this.yaw);
                const relAngleRad = Math.atan2(dx * rightX + dz * rightZ, dx * fwdX + dz * fwdZ);
                if (Math.abs(relAngleRad) > 0.35) {
                  this.directionalHits.push({
                    id: this.nextHitId++,
                    angleRad: relAngleRad,
                    intensity: 1.0,
                  });
                  if (this.directionalHits.length > 5) this.directionalHits.shift();
                }

                if (this.health <= 0) {
                  this.phase = 'gameover';
                  this.intro.resetIdle();
                  this.sound.stopContinuousLoops();
                  this.sound.playGameOver();
                  this.safeExitPointerLock();
                }
                this.emitHud();
              },
              (kind) => this.sound.playZombieGroan(kind),
            );

            this.world.crates.forEach((c) => {
              if (!c.collected) {
                c.beaconRing.position.y = 1.2 + Math.sin(this.elapsed * 3.2) * 0.14;
                c.beaconRing.rotation.z = this.elapsed * 1.4;
              }
            });

            const allCollected = this.world.crates.every((c) => c.collected);
            const sz = this.world.tajSafeZone;
            if (
              allCollected &&
              this.playerPos.z <= sz.maxZ &&
              this.playerPos.x >= sz.minX &&
              this.playerPos.x <= sz.maxX
            ) {
              this.phase = 'victory';
              this.intro.resetIdle();
              this.sound.stopContinuousLoops();
              this.sound.playVictory();
              this.safeExitPointerLock();
              this.emitHud();
            }
          }
        }
        this.world.updateGuard(this.elapsed, this.playerPos, this.radioOpen);
      } else if (this.phase === 'start') {
        this.sound.stopContinuousLoops();
        this.world.updateWorldProps(this.elapsed);
        this.camera.position.set(
          -28.0 + Math.sin(this.elapsed * 0.16) * 1.4,
          6.8 + Math.cos(this.elapsed * 0.22) * 0.15,
          42.5,
        );
        this.camera.lookAt(0, 7.5, -72);
        this.world.updateGuard(this.elapsed, this.playerPos, false);
      } else {
        this.sound.stopContinuousLoops();
      }

      this.updateAtmosphere(this.radioOpen ? 0 : dt);
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      this.hudThrottle += rawDt;
      if (this.hudThrottle >= 0.04) {
        this.hudThrottle = 0;
        this.emitHud();
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private emitHud(): void {
    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = this.mountEl.clientHeight || window.innerHeight;
    const counterIndicators: CounterIndicator[] = [];

    if (this.phase === 'playing' && !this.intro.isIntroPlaying) {
      for (const z of this.zombies.zombies) {
        if (z.state !== 'windup') continue;
        const headOffset = z.kind === 'brute' ? 2.85 : z.kind === 'dog' ? 1.15 : 2.15;
        _projVec.set(z.pos.x, z.pos.y + headOffset, z.pos.z);
        _projVec.project(this.camera);
        if (_projVec.z > 0 && _projVec.z < 1) {
          const rawSx = (_projVec.x * 0.5 + 0.5) * w;
          const rawSy = (-_projVec.y * 0.5 + 0.5) * h;
          if (rawSx >= -40 && rawSx <= w + 40 && rawSy >= -40 && rawSy <= h + 40) {
            counterIndicators.push({
              id: z.id,
              x: Math.max(40, Math.min(w - 40, rawSx)),
              y: Math.max(58, Math.min(h - 48, rawSy)),
              progress: Math.max(0, z.stateTimer / z.windupDuration),
            });
          }
        }
      }
    }

    let interactionPrompt = '';
    const cratesCollected = this.world.crates.filter((c) => c.collected).length;
    const nearGuardTower = this.phase === 'playing' && this.isNearGuardTower();
    if (this.phase === 'playing' && !this.radioOpen && !this.intro.isIntroPlaying) {
      if (this.wallRunSide !== 0) {
        interactionPrompt = '[SPACE] Tic-Tac Wall Kick';
      } else if (this.activeZipline) {
        interactionPrompt = '[SPACE] Launch Off Zipline';
      } else if (counterIndicators.length > 0) {
        interactionPrompt = '[Right-Click] Counter Incoming Strike!';
      } else {
        for (const c of this.world.crates) {
          if (!c.collected && this.playerPos.distanceTo(c.position) < 3.6) {
            interactionPrompt = `[E] Scavenge ${c.label}`;
            break;
          }
        }
        if (!interactionPrompt && nearGuardTower) {
          interactionPrompt = '[E] Radio Watchtower Guard';
        }
        if (!interactionPrompt && this.findNearbyZipline()) {
          interactionPrompt = '[E] / [SPACE] ZIP-LINE';
        }
        if (!interactionPrompt && this.canMantle) {
          interactionPrompt = '[SPACE] Climb / Speed Vault';
        }
        if (
          !interactionPrompt &&
          ((!this.onGround && (this.airPeakY - this.playerPos.y > 2.4 || this.playerVel.y < -9.5)) ||
            this.postLandRollTimer > 0)
        ) {
          interactionPrompt = '[C / Ctrl] Safety Landing Roll';
        }
        if (!interactionPrompt && cratesCollected === this.world.crates.length) {
          interactionPrompt = 'All Antizin Secured — Return to the Taj Mahal UV Safe House Gate!';
        }
      }
    }

    const playerHeadingRad = -this.yaw;
    const tajBearingRad = Math.atan2(
      this.world.tajGateCenter.x - this.playerPos.x,
      -(this.world.tajGateCenter.z - this.playerPos.z),
    );
    let nearestCrateBearingRad: number | null = null;
    let nearestCrateDistance: number | null = null;
    for (const c of this.world.crates) {
      if (c.collected) continue;
      const dist = this.playerPos.distanceTo(c.position);
      if (nearestCrateDistance === null || dist < nearestCrateDistance) {
        nearestCrateDistance = Math.round(dist);
        nearestCrateBearingRad = Math.atan2(
          c.position.x - this.playerPos.x,
          -(c.position.z - this.playerPos.z),
        );
      }
    }

    const NIGHT_HUNTER_ALERT_RANGE = 28;
    let nearestNightHunterDistRaw: number | null = null;
    if (this.phase === 'playing') {
      for (const z of this.zombies.zombies) {
        if (z.state === 'dead' || z.kind !== 'runner') continue;
        const dist = Math.hypot(z.pos.x - this.playerPos.x, z.pos.z - this.playerPos.z);
        if (nearestNightHunterDistRaw === null || dist < nearestNightHunterDistRaw) {
          nearestNightHunterDistRaw = dist;
        }
      }
    }
    const nearestNightHunterDistance =
      nearestNightHunterDistRaw !== null ? Math.round(nearestNightHunterDistRaw) : null;
    const nightHunterNearby =
      nearestNightHunterDistRaw !== null && nearestNightHunterDistRaw <= NIGHT_HUNTER_ALERT_RANGE;

    this.onHudUpdate({
      phase: this.phase,
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      comboCount: this.comboCount,
      comboTimerRatio: this.comboCount > 0 ? Math.max(0, this.comboTimer / 4.8) : 0,
      takedownReady: this.comboCount >= 5,
      timeOfDay: this.timeOfDay,
      formattedTime: this.formatClock24h(),
      isNight: this.isNightTime(),
      cratesCollected,
      totalCrates: this.world.crates.length,
      crateStatuses: this.world.crates.map((c) => ({
        id: c.id,
        label: c.label,
        locationHint: c.locationHint,
        collected: c.collected,
        distance: Math.round(this.playerPos.distanceTo(c.position)),
      })),
      tajDistance: Math.round(this.playerPos.distanceTo(this.world.tajGateCenter)),
      playerHeadingRad,
      tajBearingRad,
      nearestCrateBearingRad,
      nearestCrateDistance,
      nearGuardTower,
      radioOpen: this.radioOpen,
      nightHunterNearby,
      nearestNightHunterDistance,
      flashlightOn: this.flashlightOn,
      firecrackerCooldown: Math.max(0, Number(this.firecrackerCooldown.toFixed(1))),
      kickCooldown: Math.max(0, Number(this.kickCooldown.toFixed(1))),
      canMantle: this.canMantle,
      activeWeapon: this.viewmodel.getWeapon(),
      timeLabel: this.getTimeLabel(),
      subtitleText: this.subtitleTimer > 0 ? this.subtitleText : '',
      subtitleSpeaker: this.subtitleSpeaker,
      interactionPrompt,
      pointerLocked: this.pointerLocked,
      counterIndicators,
      directionalHits: this.directionalHits.map((d) => ({ ...d })),
      damageFlash: this.damageFlash,
      parryFlash: this.parryFlash,
      slowMoActive: this.slowMoTimer > 0,
      parkourFlow: Number(this.parkourFlow.toFixed(2)),
      parkourMove: this.parkourMoveTimer > 0 ? this.parkourMoveLabel : undefined,
      killCount: this.killCount,
      maxCombo: this.maxCombo,
      elapsedSeconds: Math.round(this.playTimeSeconds),
      minimap: this.getLiveMinimapTelemetry(),
      isIntroPlaying: this.intro.isIntroPlaying,
      introFadeOpacity: this.intro.blackFadeOpacity,
      hudOpacity: this.intro.hudOpacity,
      introRadioVisible: this.intro.introRadioVisible,
      introRadioText: this.intro.introRadioText,
      tutorialHintOpacity: this.intro.tutorialHintOpacity,
    });
  }

  public getLiveMinimapTelemetry(): MinimapTelemetry {
    return {
      playerX: this.playerPos.x,
      playerY: this.playerPos.y,
      playerZ: this.playerPos.z,
      playerYaw: this.yaw,
      crates: this.world.crates.map((c) => ({
        id: c.id,
        x: c.position.x,
        y: c.position.y,
        z: c.position.z,
        collected: c.collected,
      })),
      enemies: this.zombies.zombies
        .filter((z) => z.state !== 'dead')
        .map((z) => ({
          x: z.pos.x,
          z: z.pos.z,
          kind: z.kind,
          alerted: z.state === 'chase' || z.state === 'windup',
        })),
      tajGate: {
        x: this.world.tajGateCenter.x,
        z: this.world.tajGateCenter.z,
      },
      watchtower: {
        x: this.world.guardTowerCenter.x,
        z: this.world.guardTowerCenter.z,
      },
    };
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.intro.resetIdle();
    this.sound.stopContinuousLoops();
    this.unbindEvents();
    this.lighting.dispose();
    this.world.dispose();
    this.viewmodel.dispose();
    this.zombies.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
