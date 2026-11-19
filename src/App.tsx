import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { AgraSurvivalEngine } from './game/engine';
import type { HudSnapshot, MinimapTelemetry, RadioMessage } from './types/game';

const INITIAL_HUD: HudSnapshot = {
  phase: 'start',
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  comboCount: 0,
  comboTimerRatio: 0,
  takedownReady: false,
  timeOfDay: 0,
  formattedTime: '18:45',
  isNight: false,
  cratesCollected: 0,
  totalCrates: 3,
  crateStatuses: [],
  tajDistance: 102,
  flashlightOn: false,
  firecrackerCooldown: 0,
  kickCooldown: 0,
  canMantle: false,
  activeWeapon: 'bat',
  timeLabel: 'Golden Dusk',
  subtitleText: '',
  subtitleSpeaker: 'OVERWATCH RADIO',
  interactionPrompt: '',
  pointerLocked: false,
  counterIndicators: [],
  damageFlash: 0,
  parryFlash: 0,
  slowMoActive: false,
  killCount: 0,
  maxCombo: 0,
  elapsedSeconds: 0,
  nearGuardTower: false,
  radioOpen: false,
  nightHunterNearby: false,
  nearestNightHunterDistance: null,
  isIntroPlaying: false,
  introFadeOpacity: 0,
  hudOpacity: 1,
  introRadioVisible: false,
  introRadioText: '',
  tutorialHintOpacity: 0,
};

