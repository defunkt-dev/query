session-3-working.md — Session 3 working notes (plain text)

Written in plain text on purpose: no markdown bold (the double-asterisk) and no backtick/code formatting, since those render as raw characters on the maintainer's client. Identifiers like $global and tag names are plain words.

Purpose: capture the start-of-session-3 clarifications and the Phase 2 step plan so they are on the record before implementation begins. Item 1 is a design decision for the query tag. Item 2 is a non-blocking verification with a defined probe and a defined time to run it. Item 3 is the full Phase 2 plan in execution order.

Numbering (two schemes, do not conflate). Phases are the whole project: Phase 1 core adapter (done), Phase 2 SSR dehydrate/hydrate (in progress, this doc), Phase 3 devtools and persist-client, Phase 4 examples and docs, Phase 5 streaming SSR (the query-stream tag, fetch-and-wait). Steps are the sub-steps inside Phase 2 only: Step 1 rebase, Step 2 harness, Step 3 provider/consumer refactor, Step 4 wire the dehydrate/hydrate flow, Step 5 SSR tests. So Step 4 means the fourth step of Phase 2 (the prefetch/hydrate plumbing), not Phase 4 (examples/docs). Section 5 refines the execution order of the Phase 2 steps into tiers (2a, 3, 2b, 2c); a reconciliation note there maps Step 4 and Step 5 onto those tiers.


====================================================================
1. THE QUERY CACHE-READ, AND "READ-ONLY VS FETCH-AND-WAIT"
====================================================================

The situation today. The query tag does all of its work inside a script, and scripts run only in the browser. So during a server render the query tag has no logic running; it just emits its fixed starting value, "pending" (Loading...). Even if the data was prefetched, the server HTML still says Loading.

What the cache-read is. The cache-read is the missing server-side piece (planned in earlier sessions, never built). It is a small branch in the query tag that runs during server render, looks in the QueryClient cache, and if the data for this key is already present, emits that real data instead of pending. So the first server-rendered HTML shows real content rather than a loading state.

How far that branch goes — the two levels:

Read-only (the Phase 2 decision). The tag only reads what is already in the cache. If the data is there, render it; if not, render pending. It never starts a fetch on the server. Whoever wants data on first paint prefetches it in the route handler before rendering. This is what Phase 2 builds. The client (held on a non-whitelisted $global key) is read as a local inside an IIFE, and only plain serializable fields are returned (status, data, error, the boolean flags), never functions like refetch, so nothing non-serializable enters Marko scope (the GOTCHAS section 1 pattern).

Fetch-and-wait (the native version, deferred to Phase 5). The tag itself runs the queryFn on the server, awaits it mid-render (Marko supports async rendering), and emits the result, so the developer prefetches nothing and the tag self-fetches server-side. More powerful but more complex: server-fetch errors, timeouts, partial data, and deciding what to prefetch. It is the natural pairing with streaming SSR, which is why it belongs in Phase 5 rather than Phase 2.

Decision for session 3: Phase 2's query tag reads the cache only. Auto-fetch (fetch-and-wait) is a Phase 5 concern. Build the read-only branch.

What read-only means for the client, and the two clients. The cache-read renders whatever is in the cache at server-render time, so the supported pattern is: the route handler creates a QueryClient, prefetches and awaits the route's queries, then renders. That client is created on the SERVER by the route handler, not by the provider tag — the provider's onMount is browser-only and never creates a client during SSR. The server client is used to prefetch, is read by the cache-read during render, then is dehydrated to JSON and discarded; it is never serialized (serializing a live client is the original crash). Only the dehydrated cache DATA crosses to the browser, on the whitelisted $global.__tanstack_dehydrated key. On the browser the provider's onMount creates a FRESH client and hydrates it from that data. So two client instances exist over the round-trip — one server-side (route handler) and one browser-side (provider) — and only data passes between them, never the client itself.

What happens when the server HTML is still pending. If the route handler did not prefetch, or fired the fetch without awaiting it, there is no settled data. Dehydrate carries only settled queries — an in-flight query is not serialized — so the browser has nothing to hydrate for it, the observer mounts, finds no data, and fires the fetch: a fresh client request. Phase 2 does not prevent that, because Phase 2 never fetches during render. Making an in-flight server fetch stream its result down so the user never sees pending AND the client does not refetch is fetch-and-wait / streaming SSR — Phase 5, not Phase 2. So in Phase 2 the contract is binary: prefetch-and-await gives data in the HTML and no client refetch; anything else renders pending and the client fetches on mount exactly as a pure CSR page would.


====================================================================
2. CONSUMER SUBSCRIPTION CLEANUP — NON-BLOCKING, WITH A PROBE
====================================================================

Background. The query, mutation, and infinite-query tags each use a TanStack observer. You subscribe to it with a callback; it calls the callback whenever data changes; subscribe returns an unsubscribe function. The tag stores that unsubscribe in one shared slot (ref.unsubscribe). The work runs in a script that re-runs whenever the options or key change, and $signal.onabort is the cleanup hook that fires when the script re-runs or the tag unmounts.

The shape that was flagged. On the first run the tag creates the observer, subscribes, and stores the unsubscribe in ref.unsubscribe. On a later run (options changed) it reuses the same observer via setOptions and subscribes again, overwriting ref.unsubscribe, and cleanup reads that same shared slot. The concern is purely about timing: if a new run's subscribe overwrites the slot before the previous run's cleanup fires, the late cleanup would tear down the new subscription and leave the original one alive. That would be a slow leak — a live listener plus an observer that is never destroyed on unmount. The tag's cleanup never calls observer.destroy(); a TanStack observer only auto-destroys when its last listener unsubscribes, so a leaked listener also keeps the observer attached to the query.

