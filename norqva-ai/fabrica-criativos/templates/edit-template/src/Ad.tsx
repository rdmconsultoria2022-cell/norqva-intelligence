import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { THEME, highlightFor, textOn } from "./theme";
import { ENDCARDS, EndcardId } from "./endcards";

export const FPS = 30;
const ENDCARD_FRAMES = Math.round(3.4 * FPS);
const font = { fontFamily: THEME.fontFamily };

export type Word = { word: string; start: number; end: number };
export type Clip = {
  id: string;
  who: string;
  src: string;
  trimStart: number;
  trimEnd: number;
  words: Word[];
};
export type Timeline = { clips: Clip[] };

const clipFrames = (c: Clip) => Math.round((c.trimEnd - c.trimStart) * FPS);
// CTA PADRÃO = overlay de texto+seta pulsando SOBRE o vídeo (não há mais end card de marca).
export const calcTotalFrames = (t: Timeline, cta: Clip) =>
  t.clips.reduce((acc, c) => acc + clipFrames(c), 0) + clipFrames(cta);

// CTA nativo pulsante. VARIA por ad (texto, cor, fonte, seta) — cada ad do pacote deve ter
// o seu, coerente com o funil/nicho. color default = cor de ação do funil (THEME.accent).
export type CtaStyle = { text: string; color?: string; font?: string; arrow?: string };
export const CtaArrow: React.FC<CtaStyle> = ({ text, color, font, arrow = "▼" }) => {
  const frame = useCurrentFrame();
  const enter = spring({ frame, fps: FPS, config: { damping: 14 } });
  const bounce = Math.sin(frame / 4) * 11; // seta quica
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(frame / 6)); // pulso de opacidade
  const c = color ?? THEME.accent;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div style={{ transform: `scale(${enter})`, marginBottom: 96, textAlign: "center" }}>
        <div
          style={{
            fontFamily: font ?? "Arial Black, Arial, sans-serif",
            fontWeight: 900,
            fontSize: 50,
            color: "#fff",
            textTransform: "uppercase",
            WebkitTextStroke: "3px #000",
            paintOrder: "stroke fill",
            lineHeight: 1.05,
            background: c,
            display: "inline-block",
            padding: "18px 32px",
            borderRadius: 18,
            boxShadow: "0 12px 34px rgba(0,0,0,.55)",
          }}
        >
          {text}
        </div>
        <div
          style={{
            fontSize: 96,
            lineHeight: 1,
            marginTop: 2,
            transform: `translateY(${bounce}px)`,
            opacity: pulse,
            color: c,
            textShadow: "0 5px 14px rgba(0,0,0,.65)",
          }}
        >
          {arrow}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const chunkWords = (words: Word[], size = 3): Word[][] => {
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
};

