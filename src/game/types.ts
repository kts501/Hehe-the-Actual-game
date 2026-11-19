export type GamePhase = 'title' | 'playing' | 'paused' | 'radio' | 'victory' | 'gameover';

export type WeaponKind = 'kukri' | 'pipe' | 'pistol';

export type HandPose =
  | 'open'
  | 'fist'
  | 'point'
  | 'peace'
  | 'thumbsUp'
  | 'gripMelee'
  | 'gripPistol';

export type HumanoidVariantId =
  | 'agra_biter'
  | 'viral_runner'
  | 'hazmat_guard'
  | 'riot_brute'
  | 'shrieker'
  | 'scavenger'
  | 'stalker'
  | 'blighted'
  | 'sentinel'
  | 'guard';

export type EnemyKind = HumanoidVariantId | 'hound';

export interface CompassMarker {
  id: string;
  label: string;
  angleDeg: number; // relative to player forward (-180..180)
  distance: number;
  kind: 'taj' | 'safehouse' | 'antizin' | 'threat';
}

export interface AntizinCrateState {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export interface RadioMessage {
  sender: 'player' | 'vikram';
  text: string;
}

export interface HudState {
  phase: GamePhase;
  weapon: WeaponKind;
  pistolAmmo: number;
  pistolMagSize: number;
  pistolReserve: number;
  leftHandPose: HandPose;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  combo: number;
  maxCombo: number;
  score: number;
  kills: number;
  enemiesAlive: number;
  cratesCollected: number;
  totalCrates: number;
  nearCrateLabel: string;
  unlockProgress: number; // 0..1 while holding E
  nearWatchtower: boolean;
  climbPrompt: string;
  isClimbing: boolean;
  missionObjective: string;
  timeOfDayLabel: 'Golden Dusk' | 'Nightfall';
  cycleProgress: number; // 0..1
  inSafeHouse: boolean;
  counterPrompt: boolean;
  takedownReady: boolean;
  parkourLabel: string;
  headingDeg: number;
  markers: CompassMarker[];
  vikramLine: string;
  damageFlash: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  crates: AntizinCrateState[];
  safeHouseX: number;
  safeHouseZ: number;
  safeHouseRadius: number;
  watchtowerX: number;
  watchtowerZ: number;
  threatDots: Array<{ x: number; z: number }>;
}

export interface WorldBoxObstacle {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
  vaultable: boolean;
  mantleable: boolean;
}

export interface RampObstacle {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  yLow: number;
  yHigh: number;
  /** Direction along which height rises from yLow to yHigh */
  axis: 'x+' | 'x-' | 'z+' | 'z-';
}

export interface ClimbableZone {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  yMin: number;
  yMax: number;
  exitX: number;
  exitZ: number;
}
