import {
  type ProductionProblemsView,
  type ProductionWorksheetQuery,
  type ProductionWorksheetView,
  productionWorksheetQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ResolveProblemCommand } from "../application/commands/resolve-problem.command.js";
import { GetProductionWorksheetQuery } from "../application/queries/get-production-worksheet.query.js";
import { ListOpenProductionProblemsQuery } from "../application/queries/list-open-production-problems.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Le fournil vu depuis la Supervision**
 * (`documentation/supervision/architecture-supervision-du-jour.md`, §3) — un
 * seul geste : « Marquer traité » un problème du fournil (plan
 * `fournil/plan-niveaux-de-suivi.md`, § 3.8), sous `b2b_supervision:write`.
 *
 * Une seconde PORTE sur les lectures du fournil, pas une seconde lecture :
 * chaque route envoie exactement la query que `ProductionWorksheetController`
 * envoie, avec les mêmes paramètres. La colonne colisage ne passe plus par ici :
 * elle lit le board du colisage (`GET admin/packing/:date/board`, plan du
 * colisage §17.6). Ce qui
 * change est le droit — `b2b_supervision`, qui se donne sans ouvrir la
 * Production en écriture comme le ferait `b2b_orders`.
 *
 * Il n'injecte que les bus.
 */
@Controller("admin/supervision")
@AdminSurface("b2b_supervision")
export class ProductionSupervisionController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La colonne 1 — la fiche d'atelier du jour, comme `GET admin/production/worksheet`. */
  @Get("preparation")
  preparation(
    @Query(new ZodQuery(productionWorksheetQuerySchema)) query: ProductionWorksheetQuery,
  ): Promise<ProductionWorksheetView> {
    return this.queries.execute<GetProductionWorksheetQuery, ProductionWorksheetView>(
      new GetProductionWorksheetQuery(query.date),
    );
  }

  /** Les problèmes ouverts du fournil, ce jour-là : en rouge jusqu'à « Marquer traité ». */
  @Get("production-problems")
  productionProblems(
    @Query(new ZodQuery(productionWorksheetQuerySchema)) query: ProductionWorksheetQuery,
  ): Promise<ProductionProblemsView> {
    return this.queries.execute<ListOpenProductionProblemsQuery, ProductionProblemsView>(
      new ListOpenProductionProblemsQuery(query.date),
    );
  }

  /** « Marquer traité » : le problème quitte le rouge ; son plafond reste. Par intention. */
  @Post("production-problems/:id/resolve")
  @HttpCode(NO_CONTENT)
  async resolveProductionProblem(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ResolveProblemCommand, void>(
      new ResolveProblemCommand(id, staffUserId, intentKey),
    );
  }
}
