import {
  setMaskingPayloadSchema,
  approveReviewPayloadSchema,
  setCatalogFeaturedPayloadSchema,
  type ApproveReviewPayload,
  type CatalogAdminItemView,
  type CatalogSummaryView,
  type PublishedCatalogView,
  type SetMaskingPayload,
  type SetCatalogFeaturedPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { RetracePricesFromReferentialCommand } from "../application/commands/retrace-prices-from-referential.command.js";
import { ApproveReviewCommand } from "../application/commands/approve-review.command.js";
import { SetMaskingCommand } from "../application/commands/set-masking.command.js";
import { SetCatalogFeaturedCommand } from "../application/commands/set-catalog-featured.command.js";
import { GetPublishedCatalogQuery } from "../application/queries/get-published-catalog.query.js";
import { ExportCatalogCsvQuery } from "../application/queries/export-catalog-csv.query.js";
import { GetCatalogSummaryQuery } from "../application/queries/get-catalog-summary.query.js";
import { ListCatalogQuery } from "../application/queries/list-catalog.query.js";

/**
 * **Le paramétrage du catalogue** : ce que la plateforme décide par-dessus le
 * PIM — une visibilité, une mise en avant.
 *
 * Une route par geste, nommée comme le geste. Un `PATCH` unique acceptant un
 * patch partiel aurait été plus court et aurait tout perdu : le journal ne
 * dirait plus ce qui a été fait, et le serveur devrait deviner l'intention
 * depuis les champs présents.
 *
 * 🔴 **Le prix ne s'y décide plus** (lot D de
 * `plan-catalogue-synchronise-par-audience.md`, 2026-10-15). Les quatre routes
 * `PUT|DELETE :sku/price` et `PUT|DELETE :sku/public-price` sont retirées
 * (pré-release, CLAUDE.md §0 ; seul lecteur : le back-office) : le prix servi
 * est celui du référentiel.
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

  /**
   * **Retracer le prix du référentiel** dans l'historique des prix (lot D) :
   * une ligne pour chaque article vendu dont la dernière trace diffère —
   * typiquement un ancien prix décidé ici —, et rien d'autre. Idempotent,
   * journalisé quand il écrit. Se lance une fois après le déploiement du
   * lot D (runbook).
   *
   * Droit d'écriture du catalogue : la surface `b2b_catalog` du contrôleur.
   */
  @Post("prices/retrace")
  @HttpCode(HttpStatus.NO_CONTENT)
  async retracePrices(): Promise<void> {
    await this.commands.execute<RetracePricesFromReferentialCommand, void>(
      new RetracePricesFromReferentialCommand(),
    );
  }

  /**
   * **La vue « Catalogue publié »** (lot 3, H6) : toutes les fiches reçues du
   * référentiel — inactives et incomplètes comprises —, l'état de chaque
   * déclinaison pour les pros et pour le public, les comptes par rayon et la
   * liste à valider pour la boutique publique.
   */
  @Get("published")
  published(): Promise<PublishedCatalogView> {
    return this.queries.execute<GetPublishedCatalogQuery, PublishedCatalogView>(
      new GetPublishedCatalogQuery(),
    );
  }

  /**
   * Valider un ou plusieurs articles arrivés du référentiel, pour les pros,
   * le public, ou les deux — journalisé par article et par audience. Tout ou
   * rien.
   */
  @Post("review/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveReview(
    @Body(new ZodBody(approveReviewPayloadSchema)) payload: ApproveReviewPayload,
  ): Promise<void> {
    await this.commands.execute<ApproveReviewCommand, void>(
      new ApproveReviewCommand(payload.skus, payload.audiences),
    );
  }

  /**
   * **Masquer pour une audience, ou y remettre** — la route unique du masquage
   * (H5 ; §4 de `catalogue-synchronise.md`). Les deux routes d'avant
   * (`:sku/visibility`, `:sku/public-visibility`) sont retirées le 2026-10-15 :
   * pré-release (CLAUDE.md §0), et leur seul lecteur était le back-office.
   */
  @Put(":sku/masking")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setMasking(
    @Param("sku") sku: string,
    @Body(new ZodBody(setMaskingPayloadSchema)) payload: SetMaskingPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetMaskingCommand, void>(
      new SetMaskingCommand(sku, payload.audience, payload.hidden, staffUserId),
    );
  }

  @Put(":sku/featured")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setFeatured(
    @Param("sku") sku: string,
    @Body(new ZodBody(setCatalogFeaturedPayloadSchema)) payload: SetCatalogFeaturedPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetCatalogFeaturedCommand, void>(
      new SetCatalogFeaturedCommand(sku, payload.featured, staffUserId),
    );
  }
}
