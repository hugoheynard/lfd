import type { AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { withCatalogueSnapshot } from "../../../catalog/application/catalogue-snapshot-scope.js";
import { prepareCounterParticularOrder } from "../services/counter-particular-order-preparation.js";
import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting, PLACEMENT_POLICY } from "../services/order-drafting.service.js";
import { estimateParticularOrder } from "../services/particular-order-estimation.js";
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
    return withCatalogueSnapshot(() =>
      estimateParticularOrder(
        () =>
          prepareCounterParticularOrder(
            { particulars: this.particulars, drafting: this.drafting },
            query.staffUserId,
            query.payload,
            "estimate",
            PLACEMENT_POLICY,
          ),
        this.cutoffNotice,
        query.payload,
      ),
    );
  }
}
