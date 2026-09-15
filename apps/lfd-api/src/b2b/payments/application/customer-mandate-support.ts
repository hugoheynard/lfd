import type { Buffer } from "node:buffer";

import { NoIssuerError } from "../../accounting/domain/errors/accounting-errors.js";
import type { CreditorReader } from "../../accounting/domain/ports/creditor.reader.js";
import type { LegalEntityLogoReader } from "../../accounting/domain/ports/legal-entity-logo.reader.js";
import { readEntityLogo } from "../../accounting/application/legal-entity-support.js";
import {
  type MandateForm,
  renderSepaMandatePdf,
} from "../../accounting/domain/services/sepa-mandate-pdf.js";
import type { DocumentStore } from "../../../platform/storage/document-store.js";
import {
  CompanyBankAccountNotFoundError,
  CompanyNotFoundForMandateError,
} from "../domain/errors/mandate-errors.js";
import type { CompanyBankAccountRepository } from "../domain/ports/company-bank-account.repository.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";

/**
 * Le mandat d'un client, **composé une seule fois pour deux gestes**.
 *
 * 🔴 Deux appelants : l'écran qui l'affiche, et le courriel qui l'envoie. Ils
 * doivent produire **le même document** — sans quoi on enverrait au client un
 * papier différent de celui qu'on vient de relire avant de cliquer.
 *
 * Ce n'est pas un handler, et c'est délibéré : le §4 de `CLAUDE.md` interdit
 * l'appel croisé entre un handler d'écriture et un handler de lecture. Ils se
 * partagent le domaine ou les ports, pas leurs services — donc le geste commun
 * vit ici, sur le modèle de `cycle-draft-support.ts`.
 */
export interface CustomerMandateDeps {
  readonly accounts: CompanyBankAccountRepository;
  readonly mandates: PaymentMandateRepository;
  readonly creditors: CreditorReader;
  readonly logos: LegalEntityLogoReader;
  readonly store: DocumentStore;
}

export interface CustomerMandateDocument {
  readonly bytes: Buffer;
  readonly fileName: string;
  /** Le mandat est-il FRAPPÉ ? Sinon, c'est l'exemplaire filigrané. */
  readonly issued: boolean;
  /** La RUM imprimée, ou `null` sur un exemplaire vierge. */
  readonly reference: string | null;
  /** L'ICS, que le client déclarera à sa banque avec la RUM. */
  readonly creditorIdentifier: string;
  readonly creditorName: string;
}

/**
 * @throws {CompanyBankAccountNotFoundError} aucun RIB recopié — un mandat à
 *   zones vides est l'exemplaire, qui existe déjà ailleurs.
 * @throws {NoIssuerError} aucune entité émettrice.
 * @throws {CompanyNotFoundForMandateError} la société a disparu entre-temps.
 */
export async function buildCustomerMandate(
  deps: CustomerMandateDeps,
  companyId: string,
): Promise<CustomerMandateDocument> {
  const account = await deps.accounts.findByCompany(companyId);
  if (account === null) {
    throw new CompanyBankAccountNotFoundError(companyId);
  }
  const holder = await deps.mandates.findHolder(companyId);
  if (holder === null) {
    throw new CompanyNotFoundForMandateError(companyId);
  }

  const creditor = await deps.creditors.soleIssuer();
  if (creditor === null) {
    throw new NoIssuerError();
  }

  const logo = await readEntityLogo(deps.logos, deps.store, creditor.legalEntityId);

  // 🔴 Le mandat FRAPPÉ transforme l'exemplaire en document signable : sa RUM
  // s'imprime et le filigrane tombe avec elle. `findAwaitingProof` et non
  // `findCurrent` : c'est le brouillon qu'on imprime pour le faire signer, là où
  // `findCurrent` rendrait l'ancien actif — donc ferait ressigner une
  // autorisation déjà donnée.
  const issued = await deps.mandates.findAwaitingProof(companyId);
  const printable = issued !== null && issued.status === "draft" ? issued : null;
  const reference = printable === null ? null : printable.toSnapshot().reference;

  // 🔴 La forme d'un brouillon est la SIENNE, figée à la frappe (objection 2 du
  // plan `plan-mandat-deux-schemas.md`) : l'entité peut être passée à un autre
  // schéma depuis, et c'est ce brouillon-là que le staff activera. Sans
  // brouillon, l'aperçu montre ce que l'entité frapperait aujourd'hui.
  const form: MandateForm =
    printable === null
      ? { scheme: creditor.mandateScheme, paymentType: creditor.mandatePaymentType }
      : { scheme: printable.toSnapshot().scheme, paymentType: printable.toSnapshot().paymentType };

  const { address, iban, bic } = account.account;
  const bytes = await renderSepaMandatePdf(
    form,
    creditor,
    logo,
    {
      companyName: holder.companyName,
      siren: holder.siren,
      holder: account.account.holder,
      holderLegalForm: account.account.holderLegalForm,
      addressLine1: address.line1,
      addressLine2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      countryCode: address.countryCode,
      iban: iban.value,
      bic: bic.value,
      debtorReference: account.options.debtorReference,
      contractNumber: account.options.contractNumber,
    },
    reference === null ? null : { reference },
  );

  return {
    bytes,
    fileName: mandateFileName(account.account.holder, reference !== null),
    issued: reference !== null,
    reference,
    creditorIdentifier: creditor.ics,
    creditorName: creditor.name,
  };
}

/**
 * Le nom proposé au navigateur — lisible sur un bureau.
 *
 * 🔴 Il porte « apercu » **tant qu'il n'y a pas de RUM**, et le mot disparaît
 * avec le filigrane. Un fichier nommé `mandat-sepa-refuge-du-col.pdf` qui traîne
 * dans un dossier de téléchargements est un fichier qu'on rouvre un mois plus
 * tard en le prenant pour le vrai — la mention en travers de la page ne se voit
 * pas dans une liste de fichiers. Inversement, appeler « aperçu » le document
 * qu'on vient d'envoyer à signer ferait douter de sa valeur au moment de le
 * classer.
 *
 * Les trois marqueurs — filigrane, sous-titre, nom du fichier — tombent
 * ensemble, commandés par la même condition.
 */
function mandateFileName(holder: string, issued: boolean): string {
  const slug = holder
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  return issued ? `mandat-sepa-${slug}.pdf` : `apercu-mandat-sepa-${slug}.pdf`;
}
