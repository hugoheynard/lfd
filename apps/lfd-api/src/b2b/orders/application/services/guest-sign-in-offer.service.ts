import type { ShopQuoteFulfillment, SignInOfferView } from "@lfd/contracts";
import type { SaleUnit } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { BasketPromotionReader } from "../../../promotions/domain/ports/basket-promotion.reader.js";
import { LinePromotionReader } from "../../../promotions/domain/ports/line-promotion.reader.js";
import { signInOfferFor } from "../../../promotions/domain/promotion-offers.js";
import type { FulfillmentFact } from "../../../promotions/domain/promotion-targeting.js";
import { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";

/** Le devis demandé : la route (personne, société) et l'acheminement choisi. */
interface QuoteRequest {
  readonly companyId: string | null;
  readonly buyerUserId: string | null;
  readonly payload: { readonly fulfillment: ShopQuoteFulfillment | null };
}

/** Une ligne tarifée du devis, telle que la portée la juge. */
interface QuotedLine {
  readonly line: { readonly sku: string; readonly saleUnit: SaleUnit; readonly quantity: number };
}

/**
 * **« Vous avez un compte ? Connectez-vous pour profiter de −20 % »** (plan
 * des promotions, § 8, lot L10 — décision de Hugo du 2026-10-30).
 *
 * Servi au seul devis ANONYME, quand une promotion réservée aux particuliers
 * inscrits toucherait ce panier. Jamais appliquée sans connexion, et jamais
 * tirée de l'adresse saisie : la boutique ne révèle pas qu'une adresse a un
 * compte.
 *
 * Lit les deux points (ligne et panier) : une promotion « inscrits » de l'un
 * comme de l'autre est ce qu'une connexion ouvrirait. Le rangement des lignes
 * n'est lu que s'il y a une candidate.
 */
@Injectable()
export class GuestSignInOffer {
  constructor(
    private readonly lines: LinePromotionReader,
    private readonly basket: BasketPromotionReader,
    private readonly classifications: OrderLineClassificationReader,
    private readonly clock: Clock,
  ) {}

  /**
   * `undefined` hors du devis ANONYME — un devis reconnu a déjà ce qu'il peut
   * avoir, un devis de société n'est pas celui d'un particulier — et quand
   * rien ne serait ouvert.
   */
  async offerFor(
    request: QuoteRequest,
    resolved: readonly QuotedLine[],
  ): Promise<SignInOfferView | undefined> {
    if (request.buyerUserId !== null || request.companyId !== null || resolved.length === 0) {
      return undefined;
    }
    const quoted = resolved.map(({ line }) => line);
    const [line, basket] = await Promise.all([this.lines.live(), this.basket.live()]);
    const promotions = [...line, ...basket].filter((promotion) =>
      promotion.audiences.some((audience) => audience.kind === "individuals_registered"),
    );
    if (promotions.length === 0) {
      return undefined;
    }
    const known = await this.classifications.classify(quoted.map((entry) => entry.sku));
    return signInOfferFor(
      promotions,
      this.clock.now(),
      quoted.map((entry) => ({
        article: {
          sku: entry.sku,
          productId: known.get(entry.sku)?.productId ?? null,
          categoryPath: known.get(entry.sku)?.categoryPath ?? [],
        },
        point: { kind: "line", saleUnit: entry.saleUnit },
        quantity: entry.quantity,
      })),
      fulfillmentFactOf(request.payload.fulfillment),
    );
  }
}

/** L'acheminement du devis, s'il est choisi ; un point non choisi reste inconnu. */
function fulfillmentFactOf(fulfillment: ShopQuoteFulfillment | null): FulfillmentFact | null {
  if (fulfillment === null) {
    return null;
  }
  return fulfillment.method === "pickup"
    ? { method: "pickup", pickupId: fulfillment.pickupAddressId }
    : { method: "delivery", pickupId: null };
}
