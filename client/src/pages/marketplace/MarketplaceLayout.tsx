import { MarketplaceNav } from '@/components/MarketplaceNav';
import { MarketplaceFooter } from '@/components/MarketplaceFooter';
import { InstallAppBar } from '@/components/InstallAppBar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import FoundingMemberAward from '@/components/FoundingMemberAward';

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MarketplaceNav />
      <main className="flex-1 pb-20 md:pb-16">{children}</main>
      <div className="hidden md:block">
        <MarketplaceFooter />
      </div>
      <InstallAppBar />
      <MobileBottomNav />
      {/* Founding Member award screen. Mounted at the layout so ONE gate covers
          both cases in the spec: the player who just completed a qualifying
          booking (checkout success re-fetches /auth/me and the award appears
          over it) and the backfilled player who sees it on next app open.
          Renders nothing unless the server says awarded-and-unseen. */}
      <FoundingMemberAward />
    </div>
  );
}
