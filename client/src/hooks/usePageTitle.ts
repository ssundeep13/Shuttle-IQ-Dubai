import { useEffect } from 'react';

export function usePageTitle(title: string, raw?: boolean) {
  useEffect(() => {
    const suffix = 'ShuttleIQ';
    document.title = raw ? title : (title ? `${title} | ${suffix}` : suffix);
    return () => {
      document.title = suffix;
    };
  }, [title, raw]);
}
