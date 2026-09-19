import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Lot B du plan des phrases, pour le référentiel et la tarification : chaque
 * fait nomme son sujet (D6), cite les objets avec leur nom du moment (D5), et
 * les lignes écrites avant restent lisibles (§6.2 — le journal ne se réécrit
 * pas).
 *
 * Les trois règles transverses — un `subjectLabel` par type, aucun id nu,
 * aucun e-mail — sont tenues sur le catalogue entier par `closure.spec.ts`.
 */

describe("les noms figés du référentiel et de la tarification (lot B)", () => {
  it("garde lisibles les lignes du lot A : leur forme est dans l'histoire du type", () => {
    const written: readonly [JournalFactType, unknown][] = [
      ["product.reclassified", { from: "cat_a", to: "cat_b" }],
      ["product.vat_changed", { b2b: { from: "vat_1", to: null } }],
      ["product_category.reordered", { order: ["cat_a", "cat_b"] }],
      [
        "point_of_sale.updated",
        { changes: { contexts: { from: "takeaway", to: "takeaway eatIn" } } },
      ],
      [
        "ingredient.created",
        { key: "farine", name: { fr: "Farine" }, origin: "FR", appellation: null },
      ],
      ["price_rule.posed", { summary: "Geste « Noël »", reason: null }],
      [
        "volume_commitment.signed",
        {
          companyId: "cmp_1",
          scope: "global",
          scopeId: null,
          promisedQuantity: 100,
          validFrom: "2026-09-01T00:00:00.000Z",
          validTo: "2026-12-01T00:00:00.000Z",
        },
      ],
      ["volume_commitment.closed", { reason: null }],
      [
        "order_time_limit.set",
        { scope: "global:", daysBefore: 1, time: "17:00", graceMinutes: null },
      ],
      [
        "catalog_revision.pushed",
        { channel: "b2b", mode: "live", candidates: 3, excluded: 0, blast: { articles: 3 } },
      ],
    ];

    for (const [type, line] of written) {
      const readable = journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
      expect({ type, readable }).toEqual({ type, readable: true });
      // …mais elles ne s'écrivent plus : l'écriture ne connaît que la forme courante.
      expect(checkJournalFact(type, line)).toMatchObject({ kind: "invalid_payload" });
    }
  });

  it("aligne les contextes d'un point de vente : un tableau nommé, à la création comme à la modification", () => {
    const contexts = [{ id: "takeaway", name: "À emporter" }];

    expect(
      checkJournalFact("point_of_sale.updated", {
        subjectLabel: "Boutique",
        changes: { contexts: { from: [], to: contexts } },
      }),
    ).toBeNull();
    expect(
      checkJournalFact("point_of_sale.created", {
        subjectLabel: "Boutique",
        kind: "shop",
        label: "Boutique",
        contexts,
        tableCount: 0,
      }),
    ).toBeNull();
  });

  it("aligne l'appellation et la catégorie d'allergènes : la même clé, nommée, des deux côtés", () => {
    const aop = { id: "AOP-BEURRE", name: "Beurre AOP" };

    expect(
      checkJournalFact("ingredient.updated", {
        subjectLabel: "Beurre",
        changes: { appellation: { from: null, to: aop } },
      }),
    ).toBeNull();
    expect(
      checkJournalFact("allergen_entry.updated", {
        subjectLabel: "Sarrasin",
        code: "BUCKWHEAT",
        changes: {
          category: {
            from: { id: "alc_1", name: "Céréales" },
            to: { id: "alc_2", name: "Autres" },
          },
        },
      }),
    ).toBeNull();
  });
});
