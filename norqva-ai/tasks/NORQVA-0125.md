# NORQVA-0125: atendente não promete fotos sem mandar

**Branch:** `ai/NORQVA-0125-amostras-sem-promessa` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** correção de erro (D-0037), sem mudança em pagamento ou entrega · **Risco:** LOW

## Motivo

Ricardo (25/10/2026 00h49): o atendente respondeu "Vou te enviar algumas fotos de amostra dos nossos livros. Um momento!" e a conversa parou, sem fotos. A regra 6a pedia para "dizer que vai mandar" e a IA respondeu só com texto, sem chamar `send_samples`.

## Escopo

- Regra 6a: chamar `send_samples` na mesma resposta; nunca dizer que vai mandar fotos sem chamar.
- `send_samples` com `offer_code` opcional: sem código, usa o kit completo (senão o primeiro produto com fotos).
- Rede de segurança: se a resposta final promete fotos (`promisesPhotos`) e nenhuma foi posta na fila, a NORQVA manda as do kit, dentro do limite de 4 por conversa.
- Testes em `norqva_0123_whatsapp.test.ts`.
