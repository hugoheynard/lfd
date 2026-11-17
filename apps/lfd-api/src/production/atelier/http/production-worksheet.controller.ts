import {
  type ProductionContainerRule,
  type ProductionContainerView,
  type ProductionWorksheetQuery,
  type ProductionWorksheetView,
  type RecordWorkshopBatch,
  type ReportWorkshopProblem,
  productionContainerSchema,
  productionWorksheetQuerySchema,
  recordWorkshopBatchSchema,
  reportWorkshopProblemSchema,
  workshopBatchIdSchema,
  workshopBatchRefSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
  RequirePermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodParam, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelBatchCommand } from "../application/commands/cancel-batch.command.js";
import { MarkLineDoneCommand } from "../application/commands/mark-line-done.command.js";
import { ReportProblemCommand } from "../application/commands/report-problem.command.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { RecordBatchCommand } from "../application/commands/record-batch.command.js";
import { RemoveProductionContainerCommand } from "../application/commands/remove-production-container.command.js";
import { SetProductionContainerCommand } from "../application/commands/set-production-container.command.js";
import { ListProductionContainersQuery } from "../application/queries/list-production-containers.query.js";
import { GetCurrentProductionWorksheetQuery } from "../application/queries/get-current-production-worksheet.query.js";
import { GetProductionWorksheetQuery } from "../application/queries/get-production-worksheet.query.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Le jour du chemin, validé dans sa FORME avant d'entrer.
 *
 * Le domaine le refuserait aussi — `ServiceDay.of` lève sur autre chose qu'un
 * jour ISO — mais le message de la frontière nomme le paramètre. Par un pipe et
 * non par un `.parse` dans la route : un `ZodError` nu sortait en 500
 * (2026-10-22).
 */
const DAY = new ZodParam(productionWorksheetQuerySchema.shape.date, "date");

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Un contrôleur à part de `ProductionDayController`, qui frôle les 300 lignes :
 * ce n'est pas un découpage de confort mais la SRP appliquée aux surfaces — la
 * journée (clore, coliser, imprimer) et la fiche (déclarer une fournée, régler) ne
 * changent pas pour les mêmes raisons. Le préfixe reste le même, parce que c'est
 * le même fournil qui les ouvre. Le retirage, geste du plan, a son contrôleur
 * (`ProductionDayRetakeController`), sous le même chemin.
 *
 * Il n'injecte que des **bus**, comme tous les autres : ni service, ni dépôt, ni
 * port de lecture. `lint:controller-buses` le tient.
 *
 * L'identité staff vient du guard, jamais de la charge utile — une fournée
 * sans auteur ne se conteste pas, elle s'efface.
 *
 * `production_worksheet` depuis le 2026-10-01 (`documentation/livraisons/droits/plan-droits-par-geste.md`, 5.1).
 * Le contenant se LIT sous ce droit (la fiche en a besoin pour « + 1 plaque »),
 * mais se RÈGLE sous `production_settings:write` depuis le 2026-10-28 (plan
 * `documentation/fournil/la-fiche-d-atelier.md`, §5) : c'est la page des
 * raccourcis qui le règle, et c'est son droit.
 */
