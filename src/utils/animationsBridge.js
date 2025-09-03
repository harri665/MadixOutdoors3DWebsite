/** ===== Animation API (pub/sub + helpers) ===== */
export const animationsBridge = (() => {
  let listeners = new Set();
  return {
    publish(payload) {
      for (const fn of listeners) fn(payload);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
