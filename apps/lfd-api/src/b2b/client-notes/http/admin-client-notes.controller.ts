import {
  type ClientNoteFields,
  clientNoteFieldsSchema,
  type ClientNotebookOrderPayload,
  clientNotebookOrderPayloadSchema,
  type ClientNotebookView,
  type ClientNoteRevisionFields,
  clientNoteRevisionFieldsSchema,
  type CreatedClientNoteResponse,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import type { StoredDocument } from "../../../platform/storage/document-store.js";
import { servePhoto } from "../../shared/photo-cards/http/photo-card-http.js";
import { AddClientNoteCommand } from "../application/commands/add-client-note.command.js";
import { RemoveClientNoteCommand } from "../application/commands/remove-client-note.command.js";
import { ReorderClientNotesCommand } from "../application/commands/reorder-client-notes.command.js";
import { ReviseClientNoteCommand } from "../application/commands/revise-client-note.command.js";
import { GetClientNotePhotoQuery } from "../application/queries/get-client-note-photo.query.js";
import { GetClientNoteThumbnailQuery } from "../application/queries/get-client-note-thumbnail.query.js";
import { GetClientNotebookQuery } from "../application/queries/get-client-notebook.query.js";
import { noteImageBytes, noteImagesUpload, type UploadedNoteImages } from "./client-note-http.js";

const NOTES = ":companyId/notes";

/**
 * **Les notes du commercial** sur un compte client — staff seulement.
 *
 * Ressource `b2b_client_notes`, et non `b2b_companies` : `comptabilite` et
 * `support` lisent la fiche client sans lire ces notes (Hugo, 2026-09-15).
 * L'action se déduit du verbe. Aucune route client ne sert ces vues ; chaque
 * écriture inscrit son fait au journal, sans contenu, dans sa transaction.
 */
@Controller("admin/companies")
@AdminSurface("b2b_client_notes")
export class AdminClientNotesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(NOTES)
  read(@Param("companyId") companyId: string): Promise<ClientNotebookView> {
    return this.queries.execute<GetClientNotebookQuery, ClientNotebookView>(
      new GetClientNotebookQuery(companyId),
    );
  }

  @Post(NOTES)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(noteImagesUpload())
  async add(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(clientNoteFieldsSchema)) fields: ClientNoteFields,
    @UploadedFiles() files: UploadedNoteImages | undefined,
    @StaffSub() staffSub: string,
  ): Promise<CreatedClientNoteResponse> {
    const id = await this.commands.execute<AddClientNoteCommand, string>(
      new AddClientNoteCommand(
        companyId,
        fields,
        noteImageBytes(files, "photo"),
        noteImageBytes(files, "thumbnail"),
        staffSub,
      ),
    );
    return { id };
  }

  @Patch(`${NOTES}/:noteId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(noteImagesUpload())
  async revise(
    @Param("companyId") companyId: string,
    @Param("noteId") noteId: string,
    @Body(new ZodBody(clientNoteRevisionFieldsSchema)) fields: ClientNoteRevisionFields,
    @UploadedFiles() files: UploadedNoteImages | undefined,
  ): Promise<void> {
    await this.commands.execute<ReviseClientNoteCommand, void>(
      new ReviseClientNoteCommand(
        companyId,
        noteId,
        { title: fields.title, body: fields.body },
        fields.removePhoto === "true",
        noteImageBytes(files, "photo"),
        noteImageBytes(files, "thumbnail"),
      ),
    );
  }

  @Delete(`${NOTES}/:noteId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("companyId") companyId: string,
    @Param("noteId") noteId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveClientNoteCommand, void>(
      new RemoveClientNoteCommand(companyId, noteId),
    );
  }

  @Put(`${NOTES}/order`)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(clientNotebookOrderPayloadSchema)) payload: ClientNotebookOrderPayload,
  ): Promise<void> {
    await this.commands.execute<ReorderClientNotesCommand, void>(
      new ReorderClientNotesCommand(companyId, payload.noteIds),
    );
  }

  @Get(`${NOTES}/:noteId/photo`)
  async photo(
    @Param("companyId") companyId: string,
    @Param("noteId") noteId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetClientNotePhotoQuery, StoredDocument>(
      new GetClientNotePhotoQuery(companyId, noteId),
    );
    return servePhoto(res, photo);
  }

  @Get(`${NOTES}/:noteId/thumbnail`)
  async thumbnail(
    @Param("companyId") companyId: string,
    @Param("noteId") noteId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const thumbnail = await this.queries.execute<GetClientNoteThumbnailQuery, StoredDocument>(
      new GetClientNoteThumbnailQuery(companyId, noteId),
    );
    return servePhoto(res, thumbnail);
  }
}
