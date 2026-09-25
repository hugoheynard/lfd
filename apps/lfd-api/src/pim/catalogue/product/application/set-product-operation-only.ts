import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetProductOperationOnlyCommand {
  constructor(
    readonly id: string,
    /** `true` = vendu seulement pendant une opération ; `false` = article courant. */
    readonly operationOnly: boolean,
  ) {}
}

/**
 * **Réserve une fiche aux opérations datées** — ou la rend à la vente courante
 * (D3 de `documentation/order/architecture-operations-datees.md`).
 *
 * ⚠️ Jusqu'au lot 3 du même plan, le drapeau traverse le fil mais **ne refuse
 * aucune vente** : la garde et lui partent dans le même merge, et c'est ce qui
 * rend « inexprimable avant d'être gardé » vrai côté boutique.
 *
 * Journalisé comme les canaux de la fiche : un fait quand quelque chose a
 * changé, un motif `untraced` sinon — un enregistrement sans effet n'a pas de
 * fait à nommer.
 */
@CommandHandler(SetProductOperationOnlyCommand)
export class SetProductOperationOnlyHandler implements ICommandHandler<
  SetProductOperationOnlyCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductOperationOnlyCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    const changed = product.reserveForOperations(command.operationOnly);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, changed);
      await this.products.save(product, ticket);
    });
  }

  private async journalize(product: Product, changed: boolean): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("réservation aux opérations inchangée");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productOperationOnlyChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        from: !product.operationOnly,
        to: product.operationOnly,
      },
    });
  }
}
