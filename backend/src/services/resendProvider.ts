/**
 * NORQVA Resend Transactional Email Provider
 * Concrete IEmailProvider implementation using official Resend SDK.
 */

import { Resend } from 'resend';
import { IEmailProvider, SendPurchaseAccessEmailParams, SendPaymentReminderEmailParams, EmailServiceResult } from './emailService';
import { sanitizeEmailProviderError } from './emailConfig';
import { buildFromHeader, sanitizeSenderName, DEFAULT_SENDER_NAME } from './emailSender';

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

  /** NORQVA-0074: lembrete de pagamento de pedido pendente. */
  async sendPaymentReminderEmail(params: SendPaymentReminderEmailParams): Promise<EmailServiceResult> {
    const { subject, text, html } = buildPaymentReminderEmail(params);
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.defaultFrom || process.env.EMAIL_FROM || 'NORQVA <acesso@mail.norqva.com.br>',
        to: [params.email],
        subject,
        html,
        text
      });
      if (error) return { success: false, error: sanitizeEmailProviderError(error) };
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      return { success: false, error: sanitizeEmailProviderError(err) };
    }
  }

  async sendPurchaseAccessEmail(params: SendPurchaseAccessEmailParams): Promise<EmailServiceResult> {
    const { email, recoveryUrl } = params;

    if (!email || !recoveryUrl) {
      return {
        success: false,
        error: 'INVALID_PARAMETERS'
      };
    }

    const fromAddress = buildFromHeader(this.defaultFrom || process.env.EMAIL_FROM || 'NORQVA <acesso@mail.norqva.com.br>', params.senderName);
    // NORQVA-0107: compra e lembrete de download no visual claro com a marca; recuperação segue igual.
    const built = params.kind === 'PURCHASE' || params.kind === 'DOWNLOAD_REMINDER'
      ? buildPurchaseAccessEmail(params)
      : buildRecoveryAccessEmail(params);
    const subject = built.subject;
    const textContent = built.text;
    const htmlContent = built.html;

    const correlationId = params.correlationId;

    try {
      console.log(JSON.stringify({
        event: 'RECOVERY_EMAIL_SEND_START',
        timestamp: new Date().toISOString(),
        ...(correlationId ? { correlation_id: correlationId } : {}),
        from_configured: Boolean(fromAddress)
      }));

      const { data, error } = await this.resend.emails.send({
        from: fromAddress,
        to: [email],
        subject,
        html: htmlContent,
        text: textContent
      });

      if (error) {
        const sanitizedErrorCode = sanitizeEmailProviderError(error);
        console.error(JSON.stringify({
          event: 'RECOVERY_EMAIL_SEND_FAILED',
          timestamp: new Date().toISOString(),
          ...(correlationId ? { correlation_id: correlationId } : {}),
          error_code: sanitizedErrorCode
        }));
        return {
          success: false,
          error: sanitizedErrorCode
        };
      }

      console.log(JSON.stringify({
        event: 'RECOVERY_EMAIL_SEND_SUCCESS',
        timestamp: new Date().toISOString(),
        ...(correlationId ? { correlation_id: correlationId } : {}),
        message_id: data?.id || 'resend-ok'
      }));

      return {
        success: true,
        messageId: data?.id || 'resend-ok',
        simulated: false
      };
    } catch (err: any) {
      const sanitizedErrorCode = sanitizeEmailProviderError(err);
      console.error(JSON.stringify({
        event: 'RECOVERY_EMAIL_SEND_FAILED',
        timestamp: new Date().toISOString(),
        ...(correlationId ? { correlation_id: correlationId } : {}),
        error_code: sanitizedErrorCode
      }));
      return {
        success: false,
        error: sanitizedErrorCode
      };
    }
  }
}

