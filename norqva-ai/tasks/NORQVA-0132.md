# NORQVA-0132: WhatsApp 5642 atendendo também o Kit de Bordado

**Branch:** `ai/NORQVA-0132-whatsapp-bordado` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 25/10/2026 02h31 ("aprovado"), contrato no Claude Docs "NORQVA-0132 — WhatsApp 5642 atendendo também o Kit de Bordado" · **Risco:** MEDIUM (o atendente passa a cobrar outra oferta; regras de pagamento e entrega iguais)

## Escopo

- Migration 084 (só aditiva): `whatsapp_number_brands` e `whatsapp_conversations.focus_brand_id`.
- `whatsappService.ts`: `extra_brand_ids` no número (listar e editar; não vale para o oficial; marca principal sai da lista).
- `whatsappRefs.ts` (`whatsappNumberForOffer`): número atende a oferta da marca principal ou de uma marca extra.
- `attendant.ts`: `conversationTopic` (escolha gravada → código da página → anúncio de plano → marca principal; sem origem pergunta), `loadCatalog` por lista de marcas, catálogo agrupado por assunto, regra fixa de não misturar, `lockTopic` ao mandar fotos ou cobrar, sem fotos por adivinhação.
- `samples.ts`: fotos do bordado (as 4 do PDF).
- Página gerada (`GeneratedPage.tsx`): "Quero pelo WhatsApp" na abertura e na oferta, mais o flutuante (`WhatsAppButton`, `FloatingWhatsApp`); API pública com `whatsapp`.
- Tela Vendas → WhatsApp → Editar: "Também atende as marcas".
- Testes: `norqva_0132_whatsapp_multibrand.test.ts` (servidor), `norqva_0132_whatsapp_page.test.tsx` (página).

## Para funcionar no Bordado

1. Vendas → WhatsApp → 5642 → Editar → marcar "Kit de Bordado Norqva".
2. Oferta OFF-000015 em ATIVA (À venda): oferta em TESTE não entra no atendimento.
3. Perfil do WhatsApp "NORQVA Atendimento" (no celular).
