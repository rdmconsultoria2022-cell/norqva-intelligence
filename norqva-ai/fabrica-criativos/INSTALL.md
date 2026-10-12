# Instalação — Fábrica de criativos NORQVA

Base: Criativos Infinitos v2.2, adaptado pelo contrato NORQVA-0053. Roda num computador com
macOS, Linux ou Windows com WSL2 (Ubuntu). Não roda dentro do NORQVA (Render): o vídeo pronto é
anexado na tela Criativos.

## O que é do Ricardo

1. Conta na [KIE.ai](https://kie.ai) com crédito (US$ 10 a 20 para começar) e a chave da API.
2. Nesse computador: `export KIE_API_KEY="..."` no `~/.bashrc` (ou `~/.zshrc`) e abrir um terminal novo.
3. Se faltar node, python3 ou ffmpeg, colar UMA linha que o instalador mostra (precisa da senha do computador).

## Instalação (o Claude faz)

```bash
git clone https://github.com/rdmconsultoria2022-cell/norqva-intelligence.git
cd norqva-intelligence/norqva-ai/fabrica-criativos
./install.sh
```

O instalador copia a pasta para `~/.claude/skills/fabrica-criativos-norqva/`, cria um `.venv`
com Playwright + Chromium + faster-whisper e instala o Remotion do projeto de edição.

## Um pacote

1. Pasta do pacote com `script.json` (modelo: `templates/script-exemplo.json`).
2. Páginas REAIS do livro: `pdftoppm -png -r 110 -f 12 -l 12 LIVRO.pdf refs/pagina` → `refs/pagina-12.png` (renomeie para o nome usado no roteiro).
3. `python3 scripts/gen.py <pasta> images` → QC → `videos` → QC → `music`.
4. `cp -R templates/edit-template <pasta>/edit && (cd <pasta>/edit && npm install)`.
5. `python3 scripts/build_mudo.py <pasta>` → `cd <pasta>/edit && npx remotion render src/index.ts <Id> ../out/<Id>.mp4 --timeout=120000`.
6. QC final (grid de frames de cada mp4) e entrega dos mp4 ao Ricardo.

O `gen.py` e o `build_mudo.py` param se acharem preço no roteiro ou fala gerada por IA.

## Problemas comuns

| Sintoma | Correção |
|---------|----------|
| `createTask failed ... 401` | chave da KIE errada ou terminal antigo (`echo $KIE_API_KEY`) |
| `createTask failed ... 402` | sem crédito na KIE |
| `RECUSA DE CONTEÚDO` | parar e avisar o Ricardo (não trocar de gerador) |
| `PREÇO em script...` | tirar o preço do texto (D-0053) |
| Chromium não abre na raspagem | `.venv/bin/python -m playwright install chromium` |
| Render trava em "delayRender" | rodar com `--timeout=120000` |
