import type {
  DefaultError,
  DefinedQueryObserverResult,
  InfiniteData,
  InfiniteQueryObserverOptions,
  InfiniteQueryObserverResult,
  MutateFunction,
  MutationObserverOptions,
  MutationObserverResult,
  OmitKeyof,
  Override,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from "@tanstack/query-core";

// --- Query ---

/** Options for the <query> tag */
export type MarkoQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>;

/** Result from the <query> tag */
export type MarkoQueryResult<
  TData = unknown,
  TError = DefaultError,
> = QueryObserverResult<TData, TError>;

/** Result from <query> with defined initialData */
export type DefinedMarkoQueryResult<
  TData = unknown,
  TError = DefaultError,
> = DefinedQueryObserverResult<TData, TError>;

// --- Infinite Query ---

/** Options for the <infinite-query> tag */
export type MarkoInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = InfiniteQueryObserverOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam
>;

/** Result from the <infinite-query> tag */
export type MarkoInfiniteQueryResult<
  TData = unknown,
  TError = DefaultError,
> = InfiniteQueryObserverResult<TData, TError>;

// --- Mutation ---

/** Options for the <mutation> tag */
export type MarkoMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = OmitKeyof<
  MutationObserverOptions<TData, TError, TVariables, TContext>,
  "_defaulted"
>;

/** Mutate function type (fire-and-forget, errors swallowed) */
export type MarkoMutateFunction<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = (
  ...args: Parameters<MutateFunction<TData, TError, TVariables, TContext>>
) => void;

/** Result from the <mutation> tag */
export type MarkoMutationResult<
  TData = unknown,
  TError = DefaultError,
  TVariables = unknown,
  TContext = unknown,
> = Override<
  MutationObserverResult<TData, TError, TVariables, TContext>,
  { mutate: MarkoMutateFunction<TData, TError, TVariables, TContext> }
> & {
  mutateAsync: MutateFunction<TData, TError, TVariables, TContext>;
};
