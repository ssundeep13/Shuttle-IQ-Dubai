import { useLocation } from 'wouter';
import { usePageMeta } from '@/hooks/usePageMeta';
import { isNoindexPath } from '@shared/seo';

export function RobotsMetaController() {
  const [location] = useLocation();
  usePageMeta({ noindex: isNoindexPath(location) });
  return null;
}