@Controller("admin/production")
@AdminSurface("production_worksheet")
export class ProductionWorksheetController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **La fiche d'une journée**, arbitrée entre deux sources.
   *
   * Une journée arrêtée rend son instantané et l'heure du tirage ; une journée
   * ouverte rend la demande du commerce et `generatedAt: null`. L'écran dit
   * alors « plan non arrêté » plutôt que d'afficher l'heure de la lecture, qui
   * n'atteste de rien.
   *
   * Le jour vient de la chaîne de requête pour qu'un lien soit partageable, comme
   * le prévisionnel : un fournil qui dit « regarde le 14 » envoie une adresse.
   *
   * Ouverte aussi au prévisionnel (`production_plan:read`) depuis le 2026-11-01 :
   * le Prod manager montre la même vue par tranche, en lecture seule — la
   * figure des échéances (`batch/:date/due-thresholds`), ouvertes aux deux.
   */
  @Get("worksheet")
  @RequireAnyPermission("production_worksheet:read", "production_plan:read")
  async worksheet(
    @Query(new ZodQuery(productionWorksheetQuerySchema)) query: ProductionWorksheetQuery,
  ): Promise<ProductionWorksheetView> {
    return this.queries.execute<GetProductionWorksheetQuery, ProductionWorksheetView>(
      new GetProductionWorksheetQuery(query.date),
    );
  }

  /**
   * **La fiche de la journée qu'on travaille** : demain si son plan est arrêté,
   * aujourd'hui sinon — au jour de Paris, selon l'horloge du serveur.
   *
   * Elle existe pour que l'écran cesse de choisir sa journée sur l'horloge du
   * poste, et de faire deux lectures pour le savoir. Même vue que la route datée,
   * qui reste servie pour les liens partagés.
   */
  @Get("worksheet/current")
  async currentWorksheet(): Promise<ProductionWorksheetView> {
    return this.queries.execute<GetCurrentProductionWorksheetQuery, ProductionWorksheetView>(
      new GetCurrentProductionWorksheetQuery(),
    );
  }

  /**
   * **Une fournée est sortie** (plan des fournées, D3).
   *
   * `PUT` sur l'identifiant tiré par l'écran : rejouer la même requête rend le
   * même état (succès silencieux), un autre contenu sous le même identifiant
   * est refusé (409). Une ligne avance par fournées, et « faite » se lit
   * sur elles.
   */
  @Put("worksheet/:date/lines/:sku/batches/:batchId")
  @Idempotent(
    "par sa propre clé : l'identifiant de la fournée vient de l'écran ; rejouée, la base garde la première (skipDuplicates), la même charge passe en silence, la remise au colisage garde son id et le fait sa clé d'outbox",
  )
  @HttpCode(NO_CONTENT)
  async recordBatch(
    @Param("date", DAY) date: string,
    @Param("sku") sku: string,
    @Param("batchId", new ZodParam(workshopBatchIdSchema, "batchId")) batchId: string,
    @Body(new ZodBody(recordWorkshopBatchSchema)) body: RecordWorkshopBatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RecordBatchCommand, void>(
      new RecordBatchCommand(date, sku, batchId, body.quantity, body.initials, staffUserId),
    );
  }

  /**
   * **« Fait »** (plan `fournil/plan-niveaux-de-suivi.md`, § 3.6) : une
   * fournée du reste à sortir, sous le plafond d'un rouge. Une ligne déjà
   * faite ne déclare rien. Par intention : un double appui ne déclare qu'une
   * fois.
   */
  @Post("worksheet/:date/lines/:sku/done")
  @HttpCode(NO_CONTENT)
  async markDone(
    @Param("date", DAY) date: string,
    @Param("sku") sku: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<MarkLineDoneCommand, void>(
      new MarkLineDoneCommand(date, sku, staffUserId, intentKey),
    );
  }

  /**
   * **Le rouge** (plan `fournil/plan-niveaux-de-suivi.md`, § 3.4) :
   * « combien est réellement sorti ? ». Il pose un plafond, corrige ce qui
   * a été déclaré en trop ou déclare ce qui manque, et sonne dans la cloche
   * de la Supervision. Par intention.
   */
  @Post("worksheet/:date/lines/:sku/problem")
  @HttpCode(NO_CONTENT)
  async reportProblem(
    @Param("date", DAY) date: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(reportWorkshopProblemSchema)) body: ReportWorkshopProblem,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ReportProblemCommand, void>(
      new ReportProblemCommand(
        date,
        sku,
        body.produced,
        body.reason ?? null,
        staffUserId,
        intentKey,
      ),
    );
  }

  /**
   * **La fournée ne compte plus** — annulée entière, tracée, jamais supprimée.
   * Tout poste du fournil peut annuler celle d'un autre (Hugo, 2026-09-28).
   * Refusée si des pièces sont déjà dans des sacs (409).
   */
  @Delete("worksheet/:date/batches/:batchId")
  @Idempotent(
    "annule une fournée : rejouée, elle l'est déjà et l'agrégat rend null, ou son retour est déjà demandé (409 BatchReturnPendingError)",
  )
  @HttpCode(NO_CONTENT)
  async cancelBatch(
    @Param("date", DAY) date: string,
    @Param("batchId", new ZodParam(workshopBatchRefSchema, "batchId")) batchId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CancelBatchCommand, void>(
      new CancelBatchCommand(date, batchId, staffUserId),
    );
  }

  /**
   * Les contenants réglés, tous — quelques dizaines de lignes au plus. Lus par
   * la fiche ET par la page des raccourcis, qui les règle (plan fournée v3, §5).
   */
  @Get("containers")
  @RequireAnyPermission("production_worksheet:read", "production_settings:read")
  async containers(): Promise<readonly ProductionContainerView[]> {
    return this.queries.execute<ListProductionContainersQuery, readonly ProductionContainerView[]>(
      new ListProductionContainersQuery(),
    );
  }

  /**
   * **Régler le contenant d'un produit.** `PUT` : un SKU n'a qu'un réglage, et
   * le poser deux fois de suite doit donner le même état.
   */
  @Put("containers/:sku")
  @Idempotent(
    "pose une règle de contenant : rejouée, la même règle est réécrite telle quelle et le journal se tait quand rien n'a changé",
  )
  @RequirePermission("production_settings:write")
  @HttpCode(NO_CONTENT)
  async setContainer(
    @Param("sku") sku: string,
    @Body(new ZodBody(productionContainerSchema)) body: ProductionContainerRule,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetProductionContainerCommand, void>(
      new SetProductionContainerCommand(sku, body, staffUserId),
    );
  }

  /** Retirer le réglage — la colonne de la fiche redevient vide. */
  @Delete("containers/:sku")
  @Idempotent(
    "retire une règle : rejouée, il n'y en a plus, l'effacement ne touche rien et le journal se tait",
  )
  @RequirePermission("production_settings:write")
  @HttpCode(NO_CONTENT)
  async removeContainer(@Param("sku") sku: string): Promise<void> {
    await this.commands.execute<RemoveProductionContainerCommand, void>(
      new RemoveProductionContainerCommand(sku),
    );
  }
}
