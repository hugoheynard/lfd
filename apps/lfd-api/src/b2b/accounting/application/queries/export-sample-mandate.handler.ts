import type { Buffer } from "node:buffer";

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import {
  renderSepaMandatePdf,
  sampleMandateFileName,
} from "../../domain/services/sepa-mandate-pdf.js";
import { ExportSampleMandateQuery } from "./legal-entity-queries.js";

/** Le fichier et le nom qu'on propose au navigateur. */
export interface SampleMandatePdf {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/**
 * Rend la fiche de mandat d'une entité.
 *
 * 🔴 Il lit par `CreditorReader`, pas par `LegalEntityReader`, et ce choix porte
 * toute la garantie du document. Le premier ne rend qu'une **copie figée** et
 * **refuse** de la rendre pour une entité qui ne peut pas encaisser
 * (`EntityCannotCollectError`, 409, qui nomme ce qui manque). Le second rendrait
 * une vue d'écran, avec un ICS vide que le gabarit imprimerait sans broncher —
 * et une fiche à zone 8 vide est une fiche qu'un client signe pour rien.
 *
 * L'incomplétude est donc **inexprimable ici** plutôt que vérifiée : il n'y a
 * aucune branche à écrire, et aucune à oublier.
 */
@QueryHandler(ExportSampleMandateQuery)
export class ExportSampleMandateHandler implements IQueryHandler<
  ExportSampleMandateQuery,
  SampleMandatePdf
> {
  constructor(private readonly creditors: CreditorReader) {}

  async execute(query: ExportSampleMandateQuery): Promise<SampleMandatePdf> {
    const creditor = await this.creditors.snapshot(query.legalEntityId);
    if (creditor === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    return {
      bytes: await renderSepaMandatePdf(creditor),
      fileName: sampleMandateFileName(creditor),
    };
  }
}
