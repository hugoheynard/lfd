import { InvalidLegalEntityError } from "../errors/accounting-errors.js";
import { Bic } from "./bic.js";
import { Iban } from "./iban.js";
import { LegalAddress } from "./legal-address.js";

/** Ce qu'on recopie d'un RIB, avant validation. */
export interface CreditorAccountInput {
  readonly holder: string;
  readonly address: LegalAddress;
  readonly iban: Iban;
  readonly bic: Bic;
}

/**
 * **Le compte créancier — la recopie du RIB**, titulaire et adresse compris.
 *
 * ## Pourquoi il redouble l'identité légale, et pourquoi ce n'est pas un doublon
 *
 * Le titulaire et l'adresse figurent déjà sur l'entité. Les reprendre ici est
 * **délibéré** (2026-09-12) : ce ne sont pas les deux mêmes faits.
 *
 * - L'identité légale est ce que **le registre** sait — raison sociale, siège,
 *   RCS. Elle change quand on dépose un acte.
 * - Le bloc de ce compte est ce que **la banque** sait, tel qu'il est imprimé
 *   sur le RIB. Il change quand on change de banque, ou quand l'agence a
 *   enregistré une autre adresse.
 *
 * Les deux peuvent diverger sans que personne se trompe, et c'est **le second**
 * que la banque compare au moment du prélèvement. Recopier le premier à la place
 * ferait un mandat que le débiteur ne reconnaît pas sur son relevé.
 *
 * ## Tout ou rien
 *
 * L'objet n'existe pas à moitié, et c'est sa raison d'être : un compte sans BIC
 * ou sans titulaire ne se découvrirait qu'au rejet du lot, cinq jours après
 * l'envoi. Avant, l'IBAN vivait seul dans sa colonne et rien n'empêchait cet
 * état — la garde était à écrire, elle est maintenant **inexprimable**.
 *
 * ⚠️ L'`iban` n'est pas rendu par une API de lecture ; le reste l'est. Le BIC
 * désigne un établissement, le titulaire et l'adresse sont sur chaque mandat
 * qu'on fait signer — aucun des trois n'est un secret.
 */
export class CreditorAccount {
  private constructor(
    readonly holder: string,
    readonly address: LegalAddress,
    readonly iban: Iban,
    readonly bic: Bic,
  ) {}

  static create(input: CreditorAccountInput): CreditorAccount {
    const holder = input.holder.trim();
    if (holder === "") {
      throw new InvalidLegalEntityError(
        "Titulaire du compte",
        "obligatoire — c'est le nom que la banque oppose au débiteur",
      );
    }
    return new CreditorAccount(holder, input.address, input.iban, input.bic);
  }

  /** Les quatre derniers caractères de l'IBAN — de quoi reconnaître, pas débiter. */
  last4(): string {
    return this.iban.last4();
  }

  /**
   * Les deux comptes nomment-ils le **même créancier** — titulaire et adresse ?
   *
   * 🔴 L'IBAN et le BIC sont délibérément hors de la comparaison. Un mandat SEPA
   * imprime le titulaire, son adresse et l'ICS ; il n'imprime **pas** l'IBAN du
   * créancier. Changer de banque ne contredit donc aucune signature, alors que
   * changer de nom ou d'adresse dit au débiteur qu'il a autorisé quelqu'un
   * d'autre.
   *
   * C'est cette asymétrie que {@link LegalEntity.setCreditorAccount} fait
   * respecter une fois le premier mandat frappé.
   */
  sameIdentityAs(other: CreditorAccount): boolean {
    return this.holder === other.holder && this.address.toString() === other.address.toString();
  }
}
