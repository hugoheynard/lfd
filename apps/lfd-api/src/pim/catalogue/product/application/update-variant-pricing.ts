import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireVariant } from "./product-support.js";

export interface UpdateVariantPricingInput {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
}

export class UpdateVariantPricingCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    readonly input: UpdateVariantPricingInput,
  ) {}
}

/** Section « Tarif & logistique » d'une déclinaison : prix + poids en une opération. */
@CommandHandler(UpdateVariantPricingCommand)
export class UpdateVariantPricingHandler implements ICommandHandler<
  UpdateVariantPricingCommand,
  void
> {
  constructor(private readonly products: ProductRepository) {}

  async execute(command: UpdateVariantPricingCommand): Promise<void> {
    const { productId, variantId, input } = command;
    await requireVariant(this.products, productId, variantId);
    await this.products.setVariantPrice(variantId, input.priceCents);
    await this.products.setVariantWeight(variantId, input.weightGrams);
  }
}
