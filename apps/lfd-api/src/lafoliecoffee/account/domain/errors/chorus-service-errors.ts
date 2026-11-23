import { CHORUS_SERVICE_ERRORS } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Une fiche du service Chorus mal formée : numéro ou code trop long ou non
 * imprimable, numéro sans date de fin, date de fin sans numéro, jour impossible.
 */
export class InvalidChorusServiceError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(CHORUS_SERVICE_ERRORS.invalid, `Fiche du service Chorus — ${field} : ${reason}`);
  }
}

/** La société est facturée à un payeur qui n'est pas un organisme public. */
export class ChorusServicePayerNotPublicError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly payerCompanyId: string,
  ) {
    super(
      CHORUS_SERVICE_ERRORS.payerNotPublic,
      companyId === payerCompanyId
        ? "Ce compte n'est pas un organisme public : il n'a ni code service ni engagement Chorus. Choisissez d'abord une forme juridique publique dans l'identité légale."
        : "Ce compte est facturé à un principal qui n'est pas un organisme public : il n'a ni code service ni engagement Chorus. Vérifiez le principal dont il suit la facturation.",
    );
  }
}

/**
 * Un code service posé sur une société qui est son propre payeur : son code
 * par défaut est celui de sa fiche Chorus Pro, et il n'y en a pas deux.
 */
export class ChorusServiceCodeOnSolePayerError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      CHORUS_SERVICE_ERRORS.serviceCodeOnSolePayer,
      "Ce compte est son propre payeur : son code service se saisit dans sa fiche Chorus Pro. Laissez le code service vide ici, ou corrigez la fiche Chorus Pro.",
    );
  }
}
