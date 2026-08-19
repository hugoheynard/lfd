import { heartbeatSchema, lifecycleEventSchema } from "../index.js";
import { createOpsReporter, type OpsSignal } from "../index.js";
import { errorRate, isSilent, type TrafficCounts } from "../index.js";

describe("ops-contract schemas", () => {
  it("accepte un heartbeat minimal et refuse un errorRate hors bornes", () => {
    expect(
      heartbeatSchema.safeParse({ node: "pim.sync", at: "2026-01-01T00:00:00Z", status: "up" })
        .success,
    ).toBe(true);
    expect(
      heartbeatSchema.safeParse({
        node: "pim.sync",
        at: "2026-01-01T00:00:00Z",
        status: "up",
        metrics: { errorRate1m: 1.5 },
      }).success,
    ).toBe(false);
  });

  it("refuse un kind d'event inconnu", () => {
    expect(lifecycleEventSchema.safeParse({ node: "n", at: "t", kind: "job.ok" }).success).toBe(
      true,
    );
    expect(
      lifecycleEventSchema.safeParse({ node: "n", at: "t", kind: "job.exploded" }).success,
    ).toBe(false);
  });
});

describe("createOpsReporter", () => {
  function recorder() {
    const signals: OpsSignal[] = [];
    return {
      signals,
      sink: (signal: OpsSignal): Promise<void> => {
        signals.push(signal);
        return Promise.resolve();
      },
    };
  }

  it("remplit node + horodatage et produit un heartbeat valide", async () => {
    const rec = recorder();
    const ops = createOpsReporter({
      node: "pim.sync-shopify",
      sink: rec.sink,
      now: () => "2026-01-01T12:00:00Z",
    });

    await ops.heartbeat("degraded", { queueDepth: 12 });

    const signal = rec.signals[0];
    expect(signal?.type).toBe("heartbeat");
    if (signal?.type === "heartbeat") {
      expect(signal.heartbeat.node).toBe("pim.sync-shopify");
      expect(signal.heartbeat.at).toBe("2026-01-01T12:00:00Z");
      expect(heartbeatSchema.safeParse(signal.heartbeat).success).toBe(true);
    }
  });

  it("émet un event corrélé", async () => {
    const rec = recorder();
    const ops = createOpsReporter({
      node: "pim.sync-shopify",
      sink: rec.sink,
      now: () => "t",
    });

    await ops.event("job.failed", { ref: "job_42", message: "boom" });

    const signal = rec.signals[0];
    expect(signal?.type).toBe("event");
    if (signal?.type === "event") {
      expect(signal.event.kind).toBe("job.failed");
      expect(signal.event.ref).toBe("job_42");
      expect(lifecycleEventSchema.safeParse(signal.event).success).toBe(true);
    }
  });
});

describe("fenêtre de trafic — ce qui compte comme une erreur", () => {
  const counts = (over: Partial<TrafficCounts> = {}): TrafficCounts => ({
    requests: 100,
    serverErrors: 0,
    throttled: 0,
    gatewayFaults: 0,
    ...over,
  });

  it("compte l'erreur amont ET l'absence de réponse", () => {
    // Les deux disent « ça ne marche pas », même si elles ne disent pas la même
    // chose sur QUI est en cause.
    expect(errorRate(counts({ serverErrors: 3, gatewayFaults: 2 }))).toBeCloseTo(0.05);
  });

  it("ne compte JAMAIS les 429 comme des erreurs", () => {
    // Le throttler qui refuse est le système qui fonctionne. Les compter ferait
    // rougir la carte au moment précis où elle devrait rassurer — et pousserait
    // un jour quelqu'un à relâcher la seule défense qui marche pour « faire
    // repasser le tableau au vert ».
    expect(errorRate(counts({ throttled: 90 }))).toBe(0);
  });

  it("rend 0 sur une fenêtre vide plutôt qu'une division par zéro", () => {
    expect(errorRate(counts({ requests: 0 }))).toBe(0);
  });

  it("distingue le silence du calme", () => {
    // `isSilent` ne conclut rien : il rend la question posable. Un nœud muet ET
    // sans trafic est oisif ; muet AVEC du trafic est un tout autre sujet.
    expect(isSilent(counts({ requests: 0 }))).toBe(true);
    expect(isSilent(counts({ requests: 1 }))).toBe(false);
  });
});
