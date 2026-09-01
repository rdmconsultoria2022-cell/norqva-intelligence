import https from 'https';

export interface PixPaymentResponse {
  providerPaymentId: string;
  pixCopyPaste: string;
  expiresAt: string;
  status: string;
}

export interface PaymentDetailsResponse {
  status: string;
  amount: number;
}

export class AsaasPaymentProvider {
  private apiKey: string;
  private baseUrl: string;
  private env: string;

  constructor(apiKey: string, baseUrl: string, env: string, options?: { allowProductionPayments?: boolean; webhookAuthToken?: string }) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('[PAYMENT SECURITY EXCEPTION]: Asaas API key must be provided and non-empty.');
    }

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
    } else if (normalizedEnv === 'production') {
      if (!allowProd) {
        throw new Error('[PAYMENT SECURITY EXCEPTION]: Production payments are strictly blocked. ALLOW_PRODUCTION_PAYMENTS must be explicitly set to true.');
      }
      if (parsedUrl.hostname !== 'api.asaas.com') {
        throw new Error('[PAYMENT SECURITY EXCEPTION]: Production environment requires https://api.asaas.com base URL.');
      }
      if (!webhookToken || typeof webhookToken !== 'string' || webhookToken.trim() === '') {
        throw new Error('[PAYMENT SECURITY EXCEPTION]: Production environment requires ASAAS_WEBHOOK_AUTH_TOKEN to be configured.');
      }
    } else {
      throw new Error(`[PAYMENT SECURITY EXCEPTION]: Invalid ASAAS_ENV '${env}'. Must be strictly 'sandbox' or 'production'.`);
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.env = normalizedEnv;
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
    const qrCodeRes = await this.request<{ payload: string; expirationDate: string }>(`/payments/${paymentRes.id}/pixQrCode`, 'GET');

    return {
      providerPaymentId: paymentRes.id,
      pixCopyPaste: qrCodeRes.payload,
      expiresAt: qrCodeRes.expirationDate || tomorrow.toISOString(),
      status: paymentRes.status
    };
  }

  async searchPaymentByExternalReference(externalReference: string): Promise<PixPaymentResponse | null> {
    const res = await this.request<{ data: { id: string; status: string; value: number }[] }>(`/payments?externalReference=${encodeURIComponent(externalReference)}`, 'GET');
    if (res.data && res.data.length > 0) {
      const p = res.data[0];
      const qrCodeRes = await this.request<{ payload: string; expirationDate: string }>(`/payments/${p.id}/pixQrCode`, 'GET');
      return {
        providerPaymentId: p.id,
        pixCopyPaste: qrCodeRes.payload,
        expiresAt: qrCodeRes.expirationDate,
        status: p.status
      };
    }
    return null;
  }

  async getPayment(providerPaymentId: string): Promise<PaymentDetailsResponse> {
    const res = await this.request<{ status: string; value: number }>(`/payments/${providerPaymentId}`, 'GET');
    return {
      status: res.status,
      amount: res.value
    };
  }
}
