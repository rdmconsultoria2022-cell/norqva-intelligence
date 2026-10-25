# NORQVA-0127: Imagens do Kit de Bordado nos anúncios

**Branch:** `ai/NORQVA-0127-imagens-bordado` (a partir da `main`)
**Executor:** Claude · **Autorização:** correção de erro e conteúdo (D-0037, sem aprovação prévia) · **Risco:** LOW

## Contexto

Em 25/10/2026 01h17 o Ricardo tentou "Criar pausada" a campanha da página GEN-000001 (Bordado) e recebeu "Anúncio GEN-000001-A1 sem imagem": a página foi gerada sem KIE e o produto não tinha imagens no site.

## Escopo

- 4 imagens 1080×1080 tiradas do próprio PDF do kit (NORQVA-0126) em `frontend/public/images/bordado/` (capa, riscos, bichinhos, pontos). Sem preço e sem texto de oferta.
- `productImages` (`generatedImages.ts`): produto com "bordado" no nome usa essas imagens. `imageStyle` continua neutro para o bordado (não é foto de comida).
- `adImageRefs` (`generatedCampaignService.ts`): os anúncios usam as imagens da página; se a página não tem nenhuma, usam as imagens do produto no site. Vale para a tela e para a criação.
- Teste em `norqva_0117_campaign.test.ts`.

## Regras

Nada muda em pagamento, entrega ou gasto. A campanha continua nascendo PAUSADA.
