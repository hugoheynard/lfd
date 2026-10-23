import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'attestation **« Retours contrôlés »** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, P3). Lus par la
 * comptabilité, sans le code sous les yeux : chacun nomme le jour et le geste
 * de sortie.
 */

/** Un jour mal écrit, ou une note de retrait vide ou trop longue. */
export class InvalidBankReturnCheckError extends DomainError {
  constructor(readonly why: string) {
    super("accounting.bank_return_check.invalid", `Contrôle des retours refusé : ${why}.`);
  }
}

/** Le jour est déjà attesté : une seconde attestation ne dirait rien de plus. */
export class BankReturnCheckAlreadyAttestedError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "accounting.bank_return_check.already_attested",
      `Les retours de la banque du ${day} sont déjà notés comme contrôlés. Si ce contrôle était faux, retirez-le d'abord.`,
    );
  }
}

/** Retirer un jour qui n'est pas attesté : il n'y a rien à retirer. */
export class BankReturnCheckNotAttestedError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "accounting.bank_return_check.not_attested",
      `Aucun contrôle des retours n'est noté pour le ${day} : il n'y a rien à retirer. Rechargez la page, quelqu'un l'a peut-être déjà retiré.`,
    );
  }
}
