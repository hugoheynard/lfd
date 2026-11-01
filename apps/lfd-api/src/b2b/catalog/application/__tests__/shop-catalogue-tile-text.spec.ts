import type { ContentLocale } from "@lfd/contracts";

import { GivenDeliveryAvailability } from "../../../delivery-availability/domain/ports/__tests__/delivery-availability-doubles.js";
import { FixedLineClassifications } from "../../../orders/domain/ports/__tests__/line-classification-doubles.js";
import { shelfPromotionOffers } from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import type { LivePromotion } from "../../../promotions/domain/live-promotion.js";
import {
  livePromotion,
  type LivePromotionOverrides,
} from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import {
  ShopCatalogueOffers,
  withFulfillmentOffers,
  type ShelfBuyer,
} from "../shop-catalogue-offers.js";
import { shopCatalogueOf } from "../shop-catalogue-view.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * **Ce que la vignette dit d'une promotion** (`plan-texte-de-la-vignette.md`,
 * § 3) : le texte réglé, dans la langue du rayon, sinon la valeur seule.
 * Les dates ne sont comparées qu'à l'horloge figée.
 */

const NOW = new Date(Date.UTC(2030, 0, 1));
const SELLABLE = [catalogItem("PAI-001")];
const TWENTY = { kind: "percent", basisPoints: 2000 } as const;

const coffee = (overrides: LivePromotionOverrides = {}): LivePromotion =>
  livePromotion({
    id: "folie_coffee",
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    validFrom: new Date(0),
    tileText: { fr: "−20 % client Folie Coffee", en: "−20% Folie Coffee guests", it: null },
    ...overrides,
  });

const GUEST: ShelfBuyer = { companyId: null, buyerKind: "guest" };
const REGISTERED: ShelfBuyer = { companyId: null, buyerKind: "registered" };

async function mentions(
  promotions: readonly LivePromotion[],
  language: ContentLocale = "fr",
  buyer: ShelfBuyer = GUEST,
) {
  const offers = new ShopCatalogueOffers(
    shelfPromotionOffers([...promotions], NOW),
    new FixedLineClassifications(),
    new GivenDeliveryAvailability({ openToB2c: false }),
  );
  const catalogue = shopCatalogueOf(SELLABLE, {
    operations: [],
    operationOnlySkus: new Set<string>(),
    now: NOW,
    audience: "public",
  });
  const offered = await offers.offeredFor(buyer, catalogue, "public");
  return withFulfillmentOffers(catalogue, SELLABLE, offered, NOW, language).items[0]
    ?.fulfillmentOffers;
}

describe("le texte d'une promotion sur la vignette", () => {
  it("un texte réglé se dit tel quel, sans acheminement", async () => {
    expect(await mentions([coffee()])).toEqual([
      { effect: TWENTY, text: "−20 % client Folie Coffee" },
    ]);
  });

  it("sans texte, la valeur seule : la clé est absente", async () => {
    const [offer] = (await mentions([coffee({ tileText: null })])) ?? [];

    expect(offer).toEqual({ effect: TWENTY });
    expect(offer).not.toHaveProperty("text");
  });

  it("se lit dans la langue du rayon", async () => {
    expect((await mentions([coffee()], "en"))?.[0]?.text).toBe("−20% Folie Coffee guests");
  });

  it("une langue non traduite se replie sur le français", async () => {
    expect((await mentions([coffee()], "it"))?.[0]?.text).toBe("−20 % client Folie Coffee");
  });

  it("une promotion de livraison seule, à un particulier qu'on ne livre pas : rien", async () => {
    const deliveryOnly = coffee({
      fulfillment: { kind: "basket", pickup: "none", delivery: "all" },
    });

    expect(await mentions([deliveryOnly])).toBeUndefined();
  });

  it("une promotion « inscrits » ne se dit pas à un invité, même avec son texte", async () => {
    const members = coffee({ audiences: [{ kind: "individuals_registered" }] });

    expect(await mentions([members], "fr", GUEST)).toBeUndefined();
    expect((await mentions([members], "fr", REGISTERED))?.[0]?.text).toBe(
      "−20 % client Folie Coffee",
    );
  });
});
