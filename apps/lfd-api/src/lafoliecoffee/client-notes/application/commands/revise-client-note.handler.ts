import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { ClientNoteEditedByStaffEvent } from "../../domain/events/client-note-edited-by-staff.event.js";
import { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { reviseClientNote } from "./client-notebook-editing.js";
import { ReviseClientNoteCommand } from "./revise-client-note.command.js";
import { namedNotebookCompany } from "../services/notebook-company-guard.js";

/** Le nom stable du geste, dans le registre des intentions. */
const REVISE_NOTE_GESTURE = "client-notes.revise";

/**
 * Refait une note du carnet d'un client. Une photo remplacée ou retirée quitte
 * le stockage avec sa vignette, après le commit.
 *
 * Le fait `company.client_note_edited_by_staff` part **dans la transaction**,
 * sans aucun contenu : une panne de journal annule le geste.
 */
@CommandHandler(ReviseClientNoteCommand)
export class ReviseClientNoteHandler implements ICommandHandler<ReviseClientNoteCommand, void> {
  constructor(
    private readonly companies: NotebookCompanies,
    private readonly notebooks: ClientNotebookRepository,
    private readonly lock: ClientNotebookLock,
    private readonly store: DocumentStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : une révision qui porte une photo la range à
   * neuf et écrit un fait — rejouée, elle le referait. La clé de l'écran est
   * scellée avec l'écriture et son fait.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre révision.
   */
  execute(command: ReviseClientNoteCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REVISE_NOTE_GESTURE,
        subject: intentSubject(command.noteId, command.fields, command.removePhoto, command.photo),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.revise(command, seal),
    );
  }

  private async revise(
    command: ReviseClientNoteCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const ports = {
      companies: this.companies,
      notebooks: this.notebooks,
      lock: this.lock,
      store: this.store,
      ids: this.ids,
      uow: this.uow,
    };
    await reviseClientNote(
      ports,
      command.companyId,
      command.noteId,
      {
        fields: command.fields,
        removePhoto: command.removePhoto,
        photo: command.photo,
        thumbnail: command.thumbnail,
      },
      async () => {
        await this.events.publishTraced(
          ClientNoteEditedByStaffEvent.onNote(
            await namedNotebookCompany(this.companies, command.companyId),
            command.noteId,
            "note_revised",
          ),
        );
        await seal();
      },
    );
  }
}
