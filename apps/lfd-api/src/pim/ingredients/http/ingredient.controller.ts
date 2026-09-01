import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createAppellationPayloadSchema,
  createIngredientPayloadSchema,
  setIngredientAllergensPayloadSchema,
  setProductIngredientsPayloadSchema,
  updateAppellationPayloadSchema,
  updateIngredientPayloadSchema,
  type AppellationView,
  type IngredientView,
  type CreateAppellationPayload,
  type CreateIngredientPayload,
  type ProductIngredientAllergensView,
  type SetIngredientAllergensPayload,
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
import { ListAppellationsQuery } from "../application/list-appellations.js";
import { ListIngredientsQuery } from "../application/list-ingredients.js";
import { ReadProductIngredientAllergensQuery } from "../application/read-product-ingredient-allergens.js";
import { ReadProductIngredientsQuery } from "../application/read-product-ingredients.js";
import { SetIngredientAllergensCommand } from "../application/set-ingredient-allergens.js";
import { SetProductIngredientsCommand } from "../application/set-product-ingredients.js";

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
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("appellations")
  listAppellations(): Promise<AppellationView[]> {
    return this.queries.execute<ListAppellationsQuery, AppellationView[]>(
      new ListAppellationsQuery(),
    );
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
  listIngredients(): Promise<IngredientView[]> {
    return this.queries.execute<ListIngredientsQuery, IngredientView[]>(new ListIngredientsQuery());
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

  /**
   * Ce que cette matière **contient** — la liste entière, en codes.
   *
   * Périmètre `world` (D4) : l'écran propose le référentiel complet, codes hors
   * obligation UE compris. Un ingrédient énonce un fait ; le filtre européen
   * appartient à la déclaration de la déclinaison.
   */
  @Put("ingredients/:key/allergens")
  async setIngredientAllergens(
    @Param("key") key: string,
    @Body(new ZodBody(setIngredientAllergensPayloadSchema)) body: SetIngredientAllergensPayload,
  ) {
    await this.commands.execute<SetIngredientAllergensCommand, void>(
      new SetIngredientAllergensCommand(key, body.codes),
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
  async setOfProduct(
    @Param("id") id: string,
    @Body(new ZodBody(setProductIngredientsPayloadSchema)) body: SetProductIngredientsPayload,
  ) {
    await this.commands.execute<SetProductIngredientsCommand, void>(
      new SetProductIngredientsCommand(id, body.keys),
    );
    return { id };
  }

  /**
   * Ce que la composition de cette fiche **mentionne** comme allergènes, et
   * l'écart avec ce que chaque déclinaison déclare (D5).
   *
   * Sous `products/:id/…`, à côté de ce que la fiche cite, parce que c'en est la
   * lecture dérivée — et nommée `ingredient-allergens` plutôt que `allergens` :
   * ce ne sont pas les allergènes du produit, ce sont ceux de ses ingrédients
   * cités. La nuance est toute la décision D5, et une URL qui la perdrait
   * inviterait à lire cette réponse comme une fiche réglementaire.
   *
   * ⚠️ Une proposition vide ne dit RIEN : la liste d'ingrédients est éditoriale.
   */
  @Get("products/:id/ingredient-allergens")
  citedAllergens(@Param("id") id: string): Promise<ProductIngredientAllergensView> {
    return this.queries.execute<
      ReadProductIngredientAllergensQuery,
      ProductIngredientAllergensView
    >(new ReadProductIngredientAllergensQuery(id));
  }
}
