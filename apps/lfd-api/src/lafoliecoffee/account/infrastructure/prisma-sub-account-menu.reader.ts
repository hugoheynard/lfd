import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { SubAccountMenuState } from "../domain/entities/sub-account-menu.js";
import { SubAccountMenuReader } from "../domain/ports/sub-account-menu.reader.js";
import { MENU_SELECT, menuToDomain } from "./sub-account-menu.mapper.js";

/** La carte d'un sous-compte, relue par le mapper du dépôt : ses valeurs revalident. */
@Injectable()
export class PrismaSubAccountMenuReader extends SubAccountMenuReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string): Promise<SubAccountMenuState | null> {
    const row = await this.prisma.subAccountMenu.findUnique({
      where: { companyId },
      select: MENU_SELECT,
    });
    return row === null ? null : menuToDomain(row).toPersistence();
  }
}
