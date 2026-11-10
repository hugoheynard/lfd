import { CompanyMercuriale } from "../../entities/company-mercuriale.js";
import type { PromotionAdmission } from "../../entities/mercuriale-promotion-policy.js";
import { mercurialesAccepting } from "../mercuriales-accepting.js";

/**
 * « N mercuriales acceptent cette promotion » (`plan-la-mercuriale-decide.md`,
 * § 7) — chacune à sa politique de l'instant lu, ou de son début. Dates
 * comparées entre elles seulement.
 */

const NOW = new Date("2026-06-01T00:00:00.000Z");

function mercuriale(
  id: string,
  policy: PromotionAdmission,
  validFrom = new Date("2026-01-01T00:00:00.000Z"),
) {
  return CompanyMercuriale.pose(
    id,
    {
      companyId: `co_${id}`,
      label: id,
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 100_000 }] }],
      validFrom,
      validTo: null,
      promotionPolicy: policy,
    },
    "staff",
  );
}

describe("mercurialesAccepting", () => {
  it("« Toutes » et « Au choix » qui la nomme l'acceptent ; « Aucune » et les autres choix non", () => {
    const accepting = mercurialesAccepting(
      [
        mercuriale("all", { mode: "all", promotionIds: [] }),
        mercuriale("chosen", { mode: "selected", promotionIds: ["promo_a"] }),
        mercuriale("other", { mode: "selected", promotionIds: ["promo_b"] }),
        mercuriale("none", { mode: "none", promotionIds: [] }),
      ],
      "promo_a",
      NOW,
    );
    expect(accepting.map((entry) => [entry.mercurialeId, entry.mode])).toEqual([
      ["all", "all"],
      ["chosen", "selected"],
    ]);
  });

  it("une mercuriale à venir se lit à sa politique de départ", () => {
    const future = mercuriale(
      "future",
      { mode: "all", promotionIds: [] },
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(mercurialesAccepting([future], "promo_a", NOW)).toHaveLength(1);
  });
});
