# NORQVA-0034: produto criado pela tela aparece na conta real; fim do modo demonstração nas telas

**Branch:** `ai/NORQVA-0034-produto-real-sem-demo` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 09/10/2026 18h32 ("considero as alterações aprovadas", incluindo eliminar o modo demo), contrato no Claude Docs "NORQVA-0034 — Contrato: Produto criado pela tela aparece na conta real" · **Risco:** MEDIUM

## Escopo

- `createProduct`/`createOffer`: na conta real nascem `COMMERCIAL_PRODUCTION` (a oferta herda do produto; produto ainda UNKNOWN → oferta UNKNOWN); demo → `DEMO_SEED`.
- `CatalogVisibilityService` + rotas ADMIN `GET /api/products/hidden` e `POST /api/products/:id/bring-to-list`: lista produtos reais UNKNOWN e, a pedido, marca produto + ofertas UNKNOWN como comerciais (auditoria crítica). QA e demo recusados.
- Tela: quadro "Criados pela tela e fora da lista" em Produtos (ADMIN); recarrega produtos e ofertas.
- Modo demonstração: `DEMO_MODE_ENABLED` só em testes (nenhuma variável de ambiente religa no site). Some o seletor MODO DEMO/REAL e a limpeza da base demo. Dados demo ficam no banco, invisíveis.

## Regras

Nada apagado; sem migration; pagamento/entrega/Meta inalterados; testes sem serviços externos.
