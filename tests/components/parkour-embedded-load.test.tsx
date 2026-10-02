// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../games/parkour-race/src/App';
import { buildDemoActivity } from '../../games/parkour-race/src/lib/core';
import { useStore } from '../../games/parkour-race/src/store';

// Check the iframe message lifecycle without creating a WebGL scene.
vi.mock('../../games/parkour-race/src/components/Home', () => ({ default: () => null }));
vi.mock('../../games/parkour-race/src/components/Editor', () => ({ default: () => null }));
vi.mock('../../games/parkour-race/src/components/GameScreen', () => ({ default: () => null }));

// Use the game's renderer and React together; it is an independent Vite package.
const requireFromGame = createRequire(resolve(process.cwd(), 'games/parkour-race/package.json'));
const { act } = requireFromGame('react') as typeof import('react');
const { createRoot } = requireFromGame('react-dom/client') as typeof import('react-dom/client');

let root: Root | null = null;
function renderApp() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<App />));
}

const originalUrl = window.location.href;

function deliverActivity(activity: ReturnType<typeof buildDemoActivity>) {
  window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    source: window.parent,
    data: { type: 'parkour-race:load', payload: { activity } },
  }));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?embed=1');
  useStore.setState({ screen: 'home', activity: null, gameKey: 0, playing: false, question: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  window.history.replaceState(null, '', originalUrl);
});

describe('Parkour Race embedded activity loading', () => {
  it('starts once when the iframe receives the same preset on load and ready', () => {
    renderApp();
    const activity = buildDemoActivity();

    act(() => {
      deliverActivity(activity);
      deliverActivity(structuredClone(activity));
    });

    expect(useStore.getState().gameKey).toBe(1);
    expect(useStore.getState().activity?.id).toBe(activity.id);
  });

  it('still accepts a genuinely updated preset', () => {
    renderApp();
    const activity = buildDemoActivity();

    act(() => {
      deliverActivity(activity);
      deliverActivity({ ...activity, questions: [...activity.questions, {
        id: 'new-question', prompt: 'Nueva pregunta', answers: ['Sí', 'No'], correctIndex: 0,
      }] });
    });

    expect(useStore.getState().gameKey).toBe(2);
    expect(useStore.getState().activity?.questions).toHaveLength(activity.questions.length + 1);
  });
});
