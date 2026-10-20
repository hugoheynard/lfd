import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** La société dont on règle les avis n'existe pas. */
export class NoticePrincipalNotFoundError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super(
      "sub_account_notices.company_not_found",
      `Société inconnue : ${companyId}. Rouvrir la fiche client depuis la liste des comptes.`,
    );
  }
}

/**
 * Les avis se règlent sur le PRINCIPAL : c'est lui qu'on prévient de ce que
 * font ses sous-comptes. Une société rattachée à un principal n'a pas de
 * tableau à elle.
 */
export class NotAPrincipalError extends BusinessError {
  constructor(companyId: string, parentCompanyId: string) {
    super(
      "sub_account_notices.not_a_principal",
      `La société ${companyId} est un sous-compte de ${parentCompanyId} : les avis se règlent sur la fiche de son principal, pas sur la sienne.`,
    );
  }
}
