import {
  attachActor,
  currentRequestContext,
  runWithRequestContext,
} from "../request-context.store.js";

/**
 * Le porteur ALS du contexte de requête. Invariants : un contexte n'existe que
 * dans le `run`, il suit le flux async, deux requêtes sont isolées, et l'acteur
 * démarre `system` puis se renseigne une fois (le guard, après l'ingress).
 */
describe("request-context store", () => {
  const NOW = new Date("2026-08-07T10:00:00.000Z");

  it("expose le contexte à l'intérieur du run", () => {
    runWithRequestContext({ now: NOW, traceId: "trace-1" }, () => {
      const context = currentRequestContext();
      expect(context).not.toBeNull();
      expect(context?.now).toBe(NOW);
      expect(context?.traceId).toBe("trace-1");
    });
  });

  it("n'expose aucun contexte hors d'un run", () => {
    expect(currentRequestContext()).toBeNull();
  });

  it("démarre avec un acteur `system` par défaut", () => {
    runWithRequestContext({ now: NOW, traceId: "t" }, () => {
      expect(currentRequestContext()?.actor).toEqual({ type: "system", id: null });
    });
  });

  it("prend l'acteur fourni dans la graine s'il est présent", () => {
    const actor = { type: "customer", id: "user_1" } as const;
    runWithRequestContext({ now: NOW, traceId: "t", actor }, () => {
      expect(currentRequestContext()?.actor).toEqual(actor);
    });
  });

  it("attache l'acteur résolu après coup (le principal arrive après l'ingress)", () => {
    runWithRequestContext({ now: NOW, traceId: "t" }, () => {
      attachActor({ type: "customer", id: "user_42" });
      expect(currentRequestContext()?.actor).toEqual({ type: "customer", id: "user_42" });
    });
  });

  it("suit le flux asynchrone : le contexte survit à un await", async () => {
    await runWithRequestContext({ now: NOW, traceId: "async-trace" }, async () => {
      await Promise.resolve();
      expect(currentRequestContext()?.traceId).toBe("async-trace");
    });
  });

  it("isole deux requêtes concurrentes (pas de fuite de contexte)", async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithRequestContext({ now: NOW, traceId: "A" }, async () => {
        await Promise.resolve();
        seen.push(currentRequestContext()?.traceId ?? "none");
      }),
      runWithRequestContext({ now: NOW, traceId: "B" }, async () => {
        await Promise.resolve();
        seen.push(currentRequestContext()?.traceId ?? "none");
      }),
    ]);
    expect(seen.sort()).toEqual(["A", "B"]);
  });

  it("attachActor hors requête est un no-op (pas d'erreur)", () => {
    expect(() => attachActor({ type: "staff", id: "s" })).not.toThrow();
    expect(currentRequestContext()).toBeNull();
  });
});
