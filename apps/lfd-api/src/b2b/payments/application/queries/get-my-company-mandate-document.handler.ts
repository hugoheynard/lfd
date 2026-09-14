import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { LegalEntityLogoReader } from "../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { MandateDocumentNotFoundError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { buildCustomerMandate } from "../customer-mandate-support.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { GetMyCompanyMandateDocumentQuery } from "./get-my-company-mandate-document.query.js";
import type { CustomerMandatePdf } from "./preview-customer-mandate.handler.js";

/**
 * Rend au client **son mandat à signer** — composé par la même fonction que
 * l'aperçu staff et la pièce jointe du courriel, pour que les trois soient le
 * même document.
 *
 * ## 🔴 Jamais l'exemplaire
 *
 * `buildCustomerMandate` rend l'exemplaire filigrané quand aucun brouillon
 * n'existe. Ce document-là n'a rien à faire chez un client, qui le signerait
 * sans RUM. Deux verrous, parce qu'une course entre les deux lectures est
 * possible (un commercial révoque pendant le téléchargement) :
 *
 * 1. pas de brouillon → 404, avant de composer ;
 * 2. document composé sans RUM → 404 quand même, plutôt que de le servir.
 */
@QueryHandler(GetMyCompanyMandateDocumentQuery)
export class GetMyCompanyMandateDocumentHandler implements IQueryHandler<
  GetMyCompanyMandateDocumentQuery,
  CustomerMandatePdf
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly mandates: PaymentMandateRepository,
    private readonly creditors: CreditorReader,
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
  ) {}

  async execute(query: GetMyCompanyMandateDocumentQuery): Promise<CustomerMandatePdf> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      query.actorUserId,
      query.companyId,
    );

    if ((await this.mandates.findDraft(query.companyId)) === null) {
      throw new MandateDocumentNotFoundError(query.companyId);
    }
    const document = await buildCustomerMandate(
      {
        accounts: this.accounts,
        mandates: this.mandates,
        creditors: this.creditors,
        logos: this.logos,
        store: this.store,
      },
      query.companyId,
    );
    if (!document.issued) {
      throw new MandateDocumentNotFoundError(query.companyId);
    }
    return { bytes: document.bytes, fileName: document.fileName };
  }
}
