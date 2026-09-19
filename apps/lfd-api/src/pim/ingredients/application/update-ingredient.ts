import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { UpdateIngredientPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import type { IngredientSnapshot } from "../domain/entities/ingredient.entity.js";
import { IngredientNotFoundError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import { resolveAppellation } from "./ingredient-support.js";

export class UpdateIngredientCommand {
  constructor(
    readonly key: string,
    readonly payload: UpdateIngredientPayload,
  ) {}
}

/** Règle un ingrédient — tout sauf sa clé. */
@CommandHandler(UpdateIngredientCommand)
export class UpdateIngredientHandler implements ICommandHandler<UpdateIngredientCommand, void> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateIngredientCommand): Promise<void> {
    const { key, payload } = command;
    const ingredient = await this.ingredients.findByKey(key);
    if (ingredient === null) {
      throw new IngredientNotFoundError(key);
    }
    const appellationId = await resolveAppellation(this.appellations, payload.appellationCode);
    const before = traced(ingredient.snapshot());
    ingredient.revise({
      name: payload.name,
      description: payload.description,
      origin: payload.origin,
      appellationId,
    });
    const changes = changesBetween(before, traced(ingredient.snapshot()));

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.ingredientUpdated,
              subjectType: "ingredient",
              subjectId: key,
              payload: { changes },
            })
          : this.journal.untraced("record without modification");
      await this.ingredients.save(ingredient, ticket);
    });
  }
}

/** Ce que le journal retient. La clé n'y est pas : elle EST le sujet du fait. */
function traced(snapshot: IngredientSnapshot): Record<string, unknown> {
  const { name, description, origin, appellationId } = snapshot;
  return { name, description, origin, appellationId };
}
