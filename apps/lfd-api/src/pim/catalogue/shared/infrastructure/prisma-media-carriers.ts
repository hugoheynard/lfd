import { Injectable } from "@nestjs/common";

import { MediaCarriers, type Carrier } from "../../../../media/channels/carriers/media-carriers.js";
import { SOURCE_LOCALE } from "../domain/value-objects/localized-text.js";
import { optionalLocalizedColumn as localizedOf } from "./json-readers.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";

/**
 * Ce que le RÉFÉRENTIEL répond à la médiathèque : combien de ses fiches, de
 * ses familles et de ses opérations datées affichent chacune de ces images.
 *
 * Les opérations depuis le 2026-09-24 (plan des opérations datées, lot 1) :
 * leur image paraît dans l'annonce de la boutique. Une opération ARCHIVÉE
 * compte encore — elle garde son image, et la supprimer laisserait une ligne
 * de l'historique pointer vers rien.
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
    // Les TROIS porteurs, et l'oubli d'un seul ne se serait vu qu'en
    // production : l'écran aurait proposé de supprimer une image qu'une
    // famille, ou l'annonce de Noël, affiche.
    const [byProduct, byCategory, byOperation] = await Promise.all([
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
      this.prisma.operation.groupBy({
        by: ["imageUrl"],
        where: { imageUrl: { in: wanted } },
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
    for (const group of byOperation) {
      add(group.imageUrl, group._count._all);
    }
    return counts;
  }

  /**
   * Les porteurs d'UNE image, nommés.
   *
   * Une lecture par table, parce que les porteurs n'ont ni le même écran ni le
   * même nom de colonne. Les fiches d'abord : c'est le cas fréquent, et
   * l'ordre de la liste est l'ordre dans lequel on cherchera. Les opérations
   * en dernier, sous leur CLÉ comme identifiant.
   *
   * ⚠️ **Un porteur peut apparaître deux fois** si la même image y tient deux
   * RÔLES — la clé primaire est `(porteur, url, rôle)`. On dédoublonne donc par
   * identifiant : la question posée est « qui affiche cette image », pas « à
   * combien de places ». Sans ça, la liste montrerait deux fois la même fiche
   * et ferait croire à un doublon de catalogue.
   */
  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const [products, categories, operations] = await Promise.all([
      this.prisma.productMedia.findMany({
        where: { mediaUrl: url },
        select: { productId: true, product: { select: { name: true } } },
      }),
      this.prisma.categoryMedia.findMany({
        where: { mediaUrl: url },
        select: { categoryId: true, category: { select: { name: true } } },
      }),
      this.prisma.operation.findMany({
        where: { imageUrl: url },
        select: { key: true, name: true },
        orderBy: { key: "asc" },
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
    for (const row of operations) {
      carriers.set(`operation:${row.key}`, {
        kind: "operation",
        id: row.key,
        label: labelOf(row.name, row.key),
      });
    }
    return [...carriers.values()];
  }
}

/**
 * Le nom lisible d'un porteur, **jamais vide**.
 *
 * Le repli est l'identifiant et non une chaîne creuse : une ligne sans mot ne
 * se clique pas, et « (sans nom) » ne dit pas laquelle des trois c'est. Un
 * identifiant est laid mais il désigne.
 *
 * ⚠️ En langue SOURCE, sans négociation : cette liste sert le staff du
 * back-office, pas un client. Y faire entrer une langue demanderait de la
 * faire traverser le port, pour une liste qu'on lit en français.
 */
function labelOf(name: unknown, fallback: string): string {
  const label = localizedOf(name)?.[SOURCE_LOCALE]?.trim() ?? "";
  return label === "" ? fallback : label;
}
