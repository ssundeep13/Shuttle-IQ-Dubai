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

  let data: Record<string, unknown>;
  try {
    data = await res.json() as Record<string, unknown>;
  } catch {
    const text = await res.text().catch(() => '(unreadable)');
    console.error(`[Ziina] API ${method} ${path} — HTTP ${res.status}, non-JSON response:`, text);
    throw new Error(`Ziina API error: ${res.status} (non-JSON response)`);
  }
  if (!res.ok) {
    console.error(`[Ziina] API ${method} ${path} failed — HTTP ${res.status}`, {
      status: res.status,
      errorMessage: data?.message || data?.error,
      declineReason: data?.decline_reason || data?.reason,
      code: data?.code,
      responseBody: data,
    });
    throw new Error((data?.message || data?.error || `Ziina API error: ${res.status}`) as string);
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

const ZIINA_MESSAGE_MAX = 150;
const ZIINA_MESSAGE_FALLBACK = 'ShuttleIQ booking';

export function sanitizeZiinaMessage(input: string | null | undefined): string {
  const cleaned = (input ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return ZIINA_MESSAGE_FALLBACK;
  if (cleaned.length <= ZIINA_MESSAGE_MAX) return cleaned;
  return cleaned.slice(0, ZIINA_MESSAGE_MAX - 1).trimEnd() + '…';
}

export async function createZiinaPaymentIntent(input: ZiinaPaymentIntentInput): Promise<ZiinaPaymentIntent> {
  return ziinaRequest('POST', '/payment_intent', {
    amount: input.amountAed * 100,
    currency_code: 'AED',
    message: sanitizeZiinaMessage(input.message),
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

export async function registerZiinaWebhook(webhookUrl: string, secret: string): Promise<{ success: boolean; error?: string }> {
  return ziinaRequest('POST', '/webhook', { url: webhookUrl, secret });
}
