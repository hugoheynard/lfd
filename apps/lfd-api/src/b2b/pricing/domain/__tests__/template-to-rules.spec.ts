import { PriceTemplate } from "../entities/price-template.js";
import { templateToRules } from "../services/template-to-rules.js";
import {
  DuplicateTemplateSkuError,
  EmptyPriceTemplateError,
  NonDecreasingTemplateTiersError,
} from "../pricing-errors.js";

const SAISON = {
  validFrom: new Date("2026-11-01T00:00:00.000Z"),
  validTo: new Date("2027-05-01T00:00:00.000Z"),
};

const compose = (lines: Parameters<typeof PriceTemplate.compose>[1]["lines"]) =>
  PriceTemplate.compose(
    "tpl_1",
    { kind: "mercuriale", label: "Mercuriale Club Med", lines },
    "auth0|cecile",
  );

describe("PriceTemplate.compose", () => {
  /**
   * **Le point central du modèle.** Un prix fixe n'est pas une seconde forme :
   * c'est la grille à un palier, à partir de 1. Rien dans l'agrégat ne le
   * distingue, et c'est exactement ce qu'on veut.
   */
  it("accepte un prix fixe comme grille à un seul palier", () => {
    const template = compose([
      {
        sku: "PAI-001",
        plannedVolume: null,
        tiers: [{ minQuantity: 1, unitPriceMillicents: 80_000 }],
      },
    ]);

    expect(template.lines).toEqual([
      {
        sku: "PAI-001",
        plannedVolume: null,
        tiers: [{ minQuantity: 1, unitPriceMillicents: 80_000 }],
      },
    ]);
  });

  it("range les paliers par seuil croissant plutôt que de refuser un désordre de saisie", () => {
    const template = compose([
      {
        sku: "PAI-001",
        plannedVolume: null,
        tiers: [
          { minQuantity: 5000, unitPriceMillicents: 80_000 },
          { minQuantity: 1, unitPriceMillicents: 85_000 },
        ],
      },
    ]);

    expect(template.lines[0]?.tiers.map((tier) => tier.minQuantity)).toEqual([1, 5000]);
  });

  /**
   * L'incohérence n'est pas exprimable palier par palier — chacun, pris seul,
   * est valide. Elle n'apparaît qu'une fois la grille réunie, ce qui est toute
   * la raison d'avoir un agrégat plutôt que N champs.
   */
  it("refuse une grille où commander plus coûte plus cher", () => {
    expect(() =>
      compose([
        {
          sku: "PAI-001",
          plannedVolume: null,
          tiers: [
            { minQuantity: 1, unitPriceMillicents: 80_000 },
            { minQuantity: 5000, unitPriceMillicents: 85_000 },
          ],
        },
      ]),
    ).toThrow(NonDecreasingTemplateTiersError);
  });

  it("refuse deux paliers au même seuil — ils ne se départagent pas", () => {
    expect(() =>
      compose([
        {
          sku: "PAI-001",
          plannedVolume: null,
          tiers: [
            { minQuantity: 100, unitPriceMillicents: 85_000 },
            { minQuantity: 100, unitPriceMillicents: 80_000 },
          ],
        },
      ]),
    ).toThrow(NonDecreasingTemplateTiersError);
  });

  it("refuse deux lignes sur le même article", () => {
    expect(() =>
      compose([
        {
          sku: "PAI-001",
          plannedVolume: null,
          tiers: [{ minQuantity: 1, unitPriceMillicents: 85_000 }],
        },
        {
          sku: "PAI-001",
          plannedVolume: null,
          tiers: [{ minQuantity: 1, unitPriceMillicents: 80_000 }],
        },
      ]),
    ).toThrow(DuplicateTemplateSkuError);
  });

  it("refuse une grille vide, et une ligne sans palier", () => {
    expect(() => compose([])).toThrow(EmptyPriceTemplateError);
    expect(() => compose([{ sku: "PAI-001", plannedVolume: null, tiers: [] }])).toThrow(
      EmptyPriceTemplateError,
    );
  });

  it("accepte un article offert — zéro est un prix réel", () => {
    const template = compose([
      { sku: "PAI-001", plannedVolume: null, tiers: [{ minQuantity: 1, unitPriceMillicents: 0 }] },
    ]);

    expect(template.lines[0]?.tiers[0]?.unitPriceMillicents).toBe(0);
  });
});

describe("templateToRules", () => {
  /**
   * **Club Med annonce 10 000 baguettes pour la saison.** Deux façons d'arriver
   * au prix — un prix fixe négocié, ou la grille lue au bon palier — et une
   * seule chose posée : des règles de mercuriale qui POSENT un prix.
   */
  it("pose une règle de mercuriale par palier, sur l'article et sur le client", () => {
    const template = compose([
      {
        sku: "PAI-001",
        plannedVolume: null,
        tiers: [
          { minQuantity: 1, unitPriceMillicents: 85_000 },
          { minQuantity: 10_000, unitPriceMillicents: 78_000 },
        ],
      },
    ]);

    const drafts = templateToRules(template.lines, "cmp_clubmed", SAISON, "Mercuriale Club Med");

    expect(drafts).toEqual([
      {
        stage: "mercuriale",
        scope: { type: "product", id: "PAI-001" },
        audience: { type: "company", id: "cmp_clubmed" },
        minQuantity: 1,
        effect: { nature: "replace", amountMillicents: 85_000 },
        label: "Mercuriale Club Med",
        stacksOverMercuriale: false,
        ...SAISON,
      },
      {
        stage: "mercuriale",
        scope: { type: "product", id: "PAI-001" },
        audience: { type: "company", id: "cmp_clubmed" },
        minQuantity: 10_000,
        effect: { nature: "replace", amountMillicents: 78_000 },
        label: "Mercuriale Club Med",
        stacksOverMercuriale: false,
        ...SAISON,
      },
    ]);
  });

  it("un prix fixe ne pose qu'une règle", () => {
    const template = compose([
      {
        sku: "PAI-001",
        plannedVolume: null,
        tiers: [{ minQuantity: 1, unitPriceMillicents: 80_000 }],
      },
    ]);

    expect(templateToRules(template.lines, "cmp_clubmed", SAISON, "Fixe")).toHaveLength(1);
  });

  /** Le libellé du GABARIT : c'est lui que le client lira dans la trace. */
  it("porte le libellé du gabarit sur chaque règle", () => {
    const template = compose([
      {
        sku: "PAI-001",
        plannedVolume: null,
        tiers: [
          { minQuantity: 1, unitPriceMillicents: 85_000 },
          { minQuantity: 500, unitPriceMillicents: 80_000 },
        ],
      },
    ]);

    const labels = templateToRules(
      template.lines,
      "cmp_clubmed",
      SAISON,
      "Mercuriale Club Med",
    ).map((draft) => draft.label);

    expect(labels).toEqual(["Mercuriale Club Med", "Mercuriale Club Med"]);
  });
});
