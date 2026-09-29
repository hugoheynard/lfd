import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetProductColdRequirementCommand {
  constructor(
    readonly id: string,
    /** `true` = se conserve au froid ; `false` = rien de déclaré. */
    readonly requiresCold: boolean,
  ) {}
}

/**
 * **Déclare qu'une fiche demande le froid** — ou le retire (lot 4 bis du plan
 * de préparation de tournée, v2-2 : le froid est une propriété du PRODUIT,
 * publiée dans le catalogue B2B et relayée à la livraison).
 *
 * Journalisé comme la réservation aux opérations : un fait quand quelque chose
 * a changé, un motif `untraced` sinon.
 */
@CommandHandler(SetProductColdRequirementCommand)
export class SetProductColdRequirementHandler implements ICommandHandler<
  SetProductColdRequirementCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductColdRequirementCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    const changed = product.declareColdRequirement(command.requiresCold);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, changed);
      await this.products.save(product, ticket);
    });
  }

  private async journalize(product: Product, changed: boolean): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("froid de la fiche inchangé");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productColdRequirementChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        from: !product.requiresCold,
        to: product.requiresCold,
      },
    });
  }
}
