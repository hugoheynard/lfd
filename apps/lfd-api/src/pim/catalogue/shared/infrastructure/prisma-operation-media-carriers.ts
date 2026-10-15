import { Injectable } from "@nestjs/common";

import {
  MediaCarriers,
  type Carrier,
  type ImageReplacement,
} from "../../../../media/channels/carriers/media-carriers.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { labelOf } from "./prisma-media-carriers.js";

/**
 * Ce que les **opérations datées du référentiel** répondent à la médiathèque —
 * sorties de `PrismaMediaCarriers` le 2026-10-15 sans rien changer à ce
 * qu'elles répondent (lot 2 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * Un porteur à part pour que la racine puisse le RETIRER : interrupteur
 * `OPERATIONS_AT_COMMERCE` ouvert, l'opération vit au commerce, et
 * `pim.operation` est une table qu'on ne sert plus. La compter garderait
 * « employées » des images que personne n'affiche ; la repointer écrirait
 * une table morte. Fermé, il est branché exactement comme avant
 * (`appBootstrap/media-carriers.module.ts`).
 *
 * Une opération ARCHIVÉE compte encore — elle garde son image, et la
 * supprimer laisserait une ligne de l'historique pointer vers rien. Son texte
 * alternatif reste le sien au repointage. Disparaît au lot 4 (O5 du plan).
 */
@Injectable()
export class PrismaOperationMediaCarriers extends MediaCarriers {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const wanted = [...new Set(urls)];
    if (wanted.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.operation.groupBy({
      by: ["imageUrl"],
      where: { imageUrl: { in: wanted } },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const group of groups) {
      if (group.imageUrl !== null) {
        counts.set(group.imageUrl, group._count._all);
      }
    }
    return counts;
  }

  /** Sous leur CLÉ comme identifiant, triées par clé. */
  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const rows = await this.prisma.operation.findMany({
      where: { imageUrl: url },
      select: { key: true, name: true },
      orderBy: { key: "asc" },
    });
    return rows.map((row) => ({
      kind: "operation",
      id: row.key,
      label: labelOf(row.name, row.key),
    }));
  }

  /**
   * ⚠️ Pas de réannonce ici : la médiathèque publie `media.asset_described`
   * sur `to` dans la même transaction, et le référentiel réannonce les
   * opérations qui l'affichent (`operations/application/on-media-asset-described.ts`).
   * Le laissez-passer n'est pas lu : il prouve que le remplacement est tracé.
   */
  async repoint({ from, to }: ImageReplacement, ticket: WriteTicket): Promise<number> {
    void ticket;
    const operations = await this.prisma.operation.updateMany({
      where: { imageUrl: from },
      data: { imageUrl: to },
    });
    return operations.count;
  }
}
