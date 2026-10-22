# NORQVA-0113: enviar vários PDFs de uma vez pela tela de Produtos

**Pedido e autorização:** parte da NORQVA-0112 (Seca Barriga no checkout do NORQVA), aprovada pelo Ricardo em 22/10/2026 15h22. O endpoint `POST /api/offers/:id/delivery-files/extra` (só ADMIN) já existe; faltava a tela. **Risco:** LOW (só ADMIN; mesmo envio já revisado).

**O que muda:** em Produtos → "PDF entregue ao comprador", o campo "Adicionar mais PDFs a esta oferta" aceita vários arquivos. Eles vão em ordem de nome; o título que o comprador vê sai do nome do arquivo (`01_Guia_do_Desafio.pdf` → "01 · Guia do Desafio"). Oferta sem arquivo: o primeiro vira o arquivo principal e os outros entram como extras.

**Arquivos:** `frontend/src/features/products/DeliveryFiles.tsx`, teste em `norqva_0033_delivery_files.test.tsx`.
