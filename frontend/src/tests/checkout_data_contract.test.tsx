import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { validateCpf, maskCpf, validateFullName, validateEmail, maskPhone } from '../features/checkout/checkoutValidation';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} as any, user: {} as any }, error: null }),
    }
  }
}));

describe('NORQVA — Checkout Data Contract & Validation (Client-Side)', () => {

  describe('Validation & Masking Utilities', () => {
    it('validateCpf: correctly validates check digits and rejects repeated sequences', () => {
      // Rejects empty / non-string
      expect(validateCpf('')).toBe(false);
      expect(validateCpf(null as any)).toBe(false);
      expect(validateCpf('123')).toBe(false);

      // Rejects repeated digits
      expect(validateCpf('00000000000')).toBe(false);
      expect(validateCpf('11111111111')).toBe(false);
      expect(validateCpf('99999999999')).toBe(false);
      expect(validateCpf('000.000.000-00')).toBe(false);

      // Rejects invalid check digits
      expect(validateCpf('12345678900')).toBe(false);
      expect(validateCpf('123.456.789-00')).toBe(false);

      // Accepts valid Brazilian CPFs
      expect(validateCpf('52998224725')).toBe(true);
      expect(validateCpf('529.982.247-25')).toBe(true);
    });

    it('maskCpf: applies 000.000.000-00 mask progressively', () => {
      expect(maskCpf('')).toBe('');
      expect(maskCpf('123')).toBe('123');
      expect(maskCpf('1234')).toBe('123.4');
      expect(maskCpf('123456')).toBe('123.456');
      expect(maskCpf('1234567')).toBe('123.456.7');
      expect(maskCpf('123456789')).toBe('123.456.789');
      expect(maskCpf('12345678901')).toBe('123.456.789-01');
      expect(maskCpf('12345678901999')).toBe('123.456.789-01'); // truncates to 11
    });

    it('validateFullName: requires at least 2 tokens and length >= 3', () => {
      expect(validateFullName('')).toBe(false);
      expect(validateFullName('John')).toBe(false);
      expect(validateFullName('   John   ')).toBe(false);
      expect(validateFullName('J')).toBe(false);
      expect(validateFullName('John Doe')).toBe(true);
      expect(validateFullName('Maria Silva Santos')).toBe(true);
    });

    it('validateEmail: validates standard RFC 5322 pattern', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('user@domain')).toBe(false);
      expect(validateEmail('user@domain.com')).toBe(true);
      expect(validateEmail('user.name+tag@sub.domain.com.br')).toBe(true);
    });

    it('maskPhone: applies Brazilian phone mask (00) 00000-0000', () => {
      expect(maskPhone('')).toBe('');
      expect(maskPhone('11')).toBe('(11');
      expect(maskPhone('11999998888')).toBe('(11) 99999-8888');
      expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
    });
  });

  describe('CheckoutView Component UX & Data Contract', () => {
    const mockOffer = {
      id: 'off-001',
      human_id: 'OFF-000001',
      name: 'Trattoria em Casa',
      price: 17.90,
      is_demo: false
    };

    const mockShowError = vi.fn();
    const mockShowSuccess = vi.fn();
    const mockOnOrderCreated = vi.fn();
    const mockOnCancel = vi.fn();
    const mockOnCustomerChange = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders 4 canonical fields: Nome Completo, E-mail, CPF, Celular/WhatsApp', () => {
      render(
        <CheckoutView
          offer={mockOffer}
          isDemo={false}
          onOrderCreated={mockOnOrderCreated}
          onCancel={mockOnCancel}
          showError={mockShowError}
          showSuccess={mockShowSuccess}
        />
      );

      expect(screen.getByText(/nome completo/i)).toBeDefined();
      expect(screen.getByText(/e-mail de contato/i)).toBeDefined();
      expect(screen.getByText(/^cpf/i)).toBeDefined();
      expect(screen.getByText(/whatsapp \/ celular/i)).toBeDefined();

      // Ensure CPF is permanently visible without needing an accordion toggle
      const cpfInput = screen.getByPlaceholderText('000.000.000-00');
      expect(cpfInput).toBeDefined();
    });

    it('disables submit button and shows error when required fields are missing or invalid', async () => {
      render(
        <CheckoutView
          offer={mockOffer}
          isDemo={false}
          onOrderCreated={mockOnOrderCreated}
          onCancel={mockOnCancel}
          showError={mockShowError}
          showSuccess={mockShowSuccess}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /com pix/i });

      // Enter single-word name
      const nameInput = screen.getByPlaceholderText(/ex: joão da silva/i);
      fireEvent.change(nameInput, { target: { value: 'Maria' } });
      fireEvent.blur(nameInput);
      expect(screen.getByText(/informe seu nome completo/i)).toBeDefined();

      // Enter invalid email
      const emailInput = screen.getByPlaceholderText(/seuemail@empresa\.com/i);
      fireEvent.change(emailInput, { target: { value: 'maria@' } });
      fireEvent.blur(emailInput);
      expect(screen.getByText(/informe um e-mail válido/i)).toBeDefined();

      // Enter repeated digit CPF
      const cpfInput = screen.getByPlaceholderText('000.000.000-00');
      fireEvent.change(cpfInput, { target: { value: '11111111111' } });
      fireEvent.blur(cpfInput);
      expect(screen.getByText(/informe um cpf válido/i)).toBeDefined();

      expect(submitBtn).toBeDisabled();
    });

    it('enables submit button when valid name, email, and check-digit valid CPF are entered', () => {
      render(
        <CheckoutView
          offer={mockOffer}
          isDemo={false}
          onOrderCreated={mockOnOrderCreated}
          onCancel={mockOnCancel}
          showError={mockShowError}
          showSuccess={mockShowSuccess}
          onCustomerChange={mockOnCustomerChange}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /com pix/i });

      fireEvent.change(screen.getByPlaceholderText(/ex: joão da silva/i), { target: { value: 'Maria da Silva' } });
      fireEvent.change(screen.getByPlaceholderText(/seuemail@empresa\.com/i), { target: { value: 'maria.silva@exemplo.com' } });
      fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), { target: { value: '52998224725' } });

      expect(submitBtn).not.toBeDisabled();
      expect(mockOnCustomerChange).toHaveBeenCalled();
    });

    it('preserves initialCustomer state when returning to checkout for correction', () => {
      const initialDraft = {
        name: 'Maria da Silva',
        email: 'maria.silva@exemplo.com',
        phone: '11988887777',
        cpf_cnpj: '529.982.247-25'
      };

      render(
        <CheckoutView
          offer={mockOffer}
          isDemo={false}
          initialCustomer={initialDraft}
          onOrderCreated={mockOnOrderCreated}
          onCancel={mockOnCancel}
          showError={mockShowError}
          showSuccess={mockShowSuccess}
        />
      );

      const nameInput = screen.getByPlaceholderText(/ex: joão da silva/i) as HTMLInputElement;
      const emailInput = screen.getByPlaceholderText(/seuemail@empresa\.com/i) as HTMLInputElement;
      const cpfInput = screen.getByPlaceholderText('000.000.000-00') as HTMLInputElement;
      const phoneInput = screen.getByPlaceholderText('(11) 99999-9999') as HTMLInputElement;

      expect(nameInput.value).toBe('Maria da Silva');
      expect(emailInput.value).toBe('maria.silva@exemplo.com');
      expect(cpfInput.value).toBe('529.982.247-25');
      expect(phoneInput.value).toBe('(11) 98888-7777');

      const submitBtn = screen.getByRole('button', { name: /com pix/i });
      expect(submitBtn).not.toBeDisabled();
    });
  });
});
