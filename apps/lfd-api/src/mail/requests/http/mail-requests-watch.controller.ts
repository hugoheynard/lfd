import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  type MailWatchReport,
  WatchMailRequestsCommand,
} from "../application/watch-mail-requests.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Endpoint **batch** de la veille du courrier (plan `plan-service-e-mails.md`,
 * § 25) : la même porte machine-à-machine que `admin/mail/requests/sweep` —
 * le `RecomputeGuard` et son jeton, présentés par le Worker sur le cron `*\/5`
 * de rafraîchissement (`container/worker.ts`), juste après le balayeur.
 */
@Controller("admin/mail/requests/watch")
@Public()
@UseGuards(RecomputeGuard)
export class MailRequestsWatchController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "appelée par le cron sous RecomputeGuard : l'arriéré est relu et chaque alarme porte sa clé de notification — un second passage ne sonne pas deux fois",
  )
  @HttpCode(200)
  watch(): Promise<MailWatchReport> {
    return this.commands.execute<WatchMailRequestsCommand, MailWatchReport>(
      new WatchMailRequestsCommand(),
    );
  }
}
