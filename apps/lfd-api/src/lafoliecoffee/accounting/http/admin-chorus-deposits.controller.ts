import {
  type ChorusInvoicesView,
  noteChorusDepositPayloadSchema,
  type NoteChorusDepositPayload,
  rejectChorusDepositPayloadSchema,
  type RejectChorusDepositPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import type { InvoiceDocument } from "../application/invoice-document-support.js";
import { NoteChorusAcceptanceCommand } from "../application/commands/note-chorus-acceptance.command.js";
import { NoteChorusDepositCommand } from "../application/commands/note-chorus-deposit.command.js";
import { NoteChorusRejectionCommand } from "../application/commands/note-chorus-rejection.command.js";
import { GetChorusDepositPdfQuery } from "../application/queries/get-chorus-deposit-pdf.query.js";
import { ListChorusInvoicesDepositedQuery } from "../application/queries/list-chorus-invoices-deposited.query.js";
import { ListChorusInvoicesToDepositQuery } from "../application/queries/list-chorus-invoices-to-deposit.query.js";
import { invoicePdfResponse } from "./invoice-pdf-response.js";

/** Un filtre de chaîne vide vaut « pas de filtre ». */
function filterOf(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/**
 * **Le dépôt sur Chorus Pro, à la main** (plan `plan-clients-publics-chorus.md`,
 * § 6 quinquies). Lire : `b2b_accounting:read` ; noter un geste :
 * `b2b_accounting:write` (déduits du verbe). Le PDF à déposer est un PDF
 * ordinaire, sans XML : le portail refuse une Factur-X déposée à la main.
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

  /** Le PDF à déposer sur le portail : la pièce sans le XML Factur-X. 409 hors facture publique. */
  @Get(":invoiceId/pdf")
  async pdf(
    @Param("invoiceId") invoiceId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const document = await this.queries.execute<GetChorusDepositPdfQuery, InvoiceDocument>(
      new GetChorusDepositPdfQuery(invoiceId),
    );
    return invoicePdfResponse(document, response);
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
