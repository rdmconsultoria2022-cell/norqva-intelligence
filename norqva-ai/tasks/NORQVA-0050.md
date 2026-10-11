# NORQVA-0050: "Trazer vídeo da Meta" para criativos importados

**Branch:** `ai/NORQVA-0050-video-da-meta` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** parte do contrato NORQVA-0048 (reaproveitar os criativos da EXP02 no kit), aprovado 11/10/2026 19h48 · **Risco:** LOW (só leitura na Meta)

## Motivo

Os criativos da EXP02 (EXT-TR_V1_EMO, V2_FOOD, V3_HYB) foram importados da Meta só como registro, sem o arquivo do vídeo, e o Ricardo não tem mais os arquivos. Sem arquivo não dá para aprovar nem usar na campanha do kit.

## Escopo

- `POST /api/creative-factory/creatives/:id/meta-video` (ADMIN): lê na Meta o anúncio ligado ao criativo, pega o vídeo e anexa o link do arquivo (o mesmo de "Anexar arquivo"). Nada é criado ou alterado na Meta.
- O criativo continua precisando de aprovação na tela Criativos.
- Botão "Trazer vídeo da Meta" no criativo de vídeo sem arquivo e com anúncio ligado.
- O link da Meta é temporário: usar na campanha logo depois (se vencer, é só trazer de novo e aprovar).
