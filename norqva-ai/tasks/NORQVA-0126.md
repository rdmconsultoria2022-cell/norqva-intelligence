# NORQVA-0126: Kit de Bordado NORQVA (PDF do produto)

**Branch:** `ai/NORQVA-0126-kit-bordado` (a partir da `main`)
**Executor:** Claude · **Autorização:** conteúdo de produto (D-0037, sem aprovação prévia); pedido do Ricardo em 25/10/2026 00h22 · **Risco:** LOW (só fontes do PDF; nada muda no sistema)

## Contexto

O produto "Bordado" (oferta OFF-000015) não tinha arquivo para entregar. O Ricardo pediu para copiar o conteúdo de um site concorrente; recusado por direito autoral. Em vez disso, kit original desenhado do zero.

## Escopo

- `norqva-ai/produtos/bordado/`: `build_bordado.py` gera `KIT_DE_BORDADO_NORQVA.pdf` (46 páginas A4, vetorial, ~1 MB) e prévias em `preview/` (fora do git).
- Desenhos em código: `geo.py`, `motifs.py` (50 riscos), `diagrams.py` (pontos, materiais, transferência), `lettering.py` (letras em contorno).
- Fontes Playfair Display, Lora e Poppins (SIL OFL 1.1) em `fonts/` com as licenças.
- Conteúdo: como usar, materiais, 3 jeitos de transferir, 10 pontos com agulha numerada, começar e terminar a linha, índice, 50 riscos em tamanho real (15 flores, 10 folhagens, 10 monogramas, 10 bichinhos, 5 frases) com régua de 5 cm, alfabeto A–Z, acabamento e licença de uso.

## Regras

Nenhum material de concorrente foi consultado ou usado. PDF fica fora do git (repositório público); o Ricardo envia em Produtos → Bordado → "PDF entregue ao comprador".
