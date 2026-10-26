import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/** Pourquoi le RIB de l'essai ne part pas à la banque. Une VALEUR : stable. */
export type TestBankAccountRefusal = "no_bic" | "not_debited";

const WORDING: Readonly<Record<TestBankAccountRefusal, string>> = {
  no_bic:
    "son RIB n'a pas de BIC, et la banque refuse un compte sans BIC. Compléter le BIC depuis la fiche de la société.",
  not_debited:
    "son RIB n'est pas parmi les comptes que l'entité débite (mandat repris d'un autre créancier, ou RIB changé depuis la lecture). Vérifier le mandat et son RIB depuis la fiche de la société.",
};

/**
 * Le RIB de l'établissement ne peut pas partir dans le fichier des comptes
 * destinataires de l'essai. Ne porte aucun IBAN : le message part au client
 * HTTP tel quel.
 */
export class CollectionTestBankAccountNotExportableError extends BusinessError {
  constructor(
    readonly companyName: string,
    readonly mandateReference: string,
    readonly refusal: TestBankAccountRefusal,
  ) {
    super(
      "accounting.collection_test.bank_account_not_exportable",
      `Le RIB de « ${companyName} » (mandat ${mandateReference}) ne peut pas partir dans le fichier de la banque : ${WORDING[refusal]}`,
    );
  }
}
