# NORQVA-0124: e-mail de acesso legível no modo escuro

**Branch:** `ai/NORQVA-0124-email-modo-escuro` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 24/10/2026 23h36 ("Aprovado"), contrato no Claude Docs "NORQVA-0124 — Contrato: e-mail de acesso legível no modo escuro" · **Risco:** LOW (só aparência do e-mail)

## Motivo

Compradora do Kit Trattoria Completo (24/10/2026) não conseguiu usar o botão "Baixar meu livro": o app de e-mail no modo escuro inverteu as cores e o botão ficou rosa-claro com texto branco.

## Escopo

- `buildPurchaseAccessEmail` e `buildRecoveryAccessEmail` (`services/resendProvider.ts`): `color-scheme: light`, botão com cor fixa (também como `linear-gradient`, que o Gmail não inverte) e texto branco garantido; link escrito embaixo do botão com 14 px, sublinhado e clicável.
- Nada muda em link, validade, pagamento ou liberação. Teste `norqva_0124_email_dark_mode.test.ts`.
