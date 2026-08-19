import type { NodeManifest, TrafficWindow } from "@lfd/ops-contract";

import {
  DEGRADED_ERROR_RATE,
  deriveHealth,
  HEARTBEAT_TTL_MS,
  type NodeEvidence,
} from "../derive-health.js";

/**
 * La dérivation est le seul endroit où l'on décide ce que « ça va » veut dire.
 * Chaque test ci-dessous verrouille une façon connue de se tromper — pas une
 * ligne de code.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");

const node = (over: Partial<NodeManifest> = {}): NodeManifest => ({
  id: "b2b",
  kind: "service",
  label: "API B2B",
  dependsOn: [],
  ...over,
});

const traffic = (over: Partial<TrafficWindow> = {}): TrafficWindow => ({
  node: "b2b",
  from: "2026-08-19T11:55:00.000Z",
  to: NOW.toISOString(),
  requests: 1000,
  serverErrors: 0,
  throttled: 0,
  gatewayFaults: 0,
  p95Ms: 40,
  ...over,
});

const derive = (
  nodes: readonly NodeManifest[],
  evidence: Record<string, NodeEvidence>,
): ReturnType<typeof deriveHealth> => deriveHealth(nodes, new Map(Object.entries(evidence)), NOW);

describe("la preuve l'emporte sur la déclaration", () => {
  it("conclut `down` sur un 502 de la gateway, et sur rien d'autre", () => {
    // La SEULE preuve de mort : la gateway n'a pas obtenu de réponse.
    const [health] = derive([node()], { b2b: { traffic: traffic({ gatewayFaults: 3 }) } });

    expect(health).toMatchObject({ status: "down", reason: "gateway-fault" });
  });

  it("ne conclut PAS `down` sur des 5xx du backend — il a répondu, mal", () => {
    const [health] = derive([node()], { b2b: { traffic: traffic({ serverErrors: 500 }) } });

    expect(health).toMatchObject({ status: "degraded", reason: "error-rate" });
  });

  it("dément un battement frais quand les erreurs mesurées le contredisent", () => {
    // La discipline adversariale du design : auto-déclaré contre observé, la
    // mesure gagne. Un `up` qui se déclare tout seul ne vaut rien.
    const [health] = derive([node({ expectsHeartbeat: true })], {
      b2b: {
        lastHeartbeatAt: NOW.toISOString(),
        traffic: traffic({ serverErrors: 100 }),
      },
    });

    expect(health?.status).toBe("degraded");
  });

  it("ignore les 429 dans le verdict", () => {
    // Le throttler qui mord est le système qui fonctionne. Le compter ferait
    // rougir la carte au moment où elle devrait rassurer.
    const [health] = derive([node()], { b2b: { traffic: traffic({ throttled: 900 }) } });

    expect(health).toMatchObject({ status: "up", reason: "traffic-healthy" });
  });

  it("place le seuil de dégradation là où il est écrit", () => {
    const atThreshold = traffic({ serverErrors: 1000 * DEGRADED_ERROR_RATE });
    const justBelow = traffic({ serverErrors: 1000 * DEGRADED_ERROR_RATE - 1 });

    expect(derive([node()], { b2b: { traffic: atThreshold } })[0]?.status).toBe("degraded");
    expect(derive([node()], { b2b: { traffic: justBelow } })[0]?.status).toBe("up");
  });
});

describe("le silence n'est pas la mort", () => {
  it("rend `unknown`, jamais `down`, pour un nœud attendu et muet", () => {
    // L'invariant qui interdit de crier au loup une nuit sans trafic.
    const [health] = derive([node({ expectsHeartbeat: true })], {
      b2b: { lastHeartbeatAt: null },
    });

    expect(health).toMatchObject({ status: "unknown", reason: "heartbeat-stale" });
  });

  it("ne dégrade PAS un nœud dont personne n'attendait un battement", () => {
    // Sans cette règle, tous les nœuds sans émetteur seraient éternellement
    // orange — et une carte durablement orange enseigne à ignorer sa couleur.
    const [health] = derive([node()], {});

    expect(health).toMatchObject({ status: "unknown", reason: "no-evidence" });
  });

  it("dégrade celui qui SERT mais ne rapporte plus", () => {
    const stale = new Date(NOW.getTime() - HEARTBEAT_TTL_MS - 1).toISOString();
    const [health] = derive([node({ expectsHeartbeat: true })], {
      b2b: { lastHeartbeatAt: stale, traffic: traffic() },
    });

    expect(health).toMatchObject({ status: "degraded", reason: "heartbeat-stale" });
  });

  it("accepte un battement frais comme preuve, sans trafic", () => {
    const [health] = derive([node({ expectsHeartbeat: true })], {
      b2b: { lastHeartbeatAt: NOW.toISOString() },
    });

    expect(health).toMatchObject({ status: "up", reason: "heartbeat-fresh" });
  });

  it("traite un horodatage illisible comme une absence, pas comme une fraîcheur", () => {
    const [health] = derive([node({ expectsHeartbeat: true })], {
      b2b: { lastHeartbeatAt: "hier" },
    });

    expect(health?.status).toBe("unknown");
  });
});

describe("le rouge se désigne, il ne se propage pas", () => {
  const fleet = [
    node({ id: "gateway", kind: "worker", label: "Passerelle", dependsOn: ["b2b"] }),
    node({ id: "b2b" }),
  ];

  it("nomme la dépendance tombée sans changer le statut du dépendant", () => {
    // Propager peindrait toute la carte à partir d'un incident et CACHERAIT la
    // cause au lieu de la montrer. Un nœud que le trafic prouve vivant reste
    // vivant : c'est un fait, pas une opinion.
    const health = derive(fleet, {
      gateway: { traffic: traffic({ node: "gateway" }) },
      b2b: { traffic: traffic({ gatewayFaults: 5 }) },
    });
    const gateway = health.find((entry) => entry.node === "gateway");

    expect(gateway?.status).toBe("up");
    expect(gateway?.dependencyDown).toBe("b2b");
  });

  it("n'annote rien quand toutes les dépendances tiennent", () => {
    const health = derive(fleet, {
      gateway: { traffic: traffic({ node: "gateway" }) },
      b2b: { traffic: traffic() },
    });

    expect(health.find((entry) => entry.node === "gateway")?.dependencyDown).toBeUndefined();
  });
});

describe("la carte est complète", () => {
  it("rend TOUS les nœuds déclarés, y compris ceux dont on ne sait rien", () => {
    // Un nœud absent de la réponse serait indistinguable d'un nœud qui va bien.
    const health = derive([node({ id: "b2b" }), node({ id: "shopify" })], {});

    expect(health.map((entry) => entry.node)).toEqual(["b2b", "shopify"]);
  });
});
