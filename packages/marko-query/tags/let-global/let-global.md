# `<let-global>`

A reactive global value, shared across the component tree by a `$global` key: read it, write
it, and every instance bound to the same key updates. It is a general primitive (not
specific to TanStack Query). In this package it is kept for Phase 3 — it is the intended
channel for the `isRestoring` flag the persist-client work needs.

## Usage

```marko
<let-global/theme from="theme"/>

<button onClick() { theme = theme === "dark" ? "light" : "dark"; }>
  Toggle theme (now: ${theme})
</button>
```

Two instances anywhere in the tree that both use `from="theme"` stay in sync: writing one
updates the other.

## Input and return

- **Input** `from` — the `$global` key name (typed against `keyof Marko.Global`).
- **Returns** a two-way-bindable value: reading gives the current `$global[from]`; assigning
  writes it back and notifies every other instance on the same key.

## Why it's needed

`$global` by itself is not reactive — a plain read does not re-run when the value changes,
and a write does not notify other readers. `<let-global>` adds that pub/sub layer, so a
value that several components across the tree must react to (a theme, a feature flag, or
`isRestoring`) can live on `$global` and still drive updates everywhere.

It is distinct from `qc-bus`: the bus only signals "re-check `$global`" and carries no
value, whereas `<let-global>` is a full reactive value channel keyed by name. The
`QueryClient` deliberately uses the bus + a direct `$global` read (not `<let-global>`),
because the client is non-serializable and must never enter Marko scope; `<let-global>` is
for serializable values that change and must propagate.

## How it works

A module-level `Map` (`subsMap`) keyed by the `$global` key name holds a `Set` of callbacks.
The `<let/value>` initializes from `($global ?? {})[from]`. A `<script>` adds this instance's
setter to the key's set and removes it on `$signal.onabort`. The returned binding's
`valueChange(next)` writes `($global ?? {})[from] = next` and then calls every callback in
the key's set — so a write in one instance pushes the new value into all the others.

## Related

- `qc-bus` — the lighter "wake to re-read" signal used for the (non-serializable) client.
- Phase 3 `persist-client` — will use this to broadcast `isRestoring` to the data consumers.
