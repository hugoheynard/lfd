import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Aucun rattachement : un 404 qui ne dit pas si la société existe. */
export class UnpaidCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "accounting.unpaid.company_not_found",
      "Société introuvable, ou vous n'y êtes pas rattaché.",
    );
  }
}

/** Membre, mais ni détenteur ni facturation. */
export class UnpaidRoleRequiredError extends AuthorizationError {
  constructor(readonly companyId: string) {
    super(
      "accounting.unpaid.role_required",
      "Les commandes restant à régler ne sont visibles que du détenteur du compte et du rôle « facturation ». Demandez au détenteur de vous attribuer ce rôle.",
    );
  }
}
