import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { OfferedParticularPlacement } from "../services/offered-particular-placement.js";
import { OrderDrafting, PLACEMENT_POLICY } from "../services/order-drafting.service.js";
import { ensureMayOffer } from "../services/order-offering.js";
import { ORDINARY_STAFF_PLACEMENT } from "../services/staff-order-placement.js";
import {
  OFFERED_PARTICULAR_PLACEMENT_REPLAY,
  offeredParticularPlacementIntent,
} from "./offered-particular-placement-intent.js";
import {
  PlaceOfferedParticularOrderCommand,
  type PlaceOfferedParticularOrderResult,
} from "./place-offered-particular-order.command.js";

/**
 * **La commande offerte à un particulier** (`la-commande-offerte.md`,
 * § 2.5).
 *
 * Une route à part de la saisie pour une société, qui garde sa société
 * obligatoire. Les gestes de l'offre sont ceux de toute passation offerte
 * (`order-offering.ts`) : le droit `b2b_offer_order`, le motif posé sur
 * l'agrégat, le fait `order.offered` dans la transaction. La composition est
 * celle du particulier dans son espace (`prepareOfferedParticularOrder`, dans
 * {@link OfferedParticularPlacement}, que la transformation d'un reliquat
 * partage), puis la ligne d'offre la ramène à zéro : rien à encaisser, le règlement est
 * différé (`not_required`), sans lien ni intention de paiement.
 *
 * Pas de brouillon (O7-5) : la saisie tient en un appel.
 */
@CommandHandler(PlaceOfferedParticularOrderCommand)
export class PlaceOfferedParticularOrderHandler implements ICommandHandler<
  PlaceOfferedParticularOrderCommand,
  PlaceOfferedParticularOrderResult
> {
  private readonly placement: OfferedParticularPlacement;

  constructor(
    particulars: ParticularStandingReader,
    drafting: OrderDrafting,
    orders: OrderRepository,
    events: DomainEventPublisher,
    unitOfWork: UnitOfWork,
    durable: DurablePublisher,
    private readonly intents: OncePerIntent,
    cancellationDeadline: CustomerCancellationDeadline,
  ) {
    this.placement = new OfferedParticularPlacement({
      particulars,
      drafting,
      orders,
      events,
      unitOfWork,
      durable,
      cancellationDeadline,
    });
  }

  /**
   * **Une fois par intention** : la clé de l'écran est réclamée après la garde
   * du droit, et se scelle dans la transaction qui écrit la commande. Un
   * double clic rend la commande déjà offerte ; un refus levé avant
   * l'écriture rend la clé.
   *
   * @throws {OfferNotPermittedError} sans le droit `b2b_offer_order`.
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a déjà offert un autre panier.
   */
  async execute(
    command: PlaceOfferedParticularOrderCommand,
  ): Promise<PlaceOfferedParticularOrderResult> {
    // Avant toute intention scellée : un refus de droit ne consomme pas la clé.
    ensureMayOffer(true, command.mayOffer);
    return await this.intents.runSealed(
      offeredParticularPlacementIntent(command.staffUserId, command.intentKey, command.payload),
      OFFERED_PARTICULAR_PLACEMENT_REPLAY,
      (seal) =>
        this.placement.place(
          { staffUserId: command.staffUserId, payload: command.payload },
          PLACEMENT_POLICY,
          ORDINARY_STAFF_PLACEMENT,
          seal,
        ),
    );
  }
}
