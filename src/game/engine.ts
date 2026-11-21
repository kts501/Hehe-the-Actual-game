import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type {
  AllyNameplate,
  BoxCollider,
  CounterIndicator,
  DirectionalDamageIndicator,
  GamePhase,
  HudSnapshot,
  LadderVolume,
  MinimapTelemetry,
  ScreenBloodSpatter,
  ZiplineRoute,
} from '../types/game';
import { AwakeningSystem } from './awakening';
import { SoundEngine } from './audio';
import { IntroSequenceController } from './intro';
import { TimeOfDayLightingSystem } from './lighting';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { WeaponAndEffects } from './viewmodel';
import {
  createInitialDurability,
  getSlotFromVector,
  WEAPONS_BY_ID,
  WEAPONS_BY_SLOT,
  type WeaponId,
  type WeaponSlot,
} from './weapons';
import { buildAgraWorld, type WorldBuildResult } from './world';
import { ZombieManager, type ZombieActor } from './zombies';
import { InfectedEnemy, type MeleeSwingDirection } from './infectedEnemy';
import { NightRunner } from './nightRunner';
import { TerritoryManager, type ActiveTerritoryHudInfo } from './territories';
import { AllyManager } from './allies';
import {
  createCrysisShaderUniforms,
  CrysisPostPass,
  SunShaftsPass,
  type CrysisShaderUniforms,
} from './crysisShaders';
import {
  CameraSpringRig,
  classifyLandingImpact,
  classifySurfaceType,
  computeMuscleUpStage,
  type ParkourStateId,
  type SurfaceMaterialKind,
} from './parkourPhysics';
import {
  HD4600Governor,
  probeGpuHardwareProfile,
  type GovernorRenderConfig,
  type GpuHardwareProfile,
} from './hd4600Governor';

declare global {
  interface Window {
    devImmortal?: boolean;
    devInfStamina?: boolean;
  }
}

// Pre-allocated math helpers (zero GC inside animation loop)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _grabFwd = new THREE.Vector3();
const _grabHeadWorld = new THREE.Vector3();
const _grabImpulse = new THREE.Vector3();

const SCREAMER_SPAWN_POINTS: ReadonlyArray<{ x: number; y: number; z: number; yaw: number }> = [
  { x: -27.5, y: 4.0, z: 21.0, yaw: 0.1 }, // West Rooftop bldg_w1 (directly across launch ramp)
  { x: -26.5, y: 5.8, z: 4.5, yaw: 0.4 }, // West Rooftop bldg_w2
  { x: 27.5, y: 3.9, z: 23.0, yaw: -0.3 }, // East Rooftop bldg_e1
  { x: 26.5, y: 5.5, z: 4.5, yaw: 2.8 }, // East Rooftop bldg_e2
  { x: -8.5, y: 0.0, z: 2.0, yaw: 0.8 }, // Courtyard West Charbagh
  { x: 8.5, y: 0.0, z: -24.0, yaw: 2.6 }, // Courtyard East North Walkway
  { x: -70.5, y: 1.05, z: -18.0, yaw: 1.4 }, // Agra Cantt Platform 1 near Blue ICF Coach S5
  { x: -94.5, y: 1.05, z: -26.0, yaw: 0.3 }, // Agra City Island Platform 2
];

const FULL_CYCLE_SECONDS = 180; // 3 minutes per full 24h cycle so Golden Dusk lingers warmly

/**
 * Renders the isolated viewmodel layer (Layer 2) on top of the main world buffer
 * with depth cleared AFTER binding readBuffer so arms/weapons never clip into walls
 * while still receiving world shadows, bloom, and ACES Filmic tone mapping.
 */
class ViewmodelRenderPass extends Pass {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const oldAutoClear = renderer.autoClear;
    const oldAutoShadow = renderer.shadowMap.autoUpdate;
    const prevBackground = this.scene.background;

    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    this.scene.background = null;

