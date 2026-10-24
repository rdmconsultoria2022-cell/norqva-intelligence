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
- `paes/`: Pães & Fermentação Natural, Volume III da coleção (31 páginas, 12 receitas, NORQVA-0055). `python build_paes.py` gera `PAES_E_FERMENTACAO_NATURAL.pdf` e roda no Linux e no Windows. Fotos feitas na KIE (D-0055); revisão em `revisao_paes.md`. Ainda não está à venda. Aprovado pelo Ricardo em 13/10/2026.
- `antipasti/`: Antipasti & Aperitivo, Volume IV (31 páginas, 12 receitas, NORQVA-0059). `python build_antipasti.py` gera `ANTIPASTI_E_APERITIVO.pdf`; `python gerar_fotos.py` gera as fotos na KIE (rodar no computador do Ricardo, onde está a `KIE_API_KEY`). Revisão em `revisao_antipasti.md`. Textos aprovados pelo Ricardo em 13/10/2026; aguardando fotos.
- `risotos/`: Risotos & Polentas, Volume V (31 páginas, 12 receitas, NORQVA-0060). `python build_risotos.py` gera `RISOTOS_E_POLENTAS.pdf`; `python gerar_fotos.py` gera as fotos na KIE (no computador do Ricardo). Revisão em `revisao_risotos.md`. Textos aprovados pelo Ricardo em 13/10/2026; aguardando fotos.
- `coloridas/`: Massas Coloridas, Volume VI (31 páginas, 12 receitas, NORQVA-0078): massa base, 7 cores naturais (ervas, beterraba, tomate, cenoura, repolho roxo, tinta de lula, cacau), listras, ervas prensadas, ravioli bicolor e quatro cores. `python build_coloridas.py` gera `MASSAS_COLORIDAS.pdf`; `python gerar_fotos.py` gera as fotos na KIE (no computador do Ricardo). Revisão em `revisao_coloridas.md`. Aguardando fotos e revisão do Ricardo; ainda sem oferta.
- Venda (NORQVA-0061, D-0061): os três a R$ 19,90 cada, ofertas criadas em RASCUNHO pela migration 062. Página de venda por livro em `frontend/src/features/public/bookPages.ts` (imagens em `frontend/public/images/livros/<livro>/`: capa.jpg e as 3 da galeria). Na página do kit, só livro com oferta ATIVA e listado em `READY_BOOKS` aparece como disponível (`GET /api/public/collection`). Chave fixa do livro em `products.collection_key`. Antes de ativar o IV ou o V: imagens no site + `READY_BOOKS`.

Precisa de Python com Playwright + Chromium e Pillow. Fotos novas: o Ricardo gera no GPT; avalie cada uma contra a receita (ingredientes visíveis batem com o texto, mesmo cenário: prato creme com borda dourada, linho rosado, mesa escura, luz quente, sem texto, marca ou mãos). Arquivos `.png` colocados em `trattoria/imagens/` são convertidos para `jpg/` no build.

## Estado em 10/10/2026

