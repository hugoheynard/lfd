import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderOpeningExemption } from "../domain/order-opening-exemption.js";
import { ActiveOrderOpeningExemptions } from "../domain/ports/active-order-opening-exemptions.reader.js";
import { exemptionToDomain } from "./order-opening-exemption.mapper.js";

/**
 * Les exemptions actives, en agrégats. Lues EN ENTIER à chaque passation
 * refusée par la fermeture : une liste tenue à la main par l'équipe reste
 * courte, et la comparaison se fait dans le domaine, au même endroit que la
 * normalisation de l'adresse.
 */
@Injectable()
export class PrismaActiveOrderOpeningExemptions extends ActiveOrderOpeningExemptions {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async active(): Promise<readonly OrderOpeningExemption[]> {
    const rows = await this.prisma.orderOpeningExemption.findMany({
      where: { withdrawnAt: null },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map(exemptionToDomain);
  }
}
