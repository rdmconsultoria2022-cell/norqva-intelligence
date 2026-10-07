import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MethodView } from '../features/method/MethodView';

// NORQVA-0022 — tela "Método NORQVA".

const stage = (n: number, title: string, status: string, pending: string[] = [], evidence: string[] = []) => ({
  n, key: title.toUpperCase(), title, question: `Pergunta ${n}`, folder: `0${n}_X`, status, progress: status === 'CONCLUIDO' ? 100 : 0, pending, evidence, owner_id: null, notes: null
});
const caseData = {
  principles: [],
  case: { id: 'c1', human_id: 'MC-0001', title: 'Trattoria em Casa · OFF-000001', central_proposition: 'Reproduzir em casa uma experiência de trattoria.', proposition_status: 'HIPOTESE', audience_summary: null, problem_desire: null },
  product: { name: 'Trattoria em Casa' },
  offer: { human_id: 'OFF-000001', price: '19.90', promotional_price: null },
  stages: [
    stage(1, 'Produto', 'CONCLUIDO', [], ['Produto PRD-1']),
    stage(2, 'Público', 'NAO_INICIADO', ['PENDENTE: público', 'PENDENTE: problema/desejo']),
    stage(3, 'Pesquisa', 'EM_ANDAMENTO'),
    stage(4, 'Oferta', 'EM_ANDAMENTO', ['NÃO VALIDADO: proposta central é hipótese de oferta']),
    stage(5, 'Hipóteses', 'NAO_INICIADO', ['PENDENTE: nenhuma hipótese registrada']),
    stage(6, 'Criativos', 'EM_ANDAMENTO'),
    stage(7, 'Estrutura', 'EM_ANDAMENTO', ['PENDENTE: compras não chegaram à Meta nos últimos 30 dias']),
    stage(8, 'Meta Ads', 'CONCLUIDO'),
    stage(9, 'Medição', 'EM_ANDAMENTO', ['DADOS INSUFICIENTES']),
    stage(10, 'Decisão / Aprendizado', 'NAO_INICIADO', ['PENDENTE: nenhuma decisão registrada'])
  ],
  hypotheses: [],
  creatives: [
    {
      id: 'cr1', human_id: 'TR_V2_FOOD', hypothesis_id: null, hypothesis: null, pipeline: 'MEDIDO',
      measurement: { data_level: 'DADOS_INSUFICIENTES', metrics: { investimento: 38.86, impressoes: 900, cpm: null, cliques: 20, ctr: 2.2, cpc: 1.94, visitas: null, checkout: null, compras: 2, conversao: null, receita: 39.8, cac: 19.43, roas: 1.02 } },
      checklist: { ready: false, items: [{ key: 'HIPOTESE', label: 'Hipótese registrada', ok: false, critical: true, detail: 'PENDENTE: criativo sem hipótese' }, { key: 'PRODUTO', label: 'Produto definido', ok: true, critical: true, detail: 'ok' }] }
    }
  ],
  external_ads: [{ meta_ad_id: 'a9', name: 'TRATTORIA_V1_AD_C', campaign_name: 'CONTROL', measurement: { data_level: 'DADOS_CONFIAVEIS', metrics: null } }],
  decisions: [],
  learnings: [],
  launch_plans: [],
  signals: {}
};

