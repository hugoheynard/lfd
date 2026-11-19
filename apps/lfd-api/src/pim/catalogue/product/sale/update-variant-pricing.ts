import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";

import type { VariantPricing } from "../domain/entities/variant.js";
import { ProPriceHt } from "../domain/value-objects/pro-price-ht.js";
import type { SaleUnit } from "../domain/value-objects/sale-terms.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { namedVariant, requireProduct } from "../shared/product-support.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";
import { SaleReferenceUsage } from "../domain/ports/sale-reference-usage.js";
import type { Product } from "../domain/entities/product.js";
import type { SaleUnitClearance } from "../domain/value-objects/sale-reference-usage.js";
import { clearancesOf } from "./sale-unit-clearance-support.js";
import { pricingSectionOf } from "../domain/entities/variant-pricing-section.js";
import type { VariantSnapshot } from "../domain/entities/variant-snapshot.js";

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
   * Les prix au kilo SAISIS (`saisir-un-prix.md`) : le pro HT en texte,
   * lu par le même value object que le prix pro ; le public TTC en centimes,
   * comme le prix public. Absent = inchangé, `null` = effacer.
   */
  readonly proPricePerKgHt?: string | null | undefined;
  readonly publicPricePerKgTtcCents?: number | null | undefined;
  /** Montrer chaque prix au kilo à son audience (`saisir-un-prix.md`). Absent = inchangé. */
  readonly pricePerKgShownPublic?: boolean | undefined;
  readonly pricePerKgShownPro?: boolean | undefined;
  /**
   * L'unité de vente, le minimum et le pas en grammes
   * (`vente-au-poids.md`, lot P1). Absent = inchangé ; le domaine refuse
   * de changer l'unité d'une référence qui a déjà servi
   * (`saisir-un-prix.md`, § 3).
   */
  readonly saleUnit?: SaleUnit | undefined;
  readonly weightMinGrams?: number | null | undefined;
  readonly weightStepGrams?: number | null | undefined;
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
    private readonly usage: SaleReferenceUsage,
  ) {}

  async execute(command: UpdateVariantPricingCommand): Promise<void> {
    const { productId, variantId, input } = command;
    const product = await requireProduct(this.products, productId);
    const before = pricingSectionOf(variantOf(product, variantId));
    const clearance = await clearanceOf(this.usage, product, variantId, input.saleUnit);
    product.priceVariant(variantId, pricingOfInput(input), clearance);
    const changes = changesBetween(before, pricingSectionOf(variantOf(product, variantId)));

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

/**
 * La réponse du commerce, lue SEULEMENT quand l'unité demandée change : régler
 * un prix ou un pas ne demande rien à personne. Le domaine juge la réponse
 * (option « le handler lit, le domaine décide » du plan, § 5).
 */
async function clearanceOf(
  usage: SaleReferenceUsage,
  product: Product,
  variantId: string,
  saleUnit: SaleUnit | undefined,
): Promise<SaleUnitClearance | undefined> {
  const snapshot = product.snapshot();
  const variant = snapshot.variants.find((candidate) => candidate.id === variantId);
  if (saleUnit === undefined || variant === undefined || variant.saleUnit === saleUnit) {
    return undefined;
  }
  const reference = { sku: variant.sku, productSku: snapshot.sku, isDefault: variant.isDefault };
  return (await clearancesOf(usage, [reference])).get(variant.sku);
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
    ...(input.pricePerKgShownPublic === undefined
      ? {}
      : { pricePerKgShownPublic: input.pricePerKgShownPublic }),
    ...(input.pricePerKgShownPro === undefined
      ? {}
      : { pricePerKgShownPro: input.pricePerKgShownPro }),
    ...(input.saleUnit === undefined ? {} : { saleUnit: input.saleUnit }),
    ...(input.weightMinGrams === undefined ? {} : { weightMinGrams: input.weightMinGrams }),
    ...(input.weightStepGrams === undefined ? {} : { weightStepGrams: input.weightStepGrams }),
  };
}

function euros(raw: string | null): ProPriceHt | null {
  return raw === null ? null : ProPriceHt.fromEuros(raw);
}

/** La déclinaison résolue, telle que l'écran la montre — absente si elle n'est pas sous la fiche. */
function variantOf(product: Product, variantId: string): VariantSnapshot | undefined {
  return product.snapshot().variants.find((candidate) => candidate.id === variantId);
}
