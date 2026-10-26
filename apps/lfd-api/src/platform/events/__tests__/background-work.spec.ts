import { BackgroundWork } from "../background-work.js";

/** Une promesse qu'on règle à la main : le temps d'une tâche, tenu par le test. */
function held(): { readonly promise: Promise<void>; readonly release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("BackgroundWork.snapshot", () => {
  it("nomme chaque tâche en vol par son étiquette", () => {
    const work = new BackgroundWork();
    void work.track(held().promise, "on-company-declared-resolve-naf");
    void work.track(held().promise, "outbox.relay");

    expect(work.snapshot()).toEqual({
      pending: ["on-company-declared-resolve-naf", "outbox.relay"],
      settled: 0,
    });
  });

  it("retire une tâche terminée et compte sa fin — y compris un échec", async () => {
    const work = new BackgroundWork();
    const ok = held();
    const tracked = work.track(ok.promise, "a");
    const failed = work.track(Promise.reject(new Error("refus")), "b");
    void work.track(held().promise, "c");

    ok.release();
    await tracked;
    await failed;

    expect(work.snapshot()).toEqual({ pending: ["c"], settled: 2 });
  });

  it("whenIdle attend aussi une tâche lancée par une autre", async () => {
    const work = new BackgroundWork();
    const second = held();
    void work.track(
      Promise.resolve().then(() => {
        void work.track(second.promise, "seconde");
      }),
      "première",
    );
    const idle = work.whenIdle();
    // Un tour de boucle : la première tâche a fini et lancé la seconde.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(work.snapshot().pending).toEqual(["seconde"]);

    second.release();
    await idle;
    expect(work.snapshot()).toEqual({ pending: [], settled: 2 });
  });
});
