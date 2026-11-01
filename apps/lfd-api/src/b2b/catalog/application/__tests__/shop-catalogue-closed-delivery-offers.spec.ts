import {
  FilteringPickups,
  openPoint,
} from "../../../pickup-addresses/application/__tests__/pickup-address-doubles.js";
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
 * (`/delivery-availability`, et les points de retrait de sa clientèle). Les dates ne sont comparées qu'à l'horloge figée.
 */

const NOW = new Date(Date.UTC(2030, 0, 1));
const SELLABLE = [catalogItem("PAI-001")];

const BOTH = livePromotion({
  id: "les_deux",
  fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
  validFrom: new Date(0),
});
const PRO_POINT_ONLY = livePromotion({
  id: "point_pro",
  fulfillment: { kind: "basket", pickup: { points: ["pk_pro"] }, delivery: "none" },
  validFrom: new Date(0),
});
/** Un point réservé aux pros, et un point ouvert aux deux. */
const POINTS = [openPoint("pk_pro", { b2b: true, b2c: false }), openPoint("pk_tous")];
const DELIVERY_ONLY = livePromotion({
  id: "livraison",
  fulfillment: { kind: "basket", pickup: "none", delivery: "all" },
  validFrom: new Date(0),
});

async function mentions(
  promotions: readonly LivePromotion[],
  audience: ShopAudience,
  opening: { readonly openToB2b?: boolean; readonly openToB2c?: boolean },
  points = POINTS,
) {
  const offers = new ShopCatalogueOffers(
    shelfPromotionOffers([...promotions], NOW),
    new FixedLineClassifications(),
    new GivenDeliveryAvailability(opening),
    new FilteringPickups(points),
  );
  const catalogue = shopCatalogueOf(SELLABLE, {
    operations: [],
    operationOnlySkus: new Set<string>(),
    now: NOW,
    audience,
  });
  const buyer = { companyId: null, buyerKind: audience === "pro" ? "previewed" : "guest" } as const;
  const offered = await offers.offeredFor(buyer, catalogue, audience);
  return withFulfillmentOffers(catalogue, SELLABLE, offered, NOW, "fr").items[0]?.fulfillmentOffers;
}

describe("la mention d'acheminement selon la livraison de la clientèle", () => {
  /**
   * Régression (2026-11-01) : un particulier lisait « −20 % retrait » ET
   * « −20 % livraison » sur les vignettes, alors qu'on ne livre pas les particuliers.
   */
  it("un particulier sans livraison lit la valeur seule, sans acheminement", async () => {
    // Depuis `plan-texte-de-la-vignette.md`, la mention ne cite plus
    // l'acheminement : ce qui reste à éprouver ici est qu'elle se dit, parce
    // que le retrait lui est ouvert (le filtre est éprouvé par `offerOpenTo`).
    const offers = await mentions([BOTH], "public", { openToB2c: false });

    expect(offers).toEqual([{ effect: { kind: "percent", basisPoints: 2000 } }]);
  });

  it("une promotion de livraison seule n'est pas mentionnée du tout à qui n'est pas livré", async () => {
    expect(await mentions([DELIVERY_ONLY], "public", { openToB2c: false })).toBeUndefined();
  });

  it("le pro, livré, lit la mention d'une promotion de livraison seule", async () => {
    const offers = await mentions([DELIVERY_ONLY], "pro", { openToB2c: false, openToB2b: true });

    expect(offers).toHaveLength(1);
  });

  it("le pro, livraison fermée aux pros, ne la lit pas non plus", async () => {
    expect(await mentions([DELIVERY_ONLY], "pro", { openToB2b: false })).toBeUndefined();
  });

  it("un particulier livré lit la mention d'une promotion de livraison seule", async () => {
    expect(await mentions([DELIVERY_ONLY], "public", { openToB2c: true })).toHaveLength(1);
  });
});

describe("la mention d'acheminement selon les points de retrait de la clientèle", () => {
  /**
   * Régression (2026-11-01) : une remise réservée à un point que seuls les
   * pros peuvent choisir se disait aussi aux particuliers.
   */
  it("un particulier ne lit pas une remise de retrait sur un point réservé aux pros", async () => {
    expect(await mentions([PRO_POINT_ONLY], "public", { openToB2c: false })).toBeUndefined();
  });

  it("le pro, à qui ce point est ouvert, la lit", async () => {
    expect(await mentions([PRO_POINT_ONLY], "pro", { openToB2b: false })).toHaveLength(1);
  });

  it("sans aucun point ouvert à sa clientèle, une remise « tout retrait » se tait", async () => {
    const proOnly = [openPoint("pk_pro", { b2b: true, b2c: false })];
    expect(await mentions([BOTH], "public", { openToB2c: false }, proOnly)).toBeUndefined();
  });
});
