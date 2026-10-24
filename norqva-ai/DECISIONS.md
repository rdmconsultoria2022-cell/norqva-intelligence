# DECISIONS — NORQVA

Registro de decisões técnicas relevantes. Uma decisão encerrada não é rediscutida sem fato novo.

## D-0001 — Migration 025 com `NOT VALID` (2026-09-27)

- **Problema:** a suíte de testes apaga `schema_migrations` e reexecuta todas as migrations num banco que já contém eventos `PIX_GENERATED`, `PIX_EXPIRED` e `PAID` (criados pela 026 e pelo NORQVA-0001). A 025 recria uma constraint mais estreita e falha nessas linhas.
- **Decisão:** a constraint da 025 passa a ser `NOT VALID`. Exceção explícita à regra "não editar migration aplicada", **aprovada pelo operador em 2026-09-27**.
- **Por que é seguro:** em produção a 025 já foi aplicada e não roda de novo. O estado final do schema é idêntico, porque a 026 remove essa constraint e cria outra, validada. `migrations.ts` remove `NOT VALID` só no pg-mem, que não o suporta.
- **Alternativa rejeitada:** limpar eventos em cada teste. Frágil, porque qualquer teste de pagamento agora gera `PAID`.
- **Correção de fundo:** NORQVA-0002. Os testes não devem apagar `schema_migrations`; cada arquivo deve usar um banco ou schema isolado.

## D-0002 — Pedidos de teste reclassificados, não apagados (2026-09-27)

- **Decisão:** 8 pedidos internos de teste (Ricardo licas ×4, Ricardo Andrade ×1, QA User A ×1, Qa Sandbox Buyer Test ×2) saem de `COMMERCIAL_PRODUCTION` para `STAGING_SANDBOX_QA` na migration 028. **Aprovado pelo operador.**
- **Por quê:** 3 desses pedidos têm Pix real pago no Asaas. Apagar quebraria a conciliação com o extrato. Reclassificar tira os pedidos dos painéis de produção e mantém o histórico.
- **Efeito:** vendas reais passam de 8 pedidos pagos / R$ 169,20 para 4 / R$ 79,60.

## D-0003 — Modo DEMO removido da produção (2026-09-27)

- **Decisão:** o frontend de produção sempre opera em modo REAL. O seletor DEMO/REAL, o aviso de ambiente demo e o botão "limpar base demo" só existem em testes automatizados. **Aprovado pelo operador.** (NORQVA-0034: `VITE_ENABLE_DEMO_MODE` deixou de religar o modo demo, a pedido do Ricardo em 09/10/2026.)
- **Mantido:** o suporte a `mode=demo` no backend e o seed de demonstração, que a suíte de testes usa.

## D-0004 — Aprovação de criativos em `creative_reviews`, não em `decisions` (2026-09-27)

- **Decisão:** a aprovação de criativos da Fábrica (NORQVA-0005) fica numa tabela própria, `creative_reviews`, com decisão, motivo, revisor e `content_hash` da versão revisada.
- **Por quê:** estender `decisions.type` exigiria trocar o CHECK de uma tabela já aplicada. `creative_reviews` é aditiva e guarda o hash, o que `decisions` não faz.
- **Consequência:** quando a publicação automática existir (G4), ela vai gerar um `decisions` APROVADO a partir da revisão aprovada, porque é isso que o `metaMutatingClient` exige.
- **Diverge de:** `NORQVA_COMMERCE_FACTORY_ARCHITECTURE_REVIEW_V1`, seção D (migration 031).

## D-0005 — "Acesso vitalício" removido (2026-09-27)

- **Decisão:** o dono do produto não garante acesso vitalício. A claim BB-CL-08 entra como REJECTED, e as landings do Bolso Blindado e da Trattoria deixam de prometer acesso vitalício.
- **Contexto:** a entrega da Trattoria já limita os downloads (máximo de 5 por pedido), o que contradizia a promessa.

## D-0006 — Atribuição por criativo só determinística (2026-09-27)

- **Decisão:** o painel de performance de criativos só liga um evento ou pedido a um anúncio por `ad_id`, pelo nome exato do anúncio ou pelo `meta_ad_id` no `utm_content`. A correspondência por substring e o atalho `variant_x → ad_x` foram removidos.
- **Efeito:** o que não casar aparece como "não atribuído", em vez de ir para o anúncio errado.
- **Convenção:** nome do anúncio na Meta = chave do criativo (ex.: `BB-B01-H02-M1-C1`) = `utm_content`.

## D-0007 — Controle de campanhas Meta pelo NORQVA (2026-09-27)

- **Decisão:** o NORQVA passa a ativar e pausar campanhas, conjuntos e anúncios e a mudar o orçamento diário na Meta, substituindo o botão liga/desliga do Gerenciador. **Autorizado pelo operador** ("autorizo o controle de campanhas Meta pelo NORQVA").
- **Proteções:** só ADMIN; confirmação em diálogo para toda ação; registro em `audit_logs` de sucesso e falha; orçamento diário entre R$ 5 e o teto `META_MAX_DAILY_BUDGET_BRL` (padrão R$ 100); desligado enquanto `META_MUTATION_ENABLED` não for `true`; verificação real da credencial (token válido, `ads_management`, acesso à conta) antes de cada alteração, com cache de 5 minutos.
- **Fora de escopo:** criar campanhas, anúncios ou públicos pelo NORQVA; orçamento total (lifetime); ações automáticas sem clique humano.

## D-0008 — Base de campanhas Meta e time de IAs (2026-09-28)

- **Decisão:** o NORQVA passa a manter uma base de dados própria das campanhas Meta, com histórico, funil, retenção de vídeo e conteúdo do criativo. Sobre ela, pontua e classifica nichos, produtos, campanhas, conjuntos e anúncios. Depois, um time de IAs avalia oportunidades, monta o plano de campanha e prepara lotes de criativos na Fábrica. **Escolhido pelo operador:** nossa conta e mercado europeu como fontes; time só de IAs.
- **Fontes fora de escopo:** anúncios comerciais do Brasil de terceiros, porque a API oficial não os entrega e raspar a Biblioteca de Anúncios viola os termos da Meta.
- **Verdade de vendas:** pedidos pagos do NORQVA com atribuição determinística (D-0006). As compras reportadas pela Meta ficam só como referência.
- **Proteções:** as IAs não publicam, não pausam e não mudam orçamento. O operador aprova o plano e os criativos; ações na Meta seguem a D-0007.

