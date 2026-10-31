import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { SelectedPromotionNotFoundError } from "../../../domain/errors/mercuriale-promotion-policy-errors.js";
import { InMemoryPolicyPromotionNames } from "../../../infrastructure/in-memory-policy-promotion-names.js";
import { describeAmendment } from "../company-mercuriale-support.js";
import { namedPolicy } from "../promotion-policy-support.js";

/**
 * **Le journal nomme la politique** (`plan-la-mercuriale-decide.md`, § 8) :
 * la pose et l'avenant figent « promotions : au choix — « Rentrée » » dans
 * leur phrase, jamais des identifiants.
 */

const NAMES = new InMemoryPolicyPromotionNames(
  new Map([
    ["promo_a", "Rentrée"],
    ["promo_b", "Noël"],
  ]),
);

describe("namedPolicy", () => {
  it("rend la politique canonique et sa phrase nommée", async () => {
    await expect(
      namedPolicy(NAMES, { mode: "selected", promotionIds: ["promo_b", "promo_a"] }),
    ).resolves.toEqual({
      policy: { mode: "selected", promotionIds: ["promo_a", "promo_b"] },
      phrase: "promotions : au choix — « Rentrée », « Noël »",
    });
    await expect(namedPolicy(NAMES, { mode: "none", promotionIds: [] })).resolves.toMatchObject({
      phrase: "promotions : aucune",
    });
  });

  it("refuse une promotion inconnue en la nommant", async () => {
    await expect(
      namedPolicy(NAMES, { mode: "selected", promotionIds: ["promo_x"] }),
    ).rejects.toBeInstanceOf(SelectedPromotionNotFoundError);
  });
});

describe("la phrase d'un avenant", () => {
  it("dit la nouvelle politique et sa date d'effet", () => {
    const mercuriale = CompanyMercuriale.pose(
      "merc_1",
      {
        companyId: "co_folie",
        label: "M",
        lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 100_000 }] }],
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
      },
      "staff",
    );
    expect(
      describeAmendment(
        mercuriale,
        {
          lines: [],
          endedSkus: [],
          validFrom: new Date("2026-04-01T00:00:00.000Z"),
          validTo: null,
          reason: "r",
          origin: null,
        },
        "promotions : toutes",
      ),
    ).toBe("Avenant — promotions : toutes à partir du 1er avril 2026");
  });
});
