import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { ClientNoteEditedByStaffEvent } from "../../domain/events/client-note-edited-by-staff.event.js";
import { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { AddClientNoteCommand } from "./add-client-note.command.js";
import { addClientNote } from "./client-notebook-editing.js";
import { noteAuthorOf } from "./note-author.js";
import { namedNotebookCompany } from "../services/notebook-company-guard.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_NOTE_GESTURE = "client-notes.add";

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
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est scellée avec la note et
   * son fait ; un double envoi rend la note déjà ajoutée, sans seconde note,
   * seconde photo ni second fait.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre note.
   */
  execute(command: AddClientNoteCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ADD_NOTE_GESTURE,
        subject: intentSubject(command.companyId, command.fields, command.photo),
      },
      CREATED_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddClientNoteCommand,
    seal: (noteId: string) => Promise<void>,
  ): Promise<string> {
    const author = await noteAuthorOf(this.staff, command.staffUserId);
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
      async (noteId) => {
        await this.events.publishTraced(
          ClientNoteEditedByStaffEvent.onNote(
            await namedNotebookCompany(this.companies, command.companyId),
            noteId,
            "note_added",
          ),
        );
        await seal(noteId);
      },
    );
  }
}
