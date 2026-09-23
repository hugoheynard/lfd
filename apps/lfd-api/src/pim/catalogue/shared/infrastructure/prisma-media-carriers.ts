import { Injectable } from "@nestjs/common";

import { MediaCarriers } from "../../../../media/channels/carriers/media-carriers.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";

/**
 * Ce que le RÉFÉRENTIEL répond à la médiathèque : combien de ses fiches et de
 * ses familles affichent chacune de ces images.
 *
 * Le comptage se fait par `media_url` et non par l'identifiant d'actif : c'est
 * l'URL qui est l'identité d'une image, et c'est elle que la bibliothèque
 * connaît. L'identifiant, lui, disparaîtra au déploiement ③.
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
    // Les DEUX porteurs, et l'oubli du second ne se serait vu qu'en production :
    // l'écran aurait proposé de supprimer une image qu'une famille affiche.
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
    for (const group of [...byProduct, ...byCategory]) {
      if (group.mediaUrl === null) {
        continue;
      }
      counts.set(group.mediaUrl, (counts.get(group.mediaUrl) ?? 0) + group._count._all);
    }
    return counts;
  }
}
