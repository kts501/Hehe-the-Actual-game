import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';

const DEV_SECRET_PIN = '7777';

interface DevModMenuProps {
  onOverlayChange: (open: boolean, relockPointer?: boolean) => void;
  onToggleImmortal: (enabled: boolean) => void;
  onToggleInfStamina: (enabled: boolean) => void;
  onFillAwakening: () => void;
  onFullHeal: () => void;
  onClearNearbyEnemies: () => number;
  onSpawnInfectedInFront: () => void;
}

export function DevModMenu({
  onOverlayChange,
  onToggleImmortal,
  onToggleInfStamina,
  onFillAwakening,
  onFullHeal,
  onClearNearbyEnemies,
  onSpawnInfectedInFront,
}: DevModMenuProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinShake, setPinShake] = useState(false);

  const [immortal, setImmortal] = useState(() => Boolean(window.devImmortal));
  const [infStamina, setInfStamina] = useState(() => Boolean(window.devInfStamina));
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Draggable floating panel coordinates (default top-right inset)
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 364) : 24,
    y: 28,
  }));
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const flashToast = useCallback((msg: string) => {
    setActionToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setActionToast(null);
      toastTimerRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Notify engine whenever either overlay opens/closes so pointer lock & inputs stay synchronized
  useEffect(() => {
    const anyOpen = pinPromptOpen || menuOpen;
    onOverlayChange(anyOpen, !anyOpen);
  }, [pinPromptOpen, menuOpen, onOverlayChange]);

  // Autofocus PIN input when prompt opens
  useEffect(() => {
    if (pinPromptOpen) {
      const id = window.setTimeout(() => {
        pinInputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(id);
    }
  }, [pinPromptOpen]);

  // Global secret shortcut listener: Ctrl + Shift + ~ (Backquote) OR F9
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isF9 = e.code === 'F9';
      const isCtrlShiftTilde = e.ctrlKey && e.shiftKey && e.code === 'Backquote';

      if (isF9 || isCtrlShiftTilde) {
        e.preventDefault();
        e.stopPropagation();

        if (!unlocked) {
          setPinError('');
          setPinInput('');
          setPinPromptOpen((prev) => !prev);
        } else {
          setMenuOpen((prev) => !prev);
        }
        return;
      }

      if (e.code === 'Escape') {
        if (pinPromptOpen) {
          e.preventDefault();
          e.stopPropagation();
          setPinPromptOpen(false);
          setPinInput('');
          setPinError('');
        } else if (menuOpen) {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [unlocked, pinPromptOpen, menuOpen]);

  // Drag handlers for the floating panel header
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const d = dragStateRef.current;
      if (!d.dragging) return;
      const maxX = Math.max(12, window.innerWidth - 344);
      const maxY = Math.max(12, window.innerHeight - 120);
      const nextX = Math.min(maxX, Math.max(12, d.originX + (e.clientX - d.startX)));
      const nextY = Math.min(maxY, Math.max(12, d.originY + (e.clientY - d.startY)));
      setPanelPos({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      dragStateRef.current.dragging = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: panelPos.x,
      originY: panelPos.y,
    };
  };

  const handlePinSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === DEV_SECRET_PIN) {
      setUnlocked(true);
      setPinPromptOpen(false);
      setPinInput('');
      setPinError('');
      setMenuOpen(true);
    } else {
      setPinError('INVALID ACCESS PIN');
      setPinInput('');
      setPinShake(true);
      window.setTimeout(() => setPinShake(false), 360);
      pinInputRef.current?.focus();
    }
  };

  const handleToggleImmortal = () => {
    const next = !immortal;
    setImmortal(next);
    window.devImmortal = next;
    onToggleImmortal(next);
  };

  const handleToggleInfStamina = () => {
    const next = !infStamina;
    setInfStamina(next);
    window.devInfStamina = next;
    onToggleInfStamina(next);
  };

  const handleFillAwakening = () => {
    onFillAwakening();
    flashToast('Awakening 100% Ready [G]');
  };

  const handleFullHeal = () => {
    onFullHeal();
    flashToast('HP & Stamina Restored');
  };

  const handleClearEnemies = () => {
    const count = onClearNearbyEnemies();
    flashToast(count > 0 ? `Cleared ${count} Nearby Hostile${count > 1 ? 's' : ''}` : 'Perimeter Already Clear');
  };

  const handleSpawnInfected = () => {
    onSpawnInfectedInFront();
    flashToast('Screamer Spawned 2.6m Ahead');
  };

  return (
    <>
      {/* Subtle bottom-right golden dot indicator when God Mode is active */}
      {immortal && (
        <div
          aria-label="God Mode Active"
          className="pointer-events-none fixed bottom-2.5 right-3 select-none"
          style={{
            zIndex: 99998,
            color: '#FFD700',
            fontSize: '14px',
            lineHeight: 1,
            textShadow: '0 0 8px rgba(255, 215, 0, 0.9), 0 0 14px rgba(255, 77, 26, 0.7)',
          }}
        >
          •
        </div>
      )}

      {/* Centered Secret Security PIN Gate (First Activation Per Session) */}
      {pinPromptOpen && !unlocked && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/55"
          style={{ zIndex: 99999, backdropFilter: 'blur(4px)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setPinPromptOpen(false);
              setPinInput('');
              setPinError('');
            }
          }}
        >
          <form
            onSubmit={handlePinSubmit}
            className="w-[320px] p-5 text-zinc-100 shadow-2xl transition-transform"
            style={{
              background: 'rgba(14, 16, 22, 0.92)',
              border: '1px solid #FF4D1A',
              borderRadius: '12px',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75), 0 0 28px rgba(255, 77, 26, 0.2)',
              transform: pinShake ? 'translateX(-6px)' : 'translateX(0)',
            }}
          >
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#FF4D1A] shadow-[0_0_8px_#FF4D1A]" />
                <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#FF4D1A]">
                  DEV OVERRIDE // GATE
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPinPromptOpen(false);
                  setPinInput('');
                  setPinError('');
                }}
                className="rounded px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                ESC
              </button>
            </div>

            <label
              htmlFor="dev-access-pin-input"
              className="mb-2 block font-mono text-[11px] tracking-wider text-zinc-300"
            >
              ENTER DEVELOPER ACCESS PIN
            </label>
            <input
              ref={pinInputRef}
              id="dev-access-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                if (pinError) setPinError('');
              }}
              placeholder="••••"
              className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-center font-mono text-base tracking-[0.45em] text-amber-300 placeholder-zinc-600 outline-none transition focus:border-[#FF4D1A]"
            />

            {pinError && (
              <p className="mt-2 text-center font-mono text-[10px] font-semibold tracking-wider text-red-400">
                {pinError}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPinPromptOpen(false);
                  setPinInput('');
                  setPinError('');
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                CANCEL
              </button>
              <button
                type="submit"
                className="rounded-lg px-4 py-1.5 font-mono text-[11px] font-bold tracking-wider text-white transition hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg, #FF4D1A 0%, #D97706 100%)',
                  boxShadow: '0 0 14px rgba(255, 77, 26, 0.35)',
                }}
              >
                AUTHENTICATE
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Draggable Exclusive Developer Mod Menu */}
      {unlocked && menuOpen && (
        <div
          className="fixed w-[332px] select-none text-zinc-100 shadow-2xl"
          style={{
            left: `${panelPos.x}px`,
            top: `${panelPos.y}px`,
            background: 'rgba(14, 16, 22, 0.92)',
            border: '1px solid #FF4D1A',
            borderRadius: '12px',
            zIndex: 99999,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 22px 54px rgba(0, 0, 0, 0.78), 0 0 26px rgba(255, 77, 26, 0.18)',
          }}
        >
          {/* Draggable Header */}
          <div
            onPointerDown={handleHeaderPointerDown}
            className="flex cursor-grab items-center justify-between border-b border-white/10 px-4 py-3 active:cursor-grabbing"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #FF4D1A, #FFD700)',
                  boxShadow: '0 0 8px rgba(255, 77, 26, 0.9)',
                }}
              />
              <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-amber-300">
                DEV OVERRIDE // EXCLUSIVE
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              title="Close Mod Menu (F9)"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300 transition hover:border-[#FF4D1A]/60 hover:text-white"
            >
              [F9] ×
            </button>
          </div>

          <div className="space-y-3 p-4">
            {/* Toggle Switch 1: Immortal Mode */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div>
                <div className="font-mono text-[11px] font-bold tracking-wider text-zinc-100">
                  IMMORTAL MODE (GOD MODE)
                </div>
                <div className="font-mono text-[10px] text-zinc-400">
                  Zero damage • HP locked at 100
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={immortal}
                onClick={handleToggleImmortal}
                className="relative h-6 w-11 shrink-0 rounded-full border transition-all duration-200 focus:outline-none"
                style={
                  immortal
                    ? {
                        background: 'linear-gradient(135deg, #DC2626 0%, #F59E0B 100%)',
                        borderColor: '#FBBF24',
                        boxShadow: '0 0 14px rgba(255, 77, 26, 0.75)',
                      }
                    : {
                        background: 'rgba(39, 39, 42, 0.9)',
                        borderColor: 'rgba(255, 255, 255, 0.16)',
                      }
                }
              >
                <span
                  className="block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                  style={{
                    transform: immortal ? 'translateX(22px)' : 'translateX(3px)',
                  }}
                />
              </button>
            </div>

            {/* Toggle Switch 2: Infinite Stamina */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div>
                <div className="font-mono text-[11px] font-bold tracking-wider text-zinc-100">
                  INFINITE STAMINA
                </div>
                <div className="font-mono text-[10px] text-zinc-400">
                  Unlimited parkour sprint &amp; swings
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={infStamina}
                onClick={handleToggleInfStamina}
                className="relative h-6 w-11 shrink-0 rounded-full border transition-all duration-200 focus:outline-none"
                style={
                  infStamina
                    ? {
                        background: 'linear-gradient(135deg, #DC2626 0%, #F59E0B 100%)',
                        borderColor: '#FBBF24',
                        boxShadow: '0 0 14px rgba(255, 77, 26, 0.75)',
                      }
                    : {
                        background: 'rgba(39, 39, 42, 0.9)',
                        borderColor: 'rgba(255, 255, 255, 0.16)',
                      }
                }
              >
                <span
                  className="block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                  style={{
                    transform: infStamina ? 'translateX(22px)' : 'translateX(3px)',
                  }}
                />
              </button>
            </div>

            {/* Quick Action Buttons */}
            <div className="space-y-2 pt-1">
              <div className="font-mono text-[10px] font-semibold tracking-[0.18em] text-zinc-500">
                QUICK ACTIONS
              </div>

              <button
                type="button"
                onClick={handleFillAwakening}
                className="flex w-full items-center justify-between rounded-lg border border-[#FF4D1A]/40 bg-[#FF4D1A]/15 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-amber-200 transition hover:border-[#FF4D1A] hover:bg-[#FF4D1A]/25"
              >
                <span>FILL AWAKENING (100%)</span>
                <span className="text-[10px] text-[#FF4D1A]">[G]</span>
              </button>

              <button
                type="button"
                onClick={handleFullHeal}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20"
              >
                <span>FULL HEAL (100 HP)</span>
                <span className="text-[10px] text-emerald-400">+100</span>
              </button>

              <button
                type="button"
                onClick={handleClearEnemies}
                className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-zinc-200 transition hover:border-amber-400/60 hover:bg-white/[0.09]"
              >
                <span>CLEAR NEARBY ENEMIES</span>
                <span className="text-[10px] text-zinc-400">26m</span>
              </button>

              <button
                type="button"
                onClick={handleSpawnInfected}
                className="flex w-full items-center justify-between rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/25"
              >
                <span>SPAWN INFECTED IN FRONT</span>
                <span className="text-[10px] text-rose-300">[MMB]</span>
              </button>
            </div>

            {/* Brief confirmation line & shortcut hint */}
            <div className="flex items-center justify-between border-t border-white/10 pt-2 font-mono text-[10px]">
              <span className="text-amber-300">{actionToast ?? 'Cutscene Auto-Immunity: ON'}</span>
              <span className="text-zinc-500">F9 / Ctrl+Shift+~</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
