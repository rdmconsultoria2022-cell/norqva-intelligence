# NORQVA-0099: login e ícone do app no visual da abertura NORQVA

**Branch:** `ai/NORQVA-0099-login-norqva` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** com o "sim" do Ricardo
**Autorização:** só tela (D-0037, sem aprovação prévia). Pedido do Ricardo em 17/10/2026 00h42: "O app ainda exibe a tela antiga na primeira interação" (captura do celular com o login verde antigo e o ícone preto do app).

## O que muda

- **Login, "Esqueci minha senha" e nova senha** no visual da abertura: fundo `#02040F`, grade e varredura, triângulo cinza com fumaça (`NorqvaMark` em `IntroSequence.tsx`), nome NORQVA com reflexo e cartão cinza. Classes `nq-auth-*` em `index.css`. Comportamento igual (mesmos campos, nomes e rotas); "Autenticar" vira "Entrar".
- **Antes do app carregar** (`index.html`): fundo escuro com o triângulo pulsando, em vez da tela clara.
- **Ícone e abertura do celular:** o ícone do site estava com a cor escrita errada (saía triângulo preto). Agora: `manifest.webmanifest` com fundo `#02040F`, ícones cinza (`public/icons/`), `theme-color` e ícone para iPhone. Ao abrir o app instalado na tela inicial, a abertura do celular já sai escura com o triângulo cinza.
- Para o ícone novo aparecer no celular, pode ser preciso remover o atalho da tela inicial e adicionar de novo.
