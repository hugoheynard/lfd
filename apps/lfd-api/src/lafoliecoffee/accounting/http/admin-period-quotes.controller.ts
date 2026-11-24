import {
  periodQuoteCommitmentPayloadSchema,
  type PeriodQuoteCommitmentPayload,
} from "@lfd/contracts";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReceivePeriodQuoteCommitmentCommand } from "../application/commands/receive-period-quote-commitment.command.js";
import { ResendPeriodQuoteCommand } from "../application/commands/resend-period-quote.command.js";
import type { InvoiceDocument } from "../application/invoice-document-support.js";
import { GetPeriodQuoteDocumentQuery } from "../application/queries/get-period-quote-document.query.js";

/**
 * Surface **staff** des devis de période (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD4 et QD6) : « Renvoyer le
 * devis » et « Engagement reçu », sous `b2b_accounting:write`, déduit du
 * verbe — la ressource de la facturation, celle du renvoi de « Votre
 * facture » ; le PDF d'une version, sous `b2b_accounting:read`.
 */
@Controller("admin/period-quotes")
@AdminSurface("b2b_accounting")
export class AdminPeriodQuotesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Le PDF rangé d'une version, en téléchargement — la forme du PDF d'une
   * facture (`attachment`, sous son nom). 404 nommé tant qu'il n'est pas rendu.
   */
  @Get(":quoteId/document")
  async document(
    @Param("quoteId") quoteId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const document = await this.queries.execute<GetPeriodQuoteDocumentQuery, InvoiceDocument>(
      new GetPeriodQuoteDocumentQuery(quoteId),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(document.fileName, "devis.pdf")),
    );
    return new StreamableFile(document.bytes);
  }

  /**
   * Renvoie le devis : la même version si ses commandes n'ont pas changé,
   * sinon une nouvelle version rangée. Rend l'identifiant de la version
   * envoyée ; 409 nommé pour un devis facturé ou remplacé, ou sans personne
   * à prévenir.
   */
  @Post(":quoteId/resend")
  @HttpCode(HttpStatus.OK)
  async resend(
    @Param("quoteId") quoteId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<{ readonly quoteId: string }> {
    const sent = await this.commands.execute<ResendPeriodQuoteCommand, string>(
      new ResendPeriodQuoteCommand(quoteId, staffUserId, intentKey),
    );
    return { quoteId: sent };
  }

  /**
   * **« Engagement reçu »** : corps `{ number }`, le numéro renvoyé par
   * l'organisme. Écrit sur les commandes du devis, émet sa facture (le code
   * service est celui du devis) et rend son identifiant. Refus : forme du
   * numéro (`400` `budget_commitment.invalid`), devis inconnu (`404`), devis
   * facturé, remplacé, plus à jour ou dont les commandes ne font plus une
   * facture (`409` nommé) — rien n'est alors écrit.
   */
  @Post(":quoteId/commitment")
  @HttpCode(HttpStatus.OK)
  async receiveCommitment(
    @Param("quoteId") quoteId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
    @Body(new ZodBody(periodQuoteCommitmentPayloadSchema)) payload: PeriodQuoteCommitmentPayload,
  ): Promise<{ readonly invoiceId: string }> {
    const invoiceId = await this.commands.execute<ReceivePeriodQuoteCommitmentCommand, string>(
      new ReceivePeriodQuoteCommitmentCommand(quoteId, payload.number, staffUserId, intentKey),
    );
    return { invoiceId };
  }
}
