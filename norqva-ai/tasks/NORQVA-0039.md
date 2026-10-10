# NORQVA-0039: criar o Kit Cozinha Italiana fora do ar

**Branch:** `ai/NORQVA-0039-kit-dados` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** Ricardo, 10/10/2026 16h07 ("Aprovado"), etapas 2 e 3 do contrato NORQVA-0038 · **Risco:** MEDIUM (dados de produção, oferta fora do ar)

## Escopo

Migrations 050 e 051 (bloco DO, só insere): produto "Kit Cozinha Italiana" (categoria e marca do Trattoria), oferta em RASCUNHO de R$ 34,80 por R$ 27,90, cartão 4x com total R$ 27,96, e os PDFs já existentes do Trattoria (OFF-000001) e do Dolci della Nonna ligados à oferta. Só age se achar exatamente uma oferta de cada livro, cada uma com exatamente um PDF, e se o kit ainda não existir; senão registra `KIT_CREATE_SKIPPED` com o motivo.

## Fora de escopo

Ativar a oferta (Ricardo, pela tela). Compra de teste (Ricardo).

## Execução

- 050 rodou em 10/10/2026 16h18 e não criou nada: a oferta OFF-000001 não tem PDF (a oferta que vende o Trattoria é outra).
- 051 acha as ofertas pelos produtos PRD-000003 (Trattoria) e PRD-000006 (Dolci, oferta OFF-000005), com as mesmas travas.
- 051 rodou às 16h31 (antes do PDF do Trattoria ser enviado pela tela às 16h33). 052 repete a 051.
