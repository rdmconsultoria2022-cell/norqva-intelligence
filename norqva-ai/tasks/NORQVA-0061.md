# NORQVA-0061: Volumes III, IV e V à venda separadamente

**Branch:** `ai/NORQVA-0061-livros-a-venda` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** contrato "NORQVA-0061 — Contrato: pôr à venda os Volumes III, IV e V" (Claude Docs), aprovado pelo Ricardo em 13/10/2026 19h26 ("Aprovado por R$ 19,90"). · **Risco:** MEDIUM (cria ofertas; nada vende até o Ricardo enviar o PDF e ativar)

## Escopo

- Migration 062:
  - cria os 3 produtos (PLANEJADO, procedência ORIGINAL) e as 3 ofertas em RASCUNHO, a R$ 19,90;
  - marca e categoria vêm do Trattoria; cartão com as condições da OFF-000001 quando ela custa R$ 19,90 sem promoção, senão só Pix;
  - não duplica e registra na auditoria;
  - nenhum PDF ligado (o Ricardo envia pela tela).
- `services/catalog/collectionBooks.ts`: chave do livro pelo nome do produto e lista dos livros com oferta ATIVA.
- `GET /api/public/offers/:id` ganha `book`. Novo `GET /api/public/collection` (público, só livro, código e preço).
- Página da oferta (`/p/...`): mesmo visual do Trattoria, com textos e imagens de cada livro (`features/public/bookPages.ts`). Sem `book`, nada muda.
- Página do kit: livro com oferta ATIVA mostra a capa, "Disponível separadamente · R$ 19,90" e o link; os outros seguem "Em breve".
- Imagens do Pães em `frontend/public/images/livros/paes/`. Os Volumes IV e V recebem as imagens quando as fotos chegarem.
- Testes: `norqva_0061_collection_books.test.ts`, `norqva_0061_collection_pages.test.tsx`.

## Continua igual

- Kit com Trattoria + Dolci, pelo mesmo preço.
- Entrega só com PAID do Asaas.
- Anúncios sem preço (D-0053).
