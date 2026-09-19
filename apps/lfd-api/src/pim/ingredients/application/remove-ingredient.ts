import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { IngredientNotFoundError } from "../domain/errors/ingredient-errors.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

export class RemoveIngredientCommand {
  constructor(readonly key: string) {}
}

/** Efface un ingrédient. La clé étrangère tient le « encore cité ». */
@CommandHandler(RemoveIngredientCommand)
export class RemoveIngredientHandler implements ICommandHandler<RemoveIngredientCommand, void> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveIngredientCommand): Promise<void> {
    const { key } = command;
    const ingredient = await this.ingredients.findByKey(key);
    if (ingredient === null) {
      throw new IngredientNotFoundError(key);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.ingredientDeleted,
        subjectType: "ingredient",
        subjectId: key,
        payload: { name: ingredient.snapshot().name },
      });
      await this.ingredients.remove(key, ticket);
    });
  }
}
