import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  applyIngredientAllergenPropagationPayloadSchema,
  ingredientAllergenPropagationQuerySchema,
  type ApplyIngredientAllergenPropagationPayload,
  type IngredientAllergenPropagationQuery,
  type IngredientAllergenPropagationView,
  type ProductIngredientAllergensView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody, ZodQuery } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ApplyIngredientAllergenPropagationCommand } from "../regulatory/apply-ingredient-allergen-propagation.js";
import { PreviewIngredientAllergenPropagationQuery } from "../regulatory/preview-ingredient-allergen-propagation.js";
import { ReadProductIngredientAllergensQuery } from "../regulatory/read-product-ingredient-allergens.js";

/**
 * **Ce que les allergènes des ingrédients font aux fiches** — l'aperçu et
 * l'application de la propagation, et la lecture dérivée d'une fiche.
 *
 * Ces trois routes sont des questions du catalogue (les déclarations et leur
 * jugement lui appartiennent) ; elles gardent leurs URL sous `ingredients/…` et
 * `products/:id/…`, à côté de ce qu'elles prolongent, mais ne vivent plus dans
 * le contrôleur du référentiel d'ingrédients, qui n'a pas le droit d'importer
 * le catalogue.
 */
@AdminSurface("pim_catalog")
@Controller()
export class ProductIngredientAllergensController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **L'aperçu** de la propagation des allergènes de cette matière à ses
   * fiches — lecture seule. `added` / `removed` : les codes changés au dernier
   * enregistrement, séparés par des virgules. Calculé par le catalogue, servi
   * ici à côté de l'écriture qu'il prolonge.
   */
  @Get("ingredients/:key/allergen-propagation")
  previewAllergenPropagation(
    @Param("key") key: string,
    @Query(new ZodQuery(ingredientAllergenPropagationQuerySchema))
    query: IngredientAllergenPropagationQuery,
  ): Promise<IngredientAllergenPropagationView> {
    return this.queries.execute<
      PreviewIngredientAllergenPropagationQuery,
      IngredientAllergenPropagationView
    >(new PreviewIngredientAllergenPropagationQuery(key, query.added, query.removed));
  }

  /**
   * **L'application** — recalcule l'aperçu et n'écrit que ce qu'il propose
   * encore. Rend l'aperçu RELU : ce qui reste (cases décochées, fiches non
   * renseignées) est ce que l'écran a encore à montrer.
   */
  @Post("ingredients/:key/allergen-propagation")
  @HttpCode(200)
  @Idempotent(
    "n'écrit que les fiches dont la déclaration diffère de la propagée : rejouée, aucune ne diffère et le handler sort sans écrire",
  )
  async applyAllergenPropagation(
    @Param("key") key: string,
    @Body(new ZodBody(applyIngredientAllergenPropagationPayloadSchema))
    body: ApplyIngredientAllergenPropagationPayload,
  ): Promise<IngredientAllergenPropagationView> {
    await this.commands.execute<ApplyIngredientAllergenPropagationCommand, void>(
      new ApplyIngredientAllergenPropagationCommand(
        key,
        body.added,
        body.removed,
        body.removalsKept ?? [],
      ),
    );
    return this.queries.execute<
      PreviewIngredientAllergenPropagationQuery,
      IngredientAllergenPropagationView
    >(new PreviewIngredientAllergenPropagationQuery(key, body.added, body.removed));
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
