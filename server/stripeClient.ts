import Stripe from 'stripe';
import { StripeSync, type StripeSyncConfig } from 'stripe-replit-sync';

let stripeClient: Stripe | null = null;
let stripeSyncInstance: StripeSync | null = null;

function getStripeCredentials() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error('STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY environment variables are required.');
  }
  return { secretKey, publishableKey };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeClient(): Promise<Stripe> {
  if (!stripeClient) {
    stripeClient = await getUncachableStripeClient();
  }
  return stripeClient;
}

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSyncInstance) {
    const { secretKey } = getStripeCredentials();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required');

    const config: StripeSyncConfig = {
      stripeSecretKey: secretKey,
      databaseUrl,
    };
    stripeSyncInstance = new StripeSync(config);
  }
  return stripeSyncInstance;
}

export async function getPublishableKey(): Promise<string> {
  const { publishableKey } = getStripeCredentials();
  return publishableKey;
}
