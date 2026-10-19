# Ativos Meta — marca Trattoria em Casa (piloto D-0009)

Portfólio da operação: **Norqva (1361471345973932)** — conta de anúncios, app, usuário de sistema NORQVA_Backend e pixels.
Portfólio de origem da Página e do Instagram: norqva (2566466360497925), compartilhados com o Norqva como parceiro.

| Ativo | ID | Criado por | Status | Data | Evidência |
|---|---|---|---|---|---|
| Página do Facebook | 1287452237795325 | Operador | **Conferido na Meta** (client_pages do Norqva, atribuída ao NORQVA_Backend) | 2026-10-01 | Tela Marcas → Conferir na Meta |
| Instagram @trattoriaemcasa.oficial | 17841424315618975 | Operador | **Conferido na Meta** (conta profissional, conectada à Página, atribuída ao NORQVA_Backend) | 2026-10-01 | Tela Marcas → Conferir na Meta |
| Pixel/Dataset "Trattoria em Casa (NORQVA)" | 1451147833528630 | Operador (Gerenciador de Eventos) | **Conferido na Meta**, dono Norqva; roteamento de vendas **desligado** | 2026-10-01 | Tela Marcas → Conferir na Meta |
| WhatsApp | — | Operador | Pendente | — | — |
| Conta de anúncios | — | — | Não necessária por ora (usa act_2887010388338951) | — | — |

Estes valores entram em `brand_meta_assets` pela migration 036 (status LINKED; VERIFIED só após conferência via API na fase C).

## Domínio da marca

- `https://trattoria.norqva.com.br` → redireciona (302) para `/p/OFF-000001`. CNAME no Registro.br para a Vercel, domínio adicionado ao projeto do frontend e a `CORS_ALLOWED_ORIGINS` da API. Conferido em 2026-09-30: página carrega com título "TRATTORIA EM CASA" e preço R$ 19,90.
- Pendente: incluir o domínio em `PUBLIC_COMMERCE_URL_REGEX` quando o NORQVA criar anúncios da Trattoria com esse destino.

## Notas de 2026-10-01

- Criação do pixel pela API recusada (`MANAGE_PIXELS_AUDIT_NEEDED`): o NORQVA_Backend é "Funcionário" no portfólio. Decisão: não promover a Administrador; pixels de marca são criados à mão e registrados na tela Marcas.
- Um primeiro pixel (961273499742110) foi criado fora do Norqva, ligado à conta de anúncios 1571694961304571. Não usado.
- Token do NORQVA_Backend regenerado com: ads_management, ads_read, business_management, pages_manage_ads, pages_read_engagement, pages_show_list, threads_business_basic, instagram_basic (+ instagram_content_publish). App NORQVA recebeu os casos de uso "Gerenciar mensagens e conteúdo no Instagram" (API com login do Facebook) e "Gerenciar tudo na sua Página".
- Pendente: atribuir o NORQVA_Backend ao pixel padrão NORQVA WEB DATA (1049452567443586), que estava com 0 pessoas atribuídas.
