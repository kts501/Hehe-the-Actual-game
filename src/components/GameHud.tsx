import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BatteryCharging,
  Flag,
  Heart,
  Keyboard,
  Package,
  PhoneOff,
  Radio,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  SkipForward,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { HudSnapshot, MinimapTelemetry, RadioMessage } from '../types/game';
import { WEAPONS_BY_ID, type WeaponSlot } from '../game/weapons';
import { DualMinimaps } from './DualMinimaps';
import { WeaponWheel } from './WeaponWheel';

const COMPASS_POINTS = [
  { label: 'N', angle: 0, major: true },
  { label: '', angle: Math.PI * 0.125, major: false },
  { label: 'NE', angle: Math.PI * 0.25, major: false },
  { label: '', angle: Math.PI * 0.375, major: false },
  { label: 'E', angle: Math.PI * 0.5, major: true },
  { label: '', angle: Math.PI * 0.625, major: false },
  { label: 'SE', angle: Math.PI * 0.75, major: false },
  { label: '', angle: Math.PI * 0.875, major: false },
  { label: 'S', angle: Math.PI, major: true },
  { label: '', angle: -Math.PI * 0.875, major: false },
  { label: 'SW', angle: -Math.PI * 0.75, major: false },
  { label: '', angle: -Math.PI * 0.625, major: false },
  { label: 'W', angle: -Math.PI * 0.5, major: true },
  { label: '', angle: -Math.PI * 0.375, major: false },
  { label: 'NW', angle: -Math.PI * 0.25, major: false },
  { label: '', angle: -Math.PI * 0.125, major: false },
];

function wrapAngleRad(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  radioMessages: RadioMessage[];
  radioSending: boolean;
  onStart: () => void;
  onRestart: () => void;
  onRespawnSafeZone: () => void;
  onLockPointer: () => void;
  onSkipTime: () => void;
  onToggleMute: () => void;
  onSendRadioMessage: (text: string) => void;
  onCloseRadio: (relockPointer?: boolean) => void;
  onWheelHoverSlot?: (slot: WeaponSlot) => void;
  onWheelSelectSlot?: (slot: WeaponSlot) => void;
  getLiveMinimapTelemetry?: () => MinimapTelemetry | null;
}

const RunningPersonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <circle cx="15" cy="4.2" r="2.1" />
    <path d="M13.5 7.4L9.8 8.3l-2.3 3.3 1.5 1.1 1.8-2.4 2-.5-1.5 4.2-3.8 1.9L5 19.6l1.8.8 2.2-3 3.7-1.6 1.8 2.9-.7 3.8 1.9.4.9-4.7-2.2-3.4 1.3-3.4 2.2 1.6 2.1-.6-.5-1.7-1.5.4-2.5-2.1c-.5-.5-1.2-1.8-2-1.6z" />
  </svg>
);

const AwakeningFlameIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M13.6 2.2 7.1 12.1h4.6l-1.9 9.7 7.6-10.8h-4.7l.9-8.8Z" />
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  radioMessages,
  radioSending,
  onStart,
  onRestart,
  onRespawnSafeZone,
  onLockPointer,
  onSkipTime,
  onToggleMute,
  onSendRadioMessage,
  onCloseRadio,
  onWheelHoverSlot,
  onWheelSelectSlot,
  getLiveMinimapTelemetry,
}) => {
  const [showControls, setShowControls] = useState(false);
  const [showMinimaps, setShowMinimaps] = useState(true);
  const [radioDraft, setRadioDraft] = useState('');
  const [signalStep, setSignalStep] = useState(0);
  const radioInputRef = useRef<HTMLInputElement | null>(null);
  const radioLogEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hud.phase === 'playing' && !hud.radioOpen && e.code === 'KeyM' && !e.repeat) {
        setShowMinimaps((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.phase, hud.radioOpen]);

  useEffect(() => {
    if (hud.radioOpen) {
      const timer = window.setTimeout(() => {
        radioInputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
  }, [hud.radioOpen]);

  useEffect(() => {
    if (hud.radioOpen && radioSending) {
      const interval = window.setInterval(() => {
        setSignalStep((prev) => (prev + 1) % 6);
      }, 130);
      return () => window.clearInterval(interval);
    }
    setSignalStep(0);
  }, [hud.radioOpen, radioSending]);

  useEffect(() => {
    if (hud.radioOpen) {
      radioLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hud.radioOpen, radioMessages.length, radioSending]);

  const handleRadioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = radioDraft.trim();
    if (!trimmed || radioSending) return;
    setRadioDraft('');
    onSendRadioMessage(trimmed);
  };
  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const staminaPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
  const nextCrate = hud.crateStatuses.find((c) => !c.collected);

  const hudTextShadow = '[text-shadow:0_2px_6px_rgba(0,0,0,0.9)]';
  const awakeningCinematic = Boolean(hud.awakening?.cinematicActive);
  const hudDim = hud.awakening?.hudDimOpacity ?? (awakeningCinematic ? 0.15 : 1);
  const effectiveHudOpacity = Math.min(hud.hudOpacity ?? 1, hudDim);
  const letterboxPct = hud.awakening?.letterboxProgress ?? 0;
  const darkVignetteOpacity = hud.awakening?.vignetteDarkOpacity ?? 0;
  const subtitleVisible = hud.phase === 'playing' && Boolean(hud.awakening?.subtitleVisible);
  const subtitleElapsed = hud.awakening?.subtitleElapsed ?? 0;
  const subtitleFlash = hud.awakening?.subtitleFlashProgress ?? 0;
  const subtitleExit = hud.awakening?.subtitleExitProgress ?? 0;
  const subtitleEntranceU = Math.min(1, subtitleElapsed / 0.45);
  const subtitleEase = 1 - Math.pow(1 - subtitleEntranceU, 3);
  const subtitleOpacity = subtitleEase * (1 - subtitleExit);
  const subtitleScale = (1.12 - 0.12 * subtitleEase) * (1 + subtitleExit * 0.22);
  const subtitleTracking = 4 - 2.5 * subtitleEase;
  const impactOverlayMode = hud.awakening?.impactOverlayMode ?? 'none';
  const impactOverlayOpacity = hud.awakening?.impactOverlayOpacity ?? 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Screen Edge Vignettes for Damage & Counter Parry */}
      {hud.damageFlash > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 border-[18px] border-red-600/70 transition-opacity duration-75"
          style={{ opacity: Math.min(0.85, hud.damageFlash) }}
        />
      )}
      {hud.parryFlash > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 border-[12px] border-amber-400/60 transition-opacity duration-75"
          style={{ opacity: Math.min(0.75, hud.parryFlash) }}
        />
      )}

      {/* Awakening Pumped-Up Crimson-Amber Edge Vignette */}
      {hud.phase === 'playing' && (hud.awakening?.vignetteOpacity ?? 0) > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            opacity: hud.awakening?.vignetteOpacity ?? 0,
            boxShadow: 'inset 0 0 90px rgba(255, 60, 20, 0.45)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Bat Face-Drive Finisher Screen-Edge Red Gore Vignette */}
      {hud.phase === 'playing' && (hud.finisherGoreOpacity ?? 0) > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            opacity: hud.finisherGoreOpacity ?? 0,
            boxShadow: 'inset 0 0 85px rgba(150, 0, 0, 0.55)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Night Runner <3% HP Finisher Struggle Crimson Vignette & Collapse Blackout */}
      {(hud.finisherVignetteOpacity ?? 0) > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            opacity: hud.finisherVignetteOpacity ?? 0,
            boxShadow: 'inset 0 0 130px rgba(220, 20, 10, 0.9)',
            background:
              'radial-gradient(circle at center, transparent 42%, rgba(160, 0, 0, 0.42) 100%)',
          }}
          aria-hidden="true"
        />
      )}
      {(hud.finisherBlackoutOpacity ?? 0) > 0.005 && (
        <div
          className="pointer-events-none fixed inset-0 z-50 bg-black"
          style={{ opacity: hud.finisherBlackoutOpacity ?? 0 }}
          aria-hidden="true"
        />
      )}

      {/* Awakening Anime Cutscene Dark Vignette & Cinematic Letterbox Bars */}
      {hud.phase === 'playing' && darkVignetteOpacity > 0.005 && (
        <div
          className="pointer-events-none fixed inset-0 z-30"
          style={{
            opacity: darkVignetteOpacity,
            boxShadow: 'inset 0 0 140px rgba(0, 0, 0, 0.85)',
          }}
          aria-hidden="true"
        />
      )}
      {hud.phase === 'playing' && letterboxPct > 0.005 && (
        <>
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-black"
            style={{ height: `${(letterboxPct * 7).toFixed(3)}vh` }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-black"
            style={{ height: `${(letterboxPct * 7).toFixed(3)}vh` }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Hidden Inline SVG Bloody Organic Drip Filter */}
      <svg style={{ display: 'none' }} aria-hidden="true">
        <defs>
          <filter id="bloody-drip-filter" x="-10%" y="-15%" width="120%" height="165%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02 0.18"
              numOctaves="2"
              seed="7"
              result="dripNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="dripNoise"
              scale="3.2"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warpedText"
            />
            <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#2A0000" floodOpacity="0.92" />
          </filter>
        </defs>
      </svg>

      {/* Beat 3 Dripping Blood-Red Anime Subtitle Reveal */}
      {subtitleVisible && (
        <div
          className="pointer-events-none fixed inset-x-0 flex justify-center px-6"
          style={{
            bottom: '15vh',
            zIndex: 9999,
            opacity: subtitleOpacity,
            transform: `scale(${subtitleScale.toFixed(4)})`,
          }}
          aria-live="assertive"
        >
          <div className="relative inline-block text-center">
            {/* Back crimson edge stroke & deep dark-blood glow (flashes #FFF5CC white-gold at 4.60s) */}
            <span
              className="font-bloody relative block select-none whitespace-nowrap font-bold"
              style={{
                fontSize: 'clamp(1.22rem, 2.65vw, 2.35rem)',
                lineHeight: 1.4,
                letterSpacing: `${subtitleTracking.toFixed(2)}px`,
                color: subtitleFlash > 0.15 ? '#FFF5CC' : '#D90404',
                WebkitTextStroke: subtitleFlash > 0.15 ? '1.5px #FFE89E' : '1.5px #1A0000',
                textShadow:
                  subtitleFlash > 0.15
                    ? '0 0 26px rgba(255, 245, 204, 0.98), 0 0 42px rgba(255, 200, 90, 0.85)'
                    : '0 3px 0 #2B0000, 0 0 18px rgba(220, 0, 0, 0.75)',
                filter: subtitleFlash > 0.15 ? 'none' : 'url(#bloody-drip-filter)',
              }}
            >
              Why am i not Strong Enough
            </span>
            {/* Top vertical blood-gradient overlay (flashes bright white-gold during shatter trigger) */}
            <span
              aria-hidden="true"
              className="font-bloody pointer-events-none absolute inset-0 block select-none whitespace-nowrap font-bold"
              style={{
                fontSize: 'clamp(1.22rem, 2.65vw, 2.35rem)',
                lineHeight: 1.4,
                letterSpacing: `${subtitleTracking.toFixed(2)}px`,
                backgroundImage:
                  subtitleFlash > 0.15
                    ? 'linear-gradient(180deg, #FFFFFF 0%, #FFF5CC 60%, #FFD670 100%)'
                    : 'linear-gradient(180deg, #FF1E1E 0%, #B80000 65%, #590000 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextStroke: subtitleFlash > 0.15 ? '1.5px #FFF5CC' : '1.5px #1A0000',
                filter: subtitleFlash > 0.15 ? 'none' : 'url(#bloody-drip-filter)',
              }}
            >
              Why am i not Strong Enough
            </span>

            {/* 8 Procedural Animated Crimson Blood Teardrops */}
            {[
              { left: '4.5%', width: 4.5, delay: '0.04s' },
              { left: '14%', width: 3.5, delay: '0.18s' },
              { left: '28.5%', width: 4, delay: '0.09s' },
              { left: '39%', width: 3.2, delay: '0.28s' },
              { left: '53.5%', width: 4.8, delay: '0.12s' },
              { left: '65.5%', width: 3.6, delay: '0.35s' },
              { left: '78.5%', width: 4.2, delay: '0.07s' },
              { left: '92.5%', width: 3.8, delay: '0.24s' },
            ].map((drip, idx) => (
              <span
                key={idx}
                aria-hidden="true"
                className="bloody-drip-drop pointer-events-none absolute"
                style={{
                  left: drip.left,
                  top: '76%',
                  width: `${drip.width}px`,
                  animationDelay: drip.delay,
                  opacity: 1 - subtitleExit,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Activation Smack Impact Flash (0.05s white-gold -> fiery crimson-orange radial burst) */}
      {hud.phase === 'playing' && impactOverlayMode !== 'none' && impactOverlayOpacity > 0.005 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            zIndex: 9998,
            opacity: impactOverlayOpacity,
            background:
              impactOverlayMode === 'whiteGold'
                ? 'rgba(255, 248, 220, 0.85)'
                : 'radial-gradient(circle, transparent 35%, rgba(255, 60, 0, 0.65) 100%)',
          }}
          aria-hidden="true"
        >
          {impactOverlayMode === 'crimsonBurst' && (
            <div
              className="absolute inset-0 opacity-65"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255, 240, 180, 0.55) 0deg 2deg, transparent 2deg 14deg)',
                maskImage: 'radial-gradient(circle at center, transparent 28%, black 78%)',
                WebkitMaskImage: 'radial-gradient(circle at center, transparent 28%, black 78%)',
              }}
            />
          )}
        </div>
      )}

      {/* Persistent Viewport-Edge Blood Spatter (Finishers & High-Combo Strikes) */}
      {hud.phase === 'playing' &&
        hud.screenBloodSpatters &&
        hud.screenBloodSpatters.length > 0 &&
        hud.screenBloodSpatters.map((s) => (
          <div
            key={s.id}
            className="pointer-events-none fixed z-10"
            style={{
              left: `${s.xPct}%`,
              top: `${s.yPct}%`,
              width: `${s.sizePx}px`,
              height: `${s.sizePx}px`,
              opacity: s.opacity,
              transform: `translate3d(-50%, calc(-50% + ${s.dripPx}px), 0) rotate(${s.rotDeg}deg) scale(${s.scaleX}, ${s.scaleY})`,
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_2px_6px_rgba(60,0,0,0.65)]">
              {s.variant === 0 && (
                <>
                  <path
                    d="M46 18 C58 14 70 25 66 38 C78 44 76 62 63 65 C60 80 42 84 36 70 C22 72 18 55 28 46 C22 32 34 20 46 18 Z"
                    fill="#7a090d"
                  />
                  <path
                    d="M47 26 C55 24 61 32 58 41 C65 46 62 58 53 59 C50 69 40 70 37 60 C29 59 29 48 35 43 C32 34 39 27 47 26 Z"
                    fill="#9e0e14"
                  />
                  <circle cx="80" cy="24" r="5.5" fill="#7a090d" />
                  <circle cx="17" cy="72" r="4" fill="#8b0a10" />
                  <circle cx="74" cy="78" r="3.2" fill="#7a090d" />
                  <ellipse cx="44" cy="41" rx="4.5" ry="2.2" fill="rgba(255,180,180,0.22)" />
                </>
              )}
              {s.variant === 1 && (
                <>
                  <path
                    d="M50 14 C61 16 64 31 58 41 C69 47 68 68 56 76 C53 88 45 92 43 79 C32 76 26 58 34 45 C29 31 39 13 50 14 Z"
                    fill="#6b060a"
                  />
                  <path
                    d="M50 24 C57 26 58 37 53 45 C59 52 57 67 49 71 C43 68 38 56 42 46 C39 36 44 23 50 24 Z"
                    fill="#990d12"
                  />
                  <circle cx="23" cy="26" r="4.8" fill="#7a090d" />
                  <circle cx="78" cy="52" r="4.2" fill="#7a090d" />
                  <ellipse cx="48" cy="38" rx="3.4" ry="2" fill="rgba(255,190,190,0.24)" />
                </>
              )}
              {s.variant === 2 && (
                <>
                  <path
                    d="M38 22 C52 16 68 24 67 39 C79 47 72 67 57 67 C50 79 31 76 30 61 C18 55 21 36 33 34 C32 27 34 24 38 22 Z"
                    fill="#7f0a0e"
                  />
                  <circle cx="20" cy="20" r="3.5" fill="#7f0a0e" />
                  <circle cx="82" cy="30" r="6" fill="#6b060a" />
                  <circle cx="70" cy="82" r="4.5" fill="#8b0a10" />
                  <circle cx="26" cy="80" r="3" fill="#7f0a0e" />
                  <ellipse cx="49" cy="44" rx="5" ry="2.5" fill="rgba(255,180,180,0.2)" />
                </>
              )}
            </svg>
          </div>
        ))}

      {/* Subtle Red Curved Directional Damage Indicators for Side/Rear Hits */}
      {hud.phase === 'playing' &&
        hud.directionalHits?.map((hit) => {
          const leftPct = 50 + Math.sin(hit.angleRad) * 43;
          const topPct = 50 - Math.cos(hit.angleRad) * 39;
          const deg = (hit.angleRad * 180) / Math.PI;
          return (
            <div
              key={hit.id}
              className="pointer-events-none fixed"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                opacity: Math.min(0.84, hit.intensity * 0.84),
                transform: `translate(-50%, -50%) rotate(${deg}deg)`,
              }}
            >
              <svg
                viewBox="0 0 120 40"
                className="h-10 w-32 drop-shadow-[0_0_12px_rgba(220,38,38,0.9)]"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={`dmgArcGrad_${hit.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(220,38,38,0)" />
                    <stop offset="50%" stopColor="rgba(239,68,68,0.96)" />
                    <stop offset="100%" stopColor="rgba(220,38,38,0)" />
                  </linearGradient>
                </defs>
                <path
                  d="M 8 34 Q 60 6 112 34"
                  fill="none"
                  stroke={`url(#dmgArcGrad_${hit.id})`}
                  strokeWidth="6.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 24 27 Q 60 11 96 27"
                  fill="none"
                  stroke="rgba(254,202,202,0.55)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          );
        })}

      {/* World-Projected Crisp Yellow Lightning Bolt Counter Icons */}
      {hud.phase === 'playing' &&
        hud.counterIndicators.map((ind) => (
          <div
            key={ind.id}
            className="pointer-events-none fixed"
            style={{
              left: `${ind.x}px`,
              top: `${ind.y}px`,
              transform: `translate(-50%, -100%) scale(${0.95 + ind.progress * 0.22})`,
            }}
          >
            <svg
              viewBox="0 0 36 48"
              className="h-12 w-9 drop-shadow-[0_0_12px_rgba(250,204,21,0.98)]"
              aria-hidden="true"
            >
              <path
                d="M21 2 L5 26 H17 L13 46 L31 20 H19 Z"
                fill="#fde047"
                stroke="#422006"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M19.5 6.5 L9.5 23.5 H17.5 L15.5 38.5 L26.5 22.5 H18.5 Z" fill="#fef9c3" opacity="0.72" />
            </svg>
          </div>
        ))}

      {/* Full-Screen Intro Black Fade-In Overlay (0.0s -> 1.2s) */}
      {(hud.introFadeOpacity ?? 0) > 0.005 && (
        <div
          className="pointer-events-none fixed inset-0 z-40 bg-black"
          style={{ opacity: hud.introFadeOpacity }}
          aria-hidden="true"
        />
      )}

      {/* Radial Weapon Selector Wheel Overlay */}
      {hud.phase === 'playing' &&
        hud.weaponWheelOpen &&
        !hud.radioOpen &&
        !hud.isIntroPlaying && (
          <WeaponWheel
            hoveredSlot={hud.wheelHoveredSlot}
            activeWeapon={hud.activeWeapon}
            cratesCollected={hud.cratesCollected}
            totalCrates={hud.totalCrates}
            scrapParts={hud.scrapParts}
            weaponDurability={hud.weaponDurability}
            cursorX={hud.wheelCursorX}
            cursorY={hud.wheelCursorY}
            pointerLocked={hud.pointerLocked}
            onHoverSlot={onWheelHoverSlot}
            onSelectSlot={onWheelSelectSlot}
          />
        )}

      {/* Dynamic Center Dot + Spread + Hit-Marker Reticle */}
      {hud.phase === 'playing' &&
        !hud.radioOpen &&
        !hud.isIntroPlaying &&
        !awakeningCinematic &&
        !hud.weaponWheelOpen &&
        effectiveHudOpacity > 0.1 && (() => {
          const spreadGap = 5 + (hud.moveSpread ?? 0) * 9;
          const hitActive = (hud.hitMarkerFlash ?? 0) > 0.02;
          return (
            <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div
                className={`h-1.5 w-1.5 rounded-full transition-colors duration-75 ${
                  hitActive ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.95)]' : 'bg-white/95 ring-1 ring-black/75'
                }`}
              />
              {/* 4 subtle dynamic outer ticks expanding with speed/swing */}
              <div
                className={`absolute left-1/2 h-1.5 w-px -translate-x-1/2 ${hitActive ? 'bg-red-400' : 'bg-white/60'}`}
                style={{ bottom: `${spreadGap}px` }}
              />
              <div
                className={`absolute left-1/2 h-1.5 w-px -translate-x-1/2 ${hitActive ? 'bg-red-400' : 'bg-white/60'}`}
                style={{ top: `${spreadGap}px` }}
              />
              <div
                className={`absolute top-1/2 h-px w-1.5 -translate-y-1/2 ${hitActive ? 'bg-red-400' : 'bg-white/60'}`}
                style={{ right: `${spreadGap}px` }}
              />
              <div
                className={`absolute top-1/2 h-px w-1.5 -translate-y-1/2 ${hitActive ? 'bg-red-400' : 'bg-white/60'}`}
                style={{ left: `${spreadGap}px` }}
              />
              {hitActive && (
                <div
                  className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rotate-45"
                  style={{ opacity: Math.min(1, (hud.hitMarkerFlash ?? 0) * 4.5) }}
                >
                  <span className="absolute left-1/2 top-0 h-1.5 w-[2px] -translate-x-1/2 bg-red-500" />
                  <span className="absolute left-1/2 bottom-0 h-1.5 w-[2px] -translate-x-1/2 bg-red-500" />
                  <span className="absolute top-1/2 left-0 h-[2px] w-1.5 -translate-y-1/2 bg-red-500" />
                  <span className="absolute top-1/2 right-0 h-[2px] w-1.5 -translate-y-1/2 bg-red-500" />
                </div>
              )}
            </div>
          );
        })()}

      {/* Lower-Center Contextual Execution / Head-Grab Prompts */}
      {hud.phase === 'playing' &&
        !hud.radioOpen &&
        !hud.isIntroPlaying &&
        !awakeningCinematic &&
        !hud.weaponWheelOpen &&
        effectiveHudOpacity > 0.1 && (
          <>
            {hud.isGrabbingEnemy && !hud.isExecutingFinisher && (
              <div className="pointer-events-none fixed left-1/2 top-1/2 mt-9 -translate-x-1/2 flex items-center gap-2">
                <div className="rounded-md border border-red-400/80 bg-red-950/90 px-4 py-1.5 font-display text-xs font-bold tracking-widest text-white shadow-[0_0_16px_rgba(220,38,38,0.65)]">
                  [LMB] EXECUTE
                </div>
                <div className="rounded-md border border-white/20 bg-zinc-950/85 px-3 py-1.5 font-display text-[11px] font-semibold tracking-wider text-zinc-200">
                  [MMB] SHOVE
                </div>
              </div>
            )}
            {!hud.isGrabbingEnemy && !hud.isExecutingFinisher && hud.canGrabEnemy && (
              <div className="pointer-events-none fixed left-1/2 top-1/2 mt-9 -translate-x-1/2">
                {hud.grabTargetHealthy ? (
                  <div className="rounded-md border border-amber-400/45 bg-zinc-950/88 px-3.5 py-1 font-display text-[11px] font-semibold tracking-wider text-amber-300 shadow-lg">
                    WEAKEN &lt;65% HP OR STAGGER TO GRAB
                  </div>
                ) : (
                  <div className="rounded-md border border-red-400/65 bg-zinc-950/90 px-4 py-1.5 font-display text-xs font-bold tracking-widest text-red-200 shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                    [MMB] GRAB STAGGERED HEAD
                  </div>
                )}
              </div>
            )}
          </>
        )}

      {/* ===================================================================== */}
      {/* TOP HUD ROW: SILAS WALKER Card, Compass, & Outbreak Watch Objective   */}
      {/* ===================================================================== */}
      {hud.phase === 'playing' && (
        <div
          className={`flex items-start justify-between gap-4 px-6 pt-5 transition-opacity duration-300 ${
            hud.isIntroPlaying || awakeningCinematic ? 'pointer-events-none' : ''
          }`}
          style={{ opacity: effectiveHudOpacity }}
        >
          {/* Top-Left: SILAS WALKER Compact Tactical Card */}
          <div
            className={`w-68 rounded-lg border bg-zinc-950/82 px-3.5 py-2.5 shadow-2xl transition-transform duration-75 ${
              hud.lowStaminaPulse
                ? 'border-red-500/80 ring-1 ring-red-500/60 translate-x-[2px]'
                : 'border-white/12'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-[0.14em] text-zinc-100">
                SILAS WALKER
              </span>
              <span className="font-mono-num text-xs font-semibold text-zinc-300">
                {hud.health}/{hud.maxHealth} HP
              </span>
            </div>

            {/* Crimson HP Bar */}
            <div className="mt-1.5 flex items-center gap-2">
              <Heart className="h-3.5 w-3.5 shrink-0 fill-red-500 text-red-400" />
              <div className="h-2.5 w-full overflow-hidden rounded-xs bg-zinc-900 ring-1 ring-white/15">
                <div
                  className={`h-full transition-[width] duration-100 ${
                    healthPct > 30
                      ? 'bg-gradient-to-r from-red-700 to-red-500'
                      : 'bg-red-400'
                  }`}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
            </div>

            {/* Amber Stamina Bar + EXHAUSTED / LOW STAMINA Alert */}
            <div className="mt-2 flex items-center gap-2">
              <RunningPersonIcon
                className={`h-3.5 w-3.5 shrink-0 ${
                  hud.exhausted || hud.lowStaminaPulse ? 'text-red-400' : 'text-amber-300'
                }`}
              />
              <div
                className={`h-2 w-full overflow-hidden rounded-xs bg-zinc-900 ring-1 ${
                  hud.lowStaminaPulse ? 'ring-red-400/80' : 'ring-white/10'
                }`}
              >
                <div
                  className={`h-full transition-[width] duration-75 ${
                    hud.exhausted || hud.lowStaminaPulse ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${staminaPct}%` }}
                />
              </div>
              {hud.exhausted && (
                <span className="font-mono-num shrink-0 text-[10px] font-bold tracking-wider text-red-400">
                  EXHAUSTED
                </span>
              )}
            </div>

            {/* Flashlight Battery Bar */}
            <div className="mt-2 flex items-center gap-2">
              <BatteryCharging
                className={`h-3.5 w-3.5 shrink-0 ${
                  (hud.flashlightBattery ?? 100) <= 20
                    ? 'text-red-400'
                    : hud.flashlightOn
                      ? 'text-cyan-300'
                      : 'text-cyan-400/75'
                }`}
              />
              <div className="h-1.5 w-full overflow-hidden rounded-xs bg-zinc-900 ring-1 ring-white/10">
                <div
                  className={`h-full transition-[width] duration-100 ${
                    (hud.flashlightBattery ?? 100) <= 20 ? 'bg-red-500' : 'bg-cyan-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, hud.flashlightBattery ?? 100))}%` }}
                />
              </div>
              <span className="font-mono-num shrink-0 text-[10px] text-zinc-400">
                {Math.round(hud.flashlightBattery ?? 100)}%
              </span>
            </div>

            {/* Awakening Gauge */}
            {(() => {
              const awk = hud.awakening;
              const chargePct = Math.max(0, Math.min(100, awk?.charge ?? 0));
              const isReady = Boolean(awk?.isReady);
              const isActive = Boolean(awk?.isActive);
              return (
                <div className="mt-2 flex items-center gap-2">
                  <AwakeningFlameIcon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive
                        ? 'text-amber-300'
                        : isReady
                          ? 'text-[#FFD700]'
                          : 'text-orange-400/80'
                    }`}
                  />
                  <div
                    className={`h-2 w-full overflow-hidden rounded-full bg-zinc-900 ${
                      isReady
                        ? 'awakening-ready-pill border border-[#FFD700]'
                        : isActive
                          ? 'border border-amber-300/90'
                          : 'border border-white/12'
                    }`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        isActive
                          ? 'awakening-plasma-bar transition-[width] duration-75 ease-linear'
                          : 'transition-[width] duration-150 ease-out'
                      }`}
                      style={{
                        width: `${chargePct}%`,
                        ...(isActive
                          ? {}
                          : {
                              background:
                                'linear-gradient(90deg, #D92626 0%, #FF6B1A 60%, #FFC400 100%)',
                            }),
                      }}
                    />
                  </div>
                  {isActive ? (
                    <span className="font-mono-num shrink-0 text-[10px] font-bold text-amber-300">
                      {(awk?.remainingSeconds ?? 0).toFixed(1)}s
                    </span>
                  ) : isReady ? (
                    <span className="font-display shrink-0 text-[10px] font-bold tracking-wider text-[#FFD700]">
                      [G] READY
                    </span>
                  ) : (
                    <span className="font-mono-num shrink-0 text-[10px] text-zinc-400">
                      {Math.round(chargePct)}%
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Top-Center: Minimal Transparent Dying Light Compass, Combo & Pointer Lock */}
          <div className="flex flex-col items-center gap-2">
            {(() => {
              const heading = hud.playerHeadingRad ?? 0;
              const halfSpan = Math.PI * 0.45;
              const toPct = (bearing: number) => {
                const rel = wrapAngleRad(bearing - heading);
                return 50 + (rel / halfSpan) * 50;
              };
              const tajPctRaw = toPct(hud.tajBearingRad ?? 0);
              const tajPct = Math.max(4, Math.min(96, tajPctRaw));
              const hasCrate =
                hud.nearestCrateBearingRad !== null && hud.nearestCrateBearingRad !== undefined;
              const cratePctRaw = hasCrate ? toPct(hud.nearestCrateBearingRad as number) : 50;
              const cratePct = Math.max(4, Math.min(96, cratePctRaw));

              return (
                <div className="relative h-9 w-72 sm:w-96 select-none overflow-hidden">
                  {/* Masked cardinal ticks & hairline so edges fade cleanly */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      maskImage:
                        'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                      WebkitMaskImage:
                        'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                    }}
                  >
                    <div className="absolute left-0 right-0 top-3.5 h-px bg-white/30" />
                    <div className="absolute left-1/2 top-0.5 h-2 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.9)]" />

                    {/* Cardinal & Intercardinal Ticks */}
                    {COMPASS_POINTS.map((pt, idx) => {
                      const rel = wrapAngleRad(pt.angle - heading);
                      if (Math.abs(rel) > halfSpan) return null;
                      const leftPct = 50 + (rel / halfSpan) * 50;
                      return (
                        <div
                          key={idx}
                          className="absolute top-2.5 flex -translate-x-1/2 flex-col items-center"
                          style={{ left: `${leftPct}%` }}
                        >
                          <div
                            className={
                              pt.major
                                ? 'h-2 w-px bg-white/85'
                                : pt.label
                                  ? 'h-1.5 w-px bg-white/60'
                                  : 'h-1 w-px bg-white/35'
                            }
                          />
                          {pt.label && (
                            <span
                              className={`mt-0.5 font-display tracking-wider ${hudTextShadow} ${
                                pt.major
                                  ? 'text-[11px] font-bold text-white'
                                  : 'text-[9px] font-semibold text-white/75'
                              }`}
                            >
                              {pt.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Taj Mahal UV Safe House Purple Shield Marker */}
                  <div
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${tajPct}%` }}
                  >
                    <Shield className="h-4 w-4 fill-purple-500/45 text-purple-300 drop-shadow-[0_0_8px_rgba(192,132,252,0.98)]" />
                  </div>

                  {/* Nearest Antizin Supply Crate Glowing Cyan Marker */}
                  {hasCrate && (
                    <div
                      className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                      style={{ left: `${cratePct}%` }}
                    >
                      <Package className="h-4 w-4 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.98)]" />
                    </div>
                  )}
                </div>
              );
            })()}

            {hud.comboCount > 0 && (
              <div className="flex flex-col items-center rounded-lg border border-amber-400/50 bg-zinc-950/90 px-5 py-2 shadow-xl">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tracking-tight text-amber-400 font-mono-num">
                    {hud.comboCount}x
                  </span>
                  <span className="text-xs font-semibold tracking-wider text-amber-200 uppercase">
                    Freeflow Combo
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-sm bg-zinc-800">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.round(hud.comboTimerRatio * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {hud.takedownReady && (
              <div className="rounded-md border border-amber-300 bg-amber-500 px-4 py-1.5 font-display text-sm font-bold tracking-wide text-zinc-950 shadow-lg">
                TAKEDOWN READY [R]
              </div>
            )}

            {hud.territoryLiberationToast && (
              <div className="rounded-lg border border-sky-400/70 bg-zinc-950/92 px-6 py-2.5 text-center shadow-[0_0_24px_rgba(56,189,248,0.45)]">
                <div className="font-display text-sm font-bold tracking-[0.18em] text-sky-300 uppercase">
                  SECTOR LIBERATED: {hud.territoryLiberationToast}
                </div>
                <div className="mt-0.5 text-[11px] font-medium tracking-wider text-zinc-300">
                  UV Safe Zone &amp; Allied Patrols Active (+6 HP/s · +10% Battery/s)
                </div>
              </div>
            )}

            {hud.squadCommandToast && (
              <div className="rounded-md border border-cyan-400/70 bg-zinc-950/92 px-5 py-1.5 text-center font-display text-xs font-bold tracking-[0.16em] text-cyan-300 uppercase shadow-[0_0_18px_rgba(0,216,255,0.35)]">
                {hud.squadCommandToast}
              </div>
            )}

            {hud.allyDownAlert && (
              <div className="rounded-md border border-red-500/75 bg-red-950/92 px-5 py-1.5 text-center font-display text-xs font-bold tracking-[0.16em] text-red-200 uppercase shadow-[0_0_18px_rgba(239,68,68,0.4)]">
                {hud.allyDownAlert}
              </div>
            )}

            {hud.activeTerritory && !hud.territoryLiberationToast && (
              <div
                className={`flex w-76 flex-col items-center rounded-lg border bg-zinc-950/88 px-4 py-2 shadow-xl ${
                  hud.activeTerritory.captured
                    ? 'border-sky-400/50'
                    : hud.activeTerritory.isLocked
                      ? 'border-red-500/55'
                      : 'border-sky-400/70'
                }`}
              >
                <div className="flex w-full items-center justify-between text-[11px] font-bold tracking-[0.14em] uppercase">
                  <span className={hud.activeTerritory.captured ? 'text-sky-300' : 'text-zinc-100'}>
                    {hud.activeTerritory.name}
                  </span>
                  <span className="font-mono-num text-zinc-300">
                    {hud.activeTerritory.captured
                      ? 'SAFE ZONE'
                      : hud.activeTerritory.isLocked
                        ? 'LOCKED'
                        : `${hud.activeTerritory.progress}%`}
                  </span>
                </div>
                {hud.activeTerritory.captured ? (
                  <div className="mt-1 text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
                    UV Barrier Active · Recharging HP &amp; Battery
                  </div>
                ) : hud.activeTerritory.isLocked ? (
                  <div className="mt-1 text-[11px] font-bold tracking-wider text-red-400 uppercase">
                    ELIMINATE ZONE DEFENDERS: {hud.activeTerritory.aliveDefenders} REMAINING
                  </div>
                ) : (
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-xs bg-zinc-900 ring-1 ring-white/15">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-[width] duration-75"
                      style={{ width: `${hud.activeTerritory.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {!hud.pointerLocked && !hud.radioOpen && !hud.weaponWheelOpen && !awakeningCinematic && !hud.isFinisherActive && (
              <button
                type="button"
                onClick={onLockPointer}
                className="pointer-events-auto mt-1 rounded-md border border-white/30 bg-black/55 px-4 py-1.5 text-xs font-semibold text-white hover:bg-black/75 transition-colors cursor-pointer"
              >
                Click Here or Viewport to Lock Camera Look
              </button>
            )}
          </div>

          {/* Top-Right: Outbreak Watch, Wave & Kills / Extraction Objective */}
          <div className="pointer-events-auto flex flex-col items-end gap-1.5 rounded-lg border border-white/12 bg-zinc-950/82 px-4 py-2.5 text-white shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="font-mono-num text-sm font-bold tracking-wide text-amber-200">
                {hud.formattedTime}
              </span>
              <button
                type="button"
                onClick={onSkipTime}
                title="Advance time of day (Shortcut: T)"
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                <SkipForward className="h-3.5 w-3.5" />
                [T]
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="text-zinc-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <span className="font-display font-semibold tracking-wider text-amber-400">
                WAVE {hud.waveNumber ?? 1}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num font-bold text-white">
                {hud.killCount} / {hud.killsTarget ?? 15} INFECTED
              </span>
            </div>

            {hud.extractionReady ? (
              <div className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-amber-300">
                <Flag className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-mono-num">
                  EXTRACTION FLARE ACTIVE · {hud.extractionDistance ?? hud.tajDistance}m
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="font-mono-num">
                  Crates {hud.cratesCollected}/{hud.totalCrates}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">
                  {nextCrate ? `${nextCrate.locationHint} (${nextCrate.distance}m)` : `UV Gate ${hud.tajDistance}m`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOTTOM-LEFT MINIMAL GADGET ICONS & BOTTOM-CENTER SUBTITLES/PROMPTS    */}
      {/* ===================================================================== */}
      {hud.phase === 'playing' && !hud.radioOpen && (
        <div className="relative flex w-full items-end justify-between px-6 pb-5">
          {/* Bottom-Left: Dual 3D & 2D Minimaps + Minimal Unboxed Gadget Labels */}
          <div
            className={`flex flex-col items-start gap-2.5 text-white transition-opacity duration-300 ${
              hud.isIntroPlaying || awakeningCinematic ? 'pointer-events-none' : ''
            }`}
            style={{ opacity: effectiveHudOpacity }}
          >
            {showMinimaps && (
              <DualMinimaps
                hud={hud}
                getLiveMinimapTelemetry={getLiveMinimapTelemetry}
              />
            )}

            <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className={`text-sm font-medium tracking-wide font-mono-num ${
                  hud.flashlightOn ? 'text-yellow-300' : 'text-white'
                } ${hudTextShadow}`}
              >
                [F] {hud.flashlightOn ? 'On' : 'Off'} · {Math.round(hud.flashlightBattery ?? 100)}%
              </span>
              <span
                className={`text-sm font-medium tracking-wide font-mono-num ${
                  hud.weaponWheelOpen ? 'text-amber-300' : 'text-white'
                } ${hudTextShadow}`}
                title="Hold Q / Tab for Weapon Wheel, Tap Q to Quick-Swap • [MMB] Head-Grab"
              >
                [Q] {hud.weaponWheelOpen
                  ? 'Select'
                  : `Wheel / Swap (${WEAPONS_BY_ID[hud.activeWeapon]?.shortLabel ?? 'Bat'})`}
              </span>
              <span
                className={`text-sm font-medium tracking-wide font-mono-num ${
                  hud.awakening?.isReady
                    ? 'font-bold text-[#FFD700]'
                    : (hud.allyCount ?? 0) > 0
                      ? 'text-cyan-300'
                      : hud.firecrackerCooldown > 0
                        ? 'text-white/55'
                        : 'text-white'
                } ${hudTextShadow}`}
                title="Toggle nearby Squad Follow / Hold Position (or Awakening / Lure)"
              >
                [G]{' '}
                {hud.awakening?.isReady
                  ? 'Smack!'
                  : (hud.allyCount ?? 0) > 0
                    ? 'Squad'
                    : hud.firecrackerCooldown > 0
                      ? `${hud.firecrackerCooldown}s`
                      : 'Lure'}
              </span>
              {(hud.allyCount ?? 0) > 0 && (
                <span
                  className={`text-sm font-medium tracking-wide font-mono-num text-cyan-200 ${hudTextShadow}`}
                  title="Call up to 3 allied survivors to your position"
                >
                  [H] Reinforce ({hud.allyCount})
                </span>
              )}
              <span
                className={`text-sm font-medium tracking-wide font-mono-num ${
                  hud.kickCooldown > 0 ? 'text-white/55' : 'text-white'
                } ${hudTextShadow}`}
              >
                [C] {hud.kickCooldown > 0 ? `${hud.kickCooldown}s` : 'Kick'}
              </span>
              <button
                type="button"
                onClick={() => setShowMinimaps((prev) => !prev)}
                className={`text-sm font-medium tracking-wide font-mono-num text-white/90 hover:text-amber-300 transition-colors cursor-pointer ${hudTextShadow}`}
                title="Toggle 3D & 2D Minimaps (Shortcut: M)"
              >
                [M] {showMinimaps ? 'Maps' : 'Show Maps'}
              </button>
            </div>
          </div>

          {/* Center-Bottom: Intro Overwatch Radio, Tutorial Hint, Interaction Prompt & Radio Subtitles */}
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 flex w-full max-w-2xl -translate-x-1/2 flex-col items-center gap-2 px-4">
            {hud.introRadioVisible && (
              <div className="w-full rounded-lg border border-amber-400/35 bg-zinc-950/90 px-5 py-3 shadow-2xl">
                <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-amber-400 uppercase">
                  <Radio className="h-3.5 w-3.5 text-amber-300" />
                  <span>OVERWATCH RADIO · CH-01</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-zinc-100">
                  {hud.introRadioText}
                </p>
              </div>
            )}

            {!hud.isIntroPlaying && !awakeningCinematic && (hud.tutorialHintOpacity ?? 0) > 0.01 && (
              <div
                className="rounded-md border border-white/15 bg-zinc-950/84 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-zinc-100 shadow-lg"
                style={{ opacity: hud.tutorialHintOpacity }}
              >
                <span className="font-mono-num text-amber-300">[WASD]</span> Run &nbsp;·&nbsp;{' '}
                <span className="font-mono-num text-amber-300">[SHIFT]</span> Sprint &nbsp;·&nbsp;{' '}
                <span className="font-mono-num text-amber-300">[SPACE]</span> Jump / Vault &nbsp;·&nbsp;{' '}
                <span className="font-mono-num text-amber-300">[LMB]</span> Strike &nbsp;·&nbsp;{' '}
                <span className="font-mono-num text-amber-300">[MMB]</span> Head-Grab
              </div>
            )}

            {hud.awakening?.isReady && !hud.awakening.isActivating && !hud.weaponWheelOpen && (
              <div
                className={`rounded-md border border-[#FFD700]/80 bg-zinc-950/88 px-4 py-1.5 font-display text-xs font-bold tracking-[0.14em] text-[#FFD700] shadow-[0_0_16px_rgba(255,180,0,0.45)] ${hudTextShadow}`}
              >
                [G] AWAKENING READY — TRIGGER SELF-BONK
              </div>
            )}

            {!awakeningCinematic && hud.parkourMove && (
              <div className={`text-xs font-bold tracking-[0.22em] text-amber-300 uppercase ${hudTextShadow}`}>
                {hud.parkourMove}
                {hud.parkourFlow && hud.parkourFlow >= 0.6 ? ' · FLOW BOOST' : ''}
              </div>
            )}

            {!awakeningCinematic && hud.interactionPrompt && (
              <div className={`text-base font-bold tracking-wide text-amber-200 ${hudTextShadow}`}>
                {hud.interactionPrompt}
              </div>
            )}

            {!awakeningCinematic && hud.subtitleText && !hud.introRadioVisible && (
              <div className="w-full rounded-lg border border-white/15 bg-zinc-950/88 px-5 py-2.5 text-center shadow-2xl">
                <div className="text-[11px] font-semibold tracking-wider text-amber-400 uppercase">
                  {hud.subtitleSpeaker}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-100">{hud.subtitleText}</p>
              </div>
            )}
          </div>

          {hud.isIntroPlaying ? (
            <div className={`pointer-events-none z-30 text-xs font-semibold tracking-wider text-white/80 uppercase ${hudTextShadow}`}>
              <span className="font-mono-num text-amber-300">[SPACE]</span> Skip Intro
            </div>
          ) : (
            <div className="w-40" aria-hidden="true" />
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MILITARY RADIO MESSENGER UI: HAVILDAR VIKRAM (GEMINI 2.5 FLASH)       */}
      {/* ===================================================================== */}
      {hud.phase === 'playing' && hud.radioOpen && (
        <div className="pointer-events-auto fixed bottom-4 right-4 left-4 z-30 mx-auto max-w-[385px] sm:left-auto sm:right-6 sm:mx-0">
          {/* Outer Metallic Phone Frame */}
          <div
            className={`rounded-[34px] border-[3px] bg-zinc-900 p-1.5 shadow-[0_24px_64px_rgba(0,0,0,0.88)] transition-colors ${
              hud.nightHunterNearby
                ? 'border-red-400/90 shadow-[0_0_32px_rgba(239,68,68,0.45)]'
                : 'border-zinc-400/70'
            }`}
          >
            {/* Inner Dark OLED Chat Screen */}
            <div className="flex max-h-[min(580px,calc(100vh-6.5rem))] flex-col overflow-hidden rounded-[27px] bg-[#070709] text-zinc-100">
              {/* Top Phone Status Strip (Live Clock, Notch & Signal Strength Bars) */}
              <div className="flex items-center justify-between px-5 pt-2.5 pb-1 text-[11px] font-semibold text-white">
                <span className="font-mono-num tracking-tight">{hud.formattedTime}</span>
                <div className="h-3.5 w-24 rounded-full bg-zinc-950 border border-white/10" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  {/* Live Signal Strength Bars (fluctuates red while Gemini API is processing) */}
                  <div
                    className="flex items-end gap-0.5"
                    title={radioSending ? 'Transmitting / Receiving...' : 'Signal Strong'}
                    aria-label={radioSending ? 'Signal fluctuating' : 'Signal strong'}
                  >
                    {[1, 2, 3, 4].map((barIdx) => {
                      const activeBars = radioSending ? [2, 4, 1, 3, 2, 4][signalStep] : 4;
                      const isLit = barIdx <= activeBars;
                      const heights = ['h-1', 'h-1.5', 'h-2', 'h-2.5'];
                      return (
                        <span
                          key={barIdx}
                          className={`w-[3px] rounded-xs transition-colors duration-100 ${heights[barIdx - 1]} ${
                            radioSending
                              ? isLit
                                ? 'bg-red-400'
                                : 'bg-red-950'
                              : isLit
                                ? 'bg-white'
                                : 'bg-zinc-700'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="font-mono-num text-[10px] text-zinc-300">
                    {hud.cratesCollected}/{hud.totalCrates}
                  </span>
                </div>
              </div>

              {/* Messenger Contact Header */}
              <div
                className={`flex items-center justify-between gap-2 border-b px-3.5 py-2.5 ${
                  hud.nightHunterNearby
                    ? 'border-red-500/40 bg-red-950/45'
                    : 'border-white/10 bg-[#0b0b0e]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => onCloseRadio(true)}
                    aria-label="Close radio chat"
                    title="Close Radio [Esc]"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-300 text-zinc-700 ring-2 ${
                      hud.nightHunterNearby
                        ? 'ring-red-400 animate-pulse'
                        : 'ring-amber-500/85'
                    }`}
                  >
                    <User className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">
                      Havildar Vikram
                    </div>
                    <div
                      className={`truncate text-[10px] font-medium ${
                        hud.nightHunterNearby ? 'text-red-300' : 'text-zinc-400'
                      }`}
                    >
                      {hud.nightHunterNearby
                        ? 'Watchtower Alert · Active'
                        : 'Taj UV Watchtower · CH-04'}
                    </div>
                  </div>
                </div>

                {/* Right Action Icons (Status Ping, Extraction Ping, End Call / Close) */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={radioSending}
                    onClick={() =>
                      onSendRadioMessage(
                        'Reporting in from the courtyard. Give me my mission status and remaining Antizin crate locations.',
                      )
                    }
                    title="Report Status"
                    aria-label="Report Status"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={radioSending}
                    onClick={() =>
                      onSendRadioMessage(
                        'Requesting immediate entry through the Taj Mahal UV Safe House gate!',
                      )
                    }
                    title="Request Extraction"
                    aria-label="Request Extraction"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Shield className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseRadio(true)}
                    title="End Radio Call [Esc]"
                    aria-label="End Radio Call"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Dynamic Pulsing Night Hunter Proximity Alert Banner */}
              {hud.nightHunterNearby && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 border-b border-red-500/50 bg-red-950/90 px-3.5 py-2 text-red-100 animate-pulse"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="truncate text-[10px] font-extrabold tracking-[0.1em] text-red-200 uppercase">
                      Night Hunter
                      {hud.nearestNightHunterDistance !== null &&
                      hud.nearestNightHunterDistance !== undefined
                        ? ` · ${hud.nearestNightHunterDistance}m`
                        : ''}{' '}
                      — Extract Now
                    </span>
                  </div>
                  <span className="shrink-0 font-mono-num text-[10px] font-bold tracking-wider text-red-300 uppercase">
                    Code Red
                  </span>
                </div>
              )}

              {/* Scrollable Chat Bubble Stream */}
              <div className="flex-1 min-h-[210px] max-h-[270px] overflow-y-auto px-3 py-3 space-y-2">
                {radioMessages.map((msg, idx) => {
                  const prevSender = idx > 0 ? radioMessages[idx - 1].sender : null;
                  const nextSender =
                    idx < radioMessages.length - 1 ? radioMessages[idx + 1].sender : null;
                  const isVikramLastInGroup = msg.sender === 'vikram' && nextSender !== 'vikram';
                  const isRunnerFirstInGroup = msg.sender === 'runner' && prevSender !== 'runner';
                  const isRunnerLastInGroup = msg.sender === 'runner' && nextSender !== 'runner';

                  if (msg.sender === 'runner') {
                    // Subtle vertical purple-to-royal-blue progression matching the chat UI palette
                    const gradientStyle =
                      idx <= 1
                        ? 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)'
                        : idx <= 3
                          ? 'linear-gradient(135deg, #7c3aed 0%, #5b46e8 100%)'
                          : 'linear-gradient(135deg, #5b46e8 0%, #4361ee 100%)';

                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div
                          style={{ background: gradientStyle }}
                          className={`max-w-[78%] px-3.5 py-2 text-[12.5px] leading-snug text-white shadow-md ${
                            isRunnerFirstInGroup && isRunnerLastInGroup
                              ? 'rounded-[18px]'
                              : isRunnerFirstInGroup
                                ? 'rounded-[18px] rounded-br-[6px]'
                                : isRunnerLastInGroup
                                  ? 'rounded-[18px] rounded-tr-[6px]'
                                  : 'rounded-[18px] rounded-r-[6px]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.sender === 'vikram') {
                    return (
                      <div key={msg.id} className="flex items-end gap-2">
                        {isVikramLastInGroup ? (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 shadow-sm">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 shrink-0" aria-hidden="true" />
                        )}
                        <div
                          className={`max-w-[78%] bg-[#26262a] px-3.5 py-2 text-[12.5px] leading-snug text-zinc-100 shadow-sm ${
                            isVikramLastInGroup
                              ? 'rounded-[18px] rounded-bl-[6px]'
                              : 'rounded-[18px] rounded-l-[6px]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="rounded-xl border border-red-500/35 bg-red-950/60 px-3 py-1.5 text-[11px] text-red-200">
                        <span className="mr-1.5 font-bold uppercase tracking-wider text-[10px]">
                          [Static]
                        </span>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}

                {radioSending && (
                  <div className="flex items-end gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600">
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-[18px] rounded-bl-[6px] bg-[#26262a] px-3.5 py-2.5 text-zinc-300">
                      <div className="flex items-center gap-1" aria-label="Vikram is replying">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" />
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:240ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={radioLogEndRef} />
              </div>

              {/* Compact Quick-Reply Chips */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-[#0b0b0e] px-3 py-2">
                {[
                  {
                    label: 'Report Status',
                    message:
                      'Reporting in from the courtyard. Give me my mission status and remaining Antizin crate locations.',
                  },
                  {
                    label: 'Need Ammo',
                    message:
                      'Heavy infected resistance down here — can you drop spare rifle ammo or medkits from the tower?',
                  },
                  {
                    label: 'Request Extraction',
                    message:
                      'Requesting immediate entry through the Taj Mahal UV Safe House gate!',
                  },
                  {
                    label: 'Threat Intel',
                    message:
                      'Any Night Hunters or armored Brutes spotted near my position?',
                  },
                ].map((cmd) => (
                  <button
                    key={cmd.label}
                    type="button"
                    disabled={radioSending}
                    onClick={() => onSendRadioMessage(cmd.message)}
                    className="rounded-full border border-white/12 bg-[#1c1c21] px-2.5 py-1 text-[10.5px] font-medium text-zinc-200 hover:border-violet-400/60 hover:bg-[#272730] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>

              {/* Bottom Pill Message Composer */}
              <form
                onSubmit={handleRadioSubmit}
                className="bg-[#070709] px-3 pb-3 pt-1.5"
              >
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1c20] p-1.5">
                  <button
                    type="button"
                    onClick={() => radioInputRef.current?.focus()}
                    aria-label="Focus message input"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6c7ae0] text-white shadow-sm cursor-pointer"
                  >
                    <Radio className="h-3.5 w-3.5" />
                  </button>

                  <input
                    ref={radioInputRef}
                    type="text"
                    value={radioDraft}
                    onChange={(e) => setRadioDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        onCloseRadio(false);
                        return;
                      }
                      e.stopPropagation();
                    }}
                    disabled={radioSending}
                    placeholder="Message Vikram... [Enter]"
                    className="w-full bg-transparent px-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                  />

                  <button
                    type="submit"
                    disabled={radioSending || !radioDraft.trim()}
                    aria-label="Send message"
                    className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-[#5b46e8] px-3 text-[11px] font-semibold text-white hover:bg-[#6d57f5] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Send className="h-3 w-3" />
                    Send
                  </button>
                </div>

                <div className="mt-1.5 flex items-center justify-between px-2 text-[10px] text-zinc-500">
                  <span>Press Enter to transmit</span>
                  <button
                    type="button"
                    onClick={() => onCloseRadio(true)}
                    className="inline-flex items-center gap-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    [Esc] Close
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LIVE 3D TRANSLUCENT TITLE OVERLAY (FALL OF THE LIVING — DEMO BUILD)  */}
      {/* ===================================================================== */}
      {hud.phase === 'start' && (
        <div
          className="pointer-events-auto fixed inset-0 flex flex-col justify-between"
          style={{
            background:
              'radial-gradient(circle at 50% 44%, rgba(10, 10, 14, 0.14) 0%, rgba(10, 10, 14, 0.72) 100%)',
          }}
        >
          {/* Top quiet demo metadata bar */}
          <div className="relative z-10 flex items-center justify-between px-8 pt-6 text-xs font-medium text-zinc-200/90">
            <span className={hudTextShadow}>Fall of the Living · Playable Demo Prototype</span>
            <span className={hudTextShadow}>Objective: Eliminate 15 Infected &amp; Reach Extraction Flare</span>
          </div>

          {/* Center Translucent Title Block & Primary Play CTA */}
          <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-6 text-center">
            <p className={`font-display text-xs font-semibold tracking-[0.26em] text-amber-300 ${hudTextShadow}`}>
              SURVIVAL PARKOUR COMBAT DEMO
            </p>
            <h1
              className={`mt-2 font-display text-5xl font-bold tracking-tight text-white sm:text-6xl ${hudTextShadow}`}
              style={{ textWrap: 'balance' }}
            >
              FALL OF THE LIVING
            </h1>
            <p className={`mt-3 max-w-lg text-sm leading-relaxed text-zinc-200 ${hudTextShadow}`}>
              Outlast escalating courtyard waves, land critical headshots, weaken Screamers below 65% HP for brutal
              one-handed bat executions, and survive to extraction.
            </p>

            <div className="mt-7 flex items-center gap-3">
              <button
                type="button"
                onClick={onStart}
                className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3 font-display text-base font-bold tracking-wider text-zinc-950 shadow-[0_0_28px_rgba(245,158,11,0.5)] hover:from-amber-400 hover:to-orange-400 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                PLAY DEMO
              </button>
              <button
                type="button"
                onClick={() => setShowControls((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-zinc-950/75 px-4 py-3 text-xs font-semibold text-zinc-100 hover:bg-zinc-900/90 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Keyboard className="h-4 w-4" />
                {showControls ? 'Hide Controls' : 'Controls'}
              </button>
            </div>
          </div>

          {/* Bottom Compact Controls Card */}
          <div className="relative z-10 flex flex-col items-center gap-3 px-6 pb-6">
            {showControls && (
              <div className="w-full max-w-4xl rounded-xl border border-white/15 bg-zinc-950/90 p-5 shadow-2xl">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-amber-300">
                      Parkour &amp; Stamina Discipline
                    </h2>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      <li className="flex justify-between">
                        <span>Move / Look</span>
                        <span className="font-mono-num text-zinc-100">WASD + Mouse</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Sprint (Triggers Exhaustion at 0)</span>
                        <span className="font-mono-num text-zinc-100">Shift</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Jump, Speed Vault &amp; Ledge Mantle</span>
                        <span className="font-mono-num text-zinc-100">Space</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Slide / Safety Roll</span>
                        <span className="font-mono-num text-zinc-100">Ctrl / C</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Flashlight / Watchtower Radio</span>
                        <span className="font-mono-num text-zinc-100">F / E</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h2 className="font-display text-sm font-semibold text-amber-300">
                      Brutal Melee &amp; Executions
                    </h2>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      <li className="flex justify-between">
                        <span>Melee Strike (Aim High = 1.75x Crit)</span>
                        <span className="font-mono-num text-zinc-100">Left-Click</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Parry Counter</span>
                        <span className="font-mono-num text-zinc-100">Right-Click</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Head-Grab (&lt;65% HP or Staggered)</span>
                        <span className="font-mono-num text-zinc-100">Middle-Click (MMB)</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Bat Face-Drive Execution</span>
                        <span className="font-mono-num text-zinc-100">LMB While Grabbing</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Awakening Self-Bonk / Weapon Wheel</span>
                        <span className="font-mono-num text-zinc-100">G / Hold Q</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-lg border border-white/12 bg-zinc-950/78 px-5 py-2.5 text-xs text-zinc-300 shadow-xl">
              <span>
                <strong className="font-mono-num text-amber-300">WASD</strong> Move
              </span>
              <span>
                <strong className="font-mono-num text-amber-300">Shift</strong> Sprint
              </span>
              <span>
                <strong className="font-mono-num text-amber-300">Space</strong> Jump / Vault
              </span>
              <span>
                <strong className="font-mono-num text-amber-300">LMB</strong> Strike / Crit Head
              </span>
              <span>
                <strong className="font-mono-num text-amber-300">MMB → LMB</strong> Head-Grab Execution
              </span>
              <span>
                <strong className="font-mono-num text-amber-300">Hold Q</strong> Weapon Wheel
              </span>
              <span>
                <strong className="font-mono-num text-amber-300">G</strong> Awakening
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* GAME OVER SCREEN (NIGHT RUNNER FINISHER OR OVERRUN)                   */}
      {/* ===================================================================== */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/88 p-6">
          {hud.deathCause === 'night_runner' ? (
            <div className="w-full max-w-lg rounded-xl border border-red-600/55 bg-zinc-950/95 p-8 text-center shadow-[0_0_60px_rgba(220,38,38,0.35)]">
              <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="mt-3 font-display text-4xl font-extrabold tracking-[0.14em] text-red-500 uppercase">
                SILAS WALKER DIED
              </h2>
              <p className="mt-2.5 text-sm font-medium text-zinc-300">
                Killed by a Night Runner in Agra — Survived: Day {hud.survivedDays ?? 1}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-xs">
                <div>
                  <div className="text-zinc-500">Kills</div>
                  <div className="font-mono-num text-base font-bold text-white">{hud.killCount}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Executions</div>
                  <div className="font-mono-num text-base font-bold text-red-400">
                    {hud.executionsCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">Time Survived</div>
                  <div className="font-mono-num text-base font-bold text-amber-400">
                    {hud.elapsedSeconds}s
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onRespawnSafeZone}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 font-display text-sm font-bold tracking-wider text-white hover:bg-red-500 transition-colors cursor-pointer"
                >
                  <Shield className="h-4 w-4" />
                  RESTART FROM SAFE ZONE
                </button>
                <button
                  type="button"
                  onClick={onRestart}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-zinc-900 px-4 py-2.5 font-display text-xs font-semibold tracking-wider text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  NEW RUN
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-zinc-950 p-7 text-center shadow-2xl">
              <ShieldAlert className="mx-auto h-11 w-11 text-red-500" />
              <h2 className="mt-3 font-display text-3xl font-bold text-white">You Were Overrun</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Stamina exhaustion and the courtyard swarm claimed Silas Walker before extraction.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-xs">
                <div>
                  <div className="text-zinc-500">Kills</div>
                  <div className="font-mono-num text-base font-bold text-white">{hud.killCount}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Executions</div>
                  <div className="font-mono-num text-base font-bold text-red-400">
                    {hud.executionsCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">Time Survived</div>
                  <div className="font-mono-num text-base font-bold text-amber-400">
                    {hud.elapsedSeconds}s
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onRestart}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 font-display text-sm font-bold text-white hover:bg-red-500 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VICTORY SCREEN (DEMO COMPLETE)                                        */}
      {/* ===================================================================== */}
      {hud.phase === 'victory' && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-zinc-950/84 p-6">
          <div className="w-full max-w-md rounded-xl border border-amber-400/45 bg-zinc-950 p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-amber-400/40 bg-amber-950/50 text-amber-300">
              <Flag className="h-6 w-6" />
            </div>
            <h2 className="mt-3 font-display text-3xl font-bold text-white">Demo Complete</h2>
            <p className="mt-2 text-sm text-zinc-300">
              You survived the courtyard outbreak waves and reached the Extraction Flare with Silas Walker intact.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-xs">
              <div>
                <div className="text-zinc-500">Kills</div>
                <div className="font-mono-num text-base font-bold text-white">{hud.killCount}</div>
              </div>
              <div>
                <div className="text-zinc-500">Executions</div>
                <div className="font-mono-num text-base font-bold text-red-400">
                  {hud.executionsCount ?? 0}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Time Survived</div>
                <div className="font-mono-num text-base font-bold text-amber-400">
                  {hud.elapsedSeconds}s
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onRestart}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 font-display text-sm font-bold text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
