import type { MediaLibraryPageView, UploadedMediaView } from "@lfd/pim-contracts";

import type { BrowsedLibraryPage } from "../application/browse-media-library.js";
import type { DepositImageResult } from "../application/deposit-image.js";
import type { LibraryMediaRecord } from "../domain/ports/media-library-reader.js";

/** Une page du fonds, telle qu'elle part en JSON. */
export function libraryPageView(page: BrowsedLibraryPage): MediaLibraryPageView {
  return { items: page.items.map(libraryMediaView), total: page.total, next: page.next };
}

function libraryMediaView(record: LibraryMediaRecord): MediaLibraryPageView["items"][number] {
  return {
    url: record.url,
    name: record.name,
    tags: record.tags,
    alt: record.alt,
    // La CLÉ DE BUCKET ne sort pas : elle dit où l'octet est rangé chez nous,
    // ce qu'aucun écran n'a à savoir pour afficher une image dont il a l'URL.
    contentType: record.contentType,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    focal: record.focal,
    uses: record.uses,
    // ISO, et pas un `Date` : ce qui sort d'ici est du JSON.
    depositedAt: record.depositedAt.toISOString(),
    series: record.series,
    palette: record.palette,
  };
}

/** L'entrée de bibliothèque d'un dépôt, sans la clé de bucket. */
export function uploadedView(deposited: DepositImageResult): UploadedMediaView {
  return {
    id: deposited.id,
    url: deposited.url,
    contentType: deposited.contentType,
    width: deposited.width,
    height: deposited.height,
    bytes: deposited.bytes,
    seriesId: deposited.seriesId,
    alreadyInLibrary: deposited.alreadyInLibrary,
  };
}
