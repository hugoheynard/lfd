import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  type BankTransferConsistencyReport,
  CheckBankTransferConsistencyCommand,
} from "../application/commands/check-bank-transfer-consistency.command.js";

/**
 * Endpoint **machine** du contrôle de cohérence du virement reçu (plan
 * `plan-le-virement-recu-dans-payment.md`, §3.6) : le `RecomputeGuard` et son
 * jeton, présentés par le cron de NUIT du Worker (`container/worker.ts`).
 */
@Controller("admin/accounting/bank-transfers/consistency")
@Public()
@UseGuards(RecomputeGuard)
export class BankTransferConsistencyController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : le contrôle ne fait que lire les deux côtés et sonner — rien n'est corrigé, et chaque écart porte sa clé de cloche, un second passage ne sonne pas deux fois",
  )
  check(): Promise<BankTransferConsistencyReport> {
    return this.commands.execute<
      CheckBankTransferConsistencyCommand,
      BankTransferConsistencyReport
    >(new CheckBankTransferConsistencyCommand());
  }
}
