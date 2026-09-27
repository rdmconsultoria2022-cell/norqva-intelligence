# 12 — DOCUMENTATION VS IMPLEMENTATION AUDIT

Esta seção cruza as afirmações encontradas nos documentos históricos (*Master States* e relatórios de Gates) com o que está efetivamente implementado no código e comprovado por testes.

---

## Matriz Comparativa

| Item / Afirmação Documental | Status de Evidência | Detalhamento da Comparação |
| :--- | :---: | :--- |
| **"Pix real liquidado no Asaas Produção"** | **CONFIRMED_BY_CODE & TEST** | Implementado no `api.ts` e testado em `sprint2_5c_payment.test.ts`. |
| **"Atribuição de UTMs e fbclid ao pedido"** | **CONFIRMED_BY_CODE & TEST** | Implementado em `deterministicAttributionResolver.ts` e Migration 008/011. |
| **"Telemetria de abertura de checkout"** | **CONFIRMED_BY_GIT & TEST** | Adicionado no Gate 17.0B (`e689c88`), Migration 025 e testado. |
| **"Inteligência Demográfica integrada"** | **CONFIRMED_BY_CODE & TEST** | Migration 024 e suítes `gate16_6c` a `gate16_6g`. |
| **"Remediação de Auth sem auto-provisioning"**| **CONFIRMED_BY_GIT & TEST** | Commit `3d1503a` e `gate16_6g_security_auth.test.ts`. |
| **"Geração e publicação 100% autônoma de Ads"**| **CONFLICT_FOUND / PLANNED** | Documentos mencionam 'Autonomous Ad Publisher', mas o código possui trava explícita `META_MUTATION_ENABLED=false`. Nenhuma publicação autônoma está ativa. |
| **"Catálogo multi-produto completo"** | **PARTIALLY_IMPLEMENTED** | O schema suporta múltiplos produtos, mas apenas *Trattoria* e *Bolso Blindado* estão ativos na base. |
