import type { ShopCatalogueView, ShopItemFulfillmentOfferView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderLineClassificationReader } from "../../orders/domain/ports/order-line-classification.reader.js";
import { ShelfPromotionOffers } from "../../promotions/application/shelf-promotion-offers.js";
import type { LivePromotion } from "../../promotions/domain/live-promotion.js";
import {
  fulfillmentOffersFor,
  offersNeedProducts,
  type FulfillmentOffer,
} from "../../promotions/domain/promotion-offers.js";
import type { PricedBuyerKind } from "../../promotions/domain/promotion-targeting.js";
import type { ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import {
  admitsPromotion,
  type PromotionAdmission,
} from "../../pricing/domain/entities/mercuriale-promotion-policy.js";
import { shownByShopSku } from "./shop-catalogue-view.js";

/** La porte d'entrée d'un rayon : la route (invité, reconnu) ou l'aperçu déclaré. */
export type ShelfBuyerKind = Extract<PricedBuyerKind, "guest" | "registered" | "previewed">;

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
}

/**
 * **Ce que le rayon mentionne** (lot L10) — les candidates, et le produit des
 * articles, lu seulement quand une candidate vise un produit : une rafale de
 * visiteurs ne paie pas une lecture de plus pour une portée qui ne le demande pas.
 */
@Injectable()
export class ShopCatalogueOffers {
  constructor(
    private readonly offers: ShelfPromotionOffers,
    private readonly classifications: OrderLineClassificationReader,
  ) {}

  async offeredFor(buyer: ShelfBuyer, catalogue: ShopCatalogueView): Promise<ShelfOffered> {
    const candidates = await this.offers.candidatesFor(buyer);
    if (!offersNeedProducts(candidates)) {
      return { candidates, productIds: new Map() };
    }
    const classified = await this.classifications.classify(catalogue.items.map((item) => item.sku));
    return {
      candidates,
      productIds: new Map([...classified].map(([sku, found]) => [sku, found.productId])),
    };
  }
}

/** La vitrine au prix résolu, et la politique de la mercuriale qui fixe chaque article. */
export interface ShelfPrices {
  readonly view: ShopCatalogueView;
  /** Par SKU affiché ; absent = aucune mercuriale ne fixe l'article à la quantité 1. */
  readonly sealing: ReadonlyMap<string, PromotionAdmission>;
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
 * qui la couvrent — « −20 % avec retrait à Cœur de station » —, sans que son
 * prix bouge. Une vignette sans promotion garde sa forme : la clé est absente
 * du fil, la surface publique reste étroite.
 *
 * 🔴 Sur un article que la mercuriale du lecteur fixe, une promotion que sa
 * politique exclut n'est PAS mentionnée (`plan-la-mercuriale-decide.md`, § 8) :
 * la caisse ne l'appliquerait pas. Sur ses articles non négociés, rien ne change.
 */
export function withFulfillmentOffers(
  catalogue: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
  { candidates, productIds }: ShelfOffered,
  sealing: ReadonlyMap<string, PromotionAdmission> = new Map(),
): ShopCatalogueView {
  if (candidates.length === 0) {
    return catalogue;
  }
  const byShopSku = shownByShopSku(sellable);
  return {
    ...catalogue,
    items: catalogue.items.map((item) => {
      const source = byShopSku.get(item.sku);
      const admission = sealing.get(item.sku);
      const offers =
        source === undefined
          ? []
          : fulfillmentOffersFor(candidates, {
              sku: item.sku,
              productId: productIds.get(item.sku) ?? null,
              categoryPath: source.family.path,
            }).filter(
              (offer) => admission === undefined || admitsPromotion(admission, offer.promotionId),
            );
      return offers.length === 0 ? item : { ...item, fulfillmentOffers: offers.map(offerView) };
    }),
  };
}

function offerView(offer: FulfillmentOffer): ShopItemFulfillmentOfferView {
  return { effect: offer.effect, fulfillment: offer.fulfillment };
}
