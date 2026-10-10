import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CatalogMediaCopies,
  type CatalogMediaCopy,
} from "../channels/media/catalog-media-copies.js";

/** Les opérations dont la copie peut encore paraître : celles qu'aucun envoi n'a retirées. */
const HELD = { withdrawnAt: null } as const;

/**
 * Adaptateur Prisma des copies d'images du catalogue : `catalog_operations`,
 * que seul ce contexte lit (`lint:prisma-model-ownership`).
 *
 * 🔴 **Toute opération non retirée compte, finie ou masquée.** Deux raisons :
 *
 * - une opération MASQUÉE à la réception revient en boutique dès qu'on lève
 *   la surcharge, sans push — son image doit être encore là ;
 * - une opération FINIE (passé `pickupUntil`) n'est plus servie par la
 *   vitrine (`operationStateAt` rend `null`), mais trier ici sur l'horloge
 *   ferait dépendre la sûreté d'un effacement d'un calcul de date ; la retenir
 *   ne coûte que son octet, et le prochain envoi qui ne la porte plus la
 *   retire, ce qui la libère.
 */
@Injectable()
export class PrismaCatalogMediaCopies extends CatalogMediaCopies {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (urls.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogOperation.groupBy({
      by: ["imageUrl"],
      where: { ...HELD, imageUrl: { in: [...urls] } },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.imageUrl !== null) {
        counts.set(row.imageUrl, row._count._all);
      }
    }
    return counts;
  }

  async copiesOf(url: string): Promise<readonly CatalogMediaCopy[]> {
    const rows = await this.prisma.catalogOperation.findMany({
      where: { ...HELD, imageUrl: url },
      select: { key: true, name: true },
      orderBy: { key: "asc" },
    });
    return rows.map((row) => ({ operationKey: row.key, name: frenchName(row.name) ?? row.key }));
  }
}

/** Le nom français reçu, s'il est lisible. */
function frenchName(name: unknown): string | null {
  if (typeof name !== "object" || name === null || !("fr" in name)) {
    return null;
  }
  const fr = name.fr;
  return typeof fr === "string" && fr.trim() !== "" ? fr : null;
}
