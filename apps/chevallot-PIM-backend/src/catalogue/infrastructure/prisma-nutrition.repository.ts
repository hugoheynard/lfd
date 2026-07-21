import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/database/prisma.service.js';
import { NutritionRepository } from '../domain/ports/nutrition.repository.js';
import type { NutritionDeclaration } from '../domain/value-objects/nutrition-declaration.js';

@Injectable()
export class PrismaNutritionRepository extends NutritionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `upsert` et non `create` : re-déclarer remplace, il n'existe pas deux fiches
   * pour une déclinaison — la clé primaire partagée l'interdit de toute façon.
   */
  async declare(
    variantId: string,
    declaration: NutritionDeclaration,
  ): Promise<void> {
    const data = {
      allergens: [...declaration.allergens],
      mayContain: [...declaration.mayContain],
      energyKcal: declaration.energyKcal ?? null,
      carbsG: declaration.carbsG ?? null,
      fatG: declaration.fatG ?? null,
      proteinG: declaration.proteinG ?? null,
      glycemicIndex: declaration.glycemicIndex ?? null,
    };

    await this.prisma.nutritionDeclaration.upsert({
      where: { variantId },
      create: { variantId, ...data },
      update: data,
    });
  }
}
