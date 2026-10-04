/**
 * ValoraTap server-side JavaScript SDK.
 * API keys must stay on your server. Never expose them to browser code.
 */
export class ValoraTapError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ValoraTapError';
    this.status = status;
    this.body = body;
  }
}

export class ValoraTap {
  constructor({ apiKey, baseUrl = 'https://pddjualtnhgmplampucn.supabase.co/functions/v1' } = {}) {
    if (!apiKey || !/^(vt_live_|vt_test_)[A-Za-z0-9_-]{12,}$/.test(apiKey)) {
      throw new Error('A valid ValoraTap vt_live_ or vt_test_ API key is required.');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.transactions = { create: (payload) => this.createTransaction(payload) };
    this.events = { create: (payload) => this.createEvent(payload) };
  }

  async request(path, { method = 'POST', body, idempotencyKey } = {}) {
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      throw new ValoraTapError(data.error || data.message || 'ValoraTap request failed.', response.status, data);
    }
    return data;
  }

  createTransaction(payload = {}) {
    const { idempotencyKey, ...body } = payload;
    if (!idempotencyKey) throw new Error('idempotencyKey is required for transaction creation.');
    return this.request('/transactions', { body, idempotencyKey });
  }

  createEvent(payload = {}) {
    return this.request('/transaction-events', { body: payload });
  }
}

export default ValoraTap;