import {
  setB2bPricePayloadSchema,
  setCatalogFeaturedPayloadSchema,
  setCatalogVisibilityPayloadSchema,
  type CatalogAdminItemView,
  type CatalogSummaryView,
  type SetB2bPricePayload,
  type SetCatalogFeaturedPayload,
  type SetCatalogVisibilityPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AlignOnPimPriceCommand,
  SetB2bPriceCommand,
  SetCatalogFeaturedCommand,
  SetCatalogVisibilityCommand,
} from "../application/commands/catalog-decision.commands.js";
import { ExportCatalogCsvQuery } from "../application/queries/export-catalog-csv.query.js";
import { GetCatalogSummaryQuery } from "../application/queries/get-catalog-summary.query.js";
import { ListCatalogQuery } from "../application/queries/list-catalog.query.js";

/**
 * **Le paramétrage du catalogue** : ce que la plateforme décide par-dessus le
 * PIM — un prix, une visibilité, une mise en avant.
 *
 * Une route par geste, nommée comme le geste. Un `PATCH` unique acceptant un
 * patch partiel aurait été plus court et aurait tout perdu : le journal ne
 * dirait plus ce qui a été fait, et le serveur devrait deviner l'intention
 * depuis les champs présents.
 *
 * Retirer un prix B2B est un `DELETE` et pas un `PUT { priceMillicents: null }` : on
 * **supprime une décision**, on n'en pose pas une qui vaudrait « rien ».
 *
 * Surface staff murée par `@AdminSurface("b2b_catalog")` : le paramétrage du
 * catalogue est du réglage, et n'ouvrir une ressource `catalog` qu'ici créerait
 * un droit que rien d'autre n'exerce.
 */
@Controller("admin/catalog")
@AdminSurface("b2b_catalog")
export class AdminCatalogController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Tout le catalogue, **masqués compris** : le back-office doit les voir pour les rouvrir. */
  @Get()
  list(): Promise<CatalogAdminItemView[]> {
    return this.queries.execute<ListCatalogQuery, CatalogAdminItemView[]>(new ListCatalogQuery());
  }

  /**
   * Les trois nombres du tableau de bord de la comptabilité.
   *
   * Une route à part plutôt qu'un calcul sur `GET /` : le tableau de bord veut
   * trois entiers, pas quatre cents lignes avec leurs allergènes. Faire compter
   * l'écran lui ferait télécharger le catalogue entier pour afficher « 312 ».
   */
  @Get("summary")
  summary(): Promise<CatalogSummaryView> {
    return this.queries.execute<GetCatalogSummaryQuery, CatalogSummaryView>(
      new GetCatalogSummaryQuery(),
    );
  }

  /**
   * Le catalogue en CSV, tel qu'on l'ouvre dans un tableur.
   *
   * `text/csv; charset=utf-8` **et** un BOM dans le corps : l'en-tête suffit à
   * un navigateur, pas à Excel, qui lit le fichier depuis le disque une fois
   * téléchargé et n'a plus l'en-tête sous les yeux. Les deux, donc, et ce n'est
   * pas une ceinture avec bretelles — ce sont deux lecteurs différents.
   *
   * Le nom de fichier est posé ici et pas côté écran : un navigateur qui suit
   * un lien ne sait rien nommer, et « export.csv » dans un dossier de
   * téléchargements ne se retrouve pas.
   */
  @Get("export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="catalogue-b2b.csv"')
  csv(): Promise<string> {
    return this.queries.execute<ExportCatalogCsvQuery, string>(new ExportCatalogCsvQuery());
  }

  @Put(":sku/price")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPrice(
    @Param("sku") sku: string,
    @Body(new ZodBody(setB2bPricePayloadSchema)) payload: SetB2bPricePayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SetB2bPriceCommand, void>(
      new SetB2bPriceCommand(sku, payload.priceMillicents, staffSub),
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