Why the existing tests do not catch it. Every subscription points at the same observer, and the observer pushes the same result to whichever subscriptions are alive. As long as one survives, the visible data stays correct, so the 38 browser-mount tests pass either way.

Current read on whether it is real. After tracing the compiler and runtime further, it leans toward not being a problem. The compiler emits a $signalReset for the previous run's signal as a render-phase statement (the translator emits $signalReset before the re-evaluated expression; the runtime in dom/abort-signal.ts queues the old controller's abort as an effect). If that reset runs before the new run's body, the old cleanup fires first and the rotation is clean — in which case even the shared-slot code is fine. The one thing not pinned down by reading alone is the exact ordering of the queued abort versus the re-run body.

The pending todo (verification — for the maintainer to run, since session 3 does not execute code here).
Instrument it and count live observer subscriptions:
- Mount a query with a given key.
- Change the key several times (about 3 to 5 changes).
- Unmount.
After each step, count the live listeners/observers. Cleanest reachable count: inspect the QueryClient cache — queryClient.getQueryCache().getAll() and check each query's observers length. Alternatively, spy on the observer's subscribe to track net subscribe minus unsubscribe.
Expected if clean: during key changes exactly one observer is live on the current key's query (and prior keys' queries drop to zero observers); after unmount, no query in the cache has any observers (every observers length is zero).
A leak shows up as: a query still holding an observer after unmount, or the count climbing across key changes rather than holding at one.

When it has to be done. It is not a blocker for Phase 2 and not on the SSR critical path. The cheapest moment is during the Phase 2 consumer refactor (handoff Step 5.2), because those three tags are already open and the refactor changes the one line that feeds the script (let-global to a direct $global read), which could in principle shift re-execution timing — verifying cleanup at the same time catches any regression for free. Decision (session 3): split out as its own micro-step, Step 2c, to run after the Step 3 refactor (see the refined sequence in section 5). This keeps the Step 3 diff purely the refactor. The probe needs only the refactored consumers plus a CSR mount / key-change / unmount context, which the existing 38 client tests already provide; it does not depend on the resume harness or on Step 2b, so it can run any time after Step 3.

If the probe shows a leak, the fix is small: capture each run's unsubscribe in a per-run local that its own onabort closes over (matching Marko's documented setInterval cleanup pattern), or do not re-subscribe in the else-if branch at all, since the original subscription still receives updates after setOptions.

====================================================================
3. PHASE 2 — FULL STEP PLAN (IN EXECUTION ORDER)
====================================================================

The order below is the agreed one: rebase first, then the SSR resume harness, then the refactor, then the dehydrate/hydrate flow, then the SSR tests. The handoff's Section 5 covers the same work; this is the ordering session 3 follows, with the cleanup probe (item 2 above) folded into the refactor.

Step 1 — Rebase to query-core 5.101 and confirm green.
Reconcile the marko-query package onto the 5.101 snapshot (only our files change; nothing conflicts upstream since the package does not exist there). Because the trees here are snapshots with no git history, this is a manual reconcile, not a literal git rebase. Install the workspace and run the 38 existing tests. This is the baseline — nothing else starts until those pass on 5.101.

Step 2 — Build the @marko/vite SSR resume harness.
The real flow: server-render to HTML, load the coordinated client JS, resume in jsdom, then assert. The html build and the dom/hydrate build must share registry ids, which @marko/vite does automatically (and which the standalone sandbox could not, hence its "marko_1_result/var is not a function" mismatch). First job for the harness: render the current, unrefactored query tag through it and reproduce the "Unable to serialize queryClient" crash inside the monorepo. That proves the harness works and re-confirms the diagnosis end to end. This is the red state the refactor clears.

Step 3 — Refactor the three pieces (the validated changes).
Provider (tags/query-client-provider/index.marko): switch to client import for QueryClient; remove the render-time IIFE and the let-global line; create the client in a lifecycle onMount (mount it, set it on $global, and if $global already has dehydrated state call hydrate); unmount and clear the key in onDestroy. Because onMount never runs on the server and client import strips QueryClient from the server bundle, the provider no longer creates or clobbers a client server-side.
Consumers (tags/query, tags/mutation, tags/infinite-query): remove the let-global line; read the client straight from $global at the top of the existing script; keep the script plus mutable-ref plus synchronous thunk so dynamic keys stay reactive.
Query tag server cache-read (the new read-only branch; see item 1 above): an IIFE that reads the client from $global as a local, builds a result from the cache (defaultQueryOptions, then getOptimisticResult or the query state), and returns only plain serializable fields, otherwise the pending object.
Once the harness red from step 2 turns green here, the crash is gone and the consumers read $global directly. The subscription-cleanup probe (item 2 above) is no longer folded in here; it has been split into its own micro-step, Step 2c (see the refined sequence in section 5), so the Step 3 diff stays purely the refactor.

Step 4 — Wire the dehydrate/hydrate data flow.
This is the server-entry / route-handler side, which lives in the test fixtures (and later the examples), not in the package itself: a throwaway client prefetches the page's queries, dehydrate produces plain JSON, that JSON goes on $global under a whitelisted key (serializedGlobals), and optionally the client goes on a non-whitelisted $global key so the cache-read can render data server-side. The provider's onMount from step 3 calls hydrate in the browser. dehydrate and hydrate are query-core's; we only call them.

