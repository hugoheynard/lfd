import {
  type DeliveryRoundTables,
  resetDeliveryRounds,
  spreadOverVehicles,
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

describe("spreadOverVehicles", () => {
  it("garde la tournée composée au premier véhicule et équilibre le reste en tranches contiguës", () => {
    expect(spreadOverVehicles(["a", "b"], ["1", "2", "3", "4", "5", "6", "7", "8"], 3)).toEqual([
      ["a", "b"],
      ["1", "2", "3", "4"],
      ["5", "6", "7", "8"],
    ]);
  });

  it("donne le reste de la division aux premières tranches", () => {
    expect(spreadOverVehicles<string>([], ["1", "2", "3"], 3)).toEqual([[], ["1", "2"], ["3"]]);
    expect(spreadOverVehicles<string>([], ["1"], 4)).toEqual([[], ["1"], [], []]);
  });

  it("tout au seul véhicule, et rien sans véhicule", () => {
    expect(spreadOverVehicles(["a"], ["b"], 1)).toEqual([["a", "b"]]);
    expect(spreadOverVehicles(["a"], ["b"], 0)).toEqual([]);
  });
});
