# BB-B01, Rodada 1: peças e roteiro de publicação na Meta

**Status:** peças H01, H03, H04 e H05 prontas (2026-09-27). Falta a gravação de tela do H02 (item 2).
Publicação manual no Gerenciador de Anúncios. O sistema não publica nada.

---

## 1. Peças prontas

| Criativo | Arquivo | Formato |
|---|---|---|
| BB-B01-H01-M1-C1 | `BB-B01-H01-M1-C1.mp4` | Vídeo 9:16, 20 s |
| BB-B01-H03-M1-C1 | `BB-B01-H03-M1-C1.mp4` | Vídeo 9:16, 18 s |
| BB-B01-H04-M1-C1 | `BB-B01-H04-M1-C1.mp4` | Vídeo 9:16, 25 s |
| BB-B01-H05-M1-C1 | `BB-B01-H05-M1-C1_1x1.png`, `_4x5.png`, `_9x16.png` | Imagem (feed quadrado, feed vertical, Stories/Reels) |
| BB-B01-H02-M1-C1 | abertura `BB-B01-H02-abertura.mp4` + **sua gravação** + `BB-B01-encerramento-C1.mp4` | Vídeo 9:16, cerca de 15 s |

Extras: as versões M2 do H05 (`BB-B01-H05-M2-C1_*.png`) ficam em estoque para a rodada 2.

- **Tela do app nas peças:** todas as peças com tela de celular levam a marca "Valores ilustrativos".
- **Safe zones:** textos e a marca ficam fora das faixas que o Reels e o Stories cobrem (topo e rodapé).
- **Áudio:** os vídeos saem com trilha muda. Pode adicionar música pela biblioteca de áudio da própria Meta na hora de subir.

## 2. H02: o que você precisa gravar

1. No celular, grave a tela (8 a 10 s) do **app real**: abrir, tocar em "+", registrar "Mercado R$ 85", e o valor "Disponível" mudar.
2. No CapCut (ou editor parecido), junte nesta ordem: `BB-B01-H02-abertura.mp4` (2,5 s) → sua gravação → `BB-B01-encerramento-C1.mp4` (4 s).
3. Se os valores da sua tela forem reais seus, use uma conta de teste com valores inventados e coloque o texto "Valores ilustrativos" no rodapé.

## 3. Campanha na Meta (Gerenciador de Anúncios)

**Campanha**
- Objetivo: **Vendas**.
- Nome: `BB-B01 | Rodada 1`.
- Categoria especial de anúncio: **nenhuma** (é um app de organização, não crédito).
- Orçamento da campanha (Advantage+): **desligado**. O orçamento fica no conjunto.

**Conjunto de anúncios**
- Nome: `BB-B01 | R1 | BR 25-55`.
- Conversão: **Site**, pixel NORQVA (1049452567443586), evento **Compra**.
- Orçamento: **R$ 50/dia**.
- Público: Brasil, 25 a 55 anos, todos os gêneros, sem interesses (amplo).
- Posicionamentos: **Advantage+** (automáticos).

**Anúncios: 5, um por criativo**
- **Nome do anúncio = ID exato:**
  - `BB-B01-H01-M1-C1`
  - `BB-B01-H02-M1-C1`
  - `BB-B01-H03-M1-C1`
  - `BB-B01-H04-M1-C1`
  - `BB-B01-H05-M1-C1`
- Texto principal (igual nos 5): *Organize seu dinheiro de forma simples: registre entradas e saídas em poucos toques e veja na hora quanto ainda está disponível no mês. App + planilha + guia por R$ 29,90, pagamento único. Toque em Saiba mais e comece hoje.*
- Título: *Veja quanto ainda está disponível no mês*.
- Chamada para ação: **Saiba mais**.
- URL do site: `https://norqva-intelligence-frontend.vercel.app/p/OFF-BOLSO-BLINDADO-2990`
- **Parâmetros de URL** (campo "Parâmetros de URL", colar exatamente):
  ```
  utm_source=meta&utm_medium=paid&utm_campaign=BB-B01&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
  ```
  `{{ad.name}}` e `{{ad.id}}` são preenchidos pela Meta. Com o nome do anúncio igual ao ID, cada visita e cada venda caem no criativo certo da Fábrica.
- Para o H05, envie as 3 imagens no mesmo anúncio: a Meta escolhe o formato de cada posicionamento.

**Antes de publicar**
- Confira na pré-visualização que nenhum texto ficou coberto.
- Não use textos diferentes dos aprovados. Se mudar alguma coisa, edite o criativo na Fábrica primeiro. Isso cria uma nova versão, que precisa de aprovação.

## 4. Depois de publicar

- No dia seguinte, a Fábrica mostra por criativo: investimento, CTR de link, visitas, abertura/início de checkout, vendas, CPA e a recomendação.
- Regras (seção 7 do BB-B01):
  - pausar com R$ 52 gastos e 0 vendas;
  - pausar com CTR de link abaixo de 0,6% depois de R$ 15;
  - promissor com CPA até R$ 26,12;
  - candidato a vencedor com 3 vendas ou mais e CPA até R$ 17,15.
- Pausas e aumentos de orçamento são decisões suas. O sistema só recomenda.
