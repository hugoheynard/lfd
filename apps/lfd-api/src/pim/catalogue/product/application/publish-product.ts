import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class PublishProductCommand {
  constructor(readonly id: string) {}
}

/**
 * Met le produit en vente. Le refus — déclaration d'**allergènes** manquante,
 * produit archivé — appartient à l'agrégat : il est le seul à voir ses
 * déclinaisons, l'état de leurs déclarations et le défaut qu'elles suivent.
 *
 * ⚠️ Les valeurs nutritionnelles n'entrent pas dans ce refus : le règlement
 * (UE) n° 1169/2011 les exempte dans les deux cas de vente de La Folie Coffee
 * (`plan-separer-allergenes-et-nutrition.md`, D2).
 */
@CommandHandler(PublishProductCommand)
export class PublishProductHandler implements ICommandHandler<PublishProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PublishProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Déjà en vente : `publish()` rend `false` et rien ne bouge. Journaliser
    // quand même daterait une mise en vente au jour du second clic.
    if (!product.publish()) {
      return;
    }
    const { sku, name, variants } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productPublished,
        subjectType: "product",
        subjectId: command.id,
        payload: { subjectLabel: name.fr, sku, name },
        // La portée d'une mise en vente : les articles qui partent avec.
        blast: { variants: variants.length },
      });
      await this.products.save(product, ticket);
    });
  }
}
