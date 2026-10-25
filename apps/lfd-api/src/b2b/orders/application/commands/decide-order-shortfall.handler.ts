import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ShortfallDesk } from "../../../../packing/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderShortfall } from "../../domain/entities/order-shortfall.js";
import { ShortfallDecision } from "../../domain/entities/shortfall-decision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderShortfallRepository } from "../../domain/ports/order-shortfall.repository.js";
import { ShortfallDecisionRepository } from "../../domain/ports/shortfall-decision.repository.js";
import { DecideOrderShortfallCommand } from "./decide-order-shortfall.command.js";

/**
 * **« Décider du départ »** (lot E6b, plan
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 12.2 et § 13).
 *
 * Une transaction, et les verrous dans cet ordre — **commande, puis fiche** :
 *
 * 1. la ligne `orders` verrouillée et relue ; l'agrégat juge (signal en
 *    vigueur, confirmée, au compte, sans bon, règles figées, au moins une
 *    pièce au bac) et résout le signal ;
 * 2. le colisage autorise sous le verrou de sa fiche (`ShortfallDesk`) : le
 *    bac doit contenir exactement ce qui part, les lignes dues y sont réduites ;
 * 3. la décision et le signal résolu s'écrivent ;
 * 4. le BL prévu se réécrit aux quantités décidées, ses montants recomposés
 *    (`DeliveryNoteFollowing.followDecision`).
 *
 * Un refus à n'importe quelle étape annule tout : ni fiche réduite sans
 * décision, ni décision sans fiche réduite.
 *
 * @sans-journal la décision EST la trace — auteur, instant, ce qui part, le
 * sort du reste —, en table, définitive ; aucun lecteur du journal ne la
 * demande encore (l'envoi au client d'E6d se tracera sur elle).
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
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DecideOrderShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const locked = await this.decisions.lockSubject(command.orderId);
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
      await this.desk.authorize(command.orderId, decision.departing, command.staffUserId);
      await this.decisions.save(decision);
      await this.shortfalls.save(shortfall);
      await this.deliveryNotes.followDecision(command.orderId);
    });
  }
}
