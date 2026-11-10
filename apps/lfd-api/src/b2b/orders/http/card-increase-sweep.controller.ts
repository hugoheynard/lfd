import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  type CardIncreaseExpiryReport,
  ExpireCardIncreasesCommand,
} from "../application/commands/expire-card-increases.command.js";
import {
  type CardIncreaseSweepReport,
  SweepCardIncreasesCommand,
} from "../application/commands/sweep-card-increases.command.js";

/**
 * Endpoints **machine** des hausses payées par carte (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6, §2.7) —
 * présentés par le Worker sur son cron de RAFRAÎCHISSEMENT (`*\/5 * * * *`,
 * `container/worker.ts`), avec le jeton du `RecomputeGuard`, comme
 * l'expiration des commandes boutique non réglées. Idempotents : le bail de
 * l'exécuteur et les écritures conditionnées excluent les doubles passages.
 *
 * - `sweep` : les hausses payées à appliquer, et les compléments dont le
 *   webhook a pu se perdre ;
 * - `expire` : les compléments dont le délai de paiement est passé.
 */
@Controller("admin/orders/card-increases")
@Public()
@UseGuards(RecomputeGuard)
export class CardIncreaseSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post("sweep")
  @HttpCode(200)
  sweep(): Promise<CardIncreaseSweepReport> {
    return this.commands.execute<SweepCardIncreasesCommand, CardIncreaseSweepReport>(
      new SweepCardIncreasesCommand(),
    );
  }

  @Post("expire")
  @HttpCode(200)
  expire(): Promise<CardIncreaseExpiryReport> {
    return this.commands.execute<ExpireCardIncreasesCommand, CardIncreaseExpiryReport>(
      new ExpireCardIncreasesCommand(),
    );
  }
}
