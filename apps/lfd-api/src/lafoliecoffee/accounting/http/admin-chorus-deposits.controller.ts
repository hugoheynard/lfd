import {
  type ChorusInvoicesView,
  noteChorusDepositPayloadSchema,
  type NoteChorusDepositPayload,
  rejectChorusDepositPayloadSchema,
  type RejectChorusDepositPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { NoteChorusAcceptanceCommand } from "../application/commands/note-chorus-acceptance.command.js";
import { NoteChorusDepositCommand } from "../application/commands/note-chorus-deposit.command.js";
import { NoteChorusRejectionCommand } from "../application/commands/note-chorus-rejection.command.js";
import { ListChorusInvoicesDepositedQuery } from "../application/queries/list-chorus-invoices-deposited.query.js";
import { ListChorusInvoicesToDepositQuery } from "../application/queries/list-chorus-invoices-to-deposit.query.js";

/** Un filtre de chaîne vide vaut « pas de filtre ». */
function filterOf(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/**
 * **Le dépôt sur Chorus Pro, à la main** (plan `plan-clients-publics-chorus.md`,
 * § 6 quinquies). Lire : `b2b_accounting:read` ; noter un geste :
 * `b2b_accounting:write` (déduits du verbe). Le PDF à déposer se télécharge
 * par la route des factures émises.
 */
@Controller("admin/accounting/chorus/invoices")
@AdminSurface("b2b_accounting")
export class AdminChorusDepositsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** « À déposer » — les plus anciennes d'abord. */
  @Get("to-deposit")
  toDeposit(
    @Query("legalEntityId") legalEntityId: string | undefined,
  ): Promise<ChorusInvoicesView> {
    return this.queries.execute<ListChorusInvoicesToDepositQuery, ChorusInvoicesView>(
      new ListChorusInvoicesToDepositQuery(filterOf(legalEntityId)),
    );
  }

  /** « Déposées » — échéance effective, rejet, mise en paiement. */
  @Get("deposited")
  deposited(
    @Query("legalEntityId") legalEntityId: string | undefined,
  ): Promise<ChorusInvoicesView> {
    return this.queries.execute<ListChorusInvoicesDepositedQuery, ChorusInvoicesView>(
      new ListChorusInvoicesDepositedQuery(filterOf(legalEntityId)),
    );
  }

  /** « Déposée le … ». 409 si déjà déposée, ou si ce n'est pas une facture publique. */
  @Post(":invoiceId/deposit")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("l'agrégat refuse un second dépôt (409) : un rejeu n'écrit rien de plus")
  async deposit(
    @Param("invoiceId") invoiceId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(noteChorusDepositPayloadSchema)) payload: NoteChorusDepositPayload,
  ): Promise<void> {
    await this.commands.execute(
      new NoteChorusDepositCommand(invoiceId, payload.occurredOn, staffUserId),
    );
  }

  /** « Rejetée par Chorus », motif obligatoire. 409 si non déposée ou issue déjà notée. */
  @Post(":invoiceId/rejection")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("l'agrégat refuse un second rejet (409) : un rejeu n'écrit rien de plus")
  async reject(
    @Param("invoiceId") invoiceId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(rejectChorusDepositPayloadSchema)) payload: RejectChorusDepositPayload,
  ): Promise<void> {
    await this.commands.execute(
      new NoteChorusRejectionCommand(invoiceId, payload.occurredOn, payload.reason, staffUserId),
    );
  }

  /** « Mise en paiement » (facultatif). 409 si non déposée ou issue déjà notée. */
  @Post(":invoiceId/acceptance")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("l'agrégat refuse une seconde mise en paiement (409) : un rejeu n'écrit rien de plus")
  async accept(
    @Param("invoiceId") invoiceId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(noteChorusDepositPayloadSchema)) payload: NoteChorusDepositPayload,
  ): Promise<void> {
    await this.commands.execute(
      new NoteChorusAcceptanceCommand(invoiceId, payload.occurredOn, staffUserId),
    );
  }
}
