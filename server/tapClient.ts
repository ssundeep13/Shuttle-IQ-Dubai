export function getTapSecretKey(): string {
  const key = process.env.TAP_SECRET_KEY;
  if (!key) throw new Error('TAP_SECRET_KEY environment variable is required.');
  return key;
}

export function getTapPublicKey(): string {
  const key = process.env.TAP_PUBLIC_KEY;
  if (!key) throw new Error('TAP_PUBLIC_KEY environment variable is required.');
  return key;
}

const TAP_API_BASE = 'https://api.tap.company/v2';

async function tapRequest(method: string, path: string, body?: object): Promise<any> {
  const secretKey = getTapSecretKey();
  const res = await fetch(`${TAP_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(data?.errors?.[0]?.description || data?.message || `Tap API error: ${res.status}`);
  }
  return data;
}

export interface TapChargeInput {
  amount: number;
  currency: string;
  sourceId: string;
  description: string;
  reference?: string;
  redirectUrl: string;
  metadata?: Record<string, string>;
}

export interface TapCharge {
  id: string;
  status: string;
  amount: number;
  currency: string;
  transaction?: { url?: string };
}

export async function createTapCharge(input: TapChargeInput): Promise<TapCharge> {
  return tapRequest('POST', '/charges', {
    amount: input.amount,
    currency: input.currency,
    source: { id: input.sourceId },
    description: input.description,
    reference: input.reference ? { transaction: input.reference } : undefined,
    redirect: { url: input.redirectUrl },
    metadata: input.metadata,
  });
}

export async function retrieveTapCharge(chargeId: string): Promise<TapCharge> {
  return tapRequest('GET', `/charges/${chargeId}`);
}
