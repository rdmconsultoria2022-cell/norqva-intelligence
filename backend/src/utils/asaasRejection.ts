/**
 * NORQVA-0148: motivo de uma recusa do Asaas (resposta 4xx ao criar cliente ou cobrança).
 *
 * O comprador vê o campo certo (e-mail, CPF, telefone ou nome) em vez de "verifique seus dados".
 * O motivo guardado no pagamento (`payments.failure_reason`) tem só o código do erro e o campo:
 * a descrição do Asaas serve apenas para reconhecer o campo e nunca é gravada nem devolvida
 * (pode repetir o que o comprador digitou).
 */

export type RejectedField = 'email' | 'cpf' | 'phone' | 'name' | null;

export interface AsaasRejection {
  field: RejectedField;
  message: string;
  reason: string;
}

const GENERIC = 'Não foi possível processar o pagamento com os dados fornecidos. Verifique seus dados e tente novamente.';

const MESSAGES: Record<Exclude<RejectedField, null>, string> = {
  email: 'Confira o e-mail: ele precisa estar completo, sem acento, ç ou espaço.',
  cpf: 'Confira o CPF: ele não foi aceito. Use o CPF de quem está comprando.',
  phone: 'Confira o telefone: informe o celular com DDD.',
  name: 'Confira o nome: informe nome e sobrenome, só com letras.'
};

function fieldOf(text: string): RejectedField {
  const t = text.toLowerCase();
  if (/e-?mail/.test(t)) return 'email';
  if (/cpf|cnpj/.test(t)) return 'cpf';
  if (/phone|telefone|celular|mobile/.test(t)) return 'phone';
  if (/\bname\b|nome/.test(t)) return 'name';
  return null;
}

export function describeAsaasRejection(err: { statusCode?: number; responseBody?: unknown } | null | undefined): AsaasRejection {
  const status = Number(err?.statusCode) || 0;
  let errors: { code?: unknown; description?: unknown }[] = [];
  try {
    const body = typeof err?.responseBody === 'string' ? JSON.parse(err.responseBody) : err?.responseBody;
    if (body && Array.isArray((body as any).errors)) errors = (body as any).errors;
  } catch {
    errors = [];
  }

  const codes = errors
    .map(e => String(e?.code ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40))
    .filter(Boolean)
    .slice(0, 3);

  // o código manda; a descrição só ajuda quando o código não diz o campo
  let field: RejectedField = null;
  for (const c of codes) {
    field = fieldOf(c);
    if (field) break;
  }
  if (!field) {
    for (const e of errors) {
      field = fieldOf(String(e?.description ?? ''));
      if (field) break;
    }
  }

  const reason = `ASAAS_${status || 'ERRO'}:${codes.join(',') || 'sem_codigo'}:${field || 'outro'}`.slice(0, 120);
  return { field, message: field ? MESSAGES[field] : GENERIC, reason };
}
