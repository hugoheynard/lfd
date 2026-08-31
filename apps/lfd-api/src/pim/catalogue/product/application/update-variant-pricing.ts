import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";

import type { VariantPricing } from "../domain/entities/variant.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

/**
 * Ce que la section « Tarif & TVA » envoie. L'assiette voyage AVEC le prix :
 * un nombre et sa signification ne s'enregistrent pas séparément, sinon la base
 * porte un montant dont personne ne sait s'il est hors taxe.
 */
export type UpdateVariantPricingInput = VariantPricing;

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
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateVariantPricingCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    const before = pricingOf(product.snapshot().variants, variantId);
    product.priceVariant(variantId, input);
    const changes = changesBetween(before, pricingOf(product.snapshot().variants, variantId));

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productPricingSaved,
              subjectType: "product",
              subjectId: productId,
              // La déclinaison est DANS la charge, pas dans le sujet :
              // l'historique se lit par fiche, et un sujet « variante » le
              // couperait en autant de fils qu'il y a de déclinaisons.
              payload: { variantId, changes },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.products.save(product, ticket);
    });
  }
}

/** Ce que la section « Tarif & logistique » possède, pour UNE déclinaison. */
function pricingOf(
  variants: readonly {
    readonly id: string;
    readonly priceCents: number | null;
    readonly weightGrams: number | null;
  }[],
  variantId: string,
): Record<string, unknown> {
  const variant = variants.find((candidate) => candidate.id === variantId);
  return {
    priceCents: variant?.priceCents ?? null,
    weightGrams: variant?.weightGrams ?? null,
  };
}
