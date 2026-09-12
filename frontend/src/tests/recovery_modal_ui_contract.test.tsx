import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RecoveryRequestModal } from '../features/delivery/RecoveryRequestModal';

describe('NORQVA — RecoveryRequestModal UI Error Contract Suite', () => {
  const defaultProps = {
    offerHumanId: 'OFF-000001',
    onClose: vi.fn(),
    showError: vi.fn(),
    showSuccess: vi.fn()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. HTTP 200: Renders success confirmation screen with enumeration-safe message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        success: true,
        message: 'Se encontrarmos uma compra válida para este e-mail, enviaremos as instruções de acesso.'
      })
    });

    render(<RecoveryRequestModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('seu.email@exemplo.com');
    const submitBtn = screen.getByRole('button', { name: /Reenviar Acesso/i });

    fireEvent.change(input, { target: { value: 'cliente@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Verifique sua Caixa de Entrada/i)).toBeInTheDocument();
      expect(screen.getByText(/Se encontrarmos uma compra válida/i)).toBeInTheDocument();
    });

    expect(defaultProps.showSuccess).toHaveBeenCalledWith('Solicitação recebida com sucesso!');
  });

  it('2. HTTP 429: Does NOT show success screen; displays rate limit message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 429,
      json: async () => ({
        error: 'Muitas solicitações de recuperação de acesso. Por favor, aguarde alguns minutos.',
        retryAfter: 900
      })
    });

    render(<RecoveryRequestModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('seu.email@exemplo.com');
    const submitBtn = screen.getByRole('button', { name: /Reenviar Acesso/i });

    fireEvent.change(input, { target: { value: 'cliente@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Muitas tentativas em pouco tempo\. Aguarde alguns minutos e tente novamente\./i)).toBeInTheDocument();
      expect(screen.queryByText(/Verifique sua Caixa de Entrada/i)).toBeNull();
    });

    expect(defaultProps.showError).toHaveBeenCalledWith('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.');
  });

  it('3. HTTP 400: Does NOT show success screen; displays input error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 400,
      json: async () => ({
        error: 'Por favor, informe um e-mail válido.'
      })
    });

    render(<RecoveryRequestModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('seu.email@exemplo.com');
    const submitBtn = screen.getByRole('button', { name: /Reenviar Acesso/i });

    fireEvent.change(input, { target: { value: 'cliente@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Por favor, informe um e-mail válido\./i)).toBeInTheDocument();
      expect(screen.queryByText(/Verifique sua Caixa de Entrada/i)).toBeNull();
    });

    expect(defaultProps.showError).toHaveBeenCalledWith('Por favor, informe um e-mail válido.');
  });

  it('4. HTTP 500 / 5xx: Does NOT show success screen; displays friendly temporary error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 500,
      json: async () => ({
        error: 'Internal server error'
      })
    });

    render(<RecoveryRequestModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('seu.email@exemplo.com');
    const submitBtn = screen.getByRole('button', { name: /Reenviar Acesso/i });

    fireEvent.change(input, { target: { value: 'cliente@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível solicitar o acesso agora\. Tente novamente em alguns minutos\./i)).toBeInTheDocument();
      expect(screen.queryByText(/Verifique sua Caixa de Entrada/i)).toBeNull();
    });

    expect(defaultProps.showError).toHaveBeenCalledWith('Não foi possível solicitar o acesso agora. Tente novamente em alguns minutos.');
  });

  it('5. Network Failure: Does NOT show success screen; displays friendly temporary error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    render(<RecoveryRequestModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('seu.email@exemplo.com');
    const submitBtn = screen.getByRole('button', { name: /Reenviar Acesso/i });

    fireEvent.change(input, { target: { value: 'cliente@example.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível solicitar o acesso agora\. Tente novamente em alguns minutos\./i)).toBeInTheDocument();
      expect(screen.queryByText(/Verifique sua Caixa de Entrada/i)).toBeNull();
    });

    expect(defaultProps.showError).toHaveBeenCalledWith('Não foi possível solicitar o acesso agora. Tente novamente em alguns minutos.');
  });
});