/** Recuperação de acesso (RECOVERY): texto e HTML de antes (NORQVA-0023), sem mudança. */
export function buildRecoveryAccessEmail(params: SendPurchaseAccessEmailParams): { subject: string; text: string; html: string } {
    const { offerName, recoveryUrl } = params;
    const isPurchase = params.kind === 'PURCHASE';
    const validityDays = Math.max(1, Math.round((params.validityHours || 168) / 24));
    const subject = isPurchase
      ? `Pagamento confirmado: seu acesso a ${offerName}`
      : 'Recupere seu acesso à sua compra NORQVA';
    const introText = isPurchase
      ? `Seu pagamento foi confirmado. Obrigado pela compra de ${offerName}!`
      : `Recebemos uma solicitação de recuperação de acesso para a sua compra: ${offerName}.`;
    const noticeText = isPurchase
      ? `Guarde este e-mail: o link vale por ${validityDays} dias e pode ser aberto mais de uma vez.`
      : 'IMPORTANTE: Este link de acesso é de uso único e possui validade limitada de 72 horas por segurança.';
    const closingText = isPurchase
      ? 'Se tiver dificuldade para abrir o link, fale com o nosso atendimento que enviamos o seu material.'
      : 'Se você não realizou esta solicitação, desconsidere este e-mail. Seus dados e seu acesso continuam seguros.';

    const textContent = [
      'Olá!',
      '',
      introText,
      '',
      'Para acessar seu conteúdo e fazer o download do seu material, utilize o link de acesso exclusivo abaixo:',
      '',
      recoveryUrl,
      '',
      noticeText,
      '',
      closingText,
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
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
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
                ${isPurchase
                  ? `Seu pagamento foi confirmado. Obrigado pela compra de <strong style="color: #f0f6fc;">${escapeHtml(offerName)}</strong>!`
                  : `Recebemos uma solicitação de acesso para a sua compra de <strong style="color: #f0f6fc;">${escapeHtml(offerName)}</strong>.`}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #8b949e;">
                Clique no botão abaixo para acessar seu produto digital e realizar o download:
              </p>
              <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" bgcolor="#238636" style="border-radius: 6px; background-color: #238636; background-image: linear-gradient(#238636, #238636);">
                    <a href="${escapeHtml(recoveryUrl)}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff !important; -webkit-text-fill-color: #ffffff; text-decoration: none; border-radius: 6px; background-color: #238636; background-image: linear-gradient(#238636, #238636);">
                      <span style="color: #ffffff; -webkit-text-fill-color: #ffffff;">Acessar Meu Produto</span>
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
                  ${isPurchase
                    ? `<strong>Guarde este e-mail:</strong> o link vale por ${validityDays} dias e pode ser aberto mais de uma vez.`
                    : '<strong>Aviso de segurança:</strong> Este link é de <strong>uso único</strong> e expira em 72 horas. Após o primeiro acesso, o link será desativado.'}
                </p>
              </div>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #8b949e;">
                ${isPurchase
                  ? 'Se tiver dificuldade para abrir o link, fale com o nosso atendimento que enviamos o seu material.'
                  : 'Se você não solicitou esta recuperação de acesso, nenhuma ação é necessária. Apenas ignore esta mensagem.'}
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
  return { subject, text: textContent, html: htmlContent };
}

/** NORQVA-0074: texto e HTML do lembrete de pagamento (exportado para os testes). */
export function buildPaymentReminderEmail(p: SendPaymentReminderEmailParams, now: Date = new Date()): { subject: string; text: string; html: string } {
  const brl = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
  const pixValid = Boolean(p.pixCopyPaste) && (!p.pixExpiresAt || new Date(p.pixExpiresAt).getTime() > now.getTime());
  const name = (p.firstName || '').trim();
  const hello = name ? `Olá, ${name}!` : 'Olá!';
  const isCard = p.paymentMethod === 'CREDIT_CARD';
  const subject =
    p.step === 1 ? (isCard ? `Seu pagamento de ${p.offerName} está esperando` : `Seu Pix de ${p.offerName} está esperando`) :
    p.step === 2 ? `Ainda dá tempo: ${p.offerName}` :
    `Último lembrete: ${p.offerName}`;
  const intro = `Você começou a compra de ${p.offerName} (${brl(p.amount)}), mas o pagamento ainda não chegou para nós.`;
  const until = p.pixExpiresAt
    ? new Date(p.pixExpiresAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
  // Só diz "venceu" quando havia um código e ele venceu.
  const hadCode = Boolean(p.pixCopyPaste) || Boolean(p.pixExpired);
  const expiredLine = hadCode
    ? 'O código Pix anterior venceu. Gere um novo em menos de 1 minuto'
    : 'Para concluir, volte à página e finalize em menos de 1 minuto';
  const closing = 'Se você já pagou, pode ignorar este e-mail: a confirmação às vezes leva alguns minutos.';

  const textParts = [hello, '', intro, ''];
  if (pixValid) {
    textParts.push('Para concluir, abra o app do seu banco, escolha Pix > Pix Copia e Cola e cole este código:', '', String(p.pixCopyPaste), '');
    if (until) textParts.push(`O código vale até ${until}.`, '');
  } else if (p.invoiceUrl) {
    textParts.push('Para concluir o pagamento com cartão, use a página segura:', p.invoiceUrl, '');
  } else {
    textParts.push(expiredLine + ':', p.offerUrl, '');
  }
  textParts.push(closing, '', 'Equipe NORQVA');
  const text = textParts.join('\n');

  const button = (href: string, label: string) => `
              <table border="0" cellspacing="0" cellpadding="0" style="margin: 8px 0 20px 0;"><tr>
                <td align="center" style="border-radius: 8px; background-color: #b5532f;">
                  <a href="${escapeHtml(href)}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">${escapeHtml(label)}</a>
                </td></tr></table>`;
  let action = '';
  if (pixValid) {
    action = `
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #3d342c;">Para concluir, abra o app do seu banco, escolha <strong>Pix &gt; Pix Copia e Cola</strong> e cole este código:</p>
              <div style="margin: 0 0 12px 0; padding: 12px; background-color: #f6efe6; border: 1px solid #e3d5c3; border-radius: 8px; font-family: Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; color: #3d342c; word-break: break-all;">${escapeHtml(String(p.pixCopyPaste))}</div>
              ${until ? `<p style="margin: 0 0 20px 0; font-size: 13px; color: #7a6a5a;">O código vale até ${escapeHtml(until)}.</p>` : ''}`;
  } else if (p.invoiceUrl) {
    action = `
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #3d342c;">Para concluir o pagamento com cartão, use a página segura:</p>${button(p.invoiceUrl, 'Concluir pagamento')}`;
  } else {
    action = `
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #3d342c;">${escapeHtml(expiredLine)}:</p>${button(p.offerUrl, hadCode ? 'Gerar novo Pix' : 'Concluir a compra')}`;
  }
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin: 0; padding: 0; background-color: #fbf7f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fbf7f1; padding: 32px 16px;"><tr><td align="center">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border: 1px solid #eadfd2; border-radius: 12px;">
      <tr><td style="padding: 28px 28px 8px 28px;">
        <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #3d342c;">${escapeHtml(hello)}</p>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #3d342c;">${escapeHtml(intro)}</p>${action}
        <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 1.5; color: #7a6a5a;">${escapeHtml(closing)}</p>
        <p style="margin: 0 0 24px 0; font-size: 13px; color: #7a6a5a;">Equipe NORQVA</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}

export const SPAM_HINT = 'Não achou este e-mail depois? Procure em Spam ou Lixo eletrônico e marque como “Não é spam”.';
export const DOWNLOAD_REMINDER_INTRO = 'Vimos que você ainda não baixou o seu livro. O link abaixo é novo e já está liberado.';
/** NORQVA-0112: lembrete neutro para o que não é livro (Seca Barriga). */
export const DOWNLOAD_REMINDER_INTRO_FILES = 'Vimos que você ainda não baixou os seus arquivos. O link abaixo é novo e já está liberado.';
/** NORQVA-0112: ofertas que não são livro (Seca Barriga) usam "arquivos" no e-mail. */
export const isFilesOffer = (name: string | null | undefined) => /seca\s*barriga/i.test(String(name || ''));

/**
 * NORQVA-0107: e-mail de acesso da compra (PURCHASE) e lembrete de download (DOWNLOAD_REMINDER).
 * Visual claro (creme, texto escuro, botão terracota) e o nome da marca no topo, para o comprador
 * reconhecer o que comprou. Exportado para os testes.
 */
export function buildPurchaseAccessEmail(params: SendPurchaseAccessEmailParams): { subject: string; text: string; html: string } {
  const brand = sanitizeSenderName(params.senderName) || DEFAULT_SENDER_NAME;
  const offerName = params.offerName || 'sua compra';
  const url = params.recoveryUrl;
  const isReminder = params.kind === 'DOWNLOAD_REMINDER';
  const files = isFilesOffer(params.offerName);
  const validityDays = Math.max(1, Math.round((params.validityHours || 168) / 24));
  const subject = isReminder ? `Você ainda não baixou ${offerName}` : `Seu acesso a ${offerName} está pronto`;
  const intro = isReminder ? (files ? DOWNLOAD_REMINDER_INTRO_FILES : DOWNLOAD_REMINDER_INTRO) : `Obrigado pela compra de ${offerName}! Seu pagamento foi confirmado.`;
  const validity = `Guarde este e-mail: o link vale por ${validityDays} dias e pode ser aberto mais de uma vez.`;
  const help = 'Se tiver dificuldade para abrir o link, fale com o nosso atendimento que enviamos o seu material.';

  const text = [
    'Olá!',
    '',
    intro,
    '',
    isReminder ? `Para baixar ${offerName}, use o link abaixo:` : (files ? 'Para baixar os seus arquivos, use o link abaixo:' : 'Para baixar o seu livro, use o link abaixo:'),
    '',
    url,
    '',
    validity,
    '',
    SPAM_HINT,
    '',
    help,
    '',
    'Com carinho,',
    `Equipe ${brand}`
  ].join('\n');

  const ink = '#2B2B2B';
  const muted = '#6B6158';
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>:root { color-scheme: light; supported-color-schemes: light; }</style>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FBF7F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${ink};">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FBF7F0; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #FFFFFF; border: 1px solid #EADFD2; border-radius: 12px;">
          <tr>
            <td style="padding: 28px 28px 16px 28px; border-bottom: 1px solid #EADFD2; text-align: center;">
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 600; color: ${ink};">${escapeHtml(brand)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: ${ink};">Olá!</p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: ${ink};">${escapeHtml(intro)}</p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: ${ink};">${files ? 'Seus arquivos' : 'Seu livro'}: <strong>${escapeHtml(offerName)}</strong></p>
              <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 16px auto;">
                <tr>
                  <td align="center" bgcolor="#B5472B" style="border-radius: 10px; background-color: #B5472B; background-image: linear-gradient(#B5472B, #B5472B);">
                    <a href="${escapeHtml(url)}" target="_blank" style="display: inline-block; padding: 16px 32px; font-size: 18px; font-weight: 700; color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF; text-decoration: none; border-radius: 10px; background-color: #B5472B; background-image: linear-gradient(#B5472B, #B5472B);"><span style="color: #FFFFFF; -webkit-text-fill-color: #FFFFFF;">${files ? 'Baixar meus arquivos' : 'Baixar meu livro'}</span></a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 6px 0; font-size: 13px; color: ${muted}; text-align: center;">Se o botão não abrir, copie e cole este link no navegador:</p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; word-break: break-all; text-align: center;"><a href="${escapeHtml(url)}" target="_blank" style="color: #8A2F17; text-decoration: underline;">${escapeHtml(url)}</a></p>
              <p style="margin: 0 0 12px 0; padding: 12px 14px; background-color: #FBF7F0; border-radius: 8px; font-size: 13px; line-height: 1.5; color: ${ink};">${escapeHtml(validity)}</p>
              <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: ${ink};">${escapeHtml(SPAM_HINT)}</p>
              <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.5; color: ${muted};">${escapeHtml(help)}</p>
              <p style="margin: 0; font-size: 14px; color: ${ink};">Com carinho,<br>Equipe ${escapeHtml(brand)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
