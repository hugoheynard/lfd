import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryStopDepositAuthorizedEvent } from "../../domain/events/delivery-doorstep.events.js";
import { StopDecisionDesk } from "../stop-decision-desk.js";
import { AuthorizeStopDepositCommand } from "./authorize-stop-deposit.command.js";

/**
 * **« Autoriser le dépôt cette fois »** (`documentation/livraisons/plan-a-la-porte.md`,
 * B3, § 10 bis, LB-Q5).
 *
 * Dans UNE unité de travail : la décision relue sous le verrou de sa tournée
 * (`StopDecisionDesk`), la réponse posée par l'agrégat — refusée sur un arrêt
 * clos ou une tournée rentrée —, l'écriture conditionnée par sa version, le
 * fait. La TOURNÉE n'est pas écrite : la version que présente le livreur ne
 * bouge pas. Sa carte propose « Déposé avec preuve » dès qu'elle relit (le
 * journal de la journée bouge par la décision).
 *
 * Répéter l'autorisation en vigueur n'écrit rien et ne journalise rien.
 *
 * @throws {StopDecisionNotFoundError} @throws {StopDecisionOnClosedStopError}
 * @throws {StopDecisionOnReturnedRoundError} @throws {StopDecisionStaleError}
 */
@CommandHandler(AuthorizeStopDepositCommand)
export class AuthorizeStopDepositHandler implements ICommandHandler<
  AuthorizeStopDepositCommand,
  void
> {
  constructor(
    private readonly desk: StopDecisionDesk,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AuthorizeStopDepositCommand): Promise<void> {
    await this.uow.run(async () => {
      const at = await this.desk.open(command.stopId, command.staffUserId);
      if (!at.decision.authorizeDeposit(at.stop, at.author, this.clock.now())) {
        return;
      }
      await this.desk.save(at);
      await this.events.publishTraced(
        new DeliveryStopDepositAuthorizedEvent(at.roundKey, at.order, "staff"),
      );
    });
  }
}
