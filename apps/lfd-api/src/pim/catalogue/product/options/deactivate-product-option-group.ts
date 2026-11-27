import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { OptionGroupOffers } from "../../../reference/product-options/domain/ports/option-group-offers.reader.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";
import { ProductOptionActivationRepository } from "../domain/ports/product-option-activation.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "../shared/product-support.js";
import { ficheOf, requireOffer } from "./product-option-support.js";

export class DeactivateProductOptionGroupCommand {
  constructor(
    readonly productId: string,
    readonly groupId: string,
  ) {}
}

/**
 * **Retire un groupe d'options d'une fiche** : il n'y est plus proposé. La
 * ligne reste, retirée (`revoked_at`) ; les commandes passées gardent leur
 * instantané. Une fiche archivée refuse. Rejoué sur un groupe déjà retiré :
 * ni écriture, ni fait, ni émission.
 */
@CommandHandler(DeactivateProductOptionGroupCommand)
export class DeactivateProductOptionGroupHandler implements ICommandHandler<
  DeactivateProductOptionGroupCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly activations: ProductOptionActivationRepository,
    private readonly offers: OptionGroupOffers,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: DeactivateProductOptionGroupCommand): Promise<void> {
    const { productId, groupId } = command;
    const product = await requireProduct(this.products, productId);
    await this.uow.run(async () => {
      const group = await requireOffer(this.offers, groupId);
      const activations = await this.activations.load(productId);
      if (!activations.deactivate(ficheOf(product), groupId, this.clock.now())) {
        return;
      }
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productOptionGroupDeactivated,
        subjectType: "product",
        subjectId: productId,
        payload: { subjectLabel: product.snapshot().name.fr, name: group.name },
      });
      await this.activations.save(activations, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }
}
