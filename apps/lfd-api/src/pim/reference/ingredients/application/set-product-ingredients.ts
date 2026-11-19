import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type {
  CitableIngredient,
  NamedCitation,
  ProductComposition,
} from "../domain/entities/product-composition.entity.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import { ProductCompositionRepository } from "../domain/ports/product-composition.repository.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";

export class SetProductIngredientsCommand {
  constructor(
    readonly productId: string,
    readonly keys: readonly string[],
  ) {}
}

/**
 * Remplace ce qu'une fiche cite comme provenance.
 *
 * **Un seul fait pour la liste entière**, et non un par ingrédient ajouté ou
 * retiré : c'est un geste éditorial unique à l'écran — « voilà ce que je
 * revendique, dans cet ordre » — et N traces pour N lignes noieraient
 * l'historique de la fiche sous des mouvements que personne ne relit.
 *
 * Le fait porte l'AVANT et l'APRÈS en clés lisibles plutôt qu'en identifiants,
 * chacune avec le nom de l'ingrédient ce jour-là : six mois plus tard, « on a
 * retiré le beurre AOP » doit se lire sans une jointure sur un référentiel qui
 * aura peut-être bougé.
 */
@CommandHandler(SetProductIngredientsCommand)
export class SetProductIngredientsHandler implements ICommandHandler<
  SetProductIngredientsCommand,
  void
> {
  constructor(
    private readonly compositions: ProductCompositionRepository,
    private readonly ingredients: IngredientRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetProductIngredientsCommand): Promise<void> {
    const { productId, keys } = command;
    const composition = await this.compositions.load(productId);
    const unchanged = composition.cites(keys);
    const change = unchanged ? null : await this.replaced(composition, keys);

    await this.uow.run(async () => {
      const ticket =
        change === null
          ? this.journal.untraced("record without modification")
          : await this.journal.trace({
              type: PIM_EVENTS.productIngredientsSaved,
              subjectType: "product",
              subjectId: productId,
              // Chaque ingrédient NOMMÉ (D5 du plan des phrases du journal) : sa
              // clé, et son nom français de ce jour-là.
              payload: { changes: { ingredients: change } },
            });
      await this.compositions.save(composition, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }

  /**
   * Remplace la liste sur l'agrégat, qui juge chaque clé, et rend l'avant et
   * l'après nommés pour la trace.
   *
   * @throws {IngredientNotFoundError} une clé que le référentiel ignore.
   * @throws {IngredientArchivedError} un ingrédient archivé que la fiche ne
   *   citait pas encore.
   */
  private async replaced(
    composition: ProductComposition,
    keys: readonly string[],
  ): Promise<{ readonly from: readonly NamedCitation[]; readonly to: readonly NamedCitation[] }> {
    const [cited, all] = await Promise.all([
      this.ingredients.ofProduct(composition.productId),
      this.ingredients.list(),
    ]);
    const referential = new Map<string, CitableIngredient>(
      all.map((row) => [row.key, { name: row.name.fr, archived: row.archivedAt !== null }]),
    );
    const from = cited.map((row) => ({ id: row.key, name: row.name.fr }));
    return { from, to: composition.replace(keys, referential) };
  }
}
