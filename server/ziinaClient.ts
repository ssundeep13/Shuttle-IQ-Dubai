const ZIINA_API_BASE = 'https://api-v2.ziina.com/api';

function getZiinaToken(): string {
  const token = process.env.ZIINA_API_TOKEN;
  if (!token) throw new Error('ZIINA_API_TOKEN environment variable is required.');
  return token;
}

async function ziinaRequest(method: string, path: string, body?: object): Promise<any> {
  const token = getZiinaToken();
  const res = await fetch(`${ZIINA_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Ziina API error: ${res.status}`);
  }
  return data;
}

export interface ZiinaPaymentIntentInput {
  amountAed: number;
  message: string;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
}

export interface ZiinaPaymentIntent {
  id: string;
  status: string;
  amount: number;
  currency_code: string;
  redirect_url: string;
  success_url: string;
  cancel_url: string;
}

export async function createZiinaPaymentIntent(input: ZiinaPaymentIntentInput): Promise<ZiinaPaymentIntent> {
  return ziinaRequest('POST', '/payment_intent', {
    amount: input.amountAed * 100,
    currency_code: 'AED',
    message: input.message,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    failure_url: input.failureUrl,
    allow_tips: false,
    test: process.env.NODE_ENV !== 'production',
  });
}

export async function retrieveZiinaPaymentIntent(intentId: string): Promise<ZiinaPaymentIntent> {
  const result = await ziinaRequest('GET', `/payment_intent/${intentId}`);
  // Log the raw status so we can identify any new status strings Ziina introduces
  console.log(`[Ziina] Payment intent ${intentId} status: "${result.status}"`);
  return result;
}

export function isZiinaPaymentSuccessful(status: string): boolean {
  // Normalise to lowercase for a case-insensitive check across all Ziina status variants
  const s = (status || '').toLowerCase();
  return ['completed', 'paid', 'succeeded', 'success', 'authorized', 'captured', 'approved'].includes(s);
}
