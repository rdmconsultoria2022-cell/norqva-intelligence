/**
 * NORQVA Resend Transactional Email Provider
 * Concrete IEmailProvider implementation using official Resend SDK.
 */

import { Resend } from 'resend';
import { IEmailProvider, SendPurchaseAccessEmailParams, EmailServiceResult } from './emailService';

export class ResendEmailProvider implements IEmailProvider {
  private resend: Resend;
  private defaultFrom: string;

  constructor(apiKey: string, defaultFrom?: string) {
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required to initialize ResendEmailProvider');
    }
    this.resend = new Resend(apiKey);
    this.defaultFrom = defaultFrom || process.env.EMAIL_FROM || 'NORQVA <acesso@mail.norqva.com.br>';
  }

  async sendPurchaseAccessEmail(params: SendPurchaseAccessEmailParams): Promise<EmailServiceResult> {
    const { email, offerName, recoveryUrl } = params;

    if (!email || !recoveryUrl) {
      return {
        success: false,
        error: 'INVALID_PARAMETERS'
      };
    }

    const fromAddress = process.env.EMAIL_FROM || this.defaultFrom;
    const subject = 'Recupere seu acesso à sua compra NORQVA';

    const textContent = [
      'Olá!',
      '',
      `Recebemos uma solicitação de recuperação de acesso para a sua compra: ${offerName}.`,
      '',
      'Para acessar seu conteúdo e fazer o download do seu material, utilize o link de acesso exclusivo abaixo:',
      '',
      recoveryUrl,
      '',
      'IMPORTANTE: Este link de acesso é de uso único e possui validade limitada de 72 horas por segurança.',
      '',
      'Se você não realizou esta solicitação, desconsidere este e-mail. Seus dados e seu acesso continuam seguros.',
      '',
      'Atenciosamente,',
      'Equipe NORQVA'
    ].join('\n');

    const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Acesso NORQVA</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0d1117; color: #c9d1d9;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0d1117; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #30363d;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #f0f6fc; letter-spacing: -0.02em;">NORQVA</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #f0f6fc;">Acesso à sua compra</h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #8b949e;">
                Recebemos uma solicitação de acesso para a sua compra de <strong style="color: #f0f6fc;">${escapeHtml(offerName)}</strong>.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #8b949e;">
                Clique no botão abaixo para acessar seu produto digital e realizar o download:
              </p>
              <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #238636;">
                    <a href="${escapeHtml(recoveryUrl)}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                      Acessar Meu Produto
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #8b949e;">
                Ou copie e cole o link abaixo em seu navegador:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; color: #58a6ff; word-break: break-all;">
                ${escapeHtml(recoveryUrl)}
              </p>
              <div style="padding: 16px; background-color: #0d1117; border-left: 3px solid #f0883e; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #c9d1d9;">
                  <strong>Aviso de segurança:</strong> Este link é de <strong>uso único</strong> e expira em 72 horas. Após o primeiro acesso, o link será desativado.
                </p>
              </div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #8b949e;">
                Se você não solicitou esta recuperação de acesso, nenhuma ação é necessária. Apenas ignore esta mensagem.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #0d1117; border-top: 1px solid #30363d; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #484f58;">
                © ${new Date().getFullYear()} NORQVA Intelligence. E-mail transacional de entrega de produto.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    try {
      const { data, error } = await this.resend.emails.send({
        from: fromAddress,
        to: [email],
        subject,
        html: htmlContent,
        text: textContent
      });

      if (error) {
        // Sanitized logging without keys, tokens, or PII
        console.error('[ResendEmailProvider]: Error dispatching email:', error.name || error.message);
        return {
          success: false,
          error: error.message || 'RESEND_DISPATCH_FAILED'
        };
      }

      return {
        success: true,
        messageId: data?.id || 'resend-ok',
        simulated: false
      };
    } catch (err: any) {
      console.error('[ResendEmailProvider]: Unexpected error during dispatch:', err.message);
      return {
        success: false,
        error: err.message || 'RESEND_EXCEPTION'
      };
    }
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
