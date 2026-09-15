import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { AddClientNoteHandler } from "./application/commands/add-client-note.handler.js";
import { RemoveClientNoteHandler } from "./application/commands/remove-client-note.handler.js";
import { ReorderClientNotesHandler } from "./application/commands/reorder-client-notes.handler.js";
import { ReviseClientNoteHandler } from "./application/commands/revise-client-note.handler.js";
import { GetClientNotePhotoHandler } from "./application/queries/get-client-note-photo.handler.js";
import { GetClientNoteThumbnailHandler } from "./application/queries/get-client-note-thumbnail.handler.js";
import { GetClientNotebookHandler } from "./application/queries/get-client-notebook.handler.js";
import { ClientNotePhotoLocator } from "./domain/ports/client-note-photo.locator.js";
import { ClientNotebookLock } from "./domain/ports/client-notebook.lock.js";
import { ClientNotebookReader } from "./domain/ports/client-notebook.reader.js";
import { ClientNotebookRepository } from "./domain/ports/client-notebook.repository.js";
import { NotebookCompanies } from "./domain/ports/notebook-companies.js";
import { AdminClientNotesController } from "./http/admin-client-notes.controller.js";
import { PrismaClientNotePhotoLocator } from "./infrastructure/prisma-client-note-photo.locator.js";
import { PrismaClientNotebookLock } from "./infrastructure/prisma-client-notebook.lock.js";
import { PrismaClientNotebookReader } from "./infrastructure/prisma-client-notebook.reader.js";
import { PrismaClientNotebookRepository } from "./infrastructure/prisma-client-notebook.repository.js";
import { PrismaNotebookCompanies } from "./infrastructure/prisma-notebook-companies.js";

/**
 * **Les notes du commercial** sur un compte client — plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` : l'auteur d'une note est
 * figé comme celui d'un écart d'accès aux fonctionnalités, par le même port.
 * N'exporte rien : aucun autre contexte ne lit ces notes.
 */
@Module({
  imports: [AccountModule],
  controllers: [AdminClientNotesController],
  providers: [
    { provide: ClientNotebookRepository, useClass: PrismaClientNotebookRepository },
    { provide: ClientNotebookReader, useClass: PrismaClientNotebookReader },
    { provide: ClientNotePhotoLocator, useClass: PrismaClientNotePhotoLocator },
    // Le verrou du carnet : il ne vit que sous l'unité de travail de la séquence.
    { provide: ClientNotebookLock, useClass: PrismaClientNotebookLock },
    { provide: NotebookCompanies, useClass: PrismaNotebookCompanies },
    AddClientNoteHandler,
    ReviseClientNoteHandler,
    RemoveClientNoteHandler,
    ReorderClientNotesHandler,
    GetClientNotebookHandler,
    GetClientNotePhotoHandler,
    GetClientNoteThumbnailHandler,
  ],
})
export class ClientNotesModule {}