## D-0009 — Estrutura Meta por nicho e piloto Trattoria (2026-09-30)

- **Decisão:** cada nicho vira uma marca própria, com Página do Facebook, Instagram, Pixel/Dataset e WhatsApp próprios. Conta de anúncios própria só quando o volume justificar. O provisionamento pelo Claude é o objetivo. **Aprovado pelo operador** (quadro META / MULTI-NICHE, 2026-09-30).
- **Ordem:** primeiro um nicho piloto (Culinária italiana / Trattoria). Criação em massa só depois da certificação do piloto.
- **Por que Trattoria:** o BB-B01 roda na conta e no pixel atuais; mover o Bolso Blindado no meio da rodada 1 zeraria o aprendizado. O Bolso migra para a marca própria depois que a rodada fechar.
- **Limites reais do provisionamento:**
  - Claude cria por API: marca no NORQVA, Pixel/Dataset, conta de anúncios (dentro do limite do Business Manager), textos, identidade e landing.
  - O operador cria à mão: Página do Facebook, conta do Instagram e número do WhatsApp (verificação por código). O NORQVA mostra o checklist do que falta.
- **Regras:**
  - tudo no mesmo Business Manager verificado, mesma empresa e mesma forma de pagamento;
  - portfólio da operação: **Norqva (1361471345973932)**, dono da conta de anúncios, do app e do usuário de sistema NORQVA_Backend. Os ativos da Trattoria nasceram no portfólio "norqva" (2566466360497925) e são compartilhados com o Norqva como parceiro (decisão do operador em 2026-09-30). Marcas novas nascem direto no Norqva;
  - nunca criar conta ou Página para substituir ativo restringido;
  - conta de anúncios nova só com justificativa registrada (padrão: uma conta, uma campanha por marca);
  - marca nasce `BRAND_ONLY`: sem avatar realista nem pessoa fictícia apresentada como real;
  - claims seguem o registro da Fábrica; D-0005 vale para todas as marcas.

## D-0034 — Conta real = produção comercial; sem modo demo nas telas (2026-10-09)

- **Decisão:** produto e oferta criados pela tela na conta real nascem `COMMERCIAL_PRODUCTION` (oferta herda a procedência do produto). Os que ficaram `UNKNOWN` voltam para a lista só quando o ADMIN clica em "Trazer para a lista". O modo demonstração não existe mais em nenhuma tela publicada. **Aprovado pelo operador** ("essa divisão mais atrapalha do que ajuda").
- **Consequência aceita:** como já acontecia com as ofertas da Trattoria, um "Checkout da oferta" feito pelo operador com Pix real é um pedido comercial. Compras internas de teste são reclassificadas depois, como em D-0002.

## D-0037 — Regra de aprovação (2026-10-10)

- **Decisão:** o Claude faz sem pedir aprovação as mudanças de tela, texto e conteúdo (inclusive PDFs dos produtos) e as correções de erro. O "Aprovado" do operador continua obrigatório antes de qualquer mudança que mexa em pagamento, entrega ao comprador, gasto na Meta, dados de clientes ou que não possa ser desfeita. Na dúvida, vale a aprovação. **Aprovado pelo operador** em 10/10/2026 13h47 ("Pode seguir com essa regra").
- **Continua igual:** branch, arquivo de tarefa, revisão independente, CI verde e merge pelo Claude; todas as regras de segurança (PAID do Asaas, migrations aditivas, tudo nasce pausado na Meta).
- **Passagem entre tarefas:** `CLAUDE.md` na raiz do repositório resume regras, fluxo, estado e pendências; fontes dos livros em `norqva-ai/produtos/`.

## D-0038 — Cartão de crédito com entrega na confirmação (2026-10-10)

- **Decisão:** ofertas podem aceitar cartão de crédito parcelado sem juros pelo Asaas. O PDF é liberado quando o Asaas confirma a compra (CONFIRMED), sem esperar o dinheiro cair (32 dias por parcela). **Decidido pelo operador** em 10/10/2026 15h24: "a entrega do produto deve ser feita assim que houver a confirmação de pagamento, eu assumo o risco de ter contestação e ficar com o prejuízo".
- **Como:** o comprador digita o cartão na página segura do Asaas (invoiceUrl); o NORQVA nunca vê dados de cartão.
- **Estorno e contestação:** bloqueiam os downloads do pedido (pedido REFUNDED, entregas REVOKED), para Pix e cartão.
- **Anúncio de parcelas:** o total no cartão precisa dividir em parcelas iguais, para "Nx de R$ Y" bater exatamente com o total (Decreto 5.903/2006). O cartão pode custar um pouco mais que o Pix.
- **Kit:** a oferta do kit liga os mesmos PDFs do Trattoria e do Dolci (mesmo arquivo cadastrado). Trocar o arquivo em uma oferta muda nas outras; a tela avisa.
- **Estorno de cobrança duplicada:** se o pedido tem outro pagamento confirmado, ou a cobrança estornada nunca liberou o pedido, o acesso é mantido; só aquele pagamento vira REFUNDED.

## D-0041 — Parcelas escolhidas pelo comprador (2026-10-10)

- **Decisão:** no cartão, o comprador escolhe o número de parcelas. Até o limite "sem juros" da oferta o vendedor paga a taxa; acima, juros mensais (Tabela Price) repassados ao comprador. Kit: até 4x sem juros, 5x e 6x com 2,99% ao mês (7x daria parcela abaixo de R$ 5,00). **Aprovado pelo operador** em 10/10/2026 18h10.
- **Como:** o servidor recalcula parcela e total a partir da oferta; o navegador só manda o número de parcelas. A tela mostra preço à vista, parcelas, total e juros (Decreto 5.903/2006).
- **Visual:** a tela de pagamento segue a paleta do produto (creme e terracota nos livros de cozinha).

## D-0046 — Atendente de vendas no WhatsApp com API não oficial (2026-10-10)

- **Decisão:** o NORQVA atende, vende e entrega pelo WhatsApp com a Evolution API (não oficial), em servidor próprio no Render. **Risco de banimento assumido pelo operador** às 19h31 ("Eu vou assumir o risco em usar a API não oficial"); contrato NORQVA-0046 aprovado às 19h38.
- **Escala:** até 100 números, cada um ligado a uma marca (sem marca = todos os produtos à venda). Atendente nasce pausado.
- **Regras fixas:** preço e parcelas do servidor; cobrança pelos mesmos controladores do checkout; entrega só com PAID do Asaas; CPF mascarado no banco, só na memória por 1 h e nunca enviado à IA; só responde quem chamou; "parar" respeitado; limites por conversa e por número; uma cobrança por resposta.
- **Troca para a API oficial:** nova classe em `services/whatsapp/provider.ts`, sem refazer o atendente.
- **Retenção:** mensagens apagadas após 180 dias.

