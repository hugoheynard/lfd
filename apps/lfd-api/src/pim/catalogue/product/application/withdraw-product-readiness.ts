import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import {
  ArchivedProductReadinessError,
  ProductNotDeclaredReadyError,
} from "../domain/errors/product-errors.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { ReadinessRepository } from "../domain/ports/readiness.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class WithdrawProductReadinessCommand {
  constructor(readonly id: string) {}
}

/**
 * **Retirer la signature** — le geste inverse de « Déclarer publiable »
 * (décision de Hugo, 2026-10-26 : une signature posée par erreur ne se
 * défaisait pas).
 *
 * La ligne `product_readiness` est SUPPRIMÉE, et c'est délibéré : elle n'a
 * jamais porté d'historique — `declare` l'écrase à chaque nouvelle signature.
 * L'historique est au journal, qui garde la signature et son retrait. Une
 * colonne `withdrawn_at` aurait obligé chaque lecteur (fiche, capture de
 * révision) à apprendre qu'une ligne présente peut ne rien signer.
 *
 * Comme la déclaration, elle ne touche PAS au statut : une fiche en vente reste
 * en vente, seule la caution « contenu vérifié » tombe. Le catalogue est
 * réémis, parce que la capture de révision lit la signature.
 */
@CommandHandler(WithdrawProductReadinessCommand)
export class WithdrawProductReadinessHandler implements ICommandHandler<
  WithdrawProductReadinessCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly readiness: ReadinessRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: WithdrawProductReadinessCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    if (product.status === "archived") {
      throw new ArchivedProductReadinessError(command.id);
    }
    if ((await this.readiness.read(command.id)) === null) {
      throw new ProductNotDeclaredReadyError(command.id);
    }
    const { sku, name } = product.snapshot();
    // Le fait et le retrait dans la même transaction, pour la raison de
    // `DeclareProductReadyHandler` : l'historique ne doit jamais affirmer ce
    // que la base ne porte pas.
    await this.uow.run(async () => {
      await this.journal.trace({
        type: PIM_EVENTS.productReadyWithdrawn,
        subjectType: "product",
        subjectId: command.id,
        payload: { subjectLabel: name.fr, sku, name },
      });
      await this.readiness.withdraw(command.id);
      await this.emitter.emitProducts([command.id]);
    });
  }
}
