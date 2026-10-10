import https from 'https';

export interface PixPaymentResponse {
  providerPaymentId: string;
  pixCopyPaste: string;
  expiresAt: string;
  status: string;
  /** NORQVA-0023: QR Code do Pix em PNG base64, como o Asaas devolve em /pixQrCode. */
  qrCodeImage?: string | null;
}

export interface PaymentDetailsResponse {
  status: string;
  amount: number;
  /** NORQVA-0038: valor líquido informado pelo Asaas (depois da taxa), quando vier. */
  netAmount?: number | null;
  /** NORQVA-0038: id do parcelamento quando a cobrança é uma parcela de cartão. */
  installmentId?: string | null;
}

/** NORQVA-0038: cobrança de cartão. O comprador paga na página segura do Asaas (invoiceUrl). */
export interface CardPaymentResponse {
  providerPaymentId: string;
  installmentId: string | null;
  invoiceUrl: string;
  dueDate: string;
  status: string;
}

export interface InstallmentTotals {
  total: number;
  netTotal: number | null;
  count: number;
}

export class AsaasPaymentProvider {
  private apiKey: string;
  private baseUrl: string;
  private env: string;
  private allowProductionPayments: boolean;
  private webhookAuthToken?: string;

  constructor(apiKey: string, baseUrl: string, env: string, options?: { allowProductionPayments?: boolean; webhookAuthToken?: string }) {
    const normalizedEnv = (env || '').trim().toLowerCase();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      throw new Error(`[PAYMENT SECURITY EXCEPTION]: Invalid Asaas base URL format: '${baseUrl}'.`);
    }

    const allowProd = options?.allowProductionPayments ?? (process.env.ALLOW_PRODUCTION_PAYMENTS === 'true');
    const webhookToken = options?.webhookAuthToken ?? process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

