// Reactive bridge from <query-client-provider> to the query/mutation/infinite-query consumers.
// It carries no client and nothing serializable -- the QueryClient lives on $global and each
// consumer reads it from there directly. This module exists only so a consumer can be woken to
// re-check $global when the provider publishes, which is what makes resume work (on resume the
// consumer effects run before the provider's, so a one-time read would miss the client).
const subscribers = new Set<() => void>();
export function subscribeClientPublish(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
export function publishClient(): void {
  subscribers.forEach((fn) => {
    try { fn(); } catch { /* a torn-down subscriber; ignore */ }
  });
}