## D-0079 — WhatsApp oficial (Cloud API da Meta) como motor do atendimento (2026-10-15)

- **Decisão:** o NORQVA ganha o motor oficial da Meta ao lado da Evolution, que fica **desligada** (`WHATSAPP_EVOLUTION_ENABLED`). Conversas, atendente, cobrança, entrega e origem são os mesmos; só o motor e a entrada mudam. **Aprovado pelo operador** em 15/10/2026 23h27 (contrato NORQVA-0079).
- **Multioperação:** uma conta Meta por marca e ambiente; token e App Secret criptografados (`WHATSAPP_SECRETS_KEY`), nunca devolvidos à tela. O webhook só aceita mensagem de número daquela conta.
- **Teste x produção:** contas TEST e PRODUCTION separadas; ir para produção = conta e número novos, sem editar IDs. Pedido de número TEST é `STAGING_SANDBOX_QA` e não envia Purchase à Meta. Número TEST nunca aparece nas páginas.
- **Travas:** envio real só com `WHATSAPP_CLOUD_SEND_ENABLED=true` e ambiente listado em `WHATSAPP_CLOUD_ENVIRONMENTS` (padrão TEST); conta TEST só envia para os destinatários de teste. Com envio barrado, o atendente não gera cobrança.
- **Janela de 24h:** texto livre só até 24h da última mensagem do cliente. Fora dela, resposta manual é recusada e a entrega fica para o e-mail (template de entrega na etapa 4).

## D-0052 — Teto editável e campanha lucrativa não pausada pelo teto (2026-10-11)

- **Decisão:** o teto de gasto é editável na tela Campanhas em qualquer situação. Baixar salva na hora; subir (teto, teto máximo ou religar a regra de lucro) depois do Sim pede o código da campanha e um motivo. Substitui a trava H3 (subir só até o capital aprovado na ativação). **Aprovado pelo operador** em 11/10/2026 21h14 (contrato NORQVA-0052).
- **Lucro:** vendas pagas confirmadas pelo Asaas, com `utm_campaign` = código do plano, só comerciais, valor do pedido menos a taxa do Asaas, maiores que o gasto na Meta, com pelo menos 3 vendas, na campanha inteira **e** nos últimos 3 dias (fuso de São Paulo).
- **No teto:** se lucrativa, o vigia não pausa e sobe o teto em 50% (ou o bastante para mais 1 dia), até o teto máximo absoluto (padrão 3x o teto inicial; o operador pode mudar). Acima do teto máximo, ou sem leitura do gasto recente, ou sem registro de decisão: pausa como antes e avisa. Liga/desliga por campanha; desliga tudo com `EXPERIMENT_GUARD_PROFIT_EXTEND=false`.
- **Parado no teto:** subir o teto acima do gasto faz o vigia voltar a acompanhar; a campanha continua pausada até o operador reativar.
- **Pergunta de ativação:** acompanha sempre o teto atual.
- **Continua igual:** orçamento diário não muda sozinho; pausar anúncio com 2x o CPA de equilíbrio sem venda; ativar só com o Sim.

## D-0053 — Anúncio sem preço; venda pela página e pelo WhatsApp (2026-10-12)

- **Decisão:** anúncios (título, texto, gancho, chamada, roteiro e vídeo) não mostram preço. O preço aparece só na página, no WhatsApp e no pagamento. **Aprovado pelo operador** em 12/10/2026 11h20 (contrato NORQVA-0053, itens 1 e 2).
- **Trava:** `services/creative/priceInCopy.ts` barra R$, valores com centavos, parcelas, "reais", "por apenas", "preço" e descontos. Ela atua na aprovação do criativo, na edição manual do anúncio da campanha, no plano do time de IA e na última conferência antes de criar na Meta. Promessa do tipo PRICE não vale para anúncio. Com arquivo anexado, quem aprova confirma na tela que o vídeo/imagem não mostra nem fala preço.
- **Fábrica de criativos:** a versão NORQVA do Criativos Infinitos mantém a cópia da Biblioteca de Anúncios (risco assumido pelo operador; sempre sem login), sem pessoa de IA apresentada como real, sem depoimento inventado, sem troca para geradores permissivos e sem preço.
- **Caminho de venda (item 3, aprovado em 12/10/2026 12h12, NORQVA-0054):** campanha → página → WhatsApp → pagamento → entrega no WhatsApp e por e-mail, só com PAID do Asaas.
  - O botão principal das páginas `/p/` e `/kit/` abre o WhatsApp da marca com a mensagem pronta e um **código de origem** (`whatsapp_refs`). Ele só aparece com número CONECTADO e atendente ligado; senão a página fica como antes.
  - "Pagar aqui mesmo (Pix ou cartão)" continua na página como opção menor, para as vendas não pararem se o WhatsApp cair (API não oficial, D-0046).
  - O código liga a conversa à origem (utm, fbc/fbp, endereço e navegador da página). O pedido herda a origem por até 28 dias: a venda conta para a campanha (D-0052) e a compra informada à Meta pelo servidor leva os dados do clique. Sem código, a origem é "whatsapp" e o endereço do servidor não é enviado como se fosse do comprador.
- **Já existente:** os criativos BB-B01 com R$ 29,90 que já rodam continuam; não podem ser reaprovados nem ir para campanha nova.

## D-0055 — Livros novos da coleção: fotos na KIE e um volume por vez (2026-10-12)

- **Decisão (Ricardo, 12/10/2026):** os volumes prometidos na página do kit (III Pães & Fermentação Natural, IV Antipasti & Aperitivo, V Risotos & Polentas) são feitos um por vez, com 12 receitas cada e o mesmo padrão do Trattoria e do Dolci. O Ricardo revisa cada volume antes do próximo.
- **Fotos:** geradas pelo Claude na KIE (google/nano-banana, cerca de 4 créditos cada), no cenário dos livros (prato creme com borda dourada, linho rosado, mesa escura, luz quente, sem texto, marca ou mãos). Cada foto é conferida contra a receita antes de entrar. O uso comercial das imagens da KIE foi confirmado pelo Ricardo.
- **Venda:** o livro só entra à venda depois de o Ricardo cadastrar o produto e o PDF no NORQVA (mexe na entrega ao comprador, precisa de aprovação). Até lá, a página do kit mantém "EM BREVE".

