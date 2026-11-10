import type { CreditorSnapshot } from "../../domain/creditor-snapshot.js";
import type { DebtorSnapshot } from "../../domain/debtor-snapshot.js";

/**
 * **Les données d'exemple du mandat SEPA** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées**, et aucun mandat n'est frappé : sans
 * émission, le rendu n'imprime aucune RUM et pose le filigrane EXEMPLE — le
 * même paramètre commande les deux (`sepa-mandate-pdf.ts`).
 *
 * Créancier et débiteur sont fictifs et le disent ; leurs numéros
 * n'appartiennent à personne (`999…`), l'ICS et les IBAN non plus.
 *
 * Distinct de l'exemplaire d'une entité (`ExportSampleMandateHandler`), qui
 * imprime les réglages d'une entité RÉELLE : la planche, elle, montre les deux
 * mises en page sans dépendre d'aucune fiche.
 */

export const SPECIMEN_CREDITOR: CreditorSnapshot = {
  legalEntityId: "specimen-legal-entity",
  name: "EXEMPLE — La Folie Coffee",
  legalForm: "SAS",
  siren: "999999999",
  vatNumber: "FR00999999999",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["EXEMPLE — route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ999999",
  creditorIban: "FR7699999999999999999999999",
  creditorBic: "EXEMFRPP",
  accountHolder: "EXEMPLE LA FOLIE COFFEE",
  accountAddressLines: ["EXEMPLE — route de la Balme", "73150 Val d'Isère", "FR"],
  preNotificationDays: 14,
  collectionDaysAfterClosure: null,
  mandateContractDescription: "EXEMPLE — fourniture de pains et de viennoiseries",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

export const SPECIMEN_DEBTOR: DebtorSnapshot = {
  companyName: "EXEMPLE — SAS des Trois Ponts",
  siren: "999999999",
  holder: "EXEMPLE SAS DES TROIS PONTS",
  holderLegalForm: "SAS",
  addressLine1: "EXEMPLE — 1 rue des Trois Ponts",
  addressLine2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
  iban: "FR7699999999999999999999998",
  bic: "EXEMFRPP",
  debtorReference: "C-EXEMPLE",
  contractNumber: "EXEMPLE-0001",
};
