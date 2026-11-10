import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderShortfall } from "../../domain/entities/order-shortfall.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { ShortfallDecisionRepository } from "../../domain/ports/shortfall-decision.repository.js";
import { ShortfallDeparture } from "../services/shortfall-departure.js";
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
 * Le corps (étapes 1 à 5 après le verrou) est `ShortfallDeparture`, partagé
 * avec le départ décidé au comptoir (2026-11-03).
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
    private readonly departure: ShortfallDeparture,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DecideOrderShortfallCommand): Promise<void> {
    await this.uow.run(async () => {
      const locked = await this.decisions.lockSubject(command.orderId, command.rank);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      await this.departure.decide(locked, OrderShortfall.fromSnapshot(locked.shortfall), {
        staffUserId: command.staffUserId,
        remainder: command.remainder,
      });
    });
  }
}
