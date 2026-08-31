import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateIngredientPayload, UpdateIngredientPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { changesBetween } from "../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import {
  IngredientAggregate,
  type IngredientSnapshot,
} from "../domain/entities/ingredient.entity.js";
import {
  AppellationNotFoundError,
  IngredientKeyTakenError,
  IngredientNotFoundError,
} from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

export class CreateIngredientCommand {
  constructor(readonly payload: CreateIngredientPayload) {}
}

export class UpdateIngredientCommand {
  constructor(
    readonly key: string,
    readonly payload: UpdateIngredientPayload,
  ) {}
}

export class RemoveIngredientCommand {
  constructor(readonly key: string) {}
}

/**
 * Traduit un CODE d'appellation en identifiant technique.
 *
 * Le fil parle en codes — c'est l'identité lisible, celle que l'écran affiche
 * et que l'humain cite — et la base joint par identifiant. La traduction vit
 * ici, une fois, plutôt que dans chaque appelant.
 *
 * `null` reçu vaut « retirer le signe » ; `undefined` vaut « ne touche pas ».
 * Les confondre rendrait impossible d'annuler une appellation posée par erreur.
 */
async function resolveAppellation(
  appellations: AppellationRepository,
  code: string | null | undefined,
): Promise<string | null | undefined> {
  if (code === undefined) {
    return undefined;
  }
  if (code === null) {
    return null;
  }
  const id = await appellations.idOfCode(code);
  if (id === null) {
    throw new AppellationNotFoundError(code);
  }
  return id;
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
        payload: {
          key: created.key,
          name: created.name,
          origin: created.origin,
          appellation: payload.appellationCode ?? null,
        },
      });
      await this.ingredients.add(ingredient, ticket);
    });
    return created.key;
  }
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

/** Ce que le journal retient. La clé n'y est pas : elle EST le sujet du fait. */
function traced(snapshot: IngredientSnapshot): Record<string, unknown> {
  const { name, description, origin, appellationId } = snapshot;
  return { name, description, origin, appellationId };
}
