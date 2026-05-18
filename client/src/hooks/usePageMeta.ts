import { useEffect } from 'react';

interface PageMetaOptions {
  noindex?: boolean;
}

export function usePageMeta({ noindex }: PageMetaOptions) {
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !tag;
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.appendChild(tag);
    }
    const previous = created ? null : tag.getAttribute('content');
    tag.setAttribute('content', noindex ? 'noindex,nofollow' : 'index,follow');

    return () => {
      if (previous === null) {
        tag?.parentNode?.removeChild(tag);
      } else {
        tag?.setAttribute('content', previous);
      }
    };
  }, [noindex]);
}
