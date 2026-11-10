import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { ClientNoteEditedByStaffEvent } from "../../domain/events/client-note-edited-by-staff.event.js";
import { ClientNotebookLock } from "../../domain/ports/client-notebook.lock.js";
import { ClientNotebookRepository } from "../../domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "../../domain/ports/notebook-companies.js";
import { reorderClientNotes } from "./client-notebook-editing.js";
import { ReorderClientNotesCommand } from "./reorder-client-notes.command.js";
import { namedNotebookCompany } from "../services/notebook-company-guard.js";

/**
 * Range les notes du carnet dans l'ordre choisi par la commerciale. Un ordre
 * envoyé depuis un écran périmé est refusé plutôt que complété.
 *
 * Le fait part **dans la transaction**, sans `noteId` : le geste range tout le
 * carnet (cf. `ClientNoteEditedByStaffEvent`).
 */
@CommandHandler(ReorderClientNotesCommand)
export class ReorderClientNotesHandler implements ICommandHandler<ReorderClientNotesCommand, void> {
  constructor(
    private readonly companies: NotebookCompanies,
    private readonly notebooks: ClientNotebookRepository,
    private readonly lock: ClientNotebookLock,
    private readonly store: DocumentStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ReorderClientNotesCommand): Promise<void> {
    const ports = {
      companies: this.companies,
      notebooks: this.notebooks,
      lock: this.lock,
      store: this.store,
      ids: this.ids,
      uow: this.uow,
    };
    await reorderClientNotes(ports, command.companyId, command.noteIds, async () =>
      this.events.publishTraced(
        ClientNoteEditedByStaffEvent.reordered(
          await namedNotebookCompany(this.companies, command.companyId),
        ),
      ),
    );
  }
}
