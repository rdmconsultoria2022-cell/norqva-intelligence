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
