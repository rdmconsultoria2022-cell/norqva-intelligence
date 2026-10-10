# NORQVA-0040: oferta à venda não perde o PDF de entrega

**Branch:** `ai/NORQVA-0040-protege-pdf` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** Ricardo, 10/10/2026 16h59 ("Aprovado") · **Risco:** LOW

## Motivo

Às 14h02 de 10/10/2026 o PDF do Trattoria (OFF-000001) foi desligado pela lixeira de "Arquivos de entrega" (um clique, sem confirmação). A entrega ficou parada até 16h33. Nenhuma venda foi afetada.

## Escopo

- Lixeira de "Arquivos de entrega" pede confirmação.
- Servidor recusa (409) remover o último arquivo de uma oferta ATIVA ou TESTE.
- Migration 054: relatório na auditoria de todas as ofertas reais não arquivadas (OFFER_DELIVERY_CHECK) e destaque OFFER_WITHOUT_PDF para oferta à venda sem PDF. Nada é alterado.