// Legendas DR: chunks de 3 palavras, Arial Black + stroke, highlight na palavra mais
// longa. NUNCA karaokê palavra-a-palavra. `bottom` reposiciona quando a cena tem rosto baixo.
export const Captions: React.FC<{ clip: Clip; bottom?: number }> = ({ clip, bottom }) => {
  const frame = useCurrentFrame();
  const t = clip.trimStart + frame / FPS;
  const chunks = chunkWords(clip.words);
  const active = chunks.find((ch) => t >= ch[0].start && t <= ch[ch.length - 1].end + 0.25);
  if (!active) return null;
  const hlIdx = active.reduce(
    (best, w, i) => (w.word.trim().length > active[best].word.trim().length ? i : best),
    0
  );
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: bottom ?? 640,
          maxWidth: 950,
          textAlign: "center",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontWeight: 900,
          fontSize: 64,
          lineHeight: 1.25,
          color: "#fff",
          textTransform: "uppercase",
          WebkitTextStroke: "3px black",
          paintOrder: "stroke fill",
          textShadow: "0 4px 10px rgba(0,0,0,0.85)",
        }}
      >
        {active.map((w, i) => (
          <span
            key={i}
            style={{
              padding: "0 8px",
              ...(i === hlIdx
                ? {
                    backgroundColor: highlightFor(clip.who),
                    borderRadius: 8,
                    boxDecorationBreak: "clone",
                  }
                : {}),
            }}
          >
            {w.word.trim()}{" "}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// Texto estático pra cenas SEM VO (ads mudos): 1-2 linhas grandes + scrim + fade-in
export const StaticOverlay: React.FC<{ lines: React.ReactNode[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const inOp = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const rise = interpolate(frame, [0, 10], [26, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: 320,
          maxWidth: 940,
          textAlign: "center",
          opacity: inOp,
          transform: `translateY(${rise}px)`,
          background: "rgba(12, 20, 38, 0.42)",
          borderRadius: 28,
          padding: "30px 42px",
        }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              ...font,
              fontWeight: 700,
              fontSize: i === 0 ? 62 : 54,
              lineHeight: 1.3,
              color: "#fff",
              textShadow: "0 3px 14px rgba(0,0,0,0.75)",
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// End card: wordmark + headline + screenshot real do funil + botão pill na cor de ação.
// UM end card DIFERENTE por ad (definidos em endcards.tsx).
export const EndCard: React.FC<{ variant: EndcardId }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const pop = spring({ frame, fps: FPS, config: { damping: 13 } });
  const ec = ENDCARDS[variant];
  const zoom = interpolate(frame, [0, ENDCARD_FRAMES], [1, 1.05]);
  return (
    <AbsoluteFill
      style={{ backgroundColor: THEME.bg, justifyContent: "center", alignItems: "center" }}
    >
      <div style={{ transform: `scale(${pop})`, textAlign: "center", width: "100%" }}>
        <div
          style={{
            ...font,
            fontWeight: 700,
            fontSize: 42,
            color: THEME.soft,
            letterSpacing: 8,
            marginBottom: 14,
          }}
        >
          {THEME.brand}
        </div>
        <div
          style={{
            ...font,
            fontWeight: 700,
            fontSize: 66,
            // NUNCA cor fixa aqui: textOn garante contraste com o fundo do end card
            color: textOn(THEME.bg),
            lineHeight: 1.25,
            padding: "0 60px",
          }}
        >
          {ec.head}
        </div>
        {ec.shot ? (
          <div style={{ marginTop: 40, display: "flex", justifyContent: "center" }}>
            <Img
              src={staticFile(ec.shot)}
              style={{
                width: 560,
                borderRadius: 36,
                boxShadow: "0 24px 70px rgba(29,43,69,0.28)",
                transform: `scale(${zoom})`,
              }}
            />
          </div>
        ) : (
          <div style={{ fontSize: 200, marginTop: 60 }}>{ec.emoji ?? "✨"}</div>
        )}
        <div
          style={{
            ...font,
            marginTop: 46,
            display: "inline-block",
            background: THEME.accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 46,
            padding: "28px 58px",
            borderRadius: 99,
            boxShadow: `0 12px 36px ${THEME.accent}73`,
          }}
        >
          {ec.button}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export type Hook = { src: string; seconds: number };

// Split: b-roll mudo na metade de cima durante a 1ª fala do corpo
const SplitFirstClip: React.FC<{ clip: Clip; hook: Hook }> = ({ clip, hook }) => {
  const frame = useCurrentFrame();
  const inHook = frame < Math.round(hook.seconds * FPS);
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: inHook ? "50%" : 0,
          height: inHook ? "50%" : "100%",
          width: "100%",
          overflow: "hidden",
        }}
      >
        <OffthreadVideo
          src={staticFile(clip.src)}
          trimBefore={Math.round(clip.trimStart * FPS)}
          trimAfter={Math.round(clip.trimEnd * FPS)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      {inHook && (
        <div
          style={{ position: "absolute", top: 0, height: "50%", width: "100%", overflow: "hidden" }}
        >
          <OffthreadVideo
            muted
            src={staticFile(hook.src)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}
    </>
  );
};

// Cutaway = b-roll mudo POR CIMA de um clip falado (o áudio da fala continua embaixo).
// É a inserção que mata o talking-head puro no meio do body: `over` = id do clip,
// `at`/`dur` em segundos relativos ao início do clip. Fade-in de 3 frames; saída seca.
export type Cutaway = { over: string; src: string; at: number; dur: number };

const CutawayVideo: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <OffthreadVideo
        muted
        loop
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

// Insert de IMAGEM no canto (dopamina DR clássica): a fala continua e uma foto pipoca
// por cima — "antigamente" → foto antiga, prova → print, produto → close. NÃO ocupa a
// tela: caixa de ~40% da largura na METADE DE CIMA (a legenda mora embaixo). Pop-in com
// spring + leve rotação estilo polaroid; saída com fade rápido de 4 frames.
export type ImageInsert = {
  over: string; // id do clip falado
  src: string; // arquivo em public/ (ex.: "inserts/antes.png")
  at: number; // segundos relativos ao início do clip
  dur: number;
  pos?: "top-left" | "top-right" | "top-center"; // default top-right
  w?: number; // largura px em 1080 (default 430)
  rotate?: number; // graus (default -5; alterne o sinal entre inserts)
  polaroid?: boolean; // moldura branca + label (default true)
  label?: string; // legenda da polaroid (ex.: "antes", "2019")
};

const InsertImage: React.FC<{ ins: ImageInsert }> = ({ ins }) => {
  const frame = useCurrentFrame();
  const durF = Math.round(ins.dur * FPS);
  const pop = spring({ frame, fps: FPS, config: { damping: 12, stiffness: 170 } });
  const out = interpolate(frame, [durF - 4, durF], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const w = ins.w ?? 430;
  const polaroid = ins.polaroid ?? true;
  const posStyle: React.CSSProperties =
    ins.pos === "top-left"
      ? { left: 48, top: 210 }
      : ins.pos === "top-center"
        ? { left: "50%", top: 170, marginLeft: -w / 2 }
        : { right: 48, top: 210 };
  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        width: w,
        transform: `scale(${pop}) rotate(${ins.rotate ?? -5}deg)`,
        opacity: out,
        background: polaroid ? "#fff" : undefined,
        padding: polaroid ? 14 : 0,
        paddingBottom: polaroid ? 52 : 0,
        borderRadius: polaroid ? 6 : 18,
        overflow: "hidden",
        boxShadow: "0 18px 50px rgba(0,0,0,.55)",
      }}
    >
      <Img
        src={staticFile(ins.src)}
        style={{ width: "100%", height: Math.round(w * 1.2), objectFit: "cover", display: "block" }}
      />
      {polaroid && ins.label ? (
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "Arial Black, Arial, sans-serif",
            fontWeight: 900,
            fontSize: 34,
            color: "#1a1a1a",
            textTransform: "uppercase",
          }}
        >
          {ins.label}
        </div>
      ) : null}
    </div>
  );
};

// Transição "punch" estilo CapCut nos cortes do body: zoom 1.07→1 em 5 frames + flash
// branco de 3 frames. Sutil de propósito — DR vive de corte seco; o punch só dá o "snap".
// Desliga com transitions={false} no defaultProps do ad.
const PunchZoom: React.FC<{ base: number; enabled: boolean; children: React.ReactNode }> = ({
  base,
  enabled,
  children,
}) => {
  const frame = useCurrentFrame();
  const z = enabled
    ? interpolate(frame, [0, 5], [1.07, 1], { extrapolateRight: "clamp" })
    : 1;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        transform: `scale(${base * z})`,
      }}
    >
      {children}
    </div>
  );
};

const CutFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 3], [0.35, 0], { extrapolateRight: "clamp" });
  if (op <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: "#fff", opacity: op }} />;
};

export type AdProps = {
  timeline: Timeline;
  cta: Clip;
  ctaOverlay?: CtaStyle; // CTA pulsante DESTE ad (varia por ad). Sem isso, usa um default.
  hook?: Hook | null;
  cutaways?: Cutaway[]; // inserções de b-roll no meio do body (áudio da fala continua)
  inserts?: ImageInsert[]; // fotos/prints pipocando no canto (polaroid pop-in)
  transitions?: boolean; // punch+flash nos cortes (default true)
  endcard?: EndcardId; // legado — end card removido; mantido só p/ compatibilidade de props
};

// Corpo do ad: clips em sequência com punch-in alternado (2ª câmera fake) + cutaways de
// b-roll + transição punch nos cortes + CTA pulsante
export const Ad: React.FC<AdProps> = ({ timeline, cta, ctaOverlay, hook, cutaways, inserts, transitions = true }) => {
  let cursor = 0;
  const allClips = [...timeline.clips, cta];
  const seqs = allClips.map((c) => {
    const from = cursor;
    const dur = clipFrames(c);
    cursor += dur;
    return { clip: c, from, dur };
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {seqs.map(({ clip, from, dur }, i) => (
        <Sequence key={clip.id} from={from} durationInFrames={dur}>
          <PunchZoom base={i % 2 === 1 ? 1.1 : 1} enabled={transitions && i > 0}>
            {i === 0 && hook ? (
              <SplitFirstClip clip={clip} hook={hook} />
            ) : (
              <OffthreadVideo
                src={staticFile(clip.src)}
                trimBefore={Math.round(clip.trimStart * FPS)}
                trimAfter={Math.round(clip.trimEnd * FPS)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </PunchZoom>
          {(cutaways ?? [])
            .filter((c) => c.over === clip.id)
            .map((c) => (
              <Sequence
                key={`${c.over}-${c.src}`}
                from={Math.round(c.at * FPS)}
                durationInFrames={Math.round(c.dur * FPS)}
              >
                <CutawayVideo src={c.src} />
              </Sequence>
            ))}
          {(inserts ?? [])
            .filter((n) => n.over === clip.id)
            .map((n) => (
              <Sequence
                key={`ins-${n.over}-${n.src}`}
                from={Math.round(n.at * FPS)}
                durationInFrames={Math.round(n.dur * FPS)}
              >
                <InsertImage ins={n} />
              </Sequence>
            ))}
          {transitions && i > 0 && <CutFlash />}
          {i === seqs.length - 1 ? (
            <CtaArrow {...(ctaOverlay ?? { text: "SAIBA MAIS" })} />
          ) : (
            <Captions clip={clip} />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