## D-0056 — Trocar link e texto de anúncio que já está na Meta (2026-10-13)

- **Decisão (Ricardo, 13/10/2026 16h46, contrato "NORQVA-0055 editar anúncio"):** o NORQVA pode trocar link, texto, título e botão de um anúncio que já está na Meta, pela tela Campanhas, um anúncio por vez, com o código da campanha digitado.
- **Como:** a Meta não deixa editar a peça de um anúncio existente; o NORQVA cria uma peça nova com o mesmo vídeo, página, Instagram e etiquetas de origem e troca dentro do mesmo anúncio. Status, orçamento e público não mudam; o anúncio volta para a revisão da Meta.
- **Travas:** sem preço (D-0053), destino só em página de oferta/kit do NORQVA ou da marca, campanha/conjunto/anúncio de controle nunca é alterado, campanha em criação não é tocada, registro de decisão e auditoria com antes e depois.
- **Limite:** só peça de vídeo simples. Peça dinâmica (vários textos), post existente ou imagem: a troca é recusada e deve ser feita no Gerenciador de Anúncios.

## D-0057 — Lixeira de produtos e ofertas (2026-10-13)

- **Decisão (Ricardo, 13/10/2026 17h11, contrato NORQVA-0057):** excluir produto ou oferta pela tela leva para uma lixeira, com "Restaurar". Nada é apagado do banco, porque pedidos, pagamentos e downloads dependem do cadastro. O "Arquivar" ganhou volta pelo mesmo "Restaurar".
- **Travas:** só ADMIN, com o código digitado; oferta ativa ou em teste, usada por campanha na Meta, adicional no Pix ativo ou com pedido aguardando pagamento não é excluída; produto só sem ofertas abertas. Restaurar devolve pausado.
- **Comprador:** quem já comprou continua baixando normalmente.

## D-0058 — Criativos editáveis por completo e com lixeira (2026-10-13)

- **Decisão (Ricardo, 13/10/2026 18h02):** todo o conteúdo do criativo é editável pela tela (gancho, mecanismo, título, texto, CTA, roteiro, arquivo) e o criativo pode ser excluído.
- **Regras:** edição de conteúdo já revisado cria nova versão para aprovar de novo (a aprovação continua ligada ao conteúdo). Excluir segue a lixeira da D-0057: só ADMIN, código digitado, todas as versões juntas, "Restaurar" desfaz; bloqueado com anúncio rodando na Meta ou campanha do NORQVA usando o criativo. Nada muda na Meta.

## D-0061 — Volumes III, IV e V vendidos separadamente (2026-10-13)

- **Decisão (Ricardo, 13/10/2026 19h26, contrato NORQVA-0061):** os três livros novos da coleção são vendidos cada um sozinho, a **R$ 19,90**, com Pix e as condições de cartão do Trattoria. O kit continua com Trattoria + Dolci.
- **Como entra à venda:** a migration 062 cria produto e oferta em RASCUNHO. O Ricardo envia o PDF final na tela, testa (TESTE) e ativa (ATIVA). Só com a oferta ATIVA o livro aparece como "Disponível separadamente" na página do kit.
- **Página:** cada livro tem a sua página de venda (`bookPages.ts`), no visual do Trattoria, sem preço nos textos além do botão de compra.
- **Volumes IV e V:** só são ativados depois das fotos. Antes, é preciso pôr as imagens em `frontend/public/images/livros/<livro>/` e incluir o livro em `READY_BOOKS`; sem isso, a página do kit não o mostra.
- **Chave do livro:** `products.collection_key` (migration 062). Renomear o produto na tela não muda a página de venda.

## D-0063 — Kit completo ou livros avulsos no mesmo pagamento (2026-10-14)

- **Decisão (Ricardo, 14/10/2026 20h11, contrato NORQVA-0063):** na página do kit com os 5 livros, o pagamento oferece o kit completo (marcado por padrão) ou livros avulsos, todos num único Pix ou cartão.
- **Pedido:** o navegador manda só os códigos das ofertas (`extra_offer_human_ids`); o servidor confere cada livro (coleção, oferta ATIVA, mesmo ambiente, sem repetir livro nem arquivo, até 5 no total) e usa o preço da oferta. O primeiro livro é o item principal; os outros entram como itens extras (`is_bump = TRUE`), entregues no mesmo PAID. Não combina com o adicional.
- **Quais livros:** Trattoria = oferta OFF-000001 e Dolci = OFF-000005 (código fixo); Pães, Antipasti e Risotos pela chave do produto (D-0061). Só aparecem avulsos os que têm oferta ATIVA na conta real (`GET /api/public/collection`).
- **Kit de 5:** a página e o pagamento mostram os 5 livros quando a oferta do kit entrega 5 PDFs ou mais (`delivery_files`); com menos, continua a página do kit de 2 livros, sem avulsos.
- **Textos:** o pagamento não promete mais "acesso permanente" e explica o CPF ("o banco exige para gerar o Pix; fica protegido e é apagado depois do pagamento").

## D-0073 — Números desde o início das vendas (2026-10-15)

- **Decisão (Ricardo, 15/10/2026 10h38):** as telas mostram a operação a partir de **25/09/2026**, quando as vendas começaram de forma contínua. O gasto e os pedidos da fase de testes (campanhas E2E e EXP-2026-001, R$ 1.480, e os pedidos de 09/09) ficam fora de todos os períodos, inclusive "Tudo".
- **Como:** `OPERATION_START_DATE` no servidor (padrão 2026-09-25; `off` desliga). Nada é apagado; o histórico continua no banco.
- **Tentativas de teste:** pedidos não pagos de Débora Souza Pena e Ricardo Andrade Lucas saem dos números por reclassificação (migration 064, critério da D-0002).
## D-0074 — Lembrete de pagamento para pedido pendente (2026-10-15)

- **Decisão (Ricardo, 15/10/2026 10h38, "2- Aprovado"):** o NORQVA manda até 3 e-mails para quem gerou Pix ou cobrança no cartão e não pagou: aos 15 minutos, às 2 horas e às 20 horas.
- **Regras:** só pedidos reais das últimas 30 horas; nunca para quem já pagou outro pedido; um e-mail por etapa; com Pix vencido, o e-mail leva para a página gerar outro. Desliga com `PAYMENT_REMINDER_ENABLED=false`.

