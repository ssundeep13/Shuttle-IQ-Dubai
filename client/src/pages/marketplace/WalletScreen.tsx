// Wallet details — balance header + transaction history. Mobile-first; the
// list is the page. Labels arrive from the server already humanised
// (walletDisplayLabel) — this screen renders them verbatim and never sees a
// raw ledger enum. Brand: Inter, navy/teal/cream, flat 1px card chrome.
import { useState, type CSSProperties } from 'react';
import { MKT } from './LandingComponents';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/hooks/usePageTitle';

const FF = "'Inter', system-ui, sans-serif";
const NAVY = '#002C84';
const TEAL = MKT.tealText; // routed through the brand token (Design Gate 2)
const INK = '#1A1F2B';
const INK_SUB = '#5B6472';
const PAGE_CREAM = '#FBF9F4';
const cardChrome: CSSProperties = { background: '#fff', border: '1px solid rgba(0,62,140,0.10)', borderRadius: 14, boxShadow: 'none' };

const PAGE_SIZE = 50;

interface WalletTx {
  date: string;
  amountAed: number;
  label: string;
  balanceAfterAed: number;
}
interface WalletHistory {
  walletBalanceAed: number;
  total: number;
  transactions: WalletTx[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtAmount(aed: number): string {
  const sign = aed > 0 ? '+' : aed < 0 ? '−' : '';
  return `${sign}${Math.abs(aed).toFixed(2)}`;
}

export default function WalletScreen() {
  usePageTitle('Wallet');
  // Pages of PAGE_SIZE accumulate as the player taps "Show more"; each page is
  // its own cached query so going back is instant.
  const [pages, setPages] = useState(1);
  const queries = Array.from({ length: pages }, (_, i) => i * PAGE_SIZE);

  const first = useQuery<WalletHistory>({
    queryKey: [`/api/marketplace/me/wallet/transactions?limit=${PAGE_SIZE}&offset=0`],
  });
  const extra = useQuery<WalletHistory>({
    queryKey: [`/api/marketplace/me/wallet/transactions?limit=${PAGE_SIZE}&offset=${(pages - 1) * PAGE_SIZE}`],
    enabled: pages > 1,
  });

  // Merge the loaded pages in order (first page + the latest extra page cover
  // the common cases; intermediate pages stay cached by react-query).
  const loaded: WalletTx[] = [];
  if (first.data) loaded.push(...first.data.transactions);
  if (pages > 1 && extra.data) {
    const seen = new Set(loaded.map((t) => t.date + t.amountAed + t.label));
    for (const t of extra.data.transactions) {
      if (!seen.has(t.date + t.amountAed + t.label)) loaded.push(t);
    }
  }
  const total = first.data?.total ?? 0;
  const hasMore = loaded.length < total;

  return (
    <div style={{ background: PAGE_CREAM, color: INK, fontFamily: FF, minHeight: '100%' }}>
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/marketplace/profile"
            aria-label="Back to profile"
            data-testid="link-wallet-back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
            style={{ border: '1px solid rgba(0,62,140,0.15)', background: '#fff', color: NAVY }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 style={{ fontFamily: FF, fontWeight: 700, fontSize: 22, color: NAVY, letterSpacing: '-0.02em' }}>Wallet</h1>
        </div>

        <Card style={cardChrome} data-testid="card-wallet-header">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(0,107,95,0.12)' }}>
              <Wallet className="h-5 w-5" style={{ color: TEAL }} />
            </div>
            <div>
              <p style={{ fontSize: 12, color: INK_SUB }}>Wallet credit</p>
              {first.isLoading ? (
                <Skeleton className="h-7 w-28 mt-1" />
              ) : (
                <p data-testid="text-wallet-page-balance" style={{ fontSize: 24, fontWeight: 700, color: (first.data?.walletBalanceAed ?? 0) > 0 ? TEAL : INK_SUB }}>
                  AED {(first.data?.walletBalanceAed ?? 0).toFixed(2)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-4">
          <Card style={cardChrome} data-testid="card-wallet-history">
            <CardContent className="p-0">
              {first.isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : first.isError ? (
                <p className="p-4" style={{ fontSize: 14, color: INK_SUB }}>Could not load wallet history. Pull to refresh or try again shortly.</p>
              ) : loaded.length === 0 ? (
                <p className="p-4" data-testid="text-wallet-empty" style={{ fontSize: 14, color: INK_SUB }}>
                  No wallet activity yet. Credit you earn from referrals and promos appears here.
                </p>
              ) : (
                <ul>
                  {loaded.map((t, i) => (
                    <li
                      key={`${t.date}-${i}`}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(0,62,140,0.08)' }}
                      data-testid={`row-wallet-tx-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p style={{ fontSize: 14, fontWeight: 500, color: INK }}>{t.label}</p>
                        <p style={{ fontSize: 12, color: INK_SUB, marginTop: 2 }}>{fmtDate(t.date)}</p>
                      </div>
                      <p
                        style={{ fontSize: 15, fontWeight: 600, color: t.amountAed > 0 ? TEAL : INK, whiteSpace: 'nowrap' }}
                        data-testid={`text-wallet-tx-amount-${i}`}
                      >
                        {fmtAmount(t.amountAed)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {hasMore && (
            <button
              type="button"
              onClick={() => setPages((p) => p + 1)}
              data-testid="button-wallet-load-more"
              className="mt-3 w-full rounded-md py-3 text-sm font-medium transition-transform active:scale-[0.99]"
              style={{ border: '1px solid rgba(0,62,140,0.15)', background: '#fff', color: NAVY, fontFamily: FF, cursor: 'pointer' }}
            >
              Show more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
