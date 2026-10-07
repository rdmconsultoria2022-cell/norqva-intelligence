import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiTeamView, validationPassed } from '../features/intelligence/AiTeamView';

// NORQVA-0021 (P2): validador (Claude crítico) como portão antes do plano.

const base = {
  source: 'ACCOUNT', source_level: 'ad', brief: null, product_name: 'Trattoria em Casa', niche_name: null,
  task_kind: null, task_stage: null, task_status: null, task_response: null, session_url: null, updated_at: '2026-10-06T23:00:00Z',
  ai_score: 62, verdict: 'TESTAR', evaluation: { by: 'Claude', score: 62, verdict: 'TESTAR', summary: 'Vale um teste.' }, second_opinion: null,
  plan: null, batch_code: null, status: 'AVALIADA', validation: null, validation_verdict: null, validation_override: null
};
const checklist = [
  { key: 'AMOSTRA', label: 'Tamanho da amostra e confiança dos dados', status: 'FALHA', note: 'só R$ 38 de gasto' },
  { key: 'CONTA_FECHA', label: 'CPA alcançável × CPA de equilíbrio (a conta fecha?)', status: 'ALERTA', note: null }
];
const opps = [
  { ...base, id: 'a', human_id: 'OPP-0010', title: 'Sem validação' },
  {
    ...base, id: 'b', human_id: 'OPP-0011', title: 'Vetada', validation_verdict: 'PEDE_EVIDENCIA',
    validation: { verdict: 'PEDE_EVIDENCIA', summary: 'Amostra pequena demais.', checklist, questions: ['O CPA se repete com R$ 100?'], required_evidence: ['R$ 50 de gasto no anúncio'] }
  },
  { ...base, id: 'c', human_id: 'OPP-0012', title: 'Aprovada pelo validador', validation_verdict: 'APROVA', validation: { verdict: 'APROVA', summary: 'Ok.', checklist: [] } }
];

function setup(role = 'ADMIN') {
  const apiFetch = vi.fn(async (url: string, _opts?: any) => (url.startsWith('/ai-team/opportunities?') ? { opportunities: opps } : {}));
  render(<AiTeamView currentUser={{ id: 'u', role }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
}
const card = (title: string) => screen.getByText(title).closest('[data-testid="ai-opportunity"]') as HTMLElement;
const btn = (title: string, name: RegExp) => Array.from(card(title).querySelectorAll('button')).find(b => name.test(b.textContent || '')) || null;

describe('NORQVA-0021 — validador no Time de IAs', () => {
  it('gate rule matches the backend', () => {
    expect(validationPassed({ validation_verdict: 'APROVA', validation_override: null })).toBe(true);
    expect(validationPassed({ validation_verdict: 'REPROVA', validation_override: { justification: 'x' } })).toBe(true);
    expect(validationPassed({ validation_verdict: 'PEDE_EVIDENCIA', validation_override: null })).toBe(false);
  });

  it('plan button only after approval; validation is requested with kind VALIDATE', async () => {
    const apiFetch = setup();
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity')).toHaveLength(3));
    expect(btn('Sem validação', /Montar plano/)).toBeNull();
    expect(btn('Vetada', /Montar plano/)).toBeNull();
    expect(btn('Aprovada pelo validador', /Montar plano/)).not.toBeNull();

    fireEvent.click(btn('Sem validação', /Pedir validação/)!);
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/ai-team/opportunities/a/dispatch?mode=real')).toBe(true));
    const call = apiFetch.mock.calls.find(c => c[0] === '/ai-team/opportunities/a/dispatch?mode=real') as any;
    expect(JSON.parse(call[1].body)).toEqual({ kind: 'VALIDATE' });
  });

  it('shows the checklist, questions and requested evidence', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity')).toHaveLength(3));
    expect(card('Vetada')).toHaveTextContent('Validador pede evidência');
    fireEvent.click(screen.getByText('Vetada'));
    const v = screen.getByTestId('ai-opportunity-validation');
    expect(v).toHaveTextContent('FALHA · Tamanho da amostra');
    expect(v).toHaveTextContent('só R$ 38 de gasto');
    expect(v).toHaveTextContent('O CPA se repete com R$ 100?');
    expect(v).toHaveTextContent('R$ 50 de gasto no anúncio');
  });

  it('override needs a justification of at least 20 characters', async () => {
    const apiFetch = setup();
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity')).toHaveLength(3));
    expect(btn('Sem validação', /Derrubar veto/)).toBeNull();
    fireEvent.click(btn('Vetada', /Derrubar veto/)!);
    const confirm = screen.getByRole('button', { name: /Confirmar e derrubar o veto/ });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Teste barato para aprender o público.' } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/ai-team/opportunities/b/validation-override?mode=real')).toBe(true));
    const call = apiFetch.mock.calls.find(c => c[0] === '/ai-team/opportunities/b/validation-override?mode=real') as any;
    expect(JSON.parse(call[1].body)).toEqual({ justification: 'Teste barato para aprender o público.' });
  });

  it('non-admin sees the verdict but no gate actions', async () => {
    setup('INTELLIGENCE');
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /Pedir validação/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Derrubar veto/ })).toBeNull();
    expect(screen.getAllByTestId('validation-badge').length).toBe(2);
  });
});
