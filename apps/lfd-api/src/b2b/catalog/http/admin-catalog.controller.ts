import {
  setB2bPricePayloadSchema,
  setCatalogFeaturedPayloadSchema,
  setCatalogVisibilityPayloadSchema,
  type CatalogAdminItemView,
  type SetB2bPricePayload,
  type SetCatalogFeaturedPayload,
  type SetCatalogVisibilityPayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AlignOnPimPriceCommand,
  SetB2bPriceCommand,
  SetCatalogFeaturedCommand,
  SetCatalogVisibilityCommand,
} from "../application/commands/catalog-decision.commands.js";
import { CatalogAdminReader } from "../domain/ports/catalog-admin.reader.js";

/**
 * **Le paramétrage du catalogue** : ce que la plateforme décide par-dessus le
 * PIM — un prix, une visibilité, une mise en avant.
 *
 * Une route par geste, nommée comme le geste. Un `PATCH` unique acceptant un
 * patch partiel aurait été plus court et aurait tout perdu : le journal ne
 * dirait plus ce qui a été fait, et le serveur devrait deviner l'intention
 * depuis les champs présents.
 *
 * Retirer un prix B2B est un `DELETE` et pas un `PUT { priceCents: null }` : on
 * **supprime une décision**, on n'en pose pas une qui vaudrait « rien ».
 *
 * Surface staff murée par `@AdminSurface("catalog")` : le paramétrage du
 * catalogue est du réglage, et n'ouvrir une ressource `catalog` qu'ici créerait
 * un droit que rien d'autre n'exerce.
 */
@Controller("admin/catalog")
@AdminSurface("catalog")
export class AdminCatalogController {
  constructor(
    private readonly reader: CatalogAdminReader,
    private readonly commands: CommandBus,
  ) {}

  /** Tout le catalogue, **masqués compris** : le back-office doit les voir pour les rouvrir. */
  @Get()
  list(): Promise<CatalogAdminItemView[]> {
    return this.reader.list();
  }

  @Put(":sku/price")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPrice(
    @Param("sku") sku: string,
    @Body(new ZodBody(setB2bPricePayloadSchema)) payload: SetB2bPricePayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SetB2bPriceCommand, void>(
      new SetB2bPriceCommand(sku, payload.priceCents, staffSub),
    );
  }

  /** Revenir au tarif du PIM — et le suivre à nouveau. */
  @Delete(":sku/price")
  @HttpCode(HttpStatus.NO_CONTENT)
  async alignOnPim(@Param("sku") sku: string): Promise<void> {
    await this.commands.execute<AlignOnPimPriceCommand, void>(new AlignOnPimPriceCommand(sku));
  }

  @Put(":sku/visibility")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setVisibility(
    @Param("sku") sku: string,
    @Body(new ZodBody(setCatalogVisibilityPayloadSchema)) payload: SetCatalogVisibilityPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SetCatalogVisibilityCommand, void>(
      new SetCatalogVisibilityCommand(sku, payload.hidden, staffSub),
    );
  }

  @Put(":sku/featured")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setFeatured(
    @Param("sku") sku: string,
    @Body(new ZodBody(setCatalogFeaturedPayloadSchema)) payload: SetCatalogFeaturedPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SetCatalogFeaturedCommand, void>(
      new SetCatalogFeaturedCommand(sku, payload.featured, staffSub),
    );
  }
}
