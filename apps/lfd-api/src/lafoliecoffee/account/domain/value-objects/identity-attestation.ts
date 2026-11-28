import { InvalidOpeningAuthorError } from "../errors/account-errors.js";

/** La trace telle que rangée en base. */
export interface IdentityAttestationRecord {
  readonly identitySeen: boolean;
  readonly attestedByStaffId: string;
  readonly attestedAt: Date;
}

/**
 * **« J'ai vu une preuve d'identité »** (`plan-comptes-du-comptoir.md`,
 * § 3.5) — la case de l'ouverture d'un compte au comptoir, l'agent qui
 * l'atteste et l'instant. Non bloquante : cochée ou non, le compte s'ouvre.
 *
 * Rien de la pièce elle-même — ni type, ni numéro, ni image : la forme ne
 * peut pas les porter. Cocher engage l'agent ; la trace ne se réécrit pas
 * (append-only en base).
 */
export class IdentityAttestation {
  private constructor(
    readonly identitySeen: boolean,
    readonly attestedByStaffId: string,
    readonly attestedAt: Date,
  ) {}

  /**
   * L'agent atteste avoir vu (`identitySeen`) ou non une pièce d'identité.
   *
   * @throws {InvalidOpeningAuthorError} l'attestation n'a pas d'auteur.
   */
  static attest(identitySeen: boolean, staffUserId: string, at: Date): IdentityAttestation {
    const author = staffUserId.trim();
    if (author === "") {
      throw new InvalidOpeningAuthorError();
    }
    return new IdentityAttestation(identitySeen, author, at);
  }

  /** Les trois valeurs à ranger, pour l'adaptateur. */
  toRecord(): IdentityAttestationRecord {
    return {
      identitySeen: this.identitySeen,
      attestedByStaffId: this.attestedByStaffId,
      attestedAt: this.attestedAt,
    };
  }
}
