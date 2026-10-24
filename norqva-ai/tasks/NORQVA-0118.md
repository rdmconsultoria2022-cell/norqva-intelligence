# NORQVA-0118: Fábrica de Criativos (etapa A): aba Fábrica com os 6 passos

**Branch:** `ai/NORQVA-0118-fabrica-tela` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 23/10/2026 21h46 ("1 pode seguir, 2 aprovado"), contrato no Claude Docs "NORQVA-0118 — Fábrica de Criativos (fluxo único)" · **Risco:** LOW (só tela; usa rotas que já existem)

## Decisão

Juntar num passo a passo o que já existia (Referências 0115, Geração 0116, campanha pausada 0117) em vez de criar telas novas. A Fábrica abre primeiro em Criativos quando `CREATIVE_REFERENCES_ENABLED` está ligada.

## Escopo

- Criativos → **Fábrica** (`FactoryWizard.tsx`), 6 passos: Entrada, Análise, Produto, Geração, Aprovação, Publicação. Lembra a fábrica aberta neste navegador (`norqva.fabrica.run`) e lista o que está em andamento (páginas geradas e referências sem página).
- Passo 1: nome do produto acha o nosso produto (sem acento/maiúscula); "Criar o produto" (só ADMIN, `POST /api/products`, nasce planejado); link para a Biblioteca de Anúncios da Meta com o termo (só abre no navegador do dono; o NORQVA não lê esse site, D-0115); formulário de referência (link ou até 5 prints) com o produto já escolhido; referências prontas do produto para reaproveitar.
- Passo 2: o esqueleto lido (mesma vista da tela Referências).
- Passo 3: produto e oferta; "Criar oferta" (só ADMIN, `POST /api/offers`, nasce em rascunho); quantidade de anúncios e imagens KIE; "Gerar página e anúncios".
- Passo 4: a tela de geração de sempre, sem os botões de aprovar/publicar a página e sem a campanha (ficam nos passos 5 e 6).
- Passo 5: o que falta para publicar, com o botão de cada item: aprovar a página, pôr a oferta em teste (`PUT /api/offers/:id` com `TESTE`, só ADMIN), publicar a página, anúncios aprovados (volta ao passo 4). "Continuar" só com tudo feito.
- Passo 6: "Criar campanha pausada" de sempre (NORQVA-0117).
- **Copiar a versão NORQVA** (`factoryCopy.ts`): copia a página e os anúncios que o NORQVA escreveu para o nosso produto (com o que está digitado na tela), e cada anúncio sozinho. Nunca texto da referência.
- Refatoração sem mudança de comportamento: `ReferenceForm` e `ReferenceStructureView` saem de `CreativeReferences.tsx` para serem usados nos dois lugares.

## Regras

Nada novo no servidor; nada vai para a Meta por esta etapa; testes com a API simulada.

## Testes

`frontend/src/tests/norqva_0118_fabrica.test.tsx`.

## Revisão independente (aplicada)

- **Arquivo entregue ao comprador** virou item do passo 5 (`GET /api/offers/:id/digital-assets`): sem PDF ligado à oferta, "Pôr a oferta em teste", "Publicar página" e o passo 6 ficam travados, com o caminho em Produtos. Assim ninguém paga sem ter o que receber.
- Retomada: só apaga a fábrica salva quando o servidor diz que a página não existe; falha de rede mostra aviso e mantém.
- Passo a passo: check só nos passos já passados; passo 6 só com tudo pronto; passo 3 sem a referência (lixeira) mostra aviso e "Voltar".
- Falha ao analisar a referência aparece no passo 1; erro ao carregar a Fábrica aparece (antes ficava "Nada em andamento").
- A Fábrica abre primeiro só para ADMIN e CREATIVE; "Oferta liberada para compra" no lugar de "Oferta à venda".
- Teste da página pública (0116) espera o título com `waitFor` (falhava às vezes no CI).
- Pendente, com aprovação: o servidor ainda deixa uma oferta ir para TESTE/ATIVA sem arquivo (`PUT /api/offers/:id`); a trava hoje é só na tela da Fábrica.
