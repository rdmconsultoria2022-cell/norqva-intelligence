/**
 * NORQVA Transactional Email & Recovery Configuration Hardening
 * Centralized, strict environment validation for production email and customer recovery.
 */

export interface TransactionalEmailConfigResult {
  valid: boolean;
  provider: 'resend' | 'none';
  apiKey?: string;
  from?: string;
  frontendUrl?: string;
  error?: string;
}

const EMAIL_FROM_DISPLAY_REGEX = /^[^<>\r\n]+\s*<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>$/;
const EMAIL_FROM_PLAIN_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmailFrom(from: string): boolean {
  if (!from || typeof from !== 'string') return false;
  const trimmed = from.trim();
  return EMAIL_FROM_DISPLAY_REGEX.test(trimmed) || EMAIL_FROM_PLAIN_REGEX.test(trimmed);
}

export function validateFrontendUrl(rawUrl?: string, isProduction = process.env.NODE_ENV === 'production'): {
  valid: boolean;
  url: string;
  error?: string;
} {
  const urlCandidate = (rawUrl || '').trim();

  if (!urlCandidate) {
    if (isProduction) {
      return { valid: false, url: '', error: 'FRONTEND_URL_MISSING' };
    }
    return { valid: true, url: 'https://norqva-intelligence-frontend.vercel.app' };
  }

  try {
    const parsed = new URL(urlCandidate);
    
    // In production, must be strict https protocol
    if (parsed.protocol !== 'https:') {
      return { valid: false, url: '', error: 'FRONTEND_URL_MUST_BE_HTTPS' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      return { valid: false, url: '', error: 'FRONTEND_URL_INVALID_HOSTNAME' };
    }

    // In production, reject localhost, loopback, and local domain variants
    if (isProduction) {
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local')
      ) {
        return { valid: false, url: '', error: 'FRONTEND_URL_LOCALHOST_PROHIBITED_IN_PROD' };
      }
    }

    // Return sanitized origin without trailing slash
    const sanitizedUrl = `${parsed.protocol}//${parsed.host}`;
    return { valid: true, url: sanitizedUrl };
  } catch (e) {
    return { valid: false, url: '', error: 'FRONTEND_URL_MALFORMED' };
  }
}

