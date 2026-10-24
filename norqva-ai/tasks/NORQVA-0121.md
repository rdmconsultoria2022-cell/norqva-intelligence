# NORQVA-0121: Fábrica de Criativos (etapa C): todos os ajustes antes de publicar

**Branch:** `ai/NORQVA-0121-fabrica-publicacao` (a partir da `main` com a NORQVA-0119)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** Ricardo, 23/10/2026 21h46 ("2 aprovado": etapa C com os padrões da tabela), contrato no Claude Docs "NORQVA-0118 — Fábrica de Criativos (fluxo único)" · **Risco:** MEDIUM (mexe no que é criado na Meta; tudo continua PAUSADO, nada ativa nem gasta)

## Decisão

D-0121. A campanha da página gerada aceita todos os ajustes da tabela do contrato, já preenchidos com o padrão aprovado. Continua nascendo PAUSADA e só gasta pelo "Sim" do plano com o código.

## Escopo

- Público (`LaunchPlanTargeting`, opcional e compatível com os planos antigos): estados do Brasil (UF; a chave de cada estado vem da Meta na hora de criar, por `GET /search` tipo `adgeolocation`, só leitura), sexo (todos, mulheres, homens), posicionamentos (automático ou só Facebook e Instagram), público Advantage ligado ou desligado.
- Idade: com o público Advantage ligado, a Meta só aceita idade mínima de 18 a 25 e a máxima fica 65 ([documentação](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-expansion/advantage-audience/)). A faixa escolhida (ex.: 45–65) vai como sugestão (`age_range`), com idade mínima de controle até 25. Desligado, a idade fica travada. Isso também corrige planos antigos que mandariam idade mínima acima de 25 com Advantage (a Meta recusaria).
- Livro da coleção de cozinha (`products.collection_key`): sugestão 45–65 (público do Trattoria). Outros: 25–65.
- Término do conjunto (`end_date`, de amanhã até 1 ano, dia de Brasília; vai como `end_time` 23h59 de Brasília). Sem data, roda até pausar ou o teto parar.
- Destino: página gerada (padrão) ou página da oferta de sempre (`/p/` ou `/kit/`). WhatsApp aparece travado até o número oficial estar ativo. A conferência antes de criar aceita os dois destinos, todos os anúncios iguais.
- Anúncios que entram: escolher entre os prontos (já existia no servidor; agora na tela).
- Resumo do público no plano (`targeting_summary`), ex.: "MG, SP, 45–65 (sugestão), mulheres, público Advantage, só Facebook e Instagram".
- Tela: formulário "Criar campanha pausada" (Fábrica passo 6 e tela de geração) com destino, quem vê, onde, onde aparece, término e anúncios.

## Fora (de propósito)

Público por interesses, público semelhante e lances manuais (contrato: voltam com 50 compras).

## Testes

`backend/src/tests/norqva_0121_publication_options.test.ts`, novos casos em `backend/src/tests/norqva_0117_campaign.test.ts`, `frontend/src/tests/norqva_0121_fabrica_publicacao.test.tsx`.

## Revisão independente (aplicada)

- Os estados viram chaves da Meta **antes** de qualquer criação: estado não achado para com o plano intacto (nada na Meta), e dá para montar de novo sem ele.
- Data de término: na criação tem que ser depois de hoje; ao reler um plano já montado (Sim, edição) só confere o formato. No "Sim", conjunto cujo término já passou dá aviso claro ("terminou em DD/MM: monte de novo") e nada é ativado.
- Com Advantage ligado, o sexo também aparece como sugestão (resumo e aviso da tela); o aviso de idade mostra a faixa real (de min(idade, 25) a 65).
- Calendário do término de amanhã até 1 ano (mesma regra do servidor); estados ficam recolhidos em "Escolher estados".
- A pergunta do "Sim" mostra o público e o término.
