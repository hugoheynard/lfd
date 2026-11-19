import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterSites, type CounterSite } from "../domain/counter-sites.js";

/**
 * Les points non archivés (`site`), par nom. Lit la table `site` en direct,
 * comme `PrismaResupplySites` et pour la même raison : elle appartient au
 * contexte `lafoliecoffee/sites`, du MÊME bloc (`lint:prisma-model-ownership`
 * raisonne par bloc).
 */
@Injectable()
export class PrismaCounterSites extends CounterSites {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  active(): Promise<readonly CounterSite[]> {
    return this.prisma.site.findMany({
      where: { archivedAt: null },
      select: { id: true, label: true },
      orderBy: { label: "asc" },
    });
  }
}
