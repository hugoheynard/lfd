import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ChorusDepositRepository } from "../../domain/ports/chorus-deposit.repository.js";
import { noteChorusGesture } from "../chorus-deposit-support.js";
import { NoteChorusDepositCommand } from "./note-chorus-deposit.command.js";

/**
 * Le geste noté par l'agrégat `ChorusDeposit`, qui en juge l'ordre et les
 * dates ; une ligne au journal de dépôt et un fait, dans une transaction.
 *
 * @throws {ChorusDepositInvoiceNotFoundError} la pièce n'existe pas.
 * @throws les refus de `ChorusDeposit`.
 */
@CommandHandler(NoteChorusDepositCommand)
export class NoteChorusDepositHandler implements ICommandHandler<NoteChorusDepositCommand, void> {
  constructor(
    private readonly deposits: ChorusDepositRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: NoteChorusDepositCommand): Promise<void> {
    const { deposits, authors, ids, clock, events, uow } = this;
    return noteChorusGesture(
      { deposits, authors, ids, clock, events, uow },
      command,
      (deposit, gesture) => deposit.deposit(gesture),
    );
  }
}
