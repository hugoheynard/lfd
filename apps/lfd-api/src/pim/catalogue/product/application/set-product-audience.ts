import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetProductAudienceCommand {
  constructor(
    readonly id: string,
    /** `null` = la fiche revient à l'audience de sa famille. */
    readonly audience: Audience | null,
  ) {}
}

/**
 * **Élargit ou restreint à qui la fiche vend** — ou la rend à sa famille (1c
 * du plan `plan-catalogue-synchronise-par-audience.md`).
 *
 * Aucun refus, même sur une fiche active : l'audience se juge à l'activation,
 * et au lot 2 dans la projection, qui lit l'état final quel que soit le geste
 * (C1). Au lot 1, aucune émission ne la lit encore.
 */
@CommandHandler(SetProductAudienceCommand)
export class SetProductAudienceHandler implements ICommandHandler<SetProductAudienceCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductAudienceCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    const before = product.audience;
    const changed = product.changeAudience(command.audience);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, before, changed);
      await this.products.save(product, ticket);
    });
  }

  private async journalize(
    product: Product,
    before: Audience | null,
    changed: boolean,
  ): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("audience de la fiche inchangée");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productAudienceChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        audience: { from: before, to: product.audience },
      },
    });
  }
}