function buildVikramFallbackReply(userMessage: string, snapshot: HudSnapshot): string {
  const remainingCrates = snapshot.crateStatuses.filter((c) => !c.collected);
  const lower = userMessage.toLowerCase();

  if (snapshot.nightHunterNearby) {
    const hunterDist =
      snapshot.nearestNightHunterDistance !== null && snapshot.nearestNightHunterDistance !== undefined
        ? `${snapshot.nearestNightHunterDistance}m`
        : 'close range';
    return `ALERT, Runner! Night Hunter locked on watchtower scope at ${hunterDist} — break contact and execute immediate extraction to the purple Taj Mahal UV Safe House (${snapshot.tajDistance}m) NOW!`;
  }

  if (remainingCrates.length === 0) {
    return 'Radio interference, Runner — all 3 Antizin crates are secured! Sprint straight through the purple Taj Mahal UV gate now while I cover you from the tower.';
  }

  const nextHint = `${remainingCrates[0].locationHint} (${remainingCrates[0].distance}m)`;
  if (lower.includes('extract') || lower.includes('enter') || lower.includes('gate') || lower.includes('open')) {
    return `Negative, Runner! ${remainingCrates.length} Antizin crate${remainingCrates.length > 1 ? 's are' : ' is'} still unaccounted for — nearest signal is at ${nextHint}. Complete the sweep before dawn!`;
  }
  if (lower.includes('ammo') || lower.includes('weapon') || lower.includes('gun')) {
    return `Static on the channel, Runner — zero spare ammunition for field drops! Rely on your bat, time your [Right-Click] counters, and secure the remaining ${remainingCrates.length} crate${remainingCrates.length > 1 ? 's' : ''} starting at ${nextHint}.`;
  }
  return `Radio interference, Runner. Focus on securing the ${remainingCrates.length} remaining Antizin crate${remainingCrates.length > 1 ? 's' : ''} before dawn — sweep ${nextHint} and watch your six!`;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AgraSurvivalEngine | null>(null);
  const hudRef = useRef<HudSnapshot>(INITIAL_HUD);
  const nextMsgIdRef = useRef(1);
  const hunterAlertSentRef = useRef(false);
  const radioMessagesRef = useRef<RadioMessage[]>([]);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [radioMessages, setRadioMessages] = useState<RadioMessage[]>([]);
  const [radioSending, setRadioSending] = useState(false);

  useEffect(() => {
    radioMessagesRef.current = radioMessages;
  }, [radioMessages]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const engine = new AgraSurvivalEngine(el, (snapshot) => {
      hudRef.current = snapshot;
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud.radioOpen && radioMessages.length === 0 && !hud.nightHunterNearby) {
      const remaining = Math.max(0, hud.totalCrates - hud.cratesCollected);
      const greeting =
        remaining > 0
          ? `Havildar Vikram, Taj UV Gate Watchtower. State your status, Runner — ${remaining} Antizin crate${remaining > 1 ? 's are' : ' is'} still missing from the sector.`
          : 'Havildar Vikram here. All 3 Antizin crates confirmed on scope. Move inside the purple UV archway immediately, I have your six.';
      setRadioMessages([
        {
          id: nextMsgIdRef.current++,
          sender: 'vikram',
          text: greeting,
        },
      ]);
    }
  }, [hud.radioOpen, hud.cratesCollected, hud.totalCrates, hud.nightHunterNearby, radioMessages.length]);

  useEffect(() => {
    if (!hud.nightHunterNearby || hud.phase !== 'playing') {
      hunterAlertSentRef.current = false;
    }
  }, [hud.nightHunterNearby, hud.phase]);

  useEffect(() => {
    if (hud.phase !== 'playing' || !hud.radioOpen || !hud.nightHunterNearby) return;
    if (hunterAlertSentRef.current) return;

    hunterAlertSentRef.current = true;
    let cancelled = false;
    let completed = false;
    const abortController = new AbortController();

    const triggerNightHunterExtractionOrder = async () => {
      const snapshot = hudRef.current;
      const distLabel =
        snapshot.nearestNightHunterDistance !== null &&
        snapshot.nearestNightHunterDistance !== undefined
          ? `${snapshot.nearestNightHunterDistance}m`
          : 'close range';

      setRadioSending(true);
      try {
        const recentHistory = radioMessagesRef.current
          .filter((m) => m.sender === 'runner' || m.sender === 'vikram')
          .slice(-6)
          .map((m) => ({
            sender: m.sender,
            text: m.text,
          }));

        const res = await fetch('/api/radio/hunter-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            history: recentHistory,
            snapshot,
          }),
          signal: abortController.signal,
        });

        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok) {
          throw new Error(data?.error || 'Watchtower hunter alert failed.');
        }

        const replyText = data?.reply?.trim();
        if (!replyText) {
          throw new Error('Empty extraction alert from watchtower radio.');
        }

        if (cancelled) return;
        completed = true;
        engineRef.current?.sound.playFlashlightClick();
        setRadioMessages((prev) => [
          ...prev,
          {
            id: nextMsgIdRef.current++,
            sender: 'vikram',
            text: replyText,
          },
        ]);
      } catch {
        if (cancelled) return;
        completed = true;
        engineRef.current?.sound.playFlashlightClick();
        const fallbackText =
          snapshot.cratesCollected < snapshot.totalCrates
            ? `BREAK CONTACT — Night Hunter detected ${distLabel} from your position! Abort the crate sweep and execute immediate extraction to the purple Taj Mahal UV Safe House (${snapshot.tajDistance}m) NOW!`
            : `CONTACT CLOSE — Night Hunter ${distLabel} off your flank! Immediate extraction NOW — sprint straight into the purple Taj Mahal UV barrier while I lay down cover fire!`;
        setRadioMessages((prev) => [
          ...prev,
          {
            id: nextMsgIdRef.current++,
            sender: 'vikram',
            text: fallbackText,
          },
        ]);
      } finally {
        if (!cancelled) {
          setRadioSending(false);
        }
      }
    };

    void triggerNightHunterExtractionOrder();

    return () => {
      cancelled = true;
      abortController.abort();
      if (!completed) {
        hunterAlertSentRef.current = false;
        setRadioSending(false);
      }
    };
  }, [hud.phase, hud.radioOpen, hud.nightHunterNearby]);

  const handleStart = useCallback(() => {
    hunterAlertSentRef.current = false;
    setRadioMessages([]);
    setRadioSending(false);
    engineRef.current?.startGame();
  }, []);

  const handleRestart = useCallback(() => {
    hunterAlertSentRef.current = false;
    setRadioMessages([]);
    setRadioSending(false);
    engineRef.current?.restartGame();
  }, []);

  const handleLockPointer = useCallback(() => {
    engineRef.current?.lockPointer();
  }, []);

  const handleSkipTime = useCallback(() => {
    engineRef.current?.skipTime();
  }, []);

  const handleToggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !engine.sound.isMuted();
    engine.sound.setMuted(next);
    setMuted(next);
  }, []);

  const handleCloseRadio = useCallback((relockPointer = true) => {
    engineRef.current?.closeRadio(relockPointer);
  }, []);

  const getLiveMinimapTelemetry = useCallback((): MinimapTelemetry | null => {
    return engineRef.current?.getLiveMinimapTelemetry() ?? null;
  }, []);

  const handleSendRadioMessage = useCallback(
    async (rawText: string) => {
      const message = rawText.trim();
      if (!message || radioSending) return;

      const userMsg: RadioMessage = {
        id: nextMsgIdRef.current++,
        sender: 'runner',
        text: message,
      };
      const snapshot = hudRef.current;
      const recentHistory = radioMessages
        .filter((m) => m.sender === 'runner' || m.sender === 'vikram')
        .slice(-8)
        .map((m) => ({
          sender: m.sender,
          text: m.text,
        }));

      setRadioMessages((prev) => [...prev, userMsg]);
      setRadioSending(true);

      try {
        const res = await fetch('/api/radio/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            history: recentHistory,
            snapshot,
          }),
        });

        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok) {
          throw new Error(data?.error || 'Watchtower radio request failed.');
        }

        const replyText = data?.reply?.trim();
        if (!replyText) {
          throw new Error('Empty response from watchtower radio.');
        }

        engineRef.current?.sound.playFlashlightClick();
        setRadioMessages((prev) => [
          ...prev,
          {
            id: nextMsgIdRef.current++,
            sender: 'vikram',
            text: replyText,
          },
        ]);
      } catch {
        engineRef.current?.sound.playFlashlightClick();
        setRadioMessages((prev) => [
          ...prev,
          {
            id: nextMsgIdRef.current++,
            sender: 'vikram',
            text: buildVikramFallbackReply(message, snapshot),
          },
        ]);
      } finally {
        setRadioSending(false);
      }
    },
    [radioMessages, radioSending],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Semantic DOM HUD Overlay */}
      <GameHud
        hud={hud}
        muted={muted}
        radioMessages={radioMessages}
        radioSending={radioSending}
        onStart={handleStart}
        onRestart={handleRestart}
        onLockPointer={handleLockPointer}
        onSkipTime={handleSkipTime}
        onToggleMute={handleToggleMute}
        onSendRadioMessage={handleSendRadioMessage}
        onCloseRadio={handleCloseRadio}
        getLiveMinimapTelemetry={getLiveMinimapTelemetry}
      />
    </div>
  );
}
