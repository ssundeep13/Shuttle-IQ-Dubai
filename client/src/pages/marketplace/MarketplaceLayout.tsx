import { MarketplaceNav } from '@/components/MarketplaceNav';
import { MarketplaceFooter } from '@/components/MarketplaceFooter';
import { InstallAppBar } from '@/components/InstallAppBar';
import { MobileBottomNav } from '@/components/MobileBottomNav';

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
    </div>
  );
}
