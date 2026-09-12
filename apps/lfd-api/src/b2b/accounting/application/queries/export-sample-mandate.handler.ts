import type { Buffer } from "node:buffer";

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { LegalEntityLogoReader } from "../../domain/ports/legal-entity-logo.reader.js";
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
 *
 * ## Le logo, lui, a le droit de manquer
 *
 * Il ne conditionne rien : une entité sans logo rend un mandat **valide**, dont
 * la cellule d'en-tête reste vide. C'est toute la différence avec l'ICS — l'un
 * est décoratif, l'autre est ce que le débiteur oppose à sa banque. D'où
 * `readIfPresent` : l'absence est une réponse, et une panne du stockage reste
 * une panne qui lève, plutôt qu'un mandat silencieusement dégradé.
 */
@QueryHandler(ExportSampleMandateQuery)
export class ExportSampleMandateHandler implements IQueryHandler<
  ExportSampleMandateQuery,
  SampleMandatePdf
> {
  constructor(
    private readonly creditors: CreditorReader,
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
  ) {}

  async execute(query: ExportSampleMandateQuery): Promise<SampleMandatePdf> {
    const creditor = await this.creditors.snapshot(query.legalEntityId);
    if (creditor === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const logoKey = await this.logos.logoKeyOf(query.legalEntityId);
    const logo = logoKey === null ? null : await this.store.readIfPresent(logoKey);
    return {
      bytes: await renderSepaMandatePdf(creditor, logo),
      fileName: sampleMandateFileName(creditor),
    };
  }
}
