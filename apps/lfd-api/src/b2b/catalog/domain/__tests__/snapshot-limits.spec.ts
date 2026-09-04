import { storedCatalogSnapshotSchema, type StoredCatalogSnapshot } from "@lfd/catalog-sync";

import { snapshotLimitReader } from "../snapshot-limits.js";

/**
 * **Où la plateforme lit la limite d'un article, selon la version du fil.**
 *
 * La branche v6 de `snapshotLimitReader` protège le cas le plus coûteux de la
 * v7 : une arrivée mise en file AVANT le déploiement porte la limite sur chaque
 * déclinaison, pas sous forme de règles. La valider après coup ne doit pas
 * effacer les limites du catalogue — et cet effacement serait silencieux, sur la
 * seule règle qui refuse une commande en retard.
 *
 * Éprouvée ici, sur la fonction pure, et non par un e2e : écrire une arrivée v6
 * en base demanderait de contourner le schéma du fil, qui la refuse à raison.
 * Ce qu'on veut savoir tient dans deux entrées et une sortie.
 */
function snapshotOf(over: Record<string, unknown>): StoredCatalogSnapshot {
  const base = {
    version: 7,
    generatedAt: "2026-09-04T09:00:00+02:00",
    categories: [
      {
        id: "boulangerie",
        name: "Boulangerie",
        slug: "b",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
      {
        id: "pain",
        name: "Pain",
        slug: "p",
        parentId: "boulangerie",
        position: 1,
        vatRatePercent: 5.5,
      },
    ],
    products: [
      {
        id: "prd_1",
        sku: "PAI-001",
        name: "Baguette",
        categoryId: "pain",
        kind: "daily",
        variants: [
          {
            id: "var_1",
            sku: "PAI-001-1",
            name: "Baguette",
            priceMillicents: 200,
            weightGrams: null,
            isDefault: true,
            position: 0,
            vatRatePercent: 5.5,
            allergens: null,
            allergenLabels: null,
          },
        ],
      },
    ],
    orderTimeLimits: [],
    ...over,
  };
  return storedCatalogSnapshotSchema.parse(base);
}

const firstOf = (snapshot: StoredCatalogSnapshot) => {
  const product = snapshot.products[0];
  const variant = product?.variants[0];
  if (product === undefined || variant === undefined) {
    throw new Error("fixture sans article");
  }
  return snapshotLimitReader(snapshot)(product, variant);
};

describe("snapshotLimitReader", () => {
  it("descend l'échelle d'une arrivée v7", () => {
    // La racine pose le délai, la famille proche pose l'heure : l'héritage
    // champ par champ se fait chez le RÉCEPTEUR depuis la v7.
    const snapshot = snapshotOf({
      orderTimeLimits: [
        { scope: { type: "global", id: null }, daysBefore: 1, time: null, graceMinutes: null },
        {
          scope: { type: "category", id: "boulangerie" },
          daysBefore: null,
          time: "16:00",
          graceMinutes: 30,
        },
      ],
    });

    expect(firstOf(snapshot)).toEqual({ daysBefore: 1, time: "16:00", graceMinutes: 30 });
  });

  it("rend `null` quand une arrivée v7 ne porte aucune règle", () => {
    expect(firstOf(snapshotOf({}))).toBeNull();
  });

  /**
   * 🔴 **Le cas qui justifie toute la branche.**
   *
   * Une arrivée v6 n'a pas de règles — elle porte la limite RÉSOLUE sur chaque
   * déclinaison. Se fier au tableau `orderTimeLimits` (vide dans les deux cas)
   * au lieu de la version rendrait ici `null`, c'est-à-dire effacerait la limite
   * de chaque article du catalogue au moment où quelqu'un valide l'arrivée.
   */
  it("lit la limite portée par la déclinaison quand l'arrivée est antérieure à la v7", () => {
    const v6 = snapshotOf({
      version: 6,
      products: [
        {
          id: "prd_1",
          sku: "PAI-001",
          name: "Baguette",
          categoryId: "pain",
          kind: "daily",
          variants: [
            {
              sku: "PAI-001-1",
              name: "Baguette",
              priceMillicents: 200,
              weightGrams: null,
              isDefault: true,
              position: 0,
              vatRatePercent: 5.5,
              allergens: null,
              allergenLabels: null,
              orderTimeLimit: { daysBefore: 2, time: "14:00", graceMinutes: 15 },
            },
          ],
        },
      ],
    });

    expect(firstOf(v6)).toEqual({ daysBefore: 2, time: "14:00", graceMinutes: 15 });
  });

  it("rend `null` sur une arrivée v6 dont la déclinaison n'avait pas de limite", () => {
    const v6 = snapshotOf({ version: 6 });

    expect(firstOf(v6)).toBeNull();
  });

  it("ignore une règle de rang « déclinaison » sur une arrivée v6", () => {
    // L'identifiant de déclinaison ne traversait pas avant la v7 : une telle
    // règle ne vise donc rien, et c'est exact — elle ne pouvait pas être là.
    const v6 = snapshotOf({
      version: 6,
      orderTimeLimits: [
        { scope: { type: "variant", id: "var_1" }, daysBefore: 1, time: "18:00", graceMinutes: 0 },
      ],
    });

    expect(firstOf(v6)).toBeNull();
  });
});
