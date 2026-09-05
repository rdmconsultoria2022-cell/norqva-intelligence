import crypto from 'crypto';

export interface NetworkEvidence {
  requested_url: string;
  final_url: string;
  http_status: number | null;
  redirect_chain: string[];
  content_type: string | null;
  response_timestamp: string;
  response_size: number;
  response_hash_sha256: string | null;
}

export interface LandingPageProbeResult {
  url: string;
  domain: string;
  access_status: 'PASS' | 'BLOCKED' | 'FAIL';
  content_delivery_type: 'STATIC_HTML' | 'STRUCTURED_DATA' | 'CLIENT_RENDERED' | 'CHECKOUT_EXTERNAL' | 'BLOCKED' | 'UNAVAILABLE';
  network_evidence: NetworkEvidence;

  fields: {
    page_title: { value: string | null; provenance: 'HTML_DERIVED' | 'UNKNOWN'; method: string };
    og_title: { value: string | null; provenance: 'HTML_DERIVED' | 'UNKNOWN'; method: string };
    og_description: { value: string | null; provenance: 'HTML_DERIVED' | 'UNKNOWN'; method: string };
    product_name: { value: string | null; provenance: 'STRUCTURED_DATA' | 'HTML_DERIVED' | 'UNKNOWN'; method: string };
    explicit_price: { value: string | null; provenance: 'STRUCTURED_DATA' | 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    promotional_price: { value: string | null; provenance: 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    currency: { value: string | null; provenance: 'STRUCTURED_DATA' | 'UNKNOWN'; method: string };
    cta_text: { value: string | null; provenance: 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    guarantee: { value: string | null; provenance: 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    bonus_structure: { value: string[] | null; provenance: 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    social_proof_present: { value: boolean | null; provenance: 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    checkout_provider: { value: string | null; provenance: 'OBSERVED_PUBLIC_PAGE' | 'UNKNOWN'; method: string };
    public_destination_domain: { value: string | null; provenance: 'HTML_DERIVED' | 'UNKNOWN'; method: string };

    competitor_spend: { value: null; provenance: 'UNKNOWN'; method: 'STRICTLY_PROHIBITED' };
    competitor_cac: { value: null; provenance: 'UNKNOWN'; method: 'STRICTLY_PROHIBITED' };
    competitor_roas: { value: null; provenance: 'UNKNOWN'; method: 'STRICTLY_PROHIBITED' };
    competitor_sales: { value: null; provenance: 'UNKNOWN'; method: 'STRICTLY_PROHIBITED' };
  };

  metrics: {
    total_requested_fields: number;
    fields_automatically_recovered: number;
    fields_operator_required: number;
    fields_unknown: number;
    real_automation_ratio: string;
    real_automation_percentage: number;
  };
}

export class LandingPageProbeService {
  public static async probeUrl(rawUrl: string): Promise<LandingPageProbeResult> {
    if (!rawUrl || !rawUrl.startsWith('http')) {
      throw new Error("URL inválida: informe uma URL completa iniciando com http:// ou https://.");
    }

    let domain = '';
    try {
      domain = new URL(rawUrl).hostname;
    } catch (e) {
      domain = 'INVALID_DOMAIN';
    }

    const timestamp = new Date().toISOString();
    const networkEvidence: NetworkEvidence = {
      requested_url: rawUrl,
      final_url: rawUrl,
      http_status: null,
      redirect_chain: [],
      content_type: null,
      response_timestamp: timestamp,
      response_size: 0,
      response_hash_sha256: null
    };

    let html = '';
    let deliveryType: 'STATIC_HTML' | 'STRUCTURED_DATA' | 'CLIENT_RENDERED' | 'CHECKOUT_EXTERNAL' | 'BLOCKED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let accessStatus: 'PASS' | 'BLOCKED' | 'FAIL' = 'FAIL';

    try {
      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NORQVA-PublicProbe/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000)
      });

      networkEvidence.http_status = response.status;
      networkEvidence.final_url = response.url;
      networkEvidence.content_type = response.headers.get('content-type');

      if (response.status === 403 || response.status === 401) {
        accessStatus = 'BLOCKED';
        deliveryType = 'BLOCKED';
      } else if (!response.ok) {
        accessStatus = 'FAIL';
        deliveryType = 'UNAVAILABLE';
      } else {
        html = await response.text();
        networkEvidence.response_size = Buffer.byteLength(html, 'utf8');
        networkEvidence.response_hash_sha256 = crypto.createHash('sha256').update(html).digest('hex');
        accessStatus = 'PASS';
        deliveryType = 'STATIC_HTML';
      }
    } catch (err: any) {
      // STRICT FAIL-CLOSED: Zero synthetic HTML, zero mock fallback
      accessStatus = 'FAIL';
      deliveryType = 'UNAVAILABLE';
      html = '';
      networkEvidence.http_status = null;
    }

    // If access failed, ALL fields are strictly UNKNOWN
    if (accessStatus !== 'PASS' || !html || html.trim() === '') {
      return {
        url: rawUrl,
        domain,
        access_status: accessStatus,
        content_delivery_type: deliveryType,
        network_evidence: networkEvidence,
        fields: {
          page_title: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          og_title: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          og_description: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          product_name: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          explicit_price: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          promotional_price: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          currency: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          cta_text: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          guarantee: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          bonus_structure: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          social_proof_present: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          checkout_provider: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },
          public_destination_domain: { value: null, provenance: 'UNKNOWN', method: 'NETWORK_PROBE_FAILED' },

          competitor_spend: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' },
          competitor_cac: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' },
          competitor_roas: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' },
          competitor_sales: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' }
        },
        metrics: {
          total_requested_fields: 12,
          fields_automatically_recovered: 0,
          fields_operator_required: 11,
          fields_unknown: 16,
          real_automation_ratio: '0 / 12 (0.0%)',
          real_automation_percentage: 0
        }
      };
    }

    // Real HTML Extraction (Only executed when live response exists)
    let pageTitle: string | null = null;
    let ogTitle: string | null = null;
    let ogDescription: string | null = null;
    let productName: string | null = null;
    let explicitPrice: string | null = null;
    let currency: string | null = null;
    let ctaText: string | null = null;
    let guarantee: string | null = null;
    let bonusList: string[] = [];
    let socialProof: boolean | null = null;
    let checkoutProvider: string | null = null;

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) pageTitle = titleMatch[1].trim();

    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
    if (ogTitleMatch) ogTitle = ogTitleMatch[1].trim();

    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
    if (ogDescMatch) ogDescription = ogDescMatch[1].trim();

    const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const parsed = JSON.parse(jsonLdMatch[1]);
        deliveryType = 'STRUCTURED_DATA';
        if (parsed.name) productName = parsed.name;
        if (parsed.offers?.price) {
          explicitPrice = `R$ ${Number(parsed.offers.price).toFixed(2).replace('.', ',')}`;
          currency = parsed.offers.priceCurrency || 'BRL';
        }
      } catch (e) {
        // Fallback
      }
    }

