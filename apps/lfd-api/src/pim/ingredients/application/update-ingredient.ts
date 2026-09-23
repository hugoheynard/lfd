import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { UpdateIngredientPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween, type FieldChanges } from "../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import type { IngredientSnapshot } from "../domain/entities/ingredient.entity.js";
import { IngredientNotFoundError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import { namedAppellation, resolveAppellation } from "./ingredient-support.js";

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
              payload: {
                subjectLabel: ingredient.snapshot().name.fr,
                changes: await this.namedChanges(changes),
              },
            })
          : this.journal.untraced("record without modification");
      await this.ingredients.save(ingredient, ticket);
    });
  }

  /**
   * Le diff, l'appellation NOMMÉE sous la même clé qu'à la création
   * (`appellation`) — elle y était un code, ici un identifiant, et un lecteur
   * devait connaître les deux.
   */
  private async namedChanges(changes: FieldChanges): Promise<FieldChanges> {
    const moved = changes["appellationId"];
    if (moved === undefined) {
      return changes;
    }
    const appellation = {
      from: await namedAppellation(this.appellations, idOrNull(moved.from)),
      to: await namedAppellation(this.appellations, idOrNull(moved.to)),
    };
    return Object.fromEntries(
      Object.entries(changes).map(([key, change]) =>
        key === "appellationId" ? ["appellation", appellation] : [key, change],
      ),
    );
  }
}

function idOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Ce que le journal compare. La clé n'y est pas : elle EST le sujet du fait.
 * L'appellation s'y compare par identifiant, puis se nomme pour la charge.
 */
function traced(snapshot: IngredientSnapshot): Record<string, unknown> {
  const { name, description, origin, appellationId } = snapshot;
  return { name, description, origin, appellationId };
}
