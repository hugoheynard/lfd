import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { UnknownMailTemplateError } from "../../domain/mail-document-errors.js";
import { MailDocumentSavedEvent } from "../../domain/mail-document.events.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { MailTemplateDocumentRepository } from "../../domain/ports/mail-template-document.repository.js";
import { SaveMailDocumentDraftCommand } from "./save-mail-document-draft.command.js";

/**
 * Enregistre le brouillon de l'arrangement d'un e-mail (plan
 * `plan-editeur-par-blocs.md`, § 5) — la première modification crée la
 * ligne ; ouvrir l'e-mail n'en avait écrit aucune. Le brouillon ne part pas :
 * seul « Publier » le met en service.
 */
@CommandHandler(SaveMailDocumentDraftCommand)
export class SaveMailDocumentDraftHandler implements ICommandHandler<
  SaveMailDocumentDraftCommand,
  void
> {
  constructor(
    private readonly documents: MailTemplateDocumentRepository,
    private readonly catalogue: MailTemplateCatalogue,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {MailDocumentRefusedError} le document enfreint une règle de forme.
   * @throws {MailDocumentChangedError} quelqu'un l'a écrit depuis la lecture.
   */
  async execute(command: SaveMailDocumentDraftCommand): Promise<void> {
    const entry = this.catalogue.find(command.template);
    if (entry === null) {
      throw new UnknownMailTemplateError(command.template);
    }
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    await this.uow.run(async () => {
      const document = await this.documents.load(command.template);
      document.saveDraft(command.document, entry.declaration, command.expectedRevision, stamp);
      await this.documents.save(document);
      await this.events.publishTraced(
        new MailDocumentSavedEvent(command.template, document.snapshot().revision),
      );
    });
  }
}
