import React from "react";
import { Composition, continueRender, delayRender, staticFile } from "remotion";
import { THEME } from "./theme";
import { AdMudo, MudoData, mudoDuration } from "./Mudo";
import mudo from "../public/mudo.json";

// Fonte — OPT-IN. Default (theme.fontFile === "") usa a stack do SISTEMA e NÃO cria
// delayRender: em máquina fria o carregamento de fonte via FontFace estourava o timeout e
// travava o render inteiro. Só quando o usuário aponta uma .ttf de marca em public/ é que
// carregamos; mesmo assim, qualquer falha/timeout cai pra fonte do sistema sem travar.
if (THEME.fontFile) {
  const waitFont = delayRender("font", { timeoutInMilliseconds: 120000 });
  const done = () => continueRender(waitFont);
  const safety = setTimeout(done, 8000); // rede lenta não pode segurar o render
  try {
    const font = new FontFace("BrandFont", `url(${staticFile(THEME.fontFile)})`, {
      weight: "300 800",
    });
    font
      .load()
      .then((f) => {
        document.fonts.add(f);
        clearTimeout(safety);
        done();
      })
      .catch(() => {
        clearTimeout(safety);
        done();
      });
  } catch {
    clearTimeout(safety);
    done();
  }
}

// ─── NORQVA (contrato NORQVA-0053) ────────────────────────────────────────────
// Só anúncios MUDOS de comida (AdMudo), um por abertura, lidos de public/mudo.json (gerado pelo
// scripts/build_mudo.py). Os formatos originais com pessoa de IA falando (AdReact, AdUgc,
// AdSplitUgc, AdVisual com voz de avatar) foram tirados: só voltam com filmagem REAL.
// Render: npx remotion render src/index.ts <Id> ../out/<Id>.mp4 --timeout=120000
const M = mudo as unknown as MudoData;

export const RemotionRoot: React.FC = () => (
  <>
    {(M.ads ?? []).map((ad) => (
      <Composition
        key={ad.id}
        id={ad.id}
        component={AdMudo as React.FC<any>}
        durationInFrames={mudoDuration(M, ad)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ data: M, ad }}
      />
    ))}
  </>
);
