import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { OrderDrafting, PLACEMENT_POLICY } from "../services/order-drafting.service.js";
import { ShopTillParticularPlacement } from "../services/shop-till-particular-placement.js";
import { ORDINARY_STAFF_PLACEMENT } from "../services/staff-order-placement.js";
import {
  PARTICULAR_COUNTER_PLACEMENT_REPLAY,
  particularCounterPlacementIntent,
} from "./particular-counter-placement-intent.js";
import {
  PlaceParticularOrderAtCounterCommand,
  type PlaceParticularOrderAtCounterResult,
} from "./place-particular-order-at-counter.command.js";

/**
 * **La commande d'un particulier notée au comptoir, réglée à la caisse de la
 * boutique** (`commande-particulier-reglee-en-boutique.md`, § 4–5).
 *
 * La composition est celle du particulier dans son espace
 * (`prepareCounterParticularOrder`, partagée avec l'estimation) ; le
 * règlement n'est jamais une question : `Order.settleAtShopTill` pose
 * `not_required` et le lieu `shop_till`, dans {@link ShopTillParticularPlacement},
 * que la transformation d'un reliquat de particulier partage. Aucune intention de paiement, aucun
 * lien, aucun bon de fidélité. L'accusé de commande part par le fait durable
 * `CommerceOrderPlacedFact`, comme pour toute commande décidée à la passation.
 */
@CommandHandler(PlaceParticularOrderAtCounterCommand)
export class PlaceParticularOrderAtCounterHandler implements ICommandHandler<
  PlaceParticularOrderAtCounterCommand,
  PlaceParticularOrderAtCounterResult
> {
  private readonly placement: ShopTillParticularPlacement;

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
    this.placement = new ShopTillParticularPlacement({
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
   * **Une fois par intention** : la clé de l'écran est réclamée avant tout, et
   * se scelle dans la transaction qui écrit la commande. Un double clic rend
   * la commande déjà notée ; un refus levé avant l'écriture rend la clé.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a déjà noté un autre panier.
   */
  execute(
    command: PlaceParticularOrderAtCounterCommand,
  ): Promise<PlaceParticularOrderAtCounterResult> {
    return this.intents.runSealed(
      particularCounterPlacementIntent(command.staffUserId, command.intentKey, command.payload),
      PARTICULAR_COUNTER_PLACEMENT_REPLAY,
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
