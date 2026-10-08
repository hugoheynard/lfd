import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Aucun rattachement : un 404 qui ne dit pas si la société existe. */
export class InvoiceCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "accounting.invoice.company_not_found",
      "Société introuvable, ou vous n'y êtes pas rattaché.",
    );
  }
}

/** Membre, mais ni détenteur ni facturation. */
export class InvoiceRoleRequiredError extends AuthorizationError {
  constructor(readonly companyId: string) {
    super(
      "accounting.invoice.role_required",
      "Les factures ne sont visibles que du détenteur du compte et du rôle « facturation ». Demandez au détenteur de vous attribuer ce rôle.",
    );
  }
}

/**
 * La facture n'existe pas — ou, côté client, n'est pas adressée à cette
 * société : le même 404, pour ne rien dire des pièces des autres.
 */
export class InvoiceNotFoundError extends ResourceNotFoundError {
  constructor(readonly invoiceId: string) {
    super(
      "accounting.invoice.not_found",
      `Facture ${invoiceId} introuvable. Rouvrir la liste des factures : celle-ci n'existe pas, ou n'est pas adressée à cette société.`,
    );
  }
}
