import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";

import type { VariantPricing } from "../domain/entities/variant.js";
import { ProPriceHt } from "../domain/value-objects/pro-price-ht.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { namedVariant, requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

/**
 * Ce que la section « Tarif & TVA » envoie. L'assiette voyage AVEC le prix :
 * un nombre et sa signification ne s'enregistrent pas séparément, sinon la base
 * porte un montant dont personne ne sait s'il est hors taxe.
 *
 * Le prix pro HT (lot P) arrive en TEXTE, tel que saisi : c'est le value
 * object `ProPriceHt` qui le lit et refuse une sixième décimale. Absent =
 * inchangé, `null` = effacer.
 */
export interface UpdateVariantPricingInput {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  readonly proPriceHt?: string | null | undefined;
  /**
   * Les prix au kilo SAISIS (`plan-prix-au-kilo.md`) : le pro HT en texte,
   * lu par le même value object que le prix pro ; le public TTC en centimes,
   * comme le prix public. Absent = inchangé, `null` = effacer.
   */
  readonly proPricePerKgHt?: string | null | undefined;
  readonly publicPricePerKgTtcCents?: number | null | undefined;
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
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: UpdateVariantPricingCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    const before = pricingOf(product.snapshot().variants, variantId);
    product.priceVariant(variantId, pricingOfInput(input));
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
              payload: {
                subjectLabel: product.snapshot().name.fr,
                variant: namedVariant(product.snapshot(), variantId),
                changes,
              },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }
}

/** La saisie, lue par le domaine — le prix pro passe par son value object. */
function pricingOfInput(input: UpdateVariantPricingInput): VariantPricing {
  return {
    priceCents: input.priceCents,
    weightGrams: input.weightGrams,
    ...(input.proPriceHt === undefined ? {} : { proPrice: euros(input.proPriceHt) }),
    ...(input.proPricePerKgHt === undefined ? {} : { proPricePerKg: euros(input.proPricePerKgHt) }),
    ...(input.publicPricePerKgTtcCents === undefined
      ? {}
      : { publicPricePerKgTtcCents: input.publicPricePerKgTtcCents }),
  };
}

function euros(raw: string | null): ProPriceHt | null {
  return raw === null ? null : ProPriceHt.fromEuros(raw);
}

/**
 * Ce que la section « Tarif & logistique » possède, pour UNE déclinaison.
 *
 * Le prix pro y entre (lot P) : sa clé est celle de la révision et du contrat
 * du fait, `proPriceMillicents`, pour que `attribution.ts` le lise tel quel.
 * Les prix au kilo aussi : sans eux, une saisie du seul kilo serait
 * `untraced` (`plan-prix-au-kilo.md`, K1).
 */
function pricingOf(
  variants: readonly {
    readonly id: string;
    readonly priceCents: number | null;
    readonly weightGrams: number | null;
    readonly proPriceMillicents: number | null;
    readonly proPricePerKgMillicents: number | null;
    readonly publicPricePerKgTtcCents: number | null;
  }[],
  variantId: string,
): Record<string, unknown> {
  const variant = variants.find((candidate) => candidate.id === variantId);
  return {
    priceCents: variant?.priceCents ?? null,
    weightGrams: variant?.weightGrams ?? null,
    proPriceMillicents: variant?.proPriceMillicents ?? null,
    proPricePerKgMillicents: variant?.proPricePerKgMillicents ?? null,
    publicPricePerKgTtcCents: variant?.publicPricePerKgTtcCents ?? null,
  };
}