- Mesclados: NORQVA-0033 (troca do PDF entregue), 0034 (sem modo demo, produtos ocultos), 0035 (editar oferta e produto), 0036 (tela Criativos com prévia da Meta; migration 048 tira do faturamento a compra de teste das 08h18).
- Trattoria nova já trocada na oferta pelo Ricardo (10/10/2026).
- NORQVA-0038: cartão de crédito parcelado (D-0038), kit Cozinha Italiana e página `/kit/<oferta>`.
- NORQVA-0046 (D-0046): WhatsApp no NORQVA (menu Vendas → WhatsApp): números até 100, QR Code, conversas, atendente com IA (`services/whatsapp/attendant.ts`), entrega na conversa após PAID, condições de atendimento com versões, resultados. Motor: Evolution API (`EVOLUTION_API_URL`/`EVOLUTION_API_KEY`); IA: `OPENAI_API_KEY`.
- NORQVA-0052 (D-0052): teto editável na aba "Teto e vigia" da campanha (qualquer situação); campanha lucrativa não é pausada no teto, o teto sobe 50% até o teto máximo (padrão 3x o inicial).
- NORQVA-0053 (D-0053): anúncio sem preço (trava em `services/creative/priceInCopy.ts`); preço só na página, no WhatsApp e no pagamento. Item 3 (NORQVA-0054): botão do WhatsApp nas páginas com código de origem (`services/whatsapp/whatsappRefs.ts`, tabela `whatsapp_refs`); aparece só com número conectado e atendente ligado.
- NORQVA-0056 (D-0056): campanha já na Meta → Configuração → "Editar anúncio na Meta" troca link, texto, título e botão (peça nova com o mesmo vídeo no mesmo anúncio; `services/launchPlans/adCreativeSwap.ts`). Pede o código da campanha; sem preço.
- NORQVA-0057 (D-0057): Produtos com todos os campos editáveis (descrição, custo, observações, upsell, cross-sell) e Lixeira: "Excluir"/"Restaurar" com o código digitado (`services/catalog/catalogTrashService.ts`); nada é apagado do banco.
- NORQVA-0058 (D-0058): tela Criativos com Claims recolhíveis, filtro pelo nome da campanha, edição de todo o conteúdo (inclui mecanismo) e lixeira de criativos (`services/creative/creativeTrashService.ts`).
- NORQVA-0062: tela Produtos com filtros (À venda, Em teste, Fora do ar), "Exibir arquivados", busca por nome e marca e modos de exibição (lista, grade, ícones com capa), como na tela Criativos.
- NORQVA-0079 (D-0079): WhatsApp oficial (Cloud API da Meta), etapa 1: contas Meta por marca e ambiente (aba Números → "WhatsApp oficial (Meta)"), `services/whatsapp/metaCloudProvider.ts`, `cloudAccounts.ts` (`providerForNumber`), `cloudWebhook.ts` (`/api/whatsapp/cloud/webhook/:accountId`). Travas: `WHATSAPP_CLOUD_SEND_ENABLED` (padrão bloqueado), `WHATSAPP_CLOUD_ENVIRONMENTS` (padrão TEST), `WHATSAPP_EVOLUTION_ENABLED` (padrão desligada), chave `WHATSAPP_SECRETS_KEY`. Testes simulam a Graph API com `setGraphFetchForTests`.
- NORQVA-0081: sem menu lateral. Topo fixo com perfil (só o nome, abre dados e Sair), logo NORQVA e período; telas numa faixa abaixo no computador; no celular, áreas numa barra fixa embaixo (como o app da XP). Dados do menu em `components/layout/navigation.ts`.
- NORQVA-0080 (D-0080): livro + Dolci por R$ 24,90 (adicional de R$ 5,00 nos 4 livros, seção `BookComboOffer` na página de cada livro), kit de 5 a R$ 29,90, saídas pausadas, +4 livros a R$ 9,90, cartão com 1x sem acréscimo e 2,99% a.m. acima (migration 068).
- NORQVA-0041: comprador escolhe as parcelas (D-0041): até 4x sem juros, acima com 2,99% a.m.; tela de pagamento com `look="light"` (creme/terracota) nos livros de cozinha.

- NORQVA-0082 a 0089 (D-0082, D-0089): redesign NORQVA Premium das telas internas, só apresentação. Tokens `nq-*` no `tailwind.config.js`, peças em `components/ui/premium.tsx` (Section, Surface, Row, StatusPill, Stat, Disclosure, `useIsMobile`). Tabela larga vira lista só no celular (renderiza uma das duas). Financeiro em `dashboard/FinancialResults.tsx`; Equipe e Configurações em `features/settings/SettingsViews.tsx`. Capturas e medições usam o harness local `frontend/harness/` (fora do git).

- NORQVA-0090/0091: abertura NORQVA depois do login (`components/layout/IntroSequence.tsx`, classes `nq-intro-*` em `index.css`): triângulo com fumaça, som "ta-dum" por Web Audio (só toca depois de um toque na página, regra do navegador); enquanto confere a sessão mostra o fundo da abertura, não o login (trava de 4 s).
- NORQVA-0092 (D-0092): gestão da Equipe (só ADMIN): convite por e-mail pelo Supabase (`services/team/teamService.ts`, volta em `/reset-password`), editar nome e perfil, desativar/reativar, travas de administrador. Tela em `features/settings/TeamManagement.tsx`.

