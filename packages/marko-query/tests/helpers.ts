import { QueryClient } from "@tanstack/query-core";

/**
 * Creates a mounted QueryClient for testing.
 * Must be cleaned up with queryClient.clear() + queryClient.unmount() in afterEach.
 */
export function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // No retries in tests — fail fast
        gcTime: Infinity, // Don't garbage collect during tests
      },
      mutations: {
        retry: false,
      },
    },
  });
  client.mount();
  return client;
}

/**
 * Creates a promise with external resolve/reject controls.
 */
export function controllablePromise<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Flush microtasks — needed for Marko's batched reactive updates.
 */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Generates a unique query key to avoid cache collisions between tests.
 */
let keyCounter = 0;
export function uniqueKey(): string[] {
  return [`test-key-${++keyCounter}`];
}