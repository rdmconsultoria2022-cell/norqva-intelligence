# NORQVA-0033: PDF entregue ao comprador trocado pela tela (com cópia de segurança)

**Branch:** `ai/NORQVA-0033-arquivos-entrega` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 09/10/2026 01h12 ("Aprovado"), contrato no Claude Docs "NORQVA-0033 — Contrato: Arquivos de entrega pela tela e produto adicional" · **Risco:** HIGH (arquivo que o comprador recebe)

## Por que

A Trattoria estava entregando um PDF desatualizado e só dava para trocar mexendo direto no Supabase. O adicional (Dolci della Nonna) precisa de arquivo próprio para ser ligado.

## Escopo

- Migration 047 (aditiva): colunas de arquivo em `digital_assets` (tamanho, sha256, nome original, quando, quem) e tabela `digital_asset_versions`.
- `DeliveryFileService`: troca (cópia do atual em `_versoes/` no mesmo bucket, conferida por sha256, antes de subir o novo no mesmo endereço com upsert; se a cópia falha ou não confere, nada é trocado; mesmo arquivo → 409), volta de versão (guarda a que sai), arquivo novo para oferta sem arquivo (endereço `NOME_DA_OFERTA_OFF-XXXX.pdf`, sem sobrescrever objeto existente, registro + vínculo numa transação). Linha travada com FOR UPDATE durante a troca.
- Rotas ADMIN: `GET/POST /api/offers/:id/delivery-files`, `PUT /api/digital-assets/:id/file`, `POST /api/digital-assets/:id/versions/:versionId/restore`, `GET /api/digital-assets/:id/check-link` (link de 5 min). Corpo `application/pdf` até 50 MB; nome em `x-file-name` (liberado no CORS).
- Tela: "PDF entregue ao comprador" no cartão da oferta (ADMIN), com conferir, trocar com confirmação, histórico e voltar versão; oferta sem arquivo envia e liga.

## Regras

Entrega continua só com PAID confirmado pelo Asaas e link assinado; nada de pagamento, CPF ou Meta muda; arquivo antigo nunca é apagado; chave do Supabase só no servidor; testes com armazenamento simulado (o cliente real recusa rodar em teste).

## Testes

`backend/src/tests/norqva_0033_delivery_files.test.ts`, `frontend/src/tests/norqva_0033_delivery_files.test.tsx`.
