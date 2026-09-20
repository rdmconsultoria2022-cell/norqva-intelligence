-- Migration 020: Seed Bolso Blindado Commercial Product and Inactive Offer

INSERT INTO public.products (
    id,
    human_id,
    name,
    category,
    description,
    status,
    origin_provenance,
    origin_evidence,
    origin_notes,
    is_demo,
    is_deleted
)
VALUES (
    'c0000000-0000-4000-8000-000000000001'::uuid,
    'PRD-BOLSO-BLINDADO',
    'Método Bolso Blindado',
    'Finanças Pessoais',
    'Aplicativo Web e Ferramentas Financeiras Método Bolso Blindado',
    'PLANEJADO',
    'ORIGINAL',
    'Certified Gate 11.2 - 11.5 multi-user foundation architecture',
    'Commercial financial management methodology',
    false,
    false
)
ON CONFLICT (human_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status;

INSERT INTO public.offers (
    id,
    human_id,
    product_id,
    name,
    price,
    description,
    status,
    is_demo,
    is_deleted
)
VALUES (
    'd0000000-0000-4000-8000-000000000001'::uuid,
    'OFF-BOLSO-BLINDADO-2990',
    'c0000000-0000-4000-8000-000000000001'::uuid,
    'Método Bolso Blindado — Acesso Web',
    29.90,
    'Acesso completo ao Web App Método Bolso Blindado com planilha e guia em PDF.',
    'RASCUNHO',
    false,
    false
)
ON CONFLICT (human_id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    description = EXCLUDED.description,
    status = 'RASCUNHO';
