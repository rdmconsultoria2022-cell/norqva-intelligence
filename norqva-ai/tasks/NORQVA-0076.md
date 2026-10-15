# NORQVA-0076: página do kit com a lista dos livros, contagem de 5 minutos e botão animado

**Pedido:** Ricardo, 15/10/2026 (print da página "Cozinha Italiana em Casa – Coleção"): lista com todos os livros (capa, nome, descrição, preço e botão "Quero comprar somente esse exemplar"), o de R$ 14,90 por último; logo abaixo o kit com preço cheio riscado e o promocional em destaque; contagem regressiva de 5 minutos nas ofertas; movimento chamativo no botão do kit. **Risco:** LOW (tela e texto; não muda preço, cobrança nem entrega).

**Mudanças:**
- `KitLandingPage.tsx` (só no kit de 5 livros): seção "Escolha o seu livro ou leve a coleção inteira" antes do cartão do kit. Uma linha por livro, na ordem da coleção (Trattoria, Risotos, Antipasti, Pães, Dolci). Preço de cada livro vem de `/public/collection` (hoje: 4 × R$ 19,90 e Dolci R$ 14,90); textos e capas são fixos na página. No celular a linha empilha.
- "Quero comprar somente esse exemplar" abre o pagamento de sempre já em "livros avulsos" com aquele livro marcado (`initialBook` no `CheckoutView`). O servidor continua calculando o valor.
- Cartão do kit: "de R$ 94,50 por" maior, com a nota "soma dos 5 livros comprados separadamente" quando o preço cheio é essa soma; sem preço cheio na oferta, usa a soma se for maior que o promocional.
- Contagem regressiva de 5:00 (MM:SS) acima da lista e no cartão do kit. O início fica na aba (sessionStorage) e não recomeça ao recarregar; em 00:00 mostra "Tempo de reserva encerrado". **O preço não muda no servidor quando a contagem acaba.**
- Botão "Quero o kit": pulso com leve aumento (`.btn.beat`); parado com `prefers-reduced-motion`.
- Teste: `frontend/src/tests/norqva_0076_kit_book_list.test.tsx`.

**Decisão (Ricardo, 15/10/2026):** a contagem fica como está e zera em 00:00 sem mudar o preço; o Ricardo assume o risco de ser lida como urgência falsa (CDC, art. 37), avisado antes.
