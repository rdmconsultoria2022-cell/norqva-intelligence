// NORQVA-0023: rótulo de entrega do painel. "DISPONÍVEL" só para entrega ativa;
// vencida e revogada aparecem como tal, para o operador ver quem ficou sem o produto.

export interface DeliveryLabelInput {
  download_count?: number | null;
  delivery_status?: string | null;
  access_email_status?: string | null;
}

export interface DeliveryLabel {
  text: string;
  tone: 'ok' | 'info' | 'warn' | 'muted';
}

export function deliveryStatusLabel(ord: DeliveryLabelInput): DeliveryLabel {
  const downloads = Number(ord.download_count) || 0;
  if (downloads > 0) return { text: `BAIXADO (${downloads})`, tone: 'ok' };
  switch (ord.delivery_status) {
    case 'ACTIVE':
      return { text: 'DISPONÍVEL', tone: 'info' };
    case 'EXPIRED':
      return { text: 'VENCIDA (SEM DOWNLOAD)', tone: 'warn' };
    case 'REVOKED':
      return { text: 'REVOGADA', tone: 'warn' };
    case null:
    case undefined:
    case '':
      return { text: 'PENDENTE', tone: 'muted' };
    default:
      return { text: String(ord.delivery_status), tone: 'muted' };
  }
}

export function accessEmailLabel(status?: string | null): DeliveryLabel | null {
  switch (status) {
    case 'SENT':
      return { text: 'E-MAIL ENVIADO', tone: 'ok' };
    case 'SIMULATED':
      return { text: 'E-MAIL SIMULADO', tone: 'muted' };
    case 'FAILED':
      return { text: 'E-MAIL FALHOU', tone: 'warn' };
    case 'SENDING':
      return { text: 'ENVIANDO E-MAIL', tone: 'muted' };
    default:
      return null;
  }
}
