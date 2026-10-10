import { Injectable } from "@nestjs/common";
import { readAltColumn } from "./alt-columns.js";

import { SOURCE_LOCALE } from "../domain/value-objects/alt-text.js";

import { MediaCarriers } from "../channels/carriers/media-carriers.js";
import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import {
  type LibraryQuery,
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";

/** Ce que la bibliothèque lit d'une image — une ligne, puisque l'URL est unique. */
const ASSET_COLUMNS = {
  url: true,
  name: true,
  storageKey: true,
  contentType: true,
  width: true,
  height: true,
  bytes: true,
  focalX: true,
  focalY: true,
  tags: true,
  alt: true,
  createdAt: true,
} as const;

interface AssetRow {
  readonly url: string;
  readonly name: string;
  readonly storageKey: string | null;
  readonly contentType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly focalX: number | null;
  readonly focalY: number | null;
  readonly tags: string[];
  readonly alt: unknown;
  readonly createdAt: Date;
}

/**
 * La bibliothèque, **une ligne par image**.
 *
 * `media_asset.url` est unique depuis le 2026-09-23 (`une_image_une_ligne`) :
 * l'URL est l'identité, et la lecture n'a plus rien à regrouper. Elle l'a fait
 * tant qu'un enregistrement de fiche recréait une ligne par visuel ; le
 * groupement, ses reports « la dernière ligne qui porte un nom » et son compte
 * par `groupBy` sont tombés le 2026-10-10 avec la cause qui les justifiait.
 *
 * ⚠️ **Sans une ligne de SQL écrite à la main, et c'est imposé** :
 * `MediaPrismaService` n'expose pas `$queryRaw`, délibérément — une requête brute
 * atteindrait n'importe quelle table de n'importe quel schéma.
 */
@Injectable()
export class PrismaMediaLibraryReader extends MediaLibraryReader {
  constructor(
    private readonly prisma: MediaPrismaService,
    private readonly carriers: MediaCarriers,
  ) {
    super();
  }

  async page(query: LibraryQuery): Promise<LibraryMediaPage> {
    const { limit, offset } = query;
    // Le même `where` sert la page ET le total : les séparer ferait annoncer un
    // nombre de résultats que le filtre ne rendrait pas, donc un « charger
    // plus » qui promet des pages vides.
    const where = filterOf(query);
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        select: ASSET_COLUMNS,
        // L'URL départage deux dépôts du même instant : sans elle, une image
        // pourrait passer d'une page à l'autre entre deux lectures.
        orderBy: [{ createdAt: "desc" }, { url: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    if (rows.length === 0) {
      return { items: [], total };
    }
    const uses = await this.carriers.usesOf(rows.map((row) => row.url));
    return { items: rows.map((row) => recordOf(row, uses.get(row.url) ?? 0)), total };
  }

  async find(url: string): Promise<LibraryMediaRecord | null> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { url }, select: ASSET_COLUMNS });
    if (row === null) {
      return null;
    }
    const uses = await this.carriers.usesOf([url]);
    return recordOf(row, uses.get(url) ?? 0);
  }
}

/**
 * Une image telle que la bibliothèque la rend.
 *
 * Le nombre d'emplois vient des PORTEURS, par le port : leurs tables de
 * rattachement leur appartiennent (`lint:prisma-model-ownership`).
 */
function recordOf(row: AssetRow, uses: number): LibraryMediaRecord {
  return {
    url: row.url,
    name: row.name,
    tags: row.tags,
    // Le repli sur l'URL vaut mieux qu'une chaîne vide : une alternative
    // absente doit se VOIR, pas se confondre avec une alternative écrite.
    alt: readAltColumn(row.alt) ?? { [SOURCE_LOCALE]: row.url },
    storageKey: row.storageKey,
    contentType: row.contentType,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    // `x` et `y` s'écrivent ensemble : un `y` seul n'existe pas.
    focal: row.focalX === null ? null : { x: row.focalX, y: row.focalY ?? 0 },
    uses,
    depositedAt: row.createdAt,
  };
}

/**
 * Ce que Prisma attend pour restreindre — et ce que le filtre RESTREINT
 * vraiment.
 *
 * Il porte sur la ligne, qui est l'image : une seule par URL.
 */
type AssetFilter = {
  name?: { contains: string; mode: "insensitive" };
  tags?: { hasEvery: string[] };
};

/**
 * Traduit la recherche en `where`, et rend `{}` quand elle ne demande rien.
 *
 * ⚠️ Une chaîne VIDE n'est pas un critère : `contains: ""` est vrai partout, ce
 * qui ne coûterait rien ici, mais ferait croire au lecteur suivant qu'un
 * `where` est toujours posé. Un filtre absent doit être absent.
 *
 * ⚠️ Les tags sont normalisés à l'ÉCRITURE (découpés, minuscules,
 * dédoublonnés). On les met donc en minuscules ici aussi : `hasEvery` compare
 * des valeurs exactes, et un « Croissant » coché ne trouverait rien.
 */
function filterOf(query: LibraryQuery): AssetFilter {
  const filter: AssetFilter = {};
  const needle = query.q?.trim() ?? "";
  if (needle !== "") {
    filter.name = { contains: needle, mode: "insensitive" };
  }
  const tags = (query.tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag !== "");
  if (tags.length > 0) {
    filter.tags = { hasEvery: tags };
  }
  return filter;
}
