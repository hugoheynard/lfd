import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PrincipalSitesMenu } from "../domain/entities/principal-sites-menu.js";
import { SubAccountMenuReader, type SiteMenus } from "../domain/ports/sub-account-menu.reader.js";
import {
  MENU_BODY_SELECT,
  MENU_SELECT,
  menuBodyOf,
  menuToDomain,
} from "./sub-account-menu.mapper.js";

/**
 * La carte propre d'un site et la carte commune de son principal, en UNE
 * requête par la relation `parentCompany`, relues par les mappers du dépôt :
 * leurs valeurs revalident.
 */
@Injectable()
export class PrismaSubAccountMenuReader extends SubAccountMenuReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string): Promise<SiteMenus> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        subAccountMenu: { select: MENU_SELECT },
        parentCompany: { select: { principalSitesMenu: { select: MENU_BODY_SELECT } } },
      },
    });
    const own = row?.subAccountMenu ?? null;
    const common = row?.parentCompany?.principalSitesMenu ?? null;
    return {
      own: own === null ? null : menuToDomain(own).toPersistence(),
      common:
        common === null
          ? null
          : PrincipalSitesMenu.reconstitute(menuBodyOf(common)).toPersistence(),
    };
  }
}
