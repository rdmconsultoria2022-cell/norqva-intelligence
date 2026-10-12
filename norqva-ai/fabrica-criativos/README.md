# Fábrica de criativos NORQVA

Versão do **Criativos Infinitos v2.2** adaptada para o NORQVA (contrato NORQVA-0053, D-0053).

- `SKILL.md`: as **Regras NORQVA** e o passo a passo. Valem acima de tudo nesta pasta.
- `INSTALL.md`: instalação e como gerar um pacote.
- `scripts/`: raspagem da Biblioteca de Anúncios (`scrape.py`, sempre sem login), geração na KIE
  (`gen.py`: imagens, b-roll mudo e música), travas (`norqva_guard.py`: preço) e montagem dos
  anúncios mudos (`build_mudo.py`).
- `templates/edit-template/`: projeto Remotion. Composição `AdMudo` (`src/Mudo.tsx`), com as cores
  creme e terracota dos livros de cozinha.

## O que mudou em relação ao original

| Original | NORQVA |
|----------|--------|
| Pessoas de IA falando, UGC e depoimentos | Proibido. Anúncios mudos de comida; voz só se for REAL |
| Troca para geradores permissivos quando o Google recusa | Removida: recusa = parar e avisar |
| "Princípio Zero" (replicar o registro do nicho sem filtro) | Substituído pelas Regras NORQVA |
| Preço livre no roteiro | Proibido; `gen.py` e `build_mudo.py` recusam |
| Raspagem da Biblioteca de Anúncios | Mantida (decisão do Ricardo), sempre sem login |
