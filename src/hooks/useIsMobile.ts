import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 671px)';

/** Returns whether the current viewport matches the mobile layout breakpoint. */
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const update = (event?: MediaQueryListEvent) => {
      setIsMobile(event ? event.matches : mediaQuery.matches);
    };

    update();

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
    };

    legacyMediaQuery.addListener(update);
    return () => legacyMediaQuery.removeListener(update);
  }, []);

  return isMobile;
}