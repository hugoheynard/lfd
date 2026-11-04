import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  SwitchShelfCacheCommand,
  type ShelfSwitchOutcome,
} from "../application/commands/switch-shelf-cache.command.js";
import { SHELF_SWITCH_ACTIONS } from "../domain/ports/shop-shelf-switch.js";

const switchPayloadSchema = z.object({ action: z.enum(SHELF_SWITCH_ACTIONS) });

type SwitchPayload = z.infer<typeof switchPayloadSchema>;

/**
 * **L'interrupteur du cache des rayons** (`plan-cache-du-catalogue.md`,
 * « L'interrupteur ») : éteindre, rallumer, vider — et, depuis C3, allumer ou
 * éteindre le rayon public seul (`public-on`, `public-off`) — en production sans
 * redéployer ni redémarrer le conteneur. Actionné par le workflow
 * `ops_shelf_cache.yml`, gardé comme `admin/ops/mail-check` — le jeton
 * machine `RECOMPUTE_TOKEN`, détenu par la CI seule.
 *
 * **Pourquoi dans `b2b/catalog` et pas dans `ops`, malgré le chemin
 * `admin/ops/…`.** Le cache est au catalogue : son port, ses adaptateurs et
 * ses signaux vivent dans `b2b/catalog/` (C2). `ops` ne peut pas importer
 * `b2b` (matrice du `CLAUDE.md`, § 3), et `platform` ne connaît aucun
 * contexte. Le chemin dit le GESTE (de l'exploitation), le dossier dit à qui
 * appartient la chose qu'il actionne.
 */
@Controller("admin/ops/shelf-cache")
@Public()
@UseGuards(RecomputeGuard)
export class AdminShelfCacheController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  switch(
    @Body(new ZodBody(switchPayloadSchema)) payload: SwitchPayload,
  ): Promise<ShelfSwitchOutcome> {
    return this.commands.execute<SwitchShelfCacheCommand, ShelfSwitchOutcome>(
      new SwitchShelfCacheCommand(payload.action),
    );
  }
}
