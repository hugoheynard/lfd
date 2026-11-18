import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { IngredientNotFoundError } from "../domain/errors/ingredient-errors.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

export class ArchiveIngredientCommand {
  constructor(readonly key: string) {}
}

/**
 * Archive un ingrédient : il ne se propose plus à la saisie d'une composition.
 * Toujours permis — une fiche qui le cite le garde (`IngredientAggregate.archive`).
 * On ne supprime plus un ingrédient (décision de Hugo du 2026-11-18). Rejoué
 * sur un ingrédient archivé : ni écriture, ni fait.
 *
 * Chargé dans la transaction, et seul `archived_at` est écrit : une mise à
 * jour concurrente n'est pas effacée.
 */
@CommandHandler(ArchiveIngredientCommand)
export class ArchiveIngredientHandler implements ICommandHandler<ArchiveIngredientCommand, void> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveIngredientCommand): Promise<void> {
    const { key } = command;
    await this.uow.run(async () => {
      const found = await this.ingredients.findByKey(key);
      if (found === null) {
        throw new IngredientNotFoundError(key);
      }
      if (!found.archive(this.clock.now())) {
        return;
      }
      const { name } = found.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.ingredientArchived,
        subjectType: "ingredient",
        subjectId: key,
        payload: { subjectLabel: name.fr, name },
      });
      await this.ingredients.saveArchival(found, ticket);
    });
  }
}
