import type { AdminBackorderView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import {
  BackorderListReader,
  type BackorderListFilter,
} from "../domain/ports/backorder-list.reader.js";
import { BACKORDER_VIEW_SELECT, backorderViewOf } from "./backorder-view.mapper.js";

/**
 * La liste des reliquats, en une requête : l'état, et `company_id` dans le
 * `where` quand une société est demandée. Du plus ancien au plus récent, à
 * égalité par identifiant (ULID, triable par le temps).
 */
@Injectable()
export class PrismaBackorderListReader extends BackorderListReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(filter: BackorderListFilter): Promise<readonly AdminBackorderView[]> {
    const rows = await this.prisma.backorder.findMany({
      where: {
        state: filter.state,
        ...(filter.companyId === null ? {} : { companyId: filter.companyId }),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: BACKORDER_VIEW_SELECT,
    });
    return rows.map(backorderViewOf);
  }
}
