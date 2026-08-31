import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

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
 * Le fait porte l'AVANT et l'APRÈS en clés lisibles plutôt qu'en identifiants :
 * six mois plus tard, « on a retiré le beurre AOP » doit se lire sans une
 * jointure sur un référentiel qui aura peut-être bougé.
 */
@CommandHandler(SetProductIngredientsCommand)
export class SetProductIngredientsHandler implements ICommandHandler<
  SetProductIngredientsCommand,
  void
> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductIngredientsCommand): Promise<void> {
    const { productId, keys } = command;
    const before = (await this.ingredients.ofProduct(productId)).map((row) => row.key);
    const unchanged = before.length === keys.length && before.every((key, at) => key === keys[at]);

    await this.uow.run(async () => {
      const ticket = unchanged
        ? this.journal.untraced("record without modification")
        : await this.journal.trace({
            type: PIM_EVENTS.productIngredientsSaved,
            subjectType: "product",
            subjectId: productId,
            payload: { changes: { ingredients: { from: before, to: [...keys] } } },
          });
      await this.ingredients.setOfProduct(productId, keys, ticket);
    });
  }
}
