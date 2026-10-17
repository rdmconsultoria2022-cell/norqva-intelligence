# NORQVA-0091: abertura sem piscar o login e com som audível no celular

**Branch:** `ai/NORQVA-0091-abertura-ajustes` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** Claude, depois do CI verde
**Autorização:** correção de tela (D-0037), pedida pelo Ricardo em 16/10/2026 21h42 · **Risco:** LOW (só apresentação)

## Problemas relatados

1. Ao reabrir o app, a tela de login aparecia por uma fração de segundo antes da abertura.
2. A abertura aparecia sem som.

## Causas e correções

1. Enquanto a sessão salva era conferida, o app mostrava o login. Agora mostra o fundo da abertura (mesmo azul-noite) até saber se há sessão; rotas de login, senha e recuperação continuam iguais.
2. Duas causas:
   - O som do 0090 ficava quase todo abaixo de 60 Hz, que alto-falante de celular não reproduz. Novo "ta-dum" com energia entre 150 e 2.000 Hz, acorde de Mi e compressor.
   - Navegadores só liberam som depois de um toque na página. Depois do login (toque no botão) toca sempre. Com a sessão salva, o som espera o primeiro toque durante a abertura; sem toque, a abertura fica em silêncio (regra do navegador, não dá para contornar).

## Arquivos

- `frontend/src/components/layout/IntroSequence.tsx`
- `frontend/src/App.tsx`
