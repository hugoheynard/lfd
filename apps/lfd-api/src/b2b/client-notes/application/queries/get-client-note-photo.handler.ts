import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import { ClientNotePhotoLocator } from "../../domain/ports/client-note-photo.locator.js";
import { READABLE_PHOTO, readClientNoteImage } from "./client-note-image-reading.js";
import { GetClientNotePhotoQuery } from "./get-client-note-photo.query.js";

/** Sert la photo lisible d'une note, sous le mur de la société. */
@QueryHandler(GetClientNotePhotoQuery)
export class GetClientNotePhotoHandler implements IQueryHandler<
  GetClientNotePhotoQuery,
  StoredDocument
> {
  constructor(
    private readonly photos: ClientNotePhotoLocator,
    private readonly store: DocumentStore,
  ) {}

  execute(query: GetClientNotePhotoQuery): Promise<StoredDocument> {
    return readClientNoteImage(
      this.photos,
      this.store,
      query.companyId,
      query.noteId,
      READABLE_PHOTO,
    );
  }
}