    if (normalizedEnv === 'sandbox') {
      if (parsedUrl.hostname !== 'api-sandbox.asaas.com') {
        throw new Error('[PAYMENT SECURITY EXCEPTION]: Sandbox environment requires https://api-sandbox.asaas.com base URL.');
      }
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error('[PAYMENT SECURITY EXCEPTION]: Asaas API key must be provided and non-empty.');
      }
    } else if (normalizedEnv === 'production') {
      if (parsedUrl.hostname !== 'api.asaas.com') {
        throw new Error('[PAYMENT SECURITY EXCEPTION]: Production environment requires https://api.asaas.com base URL.');
      }
      if (allowProd) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
          throw new Error('[PAYMENT SECURITY EXCEPTION]: Asaas API key must be provided and non-empty.');
        }
        if (!webhookToken || typeof webhookToken !== 'string' || webhookToken.trim() === '') {
          throw new Error('[PAYMENT SECURITY EXCEPTION]: Production environment requires ASAAS_WEBHOOK_AUTH_TOKEN to be configured.');
        }
      }
    } else {
      throw new Error(`[PAYMENT SECURITY EXCEPTION]: Invalid ASAAS_ENV '${env}'. Must be strictly 'sandbox' or 'production'.`);
    }

    this.apiKey = apiKey || '';
    this.baseUrl = baseUrl;
    this.env = normalizedEnv;
    this.allowProductionPayments = allowProd;
    this.webhookAuthToken = webhookToken;
  }

  private ensureMutationsAllowed(): void {
    if (this.env === 'production' && !this.allowProductionPayments) {
      throw new Error('[PAYMENT SECURITY EXCEPTION]: PRODUCTION_PAYMENTS_LOCKED');
    }
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('[PAYMENT SECURITY EXCEPTION]: Asaas API key must be provided and non-empty.');
    }
  }

  private request<T>(path: string, method: string, payload?: any): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const urlObj = new URL(url);
    const body = payload ? JSON.stringify(payload) : '';

    const headers: Record<string, any> = {
      'access_token': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'NORQVA-Core-V1'
    };

    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method: method,
      headers: headers
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const err: any = new Error(`Asaas API error status ${res.statusCode}: ${data}`);
            err.statusCode = res.statusCode;
            err.responseBody = data;
            return reject(err);
          }
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(new Error(`Failed to parse Asaas response: ${data}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      // NORQVA-0023: uma conexão presa não pode travar a varredura nem acumular consultas.
      req.setTimeout(15000, () => req.destroy(new Error('ASAAS_TIMEOUT')));
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  async createCustomer(params: {
    name: string;
    email: string;
    phone?: string;
    cpfCnpj?: string;
    externalReference: string;
  }): Promise<string> {
    this.ensureMutationsAllowed();
    const payload: any = {
      name: params.name,
      email: params.email,
      phone: params.phone || undefined,
      externalReference: params.externalReference
    };
    if (params.cpfCnpj) {
      payload.cpfCnpj = params.cpfCnpj;
    }

    const res = await this.request<{ id: string }>('/customers', 'POST', payload);
    return res.id;
  }

  async searchCustomerByExternalReference(externalReference: string): Promise<string | null> {
    const res = await this.request<{ data: { id: string }[] }>(`/customers?externalReference=${encodeURIComponent(externalReference)}`, 'GET');
    if (res.data && res.data.length > 0) {
      return res.data[0].id;
    }
    return null;
  }

  async searchCustomerByEmail(email: string): Promise<{ id: string; cpfCnpj?: string; name: string }[]> {
    const res = await this.request<{ data: { id: string; cpfCnpj?: string; name: string }[] }>(`/customers?email=${encodeURIComponent(email)}`, 'GET');
    return res.data || [];
  }

  async createPixPayment(params: {
    amount: number;
    description: string;
    idempotencyKey: string;
    providerCustomerId: string;
  }): Promise<PixPaymentResponse> {
    this.ensureMutationsAllowed();
    // Set dueDate to tomorrow to allow prompt payment
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDateStr = tomorrow.toISOString().split('T')[0];

    const payload = {
      customer: params.providerCustomerId,
      billingType: 'PIX',
      value: params.amount,
      dueDate: dueDateStr,
      description: params.description,
      externalReference: params.idempotencyKey
    };

    const paymentRes = await this.request<{ id: string; status: string; value: number }>('/payments', 'POST', payload);
    
    // Fetch QR Code dynamic details (body must be empty for GET)
    const qrCodeRes = await this.request<{ payload: string; expirationDate: string; encodedImage?: string }>(`/payments/${paymentRes.id}/pixQrCode`, 'GET');

    return {
      providerPaymentId: paymentRes.id,
      pixCopyPaste: qrCodeRes.payload,
      expiresAt: qrCodeRes.expirationDate || tomorrow.toISOString(),
      status: paymentRes.status,
      qrCodeImage: qrCodeRes.encodedImage || null
    };
  }

  async searchPaymentByExternalReference(externalReference: string): Promise<PixPaymentResponse | null> {
    const res = await this.request<{ data: { id: string; status: string; value: number }[] }>(`/payments?externalReference=${encodeURIComponent(externalReference)}`, 'GET');
    if (res.data && res.data.length > 0) {
      const p = res.data[0];
      const qrCodeRes = await this.request<{ payload: string; expirationDate: string; encodedImage?: string }>(`/payments/${p.id}/pixQrCode`, 'GET');
      return {
        providerPaymentId: p.id,
        pixCopyPaste: qrCodeRes.payload,
        expiresAt: qrCodeRes.expirationDate,
        status: p.status,
        qrCodeImage: qrCodeRes.encodedImage || null
      };
    }
    return null;
  }

  async getPayment(providerPaymentId: string): Promise<PaymentDetailsResponse> {
    const res = await this.request<{ status: string; value: number; netValue?: number; installment?: string | null }>(`/payments/${providerPaymentId}`, 'GET');
    return {
      status: res.status,
      amount: res.value,
      netAmount: typeof res.netValue === 'number' ? res.netValue : null,
      installmentId: res.installment || null
    };
  }

  /**
   * NORQVA-0038: cobrança de cartão SEM dados do cartão. O Asaas devolve a invoiceUrl, onde o comprador
   * digita o cartão. Parcelado: installmentCount + totalValue (o Asaas acerta o arredondamento na última
   * parcela e devolve a primeira parcela, com o id do parcelamento em `installment`).
   */
  async createCardPayment(params: {
    totalAmount: number;
    installments: number;
    description: string;
    idempotencyKey: string;
    providerCustomerId: string;
  }): Promise<CardPaymentResponse> {
    this.ensureMutationsAllowed();
    const due = new Date();
    due.setDate(due.getDate() + 1);
    const dueDateStr = due.toISOString().split('T')[0];
    const n = Math.max(1, Math.floor(params.installments || 1));
    const payload: any = {
      customer: params.providerCustomerId,
      billingType: 'CREDIT_CARD',
      dueDate: dueDateStr,
      description: params.description,
      externalReference: params.idempotencyKey
    };
    if (n > 1) {
      payload.installmentCount = n;
      payload.totalValue = params.totalAmount;
    } else {
      payload.value = params.totalAmount;
    }
    const res = await this.request<{ id: string; status: string; invoiceUrl?: string; installment?: string | null }>('/payments', 'POST', payload);
    if (!res.invoiceUrl) {
      const err: any = new Error('ASAAS_CARD_WITHOUT_INVOICE_URL');
      err.statusCode = 502;
      throw err;
    }
    return {
      providerPaymentId: res.id,
      installmentId: res.installment || null,
      invoiceUrl: res.invoiceUrl,
      dueDate: dueDateStr,
      status: res.status
    };
  }

  /** NORQVA-0038: recupera uma cobrança de cartão já criada (queda de conexão), sem consultar QR Code de Pix. */
  async searchCardPaymentByExternalReference(externalReference: string): Promise<CardPaymentResponse | null> {
    const res = await this.request<{ data: { id: string; status: string; invoiceUrl?: string; installment?: string | null; installmentNumber?: number; dueDate?: string }[] }>(
      `/payments?externalReference=${encodeURIComponent(externalReference)}`,
      'GET'
    );
    const rows = res.data || [];
    if (rows.length === 0) return null;
    // Parcelado: todas as parcelas podem ter a mesma referência. A primeira parcela representa a compra.
    const first = [...rows].sort((a, b) => (a.installmentNumber || 1) - (b.installmentNumber || 1))[0];
    // Achou a cobrança: nunca cria outra, mesmo sem o link (a tela pede para aguardar).
    return {
      providerPaymentId: first.id,
      installmentId: first.installment || null,
      invoiceUrl: first.invoiceUrl || '',
      dueDate: first.dueDate || '',
      status: first.status
    };
  }

  /** NORQVA-0038: soma das parcelas de um parcelamento (valor da compra inteira, não de uma parcela). */
  async getInstallmentTotals(installmentId: string): Promise<InstallmentTotals> {
    const res = await this.request<{ data: { value: number; netValue?: number }[] }>(
      `/installments/${encodeURIComponent(installmentId)}/payments?limit=100`,
      'GET'
    );
    const rows = res.data || [];
    const cents = rows.reduce((acc, r) => acc + Math.round(Number(r.value) * 100), 0);
    const allNet = rows.length > 0 && rows.every(r => typeof r.netValue === 'number');
    const netCents = allNet ? rows.reduce((acc, r) => acc + Math.round(Number(r.netValue) * 100), 0) : null;
    return { total: cents / 100, netTotal: netCents === null ? null : netCents / 100, count: rows.length };
  }

  async validateAuth(): Promise<{ authenticated: boolean; environment: string; error?: string }> {
    try {
      // Read-only account balance check to verify API key validity without mutations
      await this.request<{ balance?: number }>('/finance/balance', 'GET');
      return { authenticated: true, environment: this.env };
    } catch (err: any) {
      return { authenticated: false, environment: this.env, error: err.message };
    }
  }
}
