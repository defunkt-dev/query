# `qc-bus`

A tiny publish/subscribe module that lets `<query-client-provider>` wake the data
consumers when the `QueryClient` becomes available. It is **not** a Marko tag — it is a
plain `.ts` module (`tags-dir` only registers `.marko` files and folders as tags).

```ts
subscribeClientPublish(fn: () => void): () => void  // returns an unsubscribe
publishClient(): void                                // calls every subscriber
```

## Why it's needed

The client lives on `$global`, and consumers read it from there. But there is an ordering
problem on resume: Marko runs descendant (leaf) effects **before** ancestor effects, so a
consumer's effect runs before the provider's `onMount` has put the client on `$global`. A
consumer that read `$global` only once would miss the client forever.

The bus closes that gap. Each consumer subscribes a callback up front; the provider calls
`publishClient()` at the end of its `onMount` (after parking the client on `$global`); the
callback re-checks `$global` and now finds the client. On a plain client-side mount the
provider mounts before the consumer, so the client is already present on the first pass and
the publish is a harmless no-op.

## How it works

It is a module-level `Set` of callbacks. `subscribeClientPublish` adds one and returns a
remover; `publishClient` iterates the set and invokes each, wrapped in a `try/catch` so a
callback belonging to a torn-down consumer cannot break the loop for the others.

It carries no client and nothing serializable — the `QueryClient` itself never passes
through the bus; only the signal "re-check `$global` now" does.

## How consumers use it

The data tags pair the bus with a reactive `_pulse` counter:

```marko
<let/_pulse = 0>
<script>
  const off = subscribeClientPublish(() => { _pulse++; });
  $signal.onabort = off;
</script>
<script>
  // reading _pulse via the comma operator makes this effect re-run when the bus fires
  const queryClient = (_pulse, ($global ?? {}).__tanstack_queryClient);
  // ... build the observer once a client is present ...
</script>
```

Bumping `_pulse` re-runs the observer effect, which then sees the now-present client. Note
this re-run pattern is correct for the **observer** tags (they want to re-run to rebuild or
update the observer). It is deliberately **not** used by `<query-devtools>`, an imperative
resource, which would churn if it re-ran on every publish — see that tag's doc.

## Related

- `<query-client-provider>` — the only publisher (`publishClient()` in `onMount`).
- `<query>`, `<queries>`, `<infinite-query>`, `<mutation>`, `<query-client>`, the
  aggregates, and `<query-devtools>` — all subscribers.
