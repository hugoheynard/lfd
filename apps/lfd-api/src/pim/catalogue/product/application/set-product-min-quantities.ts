import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import type { Product } from "../domain/entities/product.js";
import type { VariantSnapshot } from "../domain/entities/variant.js";
import { VariantNotFoundError } from "../domain/errors/product-errors.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { minQuantities, type MinQuantities } from "../domain/value-objects/min-quantities.js";
import { namedVariant, requireProduct } from "./product-support.js";

export class SetProductMinQuantitiesCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    /** Le minimum pro et le minimum public, ou `"follow"` : elle suit le défaut. */
    readonly minQuantities: MinQuantities | "follow",
  ) {}
}

/** Ce que le journal garde d'un côté du geste — les minimums PROPRES, et le drapeau. */
interface MinQuantityState extends MinQuantities {
  readonly followsDefault: boolean;
}

/**
 * **Pose la quantité minimale d'achat d'une déclinaison**, ou la fait suivre
 * le défaut (`documentation/catalogue/plan-quantite-minimale.md`, M1).
 *
 * Sa propre route, hors de « Tout enregistrer », comme l'audience : les
 * minimums s'enregistrent au geste. Les refus sont au domaine — quantité sous
 * 2, défaut qui se suivrait, déclinaison au poids. Le catalogue réémet la
 * fiche, qui porte les minimums EFFECTIFS au commerce.
 */
@CommandHandler(SetProductMinQuantitiesCommand)
export class SetProductMinQuantitiesHandler implements ICommandHandler<
  SetProductMinQuantitiesCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetProductMinQuantitiesCommand): Promise<void> {
    const product = await requireProduct(this.products, command.productId);
    const next =
      command.minQuantities === "follow" ? "follow" : minQuantities(command.minQuantities);
    const before = stateOf(ownVariant(product, command.variantId));
    const changed = product.changeMinQuantities(command.variantId, next);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, command.variantId, before, changed);
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([command.productId]);
    });
  }

  private async journalize(
    product: Product,
    variantId: string,
    before: MinQuantityState,
    changed: boolean,
  ): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("quantité minimale de la déclinaison inchangée");
    }
    const after = stateOf(ownVariant(product, variantId));
    const snapshot = product.snapshot();
    return this.journal.trace({
      type: PIM_EVENTS.productMinQuantitiesChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        variant: namedVariant(snapshot, variantId),
        minQuantities: { from: before, to: after },
      },
    });
  }
}

/**
 * La déclinaison telle qu'elle PORTE ses minimums — l'instantané de persistance,
 * non résolu : le journal dit ce qui a été écrit, pas ce que l'héritage sert.
 */
function ownVariant(product: Product, variantId: string): VariantSnapshot {
  const own = product.persistenceSnapshot().variants.find((variant) => variant.id === variantId);
  if (own === undefined) {
    throw new VariantNotFoundError(product.id, variantId);
  }
  return own;
}

function stateOf(variant: VariantSnapshot): MinQuantityState {
  return { followsDefault: variant.minQuantityFollowsDefault, ...variant.minQuantities };
}
