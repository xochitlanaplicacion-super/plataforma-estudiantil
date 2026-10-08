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
      const legendHeight = panel.querySelector('.nb-board-legend')?.getBoundingClientRect().height ?? 0;
      let availableHeight: number;

      if (content.classList.contains('naval-content--play')) {
        // The play layout assigns each pane its own viewport, including when
        // they are stacked. Command scrolling must not change the map window.
        if (panel.clientHeight <= 0) return;
        const panelStyle = getComputedStyle(panel);
        const paddingTop = Number.parseFloat(panelStyle.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(panelStyle.paddingBottom) || 0;
        availableHeight = panel.clientHeight - paddingTop - paddingBottom;
      } else {
        if (content.clientHeight <= 0) return;
        const contentStyle = getComputedStyle(content);
        const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
        const naturalTop = panel.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
        const layout = panel.closest('.naval-play-layout');
        const stacked = layout ? getComputedStyle(layout).flexDirection === 'column' : false;
        const top = stacked ? paddingTop : Math.max(paddingTop, naturalTop);
        availableHeight = content.clientHeight - top - paddingBottom;
      }

      const height = `${Math.max(44, Math.floor(availableHeight - legendHeight))}px`;
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
    mutationObserver.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
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