    if (!explicitPrice) {
      const priceMatch = html.match(/R\$\s*([0-9]{1,3}(?:[.,][0-9]{2})?)/i);
      if (priceMatch) {
        explicitPrice = `R$ ${priceMatch[1]}`;
        currency = 'BRL';
      }
    }

    const btnMatch = html.match(/<(?:button|a)[^>]*>(?:<[^>]+>)*\s*(QUERO[^<]+|GARANTIR[^<]+|COMPRAR[^<]+|SAIBA MAIS|ACESSAR[^<]+)\s*(?:<\/[^>]+>)*<\/(?:button|a)>/i);
    if (btnMatch) ctaText = btnMatch[1].trim();

    const guaranteeMatch = html.match(/([0-9]+\s*dias(?:\s+de\s+garantia)?|garantia\s+(?:incondicional\s+)?de\s+[0-9]+\s*dias)/i);
    if (guaranteeMatch) guarantee = guaranteeMatch[1].trim();

    const bonusMatches = html.matchAll(/B[oô]nus(?:\s*[0-9]+)?:\s*([^<\n\r]+)/gi);
    for (const m of bonusMatches) {
      if (m[1]) bonusList.push(m[1].trim());
    }

    if (/alunos|clientes|avalia[çc][õo]es|depoimentos|estrelas/i.test(html)) {
      socialProof = true;
    }

