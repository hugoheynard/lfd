import {
  type ComposedRound,
  type DeliveryRoundTables,
  driverRoundOf,
  halfSharedBy,
  packingOrderOf,
  resetDeliveryRounds,
} from "../delivery-rounds.seed.js";

/**
 * La coupe de la livraison, au rechargement.
 *
 * Même défaut structurel que le fournil (`production.seed.spec.ts`) : les
 * tournées désignent les commandes par identifiant opaque, sans clé étrangère,
 * donc rien ne casse quand le semis efface les commandes — une tournée d'hier
 * garderait ses arrêts vers le vide, et la nouvelle affectation buterait sur
 * « déjà dans une tournée ». Le nettoyage doit être explicite, et dans l'ordre
 * que les clés `Restrict` imposent.
 */

/** Le doublé, sans cast : la coupe déclare la forme étroite dont elle a besoin. */
function prismaSpy(counts: { readonly rounds: number; readonly bins: number }) {
  const called: string[] = [];
  const table = (name: string, count: number) => ({
    deleteMany: (): Promise<{ count: number }> => {
      called.push(name);
      return Promise.resolve({ count });
    },
  });
  const prisma: DeliveryRoundTables = {
    deliveryStopExecution: table("deliveryStopExecution", 0),
    deliveryBinLoad: table("deliveryBinLoad", 0),
    deliveryBin: table("deliveryBin", counts.bins),
    deliveryRoundStop: table("deliveryRoundStop", 0),
    deliveryRound: table("deliveryRound", counts.rounds),
  };
  return { prisma, called };
}

describe("resetDeliveryRounds", () => {
  it("emporte les tournées enfants d'abord, sans toucher aux véhicules", async () => {
    const { prisma, called } = prismaSpy({ rounds: 1, bins: 8 });

    const report = await resetDeliveryRounds(prisma);

    // Exécutions et chargements pointent l'arrêt, le chargement pointe le bac,
    // l'arrêt pointe la tournée : toutes `Restrict`. Les véhicules ne sont pas
    // dans la forme — la coupe ne PEUT pas les atteindre.
    expect(called).toEqual([
      "deliveryStopExecution",
      "deliveryBinLoad",
      "deliveryBin",
      "deliveryRoundStop",
      "deliveryRound",
    ]);
    expect(report).toEqual({ rounds: 1, bins: 8 });
  });

  it("rend des zéros sur un poste sans tournée, sans échouer", async () => {
    // Le premier rechargement d'un poste passe ici avant qu'aucune tournée
    // n'existe : une coupe qui refuserait le vide rendrait le semis non rejouable.
    const { prisma } = prismaSpy({ rounds: 0, bins: 0 });

    await expect(resetDeliveryRounds(prisma)).resolves.toEqual({ rounds: 0, bins: 0 });
  });
});

/** Une tournée relue : `null` dans la séquence = l'arrêt d'un transfert interne. */
function round(roundId: string, sequence: readonly (string | null)[], passage = 1): ComposedRound {
  return {
    roundId,
    passage,
    sequence,
    stops: sequence.flatMap((orderId) => (orderId === null ? [] : [{ orderId }])),
  };
}

describe("driverRoundOf — la tournée que le requérant fera partir", () => {
  it("prend la première dont toutes les livraisons seront colisées", () => {
    const rounds = [round("r_1", ["a", "late"]), round("r_2", [null]), round("r_3", ["b"])];

    expect(driverRoundOf(rounds, new Set(["late"]))?.roundId).toBe("r_3");
  });

  it("à défaut, la première qui livre — « Partir » dira ce qui manque", () => {
    const rounds = [round("r_transfer", [null]), round("r_1", ["late"])];

    expect(driverRoundOf(rounds, new Set(["late"]))?.roundId).toBe("r_1");
    expect(driverRoundOf([round("r_transfer", [null])], new Set())).toBeUndefined();
  });
});

describe("halfSharedBy — qui prend l'autre moitié, selon ce que le calcul a composé", () => {
  it("l'arrêt qui suit immédiatement l'ouvreur, s'il est colisé", () => {
    const rounds = [round("r_1", ["x", "opener", "next"]), round("r_2", ["other"])];

    expect(halfSharedBy(rounds, new Set(["opener"]), new Set(["next", "other"]))).toEqual(
      new Map([["next", "opener"]]),
    );
  });

  it("personne quand l'ouvreur finit sa tournée, qu'un transfert les sépare ou que le suivant n'est pas prêt", () => {
    const opens = new Set(["opener"]);

    expect(halfSharedBy([round("r_1", ["x", "opener"])], opens, new Set(["x"])).size).toBe(0);
    expect(halfSharedBy([round("r_1", ["opener", null, "y"])], opens, new Set(["y"])).size).toBe(0);
    expect(halfSharedBy([round("r_1", ["opener", "y"])], opens, new Set()).size).toBe(0);
  });
});

describe("packingOrderOf — une moitié s'ouvre avant d'être partagée", () => {
  it("colise dans l'ordre des tournées, puis ce qui n'est en aucune", () => {
    const item = (id: string) => ({ order: { id } });
    const rounds = [round("r_1", ["b", "a"]), round("r_2", ["c"])];

    expect(
      packingOrderOf([item("loose"), item("c"), item("a"), item("b")], rounds).map(
        (entry) => entry.order.id,
      ),
    ).toEqual(["b", "a", "c", "loose"]);
  });
});
