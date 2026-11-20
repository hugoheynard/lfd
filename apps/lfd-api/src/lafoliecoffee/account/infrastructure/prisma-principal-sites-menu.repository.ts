import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShelfChanges } from "../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { companyShelves } from "../../shared/shelf-changes/domain/shelf-change-scope.js";
import { PrincipalSitesMenu } from "../domain/entities/principal-sites-menu.js";
import { PrincipalSitesMenuRepository } from "../domain/ports/principal-sites-menu.repository.js";
import { MENU_BODY_SELECT, menuBodyOf, menuHeaderOf } from "./sub-account-menu.mapper.js";

/**
 * Le dépôt de la carte commune des sites, de la forme de celui de la carte
 * d'un site : l'en-tête s'`upsert`, les entrées retirées par l'agrégat sont
 * supprimées physiquement, la carte jamais.
 */
@Injectable()
export class PrismaPrincipalSitesMenuRepository extends PrincipalSitesMenuRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shelves: ShelfChanges,
  ) {
    super();
  }

  async load(companyId: string): Promise<PrincipalSitesMenu | null> {
    const row = await this.prisma.principalSitesMenu.findUnique({
      where: { companyId },
      select: MENU_BODY_SELECT,
    });
    return row === null ? null : PrincipalSitesMenu.reconstitute(menuBodyOf(row));
  }

  async save(menu: PrincipalSitesMenu): Promise<void> {
    const companyId = menu.companyId;
    const header = menuHeaderOf(menu);
    const kept = menu.entries.map((entry) => entry.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.principalSitesMenu.upsert({
        where: { companyId },
        create: { companyId, ...header },
        update: header,
      });
      await tx.principalSitesMenuEntry.deleteMany({ where: { companyId, id: { notIn: kept } } });
      await tx.principalSitesMenuEntry.createMany({
        data: menu.entries.map((entry) => ({ companyId, ...entry })),
        skipDuplicates: true,
      });
    });
    // UNE portée : celle du principal couvre ses sites (le magasin des rayons
    // efface aussi les entrées dont il est le principal) — pas d'énumération,
    // donc pas de course avec un rattachement.
    this.shelves.changed(companyShelves(companyId));
  }
}
