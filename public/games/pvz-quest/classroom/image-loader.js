/**
 * Share requests without permanently caching a slow connection as a missing
 * sprite. The UI may show a placeholder after eight seconds, but a late image
 * still updates its cards and boards. Errors get one bounded automatic retry.
 */
export function createImageLoader({
  resolveURL = src => src,
  createImage = () => new Image(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
  placeholderDelay = 8000,
  requestDeadline = 45000,
  retryDelay = 750,
  maxRetries = 1,
} = {}) {
  const cache = new Map();
  return {
    load(src, onReady) {
      const cached = cache.get(src);
      if (cached) {
        if (onReady && !cached.complete) cached.listeners.add(onReady);
        return cached.promise;
      }
      let resolve;
      const entry = {
        promise: new Promise(done => { resolve = done; }),
        listeners: new Set(onReady ? [onReady] : []),
        complete: false,
      };
      cache.set(src, entry);
      const timers = new Set();
      let currentImage = null;
      let retries = 0;
      const schedule = (callback, delay) => {
        const timer = setTimer(() => { timers.delete(timer); callback(); }, delay);
        timers.add(timer);
      };
      const detach = () => {
        if (currentImage) currentImage.onload = currentImage.onerror = null;
      };
      const finish = image => {
        if (entry.complete) return;
        entry.complete = true;
        detach();
        for (const timer of timers) clearTimer(timer);
        timers.clear();
        // The first promise may already have returned a temporary placeholder.
        // Future users must receive the actual image, not that old null result.
        if (image) entry.promise = Promise.resolve(image);
        else if (cache.get(src) === entry) cache.delete(src);
        resolve(image);
        if (image) {
          for (const listener of entry.listeners) {
            try { listener(image); } catch { /* One detached UI must not stop others. */ }
          }
        }
        entry.listeners.clear();
      };
      const attempt = () => {
        if (entry.complete) return;
        try {
          currentImage = createImage();
          const image = currentImage;
          image.onload = () => finish(image.naturalWidth && image.naturalHeight ? image : null);
          image.onerror = () => {
            detach();
            if (retries < maxRetries) {
              retries += 1;
              schedule(attempt, retryDelay);
            } else finish(null);
          };
          image.src = resolveURL(src);
        } catch { finish(null); }
      };
      schedule(() => resolve(null), placeholderDelay);
      schedule(() => finish(null), requestDeadline);
      attempt();
      return entry.promise;
    },
  };
}
