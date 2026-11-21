import type { ZombieKind } from '../types/game';
import type { SurfaceMaterialKind } from './parkourPhysics';
import type { WeaponId } from './weapons';

/**
 * Procedural Web Audio API synthesizer for Agra Quarantine.
 * Generates all combat, parkour, gadget, UI, and infected vocal SFX with zero external audio assets.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  // Continuous movement foley nodes (slide friction, wind rush, & metallic zipline pulley)
  private slideSrc: AudioBufferSourceNode | null = null;
  private slideFilter: BiquadFilterNode | null = null;
  private slideGain: GainNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private zipSrc: AudioBufferSourceNode | null = null;
  private zipFilter: BiquadFilterNode | null = null;
  private zipModOsc: OscillatorNode | null = null;
  private zipModGain: GainNode | null = null;
  private zipGain: GainNode | null = null;

  // Intro opening sequence ambient bed nodes (tracked for instant stop on skip/restart)
  private introGain: GainNode | null = null;
  private introWindSrc: AudioBufferSourceNode | null = null;
  private introSirenOsc: OscillatorNode | null = null;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.pinkNoiseBuffer = this.createPinkNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Ignore autoplay restriction before user gesture
      });
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopContinuousLoops();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createPinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 2.0;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  public getAudioContext(): AudioContext | null {
    return this.ready();
  }

  public playPipeSwing(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(190, now + 0.19);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.22);
  }

  public playPipeHit(heavy = false, blocked = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (blocked) {
      // Heavy metallic deflection against Brute armor
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.16);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }

    // Sub punch thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 135 : 175, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + (heavy ? 0.24 : 0.14));

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.45 : 0.34, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.26 : 0.16));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);

    // Metallic pipe resonance
    const ring = ctx.createOscillator();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(heavy ? 410 : 540, now);
    ring.frequency.exponentialRampToValueAtTime(210, now + 0.12);
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.14, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(now);
    ring.stop(now + 0.14);
  }

  public playCounterClang(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [880, 1320, 1975];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.32);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(idx === 0 ? 0.16 : 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  public playComboChime(combo: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const scale = [330, 392, 440, 523.25, 659.25, 783.99, 880];
    const baseFreq = scale[Math.min(combo - 1, scale.length - 1)] || 440;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.03, now + 0.18);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);

    if (combo === 5) {
      // Takedown ready fifth harmony
      const fifth = ctx.createOscillator();
      fifth.type = 'sine';
      fifth.frequency.setValueAtTime(baseFreq * 1.5, now + 0.04);
      const fifthGain = ctx.createGain();
      fifthGain.gain.setValueAtTime(0.16, now + 0.04);
      fifthGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      fifth.connect(fifthGain);
      fifthGain.connect(ctx.destination);
      fifth.start(now + 0.04);
      fifth.stop(now + 0.46);
    }
  }

  public playHeavyTakedown(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Shockwave sub boom
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    // Impact crunch noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.45);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.32, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.48);
  }

  public playFirecrackerFuse(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.96);
  }

  public playFirecrackerBang(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // 3 rapid Diwali-style firecracker pops
    [0, 0.08, 0.18].forEach((offset, idx) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer!;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1200 - idx * 150, now + offset);
      bp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.38 - idx * 0.06, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now + offset);
      src.stop(now + offset + 0.17);
    });
  }

  public playZombieGroan(kind: ZombieKind): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (kind === 'dog') {
      // Raspy feral growl + double bark snarl
      const growl = ctx.createOscillator();
      growl.type = 'sawtooth';
      growl.frequency.setValueAtTime(145 + Math.random() * 25, now);
      growl.frequency.exponentialRampToValueAtTime(92, now + 0.24);
      growl.frequency.exponentialRampToValueAtTime(240, now + 0.34);
      growl.frequency.exponentialRampToValueAtTime(88, now + 0.48);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(640, now);
      bp.frequency.linearRampToValueAtTime(1150, now + 0.28);
      bp.Q.value = 2.6;

      const gGain = ctx.createGain();
      gGain.gain.setValueAtTime(0.001, now);
      gGain.gain.linearRampToValueAtTime(0.16, now + 0.04);
      gGain.gain.linearRampToValueAtTime(0.06, now + 0.22);
      gGain.gain.linearRampToValueAtTime(0.2, now + 0.3);
      gGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      growl.connect(bp);
      bp.connect(gGain);
      gGain.connect(ctx.destination);
      growl.start(now);
      growl.stop(now + 0.52);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';

    const base =
      kind === 'brute' ? 72 : kind === 'screamer' ? 245 : kind === 'runner' ? 210 : 112;
    const dur = kind === 'brute' ? 0.55 : kind === 'screamer' ? 0.42 : kind === 'runner' ? 0.34 : 0.48;
    osc.frequency.setValueAtTime(base + Math.random() * 16, now);
    osc.frequency.linearRampToValueAtTime(
      base * (kind === 'runner' || kind === 'screamer' ? 1.25 : 0.78),
      now + dur,
    );

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(
      kind === 'screamer' ? 1020 : kind === 'runner' ? 880 : 380,
      now,
    );
    formant.Q.value = kind === 'screamer' ? 3.8 : 3.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(kind === 'brute' ? 0.16 : 0.11, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  public playPlayerHurt(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.25);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public playScavenge(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.29);
    });
  }

  public playFlashlightClick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playDoorToggle(opening: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Crisp brass latch click
    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.setValueAtTime(opening ? 980 : 720, now);
    click.frequency.exponentialRampToValueAtTime(opening ? 460 : 280, now + 0.045);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.14, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.055);

    // Subtle wooden hinge swing resonance or solid door thud on close
    const swing = ctx.createOscillator();
    swing.type = opening ? 'sawtooth' : 'sine';
    swing.frequency.setValueAtTime(opening ? 190 : 125, now + 0.03);
    swing.frequency.exponentialRampToValueAtTime(opening ? 275 : 48, now + (opening ? 0.26 : 0.16));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(opening ? 580 : 320, now + 0.03);
    const swingGain = ctx.createGain();
    swingGain.gain.setValueAtTime(opening ? 0.06 : 0.22, now + 0.03);
    swingGain.gain.exponentialRampToValueAtTime(0.001, now + (opening ? 0.28 : 0.18));
    swing.connect(lp);
    lp.connect(swingGain);
    swingGain.connect(ctx.destination);
    swing.start(now + 0.03);
    swing.stop(now + 0.3);
  }

  public playMedkitUse(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.29);
    });
  }

  public playMantle(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(480, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.19);
  }

  public playKick(hitTarget = false): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Air snap whoosh
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.exponentialRampToValueAtTime(160, now + 0.16);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.22, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.18);

    if (hitTarget) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    }
  }

  public playTarpLand(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.23);
  }

  public playWindRush(intensity = 0.6): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(340 + intensity * 380, now);
    bp.frequency.exponentialRampToValueAtTime(170, now + 0.26);
    bp.Q.value = 1.2;

    const gain = ctx.createGain();
    const vol = Math.min(0.2, 0.06 + intensity * 0.12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.29);
  }

  public playLedgeGrab(isVault = false): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // 1. Dull wooden/stone hand-slap transient (140Hz band-passed noise)
    const slapSrc = ctx.createBufferSource();
    slapSrc.buffer = this.noiseBuffer;
    const slapBp = ctx.createBiquadFilter();
    slapBp.type = 'bandpass';
    slapBp.frequency.setValueAtTime(140, now);
    slapBp.Q.value = 1.6;
    const slapGain = ctx.createGain();
    slapGain.gain.setValueAtTime(isVault ? 0.32 : 0.38, now);
    slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    slapSrc.connect(slapBp);
    slapBp.connect(slapGain);
    slapGain.connect(ctx.destination);
    slapSrc.start(now);
    slapSrc.stop(now + 0.14);

    // 2. Fabric rustle
    const clothSrc = ctx.createBufferSource();
    clothSrc.buffer = this.pinkNoiseBuffer ?? this.noiseBuffer;
    const clothBp = ctx.createBiquadFilter();
    clothBp.type = 'bandpass';
    clothBp.frequency.setValueAtTime(980, now);
    clothBp.frequency.exponentialRampToValueAtTime(520, now + 0.22);
    clothBp.Q.value = 1.2;
    const clothGain = ctx.createGain();
    clothGain.gain.setValueAtTime(0.001, now);
    clothGain.gain.linearRampToValueAtTime(0.14, now + 0.03);
    clothGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    clothSrc.connect(clothBp);
    clothBp.connect(clothGain);
    clothGain.connect(ctx.destination);
    clothSrc.start(now);
    clothSrc.stop(now + 0.25);

    // 3. Effort exhale swoosh
    const exhaleSrc = ctx.createBufferSource();
    exhaleSrc.buffer = this.noiseBuffer;
    const exhaleBp = ctx.createBiquadFilter();
    exhaleBp.type = 'bandpass';
    exhaleBp.frequency.setValueAtTime(420, now + 0.04);
    exhaleBp.frequency.exponentialRampToValueAtTime(175, now + 0.28);
    exhaleBp.Q.value = 1.8;
    const exhaleGain = ctx.createGain();
    exhaleGain.gain.setValueAtTime(0.001, now + 0.04);
    exhaleGain.gain.linearRampToValueAtTime(0.11, now + 0.09);
    exhaleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    exhaleSrc.connect(exhaleBp);
    exhaleBp.connect(exhaleGain);
    exhaleGain.connect(ctx.destination);
    exhaleSrc.start(now + 0.04);
    exhaleSrc.stop(now + 0.31);

    // 4. Body weight catch thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isVault ? 115 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isVault ? 0.18 : 0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playSlideScrape(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1650, now);
    bp.frequency.exponentialRampToValueAtTime(640, now + 0.44);
    bp.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.48);
  }

  public playLandingThud(heavy = false, impactSpeed = 10): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const speedNorm = Math.max(0.25, Math.min(1.0, (impactSpeed - 5.5) / 14.5));
    const startHz = heavy ? 80 : 95;
    const dur = heavy ? 0.22 + speedNorm * 0.1 : 0.14;
    const vol = heavy ? 0.28 + speedNorm * 0.28 : 0.14 + speedNorm * 0.14;

    // Heavy bass thump (80Hz sine drop) scaled by fall velocity
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.03);

    if (heavy) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(520 + speedNorm * 420, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.16 + speedNorm * 0.16, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      src.connect(lp);
      lp.connect(nGain);
      nGain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.21);
    }
  }

  public playVictory(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    [392, 493.88, 587.33, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.72);
    });
  }

  public playWallStep(stepNum = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(stepNum % 2 === 0 ? 520 : 610, now);
    bp.Q.value = 1.6;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.18, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.1);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playSafetyRoll(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(720, now);
    bp.frequency.exponentialRampToValueAtTime(240, now + 0.36);
    bp.Q.value = 1.0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.4);
  }

  public playGameOver(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    [220, 196, 164.81, 130.81].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.45);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.48);
    });
  }

  /**
   * Surface-aware footstep foley triggered at the bottom trough of each stride cycle:
   * concrete (grit scuff + heel thud), wood (warm hollow plank knock), or metal (brief resonant clack).
   */
  public playFootstep(
    sprintRatio = 0,
    crouching = false,
    surface: SurfaceMaterialKind = 'concrete',
  ): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // 1. Surface grit / scrape burst
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = surface === 'metal' ? 'bandpass' : 'lowpass';
    const baseCutoff =
      surface === 'wood' ? 460 : surface === 'metal' ? 1480 : 540;
    const cutoff = crouching
      ? baseCutoff * 0.72 + Math.random() * 70
      : baseCutoff + sprintRatio * 340 + Math.random() * 140;
    lp.frequency.setValueAtTime(cutoff, now);
    if (surface === 'metal') lp.Q.value = 1.6;

    const nGain = ctx.createGain();
    const scuffVol = (crouching ? 0.04 : 0.075 + sprintRatio * 0.055) * (surface === 'wood' ? 0.85 : 1.0);
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(scuffVol, now + 0.012);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    src.connect(lp);
    lp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.085);

    // 2. Impact resonance (concrete heel thud / hollow wood knock / metallic ping-clack)
    if (surface === 'metal') {
      const clack = ctx.createOscillator();
      clack.type = 'triangle';
      const f1 = 440 + Math.random() * 90;
      clack.frequency.setValueAtTime(f1, now);
      clack.frequency.exponentialRampToValueAtTime(f1 * 0.62, now + 0.075);

      const mGain = ctx.createGain();
      const vol = crouching ? 0.04 : 0.085 + sprintRatio * 0.06;
      mGain.gain.setValueAtTime(vol, now);
      mGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      clack.connect(mGain);
      mGain.connect(ctx.destination);
      clack.start(now);
      clack.stop(now + 0.09);

      const ping = ctx.createOscillator();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(920 + Math.random() * 160, now);
      const pGain = ctx.createGain();
      pGain.gain.setValueAtTime(vol * 0.35, now);
      pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      ping.connect(pGain);
      pGain.connect(ctx.destination);
      ping.start(now);
      ping.stop(now + 0.07);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = surface === 'wood' ? 'triangle' : 'sine';
    const thudStart =
      surface === 'wood' ? 195 + Math.random() * 45 : 120 + Math.random() * 60;
    const thudEnd = surface === 'wood' ? 78 : 48;
    osc.frequency.setValueAtTime(thudStart, now);
    osc.frequency.exponentialRampToValueAtTime(thudEnd, now + (surface === 'wood' ? 0.085 : 0.07));

    const tGain = ctx.createGain();
    const thudVol =
      (crouching ? 0.045 : 0.085 + sprintRatio * 0.06) * (surface === 'wood' ? 1.1 : 1.0);
    tGain.gain.setValueAtTime(thudVol, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + (surface === 'wood' ? 0.095 : 0.08));

    osc.connect(tGain);
    tGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Continuous filtered pink-noise slide friction loop with sweeping bandpass (800Hz -> 300Hz)
   * whose volume and pitch scale dynamically with current slide velocity.
   */
  public updateSlideLoop(active: boolean, speed: number): void {
    const ctx = this.ready();
    if (!ctx || !this.pinkNoiseBuffer) {
      if (this.slideGain && this.ctx) {
        this.slideGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      }
      return;
    }

    const now = ctx.currentTime;
    if (!this.slideSrc || !this.slideFilter || !this.slideGain) {
      if (!active) return;
      const src = ctx.createBufferSource();
      src.buffer = this.pinkNoiseBuffer;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(800, now);
      bp.Q.value = 1.15;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);

      this.slideSrc = src;
      this.slideFilter = bp;
      this.slideGain = gain;
    }

    if (active && speed > 1.5) {
      const norm = Math.max(0, Math.min(1, (speed - 4.5) / (18.0 - 4.5)));
      const targetFreq = 300 + norm * 500; // Sweeps 800Hz -> 300Hz as slide slows
      const targetVol = 0.035 + norm * 0.175;
      this.slideFilter.frequency.setTargetAtTime(targetFreq, now, 0.035);
      this.slideGain.gain.setTargetAtTime(targetVol, now, 0.03);
    } else {
      this.slideGain.gain.setTargetAtTime(0, now, 0.04);
    }
  }

  /**
   * Continuous high-pass wind noise that fades in when sprinting > 12.5 m/s,
   * during 2x+ Freeflow Combo, or with quadratic air-rush during fast falls.
   */
  public updateWindLoop(
    active: boolean,
    speed: number,
    comboCount: number,
    verticalSpeed = 0,
  ): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) {
      if (this.windGain && this.ctx) {
        this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
      return;
    }

    const now = ctx.currentTime;
    const fallSpeed = verticalSpeed < -7.5 ? Math.min(1, (-verticalSpeed - 7.5) / 14.5) : 0;
    const fallFactor = fallSpeed * fallSpeed; // quadratic falling rush
    const shouldPlay = active && (speed > 12.5 || comboCount >= 2 || fallFactor > 0.02);
    if (!this.windSrc || !this.windFilter || !this.windGain) {
      if (!shouldPlay) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(650, now);
      hp.Q.value = 0.7;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);

      src.connect(hp);
      hp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);

      this.windSrc = src;
      this.windFilter = hp;
      this.windGain = gain;
    }

    if (shouldPlay) {
      const speedFactor = speed > 12.5 ? Math.min(1, (speed - 12.5) / 5.5) : 0;
      const comboFactor = comboCount >= 2 ? Math.min(0.85, 0.32 + (comboCount - 2) * 0.1) : 0;
      const intensity = Math.max(speedFactor, comboFactor, fallFactor * 1.15);
      const targetFreq = 520 + intensity * 740;
      const targetVol = 0.012 + intensity * 0.082;
      this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
      this.windGain.gain.setTargetAtTime(targetVol, now, 0.1);
    } else {
      this.windGain.gain.setTargetAtTime(0, now, 0.12);
    }
  }

  /**
   * Continuous metallic high-pitched grinding/whirring resonance (1200Hz-2400Hz modulated filter)
   * that pitches up with current zip-line traversal speed.
   */
  public updateZiplineLoop(active: boolean, speed: number): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) {
      if (this.zipGain && this.ctx) {
        this.zipGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      }
      return;
    }

    const now = ctx.currentTime;
    if (!this.zipSrc || !this.zipFilter || !this.zipGain || !this.zipModOsc || !this.zipModGain) {
      if (!active) return;

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1400, now);
      bp.Q.value = 5.0;

      const modOsc = ctx.createOscillator();
      modOsc.type = 'sawtooth';
      modOsc.frequency.setValueAtTime(34, now);

      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(180, now);

      modOsc.connect(modGain);
      modGain.connect(bp.frequency);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      modOsc.start(now);

      this.zipSrc = src;
      this.zipFilter = bp;
      this.zipModOsc = modOsc;
      this.zipModGain = modGain;
      this.zipGain = gain;
    }

    if (active && speed > 1.0) {
      const norm = Math.max(0, Math.min(1, (speed - 8) / 14));
      const targetFreq = 1200 + norm * 1200; // 1200Hz -> 2400Hz
      this.zipFilter.frequency.setTargetAtTime(targetFreq, now, 0.04);
      this.zipModOsc.frequency.setTargetAtTime(26 + norm * 24, now, 0.04);
      this.zipGain.gain.setTargetAtTime(0.11 + norm * 0.09, now, 0.03);
    } else {
      this.zipGain.gain.setTargetAtTime(0, now, 0.03);
    }
  }

  public playIntroAmbience(): void {
    this.stopIntroAmbience();
    const ctx = this.ready();
    if (!ctx) return;
    const buf = this.pinkNoiseBuffer ?? this.noiseBuffer;
    if (!buf) return;
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(1.0, now + 0.65);
    masterGain.gain.setValueAtTime(1.0, now + 4.4);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 6.0);
    masterGain.connect(ctx.destination);

    // Evening breeze noise bed
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(340, now);
    windFilter.frequency.linearRampToValueAtTime(520, now + 2.8);
    windFilter.frequency.linearRampToValueAtTime(310, now + 5.8);
    windFilter.Q.value = 1.1;
    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.14, now);
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);
    windSrc.start(now);
    windSrc.stop(now + 6.1);

    // Faint distant city quarantine siren echo
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.setValueAtTime(390, now + 0.4);
    sirenOsc.frequency.linearRampToValueAtTime(560, now + 2.2);
    sirenOsc.frequency.linearRampToValueAtTime(360, now + 4.2);
    sirenOsc.frequency.linearRampToValueAtTime(490, now + 5.6);
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.setValueAtTime(460, now);
    sirenFilter.Q.value = 3.5;
    const sirenGain = ctx.createGain();
    sirenGain.gain.setValueAtTime(0.0001, now);
    sirenGain.gain.linearRampToValueAtTime(0.018, now + 1.2);
    sirenGain.gain.exponentialRampToValueAtTime(0.0005, now + 5.8);
    sirenOsc.connect(sirenFilter);
    sirenFilter.connect(sirenGain);
    sirenGain.connect(masterGain);
    sirenOsc.start(now + 0.35);
    sirenOsc.stop(now + 6.0);

    this.introGain = masterGain;
    this.introWindSrc = windSrc;
    this.introSirenOsc = sirenOsc;
  }

  public stopIntroAmbience(): void {
    if (this.ctx && this.introGain) {
      try {
        const now = this.ctx.currentTime;
        this.introGain.gain.cancelScheduledValues(now);
        this.introGain.gain.setTargetAtTime(0.0001, now, 0.03);
      } catch {
        // Ignore already-closed audio context
      }
    }
    if (this.introWindSrc) {
      try {
        this.introWindSrc.stop(this.ctx ? this.ctx.currentTime + 0.08 : 0);
      } catch {
        // Ignore if already stopped
      }
      this.introWindSrc = null;
    }
    if (this.introSirenOsc) {
      try {
        this.introSirenOsc.stop(this.ctx ? this.ctx.currentTime + 0.08 : 0);
      } catch {
        // Ignore if already stopped
      }
      this.introSirenOsc = null;
    }
    this.introGain = null;
  }

  public playBiomarkerChirp(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(2400, now + 0.085);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playRadioBeep(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Brief radio static squelch burst
    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1950, now);
      bp.Q.value = 1.8;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.08, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.12);
    }

    // Dual-tone walkie-talkie chirp (1320Hz -> 1760Hz)
    [1320, 1760].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.11, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.075);
    });
  }

  public playWallScrambleKick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Punchy sandstone wall-kick thump
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(118, now);
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.09);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.24, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);

    // Grit boot-sole scrape against stone
    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1050, now);
      bp.Q.value = 1.6;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.105);
    }
  }

  public playLedgeCatchImpact(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Low palm-impact stone thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.11);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.28, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);

    // Tactile palm slap + wrist wrap snap
    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1750, now);
      bp.frequency.exponentialRampToValueAtTime(720, now + 0.08);
      bp.Q.value = 1.4;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.24, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.11);
    }
  }

  public playMuscleUpPull(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      // Sleeve / forearm cloth tension & masonry scrape
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420, now);
      bp.frequency.exponentialRampToValueAtTime(260, now + 0.22);
      bp.Q.value = 1.9;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.14, now + 0.05);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.24);

      // Subtle athletic exertion exhale
      const exSrc = ctx.createBufferSource();
      exSrc.buffer = this.noiseBuffer;
      const exFilter = ctx.createBiquadFilter();
      exFilter.type = 'bandpass';
      exFilter.frequency.setValueAtTime(720, now + 0.03);
      exFilter.frequency.exponentialRampToValueAtTime(460, now + 0.2);
      exFilter.Q.value = 2.6;
      const exGain = ctx.createGain();
      exGain.gain.setValueAtTime(0.001, now + 0.03);
      exGain.gain.linearRampToValueAtTime(0.085, now + 0.08);
      exGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      exSrc.connect(exFilter);
      exFilter.connect(exGain);
      exGain.connect(ctx.destination);
      exSrc.start(now + 0.03);
      exSrc.stop(now + 0.23);
    }
  }

  public playRooftopStep(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(108, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.22, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);

    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1150, now);
      bp.Q.value = 1.5;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.14, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.095);
    }
  }

  public playWheelOpen(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playWheelTick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Subtle crisp mechanical UI click
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1250, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.025);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.032);
  }

  public playWeaponEquip(weaponId: WeaponId): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Leather/cloth unsheathe whoosh
    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      const baseHz = weaponId === 'dagger' ? 1600 : weaponId === 'cleaver' ? 920 : weaponId === 'unarmed' ? 680 : 540;
      bp.frequency.setValueAtTime(baseHz, now);
      bp.frequency.exponentialRampToValueAtTime(baseHz * 0.55, now + 0.14);
      bp.Q.value = 1.6;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.15, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.16);
    }

    if (weaponId === 'dagger' || weaponId === 'cleaver') {
      // Metallic blade unsheathe ring
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const startFreq = weaponId === 'dagger' ? 1480 : 760;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 1.24, now + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (weaponId === 'bat') {
      // Solid wooden grip thump
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(68, now + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      // Unarmed glove/wrist-wrap snap
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  public playWeaponSwing(weaponId: WeaponId): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';

    let fStart = 520;
    let fEnd = 190;
    let dur = 0.21;
    let vol = 0.24;

    if (weaponId === 'dagger') {
      fStart = 1150;
      fEnd = 420;
      dur = 0.13;
      vol = 0.2;
    } else if (weaponId === 'cleaver') {
      fStart = 390;
      fEnd = 125;
      dur = 0.3;
      vol = 0.32;
    } else if (weaponId === 'unarmed') {
      fStart = 720;
      fEnd = 260;
      dur = 0.14;
      vol = 0.19;
    }

    filter.frequency.setValueAtTime(fStart, now);
    filter.frequency.exponentialRampToValueAtTime(fEnd, now + dur);
    filter.Q.value = weaponId === 'dagger' ? 2.2 : 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.04, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  public playWeaponHit(weaponId: WeaponId, blocked = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (blocked) {
      this.playPipeHit(false, true);
      return;
    }

    if (weaponId === 'dagger' || weaponId === 'cleaver') {
      const heavy = weaponId === 'cleaver';
      // Impact thud
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(heavy ? 125 : 195, now);
      osc.frequency.exponentialRampToValueAtTime(heavy ? 36 : 58, now + (heavy ? 0.24 : 0.12));
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(heavy ? 0.44 : 0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.25 : 0.13));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (heavy ? 0.26 : 0.14));

      // Sharp slash transient
      if (this.noiseBuffer) {
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.setValueAtTime(heavy ? 1850 : 2800, now);
        hp.frequency.exponentialRampToValueAtTime(750, now + 0.11);
        hp.Q.value = 1.4;
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(heavy ? 0.26 : 0.2, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        nSrc.connect(hp);
        hp.connect(nGain);
        nGain.connect(ctx.destination);
        nSrc.start(now);
        nSrc.stop(now + 0.13);
      }
      return;
    }

    if (weaponId === 'unarmed') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
      return;
    }

    // Wooden Baseball Bat crack + thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.17);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);

    const woodCrack = ctx.createOscillator();
    woodCrack.type = 'triangle';
    woodCrack.frequency.setValueAtTime(620, now);
    woodCrack.frequency.exponentialRampToValueAtTime(240, now + 0.08);
    const wGain = ctx.createGain();
    wGain.gain.setValueAtTime(0.18, now);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    woodCrack.connect(wGain);
    wGain.connect(ctx.destination);
    woodCrack.start(now);
    woodCrack.stop(now + 0.1);
  }

  public playScreamerScreech(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Raspy vocal-cord formant screech (dual detuned sawtooth oscillators through sweeping formant)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(290 + Math.random() * 40, now);
    osc1.frequency.exponentialRampToValueAtTime(640, now + 0.14);
    osc1.frequency.exponentialRampToValueAtTime(255, now + 0.56);

    osc2.frequency.setValueAtTime(304 + Math.random() * 40, now);
    osc2.frequency.exponentialRampToValueAtTime(675, now + 0.14);
    osc2.frequency.exponentialRampToValueAtTime(272, now + 0.56);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(920, now);
    formant.frequency.exponentialRampToValueAtTime(1750, now + 0.16);
    formant.frequency.exponentialRampToValueAtTime(760, now + 0.56);
    formant.Q.value = 2.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.17, now + 0.05);
    gain.gain.setValueAtTime(0.15, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

    osc1.connect(formant);
    osc2.connect(formant);
    formant.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.6);
    osc2.stop(now + 0.6);

    // Wet guttural rasp noise layer
    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1450, now);
      bp.Q.value = 1.9;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.11, now + 0.06);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.54);
    }
  }

  public playHeadGrabWhiff(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(740, now);
    bp.frequency.exponentialRampToValueAtTime(260, now + 0.2);
    bp.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.24);
  }

  public playHeadGrabImpact(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Heavy skull-and-flesh low-end thump: 95 Hz -> 40 Hz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.46, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);

    // Leathery palm-on-cranium grip crunch
    if (this.noiseBuffer) {
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1180, now);
      bp.frequency.exponentialRampToValueAtTime(420, now + 0.14);
      bp.Q.value = 1.5;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      nSrc.start(now);
      nSrc.stop(now + 0.16);
    }
  }

  public playGrabbedRasp(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(255, now);
    osc.frequency.exponentialRampToValueAtTime(185, now + 0.42);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(960, now);
    formant.Q.value = 3.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  public playBatFaceDriveAudio(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. 0.00s Heavy Wood Bat Thud (190Hz -> 55Hz triangle oscillator)
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(190, now);
    thudOsc.frequency.exponentialRampToValueAtTime(55, now + 0.18);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.55, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.22);

    // 2. 0.00s Skull & Jaw Bone-Crush Fracture Snap
    if (this.noiseBuffer) {
      const crushSrc = ctx.createBufferSource();
      crushSrc.buffer = this.noiseBuffer;

      const crushBp = ctx.createBiquadFilter();
      crushBp.type = 'bandpass';
      crushBp.frequency.setValueAtTime(1650, now);
      crushBp.frequency.exponentialRampToValueAtTime(320, now + 0.15);
      crushBp.Q.value = 1.8;

      const crushGain = ctx.createGain();
      crushGain.gain.setValueAtTime(0.54, now);
      crushGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      crushSrc.connect(crushBp);
      crushBp.connect(crushGain);
      crushGain.connect(ctx.destination);
      crushSrc.start(now);
      crushSrc.stop(now + 0.17);

      // Crisp bone-crack transient
      const snapSrc = ctx.createBufferSource();
      snapSrc.buffer = this.noiseBuffer;
      const snapHp = ctx.createBiquadFilter();
      snapHp.type = 'highpass';
      snapHp.frequency.setValueAtTime(2200, now);
      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(0.36, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

      snapSrc.connect(snapHp);
      snapHp.connect(snapGain);
      snapGain.connect(ctx.destination);
      snapSrc.start(now);
      snapSrc.stop(now + 0.075);

      // 3. 0.02s Wet Gore & Flesh Squelch (bandpass sweep 1400Hz -> 380Hz, Q = 6.0)
      const goreStart = now + 0.02;
      const goreSrc = ctx.createBufferSource();
      goreSrc.buffer = this.noiseBuffer;

      const goreBp = ctx.createBiquadFilter();
      goreBp.type = 'bandpass';
      goreBp.frequency.setValueAtTime(1400, goreStart);
      goreBp.frequency.exponentialRampToValueAtTime(380, goreStart + 0.24);
      goreBp.Q.value = 6.0;

      const goreGain = ctx.createGain();
      goreGain.gain.setValueAtTime(0.001, goreStart);
      goreGain.gain.linearRampToValueAtTime(0.42, goreStart + 0.025);
      goreGain.gain.exponentialRampToValueAtTime(0.001, goreStart + 0.26);

      goreSrc.connect(goreBp);
      goreBp.connect(goreGain);
      goreGain.connect(ctx.destination);
      goreSrc.start(goreStart);
      goreSrc.stop(goreStart + 0.28);

      // 4. 0.75s Delayed Bat Extraction Squelch (bandpass sweep 350Hz -> 1100Hz)
      const extStart = now + 0.75;
      const extSrc = ctx.createBufferSource();
      extSrc.buffer = this.noiseBuffer;

      const extBp = ctx.createBiquadFilter();
      extBp.type = 'bandpass';
      extBp.frequency.setValueAtTime(350, extStart);
      extBp.frequency.exponentialRampToValueAtTime(1100, extStart + 0.2);
      extBp.Q.value = 5.5;

      const extGain = ctx.createGain();
      extGain.gain.setValueAtTime(0.001, extStart);
      extGain.gain.linearRampToValueAtTime(0.36, extStart + 0.04);
      extGain.gain.exponentialRampToValueAtTime(0.001, extStart + 0.24);

      extSrc.connect(extBp);
      extBp.connect(extGain);
      extGain.connect(ctx.destination);
      extSrc.start(extStart);
      extSrc.stop(extStart + 0.26);

      // Wet suction pop on bat extraction
      const popOsc = ctx.createOscillator();
      popOsc.type = 'sine';
      popOsc.frequency.setValueAtTime(135, extStart + 0.03);
      popOsc.frequency.exponentialRampToValueAtTime(290, extStart + 0.14);
      const popGain = ctx.createGain();
      popGain.gain.setValueAtTime(0.001, extStart + 0.03);
      popGain.gain.linearRampToValueAtTime(0.18, extStart + 0.05);
      popGain.gain.exponentialRampToValueAtTime(0.001, extStart + 0.16);
      popOsc.connect(popGain);
      popGain.connect(ctx.destination);
      popOsc.start(extStart + 0.03);
      popOsc.stop(extStart + 0.18);
    }
  }

  public playNightRunnerShriek(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    oscA.frequency.setValueAtTime(420, now);
    oscA.frequency.exponentialRampToValueAtTime(1120, now + 0.12);
    oscA.frequency.exponentialRampToValueAtTime(340, now + 0.45);
    oscB.frequency.setValueAtTime(445, now);
    oscB.frequency.exponentialRampToValueAtTime(1185, now + 0.12);
    oscB.frequency.exponentialRampToValueAtTime(365, now + 0.45);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1350, now);
    bp.Q.value = 3.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    oscA.connect(bp);
    oscB.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + 0.5);
    oscB.stop(now + 0.5);
  }

  public playStruggleHeartbeat(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (const [offset, peak] of [
      [0, 0.34],
      [0.14, 0.24],
    ] as const) {
      const t0 = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(68, t0);
      osc.frequency.exponentialRampToValueAtTime(34, t0 + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }
  }

  public playCrushCrunch(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(150, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.28);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.34);

    if (this.noiseBuffer) {
      const crunch = ctx.createBufferSource();
      crunch.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1950, now);
      bp.frequency.exponentialRampToValueAtTime(280, now + 0.24);
      bp.Q.value = 1.6;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.58, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      crunch.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      crunch.start(now);
      crunch.stop(now + 0.28);
    }
  }

  public playLowStaminaBreath(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(620, now);
    bp.frequency.exponentialRampToValueAtTime(310, now + 0.24);
    bp.Q.value = 2.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.28);
  }

  public playLowStaminaHeartbeat(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (const [offset, startFreq, peak] of [
      [0.0, 74, 0.16],
      [0.18, 62, 0.11],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(34, now + offset + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(peak, now + offset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    }
  }

  public playPulleyClick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playLiberationChord(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // D4 (293.66 Hz), A4 (440.00 Hz), F#5 (739.99 Hz) major fifth chord
    const freqs = [293.66, 440.0, 739.99];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freqs[i], now + i * 0.035);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + i * 0.035);
      gain.gain.linearRampToValueAtTime(0.16, now + i * 0.035 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.035 + 1.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.035);
      osc.stop(now + i * 0.035 + 1.45);
    }
  }

  public playTacticalWhistle(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.exponentialRampToValueAtTime(1520, now + 0.18);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2360, now);
    osc2.frequency.exponentialRampToValueAtTime(3040, now + 0.18);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
    gain.gain.setValueAtTime(0.16, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.045, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(ctx.destination);
    gain2.connect(ctx.destination);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.2);
    osc2.stop(now + 0.2);
  }

  public playAllyPipeImpact(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 220 Hz -> 65 Hz triangle thud
    const thud = ctx.createOscillator();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(220, now);
    thud.frequency.exponentialRampToValueAtTime(65, now + 0.14);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.28, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.17);

    // Metallic pipe clang overtones
    for (const [freq, peak, dur] of [
      [880, 0.09, 0.18],
      [1420, 0.06, 0.14],
    ] as const) {
      const clang = ctx.createOscillator();
      clang.type = 'sine';
      clang.frequency.setValueAtTime(freq, now);
      clang.frequency.exponentialRampToValueAtTime(freq * 0.94, now + dur);

      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(peak, now);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      clang.connect(cGain);
      cGain.connect(ctx.destination);
      clang.start(now);
      clang.stop(now + dur + 0.02);
    }
  }

  public stopContinuousLoops(): void {
    this.stopIntroAmbience();
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.slideGain) this.slideGain.gain.setTargetAtTime(0, now, 0.02);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.02);
      if (this.zipGain) this.zipGain.gain.setTargetAtTime(0, now, 0.02);
    }
  }
}
