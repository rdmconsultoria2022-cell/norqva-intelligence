/**
 * NORQVA Checkout Data Contract Validation & Masking Utilities
 */

/**
 * Validates Brazilian CPF format and check digits using Modulo 11 algorithm.
 * Strictly rejects repeated digit sequences (e.g. 00000000000, 11111111111).
 */
export function validateCpf(cpf: string): boolean {
  if (!cpf || typeof cpf !== 'string') return false;
  const clean = cpf.replace(/\D/g, '');

  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  // 1st Check Digit
  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rest1 = (sum1 * 10) % 11;
  if (rest1 === 10 || rest1 === 11) rest1 = 0;
  if (rest1 !== parseInt(clean.charAt(9), 10)) return false;

  // 2nd Check Digit
  let sum2 = 0;
  for (let i = 0; i < 10; i++) {
    sum2 += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  let rest2 = (sum2 * 10) % 11;
  if (rest2 === 10 || rest2 === 11) rest2 = 0;
  if (rest2 !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * Applies standard Brazilian CPF mask: 000.000.000-00
 */
export function maskCpf(value: string): string {
  if (!value) return '';
  const clean = value.replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

/**
 * Validates full name: must have at least two name tokens and length >= 3.
 */
export function validateFullName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every(p => p.length >= 1) && name.trim().length >= 3;
}

/**
 * NORQVA-0148: motivo de um e-mail que o Asaas recusaria (null = e-mail aceito).
 * O Asaas não aceita acento, ç nem espaço; o comprador vê o motivo antes de gerar a cobrança.
 */
export function emailProblem(email: string | undefined | null): string | null {
  const value = typeof email === 'string' ? email.trim() : '';
  if (!value) return 'Informe um e-mail válido.';
  if (/[^\x00-\x7F]/.test(value)) return 'Confira o e-mail: ele não pode ter acento nem ç.';
  if (/\s/.test(value)) return 'Confira o e-mail: ele não pode ter espaço.';
  const at = value.lastIndexOf('@');
  const local = at > 0 ? value.slice(0, at) : '';
  if (
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(value) ||
    value.includes('..') ||
    local.startsWith('.') ||
    local.endsWith('.')
  ) {
    return 'Informe um e-mail válido.';
  }
  return null;
}

/**
 * E-mail aceito pelo checkout e pelo Asaas (NORQVA-0148: sem acento, ç ou espaço).
 */
export function validateEmail(email: string | undefined | null): boolean {
  return emailProblem(email) === null;
}

/**
 * Applies Brazilian phone mask: (00) 00000-0000 or (00) 0000-0000
 */
export function maskPhone(value: string): string {
  if (!value) return '';
  const clean = value.replace(/\D/g, '').slice(0, 11);
  if (clean.length === 0) return '';
  if (clean.length <= 2) return `(${clean}`;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
}
