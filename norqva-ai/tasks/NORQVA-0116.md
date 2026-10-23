# NORQVA-0116: Geração (etapa 2): página de venda e anúncios originais a partir de uma referência

**Branch:** `ai/NORQVA-0116-geracao` (a partir da `main`, que já tem a NORQVA-0115)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde e da revisão
**Autorização:** contrato aprovado pelo Ricardo (Claude Docs, recurso "Referências", etapa 2) · **Risco:** MEDIUM (página pública nova no site do comprador; nada muda em pagamento, entrega, Meta ou dados de clientes; trava desligada por padrão)

## Decisão

D-0116. De uma referência PRONTA (só o esqueleto, D-0115) + um produto NOSSO e a oferta dele, o NORQVA escreve uma página de venda original e de 3 a 5 anúncios. A IA recebe só o esqueleto (papel, função e tamanho de cada parte) e os fatos do nosso produto tirados do banco. O dono compara lado a lado, edita, aprova e publica em `/v/<slug>` no site do comprador (acesso.norqva.com.br), com o pagamento do NORQVA.

## Escopo

- Migration 077 (aditiva): tabela `generated_pages` (código `GEN-000001`, referência, produto, oferta, `slug` único, situação DRAFT/APPROVED/PUBLISHED/UNPUBLISHED, `sections` em JSONB, `theme`, `copy_check`, quem aprovou/publicou e quando, lixeira por `deleted_at`, `data_provenance`). Na tabela `creatives`: `reference_id`, `generated_page_id`, `ad_description`, `copy_check` (os anúncios ficam na fábrica de criativos, NORQVA-0005).
- `services/creative/generationService.ts`:
  - Fatos só do banco: nome, categoria e descrição do produto; descrição e bônus da oferta; títulos dos arquivos entregues ("o que você recebe"); promessas APROVADAS (VERIFIED, sem as de preço). Preço e parcelas nunca vão para a IA (a página mostra os da oferta, na hora).
  - Plano: segue as seções da referência. Depoimentos/provas sem prova aprovada viram prévia do conteúdo (ou saem); autoria sem promessa de autoridade, urgência sem promessa de escassez e bônus sem bônus na oferta saem. Sem botão no esqueleto, entra uma chamada no fim. Referência de anúncio: página no modelo padrão; referência de página: anúncio no modelo padrão (gancho tirado do estilo do primeiro título).
  - IA como a etapa 1 (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CREATIVE_AI_MODEL || OPENAI_MODEL || gpt-4o-mini`, JSON com esquema estrito, `max_completion_tokens`, sem temperature; `setGenerationAiForTests`). Prompt em português: simples, honesto, só os fatos, nada de depoimento, número, resultado ou autoridade inventados.
  - Checagem de cada texto (`checkText`): janelas de 6 palavras com a MESMA normalização e hash da etapa 1 (`shingleHashes`) contra as `source_shingles` da referência; número que não aparece nos fatos; promessa de saúde ("perca X kg", "emagreça X", "garantido", "cura", "sem esforço") que não esteja numa promessa aprovada; preço no anúncio (`priceInCopy.ts`). Falhou: gera de novo aquela seção ou anúncio (até 2 vezes); continuou: o campo fica bloqueado com aviso. Se o problema é cópia, o texto é esvaziado (nada parecido com a referência é gravado). Resultado em `copy_check`.
  - Edição manual com problema é recusada (422 com o motivo). Editar ou gerar de novo volta a página para rascunho; página no ar não muda (tirar do ar antes).
  - Aprovar a página (ADMIN): sem campo bloqueado, sem imagem em andamento, com pelo menos um botão. Publicar (ADMIN): aprovada, oferta ATIVA ou TESTE. Tirar do ar (ADMIN). Lixeira e Restaurar (ADMIN; página no ar não vai para a lixeira).
  - Anúncios: gravados na fábrica (`creatives`, `GEN-000001-A1`..., `generation_source = AI_REFERENCE`, situação DRAFT, chave de UTM = código), com as promessas aprovadas que o anúncio diz usar. Aprovar/Rejeitar pelo fluxo da fábrica (`/api/creative-factory/creatives/:id/review`); a fábrica recusa aprovar anúncio com `copy_check.blocked`. Editar/gerar de novo passa pela fábrica (`reviseCreative`: versão nova quando já foi revisado) e a versão nova continua ligada à página. Na lista de criativos a origem aparece como "Referência".
- Imagens (`services/creative/generatedImages.ts`): com `KIE_API_KEY`, imagens novas na KIE (google/nano-banana, `createTask` + `recordInfo`, como os `gerar_fotos.py`), feitas em segundo plano a partir só dos nossos dados (até 4 por página, cerca de 4 créditos cada), guardadas no Supabase Storage (bucket `CREATIVE_IMAGES_BUCKET`, padrão `creative-images`) e mostradas por link assinado. Sem a chave: as imagens que o produto já tem no site (capas e fotos dos livros) e o aviso "Imagens novas desligadas (falta KIE_API_KEY)". Imagem da referência nunca é usada. Imagem presa por mais de 15 minutos vira "falhou".
- Rotas (`controllers/generationController.ts`), atrás da trava `CREATIVE_REFERENCES_ENABLED`: `POST /api/creative-references/:id/generate`, `GET /api/generated-pages` e `/:id`, `PATCH /api/generated-pages/:id/sections/:order`, `POST .../sections/:order/regenerate`, `PATCH /api/generated-pages/:id/ads/:creativeId`, `POST .../ads/:creativeId/regenerate` (ADMIN e CREATIVE); `POST /:id/approve`, `/publish`, `/unpublish`, `DELETE /:id`, `POST /:id/restore` (ADMIN). `GET /api/creative-references/status` diz também se há KIE.
- Pública: `GET /api/public/generated-pages/:slug` só devolve página PUBLICADA (e com a oferta à venda), só com título, tema, código da oferta, pixel da marca e as seções (papel, título, texto, lista, botão, imagem).
- Tela pública `/v/:slug` (`features/public/GeneratedPage.tsx`): visual das páginas do comprador ('light' creme e terracota; 'fresh' para o Seca Barriga), botões para `/p/<oferta>?checkout=1` mantendo UTMs e fbclid, botão fixo no celular. Rota pública no `App.tsx`, PageView da Meta como em /p e /kit (`isPublicCommercialRoute`), `index.html` sem a marca interna.
- Tela Criativos → Referências: numa referência pronta, "Gerar página e anúncios" (produto, oferta, quantos anúncios, imagens novas quando há KIE) e a lista das gerações. Tela de geração (`GenerationView.tsx`): no computador, esqueleto da referência à esquerda e nossa seção editável à direita; no celular, uma embaixo da outra (`useIsMobile`). Selo por campo ("Original" ou o motivo do bloqueio), Salvar e "Gerar de novo" por seção e por anúncio, Aprovar página / Publicar / Tirar do ar (ADMIN), Aprovar / Rejeitar anúncio (ADMIN, fluxo da fábrica).

## Variáveis de ambiente

- Usa `CREATIVE_REFERENCES_ENABLED`, `OPENAI_API_KEY` (e `OPENAI_BASE_URL`, `CREATIVE_AI_MODEL`, opcionais) da etapa 1.
- `KIE_API_KEY` (opcional): liga as imagens novas. Sem ela, a página usa as imagens do produto.
- `CREATIVE_IMAGES_BUCKET` (opcional, padrão `creative-images`): bucket do Supabase Storage para as imagens novas (precisa existir; privado serve, as imagens saem por link assinado). Usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## Revisão independente (aplicada)

- Aprovação pela fábrica confere o anúncio gerado de novo, na hora (`setGeneratedAdChecker`); edição e versão nova pela fábrica levam a ligação e marcam a checagem como vencida; troca de oferta também. `reviseCreative` grava checagem e descrição na mesma operação.
- Preço e parcelas da página vêm da oferta na hora (`livePriceBlock` com `publicCardTerms`, extraído para `services/commerce/cardTerms.ts` sem mudar a conta); a IA não recebe nem escreve preço, parcelas ou o prazo legal (frase fixa na garantia).
- Números comparados inteiros (com unidade) e por extenso; padrões de saúde ampliados; promessa aprovada só vale inteira; lista conferida também com os itens juntos.
- Depoimentos, resultados e autoria só com o texto das promessas aprovadas (seção fixa); urgência sai sempre.
- CTA repassa só utm_*, fbclid, gclid, ref e src. ViewContent no pixel da marca. Endereço inválido não quebra. Botão fixo respeita a área segura do celular. Roteiro do anúncio editável.
- Limite de 10 gerações e 30 "Gerar de novo" por pessoa por hora; novas tentativas em paralelo (até 3).
- Gravação com versão (`generated_pages.version`); imagem grava só a sua vaga. Bucket conferido antes de usar a KIE. Links assinados guardados por 50 minutos. Página e anúncios numa transação, slug repetido tenta de novo.
- Produto e oferta de demonstração ou excluídos ficam de fora (geração e página pública).

## Fica para depois

- Vídeo (roteiro já sai no anúncio; gerar o vídeo não faz parte desta etapa).
- Subir os anúncios aprovados para a Meta (esta etapa não fala com a Meta).

## Regras

Nada da referência entra no material: só o esqueleto e as impressões de 6 palavras para conferir. Nada de depoimento, número, resultado ou autoridade inventados. Anúncio sem preço. Testes nunca falam com a OpenAI, a KIE, o Supabase ou a Meta.
