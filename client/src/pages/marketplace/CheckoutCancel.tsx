import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';
import { Link } from 'wouter';
import { InstallAppBar } from '@/components/InstallAppBar';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function CheckoutCancel() {
  usePageTitle('Checkout Cancelled');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking_id');
    if (bookingId) {
      const token = localStorage.getItem('mp_accessToken');
      if (token) {
        fetch(`/api/marketplace/bookings/${bookingId}/cancel`, {
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
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <Card>
            <CardHeader className="text-center">
              <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle data-testid="text-checkout-cancelled">Payment Cancelled</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Your payment was cancelled and no charge was made. You can try booking again whenever you're ready.
              </p>
              <div className="flex gap-3 justify-center flex-wrap pt-2">
                <Link href="/marketplace/book">
                  <Button data-testid="button-browse-sessions">Browse Sessions</Button>
                </Link>
                <Link href="/marketplace">
                  <Button variant="outline" data-testid="button-go-home">Go Home</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <InstallAppBar />
    </>
  );
}
