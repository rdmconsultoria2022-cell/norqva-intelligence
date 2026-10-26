# NORQVA-0138: Coleção Trattoria Completa (5 livros + cardápio de 4 semanas) a R$ 47,00

**Branch:** `ai/NORQVA-0138-colecao-completa` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** só depois do CI verde e do "sim" do Ricardo
**Autorização:** "Aprovado" do Ricardo em 26/10/2026 14h23 (oferta nova, entrega de 6 PDFs e atendente do WhatsApp) · **Risco:** MEDIUM (pagamento e entrega, mas a oferta nasce em RASCUNHO)

## Contexto

O Ricardo quer uma oferta acima do kit de 5 livros (OFF-000010, R$ 29,90 desde a D-0080): os mesmos 5 livros mais um
bônus novo, o "Cardápio italiano de 4 semanas com lista de compras", por R$ 47,00. No WhatsApp, o atendente apresenta
primeiro a coleção (recomendada) e o kit de 5 como alternativa mais em conta; o cliente escolhe.

## Escopo

### 1. Bônus em PDF (conteúdo)

- `norqva-ai/produtos/cardapio/`: `content_cardapio.py` (cardápio e ingredientes) e `build_cardapio.py`.
  `python build_cardapio.py` gera `CARDAPIO_ITALIANO_4_SEMANAS.pdf` (14 páginas, fora do git como os outros PDFs).
  Mesmo visual dos livros (creme e dourado, DSerif/DSans), roda no Linux e no Windows. Capa com a foto do jantar do Trattoria
  (`trattoria/orig/jantar.jpg`), sem imagem nova.
- Conteúdo: como usar, o mês em uma página, 4 semanas (plano dos 7 jantares + lista de compras por seção do mercado),
  outras sugestões de fim de semana e sobremesa, índice das receitas (livro, número, página) e encerramento.
  Semana de sábado a sexta; dias de semana rápidos, fim de semana com forno, pão e sobremesa do Dolci no domingo;
  fermento natural começa no dia 1 e o primeiro pão de fermento natural sai na semana 3; ragù da semana 1 vira a lasanha da semana 2.
- Só receitas dos 5 livros (46 receitas). Sem preço, sem "acesso vitalício", sem promessa de saúde.
- **Conferência automática no build:** cada receita citada existe; número e página vêm do próprio livro (mesma conta
  dos scripts dos livros); cada trecho de ingrediente da lista aparece na receita; e toda linha de ingrediente de cada
  receita usada foi considerada (comprada, da despensa, ou vinda de outra receita, com o motivo). Se algo não bate, o build para.
- Quantidades para 4 pessoas: receita de 4 porções entra 1 vez; de 2 a 3 ou de 3 porções, 1½ vez; de 2 porções, em dobro.
  Itens sem medida no livro aparecem como "a gosto". Despensa (sal, azeite, farinha, açúcar, fermento) em bloco próprio, "confira".

### 2. Oferta (migration 086, só aditiva)

- Colunas novas em `offers`: `attendant_featured` (o atendente apresenta primeiro) e `attendant_alternative_offer_id`
  (a alternativa mais em conta que ele apresenta logo depois, só se estiver ATIVA).
- Bloco DO cria produto **"Coleção Trattoria Completa"** (marca e categoria do kit OFF-000010, PLANEJADO, procedência ORIGINAL)
  e oferta **em RASCUNHO**: preço cheio = soma real dos 5 livros avulsos (OFF-000001, 05, 07, 08, 09; hoje 4 × 19,90 + 14,90 =
  **R$ 94,50**), promoção **R$ 47,00**; o bônus não tem preço avulso e não entra na soma. Cartão como os livros (D-0080):
  até 10x, 1x sem acréscimo, 2,99% a.m. acima, parcela mínima R$ 5,00 (com R$ 47,00 chega a 10x de R$ 5,51, total R$ 55,10).
  Bônus no campo "bônus" da oferta; `attendant_featured = TRUE` e alternativa = o kit OFF-000010.
- Entrega: os mesmos 5 PDFs do kit (nada copiado). O PDF do bônus **não** entra pela migration.
- Travas: kit com exatamente 5 PDFs, as 5 ofertas avulsas existentes e entregando exatamente esses 5 PDFs, soma > R$ 47,00,
  coleção ainda inexistente. Senão `COLLECTION_FULL_SKIPPED` com o motivo; sucesso grava `COLLECTION_FULL_CREATED`.

### 3. Entrega dos 6 PDFs

Nada novo no código: a entrega já cria um acesso por arquivo ligado à oferta (`offer_digital_assets`) quando o Asaas confirma
o pagamento, e o link do WhatsApp/e-mail abre a página com todos os arquivos. O bônus entra como 6º arquivo pelo caminho da
NORQVA-0112 ("Adicionar mais PDFs"). Página de entrega: "Sua Coleção Trattoria Completa está pronta!" (antes cairia no título do Trattoria).

