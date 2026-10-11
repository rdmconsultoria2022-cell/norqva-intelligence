# NORQVA-0049: tela explica por que não há criativo para a campanha

**Branch:** `ai/NORQVA-0049-criativos-do-kit-diagnostico` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** tela (D-0037), parte do contrato NORQVA-0048 · **Risco:** LOW

## Motivo

Ricardo (11/10/2026 20h04): ao criar a campanha do kit, "Nenhum criativo de vídeo aprovado para esta oferta" e o botão ficou travado, sem dizer o motivo.

## Escopo

- `GET /api/campaigns/offer-creatives` devolve também os produtos considerados e os criativos desses produtos que ainda não servem (não aprovados ou não vídeo).
- A tela Nova campanha mostra essa explicação quando a lista está vazia.
