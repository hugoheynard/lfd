import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogAdminChangePruner } from "../domain/ports/catalog-admin-change.pruner.js";

/**
 * Le balayage de `public.catalog_admin_change`. Une suppression PHYSIQUE, et
 * c'est permis : ce journal n'est pas un agrégat métier, c'est un numéro
 * d'affichage.
 */
@Injectable()
export class PrismaCatalogAdminChangePruner extends CatalogAdminChangePruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pruneBefore(instant: Date): Promise<number> {
    const { count } = await this.prisma.catalogAdminChange.deleteMany({
      where: { changedAt: { lt: instant } },
    });
    return count;
  }
}