## D-0075 — Oferta depois da compra do Trattoria (2026-10-15)

- **Decisão (Ricardo, 15/10/2026 10h38, "2- Aprovado"):** quem compra o Trattoria vê, na tela de entrega, os outros 4 livros da coleção (Dolci, Pães, Antipasti, Risotos) por **R$ 27,90**, num pagamento novo.
- **Regras:** só para pedido pago da conta real; não aparece para quem já tem algum desses livros no pedido nem para quem já comprou a oferta. O preço é o da oferta no servidor (migration 066, `offers.post_purchase_offer_id`).

## D-0080 — Livro + Dolci por R$ 24,90 e kit de 5 por R$ 29,90 (2026-10-16)

- **Decisão (Ricardo, 16/10/2026 01h42, contrato NORQVA-0080, "Aprovado"):** o kit de 5 a R$ 79,92 vendia pouco. Cada livro (Trattoria, Pães, Antipasti, Risotos) continua a R$ 19,90 e ganha o Dolci della Nonna por mais R$ 5,00 ("de R$ 34,80 por R$ 24,90"). O kit de 5 passa a R$ 29,90 (de R$ 94,50).
- **Cartão:** 1x sem acréscimo e 2,99% ao mês acima, com parcela mínima de R$ 5,00. Por isso não existe 10x nesses valores: 4x no livro, 5x no livro + Dolci, 6x no kit. A página mostra só o parcelamento real, com taxa e total.
- **Coerência:** ofertas de saída do kit pausadas; +4 livros depois do Trattoria a R$ 9,90; Kit Cozinha Italiana (OFF-000006) a R$ 24,90. O "de" é sempre a soma real dos preços avulsos.


## D-0082 — NORQVA Premium: nova Visão Geral, gráfico diário e nome do produto nas campanhas (2026-10-16)

