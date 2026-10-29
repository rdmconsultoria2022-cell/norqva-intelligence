# NORQVA-0149: vídeo do Mestre Tito publicado no site para o anúncio de teste

**Branch:** `ai/NORQVA-0149-video-tito` · **Tipo:** conteúdo (D-0037, sem aprovação) · **Risco:** LOW (só arquivos estáticos)

A Meta precisa baixar o vídeo de um endereço https público. `frontend/public/videos/anuncio_tito.mp4` (8 s, 720x1280, gerado na KIE, personagem virtual da D-0145) e a capa `anuncio_tito_capa.jpg` (quadro de 1 s) ficam em
`https://norqva-intelligence-frontend.vercel.app/videos/`. Usados pelo criativo e pela campanha de teste do Mestre Tito (D-0143: até R$ 20/dia).

## Execução

PR #198 mesclado em 29/10/2026 (CI verde; revisão independente sem nada bloqueante). Em 29/10 às ~10h30, pela tarefa agendada e dentro da D-0143 (fora do mandato só esta campanha ativa, R$ 20/dia):
criativo CR-000015 (claims CLM-3BE90942 e CLM-A4C33642, aprovado), plano `CMP-OFF-000010-TITO01`, campanha "NQ – Kit 5 – Mestre Tito – Teste" (Meta 120250242574070097, conjunto 120250242574760097, anúncio 120250242582720097),
R$ 20/dia, teto R$ 140, término 05/11/2026, destino /kit/OFF-000010, utm_content=CR-000015, sem preço, texto com aviso de personagem virtual. Vídeo pelo raw do GitHub do commit 62c18b2. A primeira ativação bateu no limite de chamadas da Meta (#613); a segunda concluiu (ACTIVE).
