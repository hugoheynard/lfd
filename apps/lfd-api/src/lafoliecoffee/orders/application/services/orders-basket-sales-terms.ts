import { Injectable } from "@nestjs/common";

import {
  BasketSalesTerms,
  type SalesTermsInForce,
} from "../../../../recurring/channels/commerce/index.js";
import { OrderSalesTermsReader } from "../../domain/ports/order-sales-terms.reader.js";
import { salesTermsOf } from "../../domain/services/sales-terms-of.js";
import { CustomerAudiences } from "./customer-audiences.service.js";

/**
 * **Les CGV en vigueur pour l'acheteur d'un panier récurrent** — le port que
 * les paniers déclarent, implémenté par le commerce avec la règle même de la
 * passation : la clientèle qui tarifera ses commandes choisit le texte
 * (`salesTermsOf`), le contenu dit sa révision en ligne.
 */
@Injectable()
export class OrdersBasketSalesTerms extends BasketSalesTerms {
  constructor(
    private readonly audiences: CustomerAudiences,
    private readonly salesTerms: OrderSalesTermsReader,
  ) {
    super();
  }

  async inForceFor(companyId: string | null): Promise<SalesTermsInForce> {
    const key = salesTermsOf(await this.audiences.of(companyId));
    return { key, ...(await this.salesTerms.inForce(key)) };
  }
}
