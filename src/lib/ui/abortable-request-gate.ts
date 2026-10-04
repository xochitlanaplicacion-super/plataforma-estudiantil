/** Keeps one request active and makes canceled or replaced responses inert. */
export function createAbortableRequestGate() {
  let active: AbortController | null = null;

  return {
    get busy() { return active !== null; },
    start() {
      if (active) return null;
      const controller = new AbortController();
      active = controller;
      return {
        signal: controller.signal,
        isCurrent: () => active === controller && !controller.signal.aborted,
        // A stale finally block must not release a newer request's lock.
        finish() {
          if (active !== controller) return false;
          active = null;
          return true;
        },
      };
    },
    cancel() {
      const controller = active;
      active = null;
      controller?.abort();
    },
  };
}
