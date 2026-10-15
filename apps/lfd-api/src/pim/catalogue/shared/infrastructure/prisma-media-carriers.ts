import { Injectable } from "@nestjs/common";

import {
  MediaCarriers,
  type Carrier,
  type ImageReplacement,
} from "../../../../media/channels/carriers/media-carriers.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { SOURCE_LOCALE } from "../domain/value-objects/localized-text.js";
import { optionalLocalizedColumn as localizedOf } from "./json-readers.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";

/**
 * Ce que le RÉFÉRENTIEL répond à la médiathèque : combien de ses fiches et de
 * ses familles affichent chacune de ces images.
 *
 * Ses opérations datées répondent à part depuis le 2026-10-15
 * (`PrismaOperationMediaCarriers`, lot 2 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`) :
 * la racine ne les compte plus une fois l'opération passée au commerce, sans
 * quoi une image resterait « employée » par une table que plus rien ne sert.
 *
 * Le comptage se fait par `media_url` et non par l'identifiant d'actif : c'est
 * l'URL qui est l'identité d'une image, et c'est elle que la bibliothèque
 * connaît.
 *
 * ✅ L'identifiant d'actif a disparu au déploiement ③ (2026-09-23) — cette
 * phrase disait « disparaîtra ».
 */
@Injectable()
export class PrismaMediaCarriers extends MediaCarriers {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const wanted = [...new Set(urls)];
    if (wanted.length === 0) {
      return new Map();
    }
    // Les DEUX porteurs, et l'oubli d'un seul ne se serait vu qu'en
    // production : l'écran aurait proposé de supprimer une image qu'une
    // famille affiche.
    const [byProduct, byCategory] = await Promise.all([
      this.prisma.productMedia.groupBy({
        by: ["mediaUrl"],
        where: { mediaUrl: { in: wanted } },
        _count: { _all: true },
      }),
      this.prisma.categoryMedia.groupBy({
        by: ["mediaUrl"],
        where: { mediaUrl: { in: wanted } },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map<string, number>();
    const add = (url: string | null, uses: number): void => {
      if (url !== null) {
        counts.set(url, (counts.get(url) ?? 0) + uses);
      }
    };
    for (const group of [...byProduct, ...byCategory]) {
      add(group.mediaUrl, group._count._all);
    }
    return counts;
  }

  /**
   * Les porteurs d'UNE image, nommés.
   *
   * Une lecture par table, parce que les porteurs n'ont ni le même écran ni le
   * même nom de colonne. Les fiches d'abord : c'est le cas fréquent, et
   * l'ordre de la liste est l'ordre dans lequel on cherchera.
   *
   * ⚠️ **Un porteur peut apparaître deux fois** si la même image y tient deux
   * RÔLES — la clé primaire est `(porteur, url, rôle)`. On dédoublonne donc par
   * identifiant : la question posée est « qui affiche cette image », pas « à
   * combien de places ». Sans ça, la liste montrerait deux fois la même fiche
   * et ferait croire à un doublon de catalogue.
   */
  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const [products, categories] = await Promise.all([
      this.prisma.productMedia.findMany({
        where: { mediaUrl: url },
        select: { productId: true, product: { select: { name: true } } },
      }),
      this.prisma.categoryMedia.findMany({
        where: { mediaUrl: url },
        select: { categoryId: true, category: { select: { name: true } } },
      }),
    ]);

    const carriers = new Map<string, Carrier>();
    for (const row of products) {
      carriers.set(`product:${row.productId}`, {
        kind: "product",
        id: row.productId,
        label: labelOf(row.product.name, row.productId),
      });
    }
    for (const row of categories) {
      carriers.set(`category:${row.categoryId}`, {
        kind: "category",
        id: row.categoryId,
        label: labelOf(row.category.name, row.categoryId),
      });
    }
    return [...carriers.values()];
  }

  /**
   * Repointe fiches et familles de `from` vers `to` (L7,
   * 2026-10-10), dans la transaction ambiante.
   *
   * 🔴 **La fusion, avant le repointage** : la clé de `product_media` et de
   * `category_media` est `(porteur, url, rôle)`. Un porteur qui tenait déjà
   * `to` sous le même rôle que `from` verrait le repointage heurter la clé ;
   * on retire donc d'abord sa ligne `to`, et c'est la ligne de `from` qui
   * devient `to` — avec SON rang. Sous deux rôles différents, les deux lignes
   * restent : ce ne sont pas des doublons.
   *
   * ⚠️ Pas de réannonce ici : la médiathèque publie dans la même transaction
   * le fait durable `media.asset_described` sur `to`, que le référentiel
   * écoute déjà pour réannoncer les fiches qui le montrent en `hero` ou
   * `thumbnail` (`catalogue/product/application/on-media-asset-described.ts`).
   */
  async repoint({ from, to }: ImageReplacement, ticket: WriteTicket): Promise<number> {
    // Le laissez-passer n'est pas LU, et c'est voulu : il n'a pas de contenu à
    // écrire ici. Sa seule existence prouve que la médiathèque a tracé le
    // remplacement (`media_asset.replaced`) dans la même transaction — le port
    // l'exige pour rendre une écriture sans trace inexprimable (2026-10-10).
    void ticket;
    const products = await this.repointProducts(from, to);
    const categories = await this.repointCategories(from, to);
    return products + categories;
  }

  /** Les fiches : fusion par `(fiche, rôle)`, puis repointage. Rend le nombre de fiches. */
  private async repointProducts(from: string, to: string): Promise<number> {
    const rows = await this.prisma.productMedia.findMany({
      where: { mediaUrl: from },
      select: { productId: true, role: true },
    });
    if (rows.length === 0) {
      return 0;
    }
    await this.prisma.productMedia.deleteMany({
      where: {
        mediaUrl: to,
        OR: rows.map(({ productId, role }) => ({ productId, role })),
      },
    });
    await this.prisma.productMedia.updateMany({
      where: { mediaUrl: from },
      data: { mediaUrl: to },
    });
    return new Set(rows.map((row) => row.productId)).size;
  }

  /** Les familles : même fusion, même compte. */
  private async repointCategories(from: string, to: string): Promise<number> {
    const rows = await this.prisma.categoryMedia.findMany({
      where: { mediaUrl: from },
      select: { categoryId: true, role: true },
    });
    if (rows.length === 0) {
      return 0;
    }
    await this.prisma.categoryMedia.deleteMany({
      where: {
        mediaUrl: to,
        OR: rows.map(({ categoryId, role }) => ({ categoryId, role })),
      },
    });
    await this.prisma.categoryMedia.updateMany({
      where: { mediaUrl: from },
      data: { mediaUrl: to },
    });
    return new Set(rows.map((row) => row.categoryId)).size;
  }
}

/**
 * Le nom lisible d'un porteur, **jamais vide**.
 *
 * Le repli est l'identifiant et non une chaîne creuse : une ligne sans mot ne
 * se clique pas, et « (sans nom) » ne dit pas laquelle des trois c'est. Un
 * identifiant est laid mais il désigne. Partagé avec les opérations
 * (`PrismaOperationMediaCarriers`).
 *
 * ⚠️ En langue SOURCE, sans négociation : cette liste sert le staff du
 * back-office, pas un client. Y faire entrer une langue demanderait de la
 * faire traverser le port, pour une liste qu'on lit en français.
 */
export function labelOf(name: unknown, fallback: string): string {
  const label = localizedOf(name)?.[SOURCE_LOCALE]?.trim() ?? "";
  return label === "" ? fallback : label;
}
