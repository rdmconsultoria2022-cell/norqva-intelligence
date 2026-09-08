-- Migration 014: Commercial Truth Layer V1
-- Structurally separates commercial operations from development/QA/sandbox history

-- 1. Ensure clean commercial product TRATTORIA EM CASA has COMMERCIAL_PRODUCTION provenance
UPDATE products 
SET data_provenance = 'COMMERCIAL_PRODUCTION' 
WHERE name = 'TRATTORIA EM CASA' AND is_demo = FALSE;

-- 2. Link OFF-000001 to clean commercial product TRATTORIA EM CASA and set status to ATIVA with COMMERCIAL_PRODUCTION provenance
UPDATE offers 
SET product_id = (SELECT id FROM products WHERE name = 'TRATTORIA EM CASA' AND is_demo = FALSE ORDER BY created_at DESC LIMIT 1),
    status = 'ATIVA',
    data_provenance = 'COMMERCIAL_PRODUCTION'
WHERE human_id = 'OFF-000001' AND is_demo = FALSE;

-- 3. Ensure historical QA product da2ee0ee-439c-4dbe-97dd-34536dc0cebe is classified as STAGING_SANDBOX_QA
UPDATE products 
SET data_provenance = 'STAGING_SANDBOX_QA' 
WHERE id = 'da2ee0ee-439c-4dbe-97dd-34536dc0cebe';
