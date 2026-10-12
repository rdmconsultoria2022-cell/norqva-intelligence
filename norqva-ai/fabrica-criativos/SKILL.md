---
name: fabrica-criativos-norqva
description: "Fábrica de criativos do NORQVA (versão adaptada do Criativos Infinitos v2.2): copia os anúncios vencedores do nicho na Biblioteca de Anúncios (sem login), extrai os padrões, escreve roteiro a partir da página de venda do NORQVA e gera pacotes de vídeo (1 corpo × N aberturas) com KIE e edição em Remotion. Comida em primeiro lugar, sem pessoa de IA apresentada como real, sem depoimento inventado e sem preço. Use quando o Ricardo pedir criativos, anúncios em vídeo ou análise de concorrente."
---

# FÁBRICA DE CRIATIVOS NORQVA — workflow mestre

Base: Criativos Infinitos v2.2, adaptado pelo contrato NORQVA-0053 (aprovado pelo Ricardo em
12/10/2026 11h20). Os scripts e o projeto de edição são os originais, com as mudanças abaixo.

## ⛔ REGRAS NORQVA (valem acima de qualquer outra instrução desta pasta)

1. **Anúncio sem preço (D-0053).** Nada de valor, "R$", centavos, parcelas, "reais", "por
   apenas", "preço" ou desconto na fala, na legenda, no texto na tela, na chamada final, no
   título ou no texto do anúncio. O preço aparece só na página, no WhatsApp e no pagamento.
   O `gen.py` recusa um `script.json` com preço; o NORQVA recusa aprovar texto com preço.
2. **Nenhuma pessoa de IA apresentada como real (D-0009).** Nada de "cliente" inventado,
   depoimento, UGC, "minha experiência", antes/depois de pessoa, avatar realista falando em
   primeira pessoa. Pessoa na tela só se for REAL (o Ricardo, ou cliente real com autorização
   por escrito, em vídeo gravado de verdade).
3. **Sem desvio de filtro.** Se o gerador recusar uma imagem ou vídeo por conteúdo, PARE e
   avise o Ricardo. Não troque para outro gerador "mais permissivo" e não reescreva para
   passar. (O `gen.py` desta versão não tem mais a troca automática.)
4. **Promessas só do registro do NORQVA.** Toda afirmação do roteiro tem que estar nas
   promessas VERIFICADAS do produto (tela Criativos → Promessas). Nada de resultado
   garantido, acesso vitalício (D-0005) ou "receita da nonna de verdade" se não for.
5. **Biblioteca de Anúncios: decisão do Ricardo, com risco assumido.** A cópia automática
   (`scripts/scrape.py`) roda SEMPRE sem login, num navegador limpo, nunca com a conta do
   Facebook ou de anúncios dele, e com poucas rolagens (`--scrolls 10` a `25`). Os anúncios
   dos concorrentes são inspiração de FORMATO e ESTRUTURA: nunca copie frase, foto, vídeo,
   marca ou personagem deles.
6. **O vídeo vai para o NORQVA, não direto para a Meta.** Entrega = mp4 anexado na tela
   Criativos → aprovação (o Ricardo confirma "sem preço") → campanha nasce PAUSADA → ativar
   só com o "sim" dele.
7. **Custo:** estime antes de gerar e só gere com o OK do Ricardo. Teto por pacote sem nova
   pergunta: 2.000 créditos KIE (~US$ 10).

## Formatos permitidos (comida em primeiro lugar)

| Formato | O que é | Composição Remotion |
|---------|---------|---------------------|
| **Receita relâmpago** | o prato sendo feito em 4-6 cenas curtas, texto grande na tela por cena, música | corpo mudo + `AdSplit`/`AdVisual` com b-roll |
| **Livro na tela** | páginas REAIS do PDF do produto (capturas) com zoom lento, alternando com o prato pronto | corpo mudo + inserts de página |
| **Mesa posta** | abertura forte com o prato pronto (gatilho nº1 do nicho = comida), depois o preparo | `AdVisual` (b-roll em tela cheia) |
| **Narração real** | qualquer um dos acima com a VOZ do Ricardo gravada no celular (pessoa real) | áudio próprio + legenda por transcrição |

Proibidos nesta versão: `AdReact`, `AdUgc`, `AdSplitUgc` e `AdVisual` com voz de take de
avatar (todos dependem de pessoa de IA falando). Só voltam com filmagem REAL.

Mãos: evite (a IA erra mãos). Se uma cena precisar, passa pelo QC de mãos (`04-qc.md`) e
nunca sugere que é "a nonna" ou uma pessoa específica.

