# NORQVA-0053: anúncio sem preço (e fábrica de criativos versão NORQVA)

**Branch:** `ai/NORQVA-0053-anuncio-sem-preco` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** contrato NORQVA-0053, itens 1 e 2 aprovados pelo Ricardo em 12/10/2026 11h20 · **Risco:** LOW (só travas de texto)

## Motivo

Ricardo (12/10/2026 11h20): "retirar as informações de Preço dos criativos (titulo/descrição/video)". O preço passa a aparecer só na página, no WhatsApp e no pagamento.

## Escopo (este PR)

- `services/creative/priceInCopy.ts`: regra pura (R$, centavos, parcelas, "reais", "por apenas", "preço", desconto).
- Travas: aprovação do criativo (texto + promessa PRICE), `saveFields` (título/texto do anúncio), `assertAdsReadyForMeta` (antes de criar na Meta), `opportunityService.reportPlan` (plano do time de IA).
- Tela Criativos: com arquivo anexado, "Aprovar" pede "Confirmo, sem preço".
- Lote BB-B01: textos e roteiro sem R$ 29,90; BB-CL-06 não é mais ligada aos criativos.
- Testes: `norqva_0053_price_free_ads.test.ts`, `norqva_0053_no_price_confirm.test.tsx`; fixture do 0019 sem preço.

## Fora do escopo

- Item 1 (fábrica de criativos) vai em PR próprio; item 3 (WhatsApp na página) só depois do "Aprovado".
- `AI_RULES` (texto validado na aba Critérios) não muda aqui: exige revalidação; a trava do plano já barra preço.

## Item 1 (PR próprio): fábrica de criativos versão NORQVA

- `norqva-ai/fabrica-criativos/`: Criativos Infinitos v2.2 adaptado. Regras NORQVA no `SKILL.md` (sem preço, sem pessoa de IA como real, sem depoimento, sem troca de gerador, raspagem sem login).
- `gen.py`: sem a cadeia de geradores permissivos; recusa `script.json` com preço ou fala gerada por IA; nova fase `music` (Suno via KIE).
- `norqva_guard.py`: mesmas regras de preço do `priceInCopy.ts`.
- `build_mudo.py` + `templates/edit-template/src/Mudo.tsx`: anúncios mudos de comida (cena por cena, texto na tela, música, chamada pulsante); `Root.tsx` registra só `AdMudo`.
- Roda fora do NORQVA (computador do Ricardo ou servidor próprio); o mp4 é anexado na tela Criativos.
