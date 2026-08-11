import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

// Gate 4 (audit F6): offline visibility only — no mutation queueing, no
// replay. React Query's onlineManager already subscribes to the browser's
// online/offline events and is the same signal the query cache pauses on,
// so the strip can never disagree with what the data layer is doing.
export function useOfflineStatus(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => !onlineManager.isOnline(),
    () => false,
  );
}
