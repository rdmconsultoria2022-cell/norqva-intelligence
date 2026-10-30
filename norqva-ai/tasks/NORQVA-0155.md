# NORQVA-0155: vídeo-aula do Bordado como bônus na entrega e prévia de 30 s na página de venda

**Branch:** `ai/NORQVA-0155-aula-bordado` · **Contrato:** Claude Docs "NORQVA-0155 — Vídeo-aula do Bordado na entrega e prévia na página" · **Autorização:** Ricardo, "as duas", 29/10/2026 21h29 · **Risco:** LOW (só tela; pagamento, PDFs, links e e-mails intactos)

## Escopo

- `frontend/public/videos/bordado/`: `previa_aula.mp4` (30 s, 720p, 3,9 MB) + pôster; aula completa (2min39, 720p, 23 MB) em
  `aula_gatinho_<12 hex>.mp4` + pôster (endereço difícil de adivinhar; o arquivo é público no site e o estorno não corta o acesso, aceitável para um bônus; servir pelo backend com o token fica para depois). Fonte: `norqva-ai/produtos/bordado/montar_aula.py` (branch NORQVA-0136).
- Entrega (`DigitalDelivery.tsx`): cartão "Bônus" com a aula quando o pedido é do Kit de Bordado e há acesso ATIVO (`BORDADO_INFO.lesson` em `lib/productLook.ts`).
- Página gerada (`GeneratedPage.tsx`): seção "Veja como é fácil" com a prévia, logo depois da galeria (ou no lugar dela), quando a API manda `preview_video`
  (`productPreviewVideo` em `generatedImages.ts`, só bordado; `generationService.ts`). `preload="none"`, sem preço, aviso de IA.

## Testes

Backend `norqva_0155_previa_video.test.ts`; frontend `norqva_0155_aula_bordado.test.tsx` (prévia com/sem, bônus com acesso ativo, sem acesso, livros de cozinha).

## Revisão independente

Subagente (29/10/2026). Bloqueante corrigido: lista de campos da página pública no teste 0129 (`preview_video`). Aplicado: aula decidida pelo arquivo (pedido com um arquivo usa o nome), espaço do vídeo reservado (9:16) e altura limitada no celular, mesma regra `bordad` nos dois lados, teste da Trattoria espera os dados, texto honesto sobre o endereço. Fica para depois: legendas em .vtt e servir a aula pelo backend.

## Execução

(preencher no merge)
