import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PreferredPickupReader } from "../domain/ports/preferred-pickup.reader.js";

/**
 * Adaptateur Prisma du point préféré. Le mur est l'identifiant lui-même : on
 * ne lit que la ligne de la société agissante (ou choisie par l'équipe).
 */
@Injectable()
export class PrismaPreferredPickupReader extends PreferredPickupReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async preferredPickupOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { preferredPickupAddressId: true },
    });
    return company?.preferredPickupAddressId ?? null;
  }
}
