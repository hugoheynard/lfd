import type { TrafficWindow } from "@lfd/ops-contract";

import { gatewayReadings, moduleOf, moduleReadings, throughputOf } from "../readings.js";

const window = (over: Partial<TrafficWindow> = {}): TrafficWindow => ({
  node: "b2b",
  from: "2026-08-19T11:55:00.000Z",
  to: "2026-08-19T12:00:00.000Z",
  requests: 600,
  serverErrors: 0,
  throttled: 0,
  gatewayFaults: 0,
  p95Ms: 40,
  ...over,
});

describe("throughputOf — un débit, pas un total", () => {
  it("rapporte les requêtes à la durée de la fenêtre", () => {
    // Un total dépend de la fenêtre choisie : deux écrans réglés différemment
    // ne se compareraient pas. Un débit, si.
    expect(throughputOf(window({ requests: 600 }))).toBe(2);
  });

  it("rend 0 plutôt qu'une division par zéro sur une fenêtre dégénérée", () => {
    expect(throughputOf(window({ to: window().from }))).toBe(0);
  });
});

describe("gatewayReadings", () => {
  it("somme ce qu'elle a routé, tous backends confondus", () => {
    // La gateway ne se mesure pas elle-même : elle EST ce qui mesure.
    const readings = gatewayReadings([
      window({ requests: 600 }),
      window({ node: "pim", requests: 300 }),
    ]);

    expect(readings).toEqual([
      expect.objectContaining({ label: "Débit", value: 3, unit: "req/s" }),
    ]);
  });

  it("ne rend rien plutôt qu'un zéro quand rien n'est passé", () => {
    // Un « 0 req/s » affirme une mesure ; l'absence dit qu'on n'a rien vu. Ce
    // n'est pas la même information, et la seconde est la vraie.
    expect(gatewayReadings([])).toEqual([]);
    expect(gatewayReadings([window({ requests: 0 })])).toEqual([]);
  });
});

describe("moduleOf — la correspondance est DÉCLARÉE", () => {
  it("range chaque surface sous son module", () => {
    expect(moduleOf("admin/ops")).toBe("OPS");
    expect(moduleOf("catalogue/products")).toBe("PIM");
    expect(moduleOf("orders")).toBe("B2B");
    expect(moduleOf("admin/staff-users")).toBe("Staff");
  });

  it("laisse gagner l'entrée la plus spécifique", () => {
    // `admin/ops` appartient à OPS, pas à B2B, alors que `admin` est un préfixe
    // de B2B. L'ordre de la table est la règle, et il est écrit.
    expect(moduleOf("admin/ops")).not.toBe("B2B");
    expect(moduleOf("admin/companies")).toBe("B2B");
  });

  it("dit « Autre » plutôt que de ranger de force", () => {
    expect(moduleOf("quelque-chose")).toBe("Autre");
  });
});

describe("moduleReadings", () => {
  it("agrège la charge par module, du plus lourd au plus léger", () => {
    // C'est ce qui transforme « l'API peine » en « l'API peine SUR tel module ».
    const readings = moduleReadings(
      window({
        surfaces: [
          {
            surface: "orders",
            requests: 500,
            serverErrors: 0,
            throttled: 0,
            gatewayFaults: 0,
            p95Ms: 20,
          },
          {
            surface: "catalogue/products",
            requests: 90,
            serverErrors: 0,
            throttled: 0,
            gatewayFaults: 0,
            p95Ms: 20,
          },
          {
            surface: "admin/companies",
            requests: 10,
            serverErrors: 0,
            throttled: 0,
            gatewayFaults: 0,
            p95Ms: 20,
          },
        ],
      }),
    );

    expect(readings.map((reading) => [reading.label, reading.value])).toEqual([
      ["B2B", 510],
      ["PIM", 90],
    ]);
  });

  it("ne rend rien sans détail par surface", () => {
    expect(moduleReadings(window())).toEqual([]);
    expect(moduleReadings(undefined)).toEqual([]);
  });
});
