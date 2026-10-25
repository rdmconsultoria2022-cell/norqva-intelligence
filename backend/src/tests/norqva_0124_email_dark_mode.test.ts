// NORQVA-0124: e-mail de acesso legível no modo escuro (só aparência; mesmo link e mesmas regras).
import { describe, test, expect } from 'vitest';
import { buildPurchaseAccessEmail, buildRecoveryAccessEmail } from '../services/resendProvider';

describe('NORQVA-0124 — e-mail de acesso no modo escuro', () => {
  const url = 'https://app.test/acesso/abc123';

  test('e-mail de compra pede cores claras, botão com cor fixa e link escrito grande e clicável', () => {
    const e = buildPurchaseAccessEmail({ email: 'a@b.c', offerName: 'Kit Trattoria Completo', recoveryUrl: url, kind: 'PURCHASE', validityHours: 168, senderName: 'Trattoria em Casa' });
    expect(e.html).toContain('<meta name="color-scheme" content="light">');
    expect(e.html).toContain('<meta name="supported-color-schemes" content="light">');
    expect(e.html).toContain('background-image: linear-gradient(#B5472B, #B5472B)');
    expect(e.html).toContain('-webkit-text-fill-color: #FFFFFF');
    // o botão e o link escrito levam ao mesmo endereço
    expect(e.html.split(`href="${url}"`).length - 1).toBe(2);
    expect(e.html).toMatch(/font-size: 14px[^"]*"><a href="https:\/\/app\.test\/acesso\/abc123"[^>]*text-decoration: underline/);
    expect(e.text).toContain(url);
  });

  test('e-mail de recuperação também pede cores claras e mantém o botão legível', () => {
    const e = buildRecoveryAccessEmail({ email: 'a@b.c', offerName: 'Kit Trattoria Completo', recoveryUrl: url, kind: 'RECOVERY', validityHours: 168, senderName: 'Trattoria em Casa' });
    expect(e.html).toContain('<meta name="color-scheme" content="light">');
    expect(e.html).toContain('background-image: linear-gradient(#238636, #238636)');
    // botão e link escrito clicáveis, para o mesmo endereço
    expect(e.html.split(`href="${url}"`).length - 1).toBe(2);
  });
});
