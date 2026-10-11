# NORQVA-0047: botão "Testar servidor" do WhatsApp

**Branch:** `ai/NORQVA-0047-whatsapp-teste-servidor` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** correção de erro e tela (D-0037) · **Risco:** LOW

## Motivo

Ricardo (11/10/2026 07h52): ao conectar o primeiro número apareceu "Servidor do WhatsApp respondeu com erro: status 404". O 404 vem do endereço configurado (EVOLUTION_API_URL), não do número, e a mensagem não dizia o que corrigir.

## Escopo

- `checkEvolutionServer()`: confere variáveis, se o endereço responde, se é mesmo a Evolution API (mensagem e versão) e se a senha confere; explica cada problema em português.
- Rota `GET /api/whatsapp/server-check` (ADMIN) e botão "Testar servidor" na aba Números.
- Mensagens de erro mais claras para 404 ao criar o número e para senha recusada.
