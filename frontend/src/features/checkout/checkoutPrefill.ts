// NORQVA-0112: link direto para o pagamento (/p/:humanId?checkout=1&name=...&email=...&phone=...).
// O quiz externo manda os dados que a pessoa já digitou; aqui eles só preenchem o formulário (ela confere e
// completa com o CPF). Nome, e-mail e telefone saem da barra de endereço logo ao abrir, para não irem
// para o Pixel, a telemetria nem o endereço da página gravado no pedido.

import type { CheckoutCustomer } from './checkoutTypes';
import { validateEmail } from './checkoutValidation';

export const PREFILL_PARAMS = ['name', 'email', 'phone'] as const;

/** `?checkout=1` abre o pagamento direto. */
export function wantsDirectCheckout(search: string): boolean {
  try {
    return new URLSearchParams(search).get('checkout') === '1';
  } catch {
    return false;
  }
}

/** Telefone em dígitos com DDD (10 ou 11). Aceita 55 + DDD + número (12 ou 13 dígitos) e tira o 55. */
export function normalizePrefillPhone(raw: string | null | undefined): string {
  let d = String(raw || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : '';
}

/** Dados do comprador vindos do link (null quando não há nenhum válido). */
export function prefillFromSearch(search: string): Partial<CheckoutCustomer> | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const name = String(params.get('name') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const emailRaw = String(params.get('email') || '').trim().toLowerCase().slice(0, 254);
  const email = emailRaw && validateEmail(emailRaw) ? emailRaw : '';
  const phone = normalizePrefillPhone(params.get('phone'));
  if (!name && !email && !phone) return null;
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {})
  };
}

/** Tira nome, e-mail e telefone do endereço da página (fica o resto: checkout=1, UTMs, fbclid, src). */
export function stripPrefillFromWindowUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of PREFILL_PARAMS) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* sem acesso ao histórico: segue sem limpar */
  }
}
