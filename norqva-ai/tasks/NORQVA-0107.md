# NORQVA-0107: e-mail de acesso que o comprador reconhece e lembrete de download

**Pedido e autorização:** contrato "NORQVA-0107 a 0109 — Contrato" no Claude Docs; Ricardo: "2 sim" em 21/10/2026 20h12 (investigar e corrigir a entrega aos compradores). **Risco:** MEDIUM (e-mail para compradores pagos; não mexe em cobrança).

**Problema:** compradores pagam e não baixam o livro. O e-mail automático de acesso consta como enviado (Resend), mas sai como "NORQVA <acesso@mail.norqva.com.br>", com visual escuro e técnico, enquanto a pessoa comprou "Trattoria em Casa". Ela não reconhece o remetente, o e-mail cai no spam ou passa despercebido.

**Evidência (produção, 21/10/2026, sem dados pessoais):**
- 15 de 36 compradores reais pagos nunca baixaram (nenhum download).
- O acesso foi reenviado à mão 33 vezes.
- Nunca baixaram, por provedor: Microsoft (hotmail/outlook/live) 5 de 7, Gmail 7 de 21, Yahoo 2 de 5, UOL/BOL 1 de 4.
- DNS: SPF e DKIM existem para mail.norqva.com.br, mas não há registro DMARC.

**O que mudou:**
1. **Remetente com o nome da marca:** o e-mail de acesso (automático, "Reenviar acesso" da tela Vendas, recuperação de acesso e lembrete) sai com o nome da marca do produto principal do pedido, no mesmo endereço (ex.: "Trattoria em Casa <acesso@mail.norqva.com.br>"). Sem marca, "NORQVA". O nome é limpo (sem < >, aspas e quebras de linha; até 60 caracteres).
2. **E-mail de compra claro e amigável:** fundo creme, texto escuro, botão terracota "Baixar meu livro", o link escrito embaixo do botão, a validade e a dica "Não achou este e-mail depois? Procure em Spam ou Lixo eletrônico e marque como “Não é spam”." Assunto: "Seu acesso a <livro> está pronto". A marca aparece no topo no lugar de "NORQVA". A recuperação de acesso continua com o texto de antes (só muda o remetente).
3. **Lembrete de download automático:** na varredura de pagamentos (a cada 5 minutos), para quem pagou e não baixou nada: etapa 1 três horas depois da confirmação do pagamento, etapa 2 vinte e quatro horas depois. No máximo esses dois por pedido; se os dois já venceram (pedido mais antigo), vai só a etapa 2, uma vez. Entre dois lembretes do mesmo pedido passam pelo menos 12 horas. Cada lembrete leva um link NOVO (o link de reenvio anterior deixa de valer). Assunto: "Você ainda não baixou <livro>".
   - Só conta real (`is_demo = false`, `COMMERCIAL_PRODUCTION`), pedido PAID com pagamento confirmado pelo Asaas entre 3 horas e 30 dias atrás, com e-mail, sem nenhum download, sem estorno e sem entrega bloqueada.
   - Registro em `order_download_reminders` (migration 073, aditiva): uma linha por pedido e etapa, reservada como SENDING antes do envio (nunca em dobro; confere de novo, na hora, que segue sem download), depois SENT ou FAILED. Falha não é repetida. Auditoria `DOWNLOAD_REMINDER_SENT` / `DOWNLOAD_REMINDER_FAILED`, sem o e-mail do comprador.
   - Os compradores atuais que nunca baixaram (pagos nos últimos 30 dias) recebem exatamente um lembrete (etapa 2) no primeiro ciclo depois do deploy. Aprovado.

**Chave:** `DOWNLOAD_REMINDER_ENABLED=false` desliga o lembrete (padrão: ligado). Em produção sem o Resend configurado, não envia.

**Arquivos:** `services/emailSender.ts` (novo: nome da marca e remetente), `services/downloadReminderService.ts` (novo), `services/resendProvider.ts` (e-mail claro; recuperação em `buildRecoveryAccessEmail`), `services/emailService.ts` (`senderName`, tipo `DOWNLOAD_REMINDER`), `services/purchaseAccessService.ts`, `services/salesService.ts`, `controllers/api.ts` (recuperação), `services/paymentSweepService.ts` (item 6), migration 073, teste `norqva_0107_delivery_email.test.ts`.

**Conferir depois do deploy:** linhas em `order_download_reminders` com status SENT e, nos dias seguintes, a contagem de pedidos pagos sem download caindo.

## Para o Ricardo

Falta um ajuste no DNS que só você pode fazer, no Registro.br (zona de norqva.com.br), novo registro:

- Tipo: **TXT**
- Nome (host): **_dmarc** (fica `_dmarc.norqva.com.br`)
- Valor: **v=DMARC1; p=none; adkim=r; aspf=r**

Em uma linha: esse registro diz ao Gmail, Outlook e Yahoo que os e-mails da NORQVA são legítimos e verificados, o que ajuda a sair do spam; com `p=none` nada é bloqueado.
