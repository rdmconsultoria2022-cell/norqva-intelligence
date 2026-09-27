# TASK CONTRACT — NORQVA-0002

**Título:** Higiene de segurança e guarda de CI
**Executor:** Claude (acesso de escrita concedido pelo operador em 2026-09-27) · **Risco:** MEDIUM
**Mode:** SANDBOX_IMPLEMENTATION · `DEPLOY_ALLOWED = FALSE` (merge = decisão do operador)

## Objetivo

Remover segredos padrão e senhas do código público e impedir, por regra automática, a edição de migrations já aplicadas.

## Escopo

1. `ENCRYPTION_KEY` passa a ser obrigatória em produção (`envValidation.ts`). O código deixa de usar uma chave pública como alternativa; em testes, uma chave de teste isolada (`api.ts: getEncryptionKey`).
2. Senha de Postgres local removida dos fallbacks de 3 arquivos de teste.
3. CI:
   - roda também em push para `ai/**`, para executores validarem branches sem depender de PR. O deploy continua exclusivo da `main`;
   - novo passo "Guard Applied Migrations": falha se um branch alterar, apagar ou renomear migration que já existe na `main`.

## Fora do escopo (tarefas futuras)

- Banco de teste isolado por arquivo (a suíte continua compartilhando um banco; estabilizada no NORQVA-0001).
- Restrição de IP de entrada do Postgres na Render. Depende de saber quais scripts locais acessam o banco; decisão do operador.
- Atualização das actions para Node 24 (aviso não bloqueante).

## Critério de aceite

- CI verde no branch `ai/NORQVA-0002`.
- `grep` por `default_32_byte_key_for_testing_123` fora de `backend/src/tests/` sem resultados.

## Pré-requisito de deploy

`ENCRYPTION_KEY` e `CPF_CNPJ_HASH_SECRET` configuradas na Render. **Confirmado em 2026-09-27.**
