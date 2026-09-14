import {
  AuthorizationError,
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
      "Le RIB et le mandat de prélèvement de la société ne sont accessibles qu'à son détenteur et au rôle « facturation ». " +
        "Demandez au détenteur de vous attribuer ce rôle.",
    );
  }
}
