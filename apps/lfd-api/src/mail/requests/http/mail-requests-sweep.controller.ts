import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  type MailSweepReport,
  SweepMailRequestsCommand,
} from "../application/sweep-mail-requests.command.js";

/**
 * Endpoint **batch** du balayeur des e-mails (plan `plan-service-e-mails.md`,
 * § 8) : la même porte machine-à-machine que `admin/outbox/sweep` — le
 * `RecomputeGuard` et son jeton, présentés par le Worker sur le cron `*\/5`
 * de rafraîchissement (`container/worker.ts`).
 */
@Controller("admin/mail/requests/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class MailRequestsSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<MailSweepReport> {
    return this.commands.execute<SweepMailRequestsCommand, MailSweepReport>(
      new SweepMailRequestsCommand(),
    );
  }
}
