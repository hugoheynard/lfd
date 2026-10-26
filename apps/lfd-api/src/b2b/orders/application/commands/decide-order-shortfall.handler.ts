import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ShortfallDesk } from "../../../../packing/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderShortfall } from "../../domain/entities/order-shortfall.js";
import { ShortfallDecision } from "../../domain/entities/shortfall-decision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderShortfallDecidedEvent } from "../../domain/events/order-shortfall-decided.event.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderShortfallRepository } from "../../domain/ports/order-shortfall.repository.js";
import { ShortfallDecisionRepository } from "../../domain/ports/shortfall-decision.repository.js";
import { DecideOrderShortfallCommand } from "./decide-order-shortfall.command.js";

/**
 * **« Décider du départ »** (lot E6b, plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.2 et § 13).
 *
 * Une transaction, et les verrous dans cet ordre — **commande, puis fiche** :
 *
 * 1. la ligne `orders` verrouillée et relue, avec l'envoi signalé ; l'agrégat
 *    juge (signal en vigueur, envoi encore à coliser — commande confirmée au
 *    rang 1, BL du reliquat prévu au-delà —, au compte, sans bon, règles
 *    figées, au moins une pièce au bac) et résout le signal ;
 * 2. le colisage autorise sous le verrou de la fiche DE CET ENVOI
 *    (`ShortfallDesk`) : le bac doit contenir exactement ce qui part, les
 *    lignes dues y sont réduites ;
 * 3. la décision et le signal résolu s'écrivent ;
 * 4. le BL de l'envoi se réécrit aux quantités décidées, ses montants
 *    recomposés (`DeliveryNoteFollowing.followDecision`) — le BL-1 au rang 1,
 *    celui du reliquat au-delà ; l'autre ne bouge pas.
 *
 * Un refus à n'importe quelle étape annule tout : ni fiche réduite sans
 * décision, ni décision sans fiche réduite.
 *
 * 5. le fait `order.shortfall_decided` part dans la boîte d'envoi (plan
 *    E6c2, § 5) : une décision d'argent prise par une personne apparaît au
 *    journal d'activité — auteur, ce qui part, le reste.
 *
 * @throws {OrderNotFoundError} et les refus de {@link ShortfallDecision.decide}
 * et de `ShortfallDesk.authorize`.
 */
@CommandHandler(DecideOrderShortfallCommand)
export class DecideOrderShortfallHandler implements ICommandHandler<
  DecideOrderShortfallCommand,
  void
> {
  constructor(
    private readonly decisions: ShortfallDecisionRepository,
    private readonly shortfalls: OrderShortfallRepository,
    private readonly desk: ShortfallDesk,
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly durable: DurablePublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DecideOrderShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const locked = await this.decisions.lockSubject(command.orderId, command.rank);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      const shortfall = OrderShortfall.fromSnapshot(locked.shortfall);
      const decision = ShortfallDecision.decide(locked.subject, shortfall, {
        id: this.ids.next(),
        decidedAt: this.clock.now(),
        decidedBy: command.staffUserId,
        remainder: command.remainder,
      });
      await this.desk.authorize(
        command.orderId,
        command.rank,
        decision.departing,
        command.staffUserId,
      );
      // Le signal d'abord : la décision désigne sa ligne (clé étrangère).
      await this.shortfalls.save(shortfall);
      await this.decisions.save(decision);
      await this.deliveryNotes.followDecision(command.orderId, command.rank);
      await this.durable.publish(
        new OrderShortfallDecidedEvent(
          command.orderId,
          command.rank,
          locked.subject.reference,
          locked.placedByUserId,
          command.staffUserId,
          decision.departing,
          command.remainder,
        ).durableFact(),
      );
    });
  }
}
