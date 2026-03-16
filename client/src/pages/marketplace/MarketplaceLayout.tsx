import { MarketplaceNav } from '@/components/MarketplaceNav';
import { MarketplaceFooter } from '@/components/MarketplaceFooter';

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MarketplaceNav />
      <main className="flex-1">{children}</main>
      <MarketplaceFooter />
    </div>
  );
}
