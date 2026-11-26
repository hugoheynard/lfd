import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import {
  InHouseRecapNotFoundError,
  ReplacedInHouseRecapNotSentError,
} from "../../domain/errors/in-house-recap-errors.js";
import { InHouseRecapReader } from "../../domain/ports/in-house-recap.reader.js";
import { InHouseRecapDocumentKeeper } from "../services/in-house-recap-document-keeper.js";
import { InHouseRecapMailer } from "../services/in-house-recap-mailer.js";
import { ResendInHouseRecapCommand } from "./resend-in-house-recap.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const RESEND_IN_HOUSE_RECAP_GESTURE = "in-house-recap.resend";

/**
 * **Renvoie l'e-mail d'un récapitulatif**, scellé par l'intention de l'écran :
 * le PDF rangé (rendu s'il manque, hors transaction), puis la demande sous la
 * clé `in-house-recap-resend:<intention>:<destinataire>` — le bloc ne la tait
 * pas, un double clic ne la double pas. La demande et le sceau s'écrivent
 * dans la même transaction.
 *
 * @returns l'identifiant du récapitulatif renvoyé.
 * @throws {InHouseRecapNotFoundError} le récapitulatif n'existe pas.
 * @throws {ReplacedInHouseRecapNotSentError} il a été remplacé : seul le rectificatif part.
 * @throws {InHouseRecapNobodyToNotifyError} le payeur n'a personne à prévenir.
 */
@CommandHandler(ResendInHouseRecapCommand)
export class ResendInHouseRecapHandler implements ICommandHandler<
  ResendInHouseRecapCommand,
  string
> {
  constructor(
    private readonly recaps: InHouseRecapReader,
    private readonly keeper: InHouseRecapDocumentKeeper,
    private readonly mailer: InHouseRecapMailer,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ResendInHouseRecapCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: RESEND_IN_HOUSE_RECAP_GESTURE,
        subject: intentSubject(command.recapId),
      },
      CREATED_ID_REPLAY,
      (seal) => this.resend(command, seal),
    );
  }

  private async resend(
    command: ResendInHouseRecapCommand,
    seal: (recapId: string) => Promise<void>,
  ): Promise<string> {
    const recap = await this.recaps.load(command.recapId);
    if (recap === null) {
      throw new InHouseRecapNotFoundError(command.recapId);
    }
    if (recap.isReplaced) {
      throw new ReplacedInHouseRecapNotSentError(recap.number);
    }
    const document = await this.keeper.ensure(recap.id);
    await this.mailer.request(
      document,
      (recipientId) => `in-house-recap-resend:${command.intentKey}:${recipientId}`,
      () => seal(recap.id),
    );
    return recap.id;
  }
}
