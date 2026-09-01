import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createAllergenCategoryPayloadSchema,
  createAllergenEntryPayloadSchema,
  moveAllergenCategoryPayloadSchema,
  renameAllergenCategoryPayloadSchema,
  reviseAllergenEntryPayloadSchema,
  type AllergenCategoryAdminView,
  type CreateAllergenCategoryPayload,
  type CreateAllergenEntryPayload,
  type MoveAllergenCategoryPayload,
  type RenameAllergenCategoryPayload,
  type ReviseAllergenEntryPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveAllergenCategoryCommand } from "../application/archive-allergen-category.js";
import { ArchiveAllergenEntryCommand } from "../application/archive-allergen-entry.js";
import { CreateAllergenCategoryCommand } from "../application/create-allergen-category.js";
import { CreateAllergenEntryCommand } from "../application/create-allergen-entry.js";
import { ListAllergenCatalogueQuery } from "../application/list-allergen-catalogue.js";
import { MoveAllergenCategoryCommand } from "../application/move-allergen-category.js";
import { RenameAllergenCategoryCommand } from "../application/rename-allergen-category.js";
import { RestoreAllergenCategoryCommand } from "../application/restore-allergen-category.js";
import { RestoreAllergenEntryCommand } from "../application/restore-allergen-entry.js";
import { ReviseAllergenEntryCommand } from "../application/revise-allergen-entry.js";

/**
 * **L'administration du référentiel d'allergènes** — l'écran staff, pas la
 * fiche produit.
 *
 * Distinct de `GET /pim/reference/allergens`, qui sert la SAISIE : celui-là
 * filtre le périmètre et l'archivage (D2, D2 bis), celui-ci montre tout, parce
 * que c'est d'ici qu'on restaure.
 *
 * Rien n'y touche l'officiel. Les 30 codes GS1 et les 15 catégories semées sont
 * inaltérables : l'agrégat refuse, et un trigger tient la base — ces routes
 * n'ouvrent donc que le référentiel **maison**, `position` exceptée, seul champ
 * qu'une catégorie du droit laisse régler.
 *
 * Surface staff murée par `@AdminSurface("pim_catalog")` : le référentiel décide de
 * ce qui s'imprime sur une étiquette.
 */
@AdminSurface("pim_catalog")
@Controller("allergens")
export class AllergenController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le référentiel entier — catégories, entrées, archivage compris. */
  @Get()
  list(): Promise<AllergenCategoryAdminView[]> {
    return this.queries.execute<ListAllergenCatalogueQuery, AllergenCategoryAdminView[]>(
      new ListAllergenCatalogueQuery(),
    );
  }

  @Post("categories")
  async createCategory(
    @Body(new ZodBody(createAllergenCategoryPayloadSchema)) body: CreateAllergenCategoryPayload,
  ) {
    const id = await this.commands.execute<CreateAllergenCategoryCommand, string>(
      new CreateAllergenCategoryCommand(body),
    );
    return { id };
  }

  @Put("categories/:id/name")
  async renameCategory(
    @Param("id") id: string,
    @Body(new ZodBody(renameAllergenCategoryPayloadSchema)) body: RenameAllergenCategoryPayload,
  ) {
    await this.commands.execute<RenameAllergenCategoryCommand, void>(
      new RenameAllergenCategoryCommand(id, body.name),
    );
    return { id };
  }

  @Put("categories/:id/position")
  async moveCategory(
    @Param("id") id: string,
    @Body(new ZodBody(moveAllergenCategoryPayloadSchema)) body: MoveAllergenCategoryPayload,
  ) {
    await this.commands.execute<MoveAllergenCategoryCommand, void>(
      new MoveAllergenCategoryCommand(id, body.position),
    );
    return { id };
  }

  @Put("categories/:id/archive")
  async archiveCategory(@Param("id") id: string) {
    await this.commands.execute<ArchiveAllergenCategoryCommand, void>(
      new ArchiveAllergenCategoryCommand(id),
    );
    return { id };
  }

  @Put("categories/:id/restore")
  async restoreCategory(@Param("id") id: string) {
    await this.commands.execute<RestoreAllergenCategoryCommand, void>(
      new RestoreAllergenCategoryCommand(id),
    );
    return { id };
  }

  @Post("entries")
  async createEntry(
    @Body(new ZodBody(createAllergenEntryPayloadSchema)) body: CreateAllergenEntryPayload,
  ) {
    const id = await this.commands.execute<CreateAllergenEntryCommand, string>(
      new CreateAllergenEntryCommand(body),
    );
    return { id };
  }

  @Put("entries/:id")
  async reviseEntry(
    @Param("id") id: string,
    @Body(new ZodBody(reviseAllergenEntryPayloadSchema)) body: ReviseAllergenEntryPayload,
  ) {
    await this.commands.execute<ReviseAllergenEntryCommand, void>(
      new ReviseAllergenEntryCommand(id, body),
    );
    return { id };
  }

  @Put("entries/:id/archive")
  async archiveEntry(@Param("id") id: string) {
    await this.commands.execute<ArchiveAllergenEntryCommand, void>(
      new ArchiveAllergenEntryCommand(id),
    );
    return { id };
  }

  @Put("entries/:id/restore")
  async restoreEntry(@Param("id") id: string) {
    await this.commands.execute<RestoreAllergenEntryCommand, void>(
      new RestoreAllergenEntryCommand(id),
    );
    return { id };
  }
}
