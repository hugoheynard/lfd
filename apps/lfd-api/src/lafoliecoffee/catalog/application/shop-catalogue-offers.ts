import {
  deliveryOpenTo,
  type ContentLocale,
  type ShopCatalogueView,
  type ShopItemFulfillmentOfferView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryAvailabilityReader } from "../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";
import { OrderLineClassificationReader } from "../../orders/domain/ports/order-line-classification.reader.js";
import { ShelfPromotionOffers } from "../../promotions/application/shelf-promotion-offers.js";
import type { LivePromotion } from "../../promotions/domain/live-promotion.js";
import {
  fulfillmentOffersFor,
  offerOpenTo,
  offersNeedProducts,
  type OpenFulfillments,
  type FulfillmentOffer,
} from "../../promotions/domain/promotion-offers.js";
import type { PricedBuyerKind } from "../../promotions/domain/promotion-targeting.js";
import { tileTextIn } from "../../promotions/domain/promotion-tile-text.js";
import type { ResolvedCatalogItem, ShopAudience } from "../domain/ports/catalog.reader.js";
import {
  admitsPromotion,
  type PromotionAdmission,
} from "../../pricing/domain/entities/mercuriale-promotion-policy.js";
import type { PromotionNameLabels } from "./shop-catalogue-promotion-names.js";
import { shownByShopSku } from "./shop-catalogue-view.js";

/** La porte d'entrée d'un rayon : la route (invité, reconnu) ou l'aperçu déclaré. */
export type ShelfBuyerKind = Extract<PricedBuyerKind, "guest" | "registered" | "previewed">;

/** Sans candidate, rien n'est lu : aucun acheminement n'a à être cité. */
const NOTHING_OPEN: OpenFulfillments = { delivery: false, pickupPoints: new Set() };

/** Pour qui le rayon se tarife — la société du LECTEUR et la porte de la route. */
export interface ShelfBuyer {
  readonly companyId: string | null;
  readonly buyerKind: ShelfBuyerKind;
}

/** Les promotions que le rayon mentionne, et le produit des articles s'il le faut. */
export interface ShelfOffered {
  readonly candidates: readonly LivePromotion[];
  /** Vide quand aucune candidate ne vise un produit — rien n'a été lu. */
  readonly productIds: ReadonlyMap<string, string | null>;
  /** Ce que la clientèle du lecteur peut utiliser : un acheminement fermé ne se cite pas. */
  readonly open: OpenFulfillments;
}

/**
 * **Ce que le rayon mentionne** (lot L10) — les candidates, et le produit des
 * articles, lu seulement quand une candidate vise un produit : une rafale de
 * visiteurs ne paie pas une lecture de plus pour une portée qui ne le demande pas.
 *
 * Le réglage de livraison n'est lu que s'il y a une candidate : la livraison
 * fermée à la clientèle du rayon (`/delivery-availability`), une mention
 * « en livraison » serait une fausse information (2026-11-01). Les points de
 * retrait de sa clientèle aussi : une remise sur un point qu'elle ne peut pas
 * choisir ne se dit pas.
 */
@Injectable()
export class ShopCatalogueOffers {
  constructor(
    private readonly offers: ShelfPromotionOffers,
    private readonly classifications: OrderLineClassificationReader,
    private readonly delivery: DeliveryAvailabilityReader,
    private readonly pickups: PickupAddressRepository,
  ) {}

  async offeredFor(
    buyer: ShelfBuyer,
    catalogue: ShopCatalogueView,
    audience: ShopAudience,
  ): Promise<ShelfOffered> {
    const candidates = await this.offers.candidatesFor({ kind: "real", ...buyer });
    if (candidates.length === 0) {
      return { candidates, productIds: new Map(), open: NOTHING_OPEN };
    }
    const open = await this.openTo(audience);
    if (!offersNeedProducts(candidates)) {
      return { candidates, productIds: new Map(), open };
    }
    const classified = await this.classifications.classify(catalogue.items.map((item) => item.sku));
    return {
      candidates,
      productIds: new Map([...classified].map(([sku, found]) => [sku, found.productId])),
      open,
    };
  }