    if (/kiwify\.com\.br/i.test(html)) checkoutProvider = 'Kiwify';
    else if (/hotmart\.com/i.test(html)) checkoutProvider = 'Hotmart';
    else if (/eduzz\.com/i.test(html)) checkoutProvider = 'Eduzz';
    else if (/asaas\.com/i.test(html)) checkoutProvider = 'Asaas';
    else if (/shopify\.com/i.test(html)) checkoutProvider = 'Shopify';

    const recoveredFields = [
      pageTitle, ogTitle, ogDescription, productName,
      explicitPrice, currency, ctaText, guarantee,
      bonusList.length > 0 ? bonusList : null, socialProof,
      checkoutProvider, domain
    ].filter(v => v !== null && v !== false).length;

    const totalRequested = 12;

    return {
      url: rawUrl,
      domain,
      access_status: accessStatus,
      content_delivery_type: deliveryType,
      network_evidence: networkEvidence,
      fields: {
        page_title: { value: pageTitle, provenance: pageTitle ? 'HTML_DERIVED' : 'UNKNOWN', method: 'DOM <title> selector' },
        og_title: { value: ogTitle, provenance: ogTitle ? 'HTML_DERIVED' : 'UNKNOWN', method: '<meta property="og:title">' },
        og_description: { value: ogDescription, provenance: ogDescription ? 'HTML_DERIVED' : 'UNKNOWN', method: '<meta property="og:description">' },
        product_name: { value: productName, provenance: productName ? 'STRUCTURED_DATA' : 'UNKNOWN', method: 'Schema.org Product.name' },
        explicit_price: { value: explicitPrice, provenance: explicitPrice ? (productName ? 'STRUCTURED_DATA' : 'OBSERVED_PUBLIC_PAGE') : 'UNKNOWN', method: 'Price Parser' },
        promotional_price: { value: explicitPrice, provenance: explicitPrice ? 'OBSERVED_PUBLIC_PAGE' : 'UNKNOWN', method: 'Price Parser' },
        currency: { value: currency, provenance: currency ? 'STRUCTURED_DATA' : 'UNKNOWN', method: 'Schema.org priceCurrency' },
        cta_text: { value: ctaText, provenance: ctaText ? 'OBSERVED_PUBLIC_PAGE' : 'UNKNOWN', method: 'Primary Action Button DOM' },
        guarantee: { value: guarantee, provenance: guarantee ? 'OBSERVED_PUBLIC_PAGE' : 'UNKNOWN', method: 'Text Guarantee Matcher' },
        bonus_structure: { value: bonusList.length > 0 ? bonusList : null, provenance: bonusList.length > 0 ? 'OBSERVED_PUBLIC_PAGE' : 'UNKNOWN', method: 'Bonus Structure Parser' },
        social_proof_present: { value: socialProof, provenance: socialProof !== null ? 'OBSERVED_PUBLIC_PAGE' : 'UNKNOWN', method: 'Social Proof Matcher' },
        checkout_provider: { value: checkoutProvider, provenance: checkoutProvider ? 'OBSERVED_PUBLIC_PAGE' : 'UNKNOWN', method: 'Outbound Checkout Link Inspector' },
        public_destination_domain: { value: domain, provenance: 'HTML_DERIVED', method: 'URL Hostname Normalizer' },

        competitor_spend: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' },
        competitor_cac: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' },
        competitor_roas: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' },
        competitor_sales: { value: null, provenance: 'UNKNOWN', method: 'STRICTLY_PROHIBITED' }
      },
      metrics: {
        total_requested_fields: totalRequested,
        fields_automatically_recovered: recoveredFields,
        fields_operator_required: Math.max(0, 11 - recoveredFields),
        fields_unknown: 16 - recoveredFields,
        real_automation_ratio: `${recoveredFields} / ${totalRequested} (${((recoveredFields / totalRequested) * 100).toFixed(1)}%)`,
        real_automation_percentage: Math.round((recoveredFields / totalRequested) * 100)
      }
    };
  }
}
