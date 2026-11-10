import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { ClientNoteEditedByStaffEvent } from "../../domain/events/client-note-edited-by-staff.event.js";
import { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { reviseClientNote } from "./client-notebook-editing.js";
import { ReviseClientNoteCommand } from "./revise-client-note.command.js";
import { namedNotebookCompany } from "../services/notebook-company-guard.js";

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
  ) {}

  async execute(command: ReviseClientNoteCommand): Promise<void> {
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
      async () =>
        this.events.publishTraced(
          ClientNoteEditedByStaffEvent.onNote(
            await namedNotebookCompany(this.companies, command.companyId),
            command.noteId,
            "note_revised",
          ),
        ),
    );
  }
}
