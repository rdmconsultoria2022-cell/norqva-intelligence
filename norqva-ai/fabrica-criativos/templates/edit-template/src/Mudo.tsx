import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CtaArrow, CtaStyle, FPS, StaticOverlay } from "./Ad";

// NORQVA (contrato NORQVA-0053): anúncio MUDO de comida — cenas de b-roll (vídeo) ou páginas reais do
// livro (imagem com zoom lento), texto grande por cena, música e chamada final pulsante.
// Sem pessoa de IA, sem fala gerada, sem preço. A abertura muda por anúncio; o corpo é o mesmo.

export type Scene = { src: string; seconds: number; lines: string[] };
export type MudoAd = { id: string; abertura: Scene; cta: CtaStyle; ctaSeconds?: number };
export type MudoData = { music?: string; musicVolume?: number; narration?: string; body: Scene[]; ads: MudoAd[] };

const isImage = (src: string) => /\.(png|jpe?g|webp)$/i.test(src);
const frames = (s: number) => Math.max(1, Math.round(s * FPS));

export const mudoScenes = (data: MudoData, ad: MudoAd): Scene[] => {
  const scenes = [ad.abertura, ...data.body];
  // a chamada final fica sobre a última cena, estendida pelo tempo da chamada
  const last = scenes[scenes.length - 1];
  return [...scenes.slice(0, -1), { ...last, seconds: last.seconds + (ad.ctaSeconds ?? 2.5) }];
};

export const mudoDuration = (data: MudoData, ad: MudoAd) =>
  mudoScenes(data, ad).reduce((acc, s) => acc + frames(s.seconds), 0);

const Still: React.FC<{ src: string; dur: number }> = ({ src, dur }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, dur], [1, 1.08]);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
    </AbsoluteFill>
  );
};

const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 3], [0.3, 0], { extrapolateRight: "clamp" });
  return op > 0 ? <AbsoluteFill style={{ backgroundColor: "#fff", opacity: op }} /> : null;
};

export const AdMudo: React.FC<{ data: MudoData; ad: MudoAd }> = ({ data, ad }) => {
  const scenes = mudoScenes(data, ad);
  let cursor = 0;
  const seqs = scenes.map((s) => {
    const from = cursor;
    const dur = frames(s.seconds);
    cursor += dur;
    return { s, from, dur };
  });
  const last = seqs.length - 1;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {data.music ? <Audio src={staticFile(data.music)} volume={data.musicVolume ?? (data.narration ? 0.18 : 0.6)} /> : null}
      {data.narration ? <Audio src={staticFile(data.narration)} /> : null}
      {seqs.map(({ s, from, dur }, i) => (
        <Sequence key={`${i}-${s.src}`} from={from} durationInFrames={dur}>
          {isImage(s.src) ? (
            <Still src={s.src} dur={dur} />
          ) : (
            <OffthreadVideo src={staticFile(s.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          {i > 0 && <Flash />}
          {s.lines.length > 0 && (i < last ? <StaticOverlay lines={s.lines} /> : null)}
          {i === last && (
            <>
              {s.lines.length > 0 && (
                <Sequence durationInFrames={Math.max(1, dur - frames(ad.ctaSeconds ?? 2.5))}>
                  <StaticOverlay lines={s.lines} />
                </Sequence>
              )}
              <Sequence from={Math.max(0, dur - frames(ad.ctaSeconds ?? 2.5))}>
                <CtaArrow {...ad.cta} />
              </Sequence>
            </>
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
