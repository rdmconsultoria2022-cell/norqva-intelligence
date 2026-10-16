# NORQVA-0085: tela Vendas no Design System NORQVA Premium (fase 4, etapa 4)

**Branch:** `ai/NORQVA-0085-vendas-premium` (a partir da `main`, depois da NORQVA-0084)
**Executor:** Claude · **Revisão:** revisão independente (subagente) + CI · **Merge:** só com o "sim" do Ricardo depois das capturas
**Autorização:** Ricardo, 16/10/2026 18h15 ("Pode"). · **Risco:** LOW (só apresentação)

## Escopo

- Lista no formato de extrato: pedidos agrupados por dia (Hoje, Ontem, data), com o total pago do dia; cada pedido mostra cliente, hora, produto (+ adicional), valor e situação do pagamento; "Com problema" destacado.
- Ao tocar: contato, produto e adicionais, entrega, e-mail de acesso, data, código do pedido e as ações (Conferir pagamento, Reenviar acesso, Copiar link), só para ADMIN, como antes.
- Resumo (receita, pagos, pedidos, com problema), filtros em botões e "Mostrar pedidos de teste" com área de toque maior.

## Regras respeitadas

Mesmas chamadas (`/sales/orders`, `check-payment`, `resend-access`, `access-link`), mesmas condições para cada ação e mesmo controle de perfil. Os dados do comprador são os mesmos que já apareciam (e-mail e telefone, sem os marcados como ocultos).

## Testes

Atualizado `norqva_0026_sales_view`: o detalhe e as ações aparecem depois de tocar no pedido; rótulos em letras normais ("Vencida", "E-mail falhou").
