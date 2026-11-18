import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { IngredientNotFoundError } from "../domain/errors/ingredient-errors.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

export class RestoreIngredientCommand {
  constructor(readonly key: string) {}
}

/**
 * Remet un ingrédient archivé au référentiel : il se propose de nouveau à la
 * saisie. Rejoué sur un ingrédient en service : ni écriture, ni fait.
 *
 * Chargé dans la transaction, et seul `archived_at` est écrit : une mise à
 * jour concurrente n'est pas effacée.
 */
@CommandHandler(RestoreIngredientCommand)
export class RestoreIngredientHandler implements ICommandHandler<RestoreIngredientCommand, void> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RestoreIngredientCommand): Promise<void> {
    const { key } = command;
    await this.uow.run(async () => {
      const found = await this.ingredients.findByKey(key);
      if (found === null) {
        throw new IngredientNotFoundError(key);
      }
      if (!found.restore()) {
        return;
      }
      const { name } = found.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.ingredientRestored,
        subjectType: "ingredient",
        subjectId: key,
        payload: { subjectLabel: name.fr, name },
      });
      await this.ingredients.saveArchival(found, ticket);
    });
  }
}
