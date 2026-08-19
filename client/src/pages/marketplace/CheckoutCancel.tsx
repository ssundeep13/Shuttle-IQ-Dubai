import { useEffect, type CSSProperties } from 'react';
import { apiUrl } from '@/lib/queryClient';
import { XCircle } from 'lucide-react';
import { Link } from 'wouter';
import { InstallAppBar } from '@/components/InstallAppBar';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getMarketplaceAccessToken } from '@/lib/queryClient';
import { MKT, FF_DISPLAY, FF_BODY, Reveal } from './LandingComponents';

function navyBtnStyle(): CSSProperties {
  return {
    fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em',
    padding: '12px 20px', borderRadius: 10, border: '1.5px solid transparent',
    background: MKT.navy, color: '#fff', borderColor: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}
function ghostBtnStyle(): CSSProperties {
  return {
    fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em',
    padding: '12px 20px', borderRadius: 10, border: `1.5px solid ${MKT.navy}55`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}

export default function CheckoutCancel() {
  usePageTitle('Checkout Cancelled');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking_id');
    if (bookingId) {
      const token = getMarketplaceAccessToken();
      if (token) {
        fetch(apiUrl(`/api/marketplace/bookings/${bookingId}/cancel`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {});
      }
    }
  }, []);

  return (
    <>
      <div style={{ minHeight: '100vh', background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY }} className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <Reveal>
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${MKT.navy}14`, overflow: 'hidden' }}>
              <div className="text-center" style={{ padding: '32px 28px 8px' }}>
                {/* Muted-navy mark — Cancel is not an error */}
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${MKT.navy}0F`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <XCircle className="h-8 w-8" style={{ color: MKT.inkSub }} />
                </div>
                <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 26, color: MKT.navy, letterSpacing: '-0.02em' }} data-testid="text-checkout-cancelled">Payment Cancelled</h1>
              </div>
              <div className="text-center space-y-5" style={{ padding: '8px 28px 32px' }}>
                <p style={{ color: MKT.inkSub, lineHeight: 1.55 }}>
                  Your payment was cancelled and no charge was made. You can try booking again whenever you're ready.
                </p>
                <div className="flex gap-3 justify-center flex-wrap pt-1">
                  <Link href="/marketplace/book">
                    <button type="button" style={navyBtnStyle()} data-testid="button-browse-sessions">Browse Sessions</button>
                  </Link>
                  <Link href="/marketplace">
                    <button type="button" style={ghostBtnStyle()} data-testid="button-go-home">Go Home</button>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
      <InstallAppBar />
    </>
  );
}
