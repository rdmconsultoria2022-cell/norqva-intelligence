# NORQVA-0131: Fábrica — botão "Tirar do ar para editar" no passo 4

**Branch:** `ai/NORQVA-0131-fabrica-tirar-do-ar` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** correção de tela (D-0037, sem aprovação prévia); relato do Ricardo em 25/10/2026 01h47 ("não consigo editar nenhuma informação") · **Risco:** LOW

## Contexto

Na Fábrica (passo 4, Geração) a página GEN-000001 (Bordado) estava no ar. Página no ar fica travada para edição e o aviso dizia "Tire do ar para editar", mas a Fábrica esconde os botões de situação (`hideStatusActions`), então não havia botão para tirar do ar.

## Escopo

- `GenerationView.tsx`: com `hideStatusActions`, página PUBLISHED e usuário ADMIN, aparece "Tirar do ar para editar" ao lado do aviso (mesma rota `/generated-pages/:id/unpublish`, que já era só ADMIN). Depois de editar, publica de novo no passo 5 ("Publicar página").
- Testes em `norqva_0116_generation.test.tsx`.

Nada muda em pagamento, entrega ou gasto.
