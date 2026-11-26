import { favoriteSkuSchema, type MyFavoritesView } from "@lfd/contracts";
import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddShopFavoriteCommand } from "../application/commands/add-shop-favorite.command.js";
import { RemoveShopFavoriteCommand } from "../application/commands/remove-shop-favorite.command.js";
import { GetMyFavoritesQuery } from "../application/queries/get-my-favorites.query.js";

/**
 * **Mes favoris** — ceux de l'espace courant
 * (`documentation/commandes/boutique/les-favoris.md`).
 *
 * L'espace se prend DU PRINCIPAL (`@ActingCompany()`, sinon la personne),
 * jamais de l'adresse : il n'y a pas d'identifiant d'espace à deviner. Le SKU
 * n'est validé qu'en forme — le commerce ne lit pas le référentiel pour une
 * préférence.
 */
@Controller("me/favorites")
export class MyFavoritesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  read(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
  ): Promise<MyFavoritesView> {
    return this.queries.execute<GetMyFavoritesQuery, MyFavoritesView>(
      new GetMyFavoritesQuery(user.userId, companyId),
    );
  }

  @Put(":sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "par l'état visé : reposer un favori déjà posé ne crée rien (clé primaire titulaire + SKU, insertion qui saute un doublon) et ne change pas sa date",
  )
  async add(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Param("sku", new ZodParam(favoriteSkuSchema, "sku")) sku: string,
  ): Promise<void> {
    await this.commands.execute<AddShopFavoriteCommand, void>(
      new AddShopFavoriteCommand(user.userId, companyId, sku),
    );
  }

  @Delete(":sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "par l'état visé : retirer un favori absent ne change rien, la suppression est bornée au titulaire et au SKU",
  )
  async remove(
    @CurrentUser() user: Principal,
    @ActingCompany() companyId: string | null,
    @Param("sku", new ZodParam(favoriteSkuSchema, "sku")) sku: string,
  ): Promise<void> {
    await this.commands.execute<RemoveShopFavoriteCommand, void>(
      new RemoveShopFavoriteCommand(user.userId, companyId, sku),
    );
  }
}
