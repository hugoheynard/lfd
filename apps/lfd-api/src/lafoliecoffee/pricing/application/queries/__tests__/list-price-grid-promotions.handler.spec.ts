import type { PriceGridQuestion } from "@lfd/contracts";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { PriceGridZoneNotFoundError } from "../../../domain/errors/price-grid-errors.js";
import { COMPANY, gridServices, PICKUP, ZONE } from "../../__tests__/price-grid.doubles.js";
import { ListPriceGridPromotionsHandler } from "../list-price-grid-promotions.handler.js";
import { ListPriceGridPromotionsQuery } from "../list-price-grid-promotions.query.js";

/**
 * **La liste qui remplit le panneau** (`plan-export-grille-de-prix.md`, § 2.4) :
 * elle dépend du public, de la date et de l'acheminement. Dates comparées à la
 * seule horloge figée.
 */

const NOW = new Date("2030-01-15T09:00:00.000Z");

const LINE = livePromotion({ id: "ligne", label: "−10 % pour tous" });
const REGISTERED_AT_PICKUP = livePromotion({
  id: "inscrits",
  label: "Inscrits −20 % au retrait",
  audience: { kind: "individuals_registered" },
  fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
});
const PROS_IN_DELIVERY = livePromotion({
  id: "pros",
  label: "Pros −5 € en livraison",
  audience: { kind: "pros" },
  effect: { kind: "basket_amount_off", cents: 500 },
  cumulative: true,
  fulfillment: { kind: "basket", pickup: "none", delivery: "all" },
});
const LATER = livePromotion({
  id: "bientot",
  label: "Février",
  validFrom: new Date("2030-02-01T00:00:00.000Z"),
  fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
});

function handler(): ListPriceGridPromotionsHandler {
  const { contexts, promotions } = gridServices(NOW, {
    lines: [LINE],
    basket: [REGISTERED_AT_PICKUP, PROS_IN_DELIVERY, LATER],
  });
  return new ListPriceGridPromotionsHandler(contexts, promotions);
}

function question(overrides: Partial<PriceGridQuestion> = {}): PriceGridQuestion {
  return {
    audience: { kind: "individuals_registered" },
    day: null,
    fulfillment: { method: "pickup", pickupId: PICKUP },
    ...overrides,
  };
}

async function basketIds(overrides: Partial<PriceGridQuestion>): Promise<readonly string[]> {
  const view = await handler().execute(new ListPriceGridPromotionsQuery(question(overrides)));
  return view.basket.map((promotion) => promotion.id);
}

describe("les promotions applicables à une grille", () => {
  it("un particulier inscrit au retrait : TTC, la ligne et sa remise de retrait", async () => {
    const view = await handler().execute(new ListPriceGridPromotionsQuery(question()));

    expect(view.basis).toBe("ttc");
    expect(view.displayedPrice.map((promotion) => promotion.label)).toEqual(["−10 % pour tous"]);
    expect(view.basket).toEqual([
      {
        id: "inscrits",
        label: "Inscrits −20 % au retrait",
        effect: { kind: "percent_off", value: 2000 },
        cumulative: false,
      },
    ]);
  });

  it("le public change la liste : un invité ne reçoit pas la remise des inscrits", async () => {
    expect(await basketIds({ audience: { kind: "individuals_guest" } })).toEqual([]);
  });

  it("l'acheminement change la liste : un pro en livraison reçoit la sienne", async () => {
    expect(
      await basketIds({
        audience: { kind: "company", companyId: COMPANY },
        fulfillment: { method: "delivery", zoneId: ZONE },
      }),
    ).toEqual(["pros"]);
  });

  it("la date change la liste : une remise de février se lit en février", async () => {
    expect(await basketIds({ day: "2030-02-10" })).toEqual(["inscrits", "bientot"]);
  });

  it("refuse une zone inconnue", async () => {
    await expect(
      handler().execute(
        new ListPriceGridPromotionsQuery(
          question({ fulfillment: { method: "delivery", zoneId: "zn_x" } }),
        ),
      ),
    ).rejects.toBeInstanceOf(PriceGridZoneNotFoundError);
  });
});
