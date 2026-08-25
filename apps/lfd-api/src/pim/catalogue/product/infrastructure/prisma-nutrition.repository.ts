import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { NutritionRepository } from "../domain/ports/nutrition.repository.js";
import type { NutritionDeclaration } from "../domain/value-objects/nutrition-declaration.js";

@Injectable()
export class PrismaNutritionRepository extends NutritionRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * `upsert` et non `create` : re-déclarer remplace, il n'existe pas deux fiches
   * pour une déclinaison — la clé primaire partagée l'interdit de toute façon.
   */
  async declare(variantId: string, declaration: NutritionDeclaration): Promise<void> {
    const data = {
      allergens: [...declaration.allergens],
      mayContain: [...declaration.mayContain],
      energyKcal: declaration.energyKcal ?? null,
      fatG: declaration.fatG ?? null,
      saturatedFatG: declaration.saturatedFatG ?? null,
      carbsG: declaration.carbsG ?? null,
      sugarsG: declaration.sugarsG ?? null,
      proteinG: declaration.proteinG ?? null,
      saltG: declaration.saltG ?? null,
      glycemicIndex: declaration.glycemicIndex ?? null,
    };

    await this.prisma.nutritionDeclaration.upsert({
      where: { variantId },
      create: { variantId, ...data },
      update: data,
    });
  }
}
