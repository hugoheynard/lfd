import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { AppError } from "../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InHouseRecap } from "../../domain/entities/in-house-recap.js";
import { InHouseMonthPayersReader } from "../../../account/domain/ports/in-house-month-payers.reader.js";
import { InHouseRecapDocument } from "../../domain/ports/in-house-recap-document.js";
import { InHouseRecapRepository } from "../../domain/ports/in-house-recap.repository.js";
import { InHouseRecapRuns } from "../../domain/ports/in-house-recap-runs.js";
import { RecapDeliveryNotesReader } from "../../domain/ports/recap-delivery-notes.reader.js";
import { RecapNumbering } from "../../domain/ports/recap-numbering.js";
import { aggregateRecapLines } from "../../domain/services/recap-aggregation.js";
import { RecapMonth } from "../../domain/value-objects/recap-month.js";
import { announceIssued } from "../recap-document-support.js";
import {
  IssueInHouseRecapsCommand,
  type InHouseRecapOutcome,
  type InHouseRecapsReport,
} from "./issue-in-house-recaps.command.js";

/**
 * **Le passage mensuel** (`restaurants-maison.md`). Pour le
 * dernier mois clos à Paris, chaque payeur maison du mois — marqué pendant le
 * mois, ou payeur d'un BL interne remis dans le mois — reçoit UNE issue :
 * un récapitulatif, ou un mois vide. L'issue et le document s'écrivent dans
 * la même transaction, par payeur ; une issue déjà rangée fait taire le
 * passage, qui se rejoue donc sans rien réécrire.
 *
 * Un payeur en échec n'arrête pas les autres : son issue n'est pas écrite (le
 * mois reste manqué, l'écran le montre), l'échec est journalisé et rendu.
 */
@CommandHandler(IssueInHouseRecapsCommand)
export class IssueInHouseRecapsHandler implements ICommandHandler<
  IssueInHouseRecapsCommand,
  InHouseRecapsReport
> {
  private readonly logger = new Logger(IssueInHouseRecapsHandler.name);

  constructor(
    private readonly monthPayers: InHouseMonthPayersReader,
    private readonly notes: RecapDeliveryNotesReader,
    private readonly runs: InHouseRecapRuns,
    private readonly recaps: InHouseRecapRepository,
    private readonly numbering: RecapNumbering,
    private readonly document: InHouseRecapDocument,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<InHouseRecapsReport> {
    const now = this.clock.now();
    const month = RecapMonth.lastClosedAt(now);
    const window = month.window();
    const payers = new Set([
      ...(await this.monthPayers.payersInHouseDuring(window)),
      ...(await this.notes.payersWithUncoveredNotes(window)),
    ]);
    const outcomes: InHouseRecapOutcome[] = [];
    for (const payerId of [...payers].sort()) {
      outcomes.push(await this.attempt(payerId, month, now));
    }
    for (const outcome of outcomes) {
      if (outcome.kind === "issued") {
        await announceIssued(this.document, outcome.recapId, this.logger);
      }
    }
    return { month: month.key, outcomes };
  }

  private async attempt(
    payerId: string,
    month: RecapMonth,
    now: Date,
  ): Promise<InHouseRecapOutcome> {
    try {
      return await this.uow.run(() => this.issueFor(payerId, month, now));
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      this.logger.error(
        `Récapitulatif ${month.key} du payeur ${payerId} non émis : ${error.code} — ${error.message}`,
      );
      return { payerId, kind: "failed", code: error.code };
    }
  }

  /** L'issue d'abord : c'est son unicité qui décide qui émet. */
  private async issueFor(
    payerId: string,
    month: RecapMonth,
    now: Date,
  ): Promise<InHouseRecapOutcome> {
    const notes = await this.notes.uncoveredNotesOf(payerId, month.window(), null);
    const recapId = aggregateRecapLines(notes).length === 0 ? null : this.ids.next();
    const claimed = await this.runs.claim({
      id: this.ids.next(),
      payerId,
      month: month.key,
      recapId,
      attemptedAt: now,
    });
    if (!claimed) {
      return { payerId, kind: "already_attempted" };
    }
    if (recapId === null) {
      return { payerId, kind: "empty" };
    }
    const recap = InHouseRecap.issue({
      id: recapId,
      payerId,
      month,
      number: await this.numbering.next(month),
      issuedAt: now,
      notes,
    });
    await this.recaps.save(recap);
    return { payerId, kind: "issued", recapId };
  }
}
