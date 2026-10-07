import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersBroughtBackFact } from "../../channels/handover/index.js";
import { DeliveryStopBroughtBackEvent } from "../../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { StopDecisionDesk } from "../stop-decision-desk.js";
import { BringStopBackCommand } from "./bring-stop-back.command.js";

/**
 * **« Rapporter »** (`documentation/livraisons/livreur/a-la-porte.md`, B3,
 * § 10 bis, LB-Q2 tranché par Hugo le 2026-10-01).
 *
 * Dans UNE unité de travail :
 * 1. la décision relue sous le verrou de sa tournée (`StopDecisionDesk`) ;
 * 2. la réponse posée par l'agrégat — refusée sur un arrêt clos (déjà remis,
 *    déposé ou rapporté) ou une tournée rentrée ;
 * 3. l'arrêt CLOS par la tournée (`closeStop`, l'exception écrite à I6) : la
 *    commande sort de l'index des arrêts vivants et peut repartir dans une
 *    autre tournée ; elle n'est NI remise NI `fulfilled` — rien n'est attesté ;
 * 4. la décision, la tournée, le fait du journal ;
 * 5. le fait DURABLE `delivery.orders_brought_back`, dans la boîte d'envoi
 *    (`plan-depart-durable.md`, DD1, B2) : le retrait apprend que la commande
 *    est revenue — le fournil peut de nouveau la contrôler. Une décision
 *    annulée n'a pas de fait ; une décision validée est livrée au moins une
 *    fois, même à travers un redémarrage.
 *
 * ⚠️ Clore l'arrêt avance la version de la tournée (c'est la tournée qui
 * clôt) : un geste du livreur présenté sur l'ancienne version est refusé, et
 * sa page relit — l'arrêt rapporté a disparu de ce qu'il doit remettre.
 *
 * @throws {StopDecisionNotFoundError} @throws {StopDecisionOnClosedStopError}
 * @throws {StopDecisionOnReturnedRoundError} @throws {StopDecisionStaleError}
 */
@CommandHandler(BringStopBackCommand)
export class BringStopBackHandler implements ICommandHandler<BringStopBackCommand, void> {
  constructor(
    private readonly desk: StopDecisionDesk,
    private readonly rounds: DeliveryRoundRepository,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: BringStopBackCommand): Promise<void> {
    await this.uow.run(async () => {
      const at = await this.desk.open(command.stopId, command.staffUserId);
      const now = this.clock.now();
      if (!at.decision.bringBack(at.stop, at.author, now)) {
        return;
      }
      at.round.closeStop(command.stopId, now);
      await this.desk.save(at);
      await this.rounds.save(at.round);
      await this.events.publishTraced(
        new DeliveryStopBroughtBackEvent(at.roundKey, at.order, "staff"),
      );
      const fact = new DeliveryOrdersBroughtBackFact(at.round.id, [at.decision.orderId], now);
      await this.durable.publish(fact.durableFact());
    });
  }
}
