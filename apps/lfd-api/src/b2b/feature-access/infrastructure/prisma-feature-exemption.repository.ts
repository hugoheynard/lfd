import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { FeatureExemption } from "../domain/feature-exemption.js";
import {
  FeatureExemptionRepository,
  type ExemptionAddOutcome,
  type RemovedExemption,
} from "../domain/ports/feature-exemption.repository.js";

/** Adaptateur Prisma des exemptions. */
@Injectable()
export class PrismaFeatureExemptionRepository extends FeatureExemptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un `upsert` à mise à jour VIDE : une adresse déjà exemptée garde sa ligne,
   * son auteur et sa date. La ligne rendue dit laquelle a gagné — si son `id`
   * n'est pas celui qu'on proposait, l'adresse était déjà là.
   */
  async addIfAbsent(exemption: FeatureExemption): Promise<ExemptionAddOutcome> {
    const row = await this.prisma.featureAccessExemption.upsert({
      where: { key_email: { key: exemption.key, email: exemption.email } },
      create: {
        id: exemption.id,
        key: exemption.key,
        email: exemption.email,
        createdAt: exemption.at,
        // Les deux colonnes, même valeur, jusqu'à la bascule (plan de l'auteur, 5A).
        createdBySub: exemption.author.staffUserId,
        createdByStaffId: exemption.author.staffUserId,
        createdByName: exemption.author.name,
        createdByRole: exemption.author.role,
      },
      update: {},
      select: { id: true },
    });
    return { id: row.id, created: row.id === exemption.id };
  }

  async remove(key: string, id: string): Promise<RemovedExemption | null> {
    const existing = await this.prisma.featureAccessExemption.findFirst({
      where: { id, key },
      select: { email: true },
    });
    if (existing === null) {
      return null;
    }
    await this.prisma.featureAccessExemption.deleteMany({ where: { id, key } });
    return { email: existing.email };
  }
}