export function validateTransactionalEmailConfig(env: NodeJS.ProcessEnv = process.env): TransactionalEmailConfigResult {
  const isProduction = env.NODE_ENV === 'production';
  const providerType = (env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const apiKey = (env.RESEND_API_KEY || '').trim();
  const rawFrom = (env.EMAIL_FROM || '').trim();
  const rawFrontendUrl = env.FRONTEND_URL;

  // 1. Validate Provider Type
  if (!providerType) {
    if (isProduction && apiKey) {
      // If RESEND_API_KEY is present in prod without explicit EMAIL_PROVIDER, require explicit EMAIL_PROVIDER=resend
      return {
        valid: false,
        provider: 'none',
        error: 'EMAIL_PROVIDER_MUST_BE_EXPLICIT_IN_PRODUCTION'
      };
    }
    return {
      valid: false,
      provider: 'none',
      error: 'EMAIL_PROVIDER_NOT_CONFIGURED'
    };
  }

  if (providerType !== 'resend') {
    return {
      valid: false,
      provider: 'none',
      error: 'UNKNOWN_EMAIL_PROVIDER'
    };
  }

  // 2. Validate API Key
  if (!apiKey) {
    return {
      valid: false,
      provider: 'resend',
      error: 'RESEND_API_KEY_MISSING'
    };
  }

  // 3. Validate EMAIL_FROM
  if (isProduction) {
    if (!rawFrom) {
      return {
        valid: false,
        provider: 'resend',
        error: 'EMAIL_FROM_MISSING'
      };
    }
    if (!isValidEmailFrom(rawFrom)) {
      return {
        valid: false,
        provider: 'resend',
        error: 'EMAIL_FROM_MALFORMED'
      };
    }
  }

  const effectiveFrom = rawFrom || 'NORQVA <acesso@mail.norqva.com.br>';

  // 4. Validate FRONTEND_URL
  const frontendUrlValidation = validateFrontendUrl(rawFrontendUrl, isProduction);
  if (!frontendUrlValidation.valid) {
    return {
      valid: false,
      provider: 'resend',
      error: frontendUrlValidation.error
    };
  }

  return {
    valid: true,
    provider: 'resend',
    apiKey,
    from: effectiveFrom,
    frontendUrl: frontendUrlValidation.url
  };
}

export type SanitizedEmailErrorCode =
  | 'RESEND_API_ERROR'
  | 'RESEND_NETWORK_ERROR'
  | 'RESEND_AUTH_ERROR'
  | 'RESEND_PERMISSION_ERROR'
  | 'RESEND_DOMAIN_ERROR'
  | 'RESEND_RATE_LIMIT'
  | 'RESEND_UNKNOWN_ERROR';

export function sanitizeEmailProviderError(err: any): SanitizedEmailErrorCode {
  if (!err) return 'RESEND_UNKNOWN_ERROR';

  const status = Number(err.statusCode || err.status || (err.response && err.response.status) || 0);
  const codeStr = String(err.code || '').toLowerCase();
  const nameStr = String(err.name || '').toLowerCase();
  const msgStr = String(err.message || '').toLowerCase();

  // 1. Rate Limit
  if (
    status === 429 ||
    msgStr.includes('rate_limit') ||
    msgStr.includes('too many requests') ||
    nameStr.includes('ratelimit')
  ) {
    return 'RESEND_RATE_LIMIT';
  }

  // 2. Auth Error (401 / missing / invalid API key / unauthorized)
  if (
    status === 401 ||
    msgStr.includes('invalid api key') ||
    msgStr.includes('missing api key') ||
    msgStr.includes('unauthorized') ||
    msgStr.includes('api_key_invalid') ||
    nameStr.includes('unauthorized')
  ) {
    return 'RESEND_AUTH_ERROR';
  }

  // 3. Permission Error (403 / restricted api key / forbidden)
  if (
    status === 403 ||
    msgStr.includes('forbidden') ||
    msgStr.includes('permission_denied') ||
    msgStr.includes('restricted_api_key') ||
    nameStr.includes('forbidden')
  ) {
    return 'RESEND_PERMISSION_ERROR';
  }

  // 4. Domain / Validation Error (422 / domain not verified / invalid from / validation error)
  if (
    status === 422 ||
    msgStr.includes('domain') ||
    msgStr.includes('validation_error') ||
    msgStr.includes('from_address') ||
    msgStr.includes('not verified') ||
    msgStr.includes('missing_required_field') ||
    nameStr.includes('validation')
  ) {
    return 'RESEND_DOMAIN_ERROR';
  }

  // 5. Network Error (fetch failed, timeout, connection reset, dns)
  if (
    codeStr === 'enotfound' ||
    codeStr === 'econnreset' ||
    codeStr === 'etimedout' ||
    codeStr === 'econnrefused' ||
    msgStr.includes('fetch failed') ||
    msgStr.includes('network') ||
    msgStr.includes('timeout') ||
    msgStr.includes('econnreset') ||
    nameStr.includes('fetcherror') ||
    nameStr.includes('networkerror')
  ) {
    return 'RESEND_NETWORK_ERROR';
  }

  // 6. Generic API Error (400, 500, 502, 503, 504, api_error)
  if (
    (status >= 400 && status <= 599) ||
    msgStr.includes('application_error') ||
    msgStr.includes('internal_server_error') ||
    msgStr.includes('api_error') ||
    nameStr.includes('api_error') ||
    nameStr.includes('resenderror')
  ) {
    return 'RESEND_API_ERROR';
  }

  return 'RESEND_UNKNOWN_ERROR';
}

