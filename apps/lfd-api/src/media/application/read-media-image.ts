import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  MediaLibraryReader,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";
import { MediaNotInLibraryError } from "../domain/value-objects/image.js";

/** UNE image du fonds, par son URL. */
export class ReadMediaImageQuery {
  constructor(readonly url: string) {}
}

/**
 * **Lire une image seule** — `GET /media/one?url=`.
 *
 * Elle existe pour les outils agent du back-office (2026-10-11) : `PUT /media`
 * remplace étiquette, texte alternatif, tags et point focal ENSEMBLE, donc qui
 * écrit doit relire l'image d'abord. Sans cette route, la seule lecture était
 * le fil, qui ne filtre pas par URL — il fallait le parcourir page à page.
 *
 * @throws {MediaNotInLibraryError} aucune image n'a cette URL (une URL vide
 *   comprise : elle ne désigne rien).
 */
@QueryHandler(ReadMediaImageQuery)
export class ReadMediaImageHandler implements IQueryHandler<
  ReadMediaImageQuery,
  LibraryMediaRecord
> {
  constructor(private readonly library: MediaLibraryReader) {}

  async execute(query: ReadMediaImageQuery): Promise<LibraryMediaRecord> {
    const url = query.url.trim();
    const image = url === "" ? null : await this.library.find(url);
    if (image === null) {
      throw new MediaNotInLibraryError(url);
    }
    return image;
  }
}
