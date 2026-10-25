# NORQVA-0129: página gerada (/v/:slug) com visual de página de venda

**Branch:** `ai/NORQVA-0129-pagina-gerada-visual` (a partir da `main`)
**Executor:** Claude · **Revisão:** CI + revisão independente · **Merge:** depois do CI verde e da revisão
**Autorização:** mudança de tela e conteúdo (D-0037, sem aprovação prévia) · **Risco:** LOW (só apresentação; nada muda em pagamento, entrega ou gasto)

## Contexto

Em 25/10/2026 o Ricardo abriu a página do Bordado (GEN-000001, `/v/bordado-b4d48e`, oferta OFF-000015) e viu "um muro de texto": sem imagens, sem hierarquia, nada que chame atenção. A página foi gerada sem a KIE, então as seções têm `image_url = null`. Depois da NORQVA-0128 o produto já tem imagens no site (`/images/bordado/{capa,riscos,bichinhos,pontos}.jpg`, `productImages`).

## Escopo

- Servidor (`generationService.ts`): `renderImageFallback` coloca as imagens do produto **na hora de mostrar**, sem gravar no banco, só quando nenhuma seção tem imagem própria: a abertura recebe a primeira; as outras, uma para cada, vão para conteúdo, benefícios e apresentação primeiro (depois bônus, mecanismo, dor, agitação, outros), na ordem da página. Nunca em preço, garantia, dúvidas, botão final, urgência, depoimentos, resultados, autoridade ou seção de texto fixo. Vale para a página pública (`publicPage`) e para a prévia do dono (`get`, campo `image_preview_url`).
- As duas respostas trazem `gallery` (as imagens do produto no site, caminhos `/images/...`), para "Veja por dentro". Nenhum campo interno novo na página pública.
- Tela (`GeneratedPage.tsx`), celular primeiro, no visual da página (light creme/terracota com Cormorant Garamond + Manrope, como o kit; fresh verde com Inter):
  - Abertura: título forte, uma frase de apoio, imagem grande, botão e três selos de fatos reais ("PDF para imprimir", "Acesso por e-mail" e a forma de pagamento que a oferta aceita: "Pix ou cartão" só quando há parcelas; senão "Pix").
  - Seções com ícone do papel, fundo alternado, imagem ao lado do texto no computador e acima no celular (moldura arredondada com sombra). Seção sem título usa o nome do papel ("Como funciona", "Conheça o material"...). Linhas do texto que começam com "-" viram itens em cartões.
  - "Veja por dentro": galeria com rolagem lateral no celular e grade no computador; toque abre a imagem maior (Esc ou X fecha).
  - Oferta em cartão destacado: miniatura, o que vem (itens da seção ou "Arquivo em PDF para imprimir" e "Acesso enviado por e-mail"), preço ao vivo, parcelas, botão e aviso de pagamento seguro conforme a oferta.
  - Garantia como selo de compra segura com a frase fixa do CDC (7 dias).
  - Fecho em faixa escura com botão; dúvidas em sanfona (`details`/`summary`), separando "pergunta? resposta".
  - Barra fixa do celular com preço e botão, aparece depois de rolar a abertura e respeita a área segura.
  - Entrada suave ao rolar; nada se move com "reduzir movimento".
- Sem depoimento, contador, nota, número inventado ou preço em imagem. Botões continuam indo para `/p/<oferta>?checkout=1` só com os parâmetros de origem; PageView/ViewContent, slug seguro e "não disponível" iguais.

## Testes

- `backend/src/tests/norqva_0129_generated_visual.test.ts`: escolha das seções, sem repetir imagem, página com imagem própria fica como está, produto sem imagens; pública com capa na abertura e galeria sem gravar nada; prévia do dono com as mesmas imagens.
- `frontend/src/tests/norqva_0129_generated_visual.test.tsx`: imagem da abertura, selos, galeria e ampliação, cartão da oferta com preço e parcelas, garantia, sanfona, todos os botões com o mesmo link sem nome/e-mail/telefone, oferta só com Pix.
- `norqva_0116_generation.test.*` ajustados (campo `gallery` e vários botões).

## Capturas

Feitas com o harness local (`frontend/harness/`, fora do git) e os dados reais da página do Bordado, celular 390×844 e computador 1280×800.
