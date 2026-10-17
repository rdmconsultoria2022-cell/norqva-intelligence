// NORQVA-0095: central de pendências (sino, avisos e atalho para a campanha). Servidor simulado.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AlertCenterSheet, type AlertNotification, type AlertCenterData } from '../features/alerts/AlertCenter';
import { Header } from '../components/layout/Header';
import { visibleGroups } from '../components/layout/navigation';

const base = {
  description: 'mensagem', read: false, resolution: null, dismiss_reason: null, created_at: '2026-10-16T12:00:00Z', resolved_at: null
};
const critical: AlertNotification = {
  ...base,
  id: 'a1', rule_code: 'SPEND_WITHOUT_SALE', title: 'Anúncio gastando sem vender', severity: 'CRITICAL',
  recommended_action: 'Pausar o anúncio ou trocar o criativo.', state: 'NOVA', is_problem: true, is_open: true,
  entity: { type: 'AD', meta_campaign_id: '222', campaign_name: 'Trattoria', ad_name: 'Vídeo 1', plan_code: null },
  link: { tab: 'results', meta_campaign_id: '222', plan_code: null }
};
const info: AlertNotification = {
  ...base,
  id: 'a2', rule_code: 'EXPERIMENT_CAP_EXTENDED_PROFIT', title: 'Teto ampliado por lucro', severity: 'INFO',
  recommended_action: 'Nenhuma ação: a campanha está dando lucro.', state: 'NOVA', is_problem: false, is_open: true,
  entity: { type: 'CAMPAIGN', meta_campaign_id: '333', campaign_name: 'Dolci', ad_name: null, plan_code: 'TR-EXP03' },
  link: { tab: 'cap', meta_campaign_id: '333', plan_code: 'TR-EXP03' }
};
const data: AlertCenterData = { notifications: [critical, info], unread_count: 2, open_problems_count: 1 };

describe('NORQVA-0095 — central de pendências', () => {
  it('o sino mostra os não lidos e abre a central', () => {
    const open = vi.fn();
    render(
      <Header
        activeTab="dashboard"
        setActiveTab={vi.fn()}
        currentUser={{ id: 'u', name: 'Ricardo', email: 'r@x', role: 'ADMIN' } as any}
        handleSignOut={vi.fn()}
        groups={visibleGroups('ADMIN')}
        badges={{ campaigns: 1 }}
        isDemoView={false}
        setIsDemoView={vi.fn()}
        unreadCount={2}
        onOpenNotifications={open}
      />
    );
    const bell = screen.getByTestId('header-alerts');
    expect(bell).toHaveAccessibleName('Avisos: 2 não lido(s)');
    fireEvent.click(bell);
    expect(open).toHaveBeenCalled();
  });

  it('separa pendências de informativos e marca como lidos ao abrir', async () => {
    const apiFetch = vi.fn(async () => ({ marked: 2 }));
    const changed = vi.fn();
    render(
      <AlertCenterSheet open data={data} canAct apiFetch={apiFetch} isDemoView={false} onClose={vi.fn()} onOpenCampaign={vi.fn()} onChanged={changed} showError={vi.fn()} />
    );
    const problems = screen.getByRole('region', { name: 'Pendências' });
    expect(within(problems).getByText('Anúncio gastando sem vender')).toBeInTheDocument();
    expect(within(problems).getByText(/Pausar o anúncio/)).toBeInTheDocument();
    expect(within(problems).queryByText('Teto ampliado por lucro')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Outros avisos' })).getByText('Teto ampliado por lucro')).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/alerts/read?mode=real', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse((apiFetch.mock.calls[0] as any)[1].body)).toEqual({ ids: ['a1', 'a2'] });
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('"Abrir campanha" leva à campanha do aviso', () => {
    const go = vi.fn();
    render(<AlertCenterSheet open data={{ ...data, unread_count: 0 }} canAct={false} apiFetch={vi.fn()} isDemoView={false} onClose={vi.fn()} onOpenCampaign={go} onChanged={vi.fn()} showError={vi.fn()} />);
    fireEvent.click(within(screen.getByTestId('alert-a1')).getByRole('button', { name: /Abrir campanha/ }));
    expect(go).toHaveBeenCalledWith(critical);
    // sem permissão, não aparecem "Estou tratando" nem "Descartar"
    expect(screen.queryByRole('button', { name: 'Estou tratando' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument();
  });

  it('descartar alerta crítico pede motivo antes de enviar', async () => {
    const apiFetch = vi.fn(async (url: string) => (url.includes('/dismiss') ? { notification: { ...critical, state: 'DESCARTADA', is_open: false, dismiss_reason: 'Já trocado' } } : {}));
    render(<AlertCenterSheet open data={{ ...data, unread_count: 0 }} canAct apiFetch={apiFetch} isDemoView={false} onClose={vi.fn()} onOpenCampaign={vi.fn()} onChanged={vi.fn()} showError={vi.fn()} />);
    const card = screen.getByTestId('alert-a1');
    fireEvent.click(within(card).getByRole('button', { name: 'Descartar' }));
    const confirm = within(card).getByRole('button', { name: 'Confirmar descarte' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(card).getByLabelText(/Por que descartar/), { target: { value: 'Já trocado' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/alerts/a1/dismiss?mode=real', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText(/Descartado: Já trocado/)).toBeInTheDocument();
  });
});
