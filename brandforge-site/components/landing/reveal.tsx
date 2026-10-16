'use client';

import { useEffect, useRef, useState } from 'react';

// Marks its block data-in="true" once it scrolls into view (once). The CSS in globals decides what that means: a gentle
// settle for sections, a filling line for the workflow. Without IntersectionObserver it is simply shown.
export function Reveal({ children, className = '', as: Tag = 'div', threshold = 0.2 }: { children: React.ReactNode; className?: string; as?: 'div' | 'section' | 'ol' | 'ul'; threshold?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return (
    <Tag ref={ref as never} data-in={inView ? 'true' : 'false'} className={className}>
      {children}
    </Tag>
  );
}
