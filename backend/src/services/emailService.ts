/**
 * NORQVA Transactional Email Service Abstraction
 * Supports secure, out-of-band delivery notifications and recovery magic-links.
 */

import { ResendEmailProvider } from './resendProvider';

export interface SendPurchaseAccessEmailParams {
  email: string;
  offerName: string;
  recoveryUrl: string;
  orderId?: string;
  isDemo?: boolean;
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
  getResolvedProvider(): IEmailProvider | null {
    if (this.customProvider) {
      return this.customProvider;
    }

    const providerType = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
    const resendApiKey = process.env.RESEND_API_KEY;

    if (providerType === 'resend' || (!providerType && resendApiKey)) {
      if (resendApiKey) {
        return new ResendEmailProvider(resendApiKey, process.env.EMAIL_FROM);
      }
    }

    return null;
  }

  async sendPurchaseAccessEmail(params: SendPurchaseAccessEmailParams): Promise<EmailServiceResult> {
    const { email, recoveryUrl, isDemo } = params;

    if (!email || !recoveryUrl) {
      return {
        success: false,
        error: 'INVALID_PARAMETERS'
      };
    }

    // Capture in test / audit array
    dispatchedEmailsForTesting.push(params);

    const isProduction = process.env.NODE_ENV === 'production';
    const provider = this.getResolvedProvider();

    if (provider) {
      return provider.sendPurchaseAccessEmail(params);
    }

    // Provider is not configured
    const providerType = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
    if (providerType === 'resend' && !process.env.RESEND_API_KEY) {
      if (isProduction && !isDemo) {
        console.warn('[EmailService]: Resend provider selected but RESEND_API_KEY is missing. Failing closed safely.');
        return {
          success: false,
          error: 'RESEND_API_KEY_MISSING',
          simulated: false
        };
      }
    }

    if (isProduction && !isDemo) {
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
