import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La raison d'un blocage du prélèvement est mal formée (400) : vide, ou trop
 * longue pour être relue d'un coup d'œil par l'agent suivant.
 */
export class InvalidDirectDebitBlockReasonError extends DomainError {
  constructor(reason: string) {
    super("account.direct_debit.invalid_reason", `Raison du blocage du prélèvement : ${reason}`);
  }
}

/**
 * Le prélèvement de cette société est **déjà** bloqué (409). Bloquer deux fois
 * écraserait la raison et l'auteur du premier blocage — la trace qu'on relira.
 */
export class DirectDebitAlreadyBlockedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.direct_debit.already_blocked",
      "Le prélèvement de ce client est déjà bloqué. Débloquez-le d'abord pour changer la raison.",
    );
  }
}

/**
 * Aucun crédit n'est accordé à cette société (409) : elle paie déjà par carte à
 * chaque commande, il n'y a pas de prélèvement à bloquer.
 */
export class NoDirectDebitToBlockError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.direct_debit.nothing_to_block",
      "Ce client paie déjà par carte : aucun prélèvement mensuel ne lui est accordé. Accordez d'abord le mensuel depuis sa fiche si c'est ce que vous cherchez.",
    );
  }
}

/** Le prélèvement de cette société n'est pas bloqué (409) : rien à débloquer. */
export class DirectDebitNotBlockedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.direct_debit.not_blocked",
      "Le prélèvement de ce client n'est pas bloqué : il n'y a rien à débloquer.",
    );
  }
}
