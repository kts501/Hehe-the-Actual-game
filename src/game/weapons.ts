export type WeaponId = 'bat' | 'unarmed' | 'dagger' | 'cleaver';
export type WeaponSlot = 'top' | 'right' | 'bottom' | 'left';
export type WeaponCategory = 'blunt_melee' | 'unarmed' | 'fast_melee' | 'heavy_melee';

export interface WeaponStatBadge {
  label: string;
  value: string;
}

export interface WeaponConfig {
  id: WeaponId;
  slot: WeaponSlot;
  name: string;
  shortLabel: string;
  type: WeaponCategory;
  damage: number;
  swingSpeed: number; // relative multiplier (1.0 = medium)
  swingDuration: number; // seconds for viewmodel animation
  attackCooldown: number; // seconds between strikes
  staminaCost: number;
  knockback: number;
  stunDuration: number;
  reach: number;
  arcDot: number; // minimum dot product with look vector
  cleaveMultiTarget: boolean;
  moveSpeedMultiplier: number;
  vaultSpeedMultiplier: number;
  maxDurability: number; // 0 = no durability bar (unarmed)
  gripRadius: number; // cylindrical handle radius in meters (0 for unarmed)
  viewmodelMeshId: WeaponId;
  badges: [WeaponStatBadge, WeaponStatBadge, WeaponStatBadge];
}

export const WEAPONS_CONFIG: readonly WeaponConfig[] = [
  {
    id: 'unarmed',
    slot: 'top',
    name: 'FISTS [1]',
    shortLabel: 'fists',
    type: 'unarmed',
    damage: 24,
    swingSpeed: 1.5,
    swingDuration: 0.54,
    attackCooldown: 0.52,
    staminaCost: 12,
    knockback: 6.4,
    stunDuration: 0.65,
    reach: 3.4,
    arcDot: 0.25,
    cleaveMultiTarget: false,
    moveSpeedMultiplier: 1.15,
    vaultSpeedMultiplier: 1.15,
    maxDurability: 0,
    gripRadius: 0,
    viewmodelMeshId: 'unarmed',
    badges: [
      { label: 'DAMAGE', value: '24' },
      { label: 'SPEED', value: 'HOOK COMBO' },
      { label: 'HANDLING', value: '+15% MOVE & VAULT' },
    ],
  },
  {
    id: 'cleaver',
    slot: 'right',
    name: 'HEAVY CLEAVER [3]',
    shortLabel: 'cleaver',
    type: 'heavy_melee',
    damage: 54,
    swingSpeed: 0.65,
    swingDuration: 0.62,
    attackCooldown: 0.56,
    staminaCost: 22,
    knockback: 8.6,
    stunDuration: 0.85,
    reach: 5.0,
    arcDot: -0.15,
    cleaveMultiTarget: true,
    moveSpeedMultiplier: 1.0,
    vaultSpeedMultiplier: 1.0,
    maxDurability: 85,
    gripRadius: 0.018,
    viewmodelMeshId: 'cleaver',
    badges: [
      { label: 'DAMAGE', value: '54' },
      { label: 'SPEED', value: 'HEAVY' },
      { label: 'HANDLING', value: 'WIDE CLEAVE' },
    ],
  },
  {
    id: 'bat',
    slot: 'bottom',
    name: 'BASEBALL BAT [2]',
    shortLabel: 'bat',
    type: 'blunt_melee',
    damage: 32,
    swingSpeed: 1.0,
    swingDuration: 0.44,
    attackCooldown: 0.34,
    staminaCost: 11,
    knockback: 5.8,
    stunDuration: 0.45,
    reach: 4.6,
    arcDot: 0.25,
    cleaveMultiTarget: false,
    moveSpeedMultiplier: 1.0,
    vaultSpeedMultiplier: 1.0,
    maxDurability: 100,
    gripRadius: 0.017,
    viewmodelMeshId: 'bat',
    badges: [
      { label: 'DAMAGE', value: '32' },
      { label: 'SPEED', value: 'MEDIUM' },
      { label: 'HANDLING', value: 'SOLID KNOCKBACK' },
    ],
  },
  {
    id: 'dagger',
    slot: 'left',
    name: 'SCAVENGER DAGGER [4]',
    shortLabel: 'dagger',
    type: 'fast_melee',
    damage: 22,
    swingSpeed: 1.75,
    swingDuration: 0.25,
    attackCooldown: 0.2,
    staminaCost: 5,
    knockback: 2.6,
    stunDuration: 0.3,
    reach: 3.8,
    arcDot: 0.3,
    cleaveMultiTarget: false,
    moveSpeedMultiplier: 1.0,
    vaultSpeedMultiplier: 1.0,
    maxDurability: 60,
    gripRadius: 0.0155,
    viewmodelMeshId: 'dagger',
    badges: [
      { label: 'DAMAGE', value: '22' },
      { label: 'SPEED', value: 'VERY FAST' },
      { label: 'HANDLING', value: 'LOW STAMINA' },
    ],
  },
] as const;

export const WEAPONS_BY_ID: Record<WeaponId, WeaponConfig> = {
  unarmed: WEAPONS_CONFIG[0],
  cleaver: WEAPONS_CONFIG[1],
  bat: WEAPONS_CONFIG[2],
  dagger: WEAPONS_CONFIG[3],
};

export const WEAPONS_BY_SLOT: Record<WeaponSlot, WeaponConfig> = {
  top: WEAPONS_CONFIG[0],
  right: WEAPONS_CONFIG[1],
  bottom: WEAPONS_CONFIG[2],
  left: WEAPONS_CONFIG[3],
};

export function createInitialDurability(): Record<WeaponId, number> {
  return {
    bat: WEAPONS_BY_ID.bat.maxDurability,
    unarmed: WEAPONS_BY_ID.unarmed.maxDurability,
    dagger: WEAPONS_BY_ID.dagger.maxDurability,
    cleaver: WEAPONS_BY_ID.cleaver.maxDurability,
  };
}

export function getSlotFromVector(dx: number, dy: number): WeaponSlot | null {
  const distSq = dx * dx + dy * dy;
  if (distSq < 18 * 18) return null; // center deadzone
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 'top' : 'bottom';
  }
  return dx > 0 ? 'right' : 'left';
}
