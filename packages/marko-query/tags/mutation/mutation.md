# `<mutation>`

Run a mutation (create/update/delete) and get back a reactive result plus stable
`mutate` / `mutateAsync` / `reset` handlers (the Marko equivalent of React's
`useMutation`). It follows the bus / `_pulse` pattern from `<query>`, with one extra
subtlety around making the handlers survive SSR resume.

## Usage

```marko
<mutation/addTodo options=() => ({
  mutationFn: (title) => api.createTodo(title),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
})/>

<button disabled=addTodo.isPending onClick() { addTodo.mutate("New todo"); }>
  Add
</button>
<if=addTodo.isError>Failed: ${addTodo.error.message}</if>
```

## Input and return

- **Input** `options` is a thunk returning the mutation options (`mutationFn`,
  `onSuccess`, `onError`, …).
- **Returns** the reactive result (`status`, `data`, `error`, `variables`, `isPending` /
  `isSuccess` / `isError` / `isIdle`, …) **plus** the action handlers `mutate`,
  `mutateAsync`, and `reset`.

## Why it's needed

Mutations are how you write data and reflect the in-flight / success / error state in the
UI, and how you trigger cache invalidation on success. This tag wires a `MutationObserver`
to a reactive value and exposes the handlers your event listeners call.

## How it works

Same bus + `_pulse` + `_ref` shape as `<query>`, plus:

- **The action handlers are attached on the client, in the effect — not in `_makeRef`.**
  `_makeRef` returns a holder with the handler fields `undefined`, so the initial
  `mutationResult` carries no functions and stays serializable on the server. The first
  time the client effect runs (on a client mount or on resume) it attaches `ref.mutate` /
  `ref.mutateAsync` / `ref.reset` once; they read `ref.observer` lazily at call time.
- When a client is present it builds the `MutationObserver`, seeds `mutationResult` from
  `getCurrentResult()` (merged with the handlers), and subscribes a listener that assigns a
  fresh result (again merged with the handlers) on every change. `$signal.onabort`
  unsubscribes.

## Why it's built this way

**Handlers on `_ref`, attached in the effect, read lazily.** This is the key decision and
it solves two problems at once. (1) Serialization: a Marko `<let>` initializer is *resumed*,
not re-run, on the client, so anything attached to the result during SSR — or only on a
client mount — would be lost on resume; attaching in the client effect (which runs on both
mount and resume) makes the handlers always present. (2) Stale bindings: because the
handlers are set once and read `ref.observer` lazily, a DOM event binding captured when this
tag happened to mount during a previous instance's async teardown still fires a working
`mutate` against the current observer.

The serializable initial value, the `_ref`-via-alias mutation, the fresh-result objects,
and the `_pulse` bus wake are all the same as `<query>`, for the same reasons.

## Related

- `<query>` — the shared shape and rationale.
- `<is-mutating>` / `<mutation-state>` — observe mutations in aggregate.
- `<query-client-provider>` / `qc-bus`.
