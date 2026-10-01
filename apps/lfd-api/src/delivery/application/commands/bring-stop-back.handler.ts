import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BroughtBackOrdersAnnouncer } from "../../channels/handover/index.js";
import { DeliveryStopBroughtBackEvent } from "../../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { StopDecisionDesk } from "../stop-decision-desk.js";
import { BringStopBackCommand } from "./bring-stop-back.command.js";

const ANNOUNCED = "stop-brought-back-announced";

/**
 * **« Rapporter »** (`documentation/livraisons/plan-a-la-porte.md`, B3,
 * § 10 bis, LB-Q2 tranché par Hugo le 2026-10-01).
 *
 * Dans UNE unité de travail :
 * 1. la décision relue sous le verrou de sa tournée (`StopDecisionDesk`) ;
 * 2. la réponse posée par l'agrégat — refusée sur un arrêt clos (déjà remis,
 *    déposé ou rapporté) ou une tournée rentrée ;
 * 3. l'arrêt CLOS par la tournée (`closeStop`, l'exception écrite à I6) : la
 *    commande sort de l'index des arrêts vivants et peut repartir dans une
 *    autre tournée ; elle n'est NI remise NI `fulfilled` — rien n'est attesté ;
 * 4. la décision, la tournée, le fait.
 *
 * Puis, APRÈS la validation (`AfterCommit`, B0), le retrait apprend que la
 * commande est revenue (`BroughtBackOrdersAnnouncer`) : le fournil peut de
 * nouveau la contrôler. Une décision annulée n'annonce rien.
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
    private readonly announcer: BroughtBackOrdersAnnouncer,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
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
      const orderId = at.decision.orderId;
      this.afterCommit.defer(
        () => this.work.track(this.announcer.ordersBroughtBack([orderId], now), ANNOUNCED),
        ANNOUNCED,
      );
    });
  }
}
