// NORQVA-0023: QR Code do Pix, texto honesto sobre o e-mail de acesso e rótulo de entrega no painel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PaymentStatus } from '../features/payment/PaymentStatus';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { deliveryStatusLabel, accessEmailLabel } from '../utils/deliveryStatusLabel';

function mockDeliveryFetch(accessEmailSent?: boolean) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/delivery-tokens')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orderId: 'ord-23',
          deliveries: [{ assetId: 'ast-1', rawToken: 'raw-1', assetTitle: 'Trattoria em Casa' }],
          ...(accessEmailSent === undefined ? {} : { accessEmailSent })
        })
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ id: 'ord-23', status: 'PAID' }) });
  }) as any;
}

describe('NORQVA-0023 — entrega do PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o QR Code do Pix quando o Asaas devolve a imagem', () => {
    render(
      <PaymentStatus
        orderId="ord-23"
        checkoutToken="tok"
        amount={19.9}
        isDemo={true}
        initialPayment={{ human_id: 'PG-23', status: 'PENDING', amount: 19.9, pix_copy_paste: 'pix-code-23', pix_qr_image: 'iVBORw0KGgo=' }}
        showError={vi.fn()}
      />
    );
    const img = screen.getByAltText('QR Code do Pix') as HTMLImageElement;
    expect(img.src).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(screen.getByText(/escaneie o QR Code ou cole o código/i)).toBeInTheDocument();
  });

  it('sem imagem, não promete QR Code', () => {
    render(
      <PaymentStatus
        orderId="ord-23"
        checkoutToken="tok"
        amount={19.9}
        isDemo={true}
        initialPayment={{ human_id: 'PG-23', status: 'PENDING', amount: 19.9, pix_copy_paste: 'pix-code-23' }}
        showError={vi.fn()}
      />
    );
    expect(screen.queryByTestId('pix-qr-code')).not.toBeInTheDocument();
    expect(screen.queryByText(/escaneie/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cole o código acima/i)).toBeInTheDocument();
  });

  it('só diz que mandou e-mail quando o e-mail foi enviado', async () => {
    mockDeliveryFetch(true);
    render(<DigitalDelivery orderId="ord-23" checkoutToken="tok" isDemo={true} showError={vi.fn()} />);
    expect(await screen.findByTestId('access-email-sent')).toBeInTheDocument();
    expect(screen.queryByTestId('access-email-pending')).not.toBeInTheDocument();
  });

  it('sem e-mail enviado, orienta a baixar agora e recuperar pelo e-mail da compra', async () => {
    mockDeliveryFetch(undefined);
    render(<DigitalDelivery orderId="ord-23" checkoutToken="tok" isDemo={true} showError={vi.fn()} />);
    expect(await screen.findByTestId('access-email-pending')).toBeInTheDocument();
    expect(screen.queryByText(/Cópia de Acesso Permanente Enviada/i)).not.toBeInTheDocument();
  });

  it('rótulo do painel distingue ativa, vencida e revogada', () => {
    expect(deliveryStatusLabel({ download_count: 2, delivery_status: 'EXPIRED' }).text).toBe('BAIXADO (2)');
    expect(deliveryStatusLabel({ download_count: 0, delivery_status: 'ACTIVE' }).text).toBe('DISPONÍVEL');
    expect(deliveryStatusLabel({ download_count: 0, delivery_status: 'EXPIRED' }).text).toBe('VENCIDA (SEM DOWNLOAD)');
    expect(deliveryStatusLabel({ download_count: 0, delivery_status: 'REVOKED' }).text).toBe('REVOGADA');
    expect(deliveryStatusLabel({ download_count: null, delivery_status: null }).text).toBe('PENDENTE');
    expect(accessEmailLabel('SENT')?.text).toBe('E-MAIL ENVIADO');
    expect(accessEmailLabel('FAILED')?.text).toBe('E-MAIL FALHOU');
    expect(accessEmailLabel(null)).toBeNull();
  });
});
