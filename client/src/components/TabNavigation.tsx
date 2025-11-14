import { LayoutGrid, Users, History, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabType = 'courts' | 'queue' | 'history' | 'leaderboard';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'courts', label: 'Courts', icon: LayoutGrid },
    { id: 'queue', label: 'Queue', icon: Users },
    { id: 'history', label: 'History', icon: History },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  ];

  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as TabType)} className="w-full">
      <TabsList className="w-full grid grid-cols-4 h-auto p-1 bg-card border border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`tab-${tab.id}`}
              className={cn(
                "flex items-center justify-center gap-2 py-3 px-4 rounded-md transition-all",
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
                "data-[state=inactive]:text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">{tab.label}</span>
              <span className="sm:hidden font-medium">{tab.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
