import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type {
  PostDeployOverview,
  PostDeployRunStarted,
  PostDeployRunView,
} from "@lfd/ops-contract";
import { z } from "zod";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ApplyPostDeployOperationCommand } from "../application/apply-post-deploy-operation.command.js";
import { ListPostDeployOperationsQuery } from "../application/list-post-deploy-operations.query.js";
import { ReadPostDeployRunQuery } from "../application/read-post-deploy-run.query.js";
import { SimulatePostDeployOperationCommand } from "../application/simulate-post-deploy-operation.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/** « J'ai lu » coché (§ 7.10) : la forme seulement, le reste est la machine d'états. */
const ApplySchema = z.object({ acknowledged: z.literal(true) });
type ApplyBody = z.infer<typeof ApplySchema>;

/**
 * **Après déploiement** — les reprises qu'une image laisse à faire
 * (`documentation/ops/plan-operations-apres-deploiement.md`). Sous
 * `ops_post_deploy` : lire et SIMULER demandent la lecture (§ 7.8),
 * APPLIQUER l'écriture. La première route d'`ops` qui déclenche une écriture
 * métier (§ 7.12) — elle ne la fait pas elle-même : le commerce l'implémente
 * derrière le contrat de `platform/`.
 */
@Controller("admin/ops/post-deploy")
@AdminSurface("ops_post_deploy")
export class AdminPostDeployController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<PostDeployOverview> {
    return this.queries.execute<ListPostDeployOperationsQuery, PostDeployOverview>(
      new ListPostDeployOperationsQuery(),
    );
  }

  @Get("runs/:runId")
  run(@Param("runId") runId: string): Promise<PostDeployRunView> {
    return this.queries.execute<ReadPostDeployRunQuery, PostDeployRunView>(
      new ReadPostDeployRunQuery(runId),
    );
  }

  @Post(":key/simulate")
  @Idempotent(
    "une simulation est une mesure rangée, sans écriture métier : rejouée, elle en range une de plus, que seul « Appliquer » lit (la dernière de l'auteur) ; non durci, voulu",
  )
  @HttpCode(201)
  @RequirePermission("ops_post_deploy:read")
  async simulate(
    @Param("key") key: string,
    @StaffUserId() actor: string,
  ): Promise<PostDeployRunStarted> {
    const runId = await this.commands.execute<SimulatePostDeployOperationCommand, string>(
      new SimulatePostDeployOperationCommand(key, actor),
    );
    return { runId };
  }

  @Post(":key/apply")
  @Idempotent(
    "transition : lance la dernière simulation de l'auteur ; rejouée, elle n'est plus « simulée » et le lancement est refusé (409 SimulationRequiredError)",
  )
  @HttpCode(202)
  async apply(
    @Param("key") key: string,
    @StaffUserId() actor: string,
    @Body(new ZodBody(ApplySchema)) _body: ApplyBody,
  ): Promise<PostDeployRunStarted> {
    const runId = await this.commands.execute<ApplyPostDeployOperationCommand, string>(
      new ApplyPostDeployOperationCommand(key, actor),
    );
    return { runId };
  }
}
