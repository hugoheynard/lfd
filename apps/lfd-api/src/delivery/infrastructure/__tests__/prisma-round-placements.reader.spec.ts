import { placementsByOrder } from "../prisma-round-placements.reader.js";

/**
 * Le choix de la place d'une commande, sans base : le libellé suit la règle
 * du papier, l'arrêt vivant gagne sur un arrêt clos, et le plus récent départage.
 */

// Intention relative : ces dates ne sont comparées qu'entre elles.
const EARLIER = new Date(Date.now() - 2 * 60 * 60 * 1000);
const LATER = new Date(Date.now() - 60 * 60 * 1000);

function stop(
  orderId: string,
  roundId: string,
  position: number,
  options: { readonly closedAt?: Date; readonly createdAt?: Date; readonly passage?: number } = {},
) {
  return {
    orderId,
    position,
    closedAt: options.closedAt ?? null,
    createdAt: options.createdAt ?? EARLIER,
    round: { id: roundId, vehicleName: "Kangoo blanc", passage: options.passage ?? 1 },
  };
}

describe("placementsByOrder", () => {
  it("rend la tournée, son libellé et le rang de l'arrêt", () => {
    const placements = placementsByOrder([stop("a", "rnd_1", 2)]);

    expect(placements.get("a")).toEqual({ roundId: "rnd_1", label: "Kangoo blanc", position: 2 });
  });

  it("nomme le second passage comme l'écran et le papier", () => {
    const placements = placementsByOrder([stop("a", "rnd_2", 1, { passage: 2 })]);

    expect(placements.get("a")?.label).toBe("Kangoo blanc · passage 2");
  });

  it("préfère l'arrêt vivant à un arrêt clos plus récent (rapportée puis replacée)", () => {
    const placements = placementsByOrder([
      stop("a", "rnd_live", 3, { createdAt: EARLIER }),
      stop("a", "rnd_closed", 1, { closedAt: LATER, createdAt: LATER }),
    ]);

    expect(placements.get("a")?.roundId).toBe("rnd_live");
  });

  it("entre deux arrêts clos, garde le plus récent", () => {
    const placements = placementsByOrder([
      stop("a", "rnd_old", 1, { closedAt: EARLIER, createdAt: EARLIER }),
      stop("a", "rnd_new", 4, { closedAt: LATER, createdAt: LATER }),
    ]);

    expect(placements.get("a")).toMatchObject({ roundId: "rnd_new", position: 4 });
  });

  it("ne rend rien pour une commande sans arrêt", () => {
    expect(placementsByOrder([]).size).toBe(0);
  });
});
