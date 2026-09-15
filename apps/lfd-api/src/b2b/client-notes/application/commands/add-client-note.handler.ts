import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { ClientNoteEditedByStaffEvent } from "../../domain/events/client-note-edited-by-staff.event.js";
import { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { AddClientNoteCommand } from "./add-client-note.command.js";
import { addClientNote } from "./client-notebook-editing.js";
import { noteAuthorOf } from "./note-author.js";

/**
 * Ajoute une note **en tête** du carnet d'un client, avec son auteur figé.
 *
 * Le fait `company.client_note_edited_by_staff` part **dans la transaction** de
 * l'écriture, sans aucun contenu : une panne de journal annule le geste.
 */
@CommandHandler(AddClientNoteCommand)
export class AddClientNoteHandler implements ICommandHandler<AddClientNoteCommand, string> {
  constructor(
    private readonly companies: NotebookCompanies,
    private readonly notebooks: ClientNotebookRepository,
    private readonly lock: ClientNotebookLock,
    private readonly store: DocumentStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
    private readonly staff: StaffDirectory,
  ) {}

  async execute(command: AddClientNoteCommand): Promise<string> {
    const author = await noteAuthorOf(this.staff, command.staffSub);
    const ports = {
      companies: this.companies,
      notebooks: this.notebooks,
      lock: this.lock,
      store: this.store,
      ids: this.ids,
      uow: this.uow,
    };
    return addClientNote(
      ports,
      command.companyId,
      { fields: command.fields, photo: command.photo, thumbnail: command.thumbnail, author },
      (noteId) =>
        this.events.publishTraced(
          ClientNoteEditedByStaffEvent.onNote(command.companyId, noteId, "note_added"),
        ),
    );
  }
}
