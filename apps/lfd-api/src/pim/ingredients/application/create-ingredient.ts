import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateIngredientPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { IngredientAggregate } from "../domain/entities/ingredient.entity.js";
import { IngredientKeyTakenError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";
import { namedAppellation, resolveAppellation } from "./ingredient-support.js";

export class CreateIngredientCommand {
  constructor(readonly payload: CreateIngredientPayload) {}
}

/** Déclare un ingrédient. */
@CommandHandler(CreateIngredientCommand)
export class CreateIngredientHandler implements ICommandHandler<CreateIngredientCommand, string> {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateIngredientCommand): Promise<string> {
    const { payload } = command;
    const appellationId =
      (await resolveAppellation(this.appellations, payload.appellationCode)) ?? null;
    const ingredient = IngredientAggregate.declare({
      id: this.ids.next(),
      key: payload.key,
      name: payload.name,
      description: payload.description ?? null,
      origin: payload.origin,
      appellationId,
    });
    const created = ingredient.snapshot();
    // L'agrégat nettoie la clé : on vérifie donc la version nettoyée.
    if ((await this.ingredients.findByKey(created.key)) !== null) {
      throw new IngredientKeyTakenError(created.key);
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.ingredientCreated,
        subjectType: "ingredient",
        subjectId: created.key,
        // L'appellation NOMMÉE, sous la même clé qu'à la modification (lot B
        // du plan des phrases : c'était un code ici, un identifiant là-bas).
        payload: {
          subjectLabel: created.name.fr,
          key: created.key,
          name: created.name,
          origin: created.origin,
          appellation: await namedAppellation(this.appellations, created.appellationId),
        },
      });
      await this.ingredients.add(ingredient, ticket);
    });
    return created.key;
  }
}
