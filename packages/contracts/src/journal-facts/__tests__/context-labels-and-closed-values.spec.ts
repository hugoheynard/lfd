import { checkJournalFact, journalPayloadShapes, type JournalFactType } from "../index.js";

/**
 * Lot D du plan des phrases, côté catalogue (2026-09-19) : les contextes de
 * vente cités par leur clé portent aussi leur libellé du moment, et la méthode
 * de prix professionnel est une valeur fermée. Les formes d'avant restent
 * lisibles — le journal ne se réécrit pas (§6.2).
 */

function readable(type: JournalFactType, line: unknown): boolean {
  return journalPayloadShapes(type).some((shape) => shape.safeParse(line).success);
}

const REDUCED = { id: "vat_1", name: "Réduit" } as const;

describe("les libellés des contextes de vente, figés à l'écriture", () => {
  it.each(["product.vat_changed", "product_category.vat_changed"] as const)(
    "%s porte le libellé de chaque contexte cité par sa clé",
    (type) => {
      const line = {
        subjectLabel: "Tartes",
        vatByContext: { brunch: { from: null, to: REDUCED } },
        contextLabels: { brunch: "Brunch" },
      };

      expect(checkJournalFact(type, line)).toBeNull();
    },
  );

  it.each(["product.vat_changed", "product_category.vat_changed"] as const)(
    "%s du lot B, sans libellés, se lit encore mais ne s'écrit plus",
    (type) => {
      const line = {
        subjectLabel: "Tartes",
        vatByContext: { brunch: { from: null, to: REDUCED } },
      };

      expect(readable(type, line)).toBe(true);
      expect(checkJournalFact(type, line)).toMatchObject({ kind: "invalid_payload" });
    },
  );

  it("vat_rate.rate_changed nomme les contextes que sa portée compte", () => {
    const lotB = {
      subjectLabel: "Réduit",
      name: "Réduit",
      from: 5.5,
      to: 10,
      blast: { families: { brunch: 2 } },
    };

    expect(
      checkJournalFact("vat_rate.rate_changed", { ...lotB, contextLabels: { brunch: "Brunch" } }),
    ).toBeNull();
    expect(readable("vat_rate.rate_changed", lotB)).toBe(true);
    expect(checkJournalFact("vat_rate.rate_changed", lotB)).toMatchObject({
      kind: "invalid_payload",
    });
  });

  it("refuse un libellé vide : une clé sans nom s'écrit en s'omettant, pas en « »", () => {
    expect(
      checkJournalFact("product.vat_changed", {
        subjectLabel: "Tartes",
        vatByContext: { brunch: { from: null, to: REDUCED } },
        contextLabels: { brunch: "" },
      }),
    ).toMatchObject({ kind: "invalid_payload" });
  });
});

/**
 * Régression : la méthode était décrite `z.string()`, et une e2e écrivait
 * « Méthode réduit » sous le mode strict sans que rien ne rougisse.
 */
describe("accounting_rules.method_changed — une méthode fermée", () => {
  it("accepte une méthode du référentiel", () => {
    expect(
      checkJournalFact("accounting_rules.method_changed", {
        subjectLabel: "Règles comptables",
        from: "ratio_ttc",
        to: "ratio_ttc",
      }),
    ).toBeNull();
  });

  it("refuse un texte libre à l'écriture, et le lit encore dans une ligne ancienne", () => {
    const line = {
      subjectLabel: "Règles comptables",
      from: "remise_apres_tva_max",
      to: "ratio_ttc",
    };

    expect(checkJournalFact("accounting_rules.method_changed", line)).toMatchObject({
      kind: "invalid_payload",
    });
    expect(readable("accounting_rules.method_changed", line)).toBe(true);
    expect(
      readable("accounting_rules.method_changed", {
        from: "remise_apres_tva_max",
        to: "ratio_ttc",
      }),
    ).toBe(true);
  });
});
