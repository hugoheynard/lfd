import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createCategoryPayloadSchema,
  moveCategoryPayloadSchema,
  renameCategoryPayloadSchema,
  reorderCategoriesPayloadSchema,
  setCategoryVatPayloadSchema,
  setCategoryAudiencePayloadSchema,
  type SetCategoryAudiencePayload,
  categoryEditorialPayloadSchema,
  setCategoryMediaPayloadSchema,
  type CategoryDetailView,
  type CategoryEditorialPayload,
  type CategoryView,
  type CreateCategoryPayload,
  type MoveCategoryPayload,
  type RenameCategoryPayload,
  type ReorderCategoriesPayload,
  type SetCategoryMediaPayload,
  type SetCategoryVatPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveCategoryCommand } from "../application/archive-category.js";
import { CreateCategoryCommand } from "../application/create-category.js";
import { GetCategoryDetailQuery, type CategoryDetail } from "../application/get-category-detail.js";
import { ListCategoriesQuery, type CategoryListItem } from "../application/list-categories.js";
import { SetCategoryMediaCommand } from "../application/set-category-media.js";
import { UpdateCategoryEditorialCommand } from "../application/update-category-editorial.js";
import { MoveCategoryCommand } from "../application/move-category.js";
import { ReorderCategoriesCommand } from "../application/reorder-categories.js";
import { RenameCategoryCommand } from "../application/rename-category.js";
import { SetCategoryVatCommand } from "../application/set-category-vat.js";
import { SetCategoryAudienceCommand } from "../application/set-category-audience.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * Familles du catalogue — dispatchées sur les bus CQRS.
 *
 * Surface staff murée par `@AdminSurface("pim_catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/categories")
export class CategoryController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listCategories(): Promise<CategoryView[]> {
    return this.queries.execute<ListCategoriesQuery, CategoryListItem[]>(new ListCategoriesQuery());
  }

  /**
   * Une famille ENRICHIE — pour sa page. La liste ne porte ni textes ni visuels :
   * les y mettre coûterait une jointure par ligne pour des colonnes qu'aucune
   * ligne n'affiche.
   */
  @Get(":id")
  getCategory(@Param("id") id: string): Promise<CategoryDetailView> {
    return this.queries.execute<GetCategoryDetailQuery, CategoryDetail>(
      new GetCategoryDetailQuery(id),
    );
  }

  @Post()
  @Idempotent(
    "par unicité : le slug d'une famille est unique ; rejouée, la création est refusée (409) avant toute écriture",
  )
  async createCategory(
    @Body(new ZodBody(createCategoryPayloadSchema)) body: CreateCategoryPayload,
  ) {
    const id = await this.commands.execute<CreateCategoryCommand, string>(
      new CreateCategoryCommand(body),
    );
    return { id };
  }

  @Put(":id/name")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la famille telle quelle, et le journal se tait quand rien n'a changé",
  )
  async renameCategory(
    @Param("id") id: string,
    @Body(new ZodBody(renameCategoryPayloadSchema)) body: RenameCategoryPayload,
  ) {
    await this.commands.execute<RenameCategoryCommand, void>(new RenameCategoryCommand(id, body));
    return { id };
  }

  @Put(":id/vat")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la famille telle quelle, et le journal se tait quand rien n'a changé",
  )
  async setVat(
    @Param("id") id: string,
    @Body(new ZodBody(setCategoryVatPayloadSchema)) body: SetCategoryVatPayload,
  ) {
    await this.commands.execute<SetCategoryVatCommand, void>(
      new SetCategoryVatCommand(id, body.vatByContext),
    );
    return { id };
  }

  /** À qui la famille vend — ses fiches en héritent, sauf dérogation. */
  @Put(":id/audience")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la famille telle quelle, et le journal se tait quand rien n'a changé",
  )
  async setAudience(
    @Param("id") id: string,
    @Body(new ZodBody(setCategoryAudiencePayloadSchema)) body: SetCategoryAudiencePayload,
  ) {
    await this.commands.execute<SetCategoryAudienceCommand, void>(
      new SetCategoryAudienceCommand(id, body.audience),
    );
    return { id };
  }

  /**
   * Réordonner un NIVEAU, pas une famille — d'où la route sans `:id`, et le
   * `parentId` dans le corps (`null` = la racine, qui n'a pas d'identifiant à
   * mettre dans une URL). Placée avant les routes `:id/…` pour qu'un futur
   * `PUT /:id` ne puisse pas l'avaler : Nest résout dans l'ordre déclaré.
   */
  @Put("reorder")
  @Idempotent(
    "pose l'ordre complet de la fratrie : rejouée dans le même ordre, rien ne change, ni fait ni réémission",
  )
  async reorderCategories(
    @Body(new ZodBody(reorderCategoriesPayloadSchema)) body: ReorderCategoriesPayload,
  ) {
    await this.commands.execute<ReorderCategoriesCommand, void>(
      new ReorderCategoriesCommand(body.parentId, body.orderedIds),
    );
    return { parentId: body.parentId };
  }

  @Put(":id/parent")
  @Idempotent(
    "pose le parent : rejouée sous le même parent, la famille garde son rang, ni fait ni réémission",
  )
  async moveCategory(
    @Param("id") id: string,
    @Body(new ZodBody(moveCategoryPayloadSchema)) body: MoveCategoryPayload,
  ) {
    await this.commands.execute<MoveCategoryCommand, void>(
      new MoveCategoryCommand(id, body.parentId),
    );
    return { id };
  }

  @Put(":id/archive")
  @Idempotent(
    "pose l'état archivé : rejouée sur une famille archivée, rien ne change, ni fait ni réémission",
  )
  async archiveCategory(@Param("id") id: string) {
    await this.commands.execute<ArchiveCategoryCommand, void>(new ArchiveCategoryCommand(id));
    return { id };
  }

  /** Section **Communication** : les textes, dans leurs trois langues. */
  @Put(":id/editorial")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la famille telle quelle, et le journal se tait quand rien n'a changé",
  )
  async editCategoryEditorial(
    @Param("id") id: string,
    @Body(new ZodBody(categoryEditorialPayloadSchema)) body: CategoryEditorialPayload,
  ) {
    await this.commands.execute<UpdateCategoryEditorialCommand, void>(
      new UpdateCategoryEditorialCommand(id, body),
    );
    return { id };
  }

  /**
   * Section **Visuels** : la liste entière, dans son ordre.
   *
   * Un `PUT` de remplacement comme les autres sections — l'écran envoie ce
   * qu'il affiche. Réordonner et retirer sont le même geste pour qui l'exécute.
   */
  @Put(":id/media")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse la famille telle quelle, et le journal se tait quand rien n'a changé",
  )
  async setCategoryMedia(
    @Param("id") id: string,
    @Body(new ZodBody(setCategoryMediaPayloadSchema)) body: SetCategoryMediaPayload,
  ) {
    await this.commands.execute<SetCategoryMediaCommand, void>(
      new SetCategoryMediaCommand(id, body.media),
    );
    return { id };
  }
}
