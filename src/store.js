// Settings and progress kept in this browser. Keys used to start with
// "pacetime-" (the game's old name); those are carried over the first time
// they're read.
const PREFIX = "slowlight-", OLD = "pacetime-";

export const store = {
  get(key) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      if (v !== null) return v;
      const old = localStorage.getItem(OLD + key);
      if (old !== null) localStorage.setItem(PREFIX + key, old);
      return old;
    } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, value); } catch {}
  },
};
