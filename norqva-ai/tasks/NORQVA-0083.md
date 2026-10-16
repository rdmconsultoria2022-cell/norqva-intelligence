# NORQVA-0083: tela Campanhas no Design System NORQVA Premium (fase 4, etapa 2)

**Branch:** `ai/NORQVA-0083-campanhas-premium` (a partir da `main`, depois do merge da NORQVA-0082)
**Executor:** Claude · **Revisão:** revisão independente (subagente) + CI · **Merge:** só com o "sim" do Ricardo depois de ver as capturas
**Autorização:** Ricardo, 16/10/2026 16h59 ("Aprovado! Pode começar"), plano do redesign (D-0082). · **Risco:** LOW (só apresentação)

## Escopo

- `CampaignsView`: cartões com o **nome do produto** (oferta → produto; campanhas de fora pelo vínculo da D-0082), nome da Meta embaixo, situação, investido, receita, vendas, CPA e ROAS; alerta e "Receita abaixo do investimento"; código, oferta e IDs em "Detalhes técnicos"; no celular a campanha aberta ocupa a tela, com "Campanhas" para voltar; abas em botões; formulário com campos de 44 px.
- `MetaAdsView` (aba "Resultado e controle"): no celular as tabelas de campanha, conjunto e anúncio viram lista (só um dos dois layouts é desenhado, com `useIsMobile`; sem `matchMedia`, fica a tabela); números numa superfície só; decimais com vírgula.
- Tokens `nq-*` em `LaunchPlansCard`, `MetaControl`, `MetaResults`, `AdMetaSwap`, `ExperimentGuardCard`, `MethodView` e no seletor de período (troca só de classes; script de conferência no harness).
- Topo: nome do perfil só a partir de 640 px; com o período no topo, abaixo de 420 px fica só o símbolo da marca.

## Leituras

- Campanhas do NORQVA: nome do produto pela oferta (dado já carregado). Campanhas criadas fora do NORQVA: o nome vem do `/financial/dashboard` (vínculo da D-0082), lido **só quando existe campanha de fora**.
- No celular, com uma campanha aberta, o quadro "Aguardando sua decisão" fica na lista; o detalhe mostra o aviso "N campanha(s) aguardando seu Sim", que volta para ele.

## Regras respeitadas

Nenhuma regra, rota, fórmula ou permissão mudou. Sim/Não, criar pausada, pausar/ativar, orçamento, teto, editar anúncio e auditoria continuam nos mesmos componentes e handlers; no celular a lista usa o mesmo `MetaControlActions` com o mesmo alvo e o mesmo diálogo de confirmação.

## Testes

Atualizados: `norqva_0028_campaign_complete` (cartão novo: "Vendas 2", "1 alerta"), `meta_phase_a` e `norqva_0006_meta_control` (decimais com vírgula).
