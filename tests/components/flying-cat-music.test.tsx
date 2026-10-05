// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLYING_CAT_MUSIC_URL, useFlyingCatMusic } from '@/components/activities/flying-cat/useFlyingCatMusic';

const play = vi.fn<() => Promise<void>>();
const pause = vi.fn();
const load = vi.fn();
const removeAttribute = vi.fn();
let audio: { src: string; loop: boolean; preload: string; volume: number; play: typeof play; pause: typeof pause; load: typeof load; removeAttribute: typeof removeAttribute };
beforeEach(() => {
  localStorage.clear();
  play.mockReset().mockResolvedValue(); pause.mockReset(); load.mockReset(); removeAttribute.mockReset();
  vi.stubGlobal('Audio', vi.fn(function(this: unknown, src: string) {
    audio = { src, loop: false, preload: '', volume: 1, play, pause, load, removeAttribute };
    return audio;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe('Flying Cat user-controlled soundtrack', () => {
  it('does not load on entry, then loops the provided track after an explicit start', async () => {
    const { result } = renderHook(useFlyingCatMusic);
    expect(Audio).not.toHaveBeenCalled();
    await act(async () => result.current.resume());
    expect(Audio).toHaveBeenCalledOnce();
    expect(audio).toMatchObject({ src: FLYING_CAT_MUSIC_URL, loop: true, preload: 'none', volume: 0.35 });
    expect(play).toHaveBeenCalledOnce();
    expect(result.current.enabled).toBe(true);
  });

  it('mutes immediately, remembers the preference, and resumes the same track when activated', async () => {
    const { result } = renderHook(useFlyingCatMusic);
    await act(async () => result.current.resume());
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(pause).toHaveBeenCalledOnce();
    expect(localStorage.getItem('flying-cat:music')).toBe('off');
    await act(async () => result.current.toggle());
    expect(play).toHaveBeenCalledTimes(2);
    expect(Audio).toHaveBeenCalledOnce();
    expect(localStorage.getItem('flying-cat:music')).toBe('on');
  });

  it('honors a saved mute without loading the audio at all', () => {
    localStorage.setItem('flying-cat:music', 'off');
    const { result } = renderHook(useFlyingCatMusic);
    act(() => result.current.resume());
    expect(result.current.enabled).toBe(false);
    expect(Audio).not.toHaveBeenCalled();
  });

  it('pauses without resetting the track and does not play while the game is paused', async () => {
    const { result } = renderHook(useFlyingCatMusic);
    await act(async () => result.current.resume());
    act(() => result.current.pause());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(play).toHaveBeenCalledOnce();
    await act(async () => result.current.resume());
    expect(play).toHaveBeenCalledTimes(2);
    expect(Audio).toHaveBeenCalledOnce();
  });

  it('offers activation after a browser refuses playback, without an unhandled rejection', async () => {
    play.mockRejectedValueOnce(new DOMException('User gesture required', 'NotAllowedError'));
    const { result } = renderHook(useFlyingCatMusic);
    await act(async () => result.current.resume());
    expect(result.current.enabled).toBe(false);
    await act(async () => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('survives unavailable storage and cancels/releases pending playback on unmount', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    let reject!: (error: Error) => void;
    play.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const { result, unmount } = renderHook(useFlyingCatMusic);
    act(() => result.current.resume());
    unmount();
    expect(pause).toHaveBeenCalled();
    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(load).toHaveBeenCalledOnce();
    await act(async () => reject(new Error('Playback interrupted')));
  });
});
