import { cn } from "@/lib/utils";

type TabType = 'courts' | 'queue' | 'leaderboard' | 'history';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs: { id: TabType; label: string }[] = [
    { id: 'courts', label: 'Courts Management' },
    { id: 'queue', label: 'Player Queue' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'history', label: 'Game History' },
  ];

  return (
    <div className="bg-card rounded-lg shadow-md p-2 mb-6 border border-card-border">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex-1 px-4 py-2 rounded-md font-semibold transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover-elevate"
            )}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
