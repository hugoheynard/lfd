import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaLibraryPageView } from "@lfd/pim-contracts";

import {
  MediaLibraryReader,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";

/**
 * Plafond d'une page. Une médiathèque se parcourt à l'œil : au-delà, l'écran
 * charge des aperçus que personne ne regarde, et le premier fonds sérieux
 * ferait une réponse de plusieurs mégaoctets.
 */
const MAX_PAGE = 100;
const DEFAULT_PAGE = 60;

/** Parcourt la bibliothèque de visuels, page par page. */
export class BrowseMediaLibraryQuery {
  constructor(
    readonly limit: number = DEFAULT_PAGE,
    readonly offset: number = 0,
  ) {}
}

/**
 * La bibliothèque telle que la médiathèque la montre.
 *
 * Le handler ne fait qu'un bornage et une traduction : le groupement par URL —
 * la seule identité qui traverse un enregistrement — vit dans l'adaptateur,
 * parce qu'il est fait de SQL et de rien d'autre.
 */
@QueryHandler(BrowseMediaLibraryQuery)
export class BrowseMediaLibraryHandler implements IQueryHandler<
  BrowseMediaLibraryQuery,
  MediaLibraryPageView
> {
  constructor(private readonly library: MediaLibraryReader) {}

  async execute(query: BrowseMediaLibraryQuery): Promise<MediaLibraryPageView> {
    // Borné ICI et pas au bord : une requête est une intention, et « donne-moi
    // toute la bibliothèque » n'en est pas une qu'on sert. Le contrôleur peut
    // se tromper, un test aussi.
    const limit = Math.min(Math.max(Math.trunc(query.limit), 1), MAX_PAGE);
    const offset = Math.max(Math.trunc(query.offset), 0);

    const page = await this.library.page(limit, offset);
    return { items: page.items.map(viewOf), total: page.total };
  }
}

function viewOf(record: LibraryMediaRecord): MediaLibraryPageView["items"][number] {
  return {
    url: record.url,
    name: record.name,
    tags: record.tags,
    // La CLÉ DE BUCKET ne sort pas : elle dit où l'octet est rangé chez nous,
    // ce qu'aucun écran n'a à savoir pour afficher une image dont il a l'URL.
    contentType: record.contentType,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    focal: record.focal,
    uses: record.uses,
    // ISO, et pas un `Date` : ce qui sort d'ici est du JSON, et laisser Nest
    // sérialiser à notre place rendrait la forme dépendante de son réglage.
    depositedAt: record.depositedAt.toISOString(),
  };
}
