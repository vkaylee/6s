import { useEffect, useRef, useState } from "react";

export interface UseHeaderVisibilityOptions {
  /** Scroll offset in px before auto-hide triggers. Default: 60 */
  threshold?: number;
}

/**
 * Hook to hide header when scrolling down and show when scrolling up or at page top.
 */
export function useHeaderVisibility(options: UseHeaderVisibilityOptions = {}): boolean {
  const { threshold = 60 } = options;
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 10) {
        setIsVisible(true);
      } else if (currentY > lastScrollY.current && currentY > threshold) {
        setIsVisible(false);
      } else if (currentY < lastScrollY.current) {
        setIsVisible(true);
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return isVisible;
}
