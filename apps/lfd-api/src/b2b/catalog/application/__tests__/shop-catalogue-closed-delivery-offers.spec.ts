import { GivenDeliveryAvailability } from "../../../delivery-availability/domain/ports/__tests__/delivery-availability-doubles.js";
import { FixedLineClassifications } from "../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { shelfPromotionOffers } from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import type { LivePromotion } from "../../../promotions/domain/live-promotion.js";
import { livePromotion } from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { ShopCatalogueOffers, withFulfillmentOffers } from "../shop-catalogue-offers.js";
import { shopCatalogueOf } from "../shop-catalogue-view.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * **Le rayon ne cite pas un acheminement fermé à la clientèle du lecteur**
 * (`/delivery-availability`). Les dates ne sont comparées qu'à l'horloge figée.
 */

const NOW = new Date(Date.UTC(2030, 0, 1));
const SELLABLE = [catalogItem("PAI-001")];

const BOTH = livePromotion({
  id: "les_deux",
  fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
  validFrom: new Date(0),
});
const DELIVERY_ONLY = livePromotion({
  id: "livraison",
  fulfillment: { kind: "basket", pickup: "none", delivery: "all" },
  validFrom: new Date(0),
});

async function mentions(
  promotions: readonly LivePromotion[],
  audience: ShopAudience,
  opening: { readonly openToB2b?: boolean; readonly openToB2c?: boolean },
) {
  const offers = new ShopCatalogueOffers(
    shelfPromotionOffers([...promotions], NOW),
    new FixedLineClassifications(),
    new GivenDeliveryAvailability(opening),
  );
  const catalogue = shopCatalogueOf(SELLABLE, {
    operations: [],
    operationOnlySkus: new Set<string>(),
    now: NOW,
    audience,
  });
  const buyer = { companyId: null, buyerKind: audience === "pro" ? "previewed" : "guest" } as const;
  const offered = await offers.offeredFor(buyer, catalogue, audience);
  return withFulfillmentOffers(catalogue, SELLABLE, offered, NOW).items[0]?.fulfillmentOffers;
}

describe("la mention d'acheminement selon la livraison de la clientèle", () => {
  /**
   * Régression (2026-11-01) : un particulier lisait « −20 % retrait » ET
   * « −20 % livraison » sur les vignettes, alors qu'on ne livre pas les particuliers.
   */
  it("un particulier sans livraison ne lit pas « −20 % livraison », seulement le retrait", async () => {
    const offers = await mentions([BOTH], "public", { openToB2c: false });

    expect(offers?.map((offer) => offer.fulfillment)).toEqual([
      { pickup: "all", delivery: "none" },
    ]);
  });

  it("une promotion de livraison seule n'est pas mentionnée du tout à qui n'est pas livré", async () => {
    expect(await mentions([DELIVERY_ONLY], "public", { openToB2c: false })).toBeUndefined();
  });

  it("le pro, livré, garde la mention de livraison", async () => {
    const offers = await mentions([BOTH], "pro", { openToB2c: false, openToB2b: true });

    expect(offers?.map((offer) => offer.fulfillment)).toEqual([{ pickup: "all", delivery: "all" }]);
  });

  it("le pro, livraison fermée aux pros, ne la lit pas non plus", async () => {
    expect(await mentions([DELIVERY_ONLY], "pro", { openToB2b: false })).toBeUndefined();
  });

  it("un particulier livré lit les deux", async () => {
    const offers = await mentions([BOTH], "public", { openToB2c: true });

    expect(offers?.map((offer) => offer.fulfillment)).toEqual([{ pickup: "all", delivery: "all" }]);
  });
});
