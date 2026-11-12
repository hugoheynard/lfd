import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { PayerBillingModeRepository } from "../../domain/ports/payer-billing-mode.repository.js";
import { PayerOrderHistoryReader } from "../../domain/ports/payer-order-history.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { applyPayerModeGesture } from "../payer-billing-mode-gesture-support.js";
import { ChooseInitialPayerBillingModeCommand } from "./choose-initial-payer-billing-mode.command.js";

/**
 * Pose le **premier** mode d'un payeur, sous le droit sociétés (décidé par
 * Hugo le 2026-11-12) : à l'ouverture ou à l'activation d'un compte. Même
 * règle et même fait que le changement ; refusé dès qu'un mode est déjà
 * choisi chez l'entité, sauf le même mode redemandé, qui n'écrit rien.
 */
@CommandHandler(ChooseInitialPayerBillingModeCommand)
export class ChooseInitialPayerBillingModeHandler implements ICommandHandler<
  ChooseInitialPayerBillingModeCommand,
  void
> {
  constructor(
    readonly entities: LegalEntityRepository,
    readonly standings: PayerStandingReader,
    readonly modeDates: BillingModeDatesReader,
    readonly payerModes: PayerBillingModeRepository,
    readonly orderHistory: PayerOrderHistoryReader,
    readonly clock: Clock,
    readonly ids: IdGenerator,
    readonly events: DomainEventPublisher,
    readonly uow: UnitOfWork,
  ) {}

  async execute(command: ChooseInitialPayerBillingModeCommand): Promise<void> {
    await applyPayerModeGesture(this, command, (history, mode, gesture, modes, payer) =>
      history.chooseFirst(mode, gesture, modes, payer),
    );
  }
}
