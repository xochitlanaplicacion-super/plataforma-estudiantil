// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavalMapPanel } from '@/components/classroom-games/naval/NavalMapPanel';

let geometry: { contentHeight: number; contentTop: number; panelTop: number; legendHeight: number; width: number };
let observers: MockResizeObserver[];

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) { observers.push(this); }
  resize() { this.callback([], this as unknown as ResizeObserver); }
}

function rect(top: number, height: number, width = geometry.width): DOMRect {
  return { x: 0, y: top, top, left: 0, bottom: top + height, right: width, width, height, toJSON() {} };
}

function Fixture({ stacked = false, legendKey = 'initial' }: { stacked?: boolean; legendKey?: string }) {
  return <div className="naval-content" style={{ paddingTop: 24, paddingBottom: 30 }}>
    <div className="naval-team-strip">Equipos</div>
    <div className="naval-play-layout" style={{ display: stacked ? 'flex' : 'grid', flexDirection: stacked ? 'column' : undefined }}>
      <aside>Controles</aside>
      <NavalMapPanel><div className="nb-board"><div className="nb-board-scroll"><div className="nb-coordinate-frame">Mapa cuadrado</div></div><div key={legendKey} className="nb-board-legend">Leyenda</div></div></NavalMapPanel>
    </div>
  </div>;
}

function setup(stacked = false) {
  const rendered = render(<Fixture stacked={stacked} />);
  const content = rendered.container.querySelector<HTMLElement>('.naval-content')!;
  const panel = rendered.container.querySelector<HTMLElement>('.naval-map-panel')!;
  Object.defineProperty(content, 'clientHeight', { configurable: true, get: () => geometry.contentHeight });
  act(() => { window.dispatchEvent(new Event('resize')); });
  return { ...rendered, content, panel };
}

beforeEach(() => {
  geometry = { contentHeight: 600, contentTop: 80, panelTop: 170, legendHeight: 25, width: 1_024 };
  observers = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('naval-content')) return rect(geometry.contentTop, geometry.contentHeight);
    if (this.classList.contains('naval-map-panel')) return rect(geometry.panelTop, 0);
    if (this.classList.contains('nb-board-legend')) return rect(0, geometry.legendHeight);
    return rect(0, 0);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Naval map uses its full column and a bounded scroll window', () => {
  it.each([
    { name: 'iPad landscape', contentHeight: 650, width: 1_024, panelTop: 170, expected: '505px' },
    { name: 'large desktop', contentHeight: 900, width: 2_560, panelTop: 170, expected: '755px' },
    { name: 'short landscape phone', contentHeight: 220, width: 844, panelTop: 110, expected: '135px' },
  ])('reserves visible content and legend height on $name without setting a width limit', (scenario) => {
    Object.assign(geometry, scenario);
    const { panel } = setup();
    expect(panel.style.getPropertyValue('--naval-board-height')).toBe(scenario.expected);
    expect(panel.style.width).toBe('');
    expect(panel.style.maxWidth).toBe('');
  });

  it('lets a stacked map below the fold use the content viewport after the user scrolls to it', () => {
    geometry.panelTop = 950;
    geometry.width = 390;
    geometry.legendHeight = 44;
    const { panel, content } = setup(true);
    expect(panel.style.getPropertyValue('--naval-board-height')).toBe('502px');
    content.scrollTop = 800;
    geometry.panelTop -= 800;
    act(() => observers[0].resize());
    expect(panel.style.getPropertyValue('--naval-board-height')).toBe('502px');
  });

  it('does not shrink its scroll window merely because outer content was panned', () => {
    const { panel, content } = setup();
    content.scrollTop = 180;
    geometry.panelTop -= 180;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(panel.style.getPropertyValue('--naval-board-height')).toBe('455px');
  });

  it('recalculates for viewport, team strip and wrapped legend sizes, with no repeated style writes', () => {
    const { panel, content } = setup();
    const observer = observers[0];
    expect(observer.observe.mock.calls.map(([element]) => element.className)).toEqual([
      'naval-content', 'naval-map-panel', 'nb-board-legend', 'naval-team-strip',
    ]);
    const setProperty = vi.spyOn(panel.style, 'setProperty');
    act(() => observer.resize());
    expect(setProperty).not.toHaveBeenCalled();
    geometry.contentHeight = 500;
    geometry.panelTop = 195;
    geometry.legendHeight = 50;
    act(() => observer.resize());
    expect(panel.style.getPropertyValue('--naval-board-height')).toBe('305px');
    expect(content.clientHeight).toBe(500);
    expect(setProperty).toHaveBeenCalledTimes(1);
  });

  it('observes a replacement board legend and releases observers when the panel unmounts', async () => {
    const { rerender, container, unmount } = setup();
    const initialLegend = container.querySelector('.nb-board-legend');
    await act(async () => { rerender(<Fixture legendKey="replacement" />); });
    const replacement = container.querySelector('.nb-board-legend');
    expect(replacement).not.toBe(initialLegend);
    expect(observers[0].unobserve).toHaveBeenCalledWith(initialLegend);
    expect(observers[0].observe).toHaveBeenCalledWith(replacement);
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it('keeps a small scroll window usable when content height is extremely constrained', () => {
    geometry.contentHeight = 90;
    const { panel } = setup();
    expect(panel.style.getPropertyValue('--naval-board-height')).toBe('44px');
  });
});
