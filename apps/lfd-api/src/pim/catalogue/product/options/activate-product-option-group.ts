import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { OptionGroupOffers } from "../../../reference/product-options/domain/ports/option-group-offers.reader.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";
import type { Product } from "../domain/entities/product.js";
import { ProductOptionActivationRepository } from "../domain/ports/product-option-activation.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "../shared/product-support.js";
import { ficheOf, requireOffer, variantNamesOf } from "./product-option-support.js";

export class ActivateProductOptionGroupCommand {
  constructor(
    readonly productId: string,
    readonly groupId: string,
    /** `null` = toutes les déclinaisons, celles qui viendront comprises. */
    readonly variantIds: readonly string[] | null,
  ) {}
}

/**
 * **Active un groupe d'options sur une fiche** — ou change ses déclinaisons
 * (`plan-options-de-commande.md`, § 3.1). Les refus sont ceux de l'agrégat :
 * fiche archivée, groupe archivé, liste vide ou étrangère. Au poids comme à
 * la pièce.
 *
 * Le fait de la fiche part dans la même unité de travail : il porte, par
 * déclinaison, les groupes actifs (v19). Rejoué à l'identique : le journal
 * se tait, le fait repart (il est un instantané).
 */
@CommandHandler(ActivateProductOptionGroupCommand)
export class ActivateProductOptionGroupHandler implements ICommandHandler<
  ActivateProductOptionGroupCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly activations: ProductOptionActivationRepository,
    private readonly offers: OptionGroupOffers,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: ActivateProductOptionGroupCommand): Promise<void> {
    const { productId, groupId, variantIds } = command;
    const product = await requireProduct(this.products, productId);
    await this.uow.run(async () => {
      const group = await requireOffer(this.offers, groupId);
      const activations = await this.activations.load(productId);
      const changed = activations.activate(ficheOf(product), group, variantIds);
      const ticket = await this.journalize(product, group.name, changed, variantIds);
      await this.activations.save(activations, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }

  private journalize(
    product: Product,
    groupName: string,
    changed: boolean,
    variantIds: readonly string[] | null,
  ): Promise<WriteTicket> {
    if (!changed) {
      return Promise.resolve(this.journal.untraced("groupe d'options déjà actif ainsi"));
    }
    return this.journal.trace({
      type: PIM_EVENTS.productOptionGroupActivated,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        name: groupName,
        variants: variantIds === null ? null : variantNamesOf(product, variantIds),
      },
    });
  }
}
