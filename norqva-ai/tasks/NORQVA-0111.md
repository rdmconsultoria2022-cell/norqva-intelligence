# NORQVA-0111: registrar à mão uma venda antiga da Kiwify

**Pedido e autorização:** parte da NORQVA-0110 (vendas da Kiwify no NORQVA), aprovada pelo Ricardo em 21/10/2026 20h52. A Kiwify não tem a opção de reenviar o aviso de uma venda já feita (Ricardo, 21/10/2026 23h10). **Risco:** LOW (só administrador; mesma gravação do aviso).

**O que muda:** `POST /api/admin/external-sales/kiwify`, só ADMIN, recebe o mesmo formato do aviso da Kiwify e grava pela mesma função (`recordKiwifyEvent`): sem duplicar, sem CPF ou telefone. Auditoria `KIWIFY_SALE_IMPORTED_MANUAL`. Evento sem efeito responde 422.

**Uso:** trazer a venda de 21/10/2026 06h54 (feita antes do aviso existir), com os dados da tela de Vendas da Kiwify e a atribuição que a Meta deu à venda.

**Arquivos:** `controllers/kiwifyController.ts`, `index.ts`, teste em `norqva_0110_kiwify_sales.test.ts`.
