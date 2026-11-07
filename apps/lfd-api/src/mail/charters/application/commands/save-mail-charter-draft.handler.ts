import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailCharterSavedEvent } from "../../domain/mail-charter.events.js";
import { MailSpaceCharterRepository } from "../../domain/ports/mail-space-charter.repository.js";
import { mailSpaceOfParam } from "../mail-space-param.js";
import { SaveMailCharterDraftCommand } from "./save-mail-charter-draft.command.js";

/**
 * Enregistre le brouillon de la charte d'un espace (plan
 * `plan-editeur-par-blocs.md`, § 25, C1) — la première modification crée la
 * ligne ; ouvrir la page n'en avait écrit aucune. Le brouillon ne sert à
 * aucun envoi : seul « Publier » le met en service.
 */
@CommandHandler(SaveMailCharterDraftCommand)
export class SaveMailCharterDraftHandler implements ICommandHandler<
  SaveMailCharterDraftCommand,
  void
> {
  constructor(
    private readonly charters: MailSpaceCharterRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {UnknownMailSpaceError} l'espace n'existe pas.
   * @throws {MailCharterRefusedError} un réglage enfreint une règle de forme.
   * @throws {MailCharterChangedError} quelqu'un l'a écrite depuis la lecture.
   */
  async execute(command: SaveMailCharterDraftCommand): Promise<void> {
    const space = mailSpaceOfParam(command.space);
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    await this.uow.run(async () => {
      const charter = await this.charters.load(space);
      charter.saveDraft(command.settings, command.expectedRevision, stamp);
      await this.charters.save(charter);
      await this.events.publishTraced(
        new MailCharterSavedEvent(space, charter.snapshot().revision),
      );
    });
  }
}
