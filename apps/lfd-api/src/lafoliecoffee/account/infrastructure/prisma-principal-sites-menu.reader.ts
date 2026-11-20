import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PrincipalSitesMenu,
  type PrincipalSitesMenuState,
} from "../domain/entities/principal-sites-menu.js";
import { PrincipalSitesMenuReader } from "../domain/ports/principal-sites-menu.reader.js";
import { MENU_BODY_SELECT, menuBodyOf } from "./sub-account-menu.mapper.js";

/** La carte commune d'un principal, relue par le mapper du dépôt : ses valeurs revalident. */
@Injectable()
export class PrismaPrincipalSitesMenuReader extends PrincipalSitesMenuReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string): Promise<PrincipalSitesMenuState | null> {
    const row = await this.prisma.principalSitesMenu.findUnique({
      where: { companyId },
      select: MENU_BODY_SELECT,
    });
    return row === null ? null : PrincipalSitesMenu.reconstitute(menuBodyOf(row)).toPersistence();
  }
}
