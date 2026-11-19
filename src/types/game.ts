import * as THREE from 'three';
import type { AwakeningHudSnapshot } from '../game/awakening';
import type { WeaponId, WeaponSlot } from '../game/weapons';

export type GamePhase = 'start' | 'playing' | 'gameover' | 'victory';

export type ZombieKind = 'shambler' | 'runner' | 'brute' | 'dog' | 'screamer';

export interface CounterIndicator {
  id: number;
  x: number;
  y: number;
  progress: number; // 0..1 remaining in 0.9s window
}

export interface DirectionalDamageIndicator {
  id: number;
  angleRad: number; // 0 = front, +PI/2 = right, -PI/2 = left, ±PI = behind
  intensity: number; // 0..1 remaining opacity
}

export interface CrateStatus {
  id: string;
  label: string;
  locationHint: string;
  collected: boolean;
  distance: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  comboCount: number;
  comboTimerRatio: number;
  takedownReady: boolean;
  timeOfDay: number; // 0..1
  formattedTime: string;
  isNight: boolean;
  cratesCollected: number;
  totalCrates: number;
  crateStatuses: CrateStatus[];
  tajDistance: number;
  flashlightOn: boolean;
  firecrackerCooldown: number; // seconds remaining
  kickCooldown: number;
  canMantle: boolean;
  activeWeapon: WeaponId;
  previousWeapon: WeaponId;
  scrapParts: number;
  weaponDurability: Record<WeaponId, number>;
  weaponWheelOpen: boolean;
  wheelHoveredSlot: WeaponSlot;
  wheelCursorX: number;
  wheelCursorY: number;
  timeLabel: string;
  subtitleText: string;
  subtitleSpeaker: string;
  interactionPrompt: string;
  pointerLocked: boolean;
  counterIndicators: CounterIndicator[];
  directionalHits?: DirectionalDamageIndicator[];
  damageFlash: number;
  parryFlash: number;
  slowMoActive: boolean;
  killCount: number;
  maxCombo: number;
  elapsedSeconds: number;
  parkourFlow?: number;
  parkourMove?: string;
  playerHeadingRad?: number;
  tajBearingRad?: number;
  nearestCrateBearingRad?: number | null;
  nearestCrateDistance?: number | null;
  nearGuardTower?: boolean;
  radioOpen?: boolean;
  nightHunterNearby?: boolean;
  nearestNightHunterDistance?: number | null;
  isIntroPlaying?: boolean;
  introFadeOpacity?: number;
  hudOpacity?: number;
  introRadioVisible?: boolean;
  introRadioText?: string;
  tutorialHintOpacity?: number;
  awakening?: AwakeningHudSnapshot;
  minimap?: MinimapTelemetry;
}

export interface MinimapEnemyBlip {
  x: number;
  z: number;
  kind: ZombieKind;
  alerted: boolean;
}

export interface MinimapCrateBlip {
  id: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export interface MinimapTelemetry {
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  crates: MinimapCrateBlip[];
  enemies: MinimapEnemyBlip[];
  tajGate: { x: number; z: number };
  watchtower: { x: number; z: number };
}

export interface RadioMessage {
  id: number;
  sender: 'runner' | 'vikram' | 'error';
  text: string;
}

export interface LadderVolume {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  exitX: number;
  exitY: number;
  exitZ: number;
}

export interface RampSlope {
  axis: 'x' | 'z';
  lowCoord: number;
  highCoord: number;
  lowY: number;
  highY: number;
}

export interface BoxCollider {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  mantleable: boolean;
  blocksZombies?: boolean;
  cushion?: boolean; // Blue landing tarp that absorbs fall impact
  wallrunnable?: boolean;
  ramp?: RampSlope;
}

export interface ZiplineRoute {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface SupplyCrateObj {
  id: string;
  label: string;
  locationHint: string;
  position: THREE.Vector3;
  collected: boolean;
  group: THREE.Group;
  beaconLight: THREE.PointLight;
  beaconRing: THREE.Mesh;
}
