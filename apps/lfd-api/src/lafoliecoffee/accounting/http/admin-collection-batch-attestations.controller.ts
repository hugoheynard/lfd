import {
  attestCollectionBatchPayloadSchema,
  withdrawCollectionBatchAttestationPayloadSchema,
  type AttestCollectionBatchPayload,
  type CreatedIdResponse,
  type WithdrawCollectionBatchAttestationPayload,
} from "@lfd/contracts";
import { Body, Controller, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AttestCollectionBatchCommand } from "../application/commands/attest-collection-batch.command.js";
import { WithdrawCollectionBatchAttestationCommand } from "../application/commands/withdraw-collection-batch-attestation.command.js";

/**
 * **Les attestations d'un lot** — contrôle CSV relu, remise signée sur CENET,
 * accusés PSR lus (plan `plan-page-procedure-de-prelevement.md` § 1.2, P3).
 * Écriture sous `b2b_accounting:write` (le verbe le dit) ; la lecture passe
 * par l'état de la procédure.
 */
@Controller("admin/accounting/collection/batches/:batchId/attestations")
@AdminSurface("b2b_accounting")
export class AdminCollectionBatchAttestationsController {
  constructor(private readonly commands: CommandBus) {}

  /** Atteste une sorte ; 409 si elle l'est déjà ou si le lot n'en est pas là. */
  @Post()
  async attest(
    @StaffUserId() staffUserId: string,
    @Param("batchId") batchId: string,
    @Body(new ZodBody(attestCollectionBatchPayloadSchema)) payload: AttestCollectionBatchPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<AttestCollectionBatchCommand, string>(
      new AttestCollectionBatchCommand(batchId, payload.kind, staffUserId),
    );
    return { id };
  }

  /** Retire une sorte, avec sa raison ; 409 si elle n'est pas attestée. */
  @Post("withdrawn")
  async withdraw(
    @StaffUserId() staffUserId: string,
    @Param("batchId") batchId: string,
    @Body(new ZodBody(withdrawCollectionBatchAttestationPayloadSchema))
    payload: WithdrawCollectionBatchAttestationPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<WithdrawCollectionBatchAttestationCommand, string>(
      new WithdrawCollectionBatchAttestationCommand(
        batchId,
        payload.kind,
        payload.note,
        staffUserId,
      ),
    );
    return { id };
  }
}
