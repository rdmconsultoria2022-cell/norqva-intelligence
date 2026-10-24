// NORQVA-0118: pausa noturna em Gerenciar campanha → Configurações.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NightPauseSettings, nightWindowError, hourLabel, changeLabel } from '../features/campaigns/CampaignManage';

function setup(settings: any, canEdit = true) {
  const showSuccess = vi.fn();
  const showError = vi.fn();
  const apiFetch = vi.fn(async (url: string, o?: any) => {
    if (o?.method === 'POST') {
      const body = JSON.parse(o.body);
      return { ...settings, ...body, runs: [] };
    }
    return settings;
  });
  render(<NightPauseSettings campaignId="p1" canEdit={canEdit} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />);
  return { apiFetch, showSuccess, showError };
}

const base = { enabled: true, start: '00:00', end: '06:00', timezone: 'America/Sao_Paulo', master_enabled: true, runs: [] };
const postCall = (apiFetch: any) => apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'POST') as any;

describe('NORQVA-0118 — pausa noturna na tela', () => {
  it('rótulos e validação da janela', () => {
    expect(hourLabel('00:00')).toBe('00h');
    expect(hourLabel('01:30')).toBe('01h30');
    expect(nightWindowError('00:00', '06:00')).toBeNull();
    expect(nightWindowError('06:00', '00:00')).toMatch(/antes do fim/);
    expect(nightWindowError('', '06:00')).toMatch(/HH:MM/);
    expect(nightWindowError('22:00', '23:00')).toBeNull();
    expect(nightWindowError('22:00', '23:58')).toMatch(/23:00/);
    expect(changeLabel({ origin: 'NIGHT_PAUSE', kind: 'STATUS', requested_value: 'PAUSED' })).toBe('Pausa noturna');
    expect(changeLabel({ origin: 'NIGHT_PAUSE', kind: 'STATUS', requested_value: 'ACTIVE' })).toBe('Fim da pausa noturna');
    expect(changeLabel({ kind: 'STATUS', requested_value: 'PAUSED' })).toBe('Pausar');
  });

  it('mostra o padrão ligado (00h–06h) e salva desligado', async () => {
    const { apiFetch, showSuccess } = setup(base);
    const sw = await screen.findByRole('switch', { name: 'Pausa noturna (00h–06h)' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('night-pause-save')).toBeDisabled();
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('night-pause-save'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(postCall(apiFetch)[0]).toBe('/campaigns/p1/night-pause?mode=real');
    expect(JSON.parse(postCall(apiFetch)[1].body)).toEqual({ enabled: false, start: '00:00', end: '06:00' });
  });

  it('edita os horários; janela inválida bloqueia o salvar', async () => {
    const { apiFetch, showSuccess } = setup(base);
    const startInput = await screen.findByLabelText('Início da pausa noturna');
    const endInput = screen.getByLabelText('Fim da pausa noturna');
    fireEvent.change(startInput, { target: { value: '07:00' } });
    expect(screen.getByTestId('night-pause-error')).toHaveTextContent('antes do fim');
    expect(screen.getByTestId('night-pause-save')).toBeDisabled();
    fireEvent.change(startInput, { target: { value: '01:30' } });
    fireEvent.change(endInput, { target: { value: '05:00' } });
    expect(screen.queryByTestId('night-pause-error')).toBeNull();
    // o título mostra o horário salvo até salvar
    expect(screen.getByRole('switch', { name: 'Pausa noturna (00h–06h)' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('night-pause-save'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(await screen.findByRole('switch', { name: 'Pausa noturna (01h30–05h)' })).toBeInTheDocument();
    expect(JSON.parse(postCall(apiFetch)[1].body)).toEqual({ enabled: true, start: '01:30', end: '05:00' });
    expect(String(showSuccess.mock.calls[0][0])).toContain('01:30');
  });

  it('quem não é administrador só vê; chave geral desligada aparece; últimas noites', async () => {
    setup({ ...base, master_enabled: false, runs: [{ id: 'r1', night_date: '2026-10-24', state: 'CANCELLED', reason: 'a campanha foi pausada pela tela durante a noite.' }] }, false);
    const sw = await screen.findByRole('switch');
    expect(sw).toBeDisabled();
    expect(screen.getByLabelText('Início da pausa noturna')).toBeDisabled();
    expect(screen.queryByTestId('night-pause-save')).toBeNull();
    expect(screen.getByTestId('night-pause-master-off')).toBeInTheDocument();
    expect(screen.getByText('Reativação cancelada')).toBeInTheDocument();
    expect(screen.getByText('24/10')).toBeInTheDocument();
  });
});