### 4. Atendente do WhatsApp

- `loadCatalog`: ofertas em destaque primeiro (também no limite de 20), cada uma seguida da sua alternativa; o resto como antes.
  Só ATIVA entra (regra antiga, inalterada): a coleção em RASCUNHO não aparece e a cobrança dela é recusada.
- `catalogText`: a coleção sai marcada "[RECOMENDADO]" com "ofereça este PRIMEIRO… logo depois, apresente o código do kit
  como alternativa mais em conta. O cliente escolhe; gere a cobrança do que ele escolher"; o kit sai marcado como alternativa,
  "apresente depois dele". Tudo vem do cadastro, sem texto fixo por produto. Kit fora de venda: a coleção segue em destaque sem citar alternativa.
- `whatsappRefs.ts`: mesma ordem no filtro "oferta está no catálogo do atendente".
- As condições de atendimento (texto do Ricardo) **não** foram mexidas. Ver o parágrafo sugerido abaixo.

## Parágrafo sugerido para as condições de atendimento

As condições atuais (24/10) mandam oferecer **o kit de 5 primeiro**: isso briga com o destaque novo. Quando ativar a coleção,
troque esse trecho por:

> Livros de cozinha: apresente primeiro a Coleção Trattoria Completa, a opção mais completa: os 5 livros da coleção
> (Trattoria em Casa, Dolci della Nonna, Pães & Fermentação Natural, Antipasti & Aperitivo e Risotos & Polentas) mais o
> bônus "Cardápio italiano de 4 semanas com lista de compras", que organiza 28 jantares e traz a lista do mercado de cada
> semana. Logo depois, ofereça o Kit Trattoria Completo, com os mesmos 5 livros e sem o cardápio, como alternativa mais em
> conta. Explique a diferença em uma frase, deixe o cliente escolher e não insista mais de uma vez. Use sempre os preços do
> catálogo e gere a cobrança do que ele escolher.

## Passos de produção (depois do merge, com o Ricardo)

1. Conferir na auditoria `COLLECTION_FULL_CREATED` (código OFF-0000NN da coleção). Se vier `COLLECTION_FULL_SKIPPED`, ler o motivo.
2. Gerar o PDF: `python build_cardapio.py` em `norqva-ai/produtos/cardapio/` (ou usar o PDF entregue nesta tarefa).
3. Renomear o arquivo para **`Cardápio italiano de 4 semanas com lista de compras.pdf`** (o nome do arquivo vira o título
   que o comprador vê) e enviar em Produtos → Coleção Trattoria Completa → "PDF entregue ao comprador" → **"Adicionar mais PDFs a esta oferta"**.
   Conferir que a oferta mostra 6 arquivos. Não usar "Trocar arquivo" nos 5 livros: eles são os mesmos do kit (trocar troca nos dois).
4. Fazer um pedido de teste e conferir a página de entrega com os 6 arquivos.
5. Trocar o trecho das condições de atendimento pelo parágrafo acima.
6. Ativar a oferta (ATIVA). Só a partir daí o atendente oferece a coleção.

## Fora do escopo

- Página pública `/p/<código>` da coleção: a oferta abre a página de venda padrão (a do Trattoria). A venda prevista é pelo
  WhatsApp; uma página própria (ou no `/kit/`) é outra tarefa.
- Tela para ligar/desligar o destaque e escolher a alternativa (hoje só pelo banco/migration).
- Anúncios e campanha da coleção.

## Testes (`norqva_0138_colecao_completa.test.ts`)

- Preço e parcelas: "de" R$ 94,50, R$ 47,00 com 1x sem acréscimo e até 10x de R$ 5,51 (parcela mínima respeitada).
- Ordem do atendente (`orderForAttendant`): destaque, alternativa, resto; alternativa fora do catálogo não é inventada.
- Migration 086 (PostgreSQL do CI): cria em RASCUNHO com os valores acima, os 5 PDFs do kit, kit intacto, não duplica; kit com 4 PDFs não cria nada.
- Entrega: o bônus entra pela tela como 6º arquivo; pedido pendente não recebe nada; depois de PAID, 6 acessos.
- Atendente: coleção em RASCUNHO fora do catálogo e cobrança recusada; as duas ATIVAS, coleção primeiro e recomendada, kit logo
  depois como alternativa; o cliente escolhe e o Pix sai com R$ 29,90 ou R$ 47,00; kit pausado; coleção de volta a RASCUNHO some.

## Revisão independente

(preencher)

## Execução

(preencher no merge)