- **Decisão (Ricardo, 16/10/2026 16h24, respostas 1 a 5 ao relatório da NORQVA-0082):** visual aprovado; "Início" e "Ajustes" na barra do celular; gráfico diário aprovado; campanhas mostram o **nome do produto** (sugestão dele); envio da branch autorizado.
- **Design System:** tokens `nq-*` no Tailwind (fundo #101010, superfícies #1D1D1D/#252525, texto #F5F5F5/#A3A3A3, verde #10B981 só para resultado positivo e ação principal; vermelho de texto #F87171; botão verde com texto escuro). Texto mínimo de 12 px. Peças compartilhadas em `components/ui/premium.tsx`; nenhuma tela cria estilo próprio.
- **Gráfico diário:** `GET /api/executive/daily` (só leitura, mesmos perfis do painel) separa por dia as mesmas regras do `/financial/dashboard`: pedidos PAID pelo dia do `created_at` em São Paulo e gasto em linhas diárias da Meta (ACCOUNT, senão CAMPAIGN). A soma dos dias bate com o total (teste `norqva_0082_daily_series`).
- **Nome do produto:** `byCampaign` ganhou `productId` e `productName`, pelo mesmo vínculo comprovado da NORQVA-0008 (`resolveCampaignProducts`). Sem vínculo único, a tela mostra o nome da Meta. Nada no banco mudou.
- **Comparação:** a Visão Geral compara com o período anterior de mesmo tamanho; não compara "Hoje", "Tudo" nem período anterior que cairia antes de 25/09/2026 (D-0073).
- **Produção:** merge só com o "sim" explícito do Ricardo (briefing do redesign); as outras telas seguem uma por PR.

## D-0089 — NORQVA Premium concluído nas telas internas (2026-10-16)

- **Decisão (Ricardo, 16/10/2026, "sim" para o merge de cada etapa):** Visão Geral (0082), Campanhas (0083), Teto (0084), Vendas (0085), Resultados e Pesquisa (0086), Produtos e Criativos (0087), Marcas, Equipe, Configurações e WhatsApp (0088) seguem o Design System `nq-*`. Só apresentação: nenhuma chamada, fórmula, permissão ou ação protegida mudou.
- **Certificação (NORQVA-0089):** 17 telas medidas em 320, 360, 390, 430 e 1280 px (85 medições): nenhum texto abaixo de 12 px, nenhum botão ou campo abaixo de 40 px, nada cortado nem arrastando para o lado, nenhum erro de tela. Capturas com dados simulados.
- **Correções de exibição feitas no caminho:** textos fixos que não vinham do servidor foram removidos (nome de campanha em Criativos, "Conciliado 100%", situação "ACTIVE" inventada, "Status: ACTIVE" na Equipe, "NODE_ENV"/"PostgreSQL" em Configurações, selo "Commerce: Pré-produção").
- **Fora do escopo:** página pública de venda, pagamento e entrega ao comprador (fluxos protegidos), tela de login, janela "Arquivos de entrega" e janelas antigas de experimentos.
- **Próxima etapa (combinada com o Ricardo em 16/10/2026 19h59):** gestão da Equipe (criar com convite por e-mail, editar nome e perfil, desativar em vez de excluir, travas para nunca ficar sem administrador). Mexe em controle de acesso: precisa do "Aprovado" antes de começar.


## D-0092 — Gestão da Equipe pelo app (2026-10-16)

- **Decisão (Ricardo, "Aprovado" em 16/10/2026 22h06):** administrador convida por e-mail, edita nome e perfil, desativa e reativa pela tela Equipe. Ninguém é apagado.
- **Travas:** só ADMIN; ninguém desativa a si mesmo nem tira o próprio perfil de administrador; o servidor recusa qualquer ação que deixaria a equipe sem administrador ativo.
- **Convite:** pelo Supabase Auth (envio padrão, limite de poucos e-mails por hora); remetente próprio da NORQVA pode ser configurado depois no Supabase sem mudar o app.
- **Fora do escopo:** perfis novos, mudar permissões de perfil, troca de e-mail, login com Google, exclusão definitiva.

## D-0095 — Central de pendências (2026-10-16)

- **Decisão (Ricardo, "Sim" às etapas 1 e 2 do diagnóstico NORQVA-0093 em 16/10/2026 22h29):** o sino conta avisos não lidos de cada pessoa e abre a central; Campanhas e Operação contam só pendências abertas (Atenção ou Crítico). Os dois números não se misturam.
- **Regras:** ler não resolve; resolver só com evidência (venda chegou, anúncio parou, leitura voltou, campanha pausada, teto subiu); descartar é decisão registrada e, em alerta crítico, pede motivo.
- **Descartar:** vale para o problema inteiro (duplicados juntos) e sai também da lista antiga em Resultado e controle. Um anúncio com "gasto sem venda" descartado não gera novo alerta da mesma regra enquanto o descarte existir (decisão do operador prevalece).
- **Gravidade por tipo:** gasto sem venda e falhas do vigia = Crítico; 90%, 100% e pausa no teto = Atenção; 80% e teto ampliado por lucro = Informativo.

## D-0094 — Segurança em Campanhas (2026-10-16)

- Rota antiga `migrate-destination-url` desligada (410).
- Campanha de plano pausada pela tela só volta com o código do plano digitado (vale como novo Sim) e nunca acima do teto; o Sim limpa essa marca.
- Orçamento mudado pela tela atualiza o plano (o vigia projeta com ele); plano no teto não muda orçamento por aqui.
- A chave `META_MUTATION_ENABLED` desligada continua bloqueando até a pausa: é o "desliga tudo" de propósito.

## D-0096 — Gerenciar campanha (2026-10-16)

- **Decisão (Ricardo, "Sim" à etapa 3 em 16/10/2026 23h12):** a campanha abre na Visão geral, com cinco abas (Visão geral, Configurações, Criativos, Resultados, Histórico) e Pausar sempre no topo. Só reorganiza ações que já existiam; nenhuma ação nova na Meta.
- **Rentabilidade:** ROAS de equilíbrio = preço ÷ líquido por venda; CPA máximo = líquido por venda; margem estimada = vendas × líquido − investido (sem custos fixos). Sem custos cadastrados na oferta, usa a estimativa do vigia e avisa.
- **Histórico:** auditoria para todos os perfis; decisões só para administrador, sem dados de acesso.

## D-0097 — Alterações com confirmação da Meta (2026-10-16)

- **Decisão (Ricardo, "Aprovado" em 16/10/2026 23h32):** pausar, reativar e orçamento viram fichas; "Confirmado pela Meta" só depois de reler a Meta. O envio usa as mesmas rotas e travas de antes.
- **Performance:** pausa sem esperar (só reduz gasto); reativar e orçamento ficam aguardando o administrador por até 24 h.
- **Orçamento:** aumento mostra a diferença por dia e em 30 dias e pede confirmação a mais.

## D-0098 — Novas edições de campanha (2026-10-17)

- **Decisão (Ricardo, "Aprovado" em 16/10/2026 23h59):** pelo NORQVA, o administrador vê o público, edita a descrição, troca o vídeo de um anúncio no ar, renomeia campanha/conjunto/anúncio e marca a data de término do conjunto.
- **Vídeo novo:** só de criativo aprovado da oferta, com o mesmo crivo da criação e sem preço; peça nova no mesmo anúncio (a Meta revisa de novo).
- **Data de término:** só futura; tirar a data e editar público ficam pelo Gerenciador.
- Cada edição relê a Meta antes de dizer que foi feita.

## D-0107 — E-mail de acesso com a marca e lembrete de download (2026-10-21)

- **Decisão (Ricardo, "2 sim" em 21/10/2026 20h12):** o e-mail de acesso sai com o nome da marca do produto no remetente (mesmo endereço; sem marca, "NORQVA"), em visual claro com botão "Baixar meu livro" e a dica de procurar no spam.
- **Lembrete de download:** quem pagou e não baixou recebe link novo 3 h e 24 h depois da confirmação do pagamento; no máximo dois por pedido (pedido antigo: só o de 24 h), pelo menos 12 h entre eles, até 30 dias depois do pagamento. Nunca para estorno, entrega bloqueada, teste ou demo. `DOWNLOAD_REMINDER_ENABLED=false` desliga.
- **DNS:** registro DMARC `_dmarc.norqva.com.br` TXT `v=DMARC1; p=none; adkim=r; aspf=r`, criado pelo Ricardo no Registro.br.

## D-0110 — Vendas da Kiwify no NORQVA (2026-10-21)

- **Decisão (Ricardo, "Aprovado" em 21/10/2026 20h52):** vendas feitas na Kiwify entram no NORQVA pelo webhook assinado `POST /api/webhooks/kiwify` (HMAC-SHA1 do corpo com `KIWIFY_WEBHOOK_TOKEN`; sem token, nada é gravado) e ficam em `external_sales` (PAID, REFUNDED, CHARGEBACK), sem CPF, telefone, endereço ou cartão. Contam em Vendas (etiqueta "Kiwify", sem ações de entrega) e no Financeiro (receita, tarifa da Kiwify, campanha por `utm_campaign` = nome da campanha e criativo por `utm_content` = nome do anúncio). Pagamento e entrega dessas vendas são da Kiwify; o NORQVA só registra.

## D-0112 — Seca Barriga no checkout do NORQVA (2026-10-22)

- **Decisão (Ricardo, "Aprovado" em 22/10/2026 15h22):** o "Desafio Seca Barriga 21 Dias" (R$ 37,00, 10 PDFs) passa a ser vendido pelo checkout do NORQVA (Asaas, Pix e cartão com as regras dos livros) no lugar da Kiwify. Entrega só com PAID confirmado pelo Asaas, como sempre.
- **Link direto:** `/p/<oferta>?checkout=1` abre o pagamento já preenchido com `name`, `email` e `phone` do quiz; esses dados saem do endereço na hora (não vão para Pixel, telemetria nem para o endereço gravado no pedido). UTMs, `fbclid` e `src` seguem para o pedido.
- **Visual por produto:** pelo nome da oferta. "Seca Barriga" = "fresh" (claro, verde #10B981→#059669, coral #F0795B, Inter); livros = "light"; Bolso Blindado = "dark". Quem compra pelo link direto não vê material de venda de outro produto.
- **Vários PDFs:** qualquer oferta pode entregar vários arquivos; mais um PDF sobe por `POST /api/offers/:id/delivery-files/extra` (ADMIN, até 20 por oferta, sem repetir o mesmo arquivo).
- **Risco registrado:** o repositório no GitHub é público e `backend/public/products/` tem os PDFs pagos do Trattoria. Nada foi apagado; a decisão (repositório privado ou tirar os arquivos do git) é do Ricardo.

## D-0115 — Referências: só a estrutura (2026-10-23)

- **Decisão (contrato aprovado pelo Ricardo):** o NORQVA lê uma página de venda ou anúncio de referência (link colado pelo dono ou de 1 a 5 prints) e guarda **só a estrutura**: papel, função e forma de cada parte (tamanho, título, imagem, vídeo, botões), tom e tamanho da página. Texto, HTML, imagens, prints, nomes, marcas, depoimentos e números da referência **nunca** são gravados.
- **Link:** do link fica só o domínio (`source_host`) e um hash sha256 do link normalizado (`source_url_hash`, para achar repetidos). O caminho não é guardado nem devolvido (decisão do tech lead na revisão).
- **Anticópia:** ficam só impressões (sha256 cortado em 16) de cada janela de 6 palavras do texto de origem, para a etapa 2. Antes de gravar, todo texto livre da estrutura **e as observações do dono** passam por limpeza e viram texto genérico se tiverem: qualquer número; janela de 6 ou de 3 palavras igual à da referência; o texto inteiro dentro de um trecho da referência; nome próprio da referência; sequência de 2 ou mais palavras com maiúscula da referência (marcas de palavras comuns, como "Seca Barriga"). As janelas de 3 palavras e os textos normalizados vivem só em memória. Prints com menos de 15 palavras conferíveis ficam só com os textos fixos do NORQVA. Página grande demais para as impressões fica marcada (`fingerprint_truncated`).
- **Origem:** só link colado à mão ou prints enviados pelo dono. Nada de raspar a Biblioteca de Anúncios da Meta: links de facebook.com, fb.com, fbcdn.net e instagram.com (também depois de redirecionar) são recusados com "Para anúncios da Biblioteca da Meta, envie prints em vez do link."
- **Segurança da leitura:** só http/https nas portas 80/443, nenhum endereço interno (conferido no nome e de novo na conexão), até 3 redirecionamentos conferidos, um prazo único de 10 s para tudo (DNS com no máximo 5 s), 3 MB (também depois de descomprimir). Leitura do HTML linear (sem regex com retrocesso), para HTML sem fechamento não travar o servidor.
- **Trava:** `CREATIVE_REFERENCES_ENABLED=true` liga; desligada, as rotas respondem 404 e a aba some. Modelo da IA em `CREATIVE_AI_MODEL` (sem ele, `OPENAI_MODEL`, depois `gpt-4o-mini`), até 8000 tokens de resposta; sem `OPENAI_API_KEY`, link usa palavras-chave e prints falham com "IA não configurada".

## D-0116 — Geração a partir de uma referência: página e anúncios 100% nossos (2026-10-23)

- **Decisão (contrato aprovado pelo Ricardo):** de uma referência pronta (só o esqueleto, D-0115) e de um produto nosso com a oferta, o NORQVA escreve uma página de venda original e de 3 a 5 anúncios. A IA **nunca vê texto da referência**: recebe só o esqueleto (papel, função, tamanho) e os fatos do produto que estão no banco (produto, oferta, arquivos entregues, promessas aprovadas).
- **Preço sempre da oferta, na hora:** a IA não recebe nem escreve preço ou parcelas. A seção de oferta mostra preço e parcelas calculados quando a página é aberta, com a mesma conta do pagamento (`publicCardTerms`, agora em `services/commerce/cardTerms.ts`, parcela mínima de R$ 5,00). Mudou o preço da oferta, a página publicada muda junto. Toda página tem uma seção de oferta. Anúncio sem preço (D-0053).
- **Checagem de cada texto (página e anúncio):**
  - cópia: janela de 6 palavras igual à da referência (mesma normalização e hash da etapa 1). **Limite:** trechos iguais com menos de 6 palavras seguidas não são pegos (é o que as impressões guardadas permitem); a defesa principal é a IA nunca receber o texto da referência. A lista é conferida item a item e também com os itens juntos;
  - preço: qualquer preço, parcela, "R$", desconto ou a palavra "preço" (`priceInCopy.ts`), em qualquer texto;
  - números: só os que aparecem nos fatos do produto, comparados inteiros e com unidade ("28", "4x", "10 PDFs"); números por extenso (dois, dez, cem, mil, milhares, centenas...) também, menos "um/uma" (artigos);
  - saúde/emagrecimento: perca/perder X kg ou medidas, emagreça X/rápido, elimine/queime/derreta gordura, seque a barriga, barriga chapada/negativa, resultados em X dias, sem dieta/exercício/esforço, garantido/garantia de resultado, cura, trata, tratamento, detox. Só passa se o texto trouxer a promessa aprovada **inteira** (pedaço não vale); os nossos nomes (produto, oferta, arquivos) não contam.
  - Falhou: gera de novo aquela parte até 2 vezes (em paralelo, no máximo 3 de cada vez); continuou: bloqueia com aviso. Cópia que continua é esvaziada. Edição manual com problema nos campos mudados é recusada.
- **Sem invenção:** depoimentos, resultados e autoria nunca vêm da IA: a seção mostra o texto das promessas aprovadas do tipo certo, sem edição na tela, ou sai (depoimento/prova sem promessa vira prévia do conteúdo). Urgência sempre sai. Garantia: a IA escreve a chamada e a frase do direito de arrependimento (CDC, 7 dias) é texto fixo.
- **Anúncios na fábrica:** ficam em `creatives` (ligados à referência e à página). A fábrica leva a ligação para a versão nova e para a edição no lugar; texto mudado fora da tela de geração fica com a checagem vencida. Na aprovação pela fábrica a checagem roda de novo, na hora, sobre o texto atual (função registrada pelo `generationService`; sem ela, bloqueia). A promessa só é ligada ao anúncio quando o texto dela aparece inteiro nele.
- **Página:** rascunho → aprovada (ADMIN) → no ar em `/v/<slug>` (ADMIN, oferta ativa ou em teste) → fora do ar. Mudou o conteúdo, volta para rascunho; no ar não muda. Gravação com versão (`generated_pages.version`) para edição e imagem não se atropelarem. Página e anúncios são gravados numa transação só. A rota pública só mostra página publicada e só campos seguros; os botões levam ao pagamento do NORQVA repassando só utm_*, fbclid, gclid, ref e src (nunca nome, e-mail ou telefone). PageView e ViewContent (pixel da marca) como em /p e /kit.
- **Limite de uso:** 10 gerações e 30 "Gerar de novo" por pessoa por hora (em memória).
- **Imagens:** com `KIE_API_KEY` e o bucket `CREATIVE_IMAGES_BUCKET` (padrão `creative-images`) criado no Supabase, imagens novas na KIE a partir só dos nossos dados (link assinado guardado por 50 minutos); sem a chave ou sem o bucket, as imagens que o produto já tem, com o aviso. Imagem da referência nunca. Vídeo fica para depois.
- **Trava:** a mesma `CREATIVE_REFERENCES_ENABLED` das rotas internas. A página pública já publicada continua no ar mesmo com a trava desligada (tirar do ar é uma ação do ADMIN), para um anúncio rodando não cair sem aviso.

## D-0117 — Campanha pausada a partir da página gerada (2026-10-23)

- **Decisão (contrato aprovado pelo Ricardo):** de uma página gerada PUBLICADA (D-0116) e dos anúncios dela APROVADOS, o NORQVA monta o plano de lançamento de sempre e cria campanha, conjunto e anúncios de imagem na Meta, **tudo PAUSADO**. Ativar e gastar fica só com o dono, pelo "Sim" do plano com o código (D-0094). Esta etapa nunca ativa.
- **Mesmo caminho do plano de lançamento:** sem rotina paralela. O plano aceita anúncio de imagem (cada imagem enviada uma vez em `adimages`, hash guardado pela origem; peça com o hash) e o destino `/v/<slug>` no site do comprador (`META_GENERATED_PAGE_HOSTS`) **só em plano ligado a uma página gerada** (plano comum com `/v/` é recusado). Criação pela mesma rotina com registro de decisão.
- **Um plano por página** (índice único). Segundo clique: rascunho, falha ou recusa **sem nada na Meta** é montado de novo na mesma linha (mesmo código, imagens já enviadas valem); com objetos na Meta, devolve o plano como está (retomar ou responder em Campanhas).
- **Trava extra "só PAUSED":** todo POST desta criação passa por `assertOnlyPausedPayload`: só criação na conta (`/act_X/campaigns|adsets|ads|adcreatives|adimages`), nenhuma situação diferente de PAUSED, criação sempre com PAUSED. Vale também pela rota genérica de criação do plano. A trava fica numa cópia do cliente; a ativação pelo "Sim" usa o cliente normal.
- **Conferência na hora:** página no ar, oferta à venda com preço, anúncio (o criativo gravado no plano) aprovado e igual ao aprovado, checagem da 0116 refeita, sem promessa de preço, sem preço no texto, texto do plano igual ao do criativo, nome da campanha único entre os planos. Sem imagem, bloqueia.
- **Imagens:** só da abertura e das seções do produto (nunca a de preço). Imagem nova (armazenamento) fica no plano como `storage:` e ganha um link assinado novo na hora de enviar à Meta; download com prazo de 15 s, sem redirecionamento, até 8 MB, só de hosts do NORQVA.
- **Padrões:** "NQ – <produto> – Ref <REF> – Vendas" (com o código da página se o nome já existir), R$ 30/dia, teto de 7 dias (editável pela D-0052), Brasil 25–65, Advantage, pixel oficial, Compra. **UTMs iguais às de todo plano** (`urlTagsFor`: `utm_source=meta`, `utm_medium=paid_social`, `utm_campaign=<plano>`, `utm_content=<criativo>` e os ids de campanha, conjunto e anúncio), para a venda ser atribuída por anúncio; a página gerada repassa esses parâmetros ao pagamento.
- **Trava geral:** `META_MUTATION_ENABLED` desligada = só o rascunho, com "Cadastro na Meta desligado".

## D-0118 — Pausa noturna das campanhas (2026-10-23)

- **Decisão (contrato aprovado pelo Ricardo em 23/10/2026 21h22):** todo dia, no horário de Brasília (America/Sao_Paulo, calculado no código), o NORQVA pausa às 00:00 cada campanha ATIVA de plano com a pausa noturna ligada e reativa às 06:00 só o que ele mesmo pausou e que continuou pausado. Servidor fora às 06:00: reativa quando voltar, até 23:59 do mesmo dia; depois, fica pausada com aviso.
- **Por plano:** Gerenciar campanha → Configurações → "Pausa noturna (00h–06h)", ligada por padrão (inclusive nas campanhas que já existiam), horários editáveis no mesmo dia (início antes do fim). Mudança vale a partir da próxima janela.
- **Só reativa o que pausou:** cada noite tem uma linha por campanha (`night_pause_runs`, chave única campanha + data). Qualquer outra mão na campanha durante a noite cancela a volta e registra: pausa pela tela, ficha de alteração (Performance), vigia do teto (decisão ou CAPPED), teto ou orçamento mudados, alteração no Gerenciador (`updated_time` ou orçamento diferentes na Meta). Antes de reativar relê a Meta: precisa estar PAUSED e longe do teto do plano e do limite de gastos da campanha.
- **Só situação:** o envio só aceita `{status: PAUSED|ACTIVE}` no ID da campanha. Nunca cria nada, nunca muda orçamento nem teto. Campanha protegida (CONTROL) nunca é tocada.
- **Chaves:** `NIGHT_PAUSE_ENABLED=true` liga as pausas novas; desligada, o que já foi pausado ainda volta. `META_MUTATION_ENABLED` vale como sempre.
- **Registro:** fichas "Pausa noturna" / "Fim da pausa noturna" com "Confirmado pela Meta" depois da releitura (D-0097), decisões `NIGHT_PAUSE` / `NIGHT_PAUSE_RESUME` e registros no Histórico. Falha ao pausar ou reativar, volta cancelada e pausa vencida abrem aviso na central (D-0095).
- **Repetição:** agendador no servidor a cada 2 minutos; criar a linha da noite e tomar a reativação são atômicos no banco, então reinício ou duas instâncias não pausam nem reativam duas vezes.
- **Revisão:** resposta perdida da Meta é resolvida relendo a Meta; reativar tenta até 5 vezes até 23:59 (aviso na 3.ª); trava do plano no banco compartilhada com o vigia e a pausa pela tela, plano relido antes do envio e, se alguém mexeu no mesmo instante, pausa de novo com aviso crítico; fim da janela até 23:00; pausa só nos primeiros 60 minutos; Gerenciador detectado pelo registro de atividades da conta (sem ele, `updated_time`). Como o token pode ser do próprio dono, evento "nosso" é só o do app do token (`GET /app` ou `META_APP_ID`) ou, sem app no evento, a nossa própria mudança de situação até 2 minutos do nosso envio; todo o resto cancela a volta.
- **Fica para um contrato futuro:** orçamento por hora e reanálise da janela com 100+ vendas.
