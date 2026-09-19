import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween, type FieldChanges } from "../../../journal/changes.js";
import { PIM_EVENTS, PimJournal, type WriteTicket } from "../../../journal/pim-journal.js";

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
    const previousCategoryId = product.categoryId;
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
      const ticket = await this.journalize(id, changes, previousCategoryId, product.categoryId);
      await this.products.save(product, ticket);
    });
  }

  /**
   * La trace d'abord : c'est elle qui délivre le laissez-passer sans lequel le
   * dépôt refuse d'écrire. Rien n'a changé ? On le DIT, et le motif se grep —
   * un enregistrement sans effet n'a pas de fait à nommer.
   *
   * Changer de famille change les taux et les canaux dont la fiche hérite : un
   * fait à part (`product.reclassified`), que la comptabilité relit sans relire
   * chaque nom retouché (Hugo, 2026-09-19). Le diff d'identité garde son
   * `categoryId` — les lecteurs d'avant le lisent là.
   */
  private async journalize(
    productId: string,
    changes: FieldChanges,
    fromCategoryId: string,
    toCategoryId: string,
  ): Promise<WriteTicket> {
    if (Object.keys(changes).length === 0) {
      return this.journal.untraced("section enregistrée sans modification");
    }
    const ticket = await this.journal.trace({
      type: PIM_EVENTS.productIdentitySaved,
      subjectType: "product",
      subjectId: productId,
      payload: { changes },
    });
    if (fromCategoryId !== toCategoryId) {
      await this.journal.trace({
        type: PIM_EVENTS.productReclassified,
        subjectType: "product",
        subjectId: productId,
        payload: { from: fromCategoryId, to: toCategoryId },
      });
    }
    return ticket;
  }
}
