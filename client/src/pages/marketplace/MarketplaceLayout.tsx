import { MarketplaceNav } from '@/components/MarketplaceNav';
import { MarketplaceFooter } from '@/components/MarketplaceFooter';
import { InstallAppBar } from '@/components/InstallAppBar';

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MarketplaceNav />
      <main className="flex-1 pb-16">{children}</main>
      <MarketplaceFooter />
      <InstallAppBar />
    </div>
  );
}
