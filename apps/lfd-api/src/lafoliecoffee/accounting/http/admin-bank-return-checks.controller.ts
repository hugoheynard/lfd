import {
  attestBankReturnCheckPayloadSchema,
  withdrawBankReturnCheckPayloadSchema,
  type AttestBankReturnCheckPayload,
  type CreatedIdResponse,
  type WithdrawBankReturnCheckPayload,
} from "@lfd/contracts";
import { Body, Controller, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AttestBankReturnCheckCommand } from "../application/commands/attest-bank-return-check.command.js";
import { WithdrawBankReturnCheckCommand } from "../application/commands/withdraw-bank-return-check.command.js";

/**
 * **« Retours contrôlés »** — l'attestation du contrôle quotidien des retours
 * de la banque (plan `plan-page-procedure-de-prelevement.md` § 1.2, P3).
 * Écriture sous `b2b_accounting:write` (le verbe le dit) ; la lecture passe
 * par l'état de la procédure.
 */
@Controller("admin/accounting/bank-return-checks")
@AdminSurface("b2b_accounting")
export class AdminBankReturnChecksController {
  constructor(private readonly commands: CommandBus) {}

  /** Atteste le jour (aujourd'hui par défaut) ; 409 s'il l'est déjà. */
  @Post()
  async attest(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(attestBankReturnCheckPayloadSchema)) payload: AttestBankReturnCheckPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<AttestBankReturnCheckCommand, string>(
      new AttestBankReturnCheckCommand(payload.legalEntityId, payload.day ?? null, staffUserId),
    );
    return { id };
  }

  /** Retire l'attestation d'un jour, avec sa raison ; 409 s'il n'y en a pas. */
  @Post("withdrawn")
  async withdraw(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(withdrawBankReturnCheckPayloadSchema))
    payload: WithdrawBankReturnCheckPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<WithdrawBankReturnCheckCommand, string>(
      new WithdrawBankReturnCheckCommand(
        payload.legalEntityId,
        payload.day,
        payload.note,
        staffUserId,
      ),
    );
    return { id };
  }
}
