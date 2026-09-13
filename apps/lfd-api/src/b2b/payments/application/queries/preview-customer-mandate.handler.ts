import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { LegalEntityLogoReader } from "../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { buildCustomerMandate } from "../customer-mandate-support.js";
import { PreviewCustomerMandateQuery } from "./preview-customer-mandate.query.js";

/** Le fichier et le nom qu'on propose au navigateur. */
export interface CustomerMandatePdf {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/**
 * Rend le mandat d'un client, les deux côtés remplis.
 *
 * ## Pourquoi ce handler vit dans `payments` et pas dans `accounting`
 *
 * Le document est celui d'`accounting` — c'est lui qui dessine le formulaire et
 * qui détient l'émetteur. Mais ce rendu-ci a besoin du **RIB du client**, qui
 * est un agrégat de `payments`, et le faire remonter à `accounting` demanderait
 * un port de plus pour un seul lecteur. On importe donc le dessin et le port de
 * lecture de l'émetteur, sans jamais toucher à son agrégat : `CreditorReader`
 * ne rend qu'une copie figée, `renderSepaMandatePdf` est une fonction pure.
 *
 * ## Ce qui est REFUSÉ, et ce qui ne l'est pas
 *
 * - pas de RIB ⇒ refus nommé. Une prévisualisation à zones 5 et 6 vides est
 *   exactement le mandat d'exemple, qui existe déjà ailleurs ;
 * - pas d'entité émettrice, ou plusieurs ⇒ refus, levé par le lecteur ;
 * - entité incomplète (sans ICS) ⇒ refus, levé par l'agrégat.
 *
 * Le **logo**, lui, a le droit de manquer : il ne conditionne rien, et une
 * cellule d'en-tête vide reste un document valide.
 */
@QueryHandler(PreviewCustomerMandateQuery)
export class PreviewCustomerMandateHandler implements IQueryHandler<
  PreviewCustomerMandateQuery,
  CustomerMandatePdf
> {
  constructor(
    private readonly accounts: CompanyBankAccountRepository,
    private readonly mandates: PaymentMandateRepository,
    private readonly creditors: CreditorReader,
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
  ) {}

  async execute({ companyId }: PreviewCustomerMandateQuery): Promise<CustomerMandatePdf> {
    const document = await buildCustomerMandate(
      {
        accounts: this.accounts,
        mandates: this.mandates,
        creditors: this.creditors,
        logos: this.logos,
        store: this.store,
      },
      companyId,
    );
    return { bytes: document.bytes, fileName: document.fileName };
  }
}
