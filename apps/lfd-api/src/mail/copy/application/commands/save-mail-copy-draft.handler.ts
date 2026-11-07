import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailCopyRepository } from "../../domain/ports/mail-copy.repository.js";
import { MailOutOfEditorError, MailSystemPhraseError } from "../../domain/mail-copy-errors.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { SaveMailCopyDraftCommand } from "./save-mail-copy-draft.command.js";

/**
 * Écrit un texte d'e-mail en brouillon.
 *
 * @sans-journal un brouillon ne part dans aucun e-mail ; c'est « Publier » qui
 * change ce que les clients reçoivent, et son fait porte chaque texte avant et
 * après. La ligne garde son auteur et son instant (`draft_by`, `draft_at`).
 */
@CommandHandler(SaveMailCopyDraftCommand)
export class SaveMailCopyDraftHandler implements ICommandHandler<SaveMailCopyDraftCommand, void> {
  constructor(
    private readonly texts: MailCopyRepository,
    private readonly manifest: MailCopyManifest,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {MailCopyChangedError} quelqu'un a écrit ce texte depuis la lecture.
   * @throws {UnknownMailTextError} le texte n'est pas au dictionnaire.
   * @throws {InvalidMailTextError} vide, variable obligatoire perdue ou inconnue.
   * @throws {MailOutOfEditorError} l'e-mail ne se rédige pas à l'éditeur (la sonde).
   * @throws {MailSystemPhraseError} le texte est un libellé système (§ 23).
   */
  async execute(command: SaveMailCopyDraftCommand): Promise<void> {
    if (this.manifest.isOutOfEditor(command.mail)) {
      throw new MailOutOfEditorError(command.mail);
    }
    if (this.manifest.isSystemPhrase(command.mail, command.path)) {
      throw new MailSystemPhraseError(command.mail, command.path);
    }
    await this.uow.run(async () => {
      const entry = await this.texts.load(command.mail, command.path, command.locale);
      entry.draft(command.text, this.manifest, command.expectedRevision, {
        at: this.clock.now(),
        staffId: command.staffUserId,
      });
      await this.texts.save(entry);
    });
  }
}
