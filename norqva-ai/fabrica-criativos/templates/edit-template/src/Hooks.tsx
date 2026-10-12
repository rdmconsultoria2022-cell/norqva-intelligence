import React from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  OffthreadVideo,
  Sequence,
  staticFile,
} from "remotion";
import { Ad, AdProps, Captions, FPS, calcTotalFrames } from "./Ad";
import hooksData from "../public/hooks_timeline.json";
import timeline from "../public/timeline.json";

const H = hooksData as Record<
  string,
  { src: string; who: string; trimStart: number; trimEnd: number; words: any[] }
>;
const secs = (s: number) => Math.round(s * FPS);
// Tolerante a id ausente: se um hook não foi gerado no build (ex.: pacote sem Split-UGC),
// retorna 0 em vez de estourar — assim uma composição não-usada não derruba o Root inteiro.
export const hookLen = (id: string) => {
  const h = H[id];
  return h ? h.trimEnd - h.trimStart : 0;
};
export const hookedDuration = (hookSeconds: number, cta: any) =>
  secs(hookSeconds) + calcTotalFrames(timeline as any, cta);
export const spokenHookDuration = (id: string, cta: any) => hookedDuration(hookLen(id), cta);

type BodyProps = Omit<AdProps, "timeline">;

const HookedAd: React.FC<{ hookSeconds: number; body: BodyProps; children: React.ReactNode }> = ({
  hookSeconds,
  body,
  children,
}) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    <Sequence durationInFrames={secs(hookSeconds)}>{children}</Sequence>
    <Sequence from={secs(hookSeconds)}>
      <Ad timeline={timeline as any} {...body} />
    </Sequence>
  </AbsoluteFill>
);

// ── 1) REACT — avatar keyado sobre o 1º frame do body congelado + ESCURECIDO ──
// (brightness 0.5 = lê como "vídeo pausado" e a legenda não briga com o rosto de trás)
const ReactOverlay: React.FC<{ id: string }> = ({ id }) => {
  const h = H[id];
  const first = (timeline as any).clips[0];
  return (
    <>
      <Freeze frame={Math.round(first.trimStart * FPS)}>
        <OffthreadVideo
          muted
          src={staticFile(first.src)}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.5)" }}
        />
      </Freeze>
      {/* Reator ancorado no rodapé com objectFit CONTAIN: a pessoa keyada nunca é
          cortada, seja qual for a proporção do take (cover cortava rosto/criava faixa
          preta quando o take não era exatamente 9:16). objectPosition bottom = pés no
          rodapé, cabeça sempre no quadro. */}
      <AbsoluteFill>
        <OffthreadVideo
          transparent
          src={staticFile(h.src)}
          trimBefore={Math.round(h.trimStart * FPS)}
          trimAfter={Math.round(h.trimEnd * FPS)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "bottom center",
          }}
        />
      </AbsoluteFill>
      <Captions
        bottom={1180}
        clip={{ id, who: h.who, src: h.src, trimStart: h.trimStart, trimEnd: h.trimEnd, words: h.words }}
      />
    </>
  );
};

export const HkReact: React.FC<{ id: string } & BodyProps> = ({ id, ...body }) => (
  <HookedAd hookSeconds={hookLen(id)} body={body}>
    <ReactOverlay id={id} />
  </HookedAd>
);

// ── 2) SPLIT — b-roll mudo na metade de cima nos primeiros 3,5s do body ──
export const SplitHookedAd: React.FC<{ broll: string } & BodyProps> = ({ broll, ...body }) => (
  <Ad timeline={timeline as any} {...body} hook={{ src: broll, seconds: 3.5 }} />
);

// ── 3) UGC — abertura falada espontânea (carro/cozinha) fullscreen → body ──
export const HkUgc: React.FC<{ id: string } & BodyProps> = ({ id, ...body }) => {
  const h = H[id];
  return (
    <HookedAd hookSeconds={hookLen(id)} body={body}>
      <OffthreadVideo
        src={staticFile(h.src)}
        trimBefore={Math.round(h.trimStart * FPS)}
        trimAfter={Math.round(h.trimEnd * FPS)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <Captions
        clip={{ id, who: h.who, src: h.src, trimStart: h.trimStart, trimEnd: h.trimEnd, words: h.words }}
      />
    </HookedAd>
  );
};

// ── 3b) SPLIT-UGC — split com a pessoa UGC FALANDO (áudio+legenda) na metade de cima
//        e o ad rodando (mudo) embaixo durante a abertura → depois o body fullscreen.
//        Diferença pro Split normal: o topo NÃO é b-roll mudo, é o depoimento com voz.
//        Dá o 2º split do pacote (um com b-roll do ad, outro com o rosto do UGC). ──
export const HkSplitUgc: React.FC<{ id: string } & BodyProps> = ({ id, ...body }) => {
  const h = H[id];
  const hookFrames = secs(hookLen(id));
  const first = (timeline as any).clips[0];
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Sequence durationInFrames={hookFrames}>
        <div style={{ position: "absolute", top: 0, height: "50%", width: "100%", overflow: "hidden" }}>
          <OffthreadVideo
            src={staticFile(h.src)}
            trimBefore={Math.round(h.trimStart * FPS)}
            trimAfter={Math.round(h.trimEnd * FPS)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <div style={{ position: "absolute", top: "50%", height: "50%", width: "100%", overflow: "hidden" }}>
          <OffthreadVideo
            muted
            src={staticFile(first.src)}
            trimBefore={Math.round(first.trimStart * FPS)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <Captions
          clip={{ id, who: h.who, src: h.src, trimStart: h.trimStart, trimEnd: h.trimEnd, words: h.words }}
        />
      </Sequence>
      <Sequence from={hookFrames}>
        <Ad timeline={timeline as any} {...body} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── 4) VISUAL — b-roll fullscreen + a VOZ de um take green screen (só áudio) ──
// O áudio vem do .mp4 ORIGINAL em takes_raw/ (o .mov keyado é ProRes/PCM — não use).
export const HkVisual: React.FC<{ id: string; broll: string } & BodyProps> = ({
  id,
  broll,
  ...body
}) => {
  const h = H[id];
  const rawSrc = `takes_raw/${h.src.split("/").pop()!.replace(".mov", ".mp4")}`;
  return (
    <HookedAd hookSeconds={hookLen(id)} body={body}>
      <OffthreadVideo
        muted
        loop
        src={staticFile(broll)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <Audio
        src={staticFile(rawSrc)}
        trimBefore={Math.round(h.trimStart * FPS)}
        trimAfter={Math.round(h.trimEnd * FPS)}
      />
      <Captions
        clip={{ id, who: h.who, src: h.src, trimStart: h.trimStart, trimEnd: h.trimEnd, words: h.words }}
      />
    </HookedAd>
  );
};
