# NORQVA-0112: Seca Barriga no checkout do NORQVA

**Pedido e autorização:** contrato "NORQVA-0112 — Contrato: Seca Barriga no checkout do NORQVA" no Claude Docs; "Aprovado" do Ricardo em 22/10/2026 15h22. Vender o "Desafio Seca Barriga 21 Dias" (R$ 37,00, 10 PDFs) pelo checkout do NORQVA (Asaas, Pix e cartão) no lugar da Kiwify. O tráfego vem do quiz externo (https://norqva-seca-barriga.netlify.app), cujo botão final passa a abrir a oferta no NORQVA. **Risco:** MEDIUM (pagamento e entrega de um produto novo; a regra "entrega só com PAID confirmado pelo Asaas" não mudou).

**O que mudou:**
1. **Link direto do pagamento:** `/p/<oferta>?checkout=1` abre o pagamento assim que a oferta carrega, com nome, e-mail e telefone vindos do link (`name`, `email`, `phone`; telefone `55` + DDD + número vira DDD + número). A pessoa só confere e digita o CPF. Nome, e-mail e telefone saem da barra de endereço na hora (não vão para o Pixel, a telemetria nem o endereço gravado no pedido); `checkout=1`, UTMs, `fbclid` e `src` ficam e entram no pedido como numa visita normal (`utm_*`, `fbclid`/`fbc` nas colunas do pedido; `utm_term` e `src` em `attribution_metadata`). Atrás do pagamento fica um fundo neutro com nome, preço e "Continuar para o pagamento" (reabre se a pessoa fechar), sem o material de venda dos livros. Sem `checkout=1` as páginas dos livros não mudam; a oferta do Seca Barriga mostra sempre o fundo neutro (não tem página de venda própria no NORQVA).
2. **Visual "fresh"** quando o nome da oferta tem "Seca Barriga": fundo #F7F8F4, cartões brancos, texto #18211C, botão em degradê verde #10B981→#059669 com texto branco, destaque #F0795B, fonte Inter. Vale para o pagamento, a tela do Pix/cartão, a página do pedido e a tela de download (lista dos PDFs em ordem 01→05). Livros de cozinha continuam "light" e o Bolso Blindado "dark" (`lib/productLook.ts`).
3. **Vários PDFs numa oferta comum:** a entrega já liga todos os arquivos da oferta ao pedido quando ele vira PAID (não é só para o kit). Faltava subir mais de um PDF pela API: novo `POST /api/offers/:id/delivery-files/extra` (só ADMIN), mesmo caminho seguro do primeiro arquivo, até 20 por oferta, recusa o mesmo PDF duas vezes. Auditoria `DELIVERY_FILE_ADDED`. O checkout não trata mais uma oferta de 5+ PDFs como "kit de livros" quando é o Seca Barriga.
4. **Remetente do e-mail:** já vem da marca do produto (NORQVA-0107, `products.brand_id` → `brands.name`). Com o produto ligado à marca "Seca Barriga 21 Dias", o e-mail sai como "Seca Barriga 21 Dias <acesso@mail.norqva.com.br>".

**Arquivos:** frontend `lib/productLook.ts` (novo), `features/checkout/checkoutPrefill.ts` (novo), `PublicOfferPage.tsx`, `CheckoutView.tsx`, `checkoutTypes.ts`, `collectionChoice.ts`, `PaymentStatus.tsx`, `paymentTypes.ts`, `OrderDeliveryView.tsx`, `DigitalDelivery.tsx`, `services/attribution.ts` (`src`), `App.tsx`; backend `services/delivery/deliveryFileService.ts`, `controllers/deliveryFilesController.ts`, `index.ts`. Testes `norqva_0112_seca_barriga.test.tsx` e `norqva_0112_seca_barriga.test.ts`. Sem migration.

## Cadastro depois do deploy (administrador, pela API)

Base: `https://norqva-staging-api.onrender.com/api`. Cabeçalho em todas: `Authorization: Bearer <token de sessão do Supabase de um usuário ADMIN>` (conta real, sem `?mode=demo`). Nada disso foi criado ainda.

| # | Chamada | Corpo | Perfil |
|---|---|---|---|
| 1 | `POST /brands` | `{"name": "Seca Barriga 21 Dias"}` → 201 `{id, code: "SECA_BARRIGA_21_DIAS"}` | ADMIN |
| 2 | `POST /products` | `{"name": "Desafio Seca Barriga 21 Dias", "category": "Emagrecimento", "description": "Desafio de 21 dias: guia, livro de receitas, 6 cardápios e 2 bônus (10 PDFs)."}` → 201 `{product: {id, human_id}}` | PRODUCT ou ADMIN |
| 3 | `PUT /brands/<brand.id>/products/<product.id>` | `{}` → 200 `{brand_id}` (liga o produto à marca: remetente do e-mail) | ADMIN |
| 4 | `POST /offers` | `{"product_id": "<product.id>", "name": "Desafio Seca Barriga 21 Dias", "price": 37, "description": "Desafio Seca Barriga 21 Dias: 10 PDFs liberados depois do pagamento confirmado."}` → 201 `{offer: {id, human_id, status: "RASCUNHO"}}`. O nome precisa ter "Seca Barriga" (visual). | PRODUCT ou ADMIN |
| 5 | `PUT /offers/<offer.id>` | `{"card_enabled": true, "card_max_installments": 10, "card_free_installments": 1, "card_interest_monthly": 2.99, "card_total_price": null}` (mesmas regras dos livros: 1x sem acréscimo, até 10x com 2,99% a.m.) | PRODUCT ou ADMIN |
| 6 | `POST /offers/<offer.id>/delivery-files/extra?title=<nome que o comprador vê, URL-encoded>` × 10 | Corpo = bytes do PDF; `Content-Type: application/pdf`; `X-File-Name: <nome do arquivo>` → 201 `{asset_id, name}` | ADMIN |
| 7 | `GET /offers/<offer.id>/delivery-files` | conferir 10 arquivos; `GET /digital-assets/<asset_id>/check-link` abre cada um por 5 min | ADMIN |
| 8 | `PUT /offers/<offer.id>` | `{"status": "ATIVA"}` | PRODUCT ou ADMIN |

Os 10 arquivos (≈3,3 MB) e o nome sugerido (`title`):

| Arquivo (`X-File-Name`) | `title` |
|---|---|
| 01_Guia_do_Desafio.pdf | 01 · Guia do Desafio |
| 02_Livro_de_Receitas.pdf | 02 · Livro de Receitas |
| 03_Cardapio_Acumulador_Padrao.pdf | 03 · Cardápio Acumulador — Padrão |
| 03_Cardapio_Acumulador_Economico.pdf | 03 · Cardápio Acumulador — Econômico |
| 03_Cardapio_Inflamado_Padrao.pdf | 03 · Cardápio Inflamado — Padrão |
| 03_Cardapio_Inflamado_Economico.pdf | 03 · Cardápio Inflamado — Econômico |
| 03_Cardapio_Lento_Padrao.pdf | 03 · Cardápio Lento — Padrão |
| 03_Cardapio_Lento_Economico.pdf | 03 · Cardápio Lento — Econômico |
| 04_Bonus_30_Sobremesas.pdf | 04 · Bônus: 30 Sobremesas |
| 05_Bonus_30_Sucos_e_Chas.pdf | 05 · Bônus: 30 Sucos e Chás |

Exemplo (um arquivo): `curl -X POST "$API/offers/$OFFER_ID/delivery-files/extra?title=01%20%C2%B7%20Guia%20do%20Desafio" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/pdf" -H "X-File-Name: 01_Guia_do_Desafio.pdf" --data-binary @01_Guia_do_Desafio.pdf`

**Botão final do quiz:** `https://norqva-intelligence-frontend.vercel.app/p/<offer.human_id>?checkout=1&name=<nome>&email=<e-mail>&phone=<55DDDnúmero>&src=quiz` mais as UTMs e o `fbclid` que o quiz recebeu (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`), tudo URL-encoded.

**Antes de vender:** uma compra real de R$ 37,00 no Pix só com o "sim" do Ricardo; conferir a entrega dos 10 PDFs e o e-mail com o remetente da marca.

## Pontos em aberto (para o Ricardo)

- **Repositório público:** o repositório do NORQVA no GitHub é **público**, e `backend/public/products/` tem os PDFs pagos do Trattoria (`TRATTORIA_EM_CASA_FINAL.pdf`, `TRATTORIA_EM_CASA_PREMIUM_FINAL.pdf`, `..._BACKUP_V1.pdf`): qualquer pessoa pode baixá-los de graça. Não apagamos nada. Opções: deixar o repositório privado (o mais simples) ou tirar esses arquivos do git. Os PDFs do Seca Barriga **não** entram no repositório (vão direto para o armazenamento pela chamada 6).
- **Pixel:** a marca nova não tem pixel próprio; as compras vão para o pixel padrão (`META_PIXEL_ID`). Se as campanhas do Seca Barriga usam outro pixel, é preciso registrar e conferir o pixel da marca (D-0009) antes de anunciar.
- **Texto do e-mail de acesso:** o modelo da NORQVA-0107 diz "Seu livro" e "Baixar meu livro"; no Seca Barriga isso aparece igual. Ajuste de texto pode ser uma tarefa curta separada.