    this.camera.layers.set(2);
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);

    this.camera.layers.enable(0);
    this.camera.layers.enable(1);
    this.camera.layers.disable(2);
    this.scene.background = prevBackground;
    renderer.shadowMap.autoUpdate = oldAutoShadow;
    renderer.autoClear = oldAutoClear;
  }
}

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
  private readonly viewmodelPass: ViewmodelRenderPass | null = null;
  private readonly sunShaftsPass: SunShaftsPass | null = null;
  private readonly bloomPass: UnrealBloomPass | null = null;
  private readonly crysisPostPass: CrysisPostPass | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly gpuProfile: GpuHardwareProfile;
  private readonly governor: HD4600Governor;
  private readonly crysisUniforms: CrysisShaderUniforms;
  private readonly isSoftwareGl: boolean;
  private useDirectForward = false;
  private viewportW = 1280;
  private viewportH = 720;
  private readonly textures: ProceduralTextureSet;
  private readonly world: WorldBuildResult;
  private readonly viewmodel: WeaponAndEffects;
  private readonly zombies: ZombieManager;
  private readonly infectedEnemies: InfectedEnemy[] = [];
  private readonly nightRunners: NightRunner[] = [];
  private readonly territories: TerritoryManager;
  private readonly allies: AllyManager;
  private readonly awakening = new AwakeningSystem();
  public readonly sound = new SoundEngine();

  /** External hook invoked once when a Head-Grab capture locks cleanly at t >= 0.35s. */
  public onHeadGrabLocked: ((grabbedEnemy: InfectedEnemy) => void) | null = null;

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
  private resizeObserver: ResizeObserver | null = null;

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

  // Parkour Physics State, Camera Spring-Damper Rig & Charged Melee
  private readonly camSpring = new CameraSpringRig();
  private parkourState: ParkourStateId = 'GROUNDED';
  private vaultKind: 'SPEED_VAULT' | 'KONG_VAULT' = 'SPEED_VAULT';
  private peakFallSpeed = 0;
  private heavyLandingTimer = 0;
  private heavyLandingRecoveryScale = 1.0;
  private lookDownInspect = false;
  private savedPreLookDownPitch = -0.04;
  private lowStaminaHeartbeatTimer = 0;
  private lmbDownActive = false;
  private lmbHoldTime = 0;
  private overheadCharge = 0;
  private currentFloorSurface: SurfaceMaterialKind = 'concrete';
  private readonly climbGripLeft = new THREE.Vector3();
  private readonly climbGripRight = new THREE.Vector3();
  private readonly ledgeNormalWorld = new THREE.Vector3();

  // Mantle, Speed/Kong Vault & Lunge kinematics
  private mantling = false;
  private mantleTimer = 0;
  private mantleDuration = 1.15;
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
  private devOverlayOpen = false;

  // Player stats, combat & camera feedback
  private health = 100;
  private readonly maxHealth = 100;
  private stamina = 100;
  private readonly maxStamina = 100;
  private staminaPauseTimer = 0;
  private exhaustionTimer = 0;
  private hitSlowTimer = 0;
  private hitMarkerFlash = 0;
  private executionsCount = 0;
  private waveNumber = 1;
  private readonly killsTarget = 15;
  private extractionReady = false;
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
  private screenSpatters: Array<ScreenBloodSpatter & { age: number; maxLife: number; dripSpeed: number }> = [];
  private nextSpatterId = 1;

  // Gadgets, Weapon Selector Wheel & Day/Night
  private activeWeapon: WeaponId = 'bat';
  private previousWeapon: WeaponId = 'unarmed';
  private scrapParts = 25;
  private weaponDurability: Record<WeaponId, number> = createInitialDurability();
  private weaponWheelOpen = false;
  private wheelHoveredSlot: WeaponSlot = 'bottom';
  private wheelCursorX = 0;
  private wheelCursorY = 0;
  private wheelTimeScale = 1.0;
  private wheelTriggerSource: 'KeyQ' | 'Tab' | null = null;
  private qHoldPending = false;
  private qPressTimeMs = 0;
  private meleeSwingToggle = false;
  private readonly headGrabState = {
    active: false,
    enemy: null as InfectedEnemy | null,
    timer: 0,
    impactTriggered: false,
    holdTriggered: false,
    lockedInvoked: false,
    startPos: new THREE.Vector3(),
    startYaw: 0,
  };
  private isGrabbingEnemy = false;
  private grabbedEnemy: InfectedEnemy | null = null;
  private isExecutingFinisher = false;
  private finisherGoreOpacity = 0;
  private readonly batFaceDriveState = {
    active: false,
    enemy: null as InfectedEnemy | null,
    timer: 0,
    impactTriggered: false,
    yankBurstTriggered: false,
    ragdollTriggered: false,
    dripTimer: 0,
  };
  private flashlightOn = false;
  private flashlightBattery = 100;
  private lowStaminaPulseTimer = 0;
  private isFinisherActive = false;
  private finisherTimer = 0;
  private finisherAttacker: NightRunner | null = null;
  private finisherVignetteOpacity = 0;
  private finisherBlackoutOpacity = 0;
  private finisherPhaseStep = 0;
  private finisherDropStartY = 0;
  private finisherStartYaw = 0;
  private finisherStartPitch = 0;
  private deathCause: 'night_runner' | 'overrun' = 'overrun';
  private survivedDays = 1;
  private activeTerritoryHud: ActiveTerritoryHudInfo | null = null;
  private liberationToastName: string | null = null;
  private liberationToastTimer = 0;
  private squadCommandToast: string | null = null;
  private squadCommandToastTimer = 0;
  private allyDownAlert: string | null = null;
  private allyDownAlertTimer = 0;
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

    // 1. Hardware GPU probe & Intel HD 4600 / Software GL configuration
    this.gpuProfile = probeGpuHardwareProfile();
    this.isSoftwareGl = this.gpuProfile.isSoftwareGl;
    this.governor = new HD4600Governor(this.gpuProfile);
    this.crysisUniforms = createCrysisShaderUniforms(this.isSoftwareGl);
    this.useDirectForward = this.governor.config.useDirectForward;

    this.viewportW = mountEl.clientWidth || window.innerWidth;
    this.viewportH = mountEl.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      precision: 'mediump',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    // Hard initial pixel ratio cap strictly to 1.0 (overrides Windows 125%/150% DPI scaling on HD 4600)
    this.renderer.setPixelRatio(1.0);
    this.renderer.setSize(this.viewportW, this.viewportH);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = this.gpuProfile.isIntelIntegrated
      ? THREE.PCFShadowMap
      : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = !this.isSoftwareGl;
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
      this.viewportW / this.viewportH,
      0.05,
      1400,
    );
    this.camera.layers.enable(0);
    this.camera.layers.enable(1); // Render Layer 1 instanced grass tufts while Reflector skips them
    this.camera.layers.disable(2); // Viewmodel Layer 2 renders in dedicated depth-cleared pass
    this.scene.add(this.camera);

    // 3. Three-point / Outdoor Golden Dusk-Nightfall Lighting + Player Flashlight
    const shadowMapSize = this.gpuProfile.isIntelIntegrated ? 1024 : 2048;
    this.lighting = new TimeOfDayLightingSystem(this.scene, this.isSoftwareGl, shadowMapSize);
    if (!this.isSoftwareGl) {
      this.lighting.setShadowDistance(this.governor.config.shadowDistance);
    }

    this.flashlight = new THREE.SpotLight(0xfef9c3, 0, 42, Math.PI / 4.2, 0.55, 1.55);
    this.flashlight.castShadow = false;
    this.flashlight.layers.enable(2);
    this.flashlight.position.set(0.18, -0.08, 0);
    this.flashlightTarget.position.set(0, 0, -12);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // 4. Build World, Textures, Viewmodel, Zombies & Intro Controller
    const rawMaxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const tunedAniso = this.gpuProfile.isIntelIntegrated
      ? Math.min(8, rawMaxAniso)
      : Math.min(8, rawMaxAniso);
    this.textures = createProceduralTextures(tunedAniso);
    this.world = buildAgraWorld(this.scene, this.textures, this.isSoftwareGl, {
      isIntelIntegrated: this.gpuProfile.isIntelIntegrated,
      crysisUniforms: this.crysisUniforms,
    });
    this.viewmodel = new WeaponAndEffects(this.scene, this.camera, this.textures);
    this.viewmodel.setVisible(false);
    this.zombies = new ZombieManager(this.scene, this.textures);
    this.spawnInitialScreamers();
    this.territories = new TerritoryManager(this.scene, (x, z) => this.sampleTerritoryFloorY(x, z));
    this.spawnTerritoryDefenders();
    this.allies = new AllyManager(this.scene, (x, z, curY) => this.sampleNpcGroundHeight(x, z, curY));
    this.allies.spawnStarterCompanion();

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
      try {
        const w = this.viewportW;
        const h = this.viewportH;
        const bloomW = Math.max(1, Math.floor(w * 0.5));
        const bloomH = Math.max(1, Math.floor(h * 0.5));
        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(this.governor.currentPixelRatio);
        this.composer.setSize(w, h);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.viewmodelPass = new ViewmodelRenderPass(this.scene, this.camera);
        this.viewmodelPass.enabled = false;
        this.composer.addPass(this.viewmodelPass);
        // Quarter-resolution screen-space radial sun shafts (Crysis golden-hour god rays)
        this.sunShaftsPass = new SunShaftsPass(w, h);
        this.sunShaftsPass.enabled = this.governor.config.sunShaftsEnabled;
        this.composer.addPass(this.sunShaftsPass);
        // Half-resolution bloom mip chain cuts fragment fill-rate by ~75% while preserving golden-hour glow
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(bloomW, bloomH), 0.42, 0.55, 0.82);
        this.bloomPass.enabled = this.governor.config.bloomEnabled;
        this.composer.addPass(this.bloomPass);
        // ACESFilmic tone mapping + sRGB conversion precedes CAS + grading + blue-noise dither
        this.composer.addPass(new OutputPass());
        this.crysisPostPass = new CrysisPostPass(w, h);
        this.composer.addPass(this.crysisPostPass);
        this.camera.layers.enable(2);
        this.renderer.compile(this.scene, this.camera);
        this.camera.layers.disable(2);
      } catch {
        this.sunShaftsPass?.dispose();
        this.crysisPostPass?.dispose();
        this.composer?.dispose();
        this.composer = null;
        this.viewmodelPass = null;
        this.sunShaftsPass = null;
        this.bloomPass = null;
        this.crysisPostPass = null;
      }
    }

    this.bindEvents();
    this.syncCameraToPlayer(0);
    this.updateAtmosphere(0);
    this.emitHud();
    this.startLoop();
  }

  public startGame(shouldLockPointer = true): void {
    if (shouldLockPointer) {
      this.sound.unlock();
    }
    this.resetState();
    this.phase = 'playing';
    this.viewmodel.setVisible(true);
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
    if (this.radioOpen || this.devOverlayOpen || this.phase !== 'playing') return;
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
    const prev = this.timeOfDay;
    this.timeOfDay = (this.timeOfDay + 0.14) % 1;
    if (prev + 0.14 >= 1) {
      this.survivedDays++;
    }
    this.updateAtmosphere(0);
    if (this.isNightTime()) {
      this.zombies.spawnNightRunners();
      for (let i = 0; i < this.nightRunners.length; i++) {
        if (this.nightRunners[i].state !== 'DEAD') {
          this.nightRunners[i].alerted = true;
        }
      }
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

  public setDevOverlayOpen(open: boolean, relockPointer = true): void {
    this.devOverlayOpen = open;
    if (open) {
      for (const k of Object.keys(this.keys)) {
        this.keys[k] = false;
      }
      this.qHoldPending = false;
      if (this.weaponWheelOpen) {
        this.closeWeaponWheel(false);
      }
      this.safeExitPointerLock();
    } else if (relockPointer && this.phase === 'playing' && !this.radioOpen && !this.awakening.state.isActivating) {
      this.lockPointer();
    }
  }

  public setDevImmortal(enabled: boolean): void {
    window.devImmortal = enabled;
    if (enabled) {
      this.health = this.maxHealth;
      this.damageFlash = 0;
    }
    this.emitHud();
  }

  public setDevInfStamina(enabled: boolean): void {
    window.devInfStamina = enabled;
    if (enabled) {
      this.stamina = this.maxStamina;
      this.sprintExhausted = false;
      this.staminaPauseTimer = 0;
    }
    this.emitHud();
  }

  public devFillAwakening(): void {
    this.awakening.setDebugFullCharge();
    this.emitHud();
  }

  public devFullHeal(): void {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.sprintExhausted = false;
    this.staminaPauseTimer = 0;
    this.damageFlash = 0;
    this.emitHud();
  }

  public devClearNearbyEnemies(radius = 26): number {
    let cleared = this.zombies.clearNearbyZombies(this.playerPos, radius);
    const rSq = radius * radius;
    for (let i = 0; i < this.infectedEnemies.length; i++) {
      const e = this.infectedEnemies[i];
      if (e.aiState === 'DEAD' || e.aiState === 'DEAD_RAGDOLL') continue;
      if (this.batFaceDriveState.active && this.batFaceDriveState.enemy === e) continue;
      if (this.headGrabState.active && this.headGrabState.enemy === e) {
        this.clearHeadGrabState();
      }
      if (e.root.position.distanceToSquared(this.playerPos) <= rSq) {
        e.markDead();
        cleared++;
      }
    }
    for (let i = 0; i < this.nightRunners.length; i++) {
      const nr = this.nightRunners[i];
      if (nr.state === 'DEAD' || this.finisherAttacker === nr) continue;
      if (nr.group.position.distanceToSquared(this.playerPos) <= rSq) {
        _tmpVecA.set(0, 0, -1);
        nr.applyDamage(9999, _tmpVecA, 0, 0);
        cleared++;
      }
    }
    this.emitHud();
    return cleared;
  }

  public devSpawnInfectedInFront(): void {
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const sx = THREE.MathUtils.clamp(this.playerPos.x + fwdX * 2.6, -105, 55);
    const sz = THREE.MathUtils.clamp(this.playerPos.z + fwdZ * 2.6, -52, 48);
    const sy = this.sampleGroundHeight(sx, sz);

    let target: InfectedEnemy | null = null;
    for (let i = 0; i < this.infectedEnemies.length; i++) {
      const candidate = this.infectedEnemies[i];
      if (
        (candidate.aiState === 'DEAD' || candidate.aiState === 'DEAD_RAGDOLL') &&
        !(this.headGrabState.active && this.headGrabState.enemy === candidate) &&
        !(this.batFaceDriveState.active && this.batFaceDriveState.enemy === candidate)
      ) {
        target = candidate;
        break;
      }
    }

    if (!target) {
      target = new InfectedEnemy(
        9000 + this.infectedEnemies.length,
        this.scene,
        this.textures,
        sx,
        sy,
        sz,
        this.yaw,
      );
      this.infectedEnemies.push(target);
    }

    // Screamer +Z faces the player when enemy.yaw === player.yaw
    target.reset(sx, sy, sz, this.yaw);
    target.alerted = true;
    this.sound.playScreamerScreech();
    this.emitHud();
  }

  public takeDamage(amount: number, attackerPos?: THREE.Vector3): void {
    if (window.devImmortal || this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive) return;
    if (this.phase !== 'playing' || amount <= 0) return;

    this.health = Math.max(0, this.health - amount);
    this.sound.playPlayerHurt();

    if (attackerPos) {
      this.awakening.addAwakeningCharge(8);
      this.comboCount = 0;
      this.comboTimer = 0;
      this.hitSlowTimer = 0.55;
      this.pitch = THREE.MathUtils.clamp(this.pitch - 0.045, -1.42, 1.42);
      this.damageFlash = 0.72;
      this.cameraShake = Math.max(this.cameraShake, 0.35);

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
    } else {
      this.damageFlash = Math.max(this.damageFlash, 0.48);
    }

    if (this.health <= 0) {
      this.deathCause = 'overrun';
      this.phase = 'gameover';
      this.intro.resetIdle();
      this.sound.stopContinuousLoops();
      this.sound.playGameOver();
      this.safeExitPointerLock();
    }
    this.emitHud();
  }

  public respawnAtSafeZone(): void {
    const safeX = 0;
    const safeZ = 12;
    const safeY = this.sampleTerritoryFloorY(safeX, safeZ);

    this.playerPos.set(safeX, safeY, safeZ);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.airPeakY = safeY;
    this.slideTimer = 0;
    this.rollTimer = 0;
    this.rollPitchOffset = 0;
    this.mantling = false;
    this.vaulting = false;
    this.activeZipline = null;
    this.activeLadder = null;
    this.wallRunSide = 0;

    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.flashlightBattery = 100;
    this.sprintExhausted = false;
    this.exhaustionTimer = 0;
    this.staminaPauseTimer = 0;
    this.damageFlash = 0;
    this.cameraShake = 0;

    this.isFinisherActive = false;
    this.finisherTimer = 0;
    this.finisherPhaseStep = 0;
    this.finisherVignetteOpacity = 0;
    this.finisherBlackoutOpacity = 0;
    this.deathCause = 'overrun';

    if (this.finisherAttacker) {
      this.finisherAttacker.frozenForFinisher = false;
      this.finisherAttacker.resetArmPositions();
      this.finisherAttacker.group.position.set(safeX + 16, this.sampleTerritoryFloorY(safeX + 16, safeZ - 8), safeZ - 8);
      this.finisherAttacker.state = 'STALK';
      this.finisherAttacker = null;
    }

    this.zombies.clearNearbyZombies(this.playerPos, 11);
    for (let i = 0; i < this.nightRunners.length; i++) {
      const nr = this.nightRunners[i];
      nr.frozenForFinisher = false;
      if (nr.state !== 'DEAD') {
        nr.resetArmPositions();
        if (nr.group.position.distanceTo(this.playerPos) < 12) {
          const rx = safeX + (i % 2 === 0 ? -15 : 15);
          const rz = safeZ - 14;
          nr.group.position.set(rx, this.sampleTerritoryFloorY(rx, rz), rz);
          nr.state = 'STALK';
        }
      }
    }

    this.camera.fov = MOVEMENT_CONFIG.BASE_FOV;
    this.camera.rotation.z = 0;
    this.camera.updateProjectionMatrix();

    this.phase = 'playing';
    this.viewmodel.setVisible(true);
    this.syncCameraToPlayer(0);
    this.lockPointer();
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
    this.camSpring.reset();
    this.parkourState = 'GROUNDED';
    this.vaultKind = 'SPEED_VAULT';
    this.peakFallSpeed = 0;
    this.heavyLandingTimer = 0;
    this.heavyLandingRecoveryScale = 1.0;
    this.lookDownInspect = false;
    this.savedPreLookDownPitch = -0.04;
    this.lowStaminaHeartbeatTimer = 0;
    this.lmbDownActive = false;
    this.lmbHoldTime = 0;
    this.overheadCharge = 0;
    this.currentFloorSurface = 'concrete';
    this.onGround = true;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.canMantle = false;
    this.mantling = false;
    this.mantleTimer = 0;
    this.mantleDuration = 1.15;
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
    this.exhaustionTimer = 0;
    this.hitSlowTimer = 0;
    this.hitMarkerFlash = 0;
    this.executionsCount = 0;
    this.waveNumber = 1;
    this.extractionReady = false;
    this.world.setExtractionActive(false);
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
    this.screenSpatters = [];
    this.firecrackerCooldown = 0;
    this.activeWeapon = 'bat';
    this.previousWeapon = 'unarmed';
    this.scrapParts = 25;
    this.weaponDurability = createInitialDurability();
    this.weaponWheelOpen = false;
    this.wheelHoveredSlot = 'bottom';
    this.wheelCursorX = 0;
    this.wheelCursorY = 0;
    this.wheelTimeScale = 1.0;
    this.wheelTriggerSource = null;
    this.qHoldPending = false;
    this.qPressTimeMs = 0;
    this.viewmodel.setWeapon('bat', true);
    this.flashlightOn = false;
    this.flashlight.intensity = 0;
    this.flashlightBattery = 100;
    this.lowStaminaPulseTimer = 0;
    this.isFinisherActive = false;
    this.finisherTimer = 0;
    this.finisherAttacker = null;
    this.finisherVignetteOpacity = 0;
    this.finisherBlackoutOpacity = 0;
    this.finisherPhaseStep = 0;
    this.deathCause = 'overrun';
    this.survivedDays = 1;
    this.activeTerritoryHud = null;
    this.liberationToastName = null;
    this.liberationToastTimer = 0;
    this.squadCommandToast = null;
    this.squadCommandToastTimer = 0;
    this.allyDownAlert = null;
    this.allyDownAlertTimer = 0;

    this.timeOfDay = 0.0;
    this.wasNight = false;
    this.nightSubtitleShown = false;
    this.playTimeSeconds = 0;

    this.world.crates.forEach((c) => {
      c.collected = false;
      c.group.visible = true;
    });
    this.world.resetInteractiveWorld();

    this.clearHeadGrabState();
    this.clearBatFaceDriveState();
    this.finisherGoreOpacity = 0;
    this.viewmodel.setBatBloodStained(false);
    this.viewmodel.clearBloodPuddles();
    this.zombies.resetAll();
    this.resetScreamers();
    this.awakening.reset(this.scene);
    for (let i = 0; i < this.nightRunners.length; i++) {
      this.nightRunners[i].dispose(this.scene);
    }
    this.nightRunners.length = 0;
    this.territories.resetAll();
    this.spawnTerritoryDefenders();
    this.allies.resetAll();
  }

  private spawnInitialScreamers(): void {
    for (let i = 0; i < SCREAMER_SPAWN_POINTS.length; i++) {
      const sp = SCREAMER_SPAWN_POINTS[i];
      const screamer = new InfectedEnemy(
        9000 + i,
        this.scene,
        this.textures,
        sp.x,
        sp.y,
        sp.z,
        sp.yaw,
      );
      this.infectedEnemies.push(screamer);
    }
  }

  private resetScreamers(): void {
    for (let i = this.infectedEnemies.length - 1; i >= SCREAMER_SPAWN_POINTS.length; i--) {
      const extra = this.infectedEnemies.pop();
      extra?.dispose(this.scene);
    }
    for (let i = 0; i < this.infectedEnemies.length; i++) {
      const sp = SCREAMER_SPAWN_POINTS[i];
      this.infectedEnemies[i].reset(sp.x, sp.y, sp.z, sp.yaw);
    }
  }

  private clearHeadGrabState(): void {
    this.headGrabState.active = false;
    this.headGrabState.enemy = null;
    this.headGrabState.timer = 0;
    this.headGrabState.impactTriggered = false;
    this.headGrabState.holdTriggered = false;
    this.headGrabState.lockedInvoked = false;
    this.isGrabbingEnemy = false;
    this.grabbedEnemy = null;
  }

  private clearBatFaceDriveState(): void {
    this.batFaceDriveState.active = false;
    this.batFaceDriveState.enemy = null;
    this.batFaceDriveState.timer = 0;
    this.batFaceDriveState.impactTriggered = false;
    this.batFaceDriveState.yankBurstTriggered = false;
    this.batFaceDriveState.ragdollTriggered = false;
    this.batFaceDriveState.dripTimer = 0;
    this.isExecutingFinisher = false;
  }

  private setSubtitle(speaker: string, text: string, duration = 7.5): void {
    this.subtitleSpeaker = speaker;
    this.subtitleText = text;
    this.subtitleTimer = duration;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.mountEl);
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onWindowBlur);
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
    this.viewportW = w;
    this.viewportH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = this.governor.currentPixelRatio;
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(scale);
      this.composer.setSize(w, h);
      if (this.bloomPass) {
        this.bloomPass.setSize(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
      }
      this.sunShaftsPass?.setSize(w, h);
      this.crysisPostPass?.setSize(w, h);
    }
    this.renderer.shadowMap.needsUpdate = !this.isSoftwareGl;
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.lmbDownActive = false;
      this.lmbHoldTime = 0;
      this.overheadCharge = 0;
    }
    this.emitHud();
  };

  private onPointerLockError = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onWindowBlur = () => {
    for (const k of Object.keys(this.keys)) {
      this.keys[k] = false;
    }
    this.qHoldPending = false;
    this.lmbDownActive = false;
    this.lmbHoldTime = 0;
    this.overheadCharge = 0;
    if (this.weaponWheelOpen) {
      this.closeWeaponWheel(false);
    }
  };

  private equipWeapon(nextWeapon: WeaponId, immediate = false): void {
    if (this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive) return;
    if (nextWeapon !== this.activeWeapon) {
      this.previousWeapon = this.activeWeapon;
      this.activeWeapon = nextWeapon;
      this.viewmodel.setWeapon(nextWeapon, immediate);
      if (!immediate) {
        this.sound.playWeaponEquip(nextWeapon);
      }
      this.emitHud();
    } else if (!immediate) {
      this.sound.playWeaponEquip(nextWeapon);
    }
  }

  private tryTriggerActivationSmack(): void {
    if (
      this.phase !== 'playing' ||
      this.radioOpen ||
      this.intro.isIntroPlaying ||
      !this.awakening.state.isReady ||
      this.awakening.state.isActivating ||
      this.isExecutingFinisher ||
      this.isFinisherActive ||
      this.isGrabbingEnemy
    ) {
      return;
    }

    if (this.weaponWheelOpen) {
      this.closeWeaponWheel(false);
    }

    // Force-equip Wooden Baseball Bat immediately on frame 0 (t = 0.00s)
    if (this.activeWeapon !== 'bat') {
      this.equipWeapon('bat', true);
    }

    // Clear active locomotion momentum/timers for clean cinematic lock
    this.qHoldPending = false;
    this.slideTimer = 0;
    this.rollTimer = 0;
    this.mantling = false;
    this.vaulting = false;
    this.wallRunSide = 0;
    this.playerVel.x = 0;
    this.playerVel.z = 0;
    this.sound.updateSlideLoop(false, 0);

    this.sound.unlock();
    this.awakening.tryStartActivation(
      this.pitch,
      this.yaw,
      this.camera.fov,
      () => {
        // Exact Impact Frame Events at t = 4.96s:
        // 1. Symbolic 1 HP self-bonk (only if !window.devImmortal, strictly non-lethal)
        if (!window.devImmortal) {
          this.health = Math.max(1, this.health - 1);
        }
        // 2. Dramatic 65ms hit-stop freeze frame right on contact
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.065);
        // 3. Radial 11.0m enemy knockback (18 m/s impulse, +6 m/s Y pop, 25 dmg, 2.0s stun)
        const { killCount } = this.zombies.applyAwakeningShockwave(
          this.playerPos,
          11.0,
          18.0,
          6.0,
          25,
          2.0,
        );
        if (killCount > 0) {
          this.killCount += killCount;
        }
        for (let i = 0; i < this.infectedEnemies.length; i++) {
          const e = this.infectedEnemies[i];
          if (e.aiState === 'DEAD' || e.aiState === 'GRABBED') continue;
          const dx = e.root.position.x - this.playerPos.x;
          const dz = e.root.position.z - this.playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= 11.0) {
            const nx = dist > 0.001 ? dx / dist : -Math.sin(this.yaw);
            const nz = dist > 0.001 ? dz / dist : -Math.cos(this.yaw);
            e.health -= 25;
            if (e.health <= 0) {
              _grabImpulse.set(nx, 0, nz);
              e.markDead(_grabImpulse);
              this.killCount++;
            } else {
              _grabImpulse.set(nx * 18.0, 6.0, nz * 18.0);
              e.applyKnockdown(_grabImpulse);
            }
          }
        }
        for (let i = 0; i < this.nightRunners.length; i++) {
          const nr = this.nightRunners[i];
          if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB') continue;
          const dx = nr.group.position.x - this.playerPos.x;
          const dz = nr.group.position.z - this.playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= 11.0) {
            const nx = dist > 0.001 ? dx / dist : -Math.sin(this.yaw);
            const nz = dist > 0.001 ? dz / dist : -Math.cos(this.yaw);
            _grabImpulse.set(nx, 0, nz);
            if (nr.applyDamage(25, _grabImpulse, 2.0, 14.0)) {
              this.killCount++;
            }
          }
        }
        this.emitHud();
      },
      () => {
        // t = 5.55s: Smoothly return camera pitch/yaw/roll/FOV (80 deg) to active Pumped-Up gameplay
        this.pitch = this.awakening.savedCameraPitch;
        this.yaw = this.awakening.savedCameraYaw;
        this.camera.fov = this.awakening.savedFov + this.awakening.getFovOffset();
        this.camera.rotation.z = 0;
        this.camera.updateProjectionMatrix();
        this.emitHud();
      },
    );
    this.emitHud();
  }

  private quickSwapWeapon(): void {
    if (this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive) return;
    const target =
      this.previousWeapon && this.previousWeapon !== this.activeWeapon
        ? this.previousWeapon
        : this.activeWeapon === 'bat'
          ? 'unarmed'
          : 'bat';
    this.equipWeapon(target);
  }

  private openWeaponWheel(source: 'KeyQ' | 'Tab'): void {
    if (
      this.phase !== 'playing' ||
      this.radioOpen ||
      this.intro.isIntroPlaying ||
      this.weaponWheelOpen ||
      this.awakening.state.isActivating ||
      this.headGrabState.active ||
      this.isExecutingFinisher ||
      this.isFinisherActive
    ) {
      return;
    }
    this.weaponWheelOpen = true;
    this.wheelTriggerSource = source;
    this.wheelHoveredSlot = WEAPONS_BY_ID[this.activeWeapon].slot;
    this.wheelCursorX = 0;
    this.wheelCursorY = 0;
    this.sound.playWheelOpen();
    this.emitHud();
  }

  private closeWeaponWheel(applySelection: boolean): void {
    if (!this.weaponWheelOpen) return;
    const chosenSlot = this.wheelHoveredSlot;
    this.weaponWheelOpen = false;
    this.wheelTriggerSource = null;
    this.wheelCursorX = 0;
    this.wheelCursorY = 0;
    if (applySelection) {
      const targetWeapon = WEAPONS_BY_SLOT[chosenSlot].id;
      this.equipWeapon(targetWeapon);
    } else {
      this.emitHud();
    }
  }

  public hoverWheelSlot(slot: WeaponSlot): void {
    if (!this.weaponWheelOpen || this.wheelHoveredSlot === slot) return;
    this.wheelHoveredSlot = slot;
    this.sound.playWheelTick();
    this.emitHud();
  }

  public selectWheelSlot(slot: WeaponSlot): void {
    if (!this.weaponWheelOpen) return;
    this.wheelHoveredSlot = slot;
    this.closeWeaponWheel(true);
    this.lockPointer();
  }

  private onMouseMove = (e: MouseEvent) => {
    if (
      this.devOverlayOpen ||
      this.phase !== 'playing' ||
      this.intro.isIntroPlaying ||
      this.awakening.state.isActivating ||
      this.isFinisherActive
    ) {
      return;
    }

    if (this.weaponWheelOpen) {
      if (this.pointerLocked) {
        this.wheelCursorX += e.movementX;
        this.wheelCursorY += e.movementY;
        const maxR = 148;
        const mag = Math.hypot(this.wheelCursorX, this.wheelCursorY);
        if (mag > maxR) {
          this.wheelCursorX = (this.wheelCursorX / mag) * maxR;
          this.wheelCursorY = (this.wheelCursorY / mag) * maxR;
        }
      } else {
        const w = this.mountEl.clientWidth || window.innerWidth;
        const h = this.mountEl.clientHeight || window.innerHeight;
        this.wheelCursorX = e.clientX - w * 0.5;
        this.wheelCursorY = e.clientY - h * 0.5;
      }

      const nextSlot = getSlotFromVector(this.wheelCursorX, this.wheelCursorY);
      if (nextSlot && nextSlot !== this.wheelHoveredSlot) {
        this.wheelHoveredSlot = nextSlot;
        this.sound.playWheelTick();
      }
      this.emitHud();
      return;
    }

    if (!this.pointerLocked) return;
    const baseSens = 0.0022;
    const steerScale = this.slideTimer > 0 ? MOVEMENT_CONFIG.SLIDE_STEER_RATE : 1.0;
    const deltaYaw = -e.movementX * baseSens * steerScale;
    const deltaPitch = -e.movementY * baseSens;
    this.yaw += deltaYaw;
    this.lastYawMove += deltaYaw;
    this.viewmodelYawDelta += deltaYaw;
    this.viewmodelPitchDelta += deltaPitch;
    if (this.lookDownInspect && deltaPitch > 0.045) {
      this.lookDownInspect = false;
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitch, -1.42, 1.42);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.devOverlayOpen || this.phase !== 'playing' || this.radioOpen) return;
    this.sound.unlock();
    if (this.intro.isIntroPlaying || this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive) return;

    if (this.weaponWheelOpen) {
      if (e.button === 0) {
        this.closeWeaponWheel(true);
      } else if (e.button === 2) {
        this.closeWeaponWheel(false);
      }
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      if (!this.pointerLocked) {
        this.lockPointer();
      }
      if (this.isGrabbingEnemy && this.grabbedEnemy && !this.isExecutingFinisher) {
        this.shoveGrabbedEnemyAway(8.0);
      } else {
        this.tryStartHeadGrab();
      }
      return;
    }

    if (!this.pointerLocked) {
      this.lockPointer();
      return;
    }

    if (e.button === 0) {
      if (this.isGrabbingEnemy && this.grabbedEnemy && !this.isExecutingFinisher) {
        this.executeBatFaceDrive(this.grabbedEnemy);
        return;
      }
      if (this.headGrabState.active) return;
      if (this.activeWeapon === 'bat') {
        this.lmbDownActive = true;
        this.lmbHoldTime = 0;
        this.overheadCharge = 0;
      } else {
        this.performMeleeAttack(false);
      }
    } else if (e.button === 2) {
      if (this.headGrabState.active) return;
      this.performCounterParry();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.lmbDownActive) {
      const charged = this.lmbHoldTime >= 0.35;
      this.lmbDownActive = false;
      this.lmbHoldTime = 0;
      this.overheadCharge = 0;
      if (
        this.phase === 'playing' &&
        !this.devOverlayOpen &&
        !this.radioOpen &&
        !this.weaponWheelOpen &&
        !this.headGrabState.active
      ) {
        this.performMeleeAttack(charged);
      }
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.devOverlayOpen) return;
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
    if (this.phase === 'playing' && (this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive)) {
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

    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) {
        this.openWeaponWheel('Tab');
      }
      return;
    }

    if (e.code === 'KeyQ') {
      e.preventDefault();
      if (!e.repeat && !this.weaponWheelOpen) {
        this.qHoldPending = true;
        this.qPressTimeMs = performance.now();
      }
      return;
    }

    if (e.code === 'Escape' && this.weaponWheelOpen && !e.repeat) {
      this.closeWeaponWheel(false);
      return;
    }

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
    } else if (e.code === 'KeyG' && !e.repeat) {
      if (this.awakening.state.isReady && !this.awakening.state.isActivating) {
        this.tryTriggerActivationSmack();
      } else {
        const cmd = this.allies.toggleSquadCommand(this.playerPos, this.territories.sectors);
        if (cmd.count > 0 && cmd.toast) {
          this.squadCommandToast = cmd.toast;
          this.squadCommandToastTimer = 3.2;
          this.sound.playTacticalWhistle();
          this.emitHud();
        } else {
          this.throwFirecracker();
        }
      }
    } else if (e.code === 'KeyH' && !e.repeat) {
      const res = this.allies.callReinforcements(this.playerPos);
      if (res.summonedCount > 0 && res.toast) {
        this.squadCommandToast = res.toast;
        this.squadCommandToastTimer = 3.4;
        this.sound.playTacticalWhistle();
        this.emitHud();
      }
    } else if (e.code === 'BracketRight' && !e.repeat) {
      this.awakening.setDebugFullCharge();
      this.emitHud();
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
      this.lookDownInspect = !this.lookDownInspect;
      if (this.lookDownInspect) {
        this.savedPreLookDownPitch = this.pitch > -0.6 ? this.pitch : -0.04;
        this.pitch = THREE.MathUtils.lerp(this.pitch, -1.06, 0.55);
      } else {
        this.pitch = this.savedPreLookDownPitch;
      }
      this.emitHud();
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
      this.equipWeapon('unarmed');
    } else if (e.code === 'Digit2' && !e.repeat) {
      this.equipWeapon('bat');
    } else if (e.code === 'Digit3' && !e.repeat) {
      this.equipWeapon('cleaver');
    } else if (e.code === 'Digit4' && !e.repeat) {
      this.equipWeapon('dagger');
    } else if ((e.code === 'KeyB' || e.code === 'KeyI') && !e.repeat) {
      this.viewmodel.triggerInspect();
    } else if (e.code === 'KeyT' && !e.repeat) {
      this.skipTime();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;

    if (e.code === 'KeyQ') {
      if (this.qHoldPending) {
        this.qHoldPending = false;
        this.quickSwapWeapon();
      } else if (this.weaponWheelOpen && this.wheelTriggerSource === 'KeyQ') {
        this.closeWeaponWheel(true);
      }
      return;
    }

    if (e.code === 'Tab' && this.weaponWheelOpen && this.wheelTriggerSource === 'Tab') {
      this.closeWeaponWheel(true);
      return;
    }

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
    if (!this.flashlightOn && this.flashlightBattery <= 0) {
      this.flashlightOn = false;
      this.flashlight.intensity = 0;
      this.sound.playFlashlightClick();
      this.emitHud();
      return;
    }
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
        this.scrapParts += 5;
        this.sound.playScavenge();

        const collectedCount = this.world.crates.filter((cr) => cr.collected).length;
        if (collectedCount === 1) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'First Antizin crate secured (+5 Scrap)! Two left — watch the alleys, armored Brutes guard the heavy caches.',
            7.5,
          );
        } else if (collectedCount === 2) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'Two Antizin crates recovered (+5 Scrap)! One remaining. Use rooftop ziplines if Night Hunters chase!',
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

    if (this.world.tryUseHaveliMedkit(this.playerPos)) {
      this.health = Math.min(this.maxHealth, this.health + 35);
      this.sound.playMedkitUse();
      this.setSubtitle('MEDICAL SUPPLIES', 'First-Aid Kit applied (+35 HP).', 3.4);
      this.emitHud();
      return;
    }

    const toggledDoor = this.world.toggleNearestDoor(this.playerPos);
    if (toggledDoor) {
      this.sound.playDoorToggle(toggledDoor.open);
      this.emitHud();
      return;
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
    for (const e of this.infectedEnemies) {
      if (
        e.aiState === 'DEAD' ||
        e.aiState === 'IMPALED_DEAD' ||
        e.aiState === 'DEAD_RAGDOLL' ||
        e.aiState === 'GRABBED'
      ) {
        continue;
      }
      const dx = e.root.position.x - this.playerPos.x;
      const dz = e.root.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 4.0 || Math.abs(e.root.position.y - this.playerPos.y) > 2.4) continue;
      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.25) return true;
    }
    return false;
  }

  private findScreamerInGrabCone(): InfectedEnemy | null {
    const cosPitch = Math.cos(this.pitch);
    const camFwdX = -Math.sin(this.yaw) * cosPitch;
    const camFwdY = Math.sin(this.pitch);
    const camFwdZ = -Math.cos(this.yaw) * cosPitch;
    const coneCosLimit = Math.cos(THREE.MathUtils.degToRad(35)); // 35 deg forward half-cone

    let bestEnemy: InfectedEnemy | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.infectedEnemies.length; i++) {
      const e = this.infectedEnemies[i];
      if (
        e.aiState === 'DEAD' ||
        e.aiState === 'IMPALED_DEAD' ||
        e.aiState === 'DEAD_RAGDOLL' ||
        e.aiState === 'GRABBED'
      ) {
        continue;
      }

      e.getHeadWorldPosition(_grabHeadWorld);
      const dx = _grabHeadWorld.x - this.camera.position.x;
      const dy = _grabHeadWorld.y - this.camera.position.y;
      const dz = _grabHeadWorld.z - this.camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const horizDist = Math.hypot(e.root.position.x - this.playerPos.x, e.root.position.z - this.playerPos.z);

      if (Math.min(dist, horizDist) > 3.4 || Math.abs(e.root.position.y - this.playerPos.y) > 2.4) {
        continue;
      }

      const invDist = 1 / (dist || 1);
      const dot = (dx * camFwdX + dy * camFwdY + dz * camFwdZ) * invDist;
      if (dot >= coneCosLimit) {
        const score = dist - dot * 1.2;
        if (score < bestScore) {
          bestScore = score;
          bestEnemy = e;
        }
      }
    }
    return bestEnemy;
  }

  private tryStartHeadGrab(): void {
    if (
      this.phase !== 'playing' ||
      this.radioOpen ||
      this.intro.isIntroPlaying ||
      this.awakening.state.isActivating ||
      this.headGrabState.active ||
      this.isExecutingFinisher ||
      this.isFinisherActive ||
      this.mantling ||
      this.vaulting ||
      this.activeZipline !== null ||
      this.activeLadder !== null ||
      this.rollTimer > 0
    ) {
      return;
    }

    const bestEnemy = this.findScreamerInGrabCone();
    if (!bestEnemy) {
      this.viewmodel.triggerHeadGrabWhiff();
      this.sound.playHeadGrabWhiff();
      return;
    }

    if (!bestEnemy.canBeHeadGrabbed()) {
      this.viewmodel.triggerHeadGrabWhiff();
      this.sound.playHeadGrabWhiff();
      this.sound.playWeaponHit(this.activeWeapon, true);
      this.takeDamage(20, bestEnemy.root.position);
      this.setSubtitle(
        'COMBAT WARNING',
        'Infected too healthy — weaken below 65% HP or stagger before [MMB] Head-Grab!',
        3.2,
      );
      return;
    }

    this.headGrabState.active = true;
    this.headGrabState.enemy = bestEnemy;
    this.headGrabState.timer = 0;
    this.headGrabState.impactTriggered = false;
    this.headGrabState.holdTriggered = false;
    this.headGrabState.lockedInvoked = false;
    this.headGrabState.startPos.copy(bestEnemy.root.position);
    this.headGrabState.startYaw = bestEnemy.yaw;
    this.isGrabbingEnemy = true;
    this.grabbedEnemy = bestEnemy;

    bestEnemy.setGrabbed();
    this.slideTimer = 0;
    this.lungeTimer = 0;
    this.sound.updateSlideLoop(false, 0);
    this.emitHud();
  }

  private shoveGrabbedEnemyAway(speed = 8.0): void {
    const released = this.grabbedEnemy ?? this.headGrabState.enemy;
    this.clearHeadGrabState();
    if (!released) return;

    _grabFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const shoveX = THREE.MathUtils.clamp(this.playerPos.x + _grabFwd.x * 1.45, -105, 54);
    const shoveZ = THREE.MathUtils.clamp(this.playerPos.z + _grabFwd.z * 1.45, -52, 48);
    released.root.position.set(shoveX, this.sampleGroundHeight(shoveX, shoveZ) + 0.15, shoveZ);
    _grabImpulse.set(_grabFwd.x * speed, 3.6, _grabFwd.z * speed);
    released.applyKnockdown(_grabImpulse);
    this.sound.playKick(true);
    this.emitHud();
  }

  private executeBatFaceDrive(enemy: InfectedEnemy): void {
    if (this.isExecutingFinisher || this.phase !== 'playing') return;

    this.clearHeadGrabState();
    this.isExecutingFinisher = true;
    this.qHoldPending = false;
    this.slideTimer = 0;
    this.rollTimer = 0;
    this.lungeTimer = 0;
    this.sound.updateSlideLoop(false, 0);

    // Ensure Wooden Baseball Bat is in the right hand immediately for the execution
    if (this.activeWeapon !== 'bat') {
      this.previousWeapon = this.activeWeapon;
      this.activeWeapon = 'bat';
    }
    this.viewmodel.setWeapon('bat', true);

    this.batFaceDriveState.active = true;
    this.batFaceDriveState.enemy = enemy;
    this.batFaceDriveState.timer = 0;
    this.batFaceDriveState.impactTriggered = false;
    this.batFaceDriveState.yankBurstTriggered = false;
    this.batFaceDriveState.ragdollTriggered = false;
    this.batFaceDriveState.dripTimer = 0;

    enemy.setImpaledWindup();
    this.sound.playWeaponSwing('bat');
    this.emitHud();
  }

  private sampleGroundHeight(x: number, z: number): number {
    let groundHeight = 0;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (b.disabled) continue;
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
      if (b.disabled) continue;
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
  private performMeleeAttack(isOverheadSmash = false): void {
    if (
      this.attackCooldown > 0 ||
      this.mantling ||
      this.awakening.state.isActivating ||
      this.headGrabState.active ||
      this.isExecutingFinisher ||
      this.isFinisherActive
    ) {
      return;
    }
    const cfg = WEAPONS_BY_ID[this.activeWeapon];
    const isExhaustedBefore = !window.devInfStamina && (this.exhaustionTimer > 0 || this.sprintExhausted);
    const lowStamina = !window.devInfStamina && this.stamina < cfg.staminaCost;

    // Dedicated Unarmed Fists state machine + 12 stamina lockout + Left Hook impact timing
    if (this.activeWeapon === 'unarmed') {
      if (lowStamina) {
        this.lowStaminaPulseTimer = 0.55;
        this.sound.playLowStaminaBreath();
        this.emitHud();
        return;
      }
      this.spendStamina(cfg.staminaCost);
      const fatigueDurationMult = !window.devInfStamina && (this.exhaustionTimer > 0 || isExhaustedBefore) ? 1.35 : 1.0;
      this.attackCooldown = cfg.attackCooldown * fatigueDurationMult;
      this.sound.playWeaponSwing('unarmed');
      this.viewmodel.triggerUnarmedHook(() => {
        this.resolveMeleeStrikeHitCheck(cfg, true, false);
      });
      return;
    }

    const useOverhead = isOverheadSmash && this.activeWeapon === 'bat';
    this.spendStamina(useOverhead ? cfg.staminaCost * 1.35 : cfg.staminaCost);
    const isExhausted = !window.devInfStamina && (this.exhaustionTimer > 0 || isExhaustedBefore);

    this.meleeSwingToggle = !this.meleeSwingToggle;
    const batAwakened = this.activeWeapon === 'bat' && this.awakening.state.isActive;
    const swingSpeedMult = batAwakened ? this.awakening.getSwingSpeedMultiplier() : 1.0;
    const fatigueDurationMult = isExhausted ? 1.4 : lowStamina ? 1.25 : 1.0;
    this.attackCooldown = ((useOverhead ? cfg.attackCooldown * 1.25 : cfg.attackCooldown) * fatigueDurationMult) / swingSpeedMult;
    if (useOverhead) {
      this.viewmodel.triggerOverheadSmash((0.56 * fatigueDurationMult) / swingSpeedMult);
      this.camSpring.addImpulse(-0.14, 0, -0.06, 0);
    } else {
      this.viewmodel.triggerSwing((cfg.swingDuration * fatigueDurationMult) / swingSpeedMult);
    }
    this.sound.playWeaponSwing(this.activeWeapon);

    this.resolveMeleeStrikeHitCheck(cfg, false, useOverhead);
  }

  private resolveMeleeStrikeHitCheck(
    cfg: (typeof WEAPONS_BY_ID)[WeaponId],
    isUnarmedImpact: boolean,
    isOverheadSmash = false,
  ): void {
    const batAwakened = cfg.id === 'bat' && this.awakening.state.isActive;
    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);

    type TargetCandidate =
      | { kind: 'zombie'; zombie: ZombieActor; pos: THREE.Vector3; dist: number; dot: number; score: number }
      | { kind: 'screamer'; screamer: InfectedEnemy; pos: THREE.Vector3; dist: number; dot: number; score: number }
      | { kind: 'night_runner'; nightRunner: NightRunner; pos: THREE.Vector3; dist: number; dot: number; score: number };
    const candidates: TargetCandidate[] = [];

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dy = Math.abs(z.pos.y - this.playerPos.y);
      const dist = Math.hypot(dx, dz);
      if (dist > cfg.reach || dy > 2.2) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > cfg.arcDot) {
        candidates.push({ kind: 'zombie', zombie: z, pos: z.pos, dist, dot, score: dist - dot * 1.4 });
      }
    }

    for (const e of this.infectedEnemies) {
      if (
        e.aiState === 'DEAD' ||
        e.aiState === 'IMPALED_DEAD' ||
        e.aiState === 'DEAD_RAGDOLL' ||
        e.aiState === 'GRABBED'
      ) {
        continue;
      }
      const dx = e.root.position.x - this.playerPos.x;
      const dz = e.root.position.z - this.playerPos.z;
      const dy = Math.abs(e.root.position.y - this.playerPos.y);
      const dist = Math.hypot(dx, dz);
      if (dist > cfg.reach || dy > 2.2) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > cfg.arcDot) {
        candidates.push({
          kind: 'screamer',
          screamer: e,
          pos: e.root.position,
          dist,
          dot,
          score: dist - dot * 1.4,
        });
      }
    }

    for (const nr of this.nightRunners) {
      if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB') continue;
      const dx = nr.group.position.x - this.playerPos.x;
      const dz = nr.group.position.z - this.playerPos.z;
      const dy = Math.abs(nr.group.position.y - this.playerPos.y);
      const dist = Math.hypot(dx, dz);
      if (dist > cfg.reach + 0.35 || dy > 2.2) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > cfg.arcDot) {
        candidates.push({
          kind: 'night_runner',
          nightRunner: nr,
          pos: nr.group.position,
          dist,
          dot,
          score: dist - dot * 1.4,
        });
      }
    }

    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.score - b.score);

    const primary = candidates[0];
    const pdx = primary.pos.x - this.playerPos.x;
    const pdz = primary.pos.z - this.playerPos.z;
    const pDist = Math.hypot(pdx, pdz) || 1;
    const pnx = pdx / pDist;
    const pnz = pdz / pDist;

    this.targetYawGoal = Math.atan2(-pnx, -pnz);
    if (pDist > 1.65) {
      this.lungeTimer = 0.14;
      this.lungeVel.set(pnx * 14, 0, pnz * 14);
    }

    const targets = cfg.cleaveMultiTarget ? candidates.slice(0, 3) : [primary];
    const lureActive = this.viewmodel.getActiveLurePosition() !== null;
    const durabilityScale =
      cfg.maxDurability > 0 && (this.weaponDurability[cfg.id] ?? 0) <= 0 ? 0.72 : 1.0;

    let hitAny = false;
    let hitCrit = false;
    let blockedPrimary = false;
    const aimSlope = Math.tan(THREE.MathUtils.clamp(this.pitch, -1.1, 1.1));
    const swingDir: MeleeSwingDirection =
      isOverheadSmash || !this.onGround || batAwakened
        ? 'overhead'
        : this.meleeSwingToggle
          ? 'left_to_right'
          : 'right_to_left';
    const smashDmgMult = isOverheadSmash ? 1.55 : 1.0;
    const smashKbMult = isOverheadSmash ? 1.4 : 1.0;

    for (const target of targets) {
      const dx = target.pos.x - this.playerPos.x;
      const dz = target.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const nx = dx / dist;
      const nz = dz / dist;
      const aimWorldY = this.camera.position.y + aimSlope * dist;

      if (target.kind === 'zombie') {
        const z = target.zombie;
        const bruteToPlayerX = -nx;
        const bruteToPlayerZ = -nz;
        const bruteForwardX = Math.sin(z.yaw);
        const bruteForwardZ = Math.cos(z.yaw);
        const facingPlayer = bruteToPlayerX * bruteForwardX + bruteToPlayerZ * bruteForwardZ;

        if (z.kind === 'brute' && z.state !== 'stunned' && facingPlayer > 0.2 && !lureActive) {
          if (target === primary) {
            blockedPrimary = true;
          }
          continue;
        }

        hitAny = true;
        if (cfg.id === 'bat') {
          this.awakening.addAwakeningCharge(isOverheadSmash ? 13 : 9);
        }
        const headY = z.pos.y + (z.kind === 'brute' ? 2.45 : z.kind === 'dog' ? 0.85 : 1.72);
        const isHeadCrit = (isOverheadSmash || Math.abs(aimWorldY - headY) <= (z.kind === 'dog' ? 0.42 : 0.46)) && target.dot > 0.72;
        if (isHeadCrit) hitCrit = true;

        const awkDmgMult = (cfg.id === 'bat' ? this.awakening.getDamageMultiplier() : 1.0) * smashDmgMult;
        const awkKbMult = (cfg.id === 'bat' ? this.awakening.getKnockbackMultiplier() : 1.0) * smashKbMult;
        const critMult = isHeadCrit ? 1.75 : 1.0;
        const baseDmg = (cfg.damage * durabilityScale * awkDmgMult + Math.min(20, this.comboCount * 3)) * critMult;
        const damage = Math.round(target === primary ? baseDmg : baseDmg * 0.75);
        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(
          z,
          damage,
          _tmpVecB,
          cfg.knockback * awkKbMult,
          isHeadCrit ? Math.max(cfg.stunDuration, 0.95) : cfg.stunDuration,
          isHeadCrit || batAwakened || isOverheadSmash,
        );
        if (killed) this.killCount++;

        const sparkY = z.kind === 'dog' ? 0.65 : 1.35;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnBloodAndSparks(
          _tmpVecA,
          _tmpVecB,
          isHeadCrit ? 18 : cfg.id === 'cleaver' ? 14 : 10,
        );
        if (killed || isHeadCrit) {
          this.viewmodel.spawnGroundBloodSplatter(z.pos, killed ? 3 : 2);
        }
        if (killed || isHeadCrit || batAwakened || this.comboCount + 1 >= 3) {
          const zFloorY = this.sampleGroundHeight(z.pos.x, z.pos.z);
          this.viewmodel.spawnComboBloodSpatter(
            _tmpVecA,
            _tmpVecB,
            Math.max(zFloorY, z.pos.y),
            killed || isHeadCrit ? 12 : 8,
            batAwakened ? 1.25 : 1.0,
          );
        }
      } else if (target.kind === 'screamer') {
        const e = target.screamer;
        hitAny = true;
        if (cfg.id === 'bat') {
          this.awakening.addAwakeningCharge(9);
        }
        e.getHeadWorldPosition(_tmpVecA);
        const isHeadCrit = Math.abs(aimWorldY - _tmpVecA.y) <= 0.45 && target.dot > 0.72;
        if (isHeadCrit) hitCrit = true;

        const awkDmgMult = (cfg.id === 'bat' ? this.awakening.getDamageMultiplier() : 1.0) * smashDmgMult;
        const awkKbMult = (cfg.id === 'bat' ? this.awakening.getKnockbackMultiplier() : 1.0) * smashKbMult;
        const critMult = isHeadCrit ? 1.75 : 1.0;
        const baseDmg = (cfg.damage * durabilityScale * awkDmgMult + Math.min(20, this.comboCount * 3)) * critMult;
        const damage = Math.round(target === primary ? baseDmg : baseDmg * 0.75);
        _tmpVecB.set(nx, 0, nz);
        e.health -= damage;
        if (e.health <= 0) {
          e.markDead(_tmpVecB);
          this.killCount++;
        } else if (batAwakened || isOverheadSmash || cfg.knockback * awkKbMult >= 11) {
          _grabImpulse.set(nx * cfg.knockback * awkKbMult * 0.85, 4.4, nz * cfg.knockback * awkKbMult * 0.85);
          e.applyKnockdown(_grabImpulse);
        } else {
          e.applyStagger(_tmpVecB, swingDir, isHeadCrit);
        }

        this.viewmodel.spawnBloodAndSparks(
          _tmpVecA,
          _tmpVecB,
          isHeadCrit ? 18 : cfg.id === 'cleaver' ? 14 : 10,
        );
        if (e.health <= 0 || isHeadCrit) {
          this.viewmodel.spawnGroundBloodSplatter(e.root.position, e.health <= 0 ? 3 : 2);
        }
        if (e.health <= 0 || isHeadCrit || batAwakened || this.comboCount + 1 >= 3) {
          const eFloorY = this.sampleGroundHeight(e.root.position.x, e.root.position.z);
          this.viewmodel.spawnComboBloodSpatter(
            _tmpVecA,
            _tmpVecB,
            Math.max(eFloorY, e.root.position.y),
            e.health <= 0 || isHeadCrit ? 12 : 8,
            batAwakened ? 1.25 : 1.0,
          );
        }
      } else {
        const nr = target.nightRunner;
        hitAny = true;
        if (cfg.id === 'bat') {
          this.awakening.addAwakeningCharge(isOverheadSmash ? 13 : 9);
        }
        nr.getHeadWorldPosition(_tmpVecA);
        const isHeadCrit = (isOverheadSmash || Math.abs(aimWorldY - _tmpVecA.y) <= 0.45) && target.dot > 0.72;
        if (isHeadCrit) hitCrit = true;

        const awkDmgMult = (cfg.id === 'bat' ? this.awakening.getDamageMultiplier() : 1.0) * smashDmgMult;
        const awkKbMult = (cfg.id === 'bat' ? this.awakening.getKnockbackMultiplier() : 1.0) * smashKbMult;
        const critMult = isHeadCrit ? 1.75 : 1.0;
        const baseDmg = (cfg.damage * durabilityScale * awkDmgMult + Math.min(20, this.comboCount * 3)) * critMult;
        const damage = Math.round(target === primary ? baseDmg : baseDmg * 0.75);
        _tmpVecB.set(nx, 0, nz);
        const killed = nr.applyDamage(
          damage,
          _tmpVecB,
          Math.max(0.6, cfg.stunDuration),
          Math.max(4.5, cfg.knockback * awkKbMult * 0.7),
        );
        if (killed) this.killCount++;

        this.viewmodel.spawnBloodAndSparks(
          _tmpVecA,
          _tmpVecB,
          isHeadCrit ? 18 : cfg.id === 'cleaver' ? 14 : 10,
        );
        if (killed || isHeadCrit) {
          this.viewmodel.spawnGroundBloodSplatter(nr.group.position, killed ? 3 : 2);
        }
        if (killed || isHeadCrit || batAwakened || this.comboCount + 1 >= 3) {
          const nrFloorY = this.sampleGroundHeight(nr.group.position.x, nr.group.position.z);
          this.viewmodel.spawnComboBloodSpatter(
            _tmpVecA,
            _tmpVecB,
            Math.max(nrFloorY, nr.group.position.y),
            killed || isHeadCrit ? 12 : 8,
            batAwakened ? 1.25 : 1.0,
          );
        }
      }
    }

    if (blockedPrimary && !hitAny && primary.kind === 'zombie') {
      this.viewmodel.triggerBlocked();
      this.sound.playWeaponHit(cfg.id, true);
      this.cameraShake = 0.22;
      _tmpVecA.copy(primary.pos).setY(primary.pos.y + 1.3);
      this.viewmodel.spawnSparks(_tmpVecA, 0x94a3b8, 12);
      this.setSubtitle(
        'COMBAT TIP',
        'Brute blocked frontal strike! Counter [Right-Click], Kick [C], or lure with Firecracker [G]!',
        4.2,
      );
      return;
    }

    if (hitAny) {
      if (cfg.maxDurability > 0) {
        this.weaponDurability[cfg.id] = Math.max(
          0,
          (this.weaponDurability[cfg.id] ?? cfg.maxDurability) - 2,
        );
      }
      if (isUnarmedImpact) {
        this.viewmodel.triggerUnarmedHitstop(0.045);
      }
      const awkHitstop = cfg.id === 'bat' ? this.awakening.getHitstopBonus() : 0;
      this.hitstopTimer = Math.max(
        0.04,
        (cfg.id === 'cleaver' ? 0.055 : 0.04) + awkHitstop + (isOverheadSmash ? 0.04 : 0),
      );
      this.hitMarkerFlash = hitCrit || isOverheadSmash ? 0.24 : 0.14;
      this.cameraShake =
        (cfg.id === 'cleaver' ? 0.26 : 0.18) +
        (hitCrit ? 0.1 : 0) +
        (batAwakened ? 0.08 : 0) +
        (isOverheadSmash ? 0.14 : 0);
      if (isOverheadSmash) {
        this.camSpring.addImpulse(-0.12, 0.04, -0.1, 0);
      }
      this.registerComboHit(1);
      if (this.comboCount >= 3 || hitCrit || batAwakened || isOverheadSmash) {
        const heavy = hitCrit || batAwakened || isOverheadSmash || this.comboCount >= 5;
        this.spawnScreenBloodSpatter(heavy ? 6 : 4, heavy);
      }
      this.sound.playWeaponHit(cfg.id, false);
    }
  }

  private performParkourKick(): void {
    if (
      this.kickCooldown > 0 ||
      this.mantling ||
      this.awakening.state.isActivating ||
      this.headGrabState.active ||
      this.isExecutingFinisher
    ) {
      return;
    }
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
        if (killed || airborne || this.comboCount + 1 >= 3) {
          this.viewmodel.spawnComboBloodSpatter(_tmpVecA, _tmpVecB, z.pos.y, airborne ? 10 : 7, 1.0);
        }
      }
    }

    for (const e of this.infectedEnemies) {
      if (
        e.aiState === 'DEAD' ||
        e.aiState === 'IMPALED_DEAD' ||
        e.aiState === 'DEAD_RAGDOLL' ||
        e.aiState === 'GRABBED'
      ) {
        continue;
      }
      const dx = e.root.position.x - this.playerPos.x;
      const dz = e.root.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(e.root.position.y - this.playerPos.y) > 2.4) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.32) {
        kickedAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        e.health -= damage;
        if (e.health <= 0) {
          e.markDead(_tmpVecB);
          this.killCount++;
        } else {
          _grabImpulse.set(nx * knockForce * 0.78, airborne ? 5.2 : 4.2, nz * knockForce * 0.78);
          e.applyKnockdown(_grabImpulse);
        }
        e.getHeadWorldPosition(_tmpVecA);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, airborne ? 10 : 7);
        if (e.health <= 0 || airborne || this.comboCount + 1 >= 3) {
          this.viewmodel.spawnComboBloodSpatter(_tmpVecA, _tmpVecB, e.root.position.y, airborne ? 10 : 7, 1.0);
        }
      }
    }

    for (const nr of this.nightRunners) {
      if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB') continue;
      const dx = nr.group.position.x - this.playerPos.x;
      const dz = nr.group.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(nr.group.position.y - this.playerPos.y) > 2.4) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.32) {
        kickedAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        const killed = nr.applyDamage(damage, _tmpVecB, stunDur, knockForce * 0.75);
        if (killed) this.killCount++;
        nr.getHeadWorldPosition(_tmpVecA);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, airborne ? 10 : 7);
        if (killed || airborne || this.comboCount + 1 >= 3) {
          this.viewmodel.spawnComboBloodSpatter(_tmpVecA, _tmpVecB, nr.group.position.y, airborne ? 10 : 7, 1.0);
        }
      }
    }

    this.sound.playKick(kickedAny);
    if (kickedAny) {
      this.hitstopTimer = airborne ? 0.055 : 0.04;
      this.cameraShake = airborne ? 0.3 : 0.22;
      this.registerComboHit(1);
      if (airborne || this.comboCount >= 3) {
        this.spawnScreenBloodSpatter(airborne ? 5 : 3, airborne);
      }
    }
  }

  private performCounterParry(): void {
    if (
      this.mantling ||
      this.awakening.state.isActivating ||
      this.headGrabState.active ||
      this.isExecutingFinisher
    ) {
      return;
    }
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

    for (const e of this.infectedEnemies) {
      if (!e.isWindingUp) continue;
      const dx = e.root.position.x - this.playerPos.x;
      const dz = e.root.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 5.5 && Math.abs(e.root.position.y - this.playerPos.y) < 2.5) {
        counteredAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        this.targetYawGoal = Math.atan2(-nx, -nz);

        _tmpVecB.set(nx, 0, nz);
        e.health -= 52;
        if (e.health <= 0) {
          e.markDead(_tmpVecB);
          this.killCount++;
        } else {
          _grabImpulse.set(nx * 9.5, 4.2, nz * 9.5);
          e.applyKnockdown(_grabImpulse);
        }
        e.getHeadWorldPosition(_tmpVecA);
        this.viewmodel.spawnSparks(_tmpVecA, 0xfef08a, 14);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 10);
        this.registerComboHit(2);
      }
    }

    this.viewmodel.triggerParry();
    if (counteredAny) {
      this.awakening.addAwakeningCharge(10);
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
    if (
      this.comboCount < 5 ||
      this.mantling ||
      this.awakening.state.isActivating ||
      this.headGrabState.active ||
      this.isExecutingFinisher
    ) {
      return;
    }

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
        this.viewmodel.spawnComboBloodSpatter(_tmpVecA, _tmpVecB, z.pos.y, 12, 1.25);
      }
    }

    for (const e of this.infectedEnemies) {
      if (
        e.aiState === 'DEAD' ||
        e.aiState === 'IMPALED_DEAD' ||
        e.aiState === 'DEAD_RAGDOLL' ||
        e.aiState === 'GRABBED'
      ) {
        continue;
      }
      const dx = e.root.position.x - this.playerPos.x;
      const dz = e.root.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 7.0 && Math.abs(e.root.position.y - this.playerPos.y) < 3.0) {
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        e.health -= 95;
        if (e.health <= 0) {
          e.markDead(_tmpVecB);
          this.killCount++;
        } else {
          _grabImpulse.set(nx * 11.5, 4.8, nz * 11.5);
          e.applyKnockdown(_grabImpulse);
        }
        e.getHeadWorldPosition(_tmpVecA);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 12);
        this.viewmodel.spawnComboBloodSpatter(_tmpVecA, _tmpVecB, e.root.position.y, 12, 1.25);
      }
    }
    for (const nr of this.nightRunners) {
      if (nr.state === 'DEAD' || nr.state === 'FINISHER_GRAB') continue;
      const dx = nr.group.position.x - this.playerPos.x;
      const dz = nr.group.position.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 7.0 && Math.abs(nr.group.position.y - this.playerPos.y) < 3.0) {
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        if (nr.applyDamage(95, _tmpVecB, 2.2, 11.5)) {
          this.killCount++;
        }
        nr.getHeadWorldPosition(_tmpVecA);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 12);
        this.viewmodel.spawnComboBloodSpatter(_tmpVecA, _tmpVecB, nr.group.position.y, 12, 1.25);
      }
    }
    this.spawnScreenBloodSpatter(9, true);
    this.emitHud();
  }

  private spawnScreenBloodSpatter(count: number, heavy = false): void {
    for (let i = 0; i < count; i++) {
      const edge = Math.floor(Math.random() * 4); // 0=left, 1=right, 2=top, 3=bottom
      let xPct = 50;
      let yPct = 50;
      if (edge === 0) {
        xPct = 1.5 + Math.random() * 11.5;
        yPct = 4 + Math.random() * 90;
      } else if (edge === 1) {
        xPct = 87 + Math.random() * 11.5;
        yPct = 4 + Math.random() * 90;
      } else if (edge === 2) {
        xPct = 6 + Math.random() * 88;
        yPct = 1.5 + Math.random() * 10.5;
      } else {
        xPct = 6 + Math.random() * 88;
        yPct = 87 + Math.random() * 10.5;
      }

      const maxLife = heavy ? 4.4 + Math.random() * 1.4 : 3.4 + Math.random() * 1.1;
      const baseOp = heavy ? 0.72 + Math.random() * 0.22 : 0.56 + Math.random() * 0.22;
      this.screenSpatters.push({
        id: this.nextSpatterId++,
        xPct,
        yPct,
        sizePx: heavy ? 42 + Math.random() * 54 : 28 + Math.random() * 34,
        rotDeg: Math.round(Math.random() * 360),
        scaleX: 0.78 + Math.random() * 0.55,
        scaleY: 0.92 + Math.random() * 0.62,
        dripPx: 0,
        opacity: baseOp,
        variant: (Math.floor(Math.random() * 3) as 0 | 1 | 2),
        age: 0,
        maxLife,
        dripSpeed: heavy ? 11 + Math.random() * 14 : 6 + Math.random() * 9,
      });
    }
    if (this.screenSpatters.length > 26) {
      this.screenSpatters.splice(0, this.screenSpatters.length - 26);
    }
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
    this.rollTimer = 0.68;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.rollBufferTimer = 0;
    this.heavyLandingTimer = 0;
    this.isCrouching = false;
    this.slideTimer = 0;
    this.sprintMomentum = 1.0;
    this.rollSpeed = Math.max(this.preRollSpeed, horizSpeed, MOVEMENT_CONFIG.SPRINT_SPEED * 1.15);
    this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.playerVel.x = this.rollDir.x * this.rollSpeed;
    this.playerVel.z = this.rollDir.z * this.rollSpeed;
    this.sound.playSafetyRoll();
    this.cameraShake = 0.08;
    this.camSpring.addImpulse(-0.14, 0.06, -0.22, 0);
    this.fovPunch = 4.0;
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
        if (b.disabled || b.ramp) continue;
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
      if (b.disabled || b.id === ignoreId || b.ramp) continue;
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
        if (b.disabled || !b.mantleable || b.ramp) continue;

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
          !b.disabled &&
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
      this.spendStamina(12);
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

  private spendStamina(cost: number): void {
    if (window.devInfStamina) {
      this.stamina = this.maxStamina;
      this.sprintExhausted = false;
      this.exhaustionTimer = 0;
      return;
    }
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaPauseTimer = 0.65;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.sprintExhausted = true;
      this.exhaustionTimer = Math.max(this.exhaustionTimer, 1.8);
    }
  }

  private beginMantle(b: BoxCollider, targetX: number, targetZ: number): void {
    this.preMantleSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.mantling = true;
    this.mantleTimer = 0;
    const lowStam = !window.devInfStamina && this.stamina < 25;
    this.mantleDuration = lowStam ? 1.42 : 1.15;
    this.slideTimer = 0;
    this.isCrouching = false;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.isVariableJump = false;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.peakFallSpeed = 0;
    this.heavyLandingTimer = 0;
    this.mantleStart.copy(this.playerPos);
    this.mantleEnd.set(targetX, b.maxY + 0.02, targetZ);

    // Exact 3D ledge lip grip coordinates along the facing edge
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
    const lipX = THREE.MathUtils.clamp(this.playerPos.x + _forward.x * 0.48, b.minX, b.maxX);
    const lipZ = THREE.MathUtils.clamp(this.playerPos.z + _forward.z * 0.48, b.minZ, b.maxZ);
    this.climbGripLeft.set(lipX - _right.x * 0.24, b.maxY, lipZ - _right.z * 0.24);
    this.climbGripRight.set(lipX + _right.x * 0.24, b.maxY, lipZ + _right.z * 0.24);
    this.ledgeNormalWorld.set(-_forward.x, 0, -_forward.z);

    this.camSpring.addImpulse(-0.18, 0, -0.14, 0);
    this.airPeakY = this.mantleEnd.y;
    this.playerVel.set(0, 0, 0);
    this.jumpBufferTimer = 0;
    this.spendStamina(14);
    this.awardParkourCombo(PARKOUR_CONFIG.LEDGE_STYLE_POINTS, 'LEDGE MANTLE', 0.32);
    this.awakening.addAwakeningCharge(6);
    this.sound.playLedgeGrab(false);
  }

  private beginVault(b: BoxCollider, targetX: number, targetZ: number): void {
    this.preVaultSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    const strafeHeld = Boolean(this.keys['KeyA'] || this.keys['KeyD']);
    const isSprintFwd = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !strafeHeld;
    this.vaultKind = isSprintFwd && this.preVaultSpeed > 7.5 ? 'KONG_VAULT' : 'SPEED_VAULT';
    this.vaulting = true;
    this.vaultTimer = 0;
    this.slideTimer = 0;
    this.isCrouching = false;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.isVariableJump = false;
    this.postLandRollTimer = 0;
    this.pendingHardFallDist = 0;
    this.peakFallSpeed = 0;
    this.heavyLandingTimer = 0;
    this.vaultStart.copy(this.playerPos);
    const landedPast =
      targetX <= b.minX - PLAYER_RADIUS ||
      targetX >= b.maxX + PLAYER_RADIUS ||
      targetZ <= b.minZ - PLAYER_RADIUS ||
      targetZ >= b.maxZ + PLAYER_RADIUS;
    this.vaultEnd.set(targetX, landedPast ? Math.min(this.playerPos.y, b.minY) : b.maxY + 0.02, targetZ);
    this.vaultPeakY = b.maxY + (this.vaultKind === 'KONG_VAULT' ? 0.54 : 0.45);
    this.airPeakY = this.vaultEnd.y;
    this.jumpBufferTimer = 0;
    this.camSpring.addImpulse(
      this.vaultKind === 'KONG_VAULT' ? -0.14 : -0.08,
      this.vaultKind === 'SPEED_VAULT' ? -0.1 : 0,
      -0.06,
      0,
    );
    this.spendStamina(14);
    this.awardParkourCombo(
      PARKOUR_CONFIG.VAULT_STYLE_POINTS,
      this.vaultKind === 'KONG_VAULT' ? 'KONG VAULT' : 'SPEED VAULT',
      0.36,
    );
    this.awakening.addAwakeningCharge(6);
    this.sound.playLedgeGrab(true);
  }

  private updatePlayerPhysics(dt: number): void {
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - dt);
    this.rollBufferTimer = Math.max(0, this.rollBufferTimer - dt);
    this.ziplineDetachCooldown = Math.max(0, this.ziplineDetachCooldown - dt);
    this.parkourMoveTimer = Math.max(0, this.parkourMoveTimer - dt);
    this.exhaustionTimer = Math.max(0, this.exhaustionTimer - dt);
    this.hitSlowTimer = Math.max(0, this.hitSlowTimer - dt);
    if (this.heavyLandingTimer > 0) {
      this.heavyLandingTimer = Math.max(0, this.heavyLandingTimer - dt);
      if (this.heavyLandingTimer <= 0) {
        this.heavyLandingRecoveryScale = 1.0;
      }
    }

    if (!this.onGround && this.playerVel.y < 0) {
      this.peakFallSpeed = Math.max(this.peakFallSpeed, -this.playerVel.y);
    }

    if (window.devImmortal) {
      this.health = this.maxHealth;
      this.damageFlash = 0;
    }

    if (this.postLandRollTimer > 0) {
      this.postLandRollTimer = Math.max(0, this.postLandRollTimer - dt);
      if (this.postLandRollTimer <= 0) {
        this.pendingHardFallDist = 0;
      }
    }

    if (this.flowDecayTimer > 0) {
      this.flowDecayTimer = Math.max(0, this.flowDecayTimer - dt);
    } else if (this.parkourFlow > 0) {
      this.parkourFlow = Math.max(0, this.parkourFlow - dt * 0.25);
    }

    this.fovPunch = THREE.MathUtils.lerp(this.fovPunch, 0, 1 - Math.exp(-dt * 10));

    // Lock WASD/sprint/jump locomotion cleanly during Awakening cutscene, Bat Face-Drive finisher, or Night Runner finisher
    if (this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive) {
      this.playerVel.x = 0;
      this.playerVel.z = 0;
      this.sprintMomentum = 0;
      this.slideTimer = 0;
      this.jumpBufferTimer = 0;
      this.sound.updateSlideLoop(false, 0);
      this.sound.updateZiplineLoop(false, 0);
      if (!this.onGround) {
        this.playerVel.y -= PARKOUR_CONFIG.GRAVITY * dt;
        this.playerPos.y += this.playerVel.y * dt;
        const groundY = this.sampleGroundHeight(this.playerPos.x, this.playerPos.z);
        if (this.playerPos.y <= groundY) {
          this.playerPos.y = groundY;
          this.playerVel.y = 0;
          this.onGround = true;
        }
      }
      return;
    }

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
    const activeWeaponCfg = WEAPONS_BY_ID[this.activeWeapon];
    const vaultSpeedMult = activeWeaponCfg.vaultSpeedMultiplier * (this.awakening.state.isActive ? 1.12 : 1.0);
    const moveSpeedMult = activeWeaponCfg.moveSpeedMultiplier * this.awakening.getMoveSpeedMultiplier();

    if (this.vaulting) {
      this.vaultTimer += dt * vaultSpeedMult;
      const t = Math.min(1, this.vaultTimer / PARKOUR_CONFIG.VAULT_DURATION);
      this.playerPos.x = THREE.MathUtils.lerp(this.vaultStart.x, this.vaultEnd.x, t);
      this.playerPos.z = THREE.MathUtils.lerp(this.vaultStart.z, this.vaultEnd.z, t);
      const baseY = THREE.MathUtils.lerp(this.vaultStart.y, this.vaultEnd.y, t);
      const lift = Math.max(0, this.vaultPeakY - baseY);
      this.playerPos.y = baseY + Math.sin(t * Math.PI) * lift;
      this.mantlePitchOffset = -Math.sin(t * Math.PI) * (this.vaultKind === 'KONG_VAULT' ? 0.22 : 0.11);
      // 10-degree tilt to the right for Speed Vault; level forward tuck for Kong Vault
      this.mantleRollOffset =
        this.vaultKind === 'SPEED_VAULT'
          ? -Math.sin(t * Math.PI) * THREE.MathUtils.degToRad(PARKOUR_CONFIG.VAULT_TILT_DEG)
          : 0;
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
        const carrySpeed = Math.max(this.preVaultSpeed, MOVEMENT_CONFIG.SPRINT_SPEED * 0.92 * moveSpeedMult);
        this.playerVel.x = -Math.sin(this.yaw) * carrySpeed;
        this.playerVel.z = -Math.cos(this.yaw) * carrySpeed;
      }
      return;
    }

    // 1B. Handle active 4-Stage Ledge Grab & Muscle-Up (0.0s .. 1.15s)
    if (this.mantling) {
      this.mantleTimer += dt * vaultSpeedMult;
      const totalDur = this.mantleDuration;
      const stagePose = computeMuscleUpStage(this.mantleTimer, totalDur);
      const fp = stagePose.forwardProgress;
      this.playerPos.x = THREE.MathUtils.lerp(this.mantleStart.x, this.mantleEnd.x, fp);
      this.playerPos.z = THREE.MathUtils.lerp(this.mantleStart.z, this.mantleEnd.z, fp);
      this.playerPos.y =
        THREE.MathUtils.lerp(this.mantleStart.y, this.mantleEnd.y, stagePose.camYOffset > 0 ? Math.min(1, stagePose.camYOffset) : 0) +
        (stagePose.stage === 1 ? stagePose.camYOffset : 0);
      this.mantlePitchOffset = stagePose.camPitchOffset;
      this.mantleRollOffset = stagePose.stage === 2 ? 0.045 : stagePose.stage === 3 ? -0.04 : 0;

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

    // Stamina & 1.8s Exhaustion lockout (cannot sprint until exhaustion ends & stamina > 20%)
    const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    if (this.sprintExhausted && this.exhaustionTimer <= 0 && this.stamina >= MOVEMENT_CONFIG.STAMINA_RECOVERY_THRESHOLD) {
      this.sprintExhausted = false;
    }
    const isSprinting =
      wantsSprint &&
      rawFwd > 0 &&
      this.exhaustionTimer <= 0 &&
      !this.sprintExhausted &&
      !this.isCrouching &&
      this.slideTimer <= 0 &&
      this.stamina > 0;

    if (window.devInfStamina) {
      this.stamina = this.maxStamina;
      this.sprintExhausted = false;
      this.exhaustionTimer = 0;
      this.staminaPauseTimer = 0;
    } else if (isSprinting) {
      this.stamina = Math.max(0, this.stamina - MOVEMENT_CONFIG.STAMINA_DRAIN_RATE * dt);
      this.staminaPauseTimer = 0.65;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.sprintExhausted = true;
        this.exhaustionTimer = 1.8;
      }
    } else {
      this.staminaPauseTimer = Math.max(0, this.staminaPauseTimer - dt);
      if (this.staminaPauseTimer <= 0) {
        const regenScale = this.exhaustionTimer > 0 ? 0.45 : 1.0;
        this.stamina = Math.min(this.maxStamina, this.stamina + MOVEMENT_CONFIG.STAMINA_REGEN_RATE * regenScale * dt);
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
          const wrSpeed = (12.2 + this.parkourFlow * 1.6) * moveSpeedMult;
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
    const hitSlowMult = this.hitSlowTimer > 0 ? 0.65 : 1.0;
    const heavySlowMult = this.heavyLandingTimer > 0 ? this.heavyLandingRecoveryScale : 1.0;
    const activeTopSpeed = (this.isCrouching
      ? MOVEMENT_CONFIG.CROUCH_SPEED
      : THREE.MathUtils.lerp(MOVEMENT_CONFIG.WALK_SPEED, MOVEMENT_CONFIG.SPRINT_SPEED, smoothSprint)) * moveSpeedMult * hitSlowMult * heavySlowMult;

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

      // Slide knocks down/trips zombies & Screamers in path
      for (const z of this.zombies.zombies) {
        if (z.state === 'dead' || z.state === 'stunned') continue;
        if (this.playerPos.distanceTo(z.pos) < 1.9 && Math.abs(this.playerPos.y - z.pos.y) < 1.5) {
          const killed = this.zombies.damageZombie(z, 14, this.slideDir, 10.2, 1.25);
          if (killed) this.killCount++;
          this.sound.playKick(true);
        }
      }
      for (const e of this.infectedEnemies) {
        if (
          e.aiState === 'DEAD' ||
          e.aiState === 'IMPALED_DEAD' ||
          e.aiState === 'DEAD_RAGDOLL' ||
          e.aiState === 'KNOCKDOWN' ||
          e.aiState === 'GRABBED'
        ) {
          continue;
        }
        if (this.playerPos.distanceTo(e.root.position) < 1.9 && Math.abs(this.playerPos.y - e.root.position.y) < 1.5) {
          e.health -= 14;
          if (e.health <= 0) {
            e.markDead(this.slideDir);
            this.killCount++;
          } else {
            _grabImpulse.set(this.slideDir.x * 8.5, 3.8, this.slideDir.z * 8.5);
            e.applyKnockdown(_grabImpulse);
          }
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
        this.spendStamina(12);
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
      if (b.disabled) continue;
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

    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -106.2, 56.2);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -93, 49.5);

    // Integrate Y and resolve ground / roof / thin bridge planks / sloped ramps
    const prevY = this.playerPos.y;
    const impactVel = this.playerVel.y;
    this.playerPos.y += this.playerVel.y * dt;

    let groundHeight = 0;
    let landedCushion = false;
    let landedColliderId: string | undefined;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (b.disabled) continue;
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
            landedColliderId = b.id;
          }
        }
      }
    }

    this.currentFloorSurface = classifySurfaceType(landedColliderId);

    if (this.playerPos.y <= groundHeight) {
      if (!this.onGround) {
        const fallDistance = Math.max(0, this.airPeakY - groundHeight);
        const absImpact = Math.max(Math.abs(impactVel), this.peakFallSpeed);
        const impact = classifyLandingImpact(absImpact, this.rollBufferTimer > 0, landedCushion);

        if (impact.tier === 'PARKOUR_ROLL') {
          this.preRollSpeed = Math.max(horizSpeed, MOVEMENT_CONFIG.SPRINT_SPEED * 1.15);
          this.startSafetyRoll(fallDistance);
          this.viewmodel.triggerLandingImpact(fallDistance);
        } else if (landedCushion) {
          this.sound.playTarpLand();
          this.camSpring.addImpulse(impact.camPitchKick, 0, impact.camDropY, 0);
          this.viewmodel.triggerLandingImpact(Math.max(1.5, fallDistance));
        } else if (impact.tier === 'CRITICAL_IMPACT' || impact.tier === 'HEAVY_BRACE') {
          this.sound.playLandingThud(true, absImpact);
          this.cameraShake = impact.tier === 'CRITICAL_IMPACT' ? 0.32 : 0.2;
          this.camSpring.addImpulse(
            impact.camPitchKick,
            impact.tier === 'CRITICAL_IMPACT' ? 0.06 : 0,
            impact.camDropY,
            0,
          );
          this.fovPunch = impact.fovPunch;
          this.heavyLandingTimer = impact.stunDuration;
          this.heavyLandingRecoveryScale = impact.tier === 'CRITICAL_IMPACT' ? 0.15 : 0.25;
          this.viewmodel.triggerLandingImpact(Math.max(4.0, fallDistance));
          this.viewmodel.spawnDustPuffs(this.playerPos, impact.tier === 'CRITICAL_IMPACT' ? 14 : 9);
          this.postLandRollTimer = PARKOUR_CONFIG.ROLL_WINDOW;
          this.pendingHardFallDist = fallDistance;
          this.preRollSpeed = Math.max(horizSpeed, MOVEMENT_CONFIG.SPRINT_SPEED);
          if (impact.damage > 0) {
            this.takeDamage(impact.damage);
          }
        } else if (absImpact > 5.8) {
          this.sound.playLandingThud(false, absImpact);
          this.cameraShake = 0.08;
          this.camSpring.addImpulse(impact.camPitchKick, 0, impact.camDropY, 0);
          this.fovPunch = impact.fovPunch;
          this.viewmodel.triggerLandingImpact(Math.max(1.2, fallDistance));
          this.viewmodel.spawnDustPuffs(this.playerPos, 4);
        } else if (absImpact > 2.4) {
          this.camSpring.addImpulse(-0.02, 0, -0.05, 0);
          this.viewmodel.triggerLandingImpact(0.8);
        }
      }

      this.playerPos.y = groundHeight;
      this.playerVel.y = 0;
      this.peakFallSpeed = 0;
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
          : sprintTargetFov) +
      this.fovPunch +
      this.awakening.getFovOffset();

    if (!this.batFaceDriveState.active && Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-dt * 11));
      this.camera.updateProjectionMatrix();
    }

    // Continuous subtle high-pass wind rush when > 12.5 m/s, 2x+ combo, or fast falling
    this.sound.updateWindLoop(true, postHorizSpeed, this.comboCount, this.onGround ? 0 : this.playerVel.y);
  }

  private syncCameraToPlayer(dt: number): void {
    const safeDt = dt > 0 ? dt : 0.016;
    const cineCam = this.awakening.getCinematicCamera();
    if (cineCam.active) {
      this.camera.position.set(
        this.playerPos.x + cineCam.shakeX,
        this.playerPos.y + PLAYER_EYE_HEIGHT + cineCam.heightOffset + cineCam.shakeY,
        this.playerPos.z,
      );
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = cineCam.yaw;
      this.camera.rotation.x = cineCam.pitch;
      this.camera.rotation.z = cineCam.roll;
      if (Math.abs(this.camera.fov - cineCam.fov) > 0.02) {
        this.camera.fov = cineCam.fov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

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
      // Trigger surface-aware footstep foley + subtle step spring impulse at the bottom trough
      if (this.onGround && this.prevBobCos < 0 && cosVal >= 0) {
        this.sound.playFootstep(sprintRatio, this.isCrouching, this.currentFloorSurface);
        this.camSpring.addImpulse(
          -(0.012 + sprintRatio * 0.018),
          Math.sin(this.bobPhase * 0.5) * 0.008,
          -(0.018 + sprintRatio * 0.022),
          0,
        );
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

    if (this.lookDownInspect) {
      this.pitch = THREE.MathUtils.lerp(this.pitch, -1.06, 1 - Math.exp(-safeDt * 22));
    }

    const springState = this.camSpring.step(
      safeDt,
      this.heavyLandingTimer > 0 ? -0.32 : 0,
      0,
      this.heavyLandingTimer > 0 ? -0.22 : 0,
      0,
    );

    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shakeX = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.25 : 0;
    const shakeY = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.25 : 0;
    const zipVibX = this.activeZipline ? Math.sin(this.elapsed * 68) * 0.009 : 0;
    const zipVibY = this.activeZipline ? Math.cos(this.elapsed * 74) * 0.009 : 0;

    this.camera.position.set(
      this.playerPos.x + _right.x * (this.bobX + springState.posX) + shakeX + zipVibX,
      this.playerPos.y +
        PLAYER_EYE_HEIGHT +
        this.eyeHeightOffset +
        this.landingDipOffset +
        springState.posY +
        this.bobY +
        shakeY +
        zipVibY,
      this.playerPos.z + _right.z * (this.bobX + springState.posX),
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x =
      THREE.MathUtils.clamp(this.pitch + this.mantlePitchOffset + springState.pitch, -1.45, 1.45) +
      this.rollPitchOffset;

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
      strafeTiltRad +
      sprintTurnTiltRad +
      this.mantleRollOffset +
      slideRollRad +
      wallRunRollRad +
      zipSwayRollRad +
      springState.roll;
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
        if (b.disabled || b.ramp) continue;
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
      const nextTime = (this.timeOfDay + dt / FULL_CYCLE_SECONDS) % 1;
      if (nextTime < this.timeOfDay) {
        this.survivedDays++;
      }
      this.timeOfDay = nextTime;

      if (this.flashlightOn && !this.isFinisherActive) {
        this.flashlightBattery = Math.max(0, this.flashlightBattery - 1.8 * dt);
        if (this.flashlightBattery <= 0) {
          this.flashlightOn = false;
          this.flashlight.intensity = 0;
          this.sound.playFlashlightClick();
        }
      }
    }

    const isNight = this.isNightTime();

    if (this.phase === 'playing' && isNight && !this.wasNight) {
      if (!this.flashlightOn && this.flashlightBattery > 0) {
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

    const atmo = this.lighting.getAtmosphereState();
    this.crysisUniforms.uTime.value = this.elapsed;
    this.crysisUniforms.uSunDir.value.copy(atmo.sunDir);
    this.crysisUniforms.uSunColor.value.copy(atmo.sunColor);
    this.crysisUniforms.uSkyHorizon.value.copy(atmo.skyHorizon);
    this.crysisUniforms.uSkyZenith.value.copy(atmo.skyZenith);
    if (this.sunShaftsPass && this.sunShaftsPass.enabled) {
      this.camera.updateMatrixWorld();
      this.sunShaftsPass.updateFromCamera(this.camera, atmo.sunDir, atmo.sunColor, atmo.sunIntensity);
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000));
      this.lastNow = now;

      if (
        this.qHoldPending &&
        this.phase === 'playing' &&
        !this.radioOpen &&
        !this.intro.isIntroPlaying &&
        !this.awakening.state.isActivating &&
        now - this.qPressTimeMs >= 165
      ) {
        this.qHoldPending = false;
        this.openWeaponWheel('KeyQ');
      }

      const targetWheelScale = this.weaponWheelOpen ? 0.25 : 1.0;
      this.wheelTimeScale = THREE.MathUtils.lerp(
        this.wheelTimeScale,
        targetWheelScale,
        1 - Math.exp(-rawDt * 18),
      );

      let timeScale = this.wheelTimeScale;
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
        timeScale = Math.min(timeScale, 0.03);
      } else if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - rawDt);
        timeScale = Math.min(timeScale, 0.28);
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
            this.lowStaminaPulseTimer = Math.max(0, this.lowStaminaPulseTimer - rawDt);

            if (this.lmbDownActive && this.activeWeapon === 'bat' && this.attackCooldown <= 0) {
              this.lmbHoldTime += rawDt;
              this.overheadCharge = THREE.MathUtils.clamp((this.lmbHoldTime - 0.1) / 0.35, 0, 1);
            } else {
              this.overheadCharge = Math.max(0, this.overheadCharge - rawDt * 6);
            }

            if (!window.devInfStamina && this.stamina < 25) {
              this.lowStaminaHeartbeatTimer -= rawDt;
              if (this.lowStaminaHeartbeatTimer <= 0) {
                this.lowStaminaHeartbeatTimer = 0.92;
                this.sound.playLowStaminaHeartbeat();
                this.sound.playLowStaminaBreath();
              }
            } else {
              this.lowStaminaHeartbeatTimer = 0;
            }
            if (this.liberationToastTimer > 0) {
              this.liberationToastTimer = Math.max(0, this.liberationToastTimer - rawDt);
              if (this.liberationToastTimer <= 0) {
                this.liberationToastName = null;
              }
            }
            if (this.squadCommandToastTimer > 0) {
              this.squadCommandToastTimer = Math.max(0, this.squadCommandToastTimer - rawDt);
              if (this.squadCommandToastTimer <= 0) {
                this.squadCommandToast = null;
              }
            }
            if (this.allyDownAlertTimer > 0) {
              this.allyDownAlertTimer = Math.max(0, this.allyDownAlertTimer - rawDt);
              if (this.allyDownAlertTimer <= 0) {
                this.allyDownAlert = null;
              }
            }
            this.cameraShake = Math.max(0, this.cameraShake - rawDt * 1.6);
            this.damageFlash = Math.max(0, this.damageFlash - rawDt * 2.2);
            this.parryFlash = Math.max(0, this.parryFlash - rawDt * 2.4);
            this.hitMarkerFlash = Math.max(0, this.hitMarkerFlash - rawDt * 1.4);
            this.finisherGoreOpacity = Math.max(0, this.finisherGoreOpacity - rawDt / 0.8);

            for (let i = this.directionalHits.length - 1; i >= 0; i--) {
              this.directionalHits[i].intensity -= rawDt * 1.35;
              if (this.directionalHits[i].intensity <= 0) {
                this.directionalHits.splice(i, 1);
              }
            }

            for (let i = this.screenSpatters.length - 1; i >= 0; i--) {
              const sp = this.screenSpatters[i];
              sp.age += rawDt;
              sp.dripPx += sp.dripSpeed * rawDt;
              const fadeRatio = 1 - Math.max(0, (sp.age - sp.maxLife * 0.55) / (sp.maxLife * 0.45));
              if (sp.age >= sp.maxLife) {
                this.screenSpatters.splice(i, 1);
              } else {
                sp.opacity = Math.min(sp.opacity, fadeRatio * 0.92);
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

            this.awakening.update(
              rawDt,
              dt,
              this.scene,
              this.playerPos,
              this.sound.getAudioContext(),
              this.sound.isMuted(),
            );
            const bonkHitstopPaused =
              (this.awakening.state.isActivating || this.batFaceDriveState.active) && this.hitstopTimer > 0;
            if (!bonkHitstopPaused && !this.isFinisherActive) {
              this.updatePlayerPhysics(dt);
            }
            if (!this.isFinisherActive) {
              this.syncCameraToPlayer(dt);
            } else {
              this.updateNightRunnerFinisher(rawDt);
            }

            const isCutsceneLocked = this.awakening.state.isActivating || this.isExecutingFinisher || this.isFinisherActive;
            const horizVelMag = isCutsceneLocked ? 0 : Math.hypot(this.playerVel.x, this.playerVel.z);
            const moveSpeedRatio = Math.min(1, horizVelMag / MOVEMENT_CONFIG.WALK_SPEED);
            const isSprinting =
              !isCutsceneLocked &&
              Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
              !this.sprintExhausted &&
              !this.isCrouching &&
              this.sprintMomentum > 0.25 &&
              horizVelMag > MOVEMENT_CONFIG.WALK_SPEED + 0.5;
            this.intro.update(rawDt, isSprinting, this.introCamState);
            const isLookingDown = !isCutsceneLocked && (this.lookDownInspect || (this.onGround && this.pitch < -0.52));

            const strafeInput = isCutsceneLocked ? 0 : (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
            const mantleTotalDur = this.mantleDuration > 0 ? this.mantleDuration : 1.15;
            const safeZone = this.world.tajSafeZone;
            const inSafeZone =
              this.playerPos.z <= safeZone.maxZ &&
              this.playerPos.x >= safeZone.minX &&
              this.playerPos.x <= safeZone.maxX;

            this.parkourState =
              this.heavyLandingTimer > 0
                ? 'HEAVY_LANDING'
                : this.rollTimer > 0
                  ? 'PARKOUR_ROLL'
                  : this.slideTimer > 0
                    ? 'SLIDE'
                    : this.vaulting
                      ? this.vaultKind
                      : this.mantling
                        ? 'MUSCLE_UP'
                        : this.wallRunSide === -1
                          ? 'WALL_RUN_LEFT'
                          : this.wallRunSide === 1
                            ? 'WALL_RUN_RIGHT'
                            : !this.onGround
                              ? 'AIRBORNE'
                              : 'GROUNDED';

            if (!this.isFinisherActive) {
              this.updateHeadGrabSequence(rawDt);
              this.updateBatFaceDriveSequence(rawDt);
            }

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
                bobX: isCutsceneLocked ? 0 : this.bobX,
                bobY: isCutsceneLocked ? 0 : this.bobY,
                strafeInput,
                vaultProgress: this.vaulting ? Math.min(1, this.vaultTimer / PARKOUR_CONFIG.VAULT_DURATION) : 0,
                mantleProgress: this.mantling ? Math.min(1, this.mantleTimer / mantleTotalDur) : 0,
                rollProgress: this.rollTimer > 0 ? 1 - this.rollTimer / 0.68 : 0,
                isNight: this.isNightTime(),
                inSafeZone,
                horizSpeed: horizVelMag,
                yawDelta: isCutsceneLocked ? 0 : this.viewmodelYawDelta,
                pitchDelta: isCutsceneLocked ? 0 : this.viewmodelPitchDelta,
                wallPullback: isCutsceneLocked ? 0 : this.computeViewmodelWallPullback(),
                climbState: this.mantling ? 'MUSCLE_UP' : 'NONE',
                climbPhaseTime: this.mantling ? (this.mantleTimer / mantleTotalDur) * 1.15 : 0,
                leftGripWorld: this.mantling ? this.climbGripLeft : undefined,
                rightGripWorld: this.mantling ? this.climbGripRight : undefined,
                ledgeNormalWorld: this.mantling ? this.ledgeNormalWorld : undefined,
                awakeningActive: this.awakening.state.isActive,
                awakeningPose: this.awakening.getViewmodelPose(),
                awakeningBatEmissive: this.awakening.getBatCrimsonEmissive(),
                awakeningBatEmissiveIntensity: this.awakening.getBatEmissiveIntensity(),
                headGrabActive: this.headGrabState.active,
                headGrabTimer: this.headGrabState.timer,
                batFaceDriveActive: this.batFaceDriveState.active,
                batFaceDriveTimer: this.batFaceDriveState.timer,
                inspectLeftArm: false,
                parkourState: this.parkourState,
                vaultKind: this.vaultKind,
                isHeavyLanding: this.heavyLandingTimer > 0,
                overheadChargeRatio: this.overheadCharge,
                lowStaminaTremor: !window.devInfStamina && this.stamina < 25,
                lowerBodySync: isCutsceneLocked
                  ? undefined
                  : {
                      x: this.playerPos.x,
                      y: this.playerPos.y,
                      z: this.playerPos.z,
                      yaw: this.yaw,
                      pitch: this.camera.rotation.x,
                    },
              },
            );
            this.viewmodelYawDelta = 0;
            this.viewmodelPitchDelta = 0;

            const lurePos = this.viewmodel.getActiveLurePosition();
            if (!bonkHitstopPaused) {
              this.zombies.update(
                dt,
                this.playerPos,
                this.isNightTime(),
                lurePos,
                this.world.colliders,
                this.world.tajSafeZone,
                (dmg, attackerPos) => {
                  this.takeDamage(dmg, attackerPos);
                },
                (kind) => this.sound.playZombieGroan(kind),
                this.isFinisherActive,
              );

              if (!this.isFinisherActive) {
                for (let i = 0; i < this.infectedEnemies.length; i++) {
                  const e = this.infectedEnemies[i];
                  e.update(
                    dt,
                    this.elapsed,
                    this.playerPos,
                    this.isNightTime(),
                    lurePos,
                    this.world.colliders,
                    this.world.tajSafeZone,
                    (dmg, attackerPos) => this.takeDamage(dmg, attackerPos),
                    () => this.sound.playScreamerScreech(),
                    () => this.sound.playZombieGroan('screamer'),
                  );
                }
                this.applyScreamerSeparation();
                if (this.headGrabState.active) {
                  this.syncGrabbedEnemyTransform();
                } else if (this.batFaceDriveState.active && !this.batFaceDriveState.ragdollTriggered) {
                  this.syncFinisherEnemyTransform();
                }
                this.updateNightRunners(dt);
              }
            }

            const terrEvents = this.territories.update(
              dt,
              this.elapsed,
              this.playerPos,
              this.zombies.zombies,
              (z, dmg, dir, kb = 5.0) => this.zombies.damageZombie(z, dmg, dir, kb, 0.45),
              this.infectedEnemies,
              this.nightRunners,
              this.isFinisherActive,
            );
            this.activeTerritoryHud = terrEvents.activeHudTerritory;
            if (terrEvents.pulleyClicked) {
              this.sound.playPulleyClick();
            }
            if (terrEvents.newlyLiberatedName) {
              this.liberationToastName = terrEvents.newlyLiberatedName;
              this.liberationToastTimer = 4.0;
              this.sound.playLiberationChord();
              this.setSubtitle(
                'OVERWATCH RADIO',
                `${terrEvents.newlyLiberatedName} liberated! Allied runners deployed and UV perimeter online.`,
                6.5,
              );
            }
            if (terrEvents.playerInsideLiberated && !this.isFinisherActive) {
              this.health = Math.min(this.maxHealth, this.health + 6 * dt);
              this.flashlightBattery = Math.min(100, this.flashlightBattery + 10 * dt);
            }
            if (terrEvents.killDelta > 0) {
              this.killCount += terrEvents.killDelta;
            }

            if (!bonkHitstopPaused) {
              const allyEvents = this.allies.update(
                dt,
                this.elapsed,
                this.playerPos,
                this.yaw,
                this.territories.sectors,
                this.zombies.zombies,
                (z, dmg, dir, kb = 3.2, stun = 0.55, forceInterrupt = true) =>
                  this.zombies.damageZombie(z, dmg, dir, kb, stun, forceInterrupt),
                this.infectedEnemies,
                this.nightRunners,
                this.world.colliders,
                this.isFinisherActive,
              );
              if (allyEvents.killDelta > 0) {
                this.killCount += allyEvents.killDelta;
              }
              for (let ai = 0; ai < allyEvents.impactPositions.length; ai++) {
                this.viewmodel.spawnSparks(allyEvents.impactPositions[ai], 0x94a3b8, 6);
                this.sound.playAllyPipeImpact();
              }
              if (allyEvents.newlyDeadNames.length > 0) {
                this.allyDownAlert = `ALLY DOWN: ${allyEvents.newlyDeadNames[0]} WAS KILLED`;
                this.allyDownAlertTimer = 3.8;
              }
            }

            this.world.crates.forEach((c) => {
              if (!c.collected) {
                c.beaconRing.position.y = 1.2 + Math.sin(this.elapsed * 3.2) * 0.14;
                c.beaconRing.rotation.z = this.elapsed * 1.4;
              }
            });

            const nextWave = this.killCount >= 10 ? 3 : this.killCount >= 5 ? 2 : 1;
            if (nextWave > this.waveNumber) {
              this.waveNumber = nextWave;
              this.zombies.spawnWavePack(this.waveNumber, this.playerPos);
              // Respawn any dead Screamers on escalating waves to keep courtyard intense
              for (let i = 0; i < this.infectedEnemies.length && i < SCREAMER_SPAWN_POINTS.length; i++) {
                const e = this.infectedEnemies[i];
                if (e.aiState === 'DEAD' || e.aiState === 'DEAD_RAGDOLL' || e.aiState === 'IMPALED_DEAD') {
                  const sp = SCREAMER_SPAWN_POINTS[i];
                  if (Math.hypot(sp.x - this.playerPos.x, sp.z - this.playerPos.z) > 10) {
                    e.reset(sp.x, sp.y, sp.z, sp.yaw);
                    e.alerted = true;
                  }
                }
              }
              this.sound.playScreamerScreech();
              this.setSubtitle(
                'OUTBREAK ALERT',
                `Wave ${this.waveNumber} incoming — Elite Infected flanking through the courtyard!`,
                5.5,
              );
            }

            if (!this.extractionReady && this.killCount >= this.killsTarget) {
              this.extractionReady = true;
              this.world.setExtractionActive(true);
              this.setSubtitle(
                'OVERWATCH RADIO',
                '15 Infected Eliminated! Extraction Flare lit at the Taj Courtyard Plinth — reach the beacon!',
                9.0,
              );
            }

            const allCollected = this.world.crates.every((c) => c.collected);
            const sz = this.world.tajSafeZone;
            const inTajSafeZone =
              this.playerPos.z <= sz.maxZ &&
              this.playerPos.x >= sz.minX &&
              this.playerPos.x <= sz.maxX;
            const reachedFlare =
              this.extractionReady &&
              this.playerPos.distanceTo(this.world.extractionPoint) <= 3.6;

            if ((this.extractionReady && (reachedFlare || inTajSafeZone)) || (allCollected && inTajSafeZone)) {
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
        const panT = this.elapsed * 0.14;
        this.camera.position.set(
          Math.sin(panT) * 26.0,
          7.4 + Math.sin(panT * 1.6) * 0.6,
          18.0 + Math.cos(panT * 0.85) * 16.0,
        );
        this.camera.lookAt(Math.sin(panT * 0.5) * 4.0, 2.6, -24.0);
        this.world.updateGuard(this.elapsed, this.playerPos, false);
      } else {
        this.sound.stopContinuousLoops();
      }

      this.governor.sampleFrame(rawDt, (cfg: GovernorRenderConfig) => {
        this.useDirectForward = cfg.useDirectForward;
        this.renderer.setPixelRatio(cfg.pixelRatio);
        this.renderer.setSize(this.viewportW, this.viewportH);
        this.crysisUniforms.uFoliageLodStart.value = Math.max(14, cfg.foliageCullMeters - 10);
        this.crysisUniforms.uFoliageLodEnd.value = cfg.foliageCullMeters;
        this.crysisUniforms.uPomMaxDist.value = cfg.pomMaxMeters;
        this.lighting.setShadowDistance(cfg.shadowDistance);
        if (this.composer) {
          this.composer.setPixelRatio(cfg.pixelRatio);
          this.composer.setSize(this.viewportW, this.viewportH);
          if (this.bloomPass) {
            this.bloomPass.setSize(
              Math.max(1, Math.floor(this.viewportW * 0.5)),
              Math.max(1, Math.floor(this.viewportH * 0.5)),
            );
            this.bloomPass.enabled = cfg.bloomEnabled;
          }
          if (this.sunShaftsPass) {
            this.sunShaftsPass.setSize(this.viewportW, this.viewportH);
            this.sunShaftsPass.enabled = cfg.sunShaftsEnabled;
          }
          if (this.crysisPostPass) {
            this.crysisPostPass.setSize(this.viewportW, this.viewportH);
          }
        }
        this.renderer.shadowMap.needsUpdate = !this.isSoftwareGl;
      });

      this.updateAtmosphere(this.radioOpen ? 0 : dt);
      const showVm = this.phase === 'playing' && !this.isFinisherActive;
      this.viewmodel.setVisible(showVm);
      this.renderer.shadowMap.needsUpdate = this.governor.shouldUpdateShadows(this.isSoftwareGl);
      if (!this.useDirectForward && this.composer) {
        if (this.viewmodelPass) {
          this.viewmodelPass.enabled = showVm;
        }
        this.composer.render();
      } else {
        this.camera.layers.enable(0);
        this.camera.layers.enable(1);
        this.camera.layers.disable(2);
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);
        if (showVm) {
          const prevBg = this.scene.background;
          this.renderer.shadowMap.needsUpdate = false;
          this.scene.background = null;
          this.camera.layers.set(2);
          this.renderer.autoClear = false;
          this.renderer.clearDepth();
          this.renderer.render(this.scene, this.camera);
          this.renderer.autoClear = true;
          this.scene.background = prevBg;
          this.camera.layers.enable(0);
          this.camera.layers.enable(1);
          this.camera.layers.disable(2);
        }
      }

      this.hudThrottle += rawDt;
      if (this.hudThrottle >= 0.066) {
        this.hudThrottle = 0;
        this.emitHud();
      }

      const renderElapsedMs = performance.now() - now;
      if (this.isSoftwareGl) {
        this.afterDraw(tick, renderElapsedMs);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private afterDraw(cb: () => void, lastFrameMs = 0): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const restMs = lastFrameMs > 300 ? Math.min(800, Math.round(lastFrameMs * 0.35)) : 80;
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, restMs);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private emitHud(): void {
    const w = this.viewportW;
    const h = this.viewportH;
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
      for (let i = 0; i < this.infectedEnemies.length; i++) {
        const e = this.infectedEnemies[i];
        if (!e.isWindingUp) continue;
        e.getHeadWorldPosition(_projVec);
        _projVec.y += 0.35;
        _projVec.project(this.camera);
        if (_projVec.z > 0 && _projVec.z < 1) {
          const rawSx = (_projVec.x * 0.5 + 0.5) * w;
          const rawSy = (-_projVec.y * 0.5 + 0.5) * h;
          if (rawSx >= -40 && rawSx <= w + 40 && rawSy >= -40 && rawSy <= h + 40) {
            counterIndicators.push({
              id: 9000 + i,
              x: Math.max(40, Math.min(w - 40, rawSx)),
              y: Math.max(58, Math.min(h - 48, rawSy)),
              progress: e.windupProgress,
            });
          }
        }
      }
    }

    const allyNameplates: AllyNameplate[] = [];
    let livingAllyCount = 0;
    for (let i = 0; i < this.allies.allies.length; i++) {
      const a = this.allies.allies[i];
      if (a.state === 'DEAD') continue;
      livingAllyCount++;
      if (this.phase !== 'playing' || this.intro.isIntroPlaying || this.isFinisherActive) continue;
      const dist = Math.hypot(a.mesh.position.x - this.playerPos.x, a.mesh.position.z - this.playerPos.z);
      if (dist > 22.0) continue;
      a.getNameplateWorldPos(_projVec);
      _projVec.project(this.camera);
      if (_projVec.z > 0 && _projVec.z < 1) {
        const sx = (_projVec.x * 0.5 + 0.5) * w;
        const sy = (-_projVec.y * 0.5 + 0.5) * h;
        if (sx >= 24 && sx <= w - 24 && sy >= 24 && sy <= h - 24) {
          allyNameplates.push({
            id: a.id,
            name: a.name,
            hp: Math.round(a.hp),
            maxHp: a.maxHp,
            mode: a.commandMode === 'FOLLOW' ? 'FOLLOW' : 'GUARD',
            x: Math.round(sx),
            y: Math.round(sy),
            dist: Math.round(dist),
            inCombat: a.state === 'COMBAT',
          });
        }
      }
    }

    let interactionPrompt = '';
    const cratesCollected = this.world.crates.filter((c) => c.collected).length;
    const nearGuardTower = this.phase === 'playing' && this.isNearGuardTower();
    if (this.phase === 'playing' && !this.radioOpen && !this.intro.isIntroPlaying) {
      if (this.isExecutingFinisher) {
        interactionPrompt = '';
      } else if (this.headGrabState.active) {
        interactionPrompt = '[MMB] Shove Away';
      } else if (this.wallRunSide !== 0) {
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
        if (!interactionPrompt && this.world.isNearHaveliMedkit(this.playerPos)) {
          interactionPrompt = '[E] Use First-Aid Kit (+35 HP)';
        }
        if (!interactionPrompt) {
          interactionPrompt = this.world.getNearbyDoorPrompt(this.playerPos);
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
        if (!interactionPrompt && this.extractionReady) {
          interactionPrompt = 'Extraction Flare Lit — Reach the Beacon at Taj Courtyard Plinth!';
        } else if (!interactionPrompt && cratesCollected === this.world.crates.length) {
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

    const grabCandidate =
      this.phase === 'playing' && !this.isGrabbingEnemy && !this.isExecutingFinisher
        ? this.findScreamerInGrabCone()
        : null;
    const canGrabEnemy = grabCandidate !== null;
    const grabTargetHealthy = grabCandidate !== null && !grabCandidate.canBeHeadGrabbed();
    const moveSpread = THREE.MathUtils.clamp(
      Math.hypot(this.playerVel.x, this.playerVel.z) / MOVEMENT_CONFIG.SPRINT_SPEED +
        (this.attackCooldown > 0 ? 0.35 : 0),
      0,
      1.3,
    );

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
      flashlightBattery: Math.round(this.flashlightBattery),
      lowStaminaPulse: this.lowStaminaPulseTimer > 0,
      isFinisherActive: this.isFinisherActive,
      finisherVignetteOpacity: Number(this.finisherVignetteOpacity.toFixed(3)),
      finisherBlackoutOpacity: Number(this.finisherBlackoutOpacity.toFixed(3)),
      deathCause: this.deathCause,
      survivedDays: this.survivedDays,
      activeTerritory: this.activeTerritoryHud ? { ...this.activeTerritoryHud } : null,
      territoryLiberationToast: this.liberationToastTimer > 0 ? this.liberationToastName : null,
      allyNameplates,
      squadCommandToast: this.squadCommandToastTimer > 0 ? this.squadCommandToast : null,
      allyDownAlert: this.allyDownAlertTimer > 0 ? this.allyDownAlert : null,
      allyCount: livingAllyCount,
      firecrackerCooldown: Math.max(0, Number(this.firecrackerCooldown.toFixed(1))),
      kickCooldown: Math.max(0, Number(this.kickCooldown.toFixed(1))),
      canMantle: this.canMantle,
      activeWeapon: this.activeWeapon,
      previousWeapon: this.previousWeapon,
      scrapParts: this.scrapParts,
      weaponDurability: { ...this.weaponDurability },
      weaponWheelOpen: this.weaponWheelOpen,
      wheelHoveredSlot: this.wheelHoveredSlot,
      wheelCursorX: this.wheelCursorX,
      wheelCursorY: this.wheelCursorY,
      timeLabel: this.getTimeLabel(),
      subtitleText: this.subtitleTimer > 0 ? this.subtitleText : '',
      subtitleSpeaker: this.subtitleSpeaker,
      interactionPrompt,
      pointerLocked: this.pointerLocked,
      counterIndicators,
      directionalHits: this.directionalHits.map((d) => ({ ...d })),
      damageFlash: this.damageFlash,
      parryFlash: this.parryFlash,
      slowMoActive: this.slowMoTimer > 0 || this.weaponWheelOpen,
      parkourFlow: Number(this.parkourFlow.toFixed(2)),
      parkourMove: this.parkourMoveTimer > 0 ? this.parkourMoveLabel : undefined,
      parkourState: this.parkourState,
      speedKmh: Math.round(Math.hypot(this.playerVel.x, this.playerVel.z) * 3.6),
      overheadCharge: Number(this.overheadCharge.toFixed(2)),
      lookDownInspect: this.lookDownInspect,
      heavyLanding: this.heavyLandingTimer > 0,
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
      awakening: this.awakening.getHudSnapshot(),
      isGrabbingEnemy: this.isGrabbingEnemy,
      isExecutingFinisher: this.isExecutingFinisher,
      finisherGoreOpacity: Number(this.finisherGoreOpacity.toFixed(3)),
      exhausted: !window.devInfStamina && (this.exhaustionTimer > 0 || this.sprintExhausted),
      exhaustionRemaining: Number(this.exhaustionTimer.toFixed(1)),
      executionsCount: this.executionsCount,
      waveNumber: this.waveNumber,
      killsTarget: this.killsTarget,
      extractionReady: this.extractionReady,
      extractionDistance: Math.round(this.playerPos.distanceTo(this.world.extractionPoint)),
      hitMarkerFlash: Number(this.hitMarkerFlash.toFixed(3)),
      moveSpread: Number(moveSpread.toFixed(2)),
      canGrabEnemy,
      grabTargetHealthy,
      screenBloodSpatters: this.screenSpatters.map((s) => ({
        id: s.id,
        xPct: s.xPct,
        yPct: s.yPct,
        sizePx: s.sizePx,
        rotDeg: s.rotDeg,
        scaleX: s.scaleX,
        scaleY: s.scaleY,
        dripPx: Number(s.dripPx.toFixed(1)),
        opacity: Number(s.opacity.toFixed(3)),
        variant: s.variant,
      })),
    });
  }

  public getLiveMinimapTelemetry(): MinimapTelemetry {
    const crates: MinimapTelemetry['crates'] = [];
    for (let i = 0; i < this.world.crates.length; i++) {
      const c = this.world.crates[i];
      crates.push({
        id: c.id,
        x: c.position.x,
        y: c.position.y,
        z: c.position.z,
        collected: c.collected,
      });
    }

    const enemies: MinimapTelemetry['enemies'] = [];
    const zombies = this.zombies.zombies;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.state === 'dead') continue;
      enemies.push({
        x: z.pos.x,
        z: z.pos.z,
        kind: z.kind,
        alerted: z.state === 'chase' || z.state === 'windup',
      });
    }
    for (let i = 0; i < this.infectedEnemies.length; i++) {
      const e = this.infectedEnemies[i];
      if (e.aiState === 'DEAD' || e.aiState === 'IMPALED_DEAD' || e.aiState === 'DEAD_RAGDOLL') continue;
      enemies.push({
        x: e.root.position.x,
        z: e.root.position.z,
        kind: 'screamer',
        alerted: e.aiState === 'CHASE' || e.aiState === 'GRABBED',
      });
    }
    for (let i = 0; i < this.nightRunners.length; i++) {
      const nr = this.nightRunners[i];
      if (nr.state === 'DEAD') continue;
      enemies.push({
        x: nr.group.position.x,
        z: nr.group.position.z,
        kind: 'night_runner',
        alerted: nr.state === 'CHASE' || nr.state === 'ATTACK_MELEE' || nr.state === 'FINISHER_GRAB',
      });
    }

    const allies: NonNullable<MinimapTelemetry['allies']> = [];
    for (let i = 0; i < this.allies.allies.length; i++) {
      const a = this.allies.allies[i];
      if (a.state === 'DEAD') continue;
      allies.push({
        id: a.id,
        name: a.name,
        x: a.mesh.position.x,
        z: a.mesh.position.z,
        mode: a.commandMode === 'FOLLOW' ? 'FOLLOW' : 'GUARD',
      });
    }

    const territories: NonNullable<MinimapTelemetry['territories']> = [];
    for (let i = 0; i < this.territories.sectors.length; i++) {
      const s = this.territories.sectors[i];
      territories.push({
        id: s.data.id,
        name: s.data.name,
        x: s.data.center.x,
        z: s.data.center.z,
        radius: s.data.radius,
        captured: s.data.captured,
        progress: s.data.progress,
      });
    }

    return {
      playerX: this.playerPos.x,
      playerY: this.playerPos.y,
      playerZ: this.playerPos.z,
      playerYaw: this.yaw,
      crates,
      enemies,
      allies,
      tajGate: {
        x: this.world.tajGateCenter.x,
        z: this.world.tajGateCenter.z,
      },
      watchtower: {
        x: this.world.guardTowerCenter.x,
        z: this.world.guardTowerCenter.z,
      },
      territories,
    };
  }

  private updateHeadGrabSequence(rawDt: number): void {
    const hg = this.headGrabState;
    if (!hg.active || !hg.enemy) return;

    if (
      hg.enemy.aiState === 'DEAD' ||
      hg.enemy.aiState === 'IMPALED_DEAD' ||
      hg.enemy.aiState === 'DEAD_RAGDOLL' ||
      this.phase !== 'playing'
    ) {
      this.clearHeadGrabState();
      return;
    }

    hg.timer += rawDt;

    if (!hg.impactTriggered && hg.timer >= 0.18) {
      hg.impactTriggered = true;
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.04);
      this.sound.playHeadGrabImpact();
      this.fovPunch = -4.0;
      this.cameraShake = Math.max(this.cameraShake, 0.35);
    }

    if (!hg.holdTriggered && hg.timer >= 0.22) {
      hg.holdTriggered = true;
      this.sound.playGrabbedRasp();
    }

    if (!hg.lockedInvoked && hg.timer >= 0.35) {
      hg.lockedInvoked = true;
      if (this.onHeadGrabLocked) {
        this.onHeadGrabLocked(hg.enemy);
      }
    }

    // Hold window up to 3.0 seconds before shoving enemy away at 8.0 m/s
    if (hg.timer >= 3.0) {
      this.shoveGrabbedEnemyAway(8.0);
    }
  }

  private updateBatFaceDriveSequence(rawDt: number): void {
    const bf = this.batFaceDriveState;
    if (!bf.active || !bf.enemy) return;
    if (this.phase !== 'playing') {
      this.clearBatFaceDriveState();
      return;
    }

    const enemy = bf.enemy;
    const baseFov = MOVEMENT_CONFIG.BASE_FOV + this.awakening.getFovOffset();

    // Freeze timeline progression cleanly during the 75ms impact hit-stop
    if (this.hitstopTimer <= 0) {
      bf.timer += rawDt;
    }
    const t = bf.timer;

    // Phase 1 & 2 (0.00s -> 0.30s): Wind-Up & Ramming Thrust FOV narrow (75 -> 69)
    if (t < 0.3) {
      const targetFov = THREE.MathUtils.lerp(baseFov, 69, Math.min(1, t / 0.22));
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-rawDt * 18));
        this.camera.updateProjectionMatrix();
      }
    }

    // Exact t = 0.30s Impact Trigger (fires once)
    if (!bf.impactTriggered && t >= 0.3) {
      bf.impactTriggered = true;
      enemy.setImpaledLimp();
      this.killCount++;
      this.executionsCount++;
      this.hitMarkerFlash = 0.28;
      this.registerComboHit(2);
      this.awakening.addAwakeningCharge(25);

      // 75ms heavy impact freeze + upward camera recoil + 0.90 trauma shake + 81 deg FOV spike
      this.hitstopTimer = 0.075;
      this.pitch = THREE.MathUtils.clamp(this.pitch + 0.07, -1.42, 1.42);
      this.cameraShake = Math.max(this.cameraShake, 0.9);
      this.camera.fov = 81;
      this.camera.updateProjectionMatrix();
      this.finisherGoreOpacity = 1.0;

      // 26 crimson gore droplets bursting from face/mouth + glistening blood stain on front 40% of bat
      enemy.getMouthWorldPosition(_grabHeadWorld);
      _grabFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      this.viewmodel.spawnFinisherGoreBurst(_grabHeadWorld, _grabFwd, 26);
      this.viewmodel.spawnGroundBloodSplatter(enemy.root.position, 3);
      this.viewmodel.spawnComboBloodSpatter(
        _grabHeadWorld,
        _grabFwd,
        this.sampleGroundHeight(enemy.root.position.x, enemy.root.position.z),
        16,
        1.35,
      );
      this.spawnScreenBloodSpatter(10, true);
      this.viewmodel.setBatBloodStained(true);
      this.sound.playBatFaceDriveAudio();
      this.emitHud();
    }

    // Phase 3 (0.30s -> 1.05s): Impaled corpse hold, 81 -> 76 FOV settle, & 0.045s blood drips -> floor puddles
    if (t >= 0.3 && t < 1.05 && this.hitstopTimer <= 0) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 76, 1 - Math.exp(-rawDt * 8));
      this.camera.updateProjectionMatrix();

      bf.dripTimer -= rawDt;
      if (bf.dripTimer <= 0) {
        bf.dripTimer = 0.045;
        enemy.getMouthWorldPosition(_grabHeadWorld);
        _grabHeadWorld.x += (Math.random() - 0.5) * 0.07;
        _grabHeadWorld.z += (Math.random() - 0.5) * 0.07;
        const mouthFloorY = this.sampleGroundHeight(_grabHeadWorld.x, _grabHeadWorld.z);
        this.viewmodel.spawnBloodDrip(_grabHeadWorld, mouthFloorY);

        if (Math.random() < 0.65) {
          this.viewmodel.getBatTipWorldPosition(_tmpVecA);
          const tipFloorY = this.sampleGroundHeight(_tmpVecA.x, _tmpVecA.z);
          this.viewmodel.spawnBloodDrip(_tmpVecA, tipFloorY);
        }
      }
    }

    // Phase 4a (1.05s): Yank bat free & fling 6 final crimson droplets off bat tip
    if (!bf.yankBurstTriggered && t >= 1.05) {
      bf.yankBurstTriggered = true;
      _grabFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      this.viewmodel.getBatTipWorldPosition(_tmpVecA);
      this.viewmodel.spawnFinisherGoreBurst(_tmpVecA, _grabFwd, 6);
      this.viewmodel.spawnComboBloodSpatter(
        _tmpVecA,
        _grabFwd,
        this.sampleGroundHeight(enemy.root.position.x, enemy.root.position.z),
        8,
        1.0,
      );
      this.spawnScreenBloodSpatter(4, false);
    }

    // Phase 4b (1.10s): Dead corpse flung backward/downward onto its blood puddle
    if (!bf.ragdollTriggered && t >= 1.1) {
      bf.ragdollTriggered = true;
      _grabFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      _grabImpulse.set(_grabFwd.x * 2.5, -6.0, _grabFwd.z * 2.5);
      enemy.startDeadRagdoll(_grabImpulse, (Math.random() < 0.5 ? 1 : -1) * 0.24);
    }

    if (t >= 1.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, baseFov, 1 - Math.exp(-rawDt * 10));
      this.camera.updateProjectionMatrix();
    }

    if (t >= 1.35) {
      this.camera.fov = baseFov;
      this.camera.updateProjectionMatrix();
      this.clearBatFaceDriveState();
      this.attackCooldown = 0.18;
      this.emitHud();
    }
  }

  private syncFinisherEnemyTransform(): void {
    const bf = this.batFaceDriveState;
    if (!bf.active || !bf.enemy) return;
    const enemy = bf.enemy;

    _grabFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const t = bf.timer;
    const lockDist = t >= 0.3 ? 1.02 : 1.05;
    const sagOffset = t >= 0.3 ? Math.min(1, (t - 0.3) / 0.75) * 0.06 : 0;

    enemy.root.position.x = this.camera.position.x + _grabFwd.x * lockDist;
    enemy.root.position.z = this.camera.position.z + _grabFwd.z * lockDist;
    enemy.yaw = this.yaw;
    enemy.root.rotation.set(0, enemy.yaw, 0);

    enemy.getHeadWorldPosition(_grabHeadWorld);
    const desiredHeadCenterY = this.camera.position.y - 0.2 - sagOffset;
    enemy.root.position.y += desiredHeadCenterY - _grabHeadWorld.y;
    enemy.root.updateMatrixWorld(true);
  }

  private syncGrabbedEnemyTransform(): void {
    const hg = this.headGrabState;
    if (!hg.active || !hg.enemy) return;
    const enemy = hg.enemy;

    _grabFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const lockDist = 1.05;
    const goalX = this.camera.position.x + _grabFwd.x * lockDist;
    const goalZ = this.camera.position.z + _grabFwd.z * lockDist;

    const pullU = Math.min(1, hg.timer / 0.18);
    const easePull = 1 - Math.pow(1 - pullU, 3);
    const clamped = hg.timer >= 0.18;
    const tremorX = clamped ? Math.sin(this.elapsed * 28) * 0.012 : 0;
    const tremorY = clamped ? Math.cos(this.elapsed * 31) * 0.008 : 0;

    enemy.root.position.x = THREE.MathUtils.lerp(hg.startPos.x, goalX, easePull) + tremorX;
    enemy.root.position.z = THREE.MathUtils.lerp(hg.startPos.z, goalZ, easePull);

    let yawDiff = ((this.yaw - hg.startYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    enemy.yaw = hg.startYaw + yawDiff * easePull;
    enemy.root.rotation.set(0, enemy.yaw, 0);

    // Measure current head center height and align skull crown cleanly to camera.position.y - 0.12
    enemy.getHeadWorldPosition(_grabHeadWorld);
    const desiredHeadCenterY = this.camera.position.y - 0.23 + tremorY;
    const targetRootY = enemy.root.position.y + (desiredHeadCenterY - _grabHeadWorld.y);
    enemy.root.position.y = THREE.MathUtils.lerp(hg.startPos.y, targetRootY, easePull);
    enemy.root.updateMatrixWorld(true);
  }

  private applyScreamerSeparation(): void {
    const count = this.infectedEnemies.length;
    if (count === 0) return;

    // 1. Screamer <-> Screamer pairwise separation
    for (let i = 0; i < count; i++) {
      const a = this.infectedEnemies[i];
      if (
        a.aiState === 'DEAD' ||
        a.aiState === 'IMPALED_DEAD' ||
        a.aiState === 'DEAD_RAGDOLL' ||
        a.aiState === 'GRABBED'
      ) {
        continue;
      }
      for (let j = i + 1; j < count; j++) {
        const b = this.infectedEnemies[j];
        if (
          b.aiState === 'DEAD' ||
          b.aiState === 'IMPALED_DEAD' ||
          b.aiState === 'DEAD_RAGDOLL' ||
          b.aiState === 'GRABBED'
        ) {
          continue;
        }
        if (Math.abs(a.root.position.y - b.root.position.y) > 1.8) continue;

        let dx = b.root.position.x - a.root.position.x;
        let dz = b.root.position.z - a.root.position.z;
        const distSq = dx * dx + dz * dz;
        const minSep = 1.2;
        if (distSq < minSep * minSep) {
          let dist = Math.sqrt(distSq);
          if (dist < 0.001) {
            dx = Math.cos(i * 1.7 + j);
            dz = Math.sin(i * 1.7 + j);
            dist = 1;
          }
          const push = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.root.position.x -= nx * push;
          a.root.position.z -= nz * push;
          b.root.position.x += nx * push;
          b.root.position.z += nz * push;
        }
      }

      // 2. Screamer <-> standard ZombieActor separation
      for (let k = 0; k < this.zombies.zombies.length; k++) {
        const z = this.zombies.zombies[k];
        if (z.state === 'dead') continue;
        if (Math.abs(a.root.position.y - z.pos.y) > 1.8) continue;

        let dx = z.pos.x - a.root.position.x;
        let dz = z.pos.z - a.root.position.z;
        const minSep = z.kind === 'brute' ? 1.45 : 1.2;
        const distSq = dx * dx + dz * dz;
        if (distSq < minSep * minSep) {
          let dist = Math.sqrt(distSq);
          if (dist < 0.001) {
            dx = 1;
            dz = 0;
            dist = 1;
          }
          const push = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.root.position.x -= nx * push;
          a.root.position.z -= nz * push;
          z.pos.x += nx * push;
          z.pos.z += nz * push;
          z.group.position.copy(z.pos);
        }
      }
    }
  }

  private sampleTerritoryFloorY(x: number, z: number): number {
    let bestY = 0;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (b.disabled || b.ramp) continue;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (b.maxY <= 4.5 && b.maxY > bestY) {
          bestY = b.maxY;
        }
      }
    }
    return bestY;
  }

  private sampleNpcGroundHeight(x: number, z: number, curY: number): number {
    let bestY = 0;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (b.disabled) continue;
      if (x >= b.minX - 0.15 && x <= b.maxX + 0.15 && z >= b.minZ - 0.15 && z <= b.maxZ + 0.15) {
        let topY = b.maxY;
        if (b.ramp) {
          const coord = b.ramp.axis === 'x' ? x : z;
          const span = b.ramp.highCoord - b.ramp.lowCoord;
          const t = span !== 0 ? THREE.MathUtils.clamp((coord - b.ramp.lowCoord) / span, 0, 1) : 1;
          topY = THREE.MathUtils.lerp(b.ramp.lowY, b.ramp.highY, t);
        }
        if (curY >= topY - 0.65 && topY > bestY) {
          bestY = topY;
        }
      }
    }
    return bestY;
  }

  private spawnTerritoryDefenders(): void {
    const walkerOffsetsBySector: Record<string, Array<[number, number]>> = {
      sector_plinth: [
        [-6.5, 4.5],
        [6.5, 4.5],
        [-7.5, -5.5],
        [7.5, -5.5],
      ],
      sector_charbagh: [
        [-7.5, 5.0],
        [7.5, 5.0],
        [-8.0, -5.0],
        [8.0, -5.0],
        [0, 7.5],
      ],
      sector_mausoleum: [
        [-4.5, -74.5],
        [4.5, -74.5],
        [-2.2, -64.5],
        [2.2, -64.5],
        [-15.0, -76.0],
        [15.0, -76.0],
      ],
    };

    const nightRunnerOffsetsBySector: Record<string, Array<[number, number]>> = {
      sector_plinth: [[0, -6.5]],
      sector_charbagh: [
        [-5.5, -1.5],
        [5.5, -1.5],
      ],
      sector_mausoleum: [
        [-5.5, -80.0],
        [5.5, -80.0],
        [0, -70.0],
      ],
    };

    let nextNrId = 12000;
    for (let i = 0; i < this.territories.sectors.length; i++) {
      const sec = this.territories.sectors[i].data;
      const wOffsets = walkerOffsetsBySector[sec.id] ?? [];
      for (let w = 0; w < sec.defenderWalkers; w++) {
        const [ox, oz] = wOffsets[w % wOffsets.length] ?? [((w % 2 === 0 ? 1 : -1) * (4 + w)), 0];
        const wx = sec.id === 'sector_mausoleum' ? ox : sec.center.x + ox;
        const wz = sec.id === 'sector_mausoleum' ? oz : sec.center.z + oz;
        const wy = this.sampleTerritoryFloorY(wx, wz);
        const actor = this.zombies.spawnActor('shambler', wx, wy, wz, true, sec.id);
        sec.defenderIds.push(actor.id);
      }

      const nrOffsets = nightRunnerOffsetsBySector[sec.id] ?? [];
      for (let n = 0; n < sec.defenderNightRunners; n++) {
        const [ox, oz] = nrOffsets[n % nrOffsets.length] ?? [0, -5];
        const nx = sec.id === 'sector_mausoleum' ? ox : sec.center.x + ox;
        const nz = sec.id === 'sector_mausoleum' ? oz : sec.center.z + oz;
        const ny = this.sampleTerritoryFloorY(nx, nz);
        const nr = new NightRunner(nextNrId++, nx, ny, nz, this.scene, this.textures);
        nr.territoryId = sec.id;
        this.nightRunners.push(nr);
        sec.nightRunnerIds.push(nr.id);
      }

      sec.aliveDefenders = sec.defenderIds.length + sec.nightRunnerIds.length;
    }
    this.territories.syncWindowGlobals();
  }

  private updateNightRunners(dt: number): void {
    const isNight = this.isNightTime();
    const safeSample = (x: number, z: number) => this.sampleTerritoryFloorY(x, z);

    for (let i = 0; i < this.nightRunners.length; i++) {
      const nr = this.nightRunners[i];
      const res = nr.update(
        dt,
        this.playerPos,
        this.health,
        this.world.colliders,
        safeSample,
        isNight,
        this.isFinisherActive,
      );

      if (res.triggeredFinisher && !this.isFinisherActive && !window.devImmortal) {
        this.triggerNightRunnerFinisher(nr);
        return;
      }

      if (res.dealtDamage > 0) {
        this.takeDamage(res.dealtDamage, nr.group.position);
      }
    }
  }

  private triggerNightRunnerFinisher(attacker: NightRunner): void {
    if (this.isFinisherActive || this.phase !== 'playing') return;

    this.isFinisherActive = true;
    this.finisherTimer = 0;
    this.finisherPhaseStep = 1;
    this.finisherAttacker = attacker;
    this.finisherVignetteOpacity = 0.45;
    this.finisherBlackoutOpacity = 0;
    this.finisherDropStartY = this.camera.position.y;
    this.finisherStartYaw = this.yaw;
    this.finisherStartPitch = this.pitch;

    this.clearHeadGrabState();
    this.clearBatFaceDriveState();
    this.viewmodel.setVisible(false);
    this.slideTimer = 0;
    this.rollTimer = 0;
    this.mantling = false;
    this.vaulting = false;
    this.wallRunSide = 0;
    this.activeZipline = null;
    this.activeLadder = null;
    this.playerVel.set(0, 0, 0);
    this.sound.stopContinuousLoops();

    attacker.state = 'FINISHER_GRAB';
    attacker.frozenForFinisher = true;
    for (let i = 0; i < this.nightRunners.length; i++) {
      if (this.nightRunners[i] !== attacker) {
        this.nightRunners[i].frozenForFinisher = true;
      }
    }

    // Snap Night Runner 0.65m directly in front of camera facing player
    const camFwdX = -Math.sin(this.yaw);
    const camFwdZ = -Math.cos(this.yaw);
    const snapX = this.playerPos.x + camFwdX * 0.65;
    const snapZ = this.playerPos.z + camFwdZ * 0.65;
    const snapY = this.sampleTerritoryFloorY(snapX, snapZ);
    attacker.group.position.set(snapX, snapY, snapZ);
    attacker.yaw = Math.atan2(this.playerPos.x - snapX, this.playerPos.z - snapZ);
    attacker.group.rotation.set(0, attacker.yaw, 0);
    attacker.group.updateMatrixWorld(true);

    this.sound.playNightRunnerShriek();
    this.sound.playStruggleHeartbeat();
    this.emitHud();
  }

  private updateNightRunnerFinisher(rawDt: number): void {
    const attacker = this.finisherAttacker;
    if (!this.isFinisherActive || !attacker) return;

    this.finisherTimer += rawDt;
    const t = this.finisherTimer;
    const groundY = this.sampleTerritoryFloorY(this.playerPos.x, this.playerPos.z);

    // Compute exact look angles toward attacker's glowing red eyes
    attacker.getHeadWorldPosition(_tmpVecA);
    const dx = _tmpVecA.x - this.camera.position.x;
    const dy = _tmpVecA.y - this.camera.position.y;
    const dz = _tmpVecA.z - this.camera.position.z;
    const horiz = Math.hypot(dx, dz) || 0.001;
    const lookYaw = Math.atan2(-dx, -dz);
    const lookPitch = Math.atan2(dy, horiz);

    // Phase 1 (0.0s - 0.35s): Sudden lunge & camera snap onto red eyes
    if (t < 0.35) {
      const u = THREE.MathUtils.clamp(t / 0.15, 0, 1);
      const ease = 1 - Math.pow(1 - u, 3);
      let yawDiff = ((lookYaw - this.finisherStartYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.yaw = this.finisherStartYaw + yawDiff * ease;
      this.pitch = THREE.MathUtils.lerp(this.finisherStartPitch, lookPitch, ease);

      this.camera.position.set(this.playerPos.x, this.finisherDropStartY, this.playerPos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;

      attacker.poseFinisherGrabInCameraSpace(this.camera, 0.22, Math.sin(t * 24));
      this.finisherVignetteOpacity = 0.45 + 0.25 * Math.sin(t * 16);
      return;
    }

    // Phase 2 (0.35s - 1.15s): Struggle, Claw Lock & Violent 0.045 rad shake + 8Hz crimson vignette
    if (t < 1.15) {
      if (this.finisherPhaseStep < 2) {
        this.finisherPhaseStep = 2;
      }
      const shakeX = (Math.random() - 0.5) * 0.09;
      const shakeY = (Math.random() - 0.5) * 0.09;
      this.camera.position.set(this.playerPos.x, this.finisherDropStartY, this.playerPos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = lookYaw + shakeX * 0.5;
      this.camera.rotation.x = lookPitch + shakeY * 0.5;
      this.camera.rotation.z = (Math.random() - 0.5) * 0.045;

      const twitch = Math.sin(t * 36) * 0.65;
      attacker.poseFinisherGrabInCameraSpace(this.camera, 0.22, twitch);
      this.finisherVignetteOpacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * Math.PI * 16));
      return;
    }

    // Phase 3 (1.15s - 1.65s): Skull Crush Execution (spread 0.22 -> 0.08, +0.35 roll, +12 deg FOV)
    if (t < 1.65) {
      if (this.finisherPhaseStep < 3) {
        this.finisherPhaseStep = 3;
        this.sound.playCrushCrunch();
        this.spawnScreenBloodSpatter(12, true);
      }
      const u = THREE.MathUtils.clamp((t - 1.15) / 0.2, 0, 1);
      const easeCrush = u * u;
      const handSpread = THREE.MathUtils.lerp(0.22, 0.08, easeCrush);
      this.camera.position.set(this.playerPos.x, this.finisherDropStartY, this.playerPos.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = lookYaw;
      this.camera.rotation.x = lookPitch;
      this.camera.rotation.z = THREE.MathUtils.lerp(0, 0.35, easeCrush);
      this.camera.fov = MOVEMENT_CONFIG.BASE_FOV + 12 * easeCrush;
      this.camera.updateProjectionMatrix();

      attacker.poseFinisherGrabInCameraSpace(this.camera, handSpread, 0);
      this.finisherVignetteOpacity = 0.92;
      return;
    }

    // Phase 4 (1.65s - 2.40s): Body collapses to ground + blackout -> Dying Light Game Over UI
    if (this.finisherPhaseStep < 4) {
      this.finisherPhaseStep = 4;
      this.health = 0;
      this.deathCause = 'night_runner';
    }
    const collapseU = THREE.MathUtils.clamp((t - 1.65) / 0.5, 0, 1);
    const collapseEase = 1 - Math.pow(1 - collapseU, 2);
    this.camera.position.set(
      this.playerPos.x,
      THREE.MathUtils.lerp(this.finisherDropStartY, groundY + 0.4, collapseEase),
      this.playerPos.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = lookYaw;
    this.camera.rotation.x = THREE.MathUtils.lerp(lookPitch, -0.55, collapseEase);
    this.camera.rotation.z = THREE.MathUtils.lerp(0.35, 0.85, collapseEase);
    this.camera.fov = THREE.MathUtils.lerp(MOVEMENT_CONFIG.BASE_FOV + 12, MOVEMENT_CONFIG.BASE_FOV, collapseEase);
    this.camera.updateProjectionMatrix();

    if (t >= 2.15) {
      this.finisherBlackoutOpacity = THREE.MathUtils.clamp((t - 2.15) / 0.25, 0, 1);
    }

    if (t >= 2.4) {
      this.finisherBlackoutOpacity = 1;
      this.isFinisherActive = false;
      this.phase = 'gameover';
      this.intro.resetIdle();
      this.sound.stopContinuousLoops();
      this.sound.playGameOver();
      this.safeExitPointerLock();
      this.emitHud();
    }
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
    this.awakening.stopTensionDrone();
    this.awakening.clearEffects(this.scene);
    this.zombies.dispose();
    this.territories.dispose();
    this.allies.dispose();
    for (let i = 0; i < this.nightRunners.length; i++) {
      this.nightRunners[i].dispose(this.scene);
    }
    this.nightRunners.length = 0;
    for (let i = 0; i < this.infectedEnemies.length; i++) {
      this.infectedEnemies[i].dispose(this.scene);
    }
    this.infectedEnemies.length = 0;
    this.textures.dispose();
    this.sunShaftsPass?.dispose();
    this.crysisPostPass?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
