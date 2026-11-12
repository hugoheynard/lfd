import { InvalidLegalEntityError } from "../errors/accounting-errors.js";
import {
  CreditorAccountIbanMismatchError,
  CreditorAccountSelfConfirmationError,
  PendingCreditorAccountGoneError,
} from "../errors/creditor-account-review-errors.js";
import type { CreditorAccount } from "./creditor-account.js";
import type { Iban } from "./iban.js";

/** Qui propose, quand, et sous quel identifiant — fourni par l'application. */
export interface CreditorAccountProposal {
  readonly id: string;
  /** L'id de la FICHE staff de l'auteur — jamais l'identifiant de connexion. */
  readonly staffId: string;
  readonly at: Date;
}

/**
 * **Un compte créancier proposé, en attente de sa confirmation.**
 *
 * Le compte de l'entité est imprimé sur les factures comme le compte à payer :
 * c'est la cible de la fraude au faux changement de RIB. Une fois un compte
 * confirmé, toute modification (IBAN, BIC, titulaire, adresse) attend ici
 * qu'un AUTRE membre de la comptabilité la confirme en ressaisissant l'IBAN
 * depuis le RIB de la banque (plan `plan-paiement-au-compte-par-virement.md`,
 * T0). Tant qu'elle attend, rien ne la lit : ni facture, ni lot, ni mandat.
 */
export class PendingCreditorAccount {
  private constructor(
    readonly id: string,
    readonly account: CreditorAccount,
    readonly proposedByStaffId: string,
    readonly proposedAt: Date,
  ) {}

  /** @throws {InvalidLegalEntityError} identifiant ou auteur vide. */
  static propose(
    account: CreditorAccount,
    proposal: CreditorAccountProposal,
  ): PendingCreditorAccount {
    return new PendingCreditorAccount(
      requireText(proposal.id, "Identifiant de la saisie en attente"),
      account,
      requireText(proposal.staffId, "Auteur de la saisie en attente"),
      proposal.at,
    );
  }

  /** Les quatre derniers caractères de l'IBAN proposé — de quoi reconnaître, pas débiter. */
  last4(): string {
    return this.account.last4();
  }

  /**
   * Juge une confirmation, dans l'ordre où un refus se lit : la saisie
   * désignée attend-elle encore, le confirmateur n'en est-il pas l'auteur,
   * l'IBAN ressaisi est-il le même.
   *
   * @throws {PendingCreditorAccountGoneError} `pendingId` n'est pas cette saisie.
   * @throws {CreditorAccountSelfConfirmationError} le confirmateur est l'auteur.
   * @throws {CreditorAccountIbanMismatchError} l'IBAN ressaisi diffère.
   */
  assertConfirmableBy(pendingId: string, retypedIban: Iban, confirmerStaffId: string): void {
    this.assertDesignatedBy(pendingId);
    if (confirmerStaffId === this.proposedByStaffId) {
      throw new CreditorAccountSelfConfirmationError();
    }
    if (retypedIban.value !== this.account.iban.value) {
      throw new CreditorAccountIbanMismatchError();
    }
  }

  /** @throws {PendingCreditorAccountGoneError} `pendingId` n'est pas cette saisie. */
  assertDesignatedBy(pendingId: string): void {
    if (pendingId !== this.id) {
      throw new PendingCreditorAccountGoneError(pendingId);
    }
  }
}

function requireText(raw: string, field: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new InvalidLegalEntityError(field, "obligatoire");
  }
  return trimmed;
}
