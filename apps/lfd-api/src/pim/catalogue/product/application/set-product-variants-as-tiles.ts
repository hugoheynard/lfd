import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class SetProductVariantsAsTilesCommand {
  constructor(
    readonly id: string,
    /** `true` = chaque déclinaison vivante a sa vignette ; `false` = le défaut seul. */
    readonly variantsAsTiles: boolean,
  ) {}
}

/**
 * **Montre chaque déclinaison en vignette au rayon** — ou seulement la
 * déclinaison par défaut (`documentation/catalogue/plan-declinaisons-en-vignette.md`, V1).
 *
 * Journalisé comme le froid : un fait quand quelque chose a changé, un motif
 * `untraced` sinon. Émis au catalogue dans la même unité de travail : c'est
 * la vitrine du commerce qui lit l'option.
 */
@CommandHandler(SetProductVariantsAsTilesCommand)
export class SetProductVariantsAsTilesHandler implements ICommandHandler<
  SetProductVariantsAsTilesCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetProductVariantsAsTilesCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    const changed = product.showVariantsAsTiles(command.variantsAsTiles);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, changed);
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([command.id]);
    });
  }

  private async journalize(product: Product, changed: boolean): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("vignettes de déclinaison inchangées");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productVariantsAsTilesChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        from: !product.variantsAsTiles,
        to: product.variantsAsTiles,
      },
    });
  }
}
