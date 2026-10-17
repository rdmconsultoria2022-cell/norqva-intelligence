# NORQVA-0090: nova tela de abertura NORQVA depois do login

**Branch:** `ai/NORQVA-0090-abertura-norqva` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** mudança de tela (D-0037, sem aprovação prévia); desenho aprovado pelo Ricardo em 16/10/2026 21h21 ("Aprovado!") no canvas "NORQVA Splash" · **Risco:** LOW (só apresentação)

## O que muda

- A sequência de palavras depois do login (INTELEGÊNCIA, CONTROLE, TERRITÓRIO...) sai.
- Entra a abertura NORQVA: triângulo com a ponta para cima, fumaça cinza girando na horizontal em volta dele (metade passa por trás, metade pela frente), nome NORQVA com reflexo, "INTELIGÊNCIA" (grafia corrigida), barra de carregamento, tudo em cinza sobre o azul-noite.
- Som curto "ta-dum" gerado no navegador (Web Audio, sem arquivo). Se o navegador bloquear o som (sessão restaurada sem toque na página) fica em silêncio; nunca trava a abertura.
- Duração: 3,4 s (antes ~3,3 s). Com "reduzir movimento" no aparelho, as animações contínuas param.

## Arquivos

- `frontend/src/components/layout/IntroSequence.tsx` (novo; saiu de `App.tsx`).
- `frontend/src/index.css`: classes `nq-intro-*`.
- Testes `auth.test.tsx` e `commercial_phase6b.test.tsx`: procuram a abertura pelo rótulo "NORQVA Intelligence Core iniciando".
