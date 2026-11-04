// The reason of an abort is whatever the client sent, often a string, or nothing: a caller gets an error
const gaveUp = () => new Error("The caller gave up while it waited for its turn");

// One task at a time, in the order they arrive. A caller that gives up while it waits leaves the line
// at once, so it never runs and holds up no one. A task that fails passes the turn like any other, and
// its failure stays with its caller.
//
// A waiting caller hears how many tasks are ahead when it starts to wait, whenever the line moves, and
// every `reportEveryMs` while it does not: a client can restart its timeout on each report, and a task
// ahead can take minutes.
export function createQueue({ reportEveryMs = 5000 } = {}) {
  const waiting = [];
  let taken = false;

  // A report is a courtesy: one that fails, as one to a client that left, changes nothing
  const report = async ({ onWait }, ahead) => {
    try {
      await onWait?.(ahead);
    } catch {
      // nothing to tell, and no one to tell it to
    }
  };
  const reportAll = () => waiting.forEach((waiter, i) => report(waiter, i + 1));

  function take({ signal, onWait }) {
    if (signal?.aborted) return Promise.reject(gaveUp());
    if (!taken) {
      taken = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter = { onWait };
      const leave = () => {
        waiting.splice(waiting.indexOf(waiter), 1);
        clearInterval(timer);
        signal?.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        leave();
        reject(gaveUp());
        reportAll();
      };
      waiter.enter = () => {
        leave();
        resolve();
      };
      const timer = setInterval(() => report(waiter, waiting.indexOf(waiter) + 1), reportEveryMs);
      // The timer alone must not keep the process alive
      timer.unref?.();
      signal?.addEventListener("abort", cancel, { once: true });
      waiting.push(waiter);
      report(waiter, waiting.length);
    });
  }

  function pass() {
    taken = waiting.length > 0;
    waiting[0]?.enter();
    reportAll();
  }

  async function run(task, options = {}) {
    await take(options);
    try {
      return await task();
    } finally {
      pass();
    }
  }

  return { run };
}
