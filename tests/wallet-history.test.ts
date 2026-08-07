// Wallet history — display labels are pure-tested; self-scoping and wiring are
// source tripwires (the house pattern).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { walletDisplayLabel } from '../server/walletDisplay';
import { WALLET_TRANSACTION_TYPES } from '../shared/schema';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('walletDisplayLabel — no DB value ever reaches the UI', () => {
  it('maps every declared ledger type to a friendly label (no underscores, never the enum itself)', () => {
    for (const type of WALLET_TRANSACTION_TYPES) {
      const label = walletDisplayLabel(type, null);
      expect(label).not.toBe(type);
      expect(label.includes('_')).toBe(false);
      expect(label.length).toBeGreaterThan(3);
    }
  });

  it('the ruled mappings are exact', () => {
    expect(walletDisplayLabel('booking_payment', 'Wallet credit applied at checkout')).toBe('Applied at checkout');
    expect(walletDisplayLabel('referral_reward', null)).toBe('Referral reward');
    expect(walletDisplayLabel('adjustment', 'Dubailand promo · session e689b399-4b15-4d54-9399-f58dbbee7dc9')).toBe('Dubailand promo credit');
    expect(walletDisplayLabel('adjustment', 'Dubailand promo reversal · session e689b399-4b15-4d54-9399-f58dbbee7dc9')).toBe('Credit reversed — booking cancelled');
    expect(walletDisplayLabel('adjustment', 'Dubailand promo reversal · session e689b399… (shortfall 600 fils)')).toBe('Credit reversed — booking cancelled');
    expect(walletDisplayLabel('adjustment', 'launch week credit · session b4674701-dc3e-4564-ba67-fd8edc3435f4')).toBe('Launch week credit');
  });

  it('FALLBACK: unknown types and unrecognised adjustments get a clean generic, never the raw value', () => {
    expect(walletDisplayLabel('some_future_type', 'raw machine text')).toBe('Wallet adjustment');
    expect(walletDisplayLabel('adjustment', 'merge SIQ-00415 → SIQ-00414')).toBe('Wallet adjustment');
    expect(walletDisplayLabel('adjustment', null)).toBe('Wallet adjustment');
    expect(walletDisplayLabel('', '')).toBe('Wallet adjustment');
  });

  it('reversal is matched BEFORE the credit prefix (ordering pin — both start "Dubailand promo")', () => {
    // If the credit prefix were checked first, every reversal would mislabel
    // as a credit. Pin the order.
    expect(walletDisplayLabel('adjustment', 'Dubailand promo reversal · session x')).not.toBe('Dubailand promo credit');
  });
});

describe('endpoint — self-scoped, read-only, labels applied server-side', () => {
  const routes = read('server/marketplace-routes.ts');
  const start = routes.indexOf('"/api/marketplace/me/wallet/transactions"');
  const handler = routes.slice(start, routes.indexOf('app.get', start + 10));

  it('is registered behind requireAuth + requireMarketplaceAuth', () => {
    const line = routes.split('\n').find((l) => l.includes('"/api/marketplace/me/wallet/transactions"'))!;
    expect(line.includes('requireAuth')).toBe(true);
    expect(line.includes('requireMarketplaceAuth')).toBe(true);
  });

  it('SELF-SCOPED: the player comes from req.user alone — no query/param can name another player', () => {
    expect(handler.includes('req.user.userId')).toBe(true);
    expect(handler.includes('linkedPlayerId')).toBe(true);
    expect(handler.includes('req.params')).toBe(false);
    expect(/req\.query\.(playerId|userId|player|user)/.test(handler)).toBe(false);
    // pagination params are the ONLY query reads
    const queryReads = handler.match(/req\.query\.\w+/g) ?? [];
    expect(new Set(queryReads)).toEqual(new Set(['req.query.limit', 'req.query.offset']));
  });

  it('READ-ONLY: no insert/update/delete anywhere in the handler', () => {
    for (const bad of ['.insert(', '.update(', '.delete(', 'applyWalletDelta']) {
      expect(handler.includes(bad)).toBe(false);
    }
  });

  it('labels are mapped server-side and raw type/description are NOT in the response payload', () => {
    expect(handler.includes('walletDisplayLabel(')).toBe(true);
    // The FINAL res.json is the real payload (the first is the unlinked-user
    // early return). Raw type/description feed the label mapper but never
    // appear as payload keys.
    const payload = handler.slice(handler.lastIndexOf('res.json({'), handler.indexOf('} catch'));
    expect(payload.includes('label:')).toBe(true);
    expect(payload.includes('type:')).toBe(false);
    expect(payload.includes('description:')).toBe(false);
  });
});

describe('client wiring', () => {
  it('the route /marketplace/wallet renders WalletScreen behind the auth wrapper', () => {
    const app = read('client/src/App.tsx');
    const idx = app.indexOf('"/marketplace/wallet"');
    expect(idx).toBeGreaterThan(-1);
    expect(app.slice(idx, idx + 120).includes('MarketplaceAuthRoute')).toBe(true);
    expect(app.slice(idx, idx + 120).includes('WalletScreen')).toBe(true);
  });

  it('the Profile wallet card navigates to /marketplace/wallet and is keyboard-accessible', () => {
    const profile = read('client/src/pages/marketplace/Profile.tsx');
    const idx = profile.indexOf('data-testid="card-wallet-balance"');
    const card = profile.slice(idx - 600, idx + 600);
    expect(card.includes("navigate('/marketplace/wallet')")).toBe(true);
    expect(card.includes('role="button"')).toBe(true);
    expect(card.includes('onKeyDown')).toBe(true);
  });

  it('the wallet page uses the empty state and no emoji', () => {
    const page = read('client/src/pages/marketplace/WalletScreen.tsx');
    expect(page.includes('No wallet activity yet.')).toBe(true);
    expect(/\p{Extended_Pictographic}/u.test(page)).toBe(false);
  });
});
