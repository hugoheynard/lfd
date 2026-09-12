import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { NoIssuerError } from "../../../accounting/domain/errors/accounting-errors.js";
import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { LegalEntityLogoReader } from "../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { renderSepaMandatePdf } from "../../../accounting/domain/services/sepa-mandate-pdf.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { CompanyBankAccountNotFoundError } from "../../domain/errors/mandate-errors.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
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
    private readonly creditors: CreditorReader,
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
  ) {}

  async execute({ companyId }: PreviewCustomerMandateQuery): Promise<CustomerMandatePdf> {
    const account = await this.accounts.findByCompany(companyId);
    if (account === null) {
      throw new CompanyBankAccountNotFoundError(companyId);
    }

    const creditor = await this.creditors.soleIssuer();
    if (creditor === null) {
      throw new NoIssuerError();
    }

    const logoKey = await this.logos.logoKeyOf(creditor.legalEntityId);
    const logo = logoKey === null ? null : await this.store.readIfPresent(logoKey);

    const { holder, address, iban, bic } = account.account;
    const options = account.options;
    const bytes = await renderSepaMandatePdf(creditor, logo, {
      holder,
      addressLine1: address.line1,
      addressLine2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      countryCode: address.countryCode,
      iban: iban.value,
      bic: bic.value,
      debtorReference: options.debtorReference,
      contractNumber: options.contractNumber,
      contractDescription: options.contractDescription,
    });

    return { bytes, fileName: previewFileName(holder) };
  }
}

/**
 * Le nom proposé au navigateur — lisible sur un bureau.
 *
 * 🔴 Il porte « apercu » en toutes lettres. Un fichier nommé
 * `mandat-sepa-refuge-du-col.pdf` qui traîne dans un dossier de
 * téléchargements est un fichier qu'on rouvre un mois plus tard en le prenant
 * pour le vrai — la mention en travers de la page ne se voit pas dans une liste
 * de fichiers.
 */
function previewFileName(holder: string): string {
  const slug = holder
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  return `apercu-mandat-sepa-${slug}.pdf`;
}