  private async openTo(audience: ShopAudience): Promise<OpenFulfillments> {
    const clientele = audience === "pro" ? "b2b" : "b2c";
    const [settings, points] = await Promise.all([
      this.delivery.current(),
      this.pickups.list(clientele),
    ]);
    return {
      delivery: deliveryOpenTo(settings, clientele),
      pickupPoints: new Set(points.map((point) => point.id)),
    };
  }
}

/** La vitrine au prix résolu, et la politique de la mercuriale qui fixe chaque article. */
export interface ShelfPrices {
  readonly view: ShopCatalogueView;
  /** Par SKU affiché ; absent = aucune mercuriale ne fixe l'article à la quantité 1. */
  readonly sealing: ReadonlyMap<string, PromotionAdmission>;
  /** Par SKU affiché, les promotions qui ont baissé son prix ; absent = aucune. */
  readonly promotionNames: ReadonlyMap<string, readonly PromotionNameLabels[]>;
}

/** Ce que la mercuriale du lecteur laisse passer, article par article. */
export function sealingOfShelf(
  priced: readonly { readonly sku: string; readonly sealingAdmission: PromotionAdmission | null }[],
): ReadonlyMap<string, PromotionAdmission> {
  return new Map(
    priced.flatMap((entry) =>
      entry.sealingAdmission === null ? [] : [[entry.sku, entry.sealingAdmission] as const],
    ),
  );
}

/**
 * **Le rayon et ce qu'un acheminement y ouvrirait** (plan des promotions,
 * § 13.2 RAYON, lot L10) : chaque vignette porte les promotions de panier
 * qui la couvrent, sans que son prix bouge. Elle se dit par le texte réglé
 * sur la promotion, dans la langue du rayon (« −20 % client Folie Coffee »),
 * sinon par la valeur seule — jamais par l'acheminement
 * (`plan-texte-de-la-vignette.md`). QUAND elle se dit ne change pas. Une vignette sans promotion garde sa forme : la clé est absente
 * du fil, la surface publique reste étroite.
 *
 * 🔴 Sur un article que la mercuriale du lecteur fixe, une promotion que sa
 * politique exclut n'est PAS mentionnée (`plan-la-mercuriale-decide.md`, § 8) :
 * la caisse ne l'appliquerait pas. Sur ses articles non négociés, rien ne change.
 *
 * Une promotion à jours et heures dit ses heures, active ou non à `at` ; hors
 * de ses heures, elle n'est mentionnée que si elle a choisi de les dire
 * (`plan-jours-et-heures.md`, § 8).
 */
export function withFulfillmentOffers(
  catalogue: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
  { candidates, productIds, open }: ShelfOffered,
  at: Date,
  language: ContentLocale,
  sealing: ReadonlyMap<string, PromotionAdmission> = new Map(),
): ShopCatalogueView {
  if (candidates.length === 0) {
    return catalogue;
  }
  const byShopSku = shownByShopSku(sellable);
  const byId = new Map(candidates.map((promotion) => [promotion.id, promotion]));
  const view = (offer: FulfillmentOffer): ShopItemFulfillmentOfferView =>
    offerView(offer, tileTextIn(byId.get(offer.promotionId)?.tileText ?? null, language));
  return {
    ...catalogue,
    items: catalogue.items.map((item) => {
      const source = byShopSku.get(item.sku);
      const admission = sealing.get(item.sku);
      const offers =
        source === undefined
          ? []
          : fulfillmentOffersFor(
              candidates,
              {
                sku: item.sku,
                productId: productIds.get(item.sku) ?? null,
                categoryPath: source.family.path,
              },
              at,
            )
              .filter(
                (offer) => admission === undefined || admitsPromotion(admission, offer.promotionId),
              )
              .flatMap((offer) => offerOpenTo(offer, open) ?? []);
      return offers.length === 0 ? item : { ...item, fulfillmentOffers: offers.map(view) };
    }),
  };
}

/** La mention servie : l'effet, le texte s'il est réglé, les heures s'il y en a. */
function offerView(offer: FulfillmentOffer, text: string | null): ShopItemFulfillmentOfferView {
  return {
    effect: offer.effect,
    // Sans texte, la clé est absente : la boutique dit la valeur seule.
    ...(text === null ? {} : { text }),
    // Les jours et heures (plan jours et heures, § 8) : absents sans eux.
    ...(offer.hours === undefined ? {} : { hours: offer.hours }),
  };
}