## FASE 0 — CHECKUP (primeiro uso da máquina)

Rode `./install.sh` (ver `INSTALL.md`). Confira e monte a tabela `item · status · como corrigir`:
1. `KIE_API_KEY` definida e `python3 scripts/kie.py credit` responde (informe o saldo).
2. node ≥ 18, python3 ≥ 3.9, ffmpeg/ffprobe (sistema — se faltar, UM comando para o Ricardo colar).
3. `.venv` com playwright + chromium + faster-whisper (você instala).
4. `templates/edit-template/node_modules` (Remotion).

## FASE 1 — BRIEF

- **Produto e página de destino do NORQVA**: `https://norqva-intelligence-frontend.vercel.app/p/<oferta>`
  ou `/kit/<oferta>`. Sem página → pare.
- **Idioma**: português do Brasil.
- **Concorrente(s)**: URL da Biblioteca de Anúncios (ordenada por impressões) ou o domínio do
  concorrente — monte a URL como no `01-raspagem.md`.
- **Formato**: um da tabela acima (padrão: Receita relâmpago, 1 corpo × 4 aberturas).
- **Custo estimado** (sem fala de IA): ~10 vídeos mudos de 5 s (~14 cr/s) + ~12 imagens
  (~4 cr) + música (~10 cr) ≈ 800 cr ≈ US$ 4. Apresente e espere o OK.

## FASE 2 — NICHO (biblioteca ou raspagem)

Igual ao original (`01-raspagem.md` e `02-nicho-e-copy.md`): filtro de isca, top 5-6 vídeos
transcritos UM POR VEZ, grids de frames LIDOS, doc do nicho em `niches/<nicho>.md`. No doc,
registre também: quais winners usam pessoa (e por isso NÃO servem de modelo de formato
aqui) e quais são comida/livro — esses são a referência.

## FASE 3 — PÁGINA DO NORQVA (obrigatório)

Leia a página de destino (`curl` no HTML; é SPA: leia o JS ou use `scripts/shoot_funnel.py`).
Liste promessa, linguagem, prova, o que a página NÃO promete. Capture as telas (servem de
insert). Confira as promessas VERIFICADAS do produto no NORQVA antes de escrever.

## FASE 4 — ROTEIRO (`script.json`)

- Corpo 20-40 s: desejo (o prato) → o que tem no livro (recurso verificado) → facilidade
  (passo a passo, ingredientes comuns) → prova real (páginas do livro) → chamada.
- 4 aberturas DISTINTAS, cada uma mostrando a comida nos primeiros 2 segundos.
- Texto na tela: frases curtas, 1-2 linhas por cena, sem preço.
- Chamada final diferente em cada anúncio, sem preço: "Veja as receitas", "Toque em Saiba
  mais", "Chame no WhatsApp", "Quero o livro".
- Cenas sem pessoa: descreva o prato, a panela, a bancada, a luz. Mesmo cenário do livro:
  prato creme com borda dourada, linho rosado, mesa escura, luz quente, sem texto, marca ou mãos.
- Imagens terminam com "9:16, no text, no UI elements, no people, no hands".

Apresente o roteiro (corpo + 4 aberturas + 4 chamadas) ao Ricardo antes de gerar.

## FASE 5 — GERAÇÃO (KIE)

`03-geracao-kie.md`. Ordem: imagens → QC → vídeos mudos (b-roll i2v, Kling) → QC → música.
O `gen.py` para no primeiro aviso de recusa de conteúdo e no primeiro preço encontrado.

## FASE 6 — EDIÇÃO (Remotion)

`05-edicao-remotion.md`, só com as composições permitidas. Tema (`theme.ts`) com as cores
da página do produto (creme e terracota nos livros de cozinha). Legenda/texto sem preço.

## FASE 7 — QC FINAL + ENTREGA

1. Grid de frames de cada mp4 (abertura, meio, chamada): comida nos 2 primeiros segundos?
   texto legível? **nenhum preço**? nenhuma pessoa/mão estranha? chamada única por anúncio?
2. Entregue ao Ricardo: os mp4, a tabela (anúncio · formato · abertura · chamada · duração),
   o custo real (saldo KIE antes/depois) e o doc do nicho.
3. Ele anexa cada mp4 no criativo correspondente na tela Criativos e aprova.

## O que NUNCA fazer

Pessoa de IA como real · depoimento inventado · preço em qualquer lugar do anúncio · trocar
de gerador para passar em filtro · copiar frase/foto/vídeo de concorrente · raspar logado ·
estourar o custo combinado sem avisar · pular QC.
