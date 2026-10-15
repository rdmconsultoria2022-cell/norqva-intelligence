# NORQVA-0070: página do kit com livros em 3D e movimento

**Pedido:** Ricardo, 15/10/2026: os livros perderam o aspecto 3D na página `/kit/<oferta>`; análise da estrutura e versão mais profissional, com movimento responsivo. **Autorização:** mudança de tela (D-0037). Preço, parcelas, checkout e entrega não mudam. **Risco:** LOW

**Análise (antes):** no kit de 5 livros, o leque da oferta era pequeno (30% da coluna por livro), com inclinação fixa e sem lombada; a coleção mostrava capas chapadas (`.cov`); a página era estática; o topo tinha 3 colunas sem hierarquia clara; o cabeçalho não ficava fixo; a capa dos Pães era só uma foto, sem título.

**Mudanças** (`KitLandingPage.tsx`, novo `kitMotion.tsx`, `capa.jpg` dos Pães):
- `Book3D`: livro em 3D de verdade (capa, lombada, borda das páginas, fundo, brilho e sombra no chão); flutua devagar e inclina ao passar o mouse. `BookStack`: leque de 5 (ou 2) livros que reage ao mouse com profundidade (parallax) e, sem mouse, só flutua.
- Topo refeito: texto + botão + 3 garantias à esquerda, leque grande à direita, pratos flutuantes. Faixa de números animados (74 receitas, 5 livros, 187 páginas, 7 dias). Bloco "Do forno à mesa" (foto da nonna e pratos).
- Coleção com livros 3D; "Por dentro" com inclinação ao passar o mouse; galeria com zoom; oferta com leque grande; botões com brilho.
- Movimento ao rolar (entrada dos blocos), barra de progresso, cabeçalho fixo com desfoque, parallax no fecho e barra de compra fixa no celular (aparece depois do topo e some quando a oferta está na tela).
- Respeita "reduzir movimento" do aparelho e, sem IntersectionObserver, mostra tudo parado e completo. Só `transform` e `opacity`.
- Capa dos Pães regenerada pelo build do livro (`build_paes.py`), agora com título.
- Testes: `norqva_0070_kit_motion.test.tsx`; os 432 testes do site e o build passam.
