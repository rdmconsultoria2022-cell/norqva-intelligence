# NORQVA-0133: página do Bordado mais atraente (bastidores bordados)

**Branch:** `ai/NORQVA-0133-bordado-pagina-atraente` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** conteúdo e tela (D-0037, sem aprovação prévia); pedido do Ricardo em 25/10/2026 02h50 ("precisamos formatar essa pagina para ficar mais atraente") · **Risco:** LOW

## Contexto

A página `/v/bordado-b4d48e` só mostrava traço a lápis (riscos e páginas do PDF): bonito, mas sem mostrar como fica a peça bordada.

## Escopo

- `norqva-ai/produtos/bordado/gerar_imagens_site.py`: os riscos do próprio kit (`motifs.py`) "bordados" com linha colorida em ponto atrás, num bastidor de madeira sobre linho. Ilustração feita em código, sem foto e sem nada de terceiros. Gera `frontend/public/images/bordado/bastidor_*.jpg` e `colecao.jpg` (três bastidores).
- `productImages` (bordado): capa, coleção, gato, pontos, borboleta, monograma, frase, riscos. A página usa a capa na abertura, a coleção no cartão da oferta e as outras nas seções e na galeria "Veja por dentro"; os anúncios novos também.
- Testes 0117 e 0129 usam `BORDADO_IMAGES`.

Nada muda em pagamento, entrega ou gasto. A campanha já criada na Meta continua com as imagens dela.
