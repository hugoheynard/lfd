import { CompanyMercuriale } from "../company-mercuriale.js";
import type { PricingContext } from "../../price-rule.js";
import {
  MissingAmendmentReasonError,
  NoNegotiatedLineToCarryError,
  SkuAlreadyNegotiatedError,
} from "../../pricing-errors.js";

/**
 * **Le report d'un prix négocié** sur la référence née d'un détachement
 * (`plan-tarif-date-sur-une-reference.md`, § 6, T5).
 *
 * Les dates ne sont comparées qu'entre elles et à `NOW`, un instant de la
 * fixture passé en paramètre : aucune n'est confrontée à l'horloge.
 */

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-12-31T00:00:00.000Z");
const NOW = new Date("2026-03-01T00:00:00.000Z");
const APRIL = new Date("2026-04-01T00:00:00.000Z");
const GRID_TIERS = [
  { minQuantity: 1, unitPriceMillicents: 173_270 },
  { minQuantity: 50, unitPriceMillicents: 160_000 },
];
const REASON = "Report de la déclinaison détachée CHO-000-2";

const posed = (validFrom = FROM): CompanyMercuriale =>
  CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: "CHO-000-2", tiers: GRID_TIERS }],
      validFrom,
      validTo: TO,
    },
    "staff|marie",
  );

const carry = (mercuriale: CompanyMercuriale, now = NOW, reason = REASON): CompanyMercuriale =>
  mercuriale.carryOver(
    "amd_carry",
    { fromSku: "CHO-000-2", toSku: "CHO-001", reason },
    "staff|paul",
    now,
  );

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: APRIL,
    quantity: 60,
    cumulativeQuantity: null,
    variantSku: "CHO-001",
    productSku: "CHO-001",
    categoryPath: ["fam-choc"],
    saleUnit: "piece",
    companyId: "co_folie",
    pricingCompanyId: "co_folie",
    segmentId: null,
    ...over,
  };
}

describe("CompanyMercuriale.carryOver", () => {
  it("pose sur la nouvelle référence les paliers de l'ancienne, dès maintenant et jusqu'à la fin du document, en disant d'où ils viennent", () => {
    const [amendment] = carry(posed()).amendments;

    expect(amendment).toMatchObject({
      lines: [{ sku: "CHO-001", tiers: GRID_TIERS }],
      endedSkus: [],
      validFrom: NOW,
      validTo: null,
      reason: REASON,
      origin: { kind: "detached", fromSku: "CHO-000-2", fromMercurialeId: "merc_1" },
    });
  });

  it("fait payer la nouvelle référence au palier négocié, au client comme à son sous-compte", () => {
    const carried = carry(posed());

    expect(carried.asRuleFor(context())).toMatchObject({ amountMillicents: 160_000 });
    expect(
      carried.asRuleFor(context({ companyId: "co_site", pricingCompanyId: "co_folie" })),
    ).toMatchObject({ amountMillicents: 160_000, audience: { type: "company", id: "co_site" } });
  });

  it("ne part pas avant le début d'une mercuriale programmée : le report commence avec elle", () => {
    const [amendment] = carry(posed(APRIL)).amendments;

    expect(amendment?.validFrom).toEqual(APRIL);
  });

  it("refuse quand l'ancienne référence n'a plus de prix ici", () => {
    const ended = posed().amend(
      "amd_end",
      {
        lines: [],
        endedSkus: ["CHO-000-2"],
        validFrom: NOW,
        validTo: null,
        reason: "Fin du prix",
        origin: null,
      },
      "staff|paul",
      NOW,
    );

    expect(() => carry(ended, APRIL)).toThrow(NoNegotiatedLineToCarryError);
  });

  it("refuse un second report : la nouvelle référence est déjà négociée", () => {
    const once = carry(posed());

    expect(() =>
      once.carryOver(
        "amd_again",
        { fromSku: "CHO-000-2", toSku: "CHO-001", reason: REASON },
        "staff|paul",
        NOW,
      ),
    ).toThrow(SkuAlreadyNegotiatedError);
  });

  it("exige un motif, comme tout avenant", () => {
    expect(() => carry(posed(), NOW, "  ")).toThrow(MissingAmendmentReasonError);
  });
});
