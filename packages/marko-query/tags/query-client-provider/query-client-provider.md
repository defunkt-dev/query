# `<query-client-provider>`

Creates and owns the `QueryClient`, makes it available to every data tag below it, and
hydrates server-dehydrated cache state. Wrap your app in it once, at the root.

## Usage

```marko
// app.marko
<query-client-provider>
  <my-app/>
</query-client-provider>
```

With default options:

```marko
<query-client-provider defaultOptions={ queries: { staleTime: 5000 } }>
  <my-app/>
</query-client-provider>
```

## Props

- `defaultOptions` — passed to `new QueryClient(...)`; e.g. `queries.staleTime`,
  `queries.gcTime`, `queries.retry`.
- `content` — the wrapped app (Marko body); rendered via `<${input.content}/>`.

## Why it's needed

Every consumer tag (`<query>`, `<mutation>`, the aggregates, …) needs the same
`QueryClient`. Rather than thread it through props, the provider parks one client on
`$global` and the consumers read it from there. The provider is the single place that
creates the client, hydrates it, and tears it down.

## How it works

The provider holds one piece of state — `<let/_state = { owned: false }>` — and runs a
browser-only `<lifecycle>`:

- **onMount** runs only in the browser. It looks for an existing client on
  `$global.__tanstack_queryClient`; if none exists it creates one, calls `client.mount()`,
  parks it on `$global`, and records `_state.owned = true`. If
  `$global.__tanstack_dehydrated` is present (the route-handler prefetch flow), it calls
  `hydrate(client, dehydrated)`. Finally it calls `publishClient()` on the bus to wake any
  consumers that mounted before the client existed.
- **onDestroy** unmounts and clears the client from `$global` **only if this provider
  owns it** (`_state.owned`), so a nested provider or a route-handler-supplied client is
  never torn down by the wrong owner.

## Why it's built this way

**Client created in the browser only.** `QueryClient` and `hydrate` are `client import`s,
so they are stripped from the server bundle, and `onMount` never runs on the server. The
provider therefore neither creates nor serializes a client during SSR — which is what
removes the "Unable to serialize queryClient" crash. The client lives on `$global` under a
non-serialized key; consumers read it from `$global` directly rather than through Marko
scope, so nothing non-serializable enters serialized state.

**No-clobber ownership.** A route handler may prefetch and put a client on `$global`
before the provider mounts, and providers can nest. Whoever first finds the slot empty
creates the client and owns it; everyone else reuses it; only the owner tears it down.
This makes the provider safe to drop in regardless of what set up the client.

**`_state` is a mutable holder, never reassigned**, so it does not participate in
reactivity — the same pattern the consumer tags use for `_ref`. `owned` is mutated in the
direct lifecycle body, which avoids the `optionalChainingAssign` trap (see the package
working doc).

## Related

- `qc-bus` — the publish/subscribe module the provider calls to wake consumers on resume.
- `<query>`, `<queries>`, `<infinite-query>`, `<mutation>`, `<query-client>`, and the
  aggregates — all read the client this provider publishes.
