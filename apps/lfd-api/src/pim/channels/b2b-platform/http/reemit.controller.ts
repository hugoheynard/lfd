import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { CreatedIdResponse } from "@lfd/contracts";
import type { CatalogReemissionView, LatestCatalogReemissionView } from "@lfd/pim-contracts";
import { z } from "zod";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { GetCatalogReemissionQuery } from "../application/get-catalog-reemission.js";
import { GetLatestCatalogReemissionQuery } from "../application/get-latest-catalog-reemission.js";
import { StartCatalogReemissionCommand } from "../application/start-catalog-reemission.js";

const reemitPayload = z.object({
  /** Une fiche ; absent ou `null` = tout le catalogue. */
  productId: z.string().min(1).nullish(),
});

/**
 * La réémission du catalogue, **suivie comme un travail** (2026-10-18).
 *
 * - `POST /pim/channels/b2b/reemit` lance et rend `202` + l'identifiant :
 *   la réémission tourne en arrière-plan, la réponse n'attend plus ses ~73 s ;
 * - `GET /pim/channels/b2b/reemit/latest` — la dernière, ou `{ job: null }` ;
 * - `GET /pim/channels/b2b/reemit/:id` — un travail et son compte rendu.
 *
 * Lancer demande `pim_channels:write`, relire `pim_channels:read` (le verbe).
 */
@AdminSurface("pim_channels")
@Controller("reemit")
export class B2bReemitController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async reemit(
    @Body(new ZodBody(reemitPayload)) body: z.infer<typeof reemitPayload>,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<StartCatalogReemissionCommand, string>(
      new StartCatalogReemissionCommand(body.productId ?? null),
    );
    return { id };
  }

  // `latest` AVANT `:id`, sinon le paramètre l'avale.
  @Get("latest")
  latest(): Promise<LatestCatalogReemissionView> {
    return this.queries.execute<GetLatestCatalogReemissionQuery, LatestCatalogReemissionView>(
      new GetLatestCatalogReemissionQuery(),
    );
  }

  @Get(":id")
  byId(@Param("id") id: string): Promise<CatalogReemissionView> {
    return this.queries.execute<GetCatalogReemissionQuery, CatalogReemissionView>(
      new GetCatalogReemissionQuery(id),
    );
  }
}
