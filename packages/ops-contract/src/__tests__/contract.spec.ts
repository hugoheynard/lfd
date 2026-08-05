import { heartbeatSchema, lifecycleEventSchema } from "../index.js";
import { createOpsReporter, type OpsSignal } from "../index.js";

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
