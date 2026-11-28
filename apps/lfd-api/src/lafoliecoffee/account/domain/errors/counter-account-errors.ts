import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un compte ouvert au comptoir sans numéro joignable : l'agent ne pourrait
 * rappeler personne pour régler ce que le compte doit
 * (`plan-comptes-du-comptoir.md`, § 3.1).
 */
export class CounterAccountUnreachableError extends DomainError {
  constructor() {
    super(
      "account.counter_account.unreachable",
      "Un compte ouvert au comptoir demande le téléphone du contact : sans lui, personne ne peut être rappelé pour régler le compte.",
    );
  }
}

/**
 * Un compte ouvert au comptoir n'a pas de membre : le client n'a pas d'espace
 * avant que le commerce l'ait converti.
 */
export class CounterAccountHasNoMembersError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.counter_account.no_members",
      "Ce compte a été ouvert au comptoir et n'est pas encore converti : convertissez-le depuis sa fiche avant d'ouvrir un accès au client.",
    );
  }
}

/**
 * La conversion d'un compte du comptoir attend ce qui rend son encours
 * facturable. `missing` nomme les pièces, dans les mots de l'activation.
 */
export class CounterAccountConversionBlockedError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly missing: readonly string[],
  ) {
    super(
      "account.counter_account.conversion_blocked",
      "Pour convertir ce compte du comptoir, renseignez d'abord sa raison sociale, sa forme juridique, son SIRET et son adresse de facturation : sans eux, ce qu'il doit ne peut pas être facturé.",
    );
  }
}
