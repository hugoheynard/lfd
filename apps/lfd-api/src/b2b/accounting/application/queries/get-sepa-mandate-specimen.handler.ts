import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { renderSepaMandatePdf } from "../../domain/services/sepa-mandate-pdf.js";
import { SPECIMEN_CREDITOR, SPECIMEN_DEBTOR } from "../document-specimens/specimen-mandate.js";
import { GetSepaMandateSpecimenQuery } from "./get-sepa-mandate-specimen.query.js";

/** Ce que la route sert : les octets et leur nom. */
export interface SepaMandateSpecimenPdf {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/**
 * **Rend le mandat d'exemple** par le rendu même des mandats
 * (`renderSepaMandatePdf`), sous le schéma demandé — la mise en page EPC pour
 * `CORE`, le gabarit interentreprises pour `B2B`.
 *
 * Sans émission : aucune RUM n'est tirée, et le filigrane EXEMPLE reste — le
 * rendu rend inexprimable l'un sans l'autre. Sans logo : celui d'une entité
 * est une donnée de l'entité.
 */
@QueryHandler(GetSepaMandateSpecimenQuery)
export class GetSepaMandateSpecimenHandler implements IQueryHandler<
  GetSepaMandateSpecimenQuery,
  SepaMandateSpecimenPdf
> {
  async execute(query: GetSepaMandateSpecimenQuery): Promise<SepaMandateSpecimenPdf> {
    const bytes = await renderSepaMandatePdf(
      { scheme: query.scheme, paymentType: SPECIMEN_CREDITOR.mandatePaymentType },
      SPECIMEN_CREDITOR,
      null,
      SPECIMEN_DEBTOR,
      null,
    );
    return { bytes, fileName: `exemple-mandat-sepa-${query.scheme.toLowerCase()}.pdf` };
  }
}
