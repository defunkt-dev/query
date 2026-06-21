# `<query-devtools>`

A thin Marko v6 wrapper around TanStack's framework-agnostic devtools panel
(`@tanstack/query-devtools`, built in Solid). It shows the live query and mutation
cache, lets you inspect and refetch, and is **dev-only** — stripped from production
builds.

## Usage

Drop it inside `<query-client-provider>`; it finds the active client on its own:

```marko
<query-client-provider>
  <my-app/>
  <query-devtools/>
</query-client-provider>
```

Optionally pass an explicit client or panel options:

```marko
<query-devtools
  client=myClient
  initialIsOpen=true
  buttonPosition="bottom-right"
/>
```

## Props

All optional:

| Prop | Purpose |
| --- | --- |
| `client` | A specific `QueryClient`. Defaults to the active client on `$global` (the one the provider publishes). |
| `initialIsOpen` | Open the panel on first mount. |
| `buttonPosition` / `position` | Placement of the toggle button and of the panel. |
| `errorTypes` | Custom error types for the panel's error-triggering UI. |
| `styleNonce` | CSP nonce for the injected styles. |
| `shadowDOMTarget` | Render the panel into a shadow root. |
| `hideDisabledQueries` | Hide queries that are currently disabled. |

These are read by the panel's constructor when it mounts; runtime changes are not
forwarded (see [Why it's built this way](#why-its-built-this-way)).

## Why it's needed

Every TanStack Query adapter ships a devtools wrapper around the same shared panel;
this is Marko's. The panel itself is TanStack's Solid app — this tag's only job is the
Marko-specific glue: find the client, mount the panel into a container, tear it down on
unmount, and keep all of that out of production.

## How it works

The tag renders one element — an empty container `<div class="tsqd-parent-container"/>`
— and runs a single client-only `<script>`:

1. **Dev gate:** `if (!import.meta.env.DEV) return;`. In production the bundler folds
   `import.meta.env.DEV` to `false`, so the script body (and the dynamic import of the
   panel) becomes unreachable and is dropped.
2. **`mountInto()`** reads the client (`input.client` or
   `$global.__tanstack_queryClient`); if one is present it dynamically imports
   `@tanstack/query-devtools`, constructs the panel with the Marko Query flavor, and
   mounts it into the container. It is idempotent — guarded by a `mounted` flag — so it
   never mounts twice.
3. It calls `mountInto()` once, then subscribes to the client bus
   (`subscribeClientPublish(mountInto)`) so a client that arrives later (on resume)
   still mounts.
4. **`$signal.onabort`** tears the panel down: it unsubscribes from the bus and calls
   `panel.unmount()`.

### Resume

On a server-rendered page, Marko runs leaf effects before the provider's `onMount`, so
the client may not be on `$global` when this tag first runs. The first `mountInto()`
finds nothing and returns; the bus subscription then mounts the panel as soon as the
provider publishes the client. On a fresh client-side mount the provider has already put
the client on `$global` (parent mounts before child), so the first `mountInto()` mounts
immediately.

### SSR

The `<script>` never runs on the server, so a server render emits only the empty
container — no client, no panel, no serialized state, no crash. The panel appears after
the page resumes in the browser.

## Why it's built this way

This is the part worth reading, because the obvious implementations are wrong in
non-obvious ways.

**One dependency-less `<script>`, not a reactive effect.** A Marko `<script>`'s
`$signal.onabort` cleanup is a *queued* effect: when the tag's scope is destroyed, Marko
pushes the cleanup onto a pending queue but does not run it immediately. The queue is
drained only when a reactive change drives a render pass (an `<if>` toggling, navigation,
a reactive value updating). In a real app the component is always removed *by* such a
change, so the same pass that removes the tag flushes its teardown and the panel
unmounts. The practical consequence: this tag does **not** need to read a reactive value
to tear down — assigning `$signal.onabort` arms it, and a genuine reactive unmount fires
it.

**Why not the `_pulse` observer shape.** The `<query>` / `<mutation>` tags in this
package use a two-`<script>` shape with a reactive `_pulse` counter, because they *want*
to re-run (to call `observer.setQueries` / re-subscribe when the key or client changes).
An earlier version of this tag copied that shape — and it churned: reading `_pulse` makes
the script re-run on every bus publish, and each re-run fires the previous run's
`onabort`, so a republish became unmount-then-remount (observed as the panel unmounting
three times in a single teardown). The devtools panel is an *imperative* resource, not a
reactive value, so it runs once and the bus wakes it imperatively through a plain
callback instead.

**Plain closure variables, not a `<let>` holder.** State (`panel`, `mounted`,
`disposed`) lives in closure variables in the script body. This sidesteps a real Marko
compile error: writing a `<let>` holder's property inside an async `.then` compiles to an
optional-chained scope assignment (`$scope._ref?.x = v`) that Babel rejects
(`optionalChainingAssign`). A closure assignment (`panel = ...`) is just an assignment.

**Dev-only via an early return, not an `<if>` wrapper.** Gating inside the effect with
`if (!import.meta.env.DEV) return;` keeps the effect at the top level (the proven pattern
in this package) and lets the bundler drop the unreachable dynamic import. The only
production cost is the inert empty container div.

**Reactive prop forwarding is intentionally not wired.** The panel's constructor captures
the initial `buttonPosition` / `position` / etc.; runtime changes to those props are not
pushed to the live panel. It could be added by calling the panel's setters in a small
reactive block, but it is not needed for the common case.

## Testing notes

The unit tests mock `@tanstack/query-devtools` and target *our* wiring, not the Solid
panel. The teardown test drives a **real** reactive unmount — it renders the tag inside
an `<if>` and toggles it off — because a bare `cleanup()` never flushes the queued
teardown. It asserts on the specific panel instance created in that test (its own
`unmounted` flag plus an exactly-once unmount count), not a global counter, because other
tests that mount a panel and end on a bare `cleanup()` leave their teardowns queued, and
the toggle is the first reactive change in the file, so it flushes them all at once. The
`/devtools` e2e validates the real panel in a real browser: it loads the built Solid
output, mounts, and the page resumes.

## Caveats

- **Production stripping is not yet verified against a real prod build.** The dev gate
  *should* drop the `@tanstack/query-devtools` chunk; confirm by building for production
  and grepping the output for `query-devtools` / the Solid panel. (Dev-time loading is
  verified by the e2e; prod-time stripping is a separate check.)
- The `/devtools` e2e requires `@tanstack/query-devtools` to be **built first**
  (`pnpm nx build @tanstack/query-devtools`), since it loads the panel's compiled output
  in the browser.

## Related

- `<query-client-provider>` — creates the client and publishes it on `$global`.
- `qc-bus` — the publish/subscribe module that wakes this tag (and the consumer tags) on
  resume.