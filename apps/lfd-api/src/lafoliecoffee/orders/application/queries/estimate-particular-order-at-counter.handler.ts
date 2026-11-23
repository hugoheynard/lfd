import type { AdminOrderEstimateNotice, AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { withCatalogueSnapshot } from "../../../catalog/application/catalogue-snapshot-scope.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
} from "../../domain/errors/shop-till-order-errors.js";
import { PLANNED_SUPPLY } from "../../domain/value-objects/order-supply.js";
import { prepareCounterParticularOrder } from "../services/counter-particular-order-preparation.js";
import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting, type DraftedOrder } from "../services/order-drafting.service.js";
import { amountsViewOf } from "./estimate-order-for-customer.handler.js";
import { EstimateParticularOrderAtCounterQuery } from "./estimate-particular-order-at-counter.query.js";

/**
 * **L'estimation de la commande d'un particulier notée au comptoir** : la
 * commande que `PlaceParticularOrderAtCounterHandler` passerait, composée par
 * la même préparation, puis lue sans être écrite — la vue de l'estimation de
 * la saisie pro (`AdminOrderEstimateView`), pour un seul vocabulaire à l'écran.
 *
 * Un refus de la composition revient comme `refusal`, avec les mots de la
 * passation ; la fiche choisie qui n'est pas un particulier reste une erreur,
 * comme à la passation. Aucun avertissement : ni vitrine (la commande est
 * fabriquée), ni crédit (rien ne se règle chez nous).
 */
@QueryHandler(EstimateParticularOrderAtCounterQuery)
export class EstimateParticularOrderAtCounterHandler implements IQueryHandler<
  EstimateParticularOrderAtCounterQuery,
  AdminOrderEstimateView
> {
  constructor(
    private readonly particulars: ParticularStandingReader,
    private readonly drafting: OrderDrafting,
    private readonly cutoffNotice: OrderCutoffNotice,
  ) {}

  /** Le catalogue lu dans l'instantané : l'estimation chiffre, la passation fait foi. */
  execute(query: EstimateParticularOrderAtCounterQuery): Promise<AdminOrderEstimateView> {
    return withCatalogueSnapshot(() => this.estimate(query));
  }

  private async estimate(
    query: EstimateParticularOrderAtCounterQuery,
  ): Promise<AdminOrderEstimateView> {
    const { payload } = query;
    const drafted = await this.draftOrRefusal(query);
    // Le particulier ne passe outre aucune limite de produit : `false`, comme la passation.
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
      amounts: amountsViewOf(drafted.order.amounts()),
      cutoff,
      refusal: null,
      warnings: [],
    };
  }

  private async draftOrRefusal(
    query: EstimateParticularOrderAtCounterQuery,
  ): Promise<DraftedOrder | AdminOrderEstimateNotice> {
    try {
      return await prepareCounterParticularOrder(
        { particulars: this.particulars, drafting: this.drafting },
        query.staffUserId,
        query.payload,
        "estimate",
      );
    } catch (error) {
      if (isCompositionRefusal(error)) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  }
}

/** Un refus de composition — pas la fiche choisie, qui reste l'erreur de la passation. */
function isCompositionRefusal(error: unknown): error is DomainError | BusinessError {
  if (
    error instanceof CounterParticularNotFoundError ||
    error instanceof CounterBuyerIsCompanyMemberError ||
    error instanceof CounterParticularDisabledError
  ) {
    return false;
  }
  return error instanceof DomainError || error instanceof BusinessError;
}
