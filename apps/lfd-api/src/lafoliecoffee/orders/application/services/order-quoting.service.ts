import type { OrderLineInput } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { draftedAmountsOf } from "../../domain/entities/order-amounts.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";
import { priceBasket } from "../../domain/services/price-basket.js";
import { placementVatMethodOf } from "../../domain/value-objects/order-vat-method.js";
import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import { OrderLinePricing, type ResolvedOrderLine } from "./order-line-pricing.service.js";
import { OrderOperations } from "./order-operations.service.js";
import type { OrderParties } from "./order-parties.js";
import { PricingContext } from "./pricing-context.service.js";

/** Le devis du simulateur et du client : les lignes tracées, et le sous-total HT. */
export interface QuotedOrderLines {
  /** Les lignes avec leur trace (`explain`) — l'habillage du simulateur. */
  readonly lines: readonly ResolvedOrderLine[];
  readonly subtotalCents: number;
}

/**
 * **Ce que la commande coûterait, sans la passer** — devis B de
 * `/orders/quote` et `/admin/orders/quote` (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, lot L3).
 *
 * Il chiffre par le chemin de la passation : `PricingContext.loadCart`, puis
 * `priceBasket`, puis `draftedAmountsOf` — la composition par méthode que
 * l'agrégat appelle. Il n'ajoute aucune formule : la somme des HT de ligne
 * (`line_ht`) et la composition TTC (`exact_ht`) qu'il faisait lui-même sont
 * celles de la commande. `explain` reste de l'habillage : la trace par ligne
 * (paliers, étapes) que le simulateur affiche.
 *
 * Le panier n'a pas d'acheminement (le contrat n'en porte pas) : ni remise,
 * ni frais, ni surtaxe. En `exact_ht`, le sous-total peut donc encore bouger
 * d'un centime à la passation — l'écart É16, que ce chemin ne ferme pas.
 */
@Injectable()
export class OrderQuoting {
  private readonly context: PricingContext;

  constructor(
    private readonly linePricing: OrderLinePricing,
    private readonly operations: OrderOperations,
    adjustments: CartAdjustments,
    audiences: CustomerAudiences,
    classifications: OrderLineClassificationReader,
    deliveryVat: OrderDeliveryVatReader,
  ) {
    this.context = new PricingContext(
      linePricing,
      adjustments,
      classifications,
      audiences,
      deliveryVat,
    );
  }

  /**
   * Les lignes résolues et le sous-total, dans l'ordre des refus d'avant L3 :
   * tarification, puis opérations datées sans jour.
   *
   * @throws {AppError} le refus de la tarification ou d'une opération datée.
   */
  async quote(parties: OrderParties, lines: readonly OrderLineInput[]): Promise<QuotedOrderLines> {
    const explained = await this.linePricing.explain(lines, parties, "cart");
    // Sans jour : le devis ne juge pas la date, mais il dit déjà qu'une bûche
    // n'est pas encore ouverte, close ou introuvable (D6).
    await this.operations.ensure(lines, parties.companyId);
    const loaded = await this.context.loadCart({
      resolved: explained,
      parties,
      fulfillment: null,
    });
    // Sans acheminement, le chargement ne lit ni point ni zone : il ne refuse rien.
    if (loaded.loaded === null) {
      throw loaded.refusals[0];
    }
    const vatMethod = placementVatMethodOf(parties.companyId);
    const priced = priceBasket(loaded.loaded, { vatMethod, handoverAt: null }, { lateFee: null });
    const amounts = draftedAmountsOf(
      { companyId: parties.companyId, voucher: null, ...priced.terms },
      { method: null },
      vatMethod,
    );
    return { lines: explained, subtotalCents: amounts.subtotalCents };
  }
}
