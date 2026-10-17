import { useEffect } from 'react';

// NORQVA-0090: tela de abertura depois do login (aprovada pelo Ricardo em 16/10/2026).
// Triângulo NORQVA com fumaça girando na horizontal, nome com reflexo, barra de
// carregamento e um "ta-dum" curto gerado no navegador (sem arquivo de áudio).
// Estilos e animações em index.css (classes nq-intro-*).

const INTRO_DURATION_MS = 3400;
const SOUND_DELAY_MS = 250;

// Duas batidas graves e um acorde que cresce. Se o navegador bloquear o som
// (sessão restaurada sem toque na página) ou não tiver Web Audio, fica em silêncio.
function playIntroSound() {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) return;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
  const now = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  const hit = (t: number, base: number, tones: number[], decay: number, level: number) => {
    tones.forEach((mult, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(base * mult * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(base * mult, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level / (i + 1), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + decay + 0.05);
    });
  };
  hit(now, 55, [1, 2], 0.35, 0.8);
  hit(now + 0.3, 41.2, [1, 1.5, 2, 3], 2.2, 0.9);

  const pad = ctx.createOscillator();
  const pg = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  pad.type = 'sawtooth';
  pad.frequency.value = 164.8;
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(200, now + 0.3);
  lp.frequency.exponentialRampToValueAtTime(1400, now + 1.2);
  pg.gain.setValueAtTime(0.0001, now + 0.3);
  pg.gain.exponentialRampToValueAtTime(0.08, now + 0.9);
  pg.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
  pad.connect(lp);
  lp.connect(pg);
  pg.connect(master);
  pad.start(now + 0.3);
  pad.stop(now + 2.7);

  window.setTimeout(() => {
    ctx.close().catch(() => undefined);
  }, 3200);
}

const PUFFS = [
  { left: 185, top: 70 },
  { left: 170, top: 128 },
  { left: 128, top: 170 },
  { left: 70, top: 185 },
  { left: 13, top: 170 },
  { left: -30, top: 128 },
  { left: -45, top: 70 },
  { left: -30, top: 13 },
  { left: 13, top: -30 },
  { left: 70, top: -45 },
  { left: 128, top: -30 },
  { left: 170, top: 13 },
];

// Metade da fumaça: a de trás fica atrás do triângulo, a da frente cobre a base dele.
function SmokeHalf({ side }: { side: 'back' | 'front' }) {
  return (
    <div className={`nq-intro-smoke-clip nq-intro-smoke-${side}`} aria-hidden="true">
      <div className="nq-intro-smoke-plane">
        <div className="nq-intro-smoke-spin">
          <div className="nq-intro-smoke-band" />
          {PUFFS.map((p, i) => (
            <div
              key={i}
              className="nq-intro-puff"
              style={{ left: p.left, top: p.top, animationDelay: `${-(i * 0.57).toFixed(2)}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function IntroSequence({ onFinish }: { onFinish: () => void }) {
  useEffect(() => {
    const soundTimer = window.setTimeout(() => {
      try {
        playIntroSound();
      } catch {
        // som é enfeite: nunca impede a abertura
      }
    }, SOUND_DELAY_MS);
    const finishTimer = window.setTimeout(onFinish, INTRO_DURATION_MS);
    return () => {
      window.clearTimeout(soundTimer);
      window.clearTimeout(finishTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="nq-intro min-h-screen relative overflow-hidden flex flex-col items-center justify-center font-mono select-none"
      role="status"
      aria-label="NORQVA Intelligence Core iniciando"
    >
      <div className="nq-intro-grid" aria-hidden="true" />
      <div className="nq-intro-scan" aria-hidden="true" />

      <p className="nq-intro-sub absolute top-[72px] left-0 right-0 m-0 text-center text-[10px] tracking-[0.28em] text-[#5B6B86]">
        INTELLIGENCE CORE · ONLINE
      </p>

      <div className="relative w-[240px] h-[240px] flex items-center justify-center">
        <div className="nq-intro-glow" aria-hidden="true" />
        <SmokeHalf side="back" />
        <div className="nq-intro-tri">
          <svg className="nq-intro-tri-in" viewBox="0 0 120 120" width="132" height="132" aria-hidden="true" style={{ overflow: 'visible' }}>
            <path
              d="M60 10 L104 86 L16 86 Z"
              fill="rgba(167,175,188,0.06)"
              stroke="#C9CFD9"
              strokeWidth="6"
              strokeLinejoin="miter"
            />
            <circle cx="60" cy="10" r="4" fill="#F4F6F9" />
          </svg>
        </div>
        <SmokeHalf side="front" />
      </div>

      <div className="nq-intro-name mt-7 pl-[0.42em] text-[40px] font-bold tracking-[0.42em] leading-none">
        <span className="nq-intro-shine">NORQVA</span>
      </div>
      <p className="nq-intro-sub mt-3.5 mb-0 pl-[0.5em] text-xs tracking-[0.5em] text-[#8FA3C0]">INTELIGÊNCIA</p>

      <div className="absolute bottom-[150px] left-1/2 -translate-x-1/2 w-[262px] max-w-[calc(100%-64px)] h-0.5 rounded-sm bg-[#121C33] overflow-hidden" aria-hidden="true">
        <div className="nq-intro-bar" />
      </div>
    </div>
  );
}
