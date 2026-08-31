import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  createAppellationPayloadSchema,
  createIngredientPayloadSchema,
  setProductIngredientsPayloadSchema,
  updateAppellationPayloadSchema,
  updateIngredientPayloadSchema,
  type AppellationView,
  type CreateAppellationPayload,
  type CreateIngredientPayload,
  type IngredientView,
  type SetProductIngredientsPayload,
  type UpdateAppellationPayload,
  type UpdateIngredientPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CreateAppellationCommand,
  RemoveAppellationCommand,
  UpdateAppellationCommand,
} from "../application/appellation-handlers.js";
import {
  CreateIngredientCommand,
  RemoveIngredientCommand,
  UpdateIngredientCommand,
} from "../application/ingredient-handlers.js";
import { SetProductIngredientsCommand } from "../application/set-product-ingredients.js";
import type { AppellationRecord } from "../domain/ports/appellation.repository.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";
import type { IngredientRecord } from "../domain/ports/ingredient.repository.js";
import { IngredientRepository } from "../domain/ports/ingredient.repository.js";

/** L'identifiant technique ne sort pas : le fil parle en codes et en clés. */
function toAppellationView(record: AppellationRecord): AppellationView {
  return {
    code: record.code,
    label: record.label,
    scheme: record.scheme,
    active: record.active,
    usedBy: record.usedBy,
  };
}

function toIngredientView(record: IngredientRecord): IngredientView {
  return {
    key: record.key,
    name: record.name,
    description: record.description,
    origin: record.origin,
    appellation:
      record.appellation === null
        ? null
        : {
            code: record.appellation.code,
            label: record.appellation.label,
            scheme: record.appellation.scheme,
            active: record.appellation.active,
            // Le compte n'a pas de sens sur une appellation lue À TRAVERS un
            // ingrédient : ce serait le compte de l'appellation, pas celui de
            // ce rattachement, et l'écran s'en servirait à tort.
            usedBy: 0,
          },
    usedBy: record.usedBy,
  };
}

/**
 * Les **provenances** — ingrédients et appellations, en lecture et en écriture.
 *
 * Un seul contrôleur pour deux référentiels, parce que ce sont deux moitiés
 * d'une même chose : une appellation n'existe ici que pour être portée par un
 * ingrédient, et aucun écran n'ouvre l'une sans l'autre. Les séparer ferait
 * deux portes pour une seule pièce.
 *
 * ⚠️ Rien de ce qui se déclare ici n'est une mention obligatoire au sens du
 * règlement UE 1169/2011 : la liste réglementaire d'ingrédients appartient à la
 * déclinaison, avec ses allergènes. Cf.
 * `documentation/pim/ingredients-et-appellations.md`.
 */
@AdminSurface("catalog")
@Controller()
export class IngredientController {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly appellations: AppellationRepository,
    private readonly commands: CommandBus,
  ) {}

  @Get("appellations")
  async listAppellations(): Promise<AppellationView[]> {
    const records = await this.appellations.list();
    return records.map(toAppellationView);
  }

  @Post("appellations")
  async createAppellation(
    @Body(new ZodBody(createAppellationPayloadSchema)) body: CreateAppellationPayload,
  ) {
    const code = await this.commands.execute<CreateAppellationCommand, string>(
      new CreateAppellationCommand(body),
    );
    return { code };
  }

  @Put("appellations/:code")
  async updateAppellation(
    @Param("code") code: string,
    @Body(new ZodBody(updateAppellationPayloadSchema)) body: UpdateAppellationPayload,
  ) {
    await this.commands.execute<UpdateAppellationCommand, void>(
      new UpdateAppellationCommand(code, body),
    );
    return { code };
  }

  @Delete("appellations/:code")
  async removeAppellation(@Param("code") code: string) {
    await this.commands.execute<RemoveAppellationCommand, void>(new RemoveAppellationCommand(code));
    return { code };
  }

  @Get("ingredients")
  async listIngredients(): Promise<IngredientView[]> {
    const records = await this.ingredients.list();
    return records.map(toIngredientView);
  }

  @Post("ingredients")
  async createIngredient(
    @Body(new ZodBody(createIngredientPayloadSchema)) body: CreateIngredientPayload,
  ) {
    const key = await this.commands.execute<CreateIngredientCommand, string>(
      new CreateIngredientCommand(body),
    );
    return { key };
  }

  @Put("ingredients/:key")
  async updateIngredient(
    @Param("key") key: string,
    @Body(new ZodBody(updateIngredientPayloadSchema)) body: UpdateIngredientPayload,
  ) {
    await this.commands.execute<UpdateIngredientCommand, void>(
      new UpdateIngredientCommand(key, body),
    );
    return { key };
  }

  @Delete("ingredients/:key")
  async removeIngredient(@Param("key") key: string) {
    await this.commands.execute<RemoveIngredientCommand, void>(new RemoveIngredientCommand(key));
    return { key };
  }

  /** Ce que CETTE fiche cite, dans son ordre d'affichage. */
  @Get("products/:id/ingredients")
  async ofProduct(@Param("id") id: string): Promise<IngredientView[]> {
    const records = await this.ingredients.ofProduct(id);
    return records.map(toIngredientView);
  }

  @Put("products/:id/ingredients")
  async setOfProduct(
    @Param("id") id: string,
    @Body(new ZodBody(setProductIngredientsPayloadSchema)) body: SetProductIngredientsPayload,
  ) {
    await this.commands.execute<SetProductIngredientsCommand, void>(
      new SetProductIngredientsCommand(id, body.keys),
    );
    return { id };
  }
}
