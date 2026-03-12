import { MarketplaceNav } from '@/components/MarketplaceNav';

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <MarketplaceNav />
      <main>{children}</main>
    </div>
  );
}
