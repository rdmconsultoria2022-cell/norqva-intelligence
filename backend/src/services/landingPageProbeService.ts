import crypto from 'crypto';
import dns from 'dns';
import net from 'net';

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

export function isPrivateOrRestrictedIp(ip: string): boolean {
  if (!ip) return true;

  // IPv4-mapped IPv6 check
  let cleanIp = ip.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  const isV4 = net.isIPv4(cleanIp);
  const isV6 = net.isIPv6(cleanIp);

  if (!isV4 && !isV6) return true;

  if (isV4) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;

    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Unspecified)
    if (a === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 10.0.0.0/8 (Private RFC 1918)
    if (a === 10) return true;
    // 172.16.0.0/12 (Private RFC 1918)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private RFC 1918)
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (Link-local RFC 3927 & AWS/Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation RFC 5737)
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    // Multicast & Broadcast (224.0.0.0/4 and above)
    if (a >= 224) return true;

    return false;
  }

  if (isV6) {
    const lower = cleanIp.toLowerCase();
    // Unspecified & Loopback
    if (lower === '::' || lower === '::1' || lower === '0:0:0:0:0:0:0:0' || lower === '0:0:0:0:0:0:0:1') return true;
    // Link-local: fe80::/10 (fe80: - febf:)
    if (/^fe[89ab]/i.test(lower)) return true;
    // Unique Local: fc00::/7 (fc00: - fdff:)
    if (/^f[cd]/i.test(lower)) return true;
    // Discard prefix / documentation: 100::/64, 2001:db8::/32
    if (lower.startsWith('100::') || lower.startsWith('2001:db8:')) return true;

    return false;
  }

  return true;
}

export async function validateSecurityDestination(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    throw new Error("URL inválida: informe uma URL completa iniciando com http:// ou https://.");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Protocolo '${parsed.protocol}' não autorizado. Apenas http:// e https:// são permitidos.`);
  }

  const hostname = parsed.hostname;
  if (!hostname || hostname.toLowerCase() === 'localhost') {
    throw new Error(`Acesso bloqueado: Hostname '${hostname}' não é permitido.`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      throw new Error(`Acesso bloqueado: IP '${hostname}' pertence a faixa privada, loopback ou restrita.`);
    }
  } else {
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        throw new Error(`Falha na resolução de DNS para ${hostname}`);
      }
      for (const addr of addresses) {
        if (isPrivateOrRestrictedIp(addr.address)) {
          throw new Error(`Acesso bloqueado: ${hostname} resolve para IP restrito (${addr.address}).`);
        }
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('Acesso bloqueado:')) {
        throw err;
      }
      throw new Error(`Falha na resolução de DNS para ${hostname}: ${err.message}`);
    }
  }

  return parsed;
}

export class LandingPageProbeService {
  public static async probeUrl(rawUrl: string): Promise<LandingPageProbeResult> {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error("URL inválida: informe uma URL completa iniciando com http:// ou https://.");
    }

    // SSRF validation on the initial URL
    await validateSecurityDestination(rawUrl);

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
      let currentUrl = rawUrl;
      let redirectCount = 0;
      const maxRedirects = 3;
      let response: Response | null = null;

      while (redirectCount <= maxRedirects) {
        // Re-validate every destination hop in redirect chain
        await validateSecurityDestination(currentUrl);

        response = await fetch(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NORQVA-PublicProbe/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(6000)
        });

        networkEvidence.http_status = response.status;
        networkEvidence.final_url = currentUrl;
        networkEvidence.content_type = response.headers.get('content-type');

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            break;
          }
          const nextUrl = new URL(location, currentUrl).toString();
          networkEvidence.redirect_chain.push(nextUrl);
          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new Error("Limite de redirecionamentos excedido (máximo 3).");
          }
          currentUrl = nextUrl;
        } else {
          break;
        }
      }

      if (!response) {
        throw new Error("No response received");
      }

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
      networkEvidence.http_status = networkEvidence.http_status || null;
      if (err.message && (err.message.startsWith('Acesso bloqueado:') || err.message.startsWith('URL inválida:') || err.message.startsWith('Protocolo ') || err.message.startsWith('Limite de redirecionamentos'))) {
        throw err;
      }
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
