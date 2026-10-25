import type { RevisionChange } from "../../entities/order-revision.js";
import {
  isQuantitiesOnly,
  quantitiesAfterArrestAllowed,
  revisedQuantitiesOf,
} from "../revision-after-arrest.js";

/** Le périmètre d'A2 (plan A2, § 7) — pur. */

type Line = { readonly sku: string; readonly quantity: number };

function revisionWith(changes: readonly RevisionChange[], lines: readonly Line[]) {
  return { changes, state: { lines } };
}

describe("quantitiesAfterArrestAllowed", () => {
  it("l'équipe, sur une commande au compte", () => {
    expect(quantitiesAfterArrestAllowed("staff", "not_required", 1_000)).toBe(true);
  });

  it.each([
    ["le client", "customer", "not_required", 1_000],
    ["une commande gratuite", "staff", "not_required", 0],
    ["une carte payée", "staff", "paid", 1_000],
    ["une carte attendue", "staff", "pending", 1_000],
  ] as const)("refuse %s", (_case, actor, payment, total) => {
    expect(quantitiesAfterArrestAllowed(actor, payment, total)).toBe(false);
  });
});

describe("isQuantitiesOnly", () => {
  const ORDER: readonly Line[] = [
    { sku: "A", quantity: 2 },
    { sku: "B", quantity: 3 },
  ];

  it("mêmes articles, quantités changées : oui", () => {
    const revision = revisionWith(
      ["lines"],
      [
        { sku: "A", quantity: 5 },
        { sku: "B", quantity: 1 },
      ],
    );

    expect(isQuantitiesOnly(ORDER, revision)).toBe(true);
    expect(revisedQuantitiesOf(revision)).toEqual([
      { sku: "A", quantity: 5 },
      { sku: "B", quantity: 1 },
    ]);
  });

  it.each([
    [
      "un autre changement",
      ["lines", "note"],
      [
        { sku: "A", quantity: 5 },
        { sku: "B", quantity: 3 },
      ],
    ],
    ["un article retiré", ["lines"], [{ sku: "A", quantity: 5 }]],
    [
      "un article ajouté",
      ["lines"],
      [
        { sku: "A", quantity: 2 },
        { sku: "B", quantity: 3 },
        { sku: "C", quantity: 1 },
      ],
    ],
    [
      "un article remplacé",
      ["lines"],
      [
        { sku: "A", quantity: 2 },
        { sku: "C", quantity: 3 },
      ],
    ],
  ] as const)("non : %s", (_case, changes, lines) => {
    expect(isQuantitiesOnly(ORDER, revisionWith(changes, lines))).toBe(false);
  });
});

describe("isQuantitiesOnly — les frontières de la promesse « au moins 1, mêmes articles »", () => {
  const ORDER: readonly Line[] = [
    { sku: "A", quantity: 2 },
    { sku: "B", quantity: 3 },
  ];

  // « Pour retirer un article, laissez-en 1 » : 0 n'est pas une quantité, c'est un retrait.
  it("non : une quantité à 0 est un retrait déguisé", () => {
    const revision = revisionWith(
      ["lines"],
      [
        { sku: "A", quantity: 0 },
        { sku: "B", quantity: 3 },
      ],
    );
    expect(isQuantitiesOnly(ORDER, revision)).toBe(false);
  });

  it("oui : la quantité 1 est la plus petite admise (borne incluse)", () => {
    const revision = revisionWith(
      ["lines"],
      [
        { sku: "A", quantity: 1 },
        { sku: "B", quantity: 1 },
      ],
    );
    expect(isQuantitiesOnly(ORDER, revision)).toBe(true);
  });

  // Même nombre de lignes, mais B disparaît au profit d'un doublon de A :
  // la clé (jour, commande, article) du colisage perdrait B.
  it("non : un article en double qui en masque un autre", () => {
    const revision = revisionWith(
      ["lines"],
      [
        { sku: "A", quantity: 2 },
        { sku: "A", quantity: 3 },
      ],
    );
    expect(isQuantitiesOnly(ORDER, revision)).toBe(false);
  });

  it("une carte remboursée (descendue de « payée ») n'ouvre pas la révision après l'arrêt", () => {
    expect(quantitiesAfterArrestAllowed("staff", "refunded", 1_000)).toBe(false);
  });
});
