import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createIngredientPayloadSchema,
  setIngredientAllergensPayloadSchema,
  setProductIngredientsPayloadSchema,
  updateIngredientPayloadSchema,
  type IngredientView,
  type CreateIngredientPayload,
  type SetIngredientAllergensPayload,
  type SetProductIngredientsPayload,
  type UpdateIngredientPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { CreateIngredientCommand } from "../application/create-ingredient.js";
import { RemoveIngredientCommand } from "../application/remove-ingredient.js";
import { UpdateIngredientCommand } from "../application/update-ingredient.js";
import { ListIngredientsQuery } from "../application/list-ingredients.js";
import { ReadProductIngredientsQuery } from "../application/read-product-ingredients.js";
import { SetIngredientAllergensCommand } from "../application/set-ingredient-allergens.js";
import { SetProductIngredientsCommand } from "../application/set-product-ingredients.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * Les **ingrédients** — la matière, ce qu'elle contient, et ce que chaque fiche
 * en cite.
 *
 * Les appellations ont leur propre porte ({@link AppellationController}) : deux
 * référentiels, deux raisons de changer.
 *
 * Le chemin de base reste vide parce que ce contrôleur en sert deux : la
 * matière (`ingredients/…`) et la composition d'une fiche
 * (`products/:id/…`). Ces routes-là appartiennent bien ici — la composition
 * n'existe que comme citation d'ingrédients, et la découper ferait un
 * contrôleur qui ne saurait rien de ce qu'il liste.
 *
 * ⚠️ Rien de ce qui se déclare ici n'est une mention obligatoire au sens du
 * règlement UE 1169/2011 : la liste réglementaire d'ingrédients appartient à la
 * déclinaison, avec ses allergènes. Cf.
 * `documentation/pim/ingredients-et-appellations.md`.
 */
@AdminSurface("pim_catalog")
@Controller()
export class IngredientController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("ingredients")
  listIngredients(): Promise<IngredientView[]> {
    return this.queries.execute<ListIngredientsQuery, IngredientView[]>(new ListIngredientsQuery());
  }

  @Post("ingredients")
  @Idempotent(
    "par unicité : la clé d'un ingrédient est unique ; rejouée, la création est refusée (409 IngredientKeyTakenError) avant toute écriture",
  )
  async createIngredient(
    @Body(new ZodBody(createIngredientPayloadSchema)) body: CreateIngredientPayload,
  ) {
    const key = await this.commands.execute<CreateIngredientCommand, string>(
      new CreateIngredientCommand(body),
    );
    return { key };
  }

  @Put("ingredients/:key")
  @Idempotent("pose les valeurs de l'ingrédient : rejouée, rien ne change et le journal se tait")
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
  @Idempotent(
    "retire l'ingrédient : rejoué, il n'existe plus et la demande est refusée (404) sans rien écrire",
  )
  async removeIngredient(@Param("key") key: string) {
    await this.commands.execute<RemoveIngredientCommand, void>(new RemoveIngredientCommand(key));
    return { key };
  }

  /**
   * Ce que cette matière **contient** — la liste entière, en codes.
   *
   * Périmètre `world` (D4) : l'écran propose le référentiel complet, codes hors
   * obligation UE compris. Un ingrédient énonce un fait ; le filtre européen
   * appartient à la déclaration de la déclinaison.
   */
  @Put("ingredients/:key/allergens")
  @Idempotent("pose les allergènes de l'ingrédient : rejouée, rien ne change et le journal se tait")
  async setIngredientAllergens(
    @Param("key") key: string,
    @Body(new ZodBody(setIngredientAllergensPayloadSchema)) body: SetIngredientAllergensPayload,
  ) {
    await this.commands.execute<SetIngredientAllergensCommand, void>(
      new SetIngredientAllergensCommand(key, body.codes, body.none ?? false),
    );
    return { key };
  }

  /** Ce que CETTE fiche cite, dans son ordre d'affichage. */
  @Get("products/:id/ingredients")
  ofProduct(@Param("id") id: string): Promise<IngredientView[]> {
    return this.queries.execute<ReadProductIngredientsQuery, IngredientView[]>(
      new ReadProductIngredientsQuery(id),
    );
  }

  @Put("products/:id/ingredients")
  @Idempotent(
    "pose la liste d'ingrédients de la fiche : rejouée, rien ne change et le journal se tait",
  )
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
