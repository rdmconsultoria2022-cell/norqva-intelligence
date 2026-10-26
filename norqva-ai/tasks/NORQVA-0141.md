# NORQVA-0141: TR-M01 versão C2 (destino na página do kit, botão Saiba mais)

**Branch:** `ai/NORQVA-0141-tr-m01-pagina` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + conferência quadro a quadro · **Merge:** depois do CI verde
**Autorização:** só conteúdo de criativo (D-0037, sem aprovação). Nada publicado na Meta; tudo nasce pausado. · **Risco:** LOW

## Escopo

- `build_trm01.py` ganha a opção `--pagina`: gera os mesmos 4 vídeos com chave `-C2`, trocando a cena final da conversa do
  WhatsApp pelas 5 capas reais + "5 livros de receitas em PDF" + botão desenhado "Toque em Saiba mais". Sem a opção, gera a C1
  exatamente como antes.
- Imagem de feed C2: a última linha passa a ser "Toque em Saiba mais e veja o kit" (a C1 dizia "Peça pelo WhatsApp...").
- `TR-M01.md`: seção C2 com chave, título, texto principal e botão LEARN_MORE. Destino `/kit/OFF-000010`.
- Sem WhatsApp, canal de entrega ou preço (D-0053). Arquivos C1 intocados.

## Conferência

- 4 mp4 1080x1920, 15 s, H.264 + AAC, -14,0 LUFS (medido com ebur128).
- Quadros em 0,3 s, 3 s, 8 s, 12,5 s e 14,5 s de cada vídeo olhados um a um; feed C2 conferido.
