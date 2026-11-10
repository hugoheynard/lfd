import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { FeatureOverride } from "../domain/feature-override.js";
import { FeatureOverrideRepository } from "../domain/ports/feature-override.repository.js";

/**
 * Adaptateur Prisma des dérogations.
 *
 * Appelé sous `UnitOfWork` : la lecture de la valeur remplacée et l'écriture
 * partent dans la même transaction, avec la trace du journal.
 */
@Injectable()
export class PrismaFeatureOverrideRepository extends FeatureOverrideRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(override: FeatureOverride): Promise<string | null> {
    const previous = await this.prisma.featureAccessOverride.findUnique({
      where: { key: override.key },
      select: { value: true },
    });
    const row = {
      value: override.value,
      updatedAt: override.at,
      updatedByStaffId: override.author.staffUserId,
      updatedByName: override.author.name,
      updatedByRole: override.author.role,
    };
    await this.prisma.featureAccessOverride.upsert({
      where: { key: override.key },
      create: { key: override.key, ...row },
      update: row,
    });
    return previous?.value ?? null;
  }

  /**
   * `deleteMany` plutôt que `delete` : l'absence de ligne n'est pas une panne,
   * c'est une réponse — l'appelant décide de ce qu'elle veut dire.
   */
  async remove(key: string): Promise<string | null> {
    const previous = await this.prisma.featureAccessOverride.findUnique({
      where: { key },
      select: { value: true },
    });
    if (previous === null) {
      return null;
    }
    await this.prisma.featureAccessOverride.deleteMany({ where: { key } });
    return previous.value;
  }
}
