import { Injectable } from "@nestjs/common";

import {
  OccurrencePlacement,
  type OccurrencePlacementOutcome,
  type OccurrencePlacementRequest,
} from "../../../../recurring/channels/commerce/index.js";
import { UnattendedOrderPlacement } from "./unattended-order-placement.js";

const BUYER_LEFT: OccurrencePlacementOutcome = {
  kind: "refused",
  cause: "buyer_left",
  reason:
    "La personne qui a ouvert ce panier n'est plus membre de la société : arrêtez le panier, et faites-en ouvrir un par un membre actuel.",
  final: false,
};

const PUBLIC_PAYER: OccurrencePlacementOutcome = {
  kind: "refused",
  cause: "order_refused",
  reason:
    "Cette société est un payeur public : ses commandes ne se passent pas par un panier récurrent. Arrêtez le panier, et passez ses commandes une à une.",
  final: false,
};

/**
 * **Passe l'échéance d'un panier récurrent** — l'implémentation, par le
 * commerce, du port que les paniers déclarent (plan `plan-bloc-recurrent.md`,
 * § 6.1), par la passation sans personne devant l'écran
 * ({@link UnattendedOrderPlacement}). Seuls le créneau du panier et la
 * version des CGV qu'il applique au jour servi sont imposés.
 *
 * **Une échéance, au plus une commande**, tenu en base par l'index
 * `orders_one_per_occurrence` : un rejeu rend la commande déjà passée.
 */
@Injectable()
export class RecurringOccurrencePlacement extends OccurrencePlacement {
  constructor(private readonly unattended: UnattendedOrderPlacement) {
    super();
  }

  async place(request: OccurrencePlacementRequest): Promise<OccurrencePlacementOutcome> {
    const guarded = await this.unattended.buyerRefusal(request.companyId, request.buyerUserId);
    if (guarded !== null) {
      return guarded === "public_payer" ? PUBLIC_PAYER : BUYER_LEFT;
    }
    return this.unattended.place({
      companyId: request.companyId,
      buyerUserId: request.buyerUserId,
      serviceDay: request.serviceDay,
      routing: request.routing,
      lines: request.lines,
      note: request.note,
      salesTerms: request.salesTerms,
      provenance: {
        subscriptionId: request.basketId,
        occurrenceDay: request.serviceDay,
        deltas: { added: [...request.deltas.added], removed: [...request.deltas.removed] },
      },
    });
  }
}
