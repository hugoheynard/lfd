import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { ProductNotFoundError } from "../../../catalogue/product/domain/errors/product-errors.js";
import { CatalogEmitter } from "../../../catalogue/shared/domain/ports/catalog-emitter.js";
import { CatalogFactsReader } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import {
  CatalogReemission,
  type ReemissionReport,
} from "../../../catalogue/shared/domain/ports/catalog-reemission.js";

/** `productId` = une fiche ; `null` = tout le catalogue, familles d'abord. */
export class ReemitCatalogCommand {
  constructor(readonly productId: string | null) {}
}

/**
 * **Réémettre** (2a6 de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`) :
 * le filet des faits du catalogue. Un fait perdu laisse une fiche en retard ;
 * la parité le montre, ceci le répare. « Tout » est aussi le geste qui remplit
 * la plateforme à l'ouverture des faits (2b4).
 *
 * Rend un compte-rendu, comme le push dont il prend la place : celui qui
 * répare doit savoir ce qui est parti et ce qui a échoué.
 *
 * @throws {ProductNotFoundError} la fiche visée n'existe pas.
 */
@CommandHandler(ReemitCatalogCommand)
export class ReemitCatalogHandler implements ICommandHandler<
  ReemitCatalogCommand,
  ReemissionReport
> {
  constructor(
    private readonly facts: CatalogFactsReader,
    private readonly emitter: CatalogEmitter,
    private readonly reemission: CatalogReemission,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReemitCatalogCommand): Promise<ReemissionReport> {
    if (command.productId === null) {
      return this.reemission.everything();
    }
    const { productId } = command;
    const [product] = await this.facts.products([productId]);
    if (product === undefined) {
      throw new ProductNotFoundError(productId);
    }
    await this.uow.run(() => this.emitter.emitProducts([productId]));
    return { categories: 0, products: 1, failedProducts: [] };
  }
}