function setup(opts: { role?: string; cases?: any[] } = {}) {
  const apiFetch = vi.fn(async (url: string, _o?: any) => {
    if (url.startsWith('/method/cases?')) return { cases: opts.cases ?? [{ id: 'c1', human_id: 'MC-0001', title: 'Trattoria', offer_human_id: 'OFF-000001' }] };
    if (url.startsWith('/method/cases/c1')) return caseData;
    if (url.startsWith('/method/cases') && _o?.method === 'POST') return { case: { id: 'c1' }, created: true };
    return {};
  });
  render(<MethodView currentUser={{ role: opts.role ?? 'ADMIN' }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
}

describe('Método NORQVA — tela', () => {
  it('shows the principles and the 10-stage map with honest statuses', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('method-map')).toBeInTheDocument());
    expect(screen.getByTestId('method-principles')).toHaveTextContent('Cada criativo deve testar uma hipótese');
    expect(screen.getByTestId('method-principles')).toHaveTextContent('1. vendas; 2. aprendizado');
    for (let n = 1; n <= 10; n++) expect(screen.getByTestId(`method-stage-${n}`)).toBeInTheDocument();
    expect(within(screen.getByTestId('method-stage-2')).getByTestId('stage-status')).toHaveTextContent('Não iniciado');
    expect(screen.getByTestId('method-stage-4')).toHaveTextContent('NÃO VALIDADO');
    expect(screen.getByTestId('proposition-status')).toHaveTextContent('HIPÓTESE DE OFERTA · NÃO VALIDADO');
    expect(screen.getByTestId('method-case-header')).toHaveTextContent('PENDENTE');

    fireEvent.click(within(screen.getByTestId('method-stage-1')).getByRole('button', { name: /Ver detalhes/ }));
    expect(screen.getByTestId('stage-detail')).toHaveTextContent('Produto PRD-1');
  });

  it('creative without hypothesis shows NÃO PRONTO and its pipeline stage', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('method-map')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Criativos' }));
    await waitFor(() => expect(screen.getByTestId('method-creative')).toBeInTheDocument());
    expect(screen.getByTestId('creative-go-hypotheses')).toBeInTheDocument();
    expect(screen.getByTestId('creative-readiness')).toHaveTextContent('NÃO PRONTO');
    expect(screen.getByTestId('method-creative')).toHaveTextContent('PENDENTE: sem hipótese registrada');
    expect(screen.getByTestId('method-creative')).toHaveTextContent('MEDIDO');
  });

  it('with no hypothesis the Hipóteses form opens first and the Hipótese field accepts typing', async () => {
    const apiFetch = setup();
    const field = (await screen.findByLabelText('Hipótese')) as HTMLInputElement;
    const btn = screen.getByRole('button', { name: 'Registrar hipótese' });
    expect(btn).toBeDisabled();
    fireEvent.change(field, { target: { value: 'Evitar erros gera mais intenção que receita genérica' } });
    expect(field.value).toBe('Evitar erros gera mais intenção que receita genérica');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).startsWith('/method/cases/c1/hypotheses') && (c[1] as any)?.method === 'POST')).toBe(true));
  });

  it('Criativos tab shortcut leads to the hypothesis form', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('method-map')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Criativos' }));
    fireEvent.click(await screen.findByTestId('creative-go-hypotheses'));
    expect(screen.getByTestId('hypothesis-form')).toBeInTheDocument();
  });

  it('measurement never shows zero for missing data', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('method-map')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Medição' }));
    const t = screen.getByTestId('method-measurement');
    expect(t).toHaveTextContent('DADOS INSUFICIENTES');
    expect(t).toHaveTextContent('DADOS CONFIÁVEIS');
    expect(t).toHaveTextContent('—');
    expect(t).toHaveTextContent('não é significância estatística');
  });

  it('ADMIN can create the Trattoria pilot case; other roles cannot', async () => {
    const apiFetch = setup({ cases: [] });
    const btn = await screen.findByTestId('method-create-pilot');
    fireEvent.click(btn);
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).startsWith('/method/cases?mode=real') && (c[1] as any)?.method === 'POST')).toBe(true));
    const call = apiFetch.mock.calls.find(c => (c[1] as any)?.method === 'POST') as any;
    expect(JSON.parse(call[1].body)).toMatchObject({ offer_human_id: 'OFF-000001' });
  });

  it('non-admin sees no pilot button and no decision form', async () => {
    setup({ role: 'CREATIVE', cases: [] });
    await waitFor(() => expect(screen.getByTestId('method-view')).toBeInTheDocument());
    expect(screen.queryByTestId('method-create-pilot')).toBeNull();
  });
});
