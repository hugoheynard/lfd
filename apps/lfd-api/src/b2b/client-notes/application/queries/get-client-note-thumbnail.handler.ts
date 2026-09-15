import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import { ClientNotePhotoLocator } from "../../domain/ports/client-note-photo.locator.js";
import { clientNoteThumbnailKey } from "../../domain/value-objects/client-note-photo-key.js";
import { readClientNoteImage } from "./client-note-image-reading.js";
import { GetClientNoteThumbnailQuery } from "./get-client-note-thumbnail.query.js";

/** Sert la vignette d'une note — rangée avec sa photo, sous la clé dérivée. */
@QueryHandler(GetClientNoteThumbnailQuery)
export class GetClientNoteThumbnailHandler implements IQueryHandler<
  GetClientNoteThumbnailQuery,
  StoredDocument
> {
  constructor(
    private readonly photos: ClientNotePhotoLocator,
    private readonly store: DocumentStore,
  ) {}

  execute(query: GetClientNoteThumbnailQuery): Promise<StoredDocument> {
    return readClientNoteImage(
      this.photos,
      this.store,
      query.companyId,
      query.noteId,
      clientNoteThumbnailKey,
    );
  }
}
