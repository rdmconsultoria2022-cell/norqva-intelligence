# 14 — OPEN GAPS

## 1. Lacunas Funcionais Abertas

1. **Integração de CAPI (Meta Conversions API) no Backend:**
   * Atualmente, o frontend dispara eventos via Meta Pixel (`metaPixel.ts`). A emissão server-side via CAPI para eventos de `Purchase` agregaria maior resiliência contra adblockers.

2. **Homologação do UI/UX Refresh V1:**
   * O protótipo visual desenvolvido no Gate UI/UX 1.0A está validado localmente, pendente de revisão humana e posterior gate de deploy controlado.

3. **Recuperação Automática de Carrinhos Abandonados:**
   * O evento `CHECKOUT_MODAL_OPENED` e `CHECKOUT_STARTED` registram os abandonos na tabela `funnel_telemetry_events`, mas ainda não há régua de e-mail automatizada para recuperação.

4. **Multi-Tenancy e Gestão de Organizações:**
   * A arquitetura atual é otimizada para a operação direta da NORQVA. Suporte a múltiplas organizações isoladas exigirá evolução no schema de usuários.
