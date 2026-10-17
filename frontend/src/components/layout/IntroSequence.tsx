import { useEffect } from 'react';

// NORQVA-0090: tela de abertura depois do login (aprovada pelo Ricardo em 16/10/2026).
// Triângulo NORQVA com fumaça girando na horizontal, nome com reflexo, barra de
// carregamento e um "ta-dum" curto gerado no navegador (sem arquivo de áudio).
// Estilos e animações em index.css (classes nq-intro-*).

const INTRO_DURATION_MS = 3400;
const SOUND_DELAY_MS = 250;

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext || w.webkitAudioContext || null;
}

// NORQVA-0091: "ta-dum" com energia entre 150 e 2.000 Hz para soar no alto-falante
// do celular (o 0090 ficava abaixo de 60 Hz, que o celular não reproduz).
// Duas batidas e um acorde de Mi que abre; compressor para ganhar volume sem estourar.
function scheduleTadum(ctx: AudioContext) {
  const now = ctx.currentTime + 0.03;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);
  comp.connect(ctx.destination);

  const hit = (t: number, base: number, partials: number[], decay: number, level: number) => {
    partials.forEach((mult, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(base * mult * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(base * mult, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level / Math.sqrt(i + 1), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + decay + 0.05);
    });
  };
  // "ta": batida curta
  hit(now, 110, [1, 2, 3, 4], 0.32, 0.35);
  // "dum": batida mais longa e grave
  hit(now + 0.3, 82.41, [1, 2, 3, 4, 5, 6], 2.0, 0.4);

  // acorde que abre depois do "dum" (Mi, Si, Mi)
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, now + 0.3);
  lp.frequency.exponentialRampToValueAtTime(2500, now + 1.3);
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.0001, now + 0.3);
  pg.gain.exponentialRampToValueAtTime(0.12, now + 0.9);
  pg.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
  lp.connect(pg);
  pg.connect(master);
  [164.81, 246.94, 329.63].forEach((f) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    o.start(now + 0.3);
    o.stop(now + 2.9);
  });
}

// Toca o som da abertura. Navegadores só liberam som depois de um toque na página:
// depois do login sempre toca; com a sessão já salva (app reaberto) o som fica
// esperando o primeiro toque durante a abertura. Devolve a limpeza.
function startIntroSound(): () => void {
  const AC = getAudioCtor();
  if (!AC) return () => undefined;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return () => undefined;
  }
  let played = false;
  let closed = false;
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];

  const removeUnlock = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  const play = () => {
    if (played || closed || ctx.state !== 'running') return;
    played = true;
    removeUnlock();
    scheduleTadum(ctx);
  };
  function unlock() {
    ctx.resume().then(play).catch(() => undefined);
  }

  if (ctx.state === 'running') {
    play();
  } else {
    events.forEach((e) => window.addEventListener(e, unlock, true));
    ctx.resume().then(play).catch(() => undefined);
  }

  return () => {
    removeUnlock();
    if (closed) return;
    closed = true;
    // deixa o som que já começou terminar antes de fechar
    window.setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, played ? 3000 : 0);
  };
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
    let stopSound: () => void = () => undefined;
    const soundTimer = window.setTimeout(() => {
      try {
        stopSound = startIntroSound();
      } catch {
        // som é enfeite: nunca impede a abertura
      }
    }, SOUND_DELAY_MS);
    const finishTimer = window.setTimeout(onFinish, INTRO_DURATION_MS);
    return () => {
      window.clearTimeout(soundTimer);
      window.clearTimeout(finishTimer);
      stopSound();
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

      <div className="mt-10 w-[262px] max-w-[calc(100%-64px)] h-0.5 rounded-sm bg-[#121C33] overflow-hidden" aria-hidden="true">
        <div className="nq-intro-bar" />
      </div>

    </div>
  );
}
