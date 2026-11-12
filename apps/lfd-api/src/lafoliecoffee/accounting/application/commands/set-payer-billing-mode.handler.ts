import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { PayerChangeLock } from "../../domain/ports/payer-change-lock.js";
import { PayerCollectionMeansReader } from "../../domain/ports/payer-collection-means.reader.js";
import { PayerBillingModeRepository } from "../../domain/ports/payer-billing-mode.repository.js";
import { PayerOrderHistoryReader } from "../../domain/ports/payer-order-history.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { applyPayerModeGesture } from "../payer-billing-mode-gesture-support.js";
import { SetPayerBillingModeCommand } from "./set-payer-billing-mode.command.js";

/**
 * Change le mode d'un payeur. Le domaine juge qu'il est un payeur
 * (`requireBillingPayer`), puis l'historique fixe la prise d'effet —
 * immédiate pour un payeur qui n'a jamais commandé, sinon la prochaine
 * clôture de sa suite ACTUELLE, lue sur les dates des modes — et tient « un
 * seul changement à la fois ». Le mode qu'il a déjà choisi, redemandé, n'est
 * pas un fait.
 */
@CommandHandler(SetPayerBillingModeCommand)
export class SetPayerBillingModeHandler implements ICommandHandler<
  SetPayerBillingModeCommand,
  void
> {
  constructor(
    readonly entities: LegalEntityRepository,
    readonly standings: PayerStandingReader,
    readonly modeDates: BillingModeDatesReader,
    readonly payerModes: PayerBillingModeRepository,
    readonly orderHistory: PayerOrderHistoryReader,
    readonly payerMeans: PayerCollectionMeansReader,
    readonly lock: PayerChangeLock,
    readonly clock: Clock,
    readonly ids: IdGenerator,
    readonly events: DomainEventPublisher,
    readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPayerBillingModeCommand): Promise<void> {
    await applyPayerModeGesture(this, command, (history, mode, gesture, modes, payer) =>
      history.change(mode, gesture, modes, payer),
    );
  }
}
