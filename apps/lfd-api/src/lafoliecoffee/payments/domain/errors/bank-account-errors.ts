import {
  AuthorizationError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * La société visée n'existe pas **pour ce demandeur** : il n'y est pas
 * rattaché. **404**, pas 403 — on ne dit pas à un curieux qu'une société
 * existe et qu'elle a un RIB.
 */
export class BankAccountCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "payments.bank_account.company_not_found",
      "Société introuvable, ou vous n'y êtes pas rattaché.",
    );
  }
}

/**
 * Le demandeur est membre de la société, mais son rôle ne lui ouvre ni le RIB,
 * ni le mandat (le même mur les garde depuis le 2026-09-14).
 *
 * **403** : il sait que la société existe, il en est. Le message nomme les deux
 * rôles qui passent et le geste de sortie, parce qu'il est lu par quelqu'un qui
 * ne sait pas quel rôle il a — seulement que l'écran lui refuse.
 */
export class BankAccountRoleRequiredError extends AuthorizationError {
  constructor(readonly companyId: string) {
    super(
      "payments.bank_account.role_required",
      "Le RIB et le mandat de prélèvement de la société ne sont accessibles qu'à son détenteur, à son administrateur et au rôle « facturation ». " +
        "Demandez au détenteur de vous attribuer ce rôle.",
    );
  }
}

/**
 * On règle les zones 14 et 19 du mandat d'une société **sans RIB** — **404**.
 *
 * Les zones vivent sur la ligne du RIB : en créer une sans compte ferait
 * exister un « côté client du mandat » sans le compte à débiter. Lu par le
 * staff comme par le client, d'où « cette société » plutôt que « ce client » ou
 * « votre ».
 *
 * 🔴 Le code reste `payments.bank_account.missing`, celui que la route staff
 * rendait déjà sous `CompanyBankAccountNotFoundError` : seule la phrase change,
 * pas le contrat.
 */
export class MandateOptionsWithoutBankAccountError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "payments.bank_account.missing",
      "Aucun RIB n'est enregistré pour cette société : enregistrez d'abord ses coordonnées bancaires, puis renseignez les références du mandat, qui sont conservées avec elles.",
    );
  }
}

/** Pourquoi une forme juridique de titulaire est refusée à l'écriture. */
export type HolderLegalFormRefusal = "holds_holder_name" | "too_long";

/**
 * La case « Civilité / forme juridique » du RIB porte autre chose qu'une forme
 * — **400**.
 *
 * Constaté le 2026-10-12 : la commerciale y tapait « Col Pers SAS » au lieu de
 * « SAS », et le mandat imprimait le nom du titulaire deux fois, dont une fois
 * tronqué dans une case de quelques caractères. Le message nomme les deux
 * champs et ce qui va dans chacun, parce qu'il est lu devant l'écran de saisie.
 *
 * 🔴 Comme `InvalidDebtorAccountError`, il ne recopie jamais la saisie refusée.
 */
export class HolderLegalFormNotALegalFormError extends DomainError {
  constructor(readonly refusal: HolderLegalFormRefusal) {
    super(
      `payments.bank_account.holder_legal_form_${refusal}`,
      refusal === "holds_holder_name"
        ? "La forme juridique ne doit pas contenir le nom du titulaire : mettez « SAS » ici et « Col Pers » dans Titulaire."
        : "Une forme saisie en « Autre » tient en 12 caractères au plus : choisissez-la dans la liste si elle y est, et mettez le nom dans Titulaire.",
    );
  }
}
