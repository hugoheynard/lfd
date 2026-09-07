import { resetProduction, type ProductionTables } from "../production.seed.js";

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
function prismaSpy(counts: { readonly days: number; readonly handovers: number }) {
  const called: string[] = [];
  const prisma: ProductionTables = {
    productionDay: {
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
  return { prisma, called };
}

describe("resetProduction", () => {
  it("emporte les journées ET les attestations de remise", async () => {
    // Les deux, parce qu'elles ont deux racines : les fiches et le compte
    // partent en cascade depuis la journée, l'attestation n'appartient à aucune.
    // N'en vider qu'une laisserait exactement l'orphelin qu'on corrige.
    const { prisma, called } = prismaSpy({ days: 1, handovers: 3 });

    const report = await resetProduction(prisma);

    expect(called).toEqual(["productionDay", "orderHandover"]);
    expect(report).toEqual({ days: 1, handovers: 3 });
  });

  it("rend des zéros sur un fournil déjà vide, sans échouer", async () => {
    // Le rechargement d'un poste neuf passe ici avant qu'aucune journée n'ait
    // été arrêtée. Une coupe qui refuserait le vide rendrait le semis
    // non rejouable.
    const { prisma } = prismaSpy({ days: 0, handovers: 0 });

    await expect(resetProduction(prisma)).resolves.toEqual({
      days: 0,
      handovers: 0,
    });
  });
});
