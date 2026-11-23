import type { AdminOrderEstimateNotice, AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { withCatalogueSnapshot } from "../../../catalog/application/catalogue-snapshot-scope.js";
import { PLANNED_SUPPLY } from "../../domain/value-objects/order-supply.js";
import { prepareOfferedParticularOrder } from "../services/offered-particular-order-preparation.js";
import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting, type DraftedOrder } from "../services/order-drafting.service.js";
import { amountsViewOf } from "./estimate-order-for-customer.handler.js";
import { isParticularCompositionRefusal } from "./estimate-particular-order-at-counter.handler.js";
import { EstimateOfferedParticularOrderQuery } from "./estimate-offered-particular-order.query.js";

/**
 * **L'estimation de la commande offerte à un particulier**
 * (`plan-commande-offerte.md`, § 2.4, O7c) : la commande que
 * `PlaceOfferedParticularOrderHandler` passerait, composée par la même
 * préparation, puis lue sans être écrite — la vue de l'estimation de la
 * saisie pour une société, pour un seul vocabulaire à l'écran.
 *
 * Avec le motif, elle rend un total nul et la valeur offerte
 * (`offeredTotalCents`) ; sans, la valeur pleine. Un refus de la composition
 * (une livraison fermée aux particuliers, un code postal non desservi)
 * revient comme `refusal`, avec les mots de la passation ; la fiche choisie
 * qui n'est pas un particulier reste une erreur, comme à la passation. Le
 * droit d'offrir ne se juge pas ici : elle n'écrit rien et ne dit que des prix
 * publics.
 */
@QueryHandler(EstimateOfferedParticularOrderQuery)
export class EstimateOfferedParticularOrderHandler implements IQueryHandler<
  EstimateOfferedParticularOrderQuery,
  AdminOrderEstimateView
> {
  constructor(
    private readonly particulars: ParticularStandingReader,
    private readonly drafting: OrderDrafting,
    private readonly cutoffNotice: OrderCutoffNotice,
  ) {}

  /** Le catalogue lu dans l'instantané : l'estimation chiffre, la passation fait foi. */
  execute(query: EstimateOfferedParticularOrderQuery): Promise<AdminOrderEstimateView> {
    return withCatalogueSnapshot(() => this.estimate(query));
  }

  private async estimate(
    query: EstimateOfferedParticularOrderQuery,
  ): Promise<AdminOrderEstimateView> {
    const { payload } = query;
    const drafted = await this.draftOrRefusal(query);
    // La passation ne passe outre aucune limite de produit : `false`.
    const cutoff = await this.cutoffNotice.forDay(
      payload.lines.map((line) => line.sku),
      payload.requestedDeliveryDate,
      PLANNED_SUPPLY.supply,
      false,
    );
    if (!("order" in drafted)) {
      return { amounts: null, cutoff, refusal: drafted, warnings: [] };
    }
    return {
      amounts: amountsViewOf(drafted.order.amounts(), drafted.order.offer),
      cutoff,
      refusal: null,
      warnings: [],
    };
  }

  private async draftOrRefusal(
    query: EstimateOfferedParticularOrderQuery,
  ): Promise<DraftedOrder | AdminOrderEstimateNotice> {
    try {
      return await prepareOfferedParticularOrder(
        { particulars: this.particulars, drafting: this.drafting },
        query.staffUserId,
        query.payload,
        "estimate",
      );
    } catch (error) {
      if (isParticularCompositionRefusal(error)) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  }
}
