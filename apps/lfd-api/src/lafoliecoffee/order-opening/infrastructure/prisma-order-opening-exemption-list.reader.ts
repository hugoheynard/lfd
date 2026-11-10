import type { OrderOpeningExemptionView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderOpeningExemptionListReader } from "../domain/ports/order-opening-exemption-list.reader.js";
import { exemptionToView } from "./order-opening-exemption.mapper.js";

/** Adaptateur Prisma de la liste de l'écran : les actives, les plus récentes d'abord. */
@Injectable()
export class PrismaOrderOpeningExemptionListReader extends OrderOpeningExemptionListReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly OrderOpeningExemptionView[]> {
    const rows = await this.prisma.orderOpeningExemption.findMany({
      where: { withdrawnAt: null },
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(exemptionToView);
  }
}