- NORQVA-0093 a 0098 (D-0094 a D-0098): Centro de Controle de Campanhas (diagnóstico no Claude Docs "NORQVA-0093"). 0094: segurança (reativar campanha pausada pede o código do plano; rota antiga de troca de link desligada). 0095: central de alertas (sino e pendências, `services/alerts/alertCenterService.ts`). 0096: "Gerenciar campanha" com abas Visão geral, Configurações, Criativos, Resultados e Histórico (`CampaignManage.tsx`, `campaignInsightService.ts`). 0097: fichas de alteração na Meta (`meta_change_requests`, `services/meta/metaChangeService.ts`): "Confirmado pela Meta" só depois de reler; Performance pausa sozinho, o resto espera o administrador. 0098: ver público, descrição do anúncio, trocar o vídeo no ar (criativo aprovado), renomear e data de término do conjunto (`/api/meta-control/:entity/:id/name`, `/api/meta-control/adset/:id/end-time`).
- NORQVA-0099: login, "Esqueci minha senha" e nova senha no visual da abertura (classes `nq-auth-*`, `NorqvaMark` em `IntroSequence.tsx`); `index.html` com carregamento escuro e triângulo (removido nas páginas do comprador /p, /kit, /pedido, /acesso), `manifest.webmanifest` e ícones cinza em `public/icons/`.
- NORQVA-0105: criativos inteiros no celular: prévia da Meta reduzida por igual (`FittedFrame` em `AdLivePreview.tsx`, tamanho do quadro vem de `MetaClient.getAdPreviewFrame`), cards sem rolagem lateral (quebra de nomes longos), arquivo na proporção dele (`CreativePreview.tsx`); `viewport-fit=cover`, `color-scheme` e fundo/`theme-color` do painel `#101010` (`useShellChrome` no `AppShell.tsx`). Harness com Playwright: `npm install` precisa de `npm_config_noproxy=localhost` (o registro só responde pelo proxy) e vídeos de teste em webm (Chromium sem H.264).
- NORQVA-0115 (D-0115): Referências (Criativos → Referências): link ou até 5 prints de página/anúncio; guarda só o esqueleto (`creative_references.structure`) e impressões de 6 palavras (`source_shingles`), nunca texto ou imagem (`services/creative/referenceService.ts`). Trava `CREATIVE_REFERENCES_ENABLED`.
- NORQVA-0116 (D-0116): Geração: de uma referência pronta + produto e oferta, página original (`generated_pages`, `/v/<slug>`) e 3 a 5 anúncios na fábrica (`creatives.generated_page_id`), com checagem de cópia, números, promessas de saúde e preço (`services/creative/generationService.ts`); imagens novas na KIE com `KIE_API_KEY` (`generatedImages.ts`); tela `GenerationView.tsx`. Publicar e tirar do ar: só ADMIN.
- NORQVA-0117 (D-0117): campanha PAUSADA a partir da página gerada publicada (tela de geração → "Criar campanha pausada", só ADMIN): plano de lançamento de sempre (`launch_plans.generated_page_id`, um por página), anúncios de imagem (`adimages`), destino `/v/<slug>`, trava "só PAUSED" (`services/launchPlans/generatedCampaignService.ts`). Ativar só pelo Sim do plano.
- NORQVA-0120 (D-0120): pausa noturna. Todo dia, horário de Brasília, pausa às 00:00 as campanhas ATIVAS de plano com a pausa ligada (padrão ligada; Gerenciar campanha → Configurações, horários editáveis) e reativa às 06:00 só o que ela pausou e ninguém mexeu (até 23:59 se o servidor estava fora). `services/campaigns/nightPauseService.ts`, tabela `night_pause_runs` (uma linha por campanha e noite), agendador a cada 2 min no `index.ts`, fichas com origem NIGHT_PAUSE. Chave `NIGHT_PAUSE_ENABLED=true` liga as pausas novas (desligada, o que já pausou ainda volta).

## Pendências (tratar quando o Ricardo trouxer o assunto)


- WhatsApp (NORQVA-0079): etapa 2 feita (app "NORQVA Atendimento" 2550182755448535, usuário do sistema NORQVA_Backend, chaves no Render, envio liberado só para TEST). Número dedicado +55 31 98585-5642 (phone_number_id 1322512717623181) na WABA "Trattoria em Casa" 1578522077628653, cadastrado no NORQVA como conta TEST "Trattoria — 5642 (homologação)" (destinatário de teste só o 6969). Em 19/10/2026 a ativação (NORQVA-0102, botão "Ativar número" com PIN que o Ricardo guarda) parou em "Conta do WhatsApp Business não verificada": a WABA está em "Análise em andamento" e a verificação da empresa (RDMCONSULTORIA LTDA, CNPJ 44.999.831/0001-94) foi enviada no portfólio Norqva (cerca de 2 dias úteis). Depois: ativar número, ligar atendente, conversa de teste, Pix real só com o "sim" do Ricardo; forma de pagamento na WABA antes de vender; etapa 4 = templates. O número de teste +1 555 não entrega para o Brasil (erro 130497). A Evolution (NORQVA-0046) fica desligada; o cartão antigo "+5531985855642" (Evolution) no NORQVA pode ser excluído.

- Reavaliar a OPP-0010 quando o anúncio TR_V1_EMO chegar perto de R$ 150 de gasto.
- Conferir no banco que a migration 048 reclassificou o pedido de teste (evento `ORDER_RECLASSIFIED_TEST` em `audit_logs`).
