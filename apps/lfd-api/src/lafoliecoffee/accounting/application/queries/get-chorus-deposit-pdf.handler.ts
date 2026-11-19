import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  ChorusDepositInvoiceNotFoundError,
  InvoiceNotForChorusError,
} from "../../domain/errors/chorus-deposit-errors.js";
import { ChorusDepositRepository } from "../../domain/ports/chorus-deposit.repository.js";
import { InvoiceFontSource } from "../../domain/ports/invoice-font-source.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { LegalEntityLogoReader } from "../../domain/ports/legal-entity-logo.reader.js";
import { renderInvoicePdf } from "../../domain/services/invoice-pdf.js";
import { isPublicInvoice } from "../../domain/services/public-invoice-due.js";
import type { InvoiceDocument } from "../invoice-document-support.js";
import { readEntityLogo } from "../legal-entity-support.js";
import { GetChorusDepositPdfQuery } from "./get-chorus-deposit-pdf.query.js";

/**
 * **Le PDF à déposer sur le portail Chorus Pro** : la pièce redessinée en PDF
 * ordinaire, sans le XML Factur-X. Le portail refuse une Factur-X déposée à
 * la main et accepte ce PDF (constat d'un client public, 2026-11-19 — plan
 * `plan-clients-publics-chorus.md`, § 6 quinquies).
 *
 * Rendu à la demande, jamais rangé : l'exemplaire qui fait foi reste le
 * PDF/A-3 Factur-X gardé. Le dessin est celui de la pièce figée ; seul le
 * logo de l'entité est relu, comme au rendu d'origine. Une lecture : rien
 * n'est écrit.
 *
 * @throws {ChorusDepositInvoiceNotFoundError} la pièce n'existe pas.
 * @throws {InvoiceNotForChorusError} ce n'est pas une facture d'organisme public.
 */
@QueryHandler(GetChorusDepositPdfQuery)
export class GetChorusDepositPdfHandler implements IQueryHandler<
  GetChorusDepositPdfQuery,
  InvoiceDocument
> {
  constructor(
    private readonly deposits: ChorusDepositRepository,
    private readonly invoices: InvoiceReader,
    private readonly fonts: InvoiceFontSource,
    private readonly logos: LegalEntityLogoReader,
    private readonly logoStore: DocumentStore,
  ) {}

  async execute(query: GetChorusDepositPdfQuery): Promise<InvoiceDocument> {
    const deposit = await this.deposits.load(query.invoiceId);
    const invoice = await this.invoices.byId(query.invoiceId);
    if (deposit === null || invoice === null) {
      throw new ChorusDepositInvoiceNotFoundError(query.invoiceId);
    }
    if (!isPublicInvoice(deposit.invoice)) {
      throw new InvoiceNotForChorusError(deposit.invoice.number);
    }
    const state = invoice.toState();
    const bytes = await renderInvoicePdf({
      invoice,
      xml: null,
      fonts: await this.fonts.load(),
      logo: await readEntityLogo(this.logos, this.logoStore, state.legalEntityId),
    });
    return { fileName: `${state.number}-chorus.pdf`, bytes };
  }
}
