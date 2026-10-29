// NORQVA-0150: aviso de ativação incompleta some quando a Meta já mostra tudo ativo.
import { describe, it, expect } from 'vitest';
import { needsOperator } from '../features/acquisition/LaunchPlansCard';

const base: any = { id: 'p1', code: 'P1', question_text: 'Ativar?', daily_budget_brl: 20, max_spend_brl: 140, spec: { campaign: { name: 'C' }, adsets: [], ads: [] } };

describe('NORQVA-0150 — needsOperator', () => {
  it('aguardando operador continua pedindo resposta', () => {
    expect(needsOperator({ ...base, status: 'AWAITING_OPERATOR' })).toBe(true);
  });
  it('aprovado com erro e algo ainda parado pede "Sim" de novo', () => {
    expect(needsOperator({ ...base, status: 'APPROVED', last_error: '(#613)', activation_complete: false })).toBe(true);
    expect(needsOperator({ ...base, status: 'APPROVED', last_error: '(#613)' })).toBe(true);
  });
  it('aprovado com erro antigo mas tudo ativo na Meta não aparece', () => {
    expect(needsOperator({ ...base, status: 'APPROVED', last_error: '(#613)', activation_complete: true })).toBe(false);
  });
});
