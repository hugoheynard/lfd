import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";

import {
  CategoryArchivedError,
  CategoryNotFoundError,
} from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { ProductRepository, type ProductKind } from "../domain/ports/product.repository.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import { requireProduct } from "./product-support.js";

export interface UpdateProductIdentityInput {
  /** Le nom, dans les langues renseignées — la source est obligatoire. Une
   *  CARTE et non `nameFr` + `nameEn` : ouvrir une langue ne doit pas ajouter un
   *  champ ici, ni chez les quatre autres commandes qui portaient les mêmes. */
  readonly name: LocalizedText;
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
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /** Ce que cette section possède — le reste de la fiche ne la regarde pas. */
  private static identityOf(snapshot: {
    name: LocalizedText;
    kind: ProductKind;
    categoryId: string;
  }): Record<string, unknown> {
    return { name: snapshot.name, kind: snapshot.kind, categoryId: snapshot.categoryId };
  }

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

    const before = UpdateProductIdentityHandler.identityOf(product.snapshot());
    product.rename(localizedText("nom", input.name));
    product.changeKind(input.kind);
    product.reclassify(input.categoryId);
    const changes = changesBetween(
      before,
      UpdateProductIdentityHandler.identityOf(product.snapshot()),
    );

    // Écriture et trace dans la MÊME transaction : l'une sans l'autre n'a pas
    // de sens ici. Enregistrer une section sans rien y changer n'écrit aucun
    // fait — sinon l'historique se remplit de gestes sans effet.
    await this.uow.run(async () => {
      await this.products.save(product);
      if (Object.keys(changes).length > 0) {
        await this.journal.record({
          type: PIM_EVENTS.productIdentitySaved,
          subjectType: "product",
          subjectId: id,
          payload: { changes },
        });
      }
    });
  }
}
