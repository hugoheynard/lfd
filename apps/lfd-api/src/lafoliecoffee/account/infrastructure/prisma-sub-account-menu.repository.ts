import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShelfChanges } from "../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { companyShelves } from "../../shared/shelf-changes/domain/shelf-change-scope.js";
import type { SubAccountMenu } from "../domain/entities/sub-account-menu.js";
import { SubAccountMenuRepository } from "../domain/ports/sub-account-menu.repository.js";
import { MENU_SELECT, menuHeaderOf, menuToDomain } from "./sub-account-menu.mapper.js";

/**
 * Le dépôt de la carte d'un sous-compte. La carte est clée par la société :
 * l'en-tête s'`upsert`, les entrées sont réécrites sous le `company_id`.
 *
 * Une entrée retirée par l'agrégat est supprimée **physiquement** : elle
 * n'est pas un agrégat, seulement une ligne de la carte, et la carte, elle,
 * ne disparaît jamais. Une entrée garde son `id` d'un enregistrement à
 * l'autre ; seules les neuves s'insèrent.
 */
@Injectable()
export class PrismaSubAccountMenuRepository extends SubAccountMenuRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shelves: ShelfChanges,
  ) {
    super();
  }

  async load(companyId: string): Promise<SubAccountMenu | null> {
    const row = await this.prisma.subAccountMenu.findUnique({
      where: { companyId },
      select: MENU_SELECT,
    });
    return row === null ? null : menuToDomain(row);
  }

  async save(menu: SubAccountMenu): Promise<void> {
    const companyId = menu.companyId;
    const header = { ...menuHeaderOf(menu), state: menu.state };
    const kept = menu.entries.map((entry) => entry.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.subAccountMenu.upsert({
        where: { companyId },
        create: { companyId, ...header },
        update: header,
      });
      await tx.subAccountMenuEntry.deleteMany({ where: { companyId, id: { notIn: kept } } });
      await tx.subAccountMenuEntry.createMany({
        data: menu.entries.map((entry) => ({ companyId, ...entry })),
        skipDuplicates: true,
      });
    });
    // La carte décide de ce que le rayon de CE site sert.
    this.shelves.changed(companyShelves(companyId));
  }
}
