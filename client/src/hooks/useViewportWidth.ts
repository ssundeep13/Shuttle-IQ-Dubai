// Live viewport width for the IQ Pass screens (jsdom: window.innerWidth, default 1024).
import { useEffect, useState } from 'react';

/** Widths at or below this get the phone layout (full-width cards, stacked columns). */
export const MOBILE_MAX = 430;
/** Widths at or below this show the app's fixed bottom nav (md:hidden), 64px tall. */
export const BOTTOM_NAV_MAX = 767;
/** The marketplace header is sticky and 56px tall; sticky bars sit under it. */
export const HEADER_HEIGHT = 56;

export function useViewportWidth(): number {
  const read = () => (typeof window === 'undefined' ? 1024 : window.innerWidth);
  const [width, setWidth] = useState<number>(read);
  useEffect(() => {
    const onResize = () => setWidth(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}
