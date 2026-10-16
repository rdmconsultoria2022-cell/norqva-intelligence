# NORQVA-0081: menu fixo no topo, perfil com o nome e barra de áreas no celular

**Branch:** `ai/NORQVA-0081-menu-topo-mobile` · **Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude
**Pedido:** Ricardo, 16/10/2026 02h22, com prints do app da XP e da tela Campanhas no celular. **Autorização:** mudança de tela (D-0037, sem aprovação prévia). · **Risco:** LOW

## Pedido

- Tirar todo "AUTH_MODE" do sistema.
- Perfil no canto superior esquerdo, só com o nome; ao tocar, abre os dados do perfil e "Sair".
- Tirar o botão "Sincronizar" do topo.
- Computador: menu fixo no topo com a logo NORQVA e as telas logo abaixo, discretas.
- Celular: menu embaixo, como o app da XP.

## Mudanças

- Menu lateral removido (`Sidebar.tsx`). Dados do menu em `components/layout/navigation.ts` (`navigationGroups`, `visibleGroups`, `groupOfTab`, ícones das áreas).
- `Header.tsx`: perfil (`UserMenu.tsx`: iniciais + primeiro nome; abre nome completo, e-mail, perfil em português e "Sair"; fecha ao tocar fora ou com Esc) à esquerda, logo NORQVA no centro, período à direita nas telas em que filtra. No computador, faixa com as 11 telas (`ScreenTabs`), separadas por área, sublinhado verde na tela aberta.
- Celular: barra fixa embaixo com as 5 áreas e ícones (`AreaTabBar`), alerta somado na área; tocar abre a primeira tela da área. Área com mais de uma tela mostra as telas dela numa faixa curta abaixo do topo (`AreaSubTabs`).
- Saíram: o selo "AUTH_MODE=…" do topo, o botão "Sincronizar"/"Recarregar dados" do topo, o nome da tela no topo, o botão de menu (hambúrguer) e a linha "AUTH_MODE demo" de Configurações. Na tela de login (só fora da produção), os botões passam a "Demonstração" e "Conta real".
- O "Sincronizar" da integração Meta em Configurações e o "Sincronizar Agora" da Meta continuam (sincronizam a Meta, não recarregam a tela).

## Testes

- `frontend/src/tests/norqva_0081_top_menu.test.tsx` (novo)
- Atualizados: `norqva_0024_menu_areas`, `norqva_0071_header_period_layout`, `norqva_0009_meta_results_alerts`, `norqva_0017_campaign_base`, `norqva_0028_campaign_complete`, `norqva_0030_products_results`, `auth.test`.

## Execução

(preencher depois do merge)
