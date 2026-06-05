// Re-export everything from @tanstack/query-core
export * from "@tanstack/query-core";

// Re-export Marko-specific types
export type {
  MarkoQueryOptions,
  MarkoInfiniteQueryOptions,
  MarkoMutationOptions,
  MarkoQueryResult,
  MarkoInfiniteQueryResult,
  MarkoMutationResult,
} from "./types";

// Augment Marko.Global for QueryClient distribution
declare global {
  namespace Marko {
    interface Global {
      /** @internal Used by <query-client-provider> to distribute QueryClient */
      __tanstack_queryClient?: import("@tanstack/query-core").QueryClient;
      /** @internal Used by Phase 2 SSR to transfer dehydrated cache state */
      __tanstack_dehydrated?: import("@tanstack/query-core").DehydratedState;
      /** @internal Used by Phase 3 persist-client to suppress refetching during restore */
      __tanstack_isRestoring?: boolean;
    }
  }
}