Step 5 — Write the SSR tests against the harness, then confirm everything green.
Assertions: server render with prefetched data shows the data, not pending; dehydrate produces JSON and hydrate restores it; server-render-then-resume shows the data with no loading flash; no refetch when hydrated data is still fresh (the 5.101 syncData behavior); infinite-query round-trips queryType infinite through SSR; the provider does not clobber a prefetched client; and the 38 CSR tests still pass. When all of that is green, Phase 2 is done.

Not separate steps, but to hold in mind:
- let-global stays in the codebase (Phase 3's isRestoring uses its pub/sub) and just stops being the client channel.
- A changeset for the PR is a Phase 4 / PR-cutting concern, not part of getting Phase 2 working.


====================================================================
4. TEST HARNESS — TIER ORDER, CI WIRING, AND GOTCHAS
====================================================================

Agreed tier order and what each one is:

Tier 1 — vitest in the node environment, no browser. Server-render the template to an HTML string via template.render() and assert on the string and the dehydrated state. Committed, runs in the normal CI lane. Covers the crash reproduction (render the current query tag with a client injected on $global, expect "Unable to serialize" — the in-repo RED), and after the refactor: server-renders-the-data-not-pending, dehydrate-produces-JSON-and-hydrate-restores-it, and provider-does-not-clobber-a-prefetched-client.

Tier 2 — jsdom plus create-browser, following Marko's own runtime-tags recipe (their main.test.ts renders the server template to HTML, writes the chunks into a jsdom document via create-browser, loads a coordinated client/hydrate bundle, lets Marko resume, and asserts, with separate ssr and resume cases). Committed, runs in the normal vitest/node CI lane, no browser binary. This is the proof of the resume guarantee: no loading flash, no refetch when fresh, infinite-query resume.

Tier 3 — Playwright. Committed but kept OUT of the default test pipeline; it is a maintainer dev-test tool we run by hand. Lives in its own directory (for example e2e/) with its own script (for example test:e2e). Used as an independent real-browser sanity check of the no-loading-flash guarantee, and it is the right tool for the Phase 4 examples app.

Precedent finding: there is no Playwright (or Puppeteer, @vitest/browser, or Cypress) anywhere in the TanStack Query repo — no browser config, no e2e directories, no browser steps in any CI workflow. Every test in the monorepo is vitest in jsdom or node. That is why the committed resume proof is the jsdom/create-browser one (Tier 2), and Playwright (Tier 3) stays a dev tool rather than a committed CI gate.

CI isolation for Tier 3 (verified against the repo). CI runs an explicit, fixed target list: test:pr and test:ci are nx affected/run-many with targets test:sherif, test:knip, test:docs, test:eslint, test:lib, test:types, test:build, build. There is no test:e2e in that list, and nx only runs the targets it is told to. So a test:e2e script plus Playwright files living outside tests/ never run in their pipeline. It is committed but inert in CI; we run it by hand.

Gotcha 1 (Tier 1). The marko-query vitest config is environment jsdom with setupFiles ./tests/setup.ts (the rAF and MessageChannel polyfills, which are jsdom-oriented). A node-environment SSR test must not load that jsdom setup or it will throw in node. Fix: either split into vitest projects — a jsdom project for the existing 38 CSR tests and a node project for the SSR tests with a node-safe (or empty) setup — or use a per-file environment directive on the SSR test plus a node-safe setup. Either way both still run under one test:lib, so CI picks them up together, and the existing tests are unchanged.

There is a second, separate requirement on the same path (found when the first SSR test was run). The top-level resolve.conditions (@tanstack/custom-condition) only applies to the web/client transform. A node-environment SSR test uses Vite's SSR transform, which resolves via ssr.resolve.conditions — and that does not include the custom condition by default. query-core gates its source behind @tanstack/custom-condition, while query-test-utils exposes its source unconditionally, which is why only query-core fails in SSR: it falls back to its import entry (./build/modern, unbuilt) and Vite reports "Failed to resolve entry for @tanstack/query-core." Fix: add an ssr.resolve.conditions block to vitest.config.ts mirroring the client one (conditions: ["@tanstack/custom-condition"]). This affects only SSR resolution; the jsdom/web tests are unchanged. Note the per-file environment directive is sufficient to select node env and the SSR transform, but this resolve condition is a distinct, additional requirement — selecting the SSR transform and resolving condition-gated workspace packages within it are two separate things.

Gotcha 2 (Tier 3). Keeping Playwright out of CI is easy (above), but test:knip runs with --treat-config-hints-as-errors and will almost certainly flag playwright (and the e2e entry file) as unused, since nothing in the known graph references them — which would fail the knip step in CI. Fix: register the e2e script as a knip entry and/or mark playwright used in the knip config. Calling it out because it is the kind of thing that fails CI silently otherwise.

Honest note (Tier 2). This is the real-work tier. It follows the proven runtime-tags create-browser plus coordinated-compile recipe, but the build coordination — shared registry ids, the exact thing the standalone sandbox got wrong — is the part most likely to need a round or two of running it and pasting errors back, since Claude does not execute code in this setup. It will also add a devDep or two scoped to tests (jsdom-context-require, and rollup / @marko/compiler if they are not already in the tree).


====================================================================
5. EXECUTION SEQUENCE (REFINED) AND CURRENT STATUS
====================================================================

Status as of this entry: Tier 1 and Tier 2a are both in and green. The package now has 41 passing tests — the original 38 client-mount tests, two node-environment Tier 1 SSR tests, and one node-environment Tier 2a resume test. The two Tier 1 tests are the RED crash reproduction (server render rejects with "Unable to serialize", which both proves the SSR/html transform is active and reproduces the diagnosed crash inside the monorepo) and the dehydrate/hydrate round-trip. The Tier 1 RED test closes the one open question carried in marko-query-current-state: the SSR serialization break was confident but never demonstrated on this code, and now it is. The product is still broken by design pre-refactor; the RED test simply locks it down. The GREEN half of Tier 1 lands with the refactor. The Tier 2a resume test (the counter resumes in jsdom and its click handler attaches) is the mechanism proof; getting it to pass surfaced a real Marko 6.1.x resume behavior, written up in full in section 6 below. Step 3 (the provider/consumer refactor) is applied and the suite is green at 41 tests; its pre-flight is in section 7 and its outcome — the queryClient crash confirmed fixed, the integration fixture migrated off let-global, and the queryFn-prop serialization finding — is in section 8. Writing the Tier 1 GREEN tests against a clean inline-queryFn fixture, and retiring the crash-repro, is the active next step.

Refined order. Section 4 lists the tiers; this is the actual execution sequence, refined for one dependency reality: Tier 2's real payoff (the resume GREEN proof) needs the refactor to exist, because against the current code the server render just throws and there is nothing to resume. So Tier 2 splits in two and the refactor sits between the halves:

Step 2a — the harness mechanism. DONE and green; see section 6 for the full resolution. create-browser plus the coordinated server-html / client-dom compile, proven with a trivial fixture (a counter that resumes and becomes interactive). Mechanism only, independent of the adapter. This is the build-coordination time sink (shared registry ids) and the part most likely to need iteration. Doing it now de-risks the hardest piece before touching the adapter. Adds test-only devDeps. One deviation from the plan as written in sections 3 and 4: it was built with @marko/compiler/register directly (the runtime-tags recipe), not @marko/vite. Register under one shared config achieves the same registry-id alignment without pulling Vite's plugin into the test, and it is what Marko's own runtime-tags harness uses; section 6 covers this.

Step 3 — the refactor (provider creates the client in onMount; consumers read $global directly; query gains the read-only server cache-read). This also flips the Tier 1 RED test to its GREEN form (SSR render completes without a serialization error) and lets the Tier 1 GREEN todos be filled (server-renders-data, no-clobber).

Step 2b — the adapter resume assertions, written once against the refactored code: server-render-then-resume shows the data with no loading flash, no refetch when the hydrated data is still fresh (the 5.101 syncData behavior), and infinite-query resumes correctly.

Step 2c — the subscription-cleanup probe (section 2), as its own micro-step rather than folded into the refactor. Instrument live observer subscriptions across several key changes plus an unmount and confirm the count holds at one during changes and drops to zero after unmount. It depends only on the refactored consumers (Step 3) and a CSR mount context, not on Step 2b, so its slot here is for convenience; it can run any time after Step 3.

This keeps the Tier-2-before-refactor ordering for the mechanism while building the adapter resume assertions once, in final form, against working code. After 2b and 2c are green, Tier 3 (the Playwright dev tool) and the Phase 4 examples app follow.

Reconciling with the Phase 2 step list (section 3). The refined tiers above cover Steps 1 to 3 plus the test-writing of Step 5, and fold two section-3 steps in implicitly. Step 4 (wire the dehydrate/hydrate flow: the route handler prefetches, puts the client on $global so the cache-read can read it, and dehydrates to __tanstack_dehydrated; the provider's onMount, already built in Step 3, hydrates from it) is the prerequisite for the server-renders-data and no-flash assertions, so it lands just before those tests — with Step 3's GREEN tests and with 2b — rather than as its own tier. Step 5 (the SSR tests) is realized across Step 3's Tier 1 GREEN tests and 2b's resume assertions. So in tier terms: Step 4 is the prefetch/transfer plumbing done immediately before the tests that need it, and Step 5 is those tests.


====================================================================
6. TIER 2a RESUME MECHANISM — RESOLVED, AND THE MARKO 6.1.x BOUNDARY-READY FINDING
====================================================================

Status: done and green. Tier 2a is in. The package has 41 passing tests — the 40 above plus one node-environment resume test (tests/ssr-resume.test.ts) that server-renders a trivial counter, resumes it in jsdom, and proves the click handler is attached (count 0 after resume, count 1 after click). The harness files are tests/utils/create-browser.ts, tests/fixtures/ssr-counter.marko, and tests/ssr-resume.test.ts. This is the mechanism proof the refined sequence (section 5) calls 2a; it de-risks the resume coordination before the adapter refactor.

How the harness works (final shape). It does not import the fixture through Vitest. It compiles the fixture itself with @marko/compiler/register — output html for the server side, output dom for the client side — under one shared, non-optimized compiler config, exactly like Marko's own runtime-tags test harness (runtime-tags/src/__tests__/main.test.ts). The server side renders to HTML chunks via template.render(); create-browser writes those chunks into a jsdom document (the inline bootstrap script runs as it is parsed and populates window.M, the resume registry); the client side is required into the same jsdom context; then the runtime resumes. Compiling both sides with the same auto-discovered translator is what keeps the server and client registry ids aligned — the coordination the earlier standalone sandbox got wrong. Note this is a deviation from sections 3 and 4, which anticipated an @marko/vite harness: register under one shared config gives the same id alignment without Vite's plugin in the test, and it is the runtime-tags approach.

Getting resume to actually run took two non-obvious things. The first was suspected earlier; the second was the real blocker and is a genuine Marko 6.1.x behavior, not a harness mistake.

Finding 1 — the dom runtime import path must be marko/debug/dom, not marko/dom. A non-optimized compile (no optimize flag) emits require("marko/debug/dom") inside the compiled template (the html side emits marko/debug/html). The runtime instance that init/run drive has to be the same module instance the compiled template registered its scripts into; marko/dom and marko/debug/dom resolve to different files (dist/dom.js vs dist/debug/dom.js) and are therefore different instances with separate resume registries. Requiring marko/dom while the template uses marko/debug/dom means init drives an empty registry and resume silently does nothing. This was verified positively, not just inferred: mounting the template fresh through marko/debug/dom fires the runtime's _on and attaches the handler, which proves the instance is shared and the binding path works. So this fix was necessary — but on its own it did not make resume run, which led to finding 2.

Finding 2 (the real blocker) — Marko 6.1.x gates resume behind a per-render boundary that must be marked ready. The published runtime adds a mechanism the runtime-tags source we had been reading predates, so reading that source actively misled us. Three facts, all confirmed against the built dist/debug/dom.js:
- The translator emits a boundary into the page alongside the resume data: window.M[renderId].b = { "the/entry/template.marko": 1 }.
- The dom runtime's resume step (render.m) checks a module-level readyLookup at the very top. For each template id in that render's boundary, if readyLookup[id] is not exactly 1, it defers the resume (parks a callback) and returns an empty effect list. Empty effects means the onClick-binding script never runs, the handler never attaches, and the click is a silent no-op with no error — exactly the symptom we kept seeing (window.M populated, init called, no throw, click does nothing).
- The only thing that sets readyLookup[id] = 1 is an internal ready() function, and ready() is called from exactly one place in the runtime: the exported initEmbedded(readyId, runtimeId), which marks readyId ready and then calls init(runtimeId). In a real build the bundler-generated client entry marks each template ready as its code loads; under @marko/compiler/register there is no such entry, so nothing ever marks the boundary ready and the resume defers forever.

The fix. Read the entry template id out of the boundary and call initEmbedded(entryId, runtimeId) instead of init(). Concretely, after streaming: renderId = Object.keys(window.M)[0]; entryId = Object.keys(window.M[renderId].b)[0]; initEmbedded(entryId, "M"). runtimeId is "M" (Marko's DEFAULT_RUNTIME_ID) because the server render did not set a custom $global.runtimeId. With this, the counter resumes (count 0, then count 1 after click).

It generalizes — important for 2b. The boundary lists only the ENTRY template, not nested or imported components. Verified with a parent fixture that imports a child component twice: the boundary still contained only the parent template, and marking just the parent ready resumed the entire tree — both child instances became interactive with their handlers wired. So reading the single boundary key and calling initEmbedded on it is the correct general resume trigger for the adapter fixtures too (a page using query-client-provider and query tags), not a counter-only trick. The harness reads the id generically from the boundary rather than hardcoding a fixture path.

The caveat to carry forward. initEmbedded sets an internal embedEnabled flag, and its name points at Marko islands / microfrontend embedding rather than full-page resume. In every local run the resumed DOM and the post-interaction behavior were correct (including the two-child case), and it is the only exported entry point that does the ready-then-init pairing, so it is being treated as the intended way to drive resume without a bundler. The flag's only observed effect in the runtime is inserting an extra trailing text node as a boundary marker, harmless to the textContent-based assertions these tests use. If a more complex fixture in 2b ever shows a stray-node surprise traceable to embedEnabled, the fallback is to generate a tiny client entry that calls the internal ready() for the boundary template(s) and then init() — i.e. replicate what the bundler does — rather than initEmbedded. Not expected to be necessary.

Method note for future sessions. This was resolved by reproducing the whole harness locally in a throwaway sandbox (a fresh install of marko 6.1.2, @marko/compiler, @marko/translator-tags, jsdom, jsdom-context-require) and instrumenting the real built runtime — wrapping the exported _on to test whether the binding ran, mounting fresh to prove the instance was shared, then reading dist/debug/dom.js directly to find the readyLookup guard and the ready/initEmbedded path. The general lesson: for resume-internals questions, instrument the BUILT runtime that ships in the installed marko version, not just the runtime-tags source — the two have diverged (the readyLookup boundary mechanism is in the built runtime and absent from the source snapshot we were reading), and trusting the source alone sent the diagnosis in the wrong direction for a while. The local-reproduction approach also means this class of question can be settled without round-tripping through the maintainer's machine.


====================================================================
7. STEP 3 PRE-FLIGHT — FILE CONFIRMATION AND THE onMount ORDERING CHECK
====================================================================

Done before writing the refactor: read the four tag files as they actually stand on the rebased 5.101 tree, confirmed the session-2 refactor spec maps onto them with no drift, and resolved the one real risk in the spec (the onMount ordering) empirically rather than by assumption.

File confirmation (no drift). All four files are exactly as the spec describes.
- query-client-provider/index.marko: a plain (server+client) import of QueryClient on line 8; the render-time client-creation IIFE on lines 13-19 (new QueryClient, c.mount(), assign to ($global ?? {}).__tanstack_queryClient, return undefined); the let-global line on 21 (let-global/queryClient from __tanstack_queryClient); an onDestroy lifecycle on 23-32 that reads the client off $global, clears the key, sets the let-global binding queryClient to undefined, and calls c.unmount(); then renders <${input.content}/>.
- query, mutation, infinite-query: each has its client import (QueryObserver / MutationObserver / InfiniteQueryObserver) on line 5, the let-global line on line 7, a static pending/idle result object plus a _makeRef, the <let> result and <let> _ref, then a <script> that reads the queryClient binding (the let-global value) and creates/updates the observer with $signal.onabort tearing down the subscription, then <return>.

So the refactor maps on cleanly: provider line 8 becomes a client import; lines 13-19 and 21 are removed; an onMount is added that creates and mounts the client, sets it on $global, and hydrates if $global already carries dehydrated state; onDestroy reads $global directly. Each consumer drops line 7 and reads ($global ?? {}).__tanstack_queryClient at the top of its existing script.

The onDestroy detail (compile-level, not optional). The current onDestroy references queryClient (the let-global return binding) on line 28. That binding disappears when line 21 is removed, so the refactored onDestroy must read the client from $global and clear the key without touching any queryClient variable, or the provider will not compile.

The onMount ordering — the one real risk, verified favorably. The current code is correct only because the render-time IIFE sets $global before children render; the query tag states this in a comment on line 45. The refactor moves creation into onMount, so correctness now depends on the provider's onMount running before the consumers' scripts. Tested directly in a marko 6.1.2 sandbox (the same local-reproduction setup from section 6), not inferred: a provider that sets $global in onMount, wrapping a consumer that reads $global in its script and reports whether the value is defined. The consumer saw the value present both as a direct child and nested two components deep. So an ancestor's onMount runs before any descendant's script, at arbitrary depth, and the 38 CSR tests will stay green through the refactor.

Secondary observation (not load-bearing). The raw CSR mount effect order, on a parent carrying both onMount and script wrapping a child carrying both script and onMount, came out as: parent onMount, parent script, child script, child onMount. The within-component order differs between parent and child, which is exactly why the decisive check above reads $global directly rather than trusting effect-log order. It does not affect the refactor, since the provider creates the client in onMount (the earliest of these) and the consumers read in their scripts (all of which run after the provider's onMount).

Scope of what this confirms. This is CSR mount ordering — what keeps the 38 client-mount tests green through the refactor. Resume-time effect ordering (whether the provider's onMount precedes the consumers' scripts on resume, not only on fresh mount) is a Tier 2b question, to be checked against the resume harness after the refactor exists. It does not block writing the refactor, and the read-$global-directly approach is identical either way; if resume ordering ever turned out wrong, the fix would live in the consumer (re-read on the relevant signal) rather than in the spec's shape.


====================================================================
8. STEP 3 OUTCOME — THE queryClient CRASH IS FIXED, AND THE queryFn-PROP SERIALIZATION FINDING
====================================================================

Status: Step 3 is applied and the suite is green at 41 tests. The four refactored tag files went in (provider plus the three consumers), and one test fixture had to be migrated off the old client channel. tests/fixtures/integration.marko was reading the client through let-global (qc, from __tanstack_queryClient) for the mutation's onSuccess invalidation. The refactor stopped the provider feeding let-global, so qc was undefined and qc?.invalidateQueries silently no-opped — the mutation succeeded but the query never refetched (one fetch instead of two; the only red in the run). Fixed by reading ($global ?? {}).__tanstack_queryClient directly inside onSuccess; that nested-callback $global read was verified in the sandbox. The lesson generalizes: any code that reached the client through let-global must now read $global directly, because let-global is no longer the client channel.

The queryClient crash is genuinely fixed — confirmed, not assumed. Rendering the refactored query-with-provider server-side in the sandbox no longer throws on the queryClient. The refactor (client import of QueryClient, creation moved to a browser-only onMount, consumers reading $global directly instead of through a let-global that held the client in serialized scope) removed the path that put a live QueryClient into Marko's serialized scope. That was the actual code fix, and it is done.

The separate finding — a function passed as a prop cannot be SSR-serialized, and this is NOT an adapter bug. The same sandbox render now throws "Unable to serialize input.queryFn" instead. The cause is unrelated to the queryClient: the test fixtures pass queryFn (and the options getter) in as function props, the query's options closure captures that function, and Marko cannot serialize a runtime function across resume. This is a general Marko constraint, not adapter-specific — a function written inline in a template is compiled code and resumes fine, but a function arriving as a runtime prop is a value Marko must serialize, and it cannot. In real use queryFn is written inline in the .marko template, so this never arises; it shows up only because the fixtures pass queryFn as a prop for test flexibility. So there is nothing to fix in the adapter here — the fix is to write the SSR test fixtures with an inline queryFn, which is also how real code is written.

Why this matters for the crash-repro test, and its retirement. The crash-repro test (ssr.test.ts, "crashes serializing the QueryClient on server render") asserts the render rejects with /Unable to serialize/. After the refactor it still passes — but for the wrong reason: the regex is broad enough to match the queryFn-prop error, masking the fact that the queryClient error is gone. The move is to retire it, not flip it. The queryClient crash it documents is now unreproducible (the code that caused it was removed), so there is nothing left to assert there. Its honest replacement is the no-serialization-error GREEN test, run against a clean fixture with an inline queryFn.

Consequence for the Tier 1 GREEN tests. The SSR fixtures the GREEN tests use must define queryFn inline (not take it as a prop), or they trip the queryFn-prop serialization instead of proving the queryClient path is clean. server-renders-data is otherwise unaffected, because its data comes from the prefetched cache via the cache-read rather than from calling queryFn — the inline queryFn only needs to exist for the observer, not be called during the server render.


====================================================================
9. THE RESUME-ORDERING FINDING — CONSUMER EFFECT RUNS BEFORE PROVIDER EFFECT, SO AN SSR'd QUERY IS INERT AFTER RESUME
====================================================================

What was tested. Using the Tier 2a SSR->resume harness (server render to HTML, mount in jsdom, resume via initEmbedded on the boundary), a provider+query fixture was rendered with a server-prefetched client on $global -- the cache-read puts the data in the SSR HTML -- then resumed, and the client-side behavior observed. The fixture's inline queryFn increments a window counter and returns a sentinel ["CLIENT-REFETCHED"], with staleTime Infinity, so any client-side fetch is detectable.

The observation. After resume the query shows the server data ["a","b"] with zero client refetch (counter 0), in BOTH the with-dehydrated-cache and without-dehydrated-cache cases. The dehydrated cache makes no difference. The query is not live: it is displaying the resumed SSR value and never created a client observer.

The root cause, proven by instrumentation. Counters added to the provider's onMount and the consumer's <script> show BOTH run on resume (count 1 each), so effects do fire on resume -- the earlier "effects do not run" guess was wrong. But a sequence probe shows the resume order is [CONSUMER_script, PROVIDER_onMount]: the consumer (child) runs its effect BEFORE the provider (parent). At that moment $global.__tanstack_queryClient is not yet set (the provider sets it), so the consumer's guard (queryClient and not ref.observer) is false, it skips observer creation, and -- because the <script> is reactive only to input.options, not to $global -- it never re-runs to pick the client up. The query stays inert. On a normal client mount the order is the reverse (provider onMount before consumer script), which is why all 38 CSR tests pass; resume inverts it.

It is not an effect-type artifact. Rewriting the provider to create the client in a <script> (the same effect kind as the consumer) instead of onMount did NOT change the order: still [CONSUMER_script, PROVIDER_script]. So this is not script-vs-onMount phasing. On resume Marko runs descendant effects before ancestor effects (leaf-first), independent of effect kind. A child therefore cannot observe a parent-effect side effect (like "client placed on $global") during its own resume effect.

Why this is bigger than the RED tests. The entire $global client-handoff -- provider creates the client in an effect, consumers read it from $global in an effect -- depends on the parent effect running before the child effect. That holds on mount and is reversed on resume. So as the code stands, an SSR'd query is inert after resume: the server HTML is shown but the query never goes live (no observer; it would not react to invalidation or refetch). This is a core Phase 2 problem, not a test-only one.

Why the three RED tests are on hold. no-flash, no-refetch-when-fresh, and infinite-resume all assume a LIVE observer on resume -- they assert what a live observer does or does not do with hydrated data. In this harness the observer is inert, so all three would fail, but for this ordering reason, not for the intended reason (the dehydrated cache not crossing the serialized-globals boundary, which Step 4 fixes). A RED test that fails for the wrong cause is worse than no test: Step 4 would not turn it green and it would mask the real issue. So they are not written yet.

What is still unknown. Whether this leaf-first resume order is how Marko resumes in a real browser (a real bundler-generated client entry) or whether it is specific to the initEmbedded islands path this jsdom harness uses cannot be settled in jsdom. Confirming real-browser resume order needs Tier 3 (Playwright, real Chromium). Two outcomes: if the real order is also leaf-first, the client handoff must be made order-independent -- candidates: a structural provide/consume that resolves by tree position rather than effect timing (if it can avoid the serialization crash the original let-global hit), or a model where whichever effect runs first creates and hydrates the client and the provider's onMount is reduced to teardown. If the real order is parent-first, the jsdom harness simply cannot exercise resume liveness and the three tests belong in Tier 3 regardless.

Unaffected: no-clobber. The no-clobber test (provider.test.ts P6) is a client-mount test, where the order is parent-first, so it is correct and unaffected by this finding.


====================================================================
10. RESUME-ORDERING — CLARIFICATIONS, MENTAL MODEL, AND THE DECISION TREE (Q&A)
====================================================================

This section captures the follow-up Q&A on the section 9 finding so the mental model and the plan are not lost. Section 9 is the finding and the evidence; this is the interpretation and the plan.

TWO SEPARATE PROBLEMS -- DO NOT CONFLATE.
Problem A (what Step 4 is for): getting the cached data to travel from the server to the browser, so the resumed query does not have to refetch. This is data plumbing -- dehydrate on the server, put the JSON on a serialized $global key, hydrate on the browser.
Problem B (the section 9 finding): the query goes inert on resume -- it shows the server HTML but never becomes a live query (no observer, no refetch, no reaction to invalidation). Problem B sits underneath Problem A: if the query is inert, it does not matter whether the data crossed.
Step 4 does NOT fix Problem B. They are independent. Step 4 addresses A only. This was the explicit question asked and the explicit answer.

IS THIS EXPECTED / CORRECT BEHAVIOR? No. A query should stay live after the page loads. Inert is wrong.

DID WE IMPLEMENT SOMETHING INCORRECTLY? Not a typo and not broken logic -- the logic is correct, and it is the same logic that makes all 38 CSR tests pass. The issue is the METHOD chosen to hand the client from provider to consumer: the provider puts the client on a shared spot ($global) in an effect, and the consumer reads it from there in an effect. That works on a normal mount and is reversed on resume. So it is a design assumption that resume breaks, not a coding mistake.

WHY RESUME FLIPS THE ORDER (the mental model).
On a normal client load the browser builds the component tree from scratch, top-down: parent first, then children. So the provider (parent) runs first and sets up the client, then the consumer (child) reads it. Order: parent, then child.
On resume the page already exists as server-rendered HTML. The browser does not rebuild it; it wakes up the existing HTML from the inside out -- innermost pieces first, then outward. So the consumer (inner) wakes before the provider (outer). Order: child, then parent. This inside-out wake-up is how resumable frameworks attach behavior to HTML that is already on the page: the interactivity lives at the leaves, so the leaves are resumed first. This was proven in jsdom (section 9): the order was [CONSUMER, PROVIDER] for BOTH the onMount variant and the script variant, so it is leaf-first regardless of effect kind, not a script-vs-onMount phasing quirk.

HOW THE HANDOFF WOULD BE FIXED (only if Problem B proves real in a real browser).
The core requirement: the consumer must not depend on the provider having run first. Two candidates.
(1) First-one-in wins (preferred, smallest change): whichever effect runs first -- consumer or provider -- creates AND hydrates the client. The provider stops being the sole creator and is reduced to teardown/ownership. On resume the consumer wakes first, so it creates and hydrates the client itself; on mount the provider wakes first and does it; whoever runs second finds the client already present (the existing no-clobber guard already handles this) and reuses it. Hydration must move to whoever creates the client, so the fresh client is hydrated before its observer reads it.
(2) Marko structural provide/consume: pass the client through Marko's parent-to-child tree mechanism, which resolves by position in the tree rather than by effect timing. Risk: this is close to what the original let-global did, which caused the SSR serialization crash, so the provided value would have to be made browser-only to avoid re-introducing that crash.
The choice between (1) and (2) is deferred until the real-browser order is known.

WHERE THE REAL-BROWSER TEST RUNS.
It is handed to DS to run, not run in Claude's sandbox. Claude's sandbox only has the fake browser (jsdom) -- the exact thing not trusted here -- and cannot download a real Chromium (its network is restricted to code registries only). The real-browser test needs Playwright with real Chromium and a real bundler (@marko/vite), so that resume runs the way it does in production. Claude writes the test; DS runs it on his machine.

THE DECISION TREE (what each outcome means and the next step).
If the real-browser test PASSES (the resumed query stays live -- it reaches success on the client on its own): the adapter code is fine and jsdom was misleading. The consequence is that jsdom cannot be trusted for resume liveness, so the three resume tests (no-flash, no-refetch-when-fresh, infinite-resume) move to Tier 3 (Playwright), where resume works correctly. Step 4 proceeds as planned.
If the real-browser test FAILS (the resumed query stays inert in a real browser too -- it never leaves pending): Problem B is a real bug. Fix the handoff (candidate 1 or 2), re-confirm in the real browser that the resumed query is live, then write the three resume tests. Step 4 is still needed separately for Problem A (the data crossing).
Either outcome: the three resume tests likely end up as Tier 3 (real-browser) tests, because jsdom cannot be trusted for resume.

ORDER OF WORK. Confirm the real-browser behavior first, then fix the handoff if needed, then write the three resume tests against a live observer. Do not write the resume tests before the query is confirmed live in a real browser -- there is nothing live to assert against otherwise. This is why the three RED tests are deferred behind this test.

HOW THE REAL-BROWSER TEST DIAGNOSES B (the mechanism of the test itself).
The cleanest single diagnostic for "did the observer activate on resume" is a query that is PENDING on the server: server-render with no prefetched data so the SSR HTML shows pending, then load in a real browser and wait. A LIVE observer starts fetching on the client, the queryFn resolves, and the DOM updates to success with data. An INERT query (no observer created) stays pending forever. So the test asserts the status becomes success after load. If the adapter is fine, the assertion passes; if Problem B is real, the status is stuck pending and the assertion fails -- which is the signal wanted. This diagnostic deliberately does NOT involve dehydration, so it isolates Problem B from Problem A (Step 4).


====================================================================
11. REAL-BROWSER TEST RESULT — PROBLEM B IS CONFIRMED REAL
====================================================================

Outcome. The Tier 3 real-browser probe (e2e/, Playwright + real Chromium + @marko/vite SSR)
returned: resumed=yes, status=pending, data="". The page resumed (the query-independent
resume marker flipped to "yes", so client JS ran) but the query stayed inert (status never
left pending, no client fetch). This is Problem B, confirmed in a real browser -- it is NOT
a jsdom artifact. The leaf-first resume ordering (consumer effect before provider effect)
holds in real Chromium too: the consumer sees no client on $global and never creates an
observer.

(The console errors in the run -- a WebSocket to ws://localhost:24678 failing -- are vite's
HMR client failing to connect because HMR is disabled in the e2e server. They are harmless
and unrelated to the query.)

This resolves the section 10 decision tree on the FAIL branch: the client handoff must be
made order-independent before the resume tests can be written. Step 4 (dehydration) remains
a separate, later task.

The e2e harness setup hurdles (resolved; recorded so the harness can be re-run). Getting the
real-browser test to actually exercise resume took three fixes, all in the harness, none in
the adapter: (1) the dev server must load a JS entry (e2e/src/index.js) that imports the
page, NOT ssrLoadModule the .marko page directly -- only the JS-entry path gets @marko/vite's
server-entry treatment that injects the browser script tags, without which the page renders
but never resumes; (2) the e2e vite config must set resolve.conditions
["@tanstack/custom-condition"], because query-core has no built output and exposes its source
only through that condition (the package's own vitest config sets the same; the server side
never needed it because the query-core import is client-only and stripped on the server);
(3) the render must consume Marko 6's async-iterable render(input) stream (for await over the
chunks, res.write each, res.end), since render(input, res) does not drive the stream here and
the response hangs.

Status. The handoff fix is the active task. Two approaches were identified (section 10):
(a) a reactive shared value -- the provider still creates, owns, and hydrates the client in
its effect but exposes it as a reactive value the consumer reads, so when the provider sets
it the consumer's effect re-runs and creates the observer (clean ownership; the client is
undefined during SSR so nothing problematic serializes; needs a reactive parent-to-child
channel in Marko v6); (b) first-one-in-wins -- whichever effect runs first creates and
hydrates the client, with the provider reduced to teardown (robust to ordering, but the
provider's defaultOptions config propagation and ownership/teardown need a shared path).
Lean is (a).


End of session 3 working notes (current entries).