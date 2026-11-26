import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InHouseRecapNotFoundError } from "../../domain/errors/in-house-recap-errors.js";
import { InHouseRecapDocument } from "../../domain/ports/in-house-recap-document.js";
import { InHouseRecapRepository } from "../../domain/ports/in-house-recap.repository.js";
import { RecapDeliveryNotesReader } from "../../domain/ports/recap-delivery-notes.reader.js";
import { RecapNumbering } from "../../domain/ports/recap-numbering.js";
import { announceIssued } from "../recap-document-support.js";
import { ReissueInHouseRecapCommand } from "./reissue-in-house-recap.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const REISSUE_IN_HOUSE_RECAP_GESTURE = "in-house-recap.reissue";

/**
 * Le rectificatif (D8) : relit les BL du mois du payeur — ceux de l'ancien
 * récapitulatif comptent comme libres —, émet un récapitulatif neuf et marque
 * l'ancien remplacé, dans une transaction.
 * Rend l'identifiant du rectificatif ; un rejeu de la même intention le rend
 * sans rien réémettre, et sans reprévenir le document.
 *
 * @throws {InHouseRecapNotFoundError} le récapitulatif n'existe pas.
 * @throws {InHouseRecapAlreadyReplacedError} il a déjà été remplacé.
 * @throws {EmptyInHouseRecapError} plus aucun BL remis dans le mois.
 */
@CommandHandler(ReissueInHouseRecapCommand)
export class ReissueInHouseRecapHandler implements ICommandHandler<
  ReissueInHouseRecapCommand,
  string
> {
  private readonly logger = new Logger(ReissueInHouseRecapHandler.name);

  constructor(
    private readonly recaps: InHouseRecapRepository,
    private readonly notes: RecapDeliveryNotesReader,
    private readonly numbering: RecapNumbering,
    private readonly document: InHouseRecapDocument,
    private readonly intents: OncePerIntent,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReissueInHouseRecapCommand): Promise<string> {
    // Rempli seulement quand le geste s'exécute : un rejeu ne reprévient pas le document.
    const issued: string[] = [];
    const rectifiedId = await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REISSUE_IN_HOUSE_RECAP_GESTURE,
        subject: intentSubject(command.recapId),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const rectified = await this.reissue(command.recapId);
          await seal(rectified);
          issued.push(rectified);
          return rectified;
        }),
    );
    for (const recapId of issued) {
      await announceIssued(this.document, recapId, this.logger);
    }
    return rectifiedId;
  }

  private async reissue(recapId: string): Promise<string> {
    const recap = await this.recaps.load(recapId);
    if (recap === null) {
      throw new InHouseRecapNotFoundError(recapId);
    }
    const notes = await this.notes.uncoveredNotesOf(recap.payerId, recap.month.window(), recap.id);
    const rectified = recap.reissue({
      id: this.ids.next(),
      number: await this.numbering.next(recap.month),
      issuedAt: this.clock.now(),
      notes,
    });
    await this.recaps.saveRectification(recap, rectified);
    return rectified.id;
  }
}
