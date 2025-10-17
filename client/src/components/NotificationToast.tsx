import { useEffect, useRef } from "react";
import { CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Notification } from "@shared/schema";
import { cn } from "@/lib/utils";

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: number) => void;
}

export function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    // Set up timers for new notifications
    notifications.forEach((notification) => {
      if (!timersRef.current.has(notification.id)) {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
          timersRef.current.delete(notification.id);
        }, 5000);
        timersRef.current.set(notification.id, timer);
      }
    });

    // Clean up timers for dismissed notifications
    const currentIds = new Set(notifications.map(n => n.id));
    timersRef.current.forEach((timer, id) => {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });

    // Cleanup on unmount
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [notifications, onDismiss]);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'danger':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return "bg-success text-success-foreground border-success";
      case 'warning':
        return "bg-warning text-warning-foreground border-warning";
      case 'danger':
        return "bg-destructive text-destructive-foreground border-destructive";
      default:
        return "bg-info text-info-foreground border-info";
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-md shadow-lg border-2 animate-in slide-in-from-right-full fade-in pointer-events-auto",
            getStyles(notification.type)
          )}
          data-testid={`notification-${notification.id}`}
        >
          {getIcon(notification.type)}
          <span className="font-medium">{notification.message}</span>
        </div>
      ))}
    </div>
  );
}
