// NORQVA-0117: "Criar campanha pausada" na tela de geração (só ADMIN).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneratedCampaignPanel, adLooksReady } from '../features/creative-factory/GeneratedCampaignPanel';

const overview = (over: any = {}) => ({
  plan: null,
  page: { id: 'g1', human_id: 'GEN-000001', status: 'PUBLISHED', url: 'https://acesso.norqva.com.br/v/livro-abc123' },
  mutation_enabled: true,
  images: 2,
  rebuildable: false,
  ads: [{ id: 'c1', human_id: 'GEN-000001-A1', ready: true, reason: null }],
  defaults: { campaign_name: 'NQ – Trattoria – Ref REF-000001 – Vendas', daily_budget_brl: 30, max_spend_brl: 210, age_min: 25, age_max: 65, min_daily_budget_brl: 5, max_daily_budget_brl: 100 },
  ...over
});
const approved = { id: 'c1', approval_status: 'APPROVED', copy_check: { blocked: false } };

describe('NORQVA-0117 — Criar campanha pausada', () => {
  it('anúncio pronto = aprovado e sem bloqueio nem checagem vencida', () => {
    expect(adLooksReady(approved)).toBe(true);
    expect(adLooksReady({ ...approved, copy_check: { stale: true } })).toBe(false);
    expect(adLooksReady({ ...approved, copy_check: { blocked: true } })).toBe(false);
    expect(adLooksReady({ ...approved, approval_status: 'DRAFT' })).toBe(false);
  });

  it('desligado enquanto a página não está no ar ou sem anúncio liberado (palavra do servidor)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(overview({ ads: [{ id: 'c1', ready: false, reason: 'checagem vencida' }] }));
    const { rerender } = render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="APPROVED" ads={[approved]} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('create-paused-campaign')).toBeDisabled();
    expect(screen.getByTestId('campaign-why')).toHaveTextContent('Publique a página');
    rerender(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[{ ...approved, copy_check: { stale: true } }]} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(screen.getByTestId('create-paused-campaign')).toBeDisabled();
    expect(screen.getByTestId('campaign-why')).toHaveTextContent('Aprove pelo menos um anúncio');
  });

  it('plano em rascunho sem nada na Meta: "Montar de novo" abre o formulário e manda de novo', async () => {
    const plan = { id: 'p1', code: 'CMP-GEN-000001', status: 'REJECTED', spec: { campaign: { name: 'NQ' } }, meta_ids: {} };
    const apiFetch = vi.fn().mockImplementation((url: string, opts?: any) =>
      Promise.resolve(opts?.method === 'POST' ? { plan: { ...plan, status: 'AWAITING_OPERATOR' }, rebuilt: true, created: true } : overview({ plan, rebuildable: true }))
    );
    render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[approved]} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('rebuild-campaign'));
    expect(screen.getByTestId('campaign-submit')).toHaveTextContent('Montar de novo e criar pausada');
    fireEvent.click(screen.getByTestId('campaign-submit'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/generated-pages/g1/campaign', expect.objectContaining({ method: 'POST' })));
  });

  it('campanha já na Meta: sem "Montar de novo"', async () => {
    const apiFetch = vi.fn().mockResolvedValue(overview({ plan: { id: 'p1', code: 'CMP-GEN-000001', status: 'AWAITING_OPERATOR', spec: { campaign: { name: 'NQ' } } }, rebuildable: false }));
    render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[approved]} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('open-manage')).toBeInTheDocument();
    expect(screen.queryByTestId('rebuild-campaign')).toBeNull();
    expect(screen.getByTestId('generated-campaign')).toHaveTextContent('continue em Campanhas');
  });

  it('formulário com as sugestões; criar manda os valores e mostra o resultado', async () => {
    const created = { plan: { id: 'p1', code: 'CMP-GEN-000001', status: 'AWAITING_OPERATOR', spec: { campaign: { name: 'NQ – X' } } }, created: true };
    let after: any = overview();
    const apiFetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        after = overview({ plan: created.plan });
        return Promise.resolve(created);
      }
      return Promise.resolve(after);
    });
    const ok = vi.fn();
    render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[approved]} showError={vi.fn()} showSuccess={ok} />);
    fireEvent.click(await screen.findByTestId('create-paused-campaign'));
    expect(screen.getByLabelText('Nome da campanha')).toHaveValue('NQ – Trattoria – Ref REF-000001 – Vendas');
    expect(screen.getByLabelText('Orçamento por dia (R$)')).toHaveValue(30);
    expect(screen.getByLabelText('Teto total (R$)')).toHaveValue(210);
    expect(screen.getByTestId('campaign-form')).toHaveTextContent('https://acesso.norqva.com.br/v/livro-abc123');
    expect(screen.getByTestId('campaign-form')).toHaveTextContent('Tudo nasce PAUSADO');
    fireEvent.change(screen.getByLabelText('Orçamento por dia (R$)'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('campaign-submit'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/generated-pages/g1/campaign', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'POST')![1].body);
    expect(body).toEqual({ campaign_name: 'NQ – Trattoria – Ref REF-000001 – Vendas', daily_budget_brl: 40, max_spend_brl: 210, age_min: 25, age_max: 65 });
    expect(await screen.findByTestId('campaign-plan-code')).toHaveTextContent('CMP-GEN-000001');
    expect(ok).toHaveBeenCalledWith(expect.stringContaining('PAUSADA'));
  });

  it('plano existente: mostra o código e abre o Gerenciar campanha', async () => {
    const apiFetch = vi.fn().mockResolvedValue(overview({ plan: { id: 'p1', code: 'CMP-GEN-000001', status: 'AWAITING_OPERATOR', spec: { campaign: { name: 'NQ' } } } }));
    const heard = vi.fn();
    window.addEventListener('nq:open-campaign', heard);
    render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[approved]} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('open-manage'));
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ planCode: 'CMP-GEN-000001' });
    expect(screen.queryByTestId('create-paused-campaign')).toBeNull();
    window.removeEventListener('nq:open-campaign', heard);
  });

  it('cadastro na Meta desligado: rascunho com o aviso', async () => {
    const apiFetch = vi.fn().mockResolvedValue(overview({ mutation_enabled: false, plan: { id: 'p1', code: 'CMP-GEN-000001', status: 'DRAFT', spec: { campaign: { name: 'NQ' } } } }));
    render(<GeneratedCampaignPanel apiFetch={apiFetch} pageId="g1" pageStatus="PUBLISHED" ads={[approved]} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('campaign-message')).toHaveTextContent('Cadastro na Meta desligado');
  });
});
