import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { NutritionValuesRepository } from "../domain/ports/nutrition-values.repository.js";
import type { NutritionValues } from "../domain/value-objects/nutrition-declaration.js";

@Injectable()
export class PrismaNutritionValuesRepository extends NutritionValuesRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * `upsert` nu, comme son voisin des allergènes. `undefined` dans le value
   * object (« pas fourni ») devient `null` en base (« pas renseigné ») : la
   * table n'a pas de troisième état à offrir, et laisser passer `undefined`
   * ferait garder à Prisma l'ancienne valeur — donc effacer un champ à l'écran
   * n'effacerait rien.
   */
  async save(variantId: string, values: NutritionValues): Promise<void> {
    const data = {
      energyKcal: values.energyKcal ?? null,
      fatG: values.fatG ?? null,
      saturatedFatG: values.saturatedFatG ?? null,
      carbsG: values.carbsG ?? null,
      sugarsG: values.sugarsG ?? null,
      proteinG: values.proteinG ?? null,
      saltG: values.saltG ?? null,
      glycemicIndex: values.glycemicIndex ?? null,
    };
    await this.prisma.nutritionValues.upsert({
      where: { variantId },
      create: { variantId, ...data },
      update: data,
    });
  }
}
