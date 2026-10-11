# NORQVA-0048: campanha para a página do kit

**Branch:** `ai/NORQVA-0048-campanha-kit` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** Ricardo, 11/10/2026 19h48 ("Aprovado!"), contrato NORQVA-0048 no Claude Docs · **Risco:** MEDIUM (trava de destino dos anúncios)

## Motivo

A NORQVA_TRATTORIA_EXP02_CREATIVE (TR-EXP02, teto R$ 420) foi pausada pelo vigia ao atingir o teto; o teto não sobe acima do capital aprovado (confirmação forte nunca construída). Os anúncios levam para /p/OFF-000001 e a trava só aceitava /p/:humanId, então nenhuma campanha podia levar à página do kit (/kit/OFF-000006).

## Escopo

- Trava de destino aceita também `/kit/:humanId`, só no domínio do NORQVA e nos domínios de marca verificados.
- Campanha nova de oferta de kit (nome começa com "Kit") leva para `/kit/:humanId`.
- Kit pode usar criativos aprovados dos livros que ele contém (produtos das ofertas que entregam os mesmos PDFs). Outras ofertas continuam só com criativos do próprio produto.
- `GET /api/campaigns/offer-creatives?offer=` (ADMIN): criativos possíveis e destino; a tela Campanhas usa isso.
- Nada é criado ou ativado na Meta; a EXP02 não é alterada.
