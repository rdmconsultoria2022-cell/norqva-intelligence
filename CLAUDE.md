# NORQVA Intelligence: instruções para o Claude

Este arquivo é a passagem de bastão entre tarefas. Leia inteiro antes de começar.

## Quem é o operador

- Ricardo, dono da NORQVA. Responder **sempre em português do Brasil**, curto e sem jargão.
- Ele não tem formação técnica: analise a fundo e **recomende ou decida** os parâmetros técnicos você mesmo, explicando em linguagem simples.
- Você pode **mesclar PRs** (merge = deploy no Render).

## Regra de aprovação (D-0037, em vigor desde 10/10/2026 13h47)

**Sem pedir aprovação:** mudanças de tela, texto e conteúdo (inclusive PDFs dos produtos) e correções de erro.

**Com o "Aprovado" do Ricardo antes de começar:** tudo que mexe em
- pagamento (Asaas, Pix, pedidos);
- entrega ao comprador (links, e-mails de acesso, arquivos entregues);
- gasto na Meta (ativar, pausar, orçamento, criar campanha);
- dados de clientes;
- qualquer coisa que não possa ser desfeita (migrations que alteram dados, exclusões).

Na dúvida, trate como "com aprovação".

## Fluxo de mudança no código

1. Se precisar de aprovação: contrato no Claude Docs → "Aprovado" do Ricardo → registrar data e hora no contrato.
2. Branch `ai/NORQVA-00NN-assunto` a partir da `main`.
3. Arquivo de tarefa em `norqva-ai/tasks/NORQVA-00NN.md` (modelo: NORQVA-0036).
4. Commit e PR.
5. Revisão independente por um subagente que não escreveu o código; aplicar as correções.
6. CI verde (é o único teste: não há `node_modules` local).
7. Merge; preencher a seção "Execução" no contrato (quando houver); resposta curta ao Ricardo.

Decisões duradouras vão para `norqva-ai/DECISIONS.md`.

## Regras de segurança (sempre)

- Nunca liberar entrega ou link sem pagamento **PAID confirmado pelo Asaas**.
- CPF criptografado e apagado depois do Pix.
- Nada de Purchase falso nem pagamento simulado apresentado como real.
- Migrations **só aditivas**. Comentários SQL **sem ";"** (o pg-mem dos testes separa por ";"). Reclassificar dados só em bloco `DO $$ ... $$;` com checagem de quantidade (modelo: 028 e 048).
- Tudo nasce **PAUSADO** na Meta. Ativar e gastar dinheiro só com o "sim" do Ricardo; ações de gasto real ficam com ele.
- Não alterar credenciais nem produção sem autorização.
- Testes nunca falam com Meta, Asaas ou Supabase (sempre simulados).
- Não apagar arquivos do computador do Ricardo sem permissão.

## Técnica rápida

- Backend Express + TypeScript + pg + vitest (`backend/`). Frontend React + Vite (`frontend/`). TypeScript estrito.
- Conta real: tudo é `data_provenance = COMMERCIAL_PRODUCTION`; não existe mais modo demo nas telas (D-0034).
- Arquivo entregue ao comprador: troca por ponteiro (`digital_assets.storage_path`), com versões e "Restaurar" (NORQVA-0033). Tela: Produtos → "PDF entregue ao comprador" → "Trocar arquivo".
- Prévia oficial de anúncio da Meta: `GET /api/meta/ads/:adId/preview` (NORQVA-0036).
- Cartão (NORQVA-0038): `POST /api/checkout/orders/:id/card` gera cobrança na página segura do Asaas; entrega na confirmação; estorno/contestação bloqueia downloads.
- GitHub via `gh api` (PR, merge com `merge_method=merge`, reexecutar CI que falhar por infraestrutura).

## Produtos digitais (livros em PDF)

Fontes em `norqva-ai/produtos/`:

- `dolci/`: Dolci della Nonna (27 páginas). `python3 build2.py` gera `DOLCI_DELLA_NONNA.pdf`.
- `trattoria/`: Trattoria em Casa, Edição 2026 (67 páginas, 28 receitas com foto). `python3 build_trattoria.py` gera `TRATTORIA_EM_CASA_EDICAO_2026.pdf`. Textos em `content_trattoria.py`; revisão culinária em `revisao_trattoria.md`.

Precisa de Python com Playwright + Chromium e Pillow. Fotos novas: o Ricardo gera no GPT; avalie cada uma contra a receita (ingredientes visíveis batem com o texto, mesmo cenário: prato creme com borda dourada, linho rosado, mesa escura, luz quente, sem texto, marca ou mãos). Arquivos `.png` colocados em `trattoria/imagens/` são convertidos para `jpg/` no build.

## Estado em 10/10/2026

- Mesclados: NORQVA-0033 (troca do PDF entregue), 0034 (sem modo demo, produtos ocultos), 0035 (editar oferta e produto), 0036 (tela Criativos com prévia da Meta; migration 048 tira do faturamento a compra de teste das 08h18).
- Trattoria nova já trocada na oferta pelo Ricardo (10/10/2026).
- NORQVA-0038: cartão de crédito parcelado (D-0038), kit Cozinha Italiana e página `/kit/<oferta>`.
- NORQVA-0041: comprador escolhe as parcelas (D-0041): até 4x sem juros, acima com 2,99% a.m.; tela de pagamento com `look="light"` (creme/terracota) nos livros de cozinha.

## Pendências (tratar quando o Ricardo trouxer o assunto)

- Reavaliar a OPP-0010 quando o anúncio TR_V1_EMO chegar perto de R$ 150 de gasto.
- Contrato de venda e entrega pelo WhatsApp.
- Conferir no banco que a migration 048 reclassificou o pedido de teste (evento `ORDER_RECLASSIFIED_TEST` em `audit_logs`).
