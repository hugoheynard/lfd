import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailOutOfEditorError } from "../../domain/mail-copy-errors.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { MailCopyRepository } from "../../domain/ports/mail-copy.repository.js";
import { ResetMailCopyDraftCommand } from "./reset-mail-copy-draft.command.js";

/**
 * Pose « rétablir le texte d'origine » en brouillon. Ce n'est PAS un
 * effacement : les e-mails gardent le texte publié jusqu'au prochain
 * « Publier » (C3).
 *
 * @sans-journal comme le brouillon d'un texte : rien ne change dans les
 * e-mails avant « Publier », dont le fait porte la valeur retirée.
 */
@CommandHandler(ResetMailCopyDraftCommand)
export class ResetMailCopyDraftHandler implements ICommandHandler<ResetMailCopyDraftCommand, void> {
  constructor(
    private readonly texts: MailCopyRepository,
    private readonly manifest: MailCopyManifest,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {MailCopyChangedError} quelqu'un a écrit ce texte depuis la lecture.
   * @throws {MailOutOfEditorError} l'e-mail ne se rédige pas à l'éditeur (la sonde).
   */
  async execute(command: ResetMailCopyDraftCommand): Promise<void> {
    if (this.manifest.isOutOfEditor(command.mail)) {
      throw new MailOutOfEditorError(command.mail);
    }
    await this.uow.run(async () => {
      const entry = await this.texts.load(command.mail, command.path, command.locale);
      entry.reset(command.expectedRevision, { at: this.clock.now(), staffId: command.staffUserId });
      await this.texts.save(entry);
    });
  }
}
