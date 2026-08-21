import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

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

/**
 * Section « Tarif & logistique » d'une déclinaison : prix + poids en une
 * opération. L'appartenance de la déclinaison au produit est tenue par
 * l'agrégat — une requête forgée ne peut plus tarifer la variante d'un autre.
 */
@CommandHandler(UpdateVariantPricingCommand)
export class UpdateVariantPricingHandler implements ICommandHandler<
  UpdateVariantPricingCommand,
  void
> {
  constructor(private readonly products: ProductRepository) {}

  async execute(command: UpdateVariantPricingCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    product.priceVariant(variantId, input.priceCents, input.weightGrams);
    await this.products.save(product);
  }
}
