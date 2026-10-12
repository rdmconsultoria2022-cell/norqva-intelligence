import React from "react";
import { THEME } from "./theme";

// ─── END CARDS DO PACOTE ──────────────────────────────────────────────────────
// Regra: UM end card por ad, todos DIFERENTES (headline e botão próprios).
// `shot` = screenshot real do funil (capturado com scripts/shoot_funnel.mjs) em
// public/funnel/. Sem shot → usa emoji grande (card de marca).
// Edite os 4 abaixo pra cada pacote — os textos são só exemplo de estrutura.

export type EndcardId = "ec_a" | "ec_b" | "ec_c" | "ec_d";

export const ENDCARDS: Record<
  EndcardId,
  { head: React.ReactNode; button: string; shot?: string; emoji?: string }
> = {
  ec_a: {
    head: (
      <>
        Descubra em <span style={{ color: THEME.accent }}>1 minuto</span>.
      </>
    ),
    button: "Fazer o teste grátis →",
    shot: "funnel/landing.png",
  },
  ec_b: {
    head: (
      <>
        Qual é o <span style={{ color: THEME.accent2 }}>seu nível</span>?
      </>
    ),
    button: "Ver meu resultado",
    shot: "funnel/landing.png",
  },
  ec_c: {
    head: (
      <>
        Seu plano de <span style={{ color: THEME.accent }}>28 dias</span>.
      </>
    ),
    button: "Montar meu plano",
    shot: "funnel/landing.png",
  },
  ec_d: {
    head: (
      <>
        Comece hoje à noite.
        <br />É só isso.
      </>
    ),
    button: "Começar agora",
    emoji: "🌙",
  },
};
