import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
} from "../domain/ports/media-library-reader.js";

/** Une inscription, réduite à ce que la bibliothèque en lit. */
interface AssetRow {
  readonly id: string;
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
}

/**
 * La bibliothèque, lue **groupée par URL**.
 *
 * 🔴 Le groupement n'est pas une commodité d'affichage. `replaceMedia` recrée un
 * `MediaAsset` neuf par visuel à chaque enregistrement de section : une lecture
 * ligne à ligne montrerait la même image autant de fois qu'on a sauvé les
 * fiches qui la portent. L'URL est l'identité (cf. {@link MediaLibraryReader}).
 *
 * ⚠️ **Sans une ligne de SQL écrite à la main, et c'est imposé** :
 * `PimPrismaService` n'expose pas `$queryRaw`, délibérément — une requête brute
 * atteindrait n'importe quelle table de n'importe quel schéma, et annulerait en
 * une ligne la surface énumérée qui tient le référentiel dans ses propres
 * tables. Le groupement se fait donc en quatre requêtes bornées plutôt qu'en
 * une jointure, et c'est le bon prix.
 */
@Injectable()
export class PrismaMediaLibraryReader extends MediaLibraryReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async page(limit: number, offset: number): Promise<LibraryMediaPage> {
    // 1 — LES URL de la page, par date de PREMIER dépôt. Trier par la dernière
    // inscription ferait remonter en tête une image déposée il y a six mois
    // parce qu'on vient de sauver le produit qui la porte.
    const [pageOf, total] = await Promise.all([
      this.prisma.mediaAsset.groupBy({
        by: ["url"],
        _min: { createdAt: true },
        orderBy: { _min: { createdAt: "desc" } },
        take: limit,
        skip: offset,
      }),
      this.countUrls(),
    ]);

    const urls = pageOf.map((group) => group.url);
    if (urls.length === 0) {
      return { items: [], total };
    }

    // 2 — TOUTES les inscriptions de ces URL, la plus récente d'abord. Borné par
    // la page : au plus `limit` images, quelques lignes chacune.
    const rows = await this.prisma.mediaAsset.findMany({
      where: { url: { in: urls } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
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
      },
    });

    const uses = await this.usesByUrl(rows);
    const depositedAt = new Map(
      pageOf.map((group) => [group.url, group._min.createdAt ?? new Date(0)]),
    );

    return {
      items: urls.map((url) =>
        recordOf(
          url,
          rows.filter((row) => row.url === url),
          uses.get(url) ?? 0,
          depositedAt.get(url) ?? new Date(0),
        ),
      ),
      total,
    };
  }

  async find(url: string): Promise<LibraryMediaRecord | null> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: { url },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
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
      },
    });
    if (rows.length === 0) {
      return null;
    }
    const uses = await this.usesByUrl(rows);
    // La dernière inscription date le premier dépôt au pire par excès : on
    // prend la plus ANCIENNE, comme la liste, pour que les deux s'accordent.
    const deposited = await this.prisma.mediaAsset.aggregate({
      where: { url },
      _min: { createdAt: true },
    });
    return recordOf(url, rows, uses.get(url) ?? 0, deposited._min.createdAt ?? new Date(0));
  }

  /**
   * Combien d'URL distinctes porte la bibliothèque.
   *
   * ⚠️ Un `groupBy` sans plafond : il ramène une ligne par URL pour n'en compter
   * que le nombre. C'est tenable tant que le fonds se compte en milliers, et ça
   * ne le sera plus — le jour venu, ce compte deviendra approximatif ou
   * disparaîtra, ce qui ne coûte qu'une pagination sans total.
   */
  private async countUrls(): Promise<number> {
    const groups = await this.prisma.mediaAsset.groupBy({ by: ["url"] });
    return groups.length;
  }

  /**
   * Les PORTEURS de chaque URL — fiches et familles confondues.
   *
   * On compte les rattachements, jamais les lignes d'actif : une image inscrite
   * dix fois et affichée par une seule fiche sert **une** fois. Les deux tables
   * sont interrogées, et l'oubli de la seconde ne se verrait qu'en production —
   * l'écran proposerait de supprimer une image qu'une famille affiche, et
   * Postgres refuserait après coup.
   */
  private async usesByUrl(rows: readonly AssetRow[]): Promise<ReadonlyMap<string, number>> {
    const ids = rows.map((row) => row.id);
    const urlOf = new Map(rows.map((row) => [row.id, row.url]));

    const [byProduct, byCategory] = await Promise.all([
      this.prisma.productMedia.groupBy({
        by: ["mediaId"],
        where: { mediaId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.categoryMedia.groupBy({
        by: ["mediaId"],
        where: { mediaId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const group of [...byProduct, ...byCategory]) {
      const url = urlOf.get(group.mediaId);
      if (url === undefined) {
        continue;
      }
      counts.set(url, (counts.get(url) ?? 0) + group._count._all);
    }
    return counts;
  }
}

/**
 * Une image, reconstruite depuis ses inscriptions — **la plus récente d'abord**.
 *
 * Trois lectures et non une, parce que les trois n'ont pas la même condition
 * d'existence :
 *
 * - les faits **mesurés** viennent de la dernière ligne : ils ne changent pas
 *   d'une inscription à l'autre pour les mêmes octets ;
 * - le **nom** vient de la dernière ligne qui en porte un. Le rattachement
 *   recrée des lignes avec ce que l'écran lui a passé, qui peut être vide —
 *   prendre la dernière ligne ferait disparaître une étiquette écrite ailleurs ;
 * - le **point focal** vient de la dernière ligne qui en porte un, pour la même
 *   raison et une de plus : c'est une décision, et son absence ne doit pas se
 *   confondre avec « au centre ».
 */
function recordOf(
  url: string,
  rows: readonly AssetRow[],
  uses: number,
  depositedAt: Date,
): LibraryMediaRecord {
  const latest = rows[0];
  const named = rows.find((row) => row.name !== "");
  const pointed = rows.find((row) => row.focalX !== null);
  // Même lecture que le nom et le point : la dernière inscription QUI EN PORTE.
  // Un enregistrement de fiche recrée des lignes, et les siennes reprennent ce
  // que le report a retrouvé — mais rien ne garantit qu'il ait trouvé.
  const tagged = rows.find((row) => row.tags.length > 0);

  return {
    url,
    name: named?.name ?? "",
    tags: tagged?.tags ?? [],
    storageKey: latest?.storageKey ?? null,
    contentType: latest?.contentType ?? null,
    width: latest?.width ?? null,
    height: latest?.height ?? null,
    bytes: latest?.bytes ?? null,
    // `focalY` est lu sur la ligne dont `focalX` est posé : les deux s'écrivent
    // ensemble, un `y` seul n'existe pas.
    focal:
      pointed === undefined || pointed.focalX === null
        ? null
        : { x: pointed.focalX, y: pointed.focalY ?? 0 },
    uses,
    depositedAt,
  };
}
