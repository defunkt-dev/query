# `<query-client>`

Returns the active `QueryClient` (the one `<query-client-provider>` put on `$global`) for
imperative use in your own code — `invalidateQueries`, `setQueryData`, `prefetchQuery`,
`clear`, and so on.

## Usage

```marko
<query-client/qc/>

<button onClick() { qc?.invalidateQueries({ queryKey: ["todos"] }); }>
  Refresh
</button>
```

## Return

The active `QueryClient` on the client, and `null` on the server / before the client
exists. **Null-check it**, and use it from event handlers (which run on the client).

## Why it's needed

Sometimes you need the client directly rather than through a `<query>`/`<mutation>` tag —
to invalidate after an external event, seed the cache, or read it imperatively. This is the
public accessor, so your code does not reach into the `$global.__tanstack_queryClient` key
itself.

## How it works

A reactive `let` that is read from `$global` in the client effect only, woken on resume by
the bus (`_pulse`), exactly like the data tags:

```marko
<let/client = (null as QueryClient | null)>
<let/_pulse = 0>
<script> const off = subscribeClientPublish(() => { _pulse++; }); $signal.onabort = off; </script>
<script> client = (_pulse, ($global ?? {}).__tanstack_queryClient ?? null); </script>
<return=client/>
```

## Why it's built this way

The `let` is `null` on the server and never reads `$global` there, so the non-serializable
`QueryClient` never enters Marko scope and a server render cannot crash serializing it —
even in the route-handler flow where a client *is* present on `$global` during SSR. That is
why the return is `QueryClient | null` and why callers must null-check and use it
client-side.

## Related

- `<query-client-provider>` — creates and publishes the client this returns.
- `qc-bus` — the wake mechanism (`_pulse`).
