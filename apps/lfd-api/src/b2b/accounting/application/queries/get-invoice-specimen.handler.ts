import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceXmlInconsistentError } from "../../domain/errors/invoice-document-errors.js";
import { InvoiceFontSource } from "../../domain/ports/invoice-font-source.js";
import { facturXArithmeticViolations } from "../../domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../../domain/services/facturx-xml.js";
import { renderInvoicePdf } from "../../domain/services/invoice-pdf.js";
import { specimenInvoice } from "../document-specimens/specimen-data.js";
import type { InvoiceDocument } from "../invoice-document-support.js";
import { GetInvoiceSpecimenQuery } from "./get-invoice-specimen.query.js";

/**
 * **Rend la facture d'exemple** par le rendu même des pièces émises : XML
 * EN 16931, contrôle de son arithmétique, puis `renderInvoicePdf` — sans
 * `InvoiceDocumentRenderer`, qui range et attache, deux gestes qu'un exemple
 * ne fait pas. Sans logo : celui d'une entité est une donnée de l'entité.
 *
 * @throws {InvoiceXmlInconsistentError} le XML ne se recompose pas — un
 * défaut du calcul, que l'exemple montre au lieu de le masquer.
 */
@QueryHandler(GetInvoiceSpecimenQuery)
export class GetInvoiceSpecimenHandler implements IQueryHandler<
  GetInvoiceSpecimenQuery,
  InvoiceDocument
> {
  constructor(
    private readonly clock: Clock,
    private readonly fonts: InvoiceFontSource,
  ) {}

  async execute(): Promise<InvoiceDocument> {
    const invoice = specimenInvoice(this.clock.now());
    const xml = renderFacturXml(invoice);
    const violations = facturXArithmeticViolations(xml);
    if (violations.length > 0) {
      throw new InvoiceXmlInconsistentError(invoice.number, violations);
    }
    const bytes = await renderInvoicePdf({
      invoice,
      xml,
      fonts: await this.fonts.load(),
      logo: null,
    });
    return { bytes, fileName: "exemple-facture.pdf" };
  }
}
