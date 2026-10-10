import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaLibraryPageView } from "@lfd/pim-contracts";

import { DomainError } from "../../platform/shared/errors/app-error.js";
import {
  MediaLibraryReader,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";
import {
  decodeLibraryCursor,
  encodeLibraryCursor,
} from "../domain/value-objects/library-cursor.js";
import type { LibrarySort } from "../domain/value-objects/library-order.js";
import { depositPeriodOf } from "./library-period.js";

/**
 * Plafond d'une page. Une médiathèque se parcourt à l'œil : au-delà, l'écran
 * charge des aperçus que personne ne regarde, et le premier fonds sérieux
 * ferait une réponse de plusieurs mégaoctets.
 */
const MAX_PAGE = 100;
const DEFAULT_PAGE = 60;

/** Le décalage ne se combine ni avec un curseur ni avec un autre ordre que le dépôt. */
export class UnsupportedLibraryOffsetError extends DomainError {
  constructor() {
    super(
      "media.library.offset_unsupported",
      "La médiathèque ne se lit plus par décalage qu'en tri par dépôt et sans curseur : reprenez la lecture avec le curseur `next` de la page précédente (`after`).",
    );
  }
}

/** Ce qu'on demande au fonds — tout facultatif sauf l'ordre. */
export interface BrowseMediaLibraryCriteria {
  readonly limit?: number | undefined;
  /** L'ancien décalage — en attendant que l'écran lise `next`. */
  readonly offset?: number | undefined;
  /** Le curseur opaque rendu en `next` par la page précédente. */
  readonly after?: string | undefined;
  readonly sort?: LibrarySort | undefined;
  /** Cherché dans l'étiquette, en sous-chaîne, casse ignorée. */
  readonly q?: string | undefined;
  /** Les mots-clés que l'image doit porter — tous. */
  readonly tags?: readonly string[] | undefined;
  /** Premier et dernier jour de dépôt, inclus, `AAAA-MM-JJ` à l'heure de Paris. */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly untagged?: boolean | undefined;
  readonly unused?: boolean | undefined;
  /** Seulement les images de cette série (L3). */
  readonly series?: string | undefined;
}

/**
 * Parcourt la bibliothèque, page par page — filtrée et ordonnée.
 *
 * 🔴 **Le filtre est au SERVEUR depuis le 2026-09-23** : les deux écrans
 * filtraient ce qu'ils avaient chargé, et l'image cent-unième était
 * introuvable quoi qu'on tape.
 *
 * 🔴 **Par curseur depuis le 2026-10-10** (plan L2) : un dépôt pendant qu'on
 * défile décalait le rang de tout ce qui suit, et « charger plus » rendait une
 * image deux fois.
 */
export class BrowseMediaLibraryQuery {
  constructor(readonly criteria: BrowseMediaLibraryCriteria = {}) {}
}

/**
 * La bibliothèque telle que la médiathèque la montre.
 *
 * Le handler borne, relit le curseur et la période, puis traduit : l'ordre et
 * le filtre vivent dans l'adaptateur, parce qu'ils sont faits de SQL.
 */
@QueryHandler(BrowseMediaLibraryQuery)
export class BrowseMediaLibraryHandler implements IQueryHandler<
  BrowseMediaLibraryQuery,
  MediaLibraryPageView
> {
  constructor(private readonly library: MediaLibraryReader) {}

  async execute(query: BrowseMediaLibraryQuery): Promise<MediaLibraryPageView> {
    const { criteria } = query;
    const sort = criteria.sort ?? "deposited";
    // Borné ICI et pas au bord : « donne-moi toute la bibliothèque » n'est pas
    // une intention qu'on sert. Le contrôleur peut se tromper, un test aussi.
    const limit = Math.min(Math.max(Math.trunc(criteria.limit ?? DEFAULT_PAGE), 1), MAX_PAGE);
    const offset = Math.max(Math.trunc(criteria.offset ?? 0), 0);
    if (offset > 0 && (criteria.after !== undefined || sort !== "deposited")) {
      throw new UnsupportedLibraryOffsetError();
    }
    const after =
      criteria.after === undefined ? undefined : decodeLibraryCursor(criteria.after, sort);
    const period = depositPeriodOf(criteria.from, criteria.to);

    const page = await this.library.page({
      limit,
      offset,
      sort,
      ...(after === undefined ? {} : { after }),
      ...(criteria.q === undefined ? {} : { q: criteria.q }),
      ...(criteria.tags === undefined ? {} : { tags: criteria.tags }),
      ...(criteria.series === undefined ? {} : { seriesId: criteria.series }),
      ...(period.from === undefined ? {} : { depositedFrom: period.from }),
      ...(period.before === undefined ? {} : { depositedBefore: period.before }),
      ...(criteria.untagged === true ? { untagged: true } : {}),
      ...(criteria.unused === true ? { unused: true } : {}),
    });
    return {
      items: page.items.map(viewOf),
      total: page.total,
      next: page.next === null ? null : encodeLibraryCursor(page.next),
    };
  }
}

function viewOf(record: LibraryMediaRecord): MediaLibraryPageView["items"][number] {
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
  };
}
