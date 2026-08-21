import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  CategoryArchivedError,
  CategoryNotFoundError,
} from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { ProductRepository, type ProductKind } from "../domain/ports/product.repository.js";
import { localizedText } from "../../shared/domain/value-objects/localized-text.js";
import { requireProduct } from "./product-support.js";

export interface UpdateProductIdentityInput {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
  readonly kind: ProductKind;
  readonly categoryId: string;
}

export class UpdateProductIdentityCommand {
  constructor(
    readonly id: string,
    readonly input: UpdateProductIdentityInput,
  ) {}
}

/**
 * Section « Identité » en **une** opération (nom + nature + famille) : le back-office
 * enregistre par section, pas champ par champ. Valide la famille cible avant d'écrire
 * quoi que ce soit — un refus ne doit rien laisser à moitié modifié.
 */
@CommandHandler(UpdateProductIdentityCommand)
export class UpdateProductIdentityHandler implements ICommandHandler<
  UpdateProductIdentityCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(command: UpdateProductIdentityCommand): Promise<void> {
    const { id, input } = command;
    const product = await requireProduct(this.products, id);

    const category = await this.categories.findById(input.categoryId);
    if (category === null) {
      throw new CategoryNotFoundError(input.categoryId);
    }
    if (category.isArchived) {
      throw new CategoryArchivedError(input.categoryId);
    }

    product.rename(localizedText("nom", input.nameFr, input.nameEn));
    product.changeKind(input.kind);
    product.reclassify(input.categoryId);
    await this.products.save(product);
  }
}
