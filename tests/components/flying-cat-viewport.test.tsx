// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlyingCatViewport } from '@/components/activities/flying-cat/FlyingCatViewport';

class VisibleViewport extends EventTarget {
  width = 1024; height = 680; offsetLeft = 0; offsetTop = 36;
}
let visible: VisibleViewport;
beforeEach(() => {
  visible = new VisibleViewport();
  vi.stubGlobal('visualViewport', visible);
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 768);
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  document.body.removeAttribute('style');
});

describe('Flying Cat actual visible viewport', () => {
  it('portals outside transformed/clipped dashboard ancestors and uses the visible iPad area', () => {
    const { container } = render(<div data-testid="dashboard" style={{ transform: 'translateY(8px)', overflow: 'hidden', height: 200 }}>
      <FlyingCatViewport><div>Game controls</div></FlyingCatViewport>
    </div>);
    const viewport = screen.getByTestId('flying-cat-viewport');
    expect(viewport.parentElement).toBe(document.body);
    expect(container.contains(viewport)).toBe(false);
    expect(viewport).toHaveStyle({ position: 'fixed', width: '1024px', height: '680px', left: '0px', top: '36px', zIndex: '1000' });
    expect(viewport).toHaveTextContent('Game controls');
    expect(viewport.querySelector('header')).toBeNull();
  });

  it('follows browser chrome resize and visual viewport scrolling without rotating content', () => {
    render(<FlyingCatViewport><div>Flight</div></FlyingCatViewport>);
    visible.width = 1000; visible.height = 540; visible.offsetLeft = 12; visible.offsetTop = 84;
    act(() => { visible.dispatchEvent(new Event('resize')); });
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ width: '1000px', height: '540px', left: '12px', top: '84px' });
    visible.offsetTop = 110;
    act(() => { visible.dispatchEvent(new Event('scroll')); });
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ top: '110px', transform: '' });
  });

  it('falls back to the real window dimensions when VisualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    render(<FlyingCatViewport><div>Flight</div></FlyingCatViewport>);
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ width: '1024px', height: '768px', top: '0px' });
    vi.stubGlobal('innerWidth', 844); vi.stubGlobal('innerHeight', 390);
    fireEvent.resize(window);
    expect(screen.getByTestId('flying-cat-viewport')).toHaveStyle({ width: '844px', height: '390px' });
  });

  it('restores prior body styles and priorities while removing viewport listeners', () => {
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overscroll-behavior', 'contain');
    const remove = vi.spyOn(visible, 'removeEventListener');
    const { unmount } = render(<FlyingCatViewport><div>Flight</div></FlyingCatViewport>);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.getPropertyValue('overscroll-behavior')).toBe('none');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
    expect(document.body.style.getPropertyValue('overscroll-behavior')).toBe('contain');
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(screen.queryByTestId('flying-cat-viewport')).not.toBeInTheDocument();
  });

  it('does not overwrite an enclosing player scroll-lock restoration during unmount', () => {
    document.body.style.overflow = 'hidden';
    const { unmount } = render(<FlyingCatViewport><div>Flight</div></FlyingCatViewport>);
    // React can clean up the enclosing player before cleaning up this portal.
    document.body.style.overflow = 'auto';
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does not access browser objects or render children during server rendering', () => {
    const Child = vi.fn(() => <div>Flight</div>);
    expect(renderToString(<FlyingCatViewport><Child /></FlyingCatViewport>)).toBe('');
    expect(Child).not.toHaveBeenCalled();
  });
});
