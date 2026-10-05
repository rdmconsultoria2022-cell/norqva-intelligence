# NORQVA-0020: Ponte Creative Factory → NORQVA

**Branch:** `ai/NORQVA-0020-factory-bridge` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI · **Merge e deploy:** Claude (autorizado pelo operador)
**Decisão:** D-0011 · **Risco:** MEDIUM (escrita em `creatives`; nada toca a Meta)

## Objetivo

Todo release certificado pela Creative Factory entra automaticamente na Fábrica de Criativos do NORQVA como criativo **DRAFT**, com o arquivo no Supabase Storage e a certificação guardada como evidência. Sem cadastro manual e sem fluxo paralelo.

## Contrato `norqva.factory-release.v1`

`POST /api/automation/creative-factory/ingest` (header `X-Norqva-Automation-Token`):

| Campo | Regra |
|---|---|
| `schema` | `norqva.factory-release.v1` |
| `campaign_id` | `a-z0-9-`, até 32 caracteres (pasta da campanha na Factory) |
| `creative_version` | até 8 caracteres (`V5`, `A`, …) |
| `certified` | precisa ser `true`; a Factory decide, o NORQVA recusa o resto |
| `qa_certifications` | objeto não vazio, guardado como evidência |
| `offer_human_id` | oferta existente no NORQVA (mapeada no export da Factory) |
| `media` | `sha256`, `size_bytes` (≤ 50 MB), `mime` (`video/mp4`, `image/png`, `image/jpeg`), duração, resolução |
| `storage` | bucket `creative-assets`, caminho `factory/<campanha>/<versão>/<sha256>.<ext>` |
| `copy` | `hook` obrigatório; `script`, `primary_text`, `headline`, `cta`, `mechanism` opcionais |
| `claim_codes` | pelo menos uma claim **já registrada** do mesmo produto, não rejeitada |
| `lineage`, `manifest` | opcionais, guardados como evidência |

Resultado: lote `CF-<campanha>` (`creative_batches.source = 'FACTORY'`) e criativo `CF-<campanha>-<versão>` (= `utm_content_key` = nome do anúncio na Meta), `approval_status = DRAFT`, `generation_source = FACTORY`, `file_url` público do Storage.

`POST /api/automation/creative-factory/upload-url`: devolve uma URL assinada de upload para o caminho padrão. A Factory nunca recebe a chave de serviço do Supabase. Se o arquivo já está lá com o mesmo tamanho, devolve `already_uploaded: true`.

## Garantias

- **Idempotente:** reenviar o mesmo release devolve `ALREADY_INGESTED`.
- **Imutável:** mesma `(campanha, versão)` com outro `sha256` → 409; o mesmo arquivo com outra chave → 409.
- **Fail-closed:** oferta inexistente, claim ausente/rejeitada/de outro produto, arquivo ausente no Storage ou com tamanho diferente → 422, nada é gravado.
- **Governança:** a aprovação continua exigindo claims verificadas (regra da NORQVA-0005).

## Modelo

Migration 039 (aditiva): `factory_releases` (chave única `campaign_id + creative_version + is_demo`, `sha256`, Storage, QA, linhagem, manifesto) e `creative_batches.source` aceita `FACTORY`.

## Lado da Factory

`engine/src/factory/norqva_export.py` + `factory_cli export-norqva`:
- lê só releases certificados (adaptadores explícitos por formato; o que não for reconhecido é recusado);
- cópia, oferta e claims vêm de `norqva_export.json` na pasta da campanha, escrito por humano (nada é inferido);
- dry-run por padrão; `--execute` sobe o arquivo e chama o ingest;
- carga retroativa = rodar o mesmo comando nas campanhas certificadas.

## Fora de escopo

Plano de lançamento referenciando o criativo da Fábrica (hoje o TR-EXP02 usa `video_url` direto); vínculo do identificador HPJ3 (pendente de origem).
