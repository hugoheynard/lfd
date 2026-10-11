import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  MediaLibraryReader,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";
import { libraryWindow } from "../domain/value-objects/library-window.js";
import {
  decodeLibraryCursor,
  encodeLibraryCursor,
} from "../domain/value-objects/library-cursor.js";
import type { LibrarySort } from "../domain/value-objects/library-order.js";
import { libraryFilterOf, type LibraryFilterCriteria } from "./library-filter-criteria.js";

/** Ce qu'on demande au fonds — tout facultatif sauf l'ordre. */
export interface BrowseMediaLibraryCriteria extends LibraryFilterCriteria {
  readonly limit?: number | undefined;
  /** L'ancien décalage — en attendant que l'écran lise `next`. */
  readonly offset?: number | undefined;
  /** Le curseur opaque rendu en `next` par la page précédente. */
  readonly after?: string | undefined;
  readonly sort?: LibrarySort | undefined;
}

/**
 * Parcourt la bibliothèque, page par page — filtrée et ordonnée.
 *
 * 🔴 **Le filtre est au SERVEUR depuis le 2026-09-23** : les deux écrans
 * filtraient ce qu'ils avaient chargé, et l'image cent-unième était
 * introuvable quoi qu'on tape.
 *
 * 🔴 **Par curseur depuis le 2026-10-10** : un dépôt pendant qu'on
 * défile décalait le rang de tout ce qui suit, et « charger plus » rendait une
 * image deux fois.
 */
export class BrowseMediaLibraryQuery {
  constructor(readonly criteria: BrowseMediaLibraryCriteria = {}) {}
}

/**
 * Une page du fonds : les images, le compte, et le curseur — déjà opaque.
 * La forme JSON est celle du contrôleur (`http/library-media-view.ts`).
 */
export interface BrowsedLibraryPage {
  readonly items: readonly LibraryMediaRecord[];
  readonly total: number;
  readonly next: string | null;
}

/**
 * La bibliothèque telle que la médiathèque la parcourt.
 *
 * Le handler borne, relit le curseur et la période : l'ordre et le filtre
 * vivent dans l'adaptateur, parce qu'ils sont faits de SQL.
 */
@QueryHandler(BrowseMediaLibraryQuery)
export class BrowseMediaLibraryHandler implements IQueryHandler<
  BrowseMediaLibraryQuery,
  BrowsedLibraryPage
> {
  constructor(private readonly library: MediaLibraryReader) {}

  async execute(query: BrowseMediaLibraryQuery): Promise<BrowsedLibraryPage> {
    const { criteria } = query;
    const sort = criteria.sort ?? "deposited";
    const { limit, offset } = libraryWindow({
      limit: criteria.limit,
      offset: criteria.offset,
      withCursor: criteria.after !== undefined,
      sort,
    });
    const after =
      criteria.after === undefined ? undefined : decodeLibraryCursor(criteria.after, sort);
    const filter = libraryFilterOf(criteria);

    const page = await this.library.page({
      limit,
      offset,
      sort,
      ...(after === undefined ? {} : { after }),
      ...filter,
    });
    return {
      items: page.items,
      total: page.total,
      next: page.next === null ? null : encodeLibraryCursor(page.next),
    };
  }
}
