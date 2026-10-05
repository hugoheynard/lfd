import {
  resetProduction,
  SEEDED_DAY_FACT_TYPES,
  type ProductionTables,
} from "../production.seed.js";

/**
 * 🔴 **Régression : le rechargement laissait le fournil derrière lui.**
 *
 * Le 2026-09-07, un `pnpm seed:orders` a effacé les commandes du client de
 * référence et reposé les neuf. Le plan du soir du 8 septembre, lui, est resté :
 * quatre fiches d'atelier, dont **deux** dont la référence ne désignait plus
 * aucune commande. Le compte à produire — un instantané qui ne se recalcule
 * pas — continuait d'annoncer leurs quantités.
 *
 * La cause est structurelle et c'est ce que ces cas tiennent : aucune clé
 * étrangère ne relie le fournil au commerce (c'est la frontière, et elle est
 * voulue), donc **rien** ne casse quand les commandes disparaissent. Le
 * nettoyage doit être explicite, et il doit couvrir les deux racines — celle qui
 * cascade et celle qui ne cascade pas.
 */

/**
 * Le doublé, **sans cast** : la coupe déclare la forme étroite dont elle a
 * besoin, donc un objet honnête suffit. C'est la raison d'être de
 * `ProductionTables`, et elle se vérifie ici.
 */
function prismaSpy(
  counts: { readonly days: number; readonly handovers: number },
  serviceDays: readonly string[] = [],
) {
  const called: string[] = [];
  const purges: unknown[] = [];
  const purge = (name: string, removed: number) => ({
    deleteMany: (args: { readonly where: unknown }): Promise<{ count: number }> => {
      called.push(name);
      purges.push(args.where);
      return Promise.resolve({ count: removed });
    },
  });
  const table = (name: string) => ({
    deleteMany: (): Promise<{ count: number }> => {
      called.push(name);
      return Promise.resolve({ count: 0 });
    },
  });
  const prisma: ProductionTables = {
    productionReturnRequest: table("productionReturnRequest"),
    productionHandoff: table("productionHandoff"),
    packingLine: table("packingLine"),
    packingContainerLine: table("packingContainerLine"),
    packingContainer: table("packingContainer"),
    packingOrder: table("packingOrder"),
    packingStock: table("packingStock"),
    packingReceipt: table("packingReceipt"),
    packingReturn: table("packingReturn"),
    productionBatch: {
      deleteMany: (): Promise<{ count: number }> => {
        called.push("productionBatch");
        return Promise.resolve({ count: 0 });
      },
    },
    outboxDelivery: purge("outboxDelivery", 0),
    outboxMessage: purge("outboxMessage", serviceDays.length * 2),
    productionDay: {
      findMany: () => Promise.resolve(serviceDays.map((serviceDay) => ({ serviceDay }))),
      deleteMany: (): Promise<{ count: number }> => {
        called.push("productionDay");
        return Promise.resolve({ count: counts.days });
      },
    },
    orderHandover: {
      deleteMany: (): Promise<{ count: number }> => {
        called.push("orderHandover");
        return Promise.resolve({ count: counts.handovers });
      },
    },
  };
  return { prisma, called, purges };
}

describe("resetProduction", () => {
  it("emporte les journées ET les attestations de remise", async () => {
    // Les deux, parce qu'elles ont deux racines : les fiches et le compte
    // partent en cascade depuis la journée, l'attestation n'appartient à aucune.
    // N'en vider qu'une laisserait exactement l'orphelin qu'on corrige.
    const { prisma, called } = prismaSpy({ days: 1, handovers: 3 });

    const report = await resetProduction(prisma);

    // Tout ce qui tient la journée en `Restrict` d'abord — demandes de retour,
    // remises, fournées —, puis la journée, puis les copies du colisage (K2),
    // les lignes avant leur bac. L'attestation de remise reste en dernier.
    expect(called).toEqual([
      "productionReturnRequest",
      "productionHandoff",
      "productionBatch",
      "productionDay",
      "packingLine",
      // Régression du 2026-10-05 : les contenants manquaient, et la coupe
      // échouait sur leur clé `Restrict` vers la commande au colisage.
      "packingContainerLine",
      "packingContainer",
      "packingOrder",
      "packingStock",
      "packingReceipt",
      "packingReturn",
      "orderHandover",
    ]);
    expect(report).toEqual({ days: 1, handovers: 3, facts: 0 });
  });

  it("rend des zéros sur un fournil déjà vide, sans échouer", async () => {
    // Le rechargement d'un poste neuf passe ici avant qu'aucune journée n'ait
    // été arrêtée. Une coupe qui refuserait le vide rendrait le semis
    // non rejouable.
    const { prisma } = prismaSpy({ days: 0, handovers: 0 });

    await expect(resetProduction(prisma)).resolves.toEqual({
      days: 0,
      handovers: 0,
      facts: 0,
    });
  });

  /**
   * Régression : « Il manque 35 Croissant sortis du four » au second
   * `seed:orders` du même jour (2026-10-05). Les faits du premier passage
   * restaient dans l'outbox, leur clé unique absorbait la remise au colisage.
   */
  it("purge les faits d'outbox des journées semées, pour rejouer le semis le même jour", async () => {
    const { prisma, called, purges } = prismaSpy({ days: 1, handovers: 0 }, ["2026-10-05"]);

    const report = await resetProduction(prisma);

    expect(called.slice(0, 2)).toEqual(["outboxDelivery", "outboxMessage"]);
    const where = {
      type: { in: SEEDED_DAY_FACT_TYPES },
      OR: [{ payload: { path: ["serviceDay"], equals: "2026-10-05" } }],
    };
    expect(purges).toEqual([{ message: where }, where]);
    expect(SEEDED_DAY_FACT_TYPES).toContain("production.handed_to_packing");
    expect(report.facts).toBe(2);
  });
});
