'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep the square map as wide as its column; constrain only its scroll window. */
export function NavalMapPanel({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const content = panel?.closest<HTMLElement>('.naval-content');
    if (!panel || !content) return;

    const measure = () => {
      if (content.clientHeight <= 0) return;
      const contentStyle = getComputedStyle(content);
      const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
      const legendHeight = panel.querySelector('.nb-board-legend')?.getBoundingClientRect().height ?? 0;
      const naturalTop = panel.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
      const layout = panel.closest('.naval-play-layout');
      const stacked = layout ? getComputedStyle(layout).flexDirection === 'column' : false;

      // On small screens the command panel comes first. The outer scroll lets
      // the map reach the top, so it can use the whole remaining viewport.
      const top = stacked ? paddingTop : Math.max(paddingTop, naturalTop);
      const height = `${Math.max(44, Math.floor(content.clientHeight - top - paddingBottom - legendHeight))}px`;
      if (panel.style.getPropertyValue('--naval-board-height') !== height) {
        panel.style.setProperty('--naval-board-height', height);
      }
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    let observed = new Set<Element>();
    const observeLayout = () => {
      const elements = new Set<Element>([content, panel]);
      const legend = panel.querySelector('.nb-board-legend');
      const teams = content.querySelector('.naval-team-strip');
      if (legend) elements.add(legend);
      if (teams) elements.add(teams);
      for (const element of observed) if (!elements.has(element)) resizeObserver?.unobserve(element);
      for (const element of elements) if (!observed.has(element)) resizeObserver?.observe(element);
      observed = elements;
      measure();
    };
    const mutationObserver = new MutationObserver(observeLayout);
    mutationObserver.observe(content, { childList: true, subtree: true });
    observeLayout();
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return <div ref={panelRef} className="naval-map-panel">{children}</div>;
}
