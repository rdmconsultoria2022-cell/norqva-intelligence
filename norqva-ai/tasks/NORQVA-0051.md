# NORQVA-0051: "Trazer vídeo da Meta" usa primeiro o arquivo original do plano

**Branch:** `ai/NORQVA-0051-video-do-plano` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Autorização:** correção do NORQVA-0050 (contrato NORQVA-0048) · **Risco:** LOW

## Motivo

Ricardo (11/10/2026 20h25): "A Meta não devolveu o link do arquivo do vídeo". A Meta não libera o arquivo de vídeo para leitura com o acesso atual.

## Escopo

- Antes de perguntar à Meta, procura o plano de lançamento do NORQVA que criou o anúncio (meta_ids.ads) e usa o `video_url` original daquele anúncio (o mesmo arquivo que a Meta já aceitou). Link permanente, sem chamar a Meta.
- Se não houver plano, segue tentando o link da Meta como antes; mensagem de erro orienta a anexar o arquivo.
