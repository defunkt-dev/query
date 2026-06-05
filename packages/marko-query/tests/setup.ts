/**
 * Marko scheduler polyfills for jsdom.
 *
 * Marko's scheduler (schedule.ts) uses: queueMicrotask → requestAnimationFrame → MessageChannel.
 * jsdom's default implementations of rAF and MessageChannel are unreliable —
 * rAF may never fire, and MessageChannel may not integrate with the event loop correctly.
 *
 * Marko's own test infrastructure (runtime-tags/src/__tests__/utils/create-browser.ts)
 * polyfills both. We replicate the exact same polyfills here.
 *
 * Without these, isScheduled (module-level flag in schedule.ts) gets stuck at 1
 * after the first test that triggers schedule(), causing all subsequent schedule()
 * calls to be no-ops — renders queue but never process.
 */

// Polyfill requestAnimationFrame: batch callbacks, fire via setTimeout (next macrotask)
if (typeof window !== "undefined") {
  let queue: FrameRequestCallback[] | undefined;
  (window as any).requestAnimationFrame = function requestAnimationFrame(
    fn: FrameRequestCallback,
  ) {
    if (queue) {
      queue.push(fn);
    } else {
      queue = [fn];
      setTimeout(() => {
        const timestamp = performance.now();
        const batch = queue!;
        queue = undefined;
        for (const fn of batch) {
          fn(timestamp);
        }
      });
    }
    return 0;
  };

  // Polyfill MessageChannel: postMessage → setImmediate → queueMicrotask
  (window as any).MessageChannel = class MessageChannel {
    port1: any;
    port2: any;
    constructor() {
      this.port1 = { onmessage() {} };
      this.port2 = {
        postMessage: () => {
          setImmediate(() => {
            window.queueMicrotask(this.port1.onmessage);
          });
        },
      };
    }
  };
}