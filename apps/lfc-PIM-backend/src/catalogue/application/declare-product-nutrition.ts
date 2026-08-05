import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { NutritionRepository } from '../domain/ports/nutrition.repository.js';
import { ProductRepository } from '../domain/ports/product.repository.js';
import {
  nutritionDeclaration,
  type NutritionValues,
} from '../domain/value-objects/nutrition-declaration.js';
import { requireVariant } from './product-support.js';

export interface DeclareNutritionInput {
  readonly allergens: readonly string[];
  readonly mayContain?: readonly string[] | undefined;
  readonly nutrition?: NutritionValues | undefined;
}

export class DeclareProductNutritionCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly input: DeclareNutritionInput,
  ) {}
}

/** (Re)déclare la fiche réglementaire d'une déclinaison (doc 03). */
@CommandHandler(DeclareProductNutritionCommand)
export class DeclareProductNutritionHandler implements ICommandHandler<
  DeclareProductNutritionCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly nutrition: NutritionRepository,
  ) {}

  async execute(command: DeclareProductNutritionCommand): Promise<void> {
    const { productId, variantId, input } = command;
    await requireVariant(this.products, productId, variantId);
    const declaration = nutritionDeclaration(
      input.allergens,
      input.mayContain ?? [],
      input.nutrition ?? {},
    );
    await this.nutrition.declare(variantId, declaration);
  }
}
