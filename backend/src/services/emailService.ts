/**
 * NORQVA Transactional Email Service Abstraction
 * Supports secure, out-of-band delivery notifications and recovery magic-links.
 */

import { ResendEmailProvider } from './resendProvider';
import { validateTransactionalEmailConfig } from './emailConfig';

export interface SendPurchaseAccessEmailParams {
  email: string;
  offerName: string;
  recoveryUrl: string;
  orderId?: string;
  correlationId?: string;
  isDemo?: boolean;
  /** NORQVA-0023: PURCHASE = enviado ao confirmar o pagamento; RECOVERY (padrão) = pedido de recuperação. */
  kind?: 'PURCHASE' | 'RECOVERY';
  /** Validade do link em horas (texto do e-mail de compra). */
  validityHours?: number;
}

export interface EmailServiceResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export interface IEmailProvider {
  sendPurchaseAccessEmail(params: SendPurchaseAccessEmailParams): Promise<EmailServiceResult>;
}

// In-memory collector for unit tests
export const dispatchedEmailsForTesting: SendPurchaseAccessEmailParams[] = [];

export function clearTestEmails(): void {
  dispatchedEmailsForTesting.length = 0;
}

export class TransactionalEmailService implements IEmailProvider {
  private customProvider: IEmailProvider | null = null;

  /**
   * Allows injecting a custom or mock provider for testing or alternative integrations
   */
  setProvider(provider: IEmailProvider | null): void {
    this.customProvider = provider;
  }

  /**
   * Resolves the active provider according to environment configuration
   */
  getResolvedProvider(correlationId?: string): IEmailProvider | null {
    console.log(JSON.stringify({
      event: 'RECOVERY_EMAIL_PROVIDER_RESOLUTION_START',
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlation_id: correlationId } : {})
    }));

    if (this.customProvider) {
      console.log(JSON.stringify({
        event: 'RECOVERY_EMAIL_PROVIDER_RESOLVED',
        timestamp: new Date().toISOString(),
        provider: 'CustomProvider',
        ...(correlationId ? { correlation_id: correlationId } : {})
      }));
      return this.customProvider;
    }

    const config = validateTransactionalEmailConfig(process.env);
    if (config.valid && config.provider === 'resend' && config.apiKey) {
      console.log(JSON.stringify({
        event: 'RECOVERY_EMAIL_PROVIDER_RESOLVED',
        timestamp: new Date().toISOString(),
        provider: 'ResendEmailProvider',
        ...(correlationId ? { correlation_id: correlationId } : {})
      }));
      return new ResendEmailProvider(config.apiKey, config.from);
    }

    console.warn(JSON.stringify({
      event: 'RECOVERY_EMAIL_PROVIDER_RESOLUTION_FAILED',
      timestamp: new Date().toISOString(),
      reason: config.error || 'NO_MATCHING_PROVIDER',
      ...(correlationId ? { correlation_id: correlationId } : {})
    }));
    return null;
  }

  async sendPurchaseAccessEmail(params: SendPurchaseAccessEmailParams): Promise<EmailServiceResult> {
    const { email, recoveryUrl, isDemo, correlationId } = params;

    if (!email || !recoveryUrl) {
      return {
        success: false,
        error: 'INVALID_PARAMETERS'
      };
    }

    // Capture in test array only (NORQVA-0023: never keep raw access links in production memory)
    if (process.env.NODE_ENV !== 'production' || process.env.VITEST) {
      dispatchedEmailsForTesting.push(params);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const provider = this.getResolvedProvider(correlationId);

    if (provider) {
      return provider.sendPurchaseAccessEmail(params);
    }

    const config = validateTransactionalEmailConfig(process.env);

    if (isProduction && !isDemo) {
      if (config.error) {
        console.warn(`[EmailService]: Production email provider configuration invalid (${config.error}). Failing closed safely.`);
        return {
          success: false,
          error: config.error,
          simulated: false
        };
      }

      console.warn('[EmailService]: Production transactional email provider pending configuration. Access link generated securely.');
      return {
        success: false,
        error: 'EMAIL_PROVIDER_PENDING_CONFIG',
        simulated: false
      };
    }

    // Non-production fallback / simulation
    return {
      success: true,
      messageId: 'sim-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
      simulated: true
    };
  }
}

export const emailService = new TransactionalEmailService();
export { validateTransactionalEmailConfig, validateFrontendUrl, sanitizeEmailProviderError } from './emailConfig';
