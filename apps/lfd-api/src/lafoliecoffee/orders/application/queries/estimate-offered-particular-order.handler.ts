import type { AdminOrderEstimateView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { withCatalogueSnapshot } from "../../../catalog/application/catalogue-snapshot-scope.js";
import { prepareOfferedParticularOrder } from "../services/offered-particular-order-preparation.js";
import { OrderCutoffNotice } from "../services/order-cutoff-notice.service.js";
import { OrderDrafting, PLACEMENT_POLICY } from "../services/order-drafting.service.js";
import { estimateParticularOrder } from "../services/particular-order-estimation.js";
import { EstimateOfferedParticularOrderQuery } from "./estimate-offered-particular-order.query.js";

/**
 * **L'estimation de la commande offerte à un particulier**
 * (`la-commande-offerte.md`, § 2.10) : la commande que
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
    return withCatalogueSnapshot(() =>
      estimateParticularOrder(
        () =>
          prepareOfferedParticularOrder(
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
