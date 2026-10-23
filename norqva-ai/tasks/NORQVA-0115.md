# NORQVA-0115: Referências (etapa 1): tirar só a estrutura de uma página de venda ou anúncio

**Branch:** `ai/NORQVA-0115-referencias` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde e da revisão
**Autorização:** contrato aprovado pelo Ricardo (Claude Docs, recurso "Referências", etapa 1) · **Risco:** LOW (tabela nova, nada muda em pagamento, entrega, Meta ou dados de clientes; trava desligada por padrão)

## Decisão

D-0115. O dono cola o link de uma página de venda (ou envia de 1 a 5 prints de página ou anúncio, com o texto do anúncio opcional) e escolhe um produto nosso. O NORQVA guarda **só a estrutura** (função e forma de cada parte). Texto, HTML, imagens, nomes, marcas, depoimentos e números da referência nunca são gravados.

## Escopo

- Migration 076: tabela `creative_references` (código `REF-000001`, produto, origem, tipo, situação, motivo da falha, `structure` em JSONB, contagem de palavras, `source_shingles` = impressões sha256 cortadas em 16 de cada janela de 6 palavras normalizadas, observações do dono, `data_provenance`, lixeira por `deleted_at`). Só aditiva.
- `services/creative/referenceService.ts`:
  - `fetchPage`: só http/https, portas 80/443, sem usuário/senha, nome resolvido e conferido (nenhum IP interno, de loopback, link-local, privado ou reservado), a conexão confere o IP de novo na hora de conectar, até 3 redirecionamentos (cada um conferido), 10 s, 3 MB, User-Agent de navegador. Rede e DNS trocáveis nos testes (`setPageFetchForTests`).
  - `htmlToBlocks`: leitura determinística em blocos (título, parágrafo, lista, botão, imagem, vídeo, formulário, depoimento, pergunta frequente), sem script/estilo/menu/rodapé. O texto dos blocos fica só em memória.
  - `extractStructure`: OpenAI como o atendente do WhatsApp (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, modelo `CREATIVE_AI_MODEL || OPENAI_MODEL || gpt-4o-mini`), saída em JSON com esquema estrito; prints no formato de imagem (data URL). O prompt proíbe copiar/parafrasear frases, nomes, números, preços e depoimentos. Validador limpa valores desconhecidos e corta textos.
  - Limpeza: todo texto livre da estrutura passa por um filtro (janela de 6 palavras igual à da referência, preço/porcentagem/peso, nome próprio da referência) e vira um texto genérico do NORQVA.
  - Sem chave da IA: página lida pelo link usa estrutura por palavras-chave (garantia, bônus, depoimento, perguntas frequentes, oferta, preço); prints ficam FAILED "IA não configurada".
  - Nos prints, a IA devolve também a transcrição do texto visível (`visible_text`), usada só para as impressões e para a limpeza e descartada em seguida.
- Rotas (`controllers/creativeReferenceController.ts`): `GET /api/creative-references/status` (todos os perfis), `POST /api/creative-references` e `POST /api/creative-references/screenshots` (ADMIN, CREATIVE), `GET /api/creative-references` e `/:id` (ADMIN, CREATIVE), `DELETE /api/creative-references/:id` e `POST /:id/restore` (ADMIN). Prints chegam como JSON com `Content-Type: application/vnd.norqva.screenshots+json` (limite próprio de 30 MB; o JSON comum do site segue com 1 MB), até 5 imagens de 4 MB (PNG, JPG, WEBP, GIF conferidos pelo conteúdo).
- Trava `CREATIVE_REFERENCES_ENABLED` (padrão desligada): desligada, as rotas respondem 404 com mensagem clara e a tela esconde a aba.
- Tela Criativos: abas "Criativos" e "Referências" (`CreativeReferences.tsx`): link ou prints, produto, tipo, lista com situação, esqueleto em cartões ordenados (papel em português, para que serve, estilo do título, palavras, imagem, vídeo, botões), lixeira com Restaurar. Aviso: "O NORQVA guarda só a estrutura. Textos, imagens e nomes da referência não são salvos."

## Variáveis de ambiente

- `CREATIVE_REFERENCES_ENABLED=true` liga o recurso (padrão: desligado).
- `CREATIVE_AI_MODEL` (opcional): modelo da IA para referências; sem ele usa `OPENAI_MODEL` e depois `gpt-4o-mini`.
- Usa a `OPENAI_API_KEY` (e `OPENAI_BASE_URL`, opcional) que já existe para o atendente.

## Regras

Só o link colado pelo dono (nada de raspar a Biblioteca de Anúncios). Nada da referência é gravado além da estrutura e das impressões. Testes nunca falam com a internet, a OpenAI ou a Meta. Etapa 2 (gerar material original a partir do esqueleto, com checagem anticópia pelas impressões) fica para depois.
