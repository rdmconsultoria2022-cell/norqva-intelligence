# Ativos Meta — marca Trattoria em Casa (piloto D-0009)

Portfólio empresarial: norqva (2566466360497925)

| Ativo | ID | Criado por | Status | Data | Evidência |
|---|---|---|---|---|---|
| Página do Facebook | 1287452237795325 | Operador | Criada, propriedade do portfólio norqva | 2026-09-30 | Configurações → Páginas (leitura pelo Claude) |
| Instagram @trattoriaemcasa.oficial | 17841424315618975 | Operador | Conectado à Página, propriedade do portfólio norqva | 2026-09-30 | Print do operador: Perfis do Instagram → Ativos conectados |
| Pixel/Dataset | — | Claude (API) | Pendente (Fase C) | — | — |
| WhatsApp | — | Operador | Pendente | — | — |
| Conta de anúncios | — | — | Não necessária por ora (usa act_2887010388338951) | — | — |

Estes valores entram em `brand_meta_assets` pela migration 036 (status LINKED; VERIFIED só após conferência via API na fase C).

## Domínio da marca

- `https://trattoria.norqva.com.br` → redireciona (302) para `/p/OFF-000001`. CNAME no Registro.br para a Vercel, domínio adicionado ao projeto do frontend e a `CORS_ALLOWED_ORIGINS` da API. Conferido em 2026-09-30: página carrega com título "TRATTORIA EM CASA" e preço R$ 19,90.
- Pendente: incluir o domínio em `PUBLIC_COMMERCE_URL_REGEX` quando o NORQVA criar anúncios da Trattoria com esse destino.
