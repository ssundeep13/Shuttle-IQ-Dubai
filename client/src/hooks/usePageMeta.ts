import { useEffect } from 'react';

interface PageMetaOptions {
  noindex?: boolean;
}

export function usePageMeta({ noindex }: PageMetaOptions) {
  useEffect(() => {
    if (!noindex) return;

    const previous = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const previousContent = previous?.getAttribute('content') ?? null;

    let tag = previous;
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', 'noindex,nofollow');

    return () => {
      if (previousContent === null) {
        tag?.parentNode?.removeChild(tag);
      } else {
        tag?.setAttribute('content', previousContent);
      }
    };
  }, [noindex]);
}
