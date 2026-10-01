/** Bloquea envíos repetidos antes de que el estado visual de React se actualice. */
export function createSingleFlightGate() {
  let locked = false;

  return {
    tryAcquire(): boolean {
      if (locked) return false;
      locked = true;
      return true;
    },
    release(): void {
      locked = false;
    },
    isLocked(): boolean {
      return locked;
    },
  };
}
