/**
 * NORQVA Backend Data Contract Validation Utilities
 */

/**
 * Validates Brazilian CPF format and check digits using Modulo 11 algorithm.
 * Strictly rejects repeated digit sequences (e.g. 00000000000, 11111111111).
 */
export function validateCpf(cpf: string | undefined | null): boolean {
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
 * Validates full name: must have at least two name tokens and length >= 3.
 */
export function validateFullName(name: string | undefined | null): boolean {
  if (!name || typeof name !== 'string') return false;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every(p => p.length >= 1) && name.trim().length >= 3;
}

/**
 * Validates email with standard RFC 5322 regex.
 */
export function validateEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
