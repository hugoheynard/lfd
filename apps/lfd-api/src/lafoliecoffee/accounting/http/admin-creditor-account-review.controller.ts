import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  confirmCreditorAccountPayloadSchema,
  type ConfirmCreditorAccountPayload,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CancelPendingCreditorAccountCommand,
  ConfirmCreditorAccountCommand,
} from "../application/commands/legal-entity-commands.js";

/**
 * **Le compte de l'entité aux quatre yeux** (plan
 * `le-paiement-par-virement.md`, T0) : confirmer ou annuler la
 * modification en attente. Proposer est le `PUT …/creditor-account` existant,
 * qui répond toujours 204 ; la fiche relue dit si la saisie attend.
 *
 * Même ressource que le reste de la surface bancaire (`b2b_accounting`, en
 * écriture par le verbe). Le confirmateur est l'appelant, désigné par sa
 * fiche : l'agrégat refuse qu'il soit l'auteur de la saisie.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminCreditorAccountReviewController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Confirme la saisie `:pendingId` en ressaisissant son IBAN. 409 si
   * l'appelant en est l'auteur, si l'IBAN diffère (sans dire où) ou si la
   * saisie n'attend plus ; 400 si l'IBAN ressaisi est mal formé.
   */
  @Post(":id/creditor-account/pending/:pendingId/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "la saisie désignée ne se confirme qu'une fois : rejouée, elle n'attend plus et la confirmation est refusée (409) sans rien réécrire",
  )
  async confirm(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("pendingId") pendingId: string,
    @Body(new ZodBody(confirmCreditorAccountPayloadSchema)) payload: ConfirmCreditorAccountPayload,
  ): Promise<void> {
    await this.commands.execute<ConfirmCreditorAccountCommand, void>(
      new ConfirmCreditorAccountCommand(id, pendingId, payload.iban, staffUserId),
    );
  }

  /** Annule la saisie `:pendingId` — 409 si elle n'attend plus. */
  @Delete(":id/creditor-account/pending/:pendingId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "la saisie désignée ne s'annule qu'une fois : rejouée, elle n'attend plus et l'annulation est refusée (409) sans rien réécrire",
  )
  async cancel(@Param("id") id: string, @Param("pendingId") pendingId: string): Promise<void> {
    await this.commands.execute<CancelPendingCreditorAccountCommand, void>(
      new CancelPendingCreditorAccountCommand(id, pendingId),
    );
  }
}
