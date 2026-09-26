import { InvalidLoyaltyHolderError } from "../errors/loyalty-errors.js";

/** La société (pro) ou la personne (particulier). */
export type LoyaltyHolderKind = "company" | "user";

/**
 * **Le titulaire d'un livre de points** — la société pour un pro, la personne
 * pour un particulier (plan D1). Exactement l'un des deux : la base le tient
 * par un `CHECK`, ce type le rend inexprimable autrement.
 */
export class LoyaltyHolder {
  private constructor(
    readonly kind: LoyaltyHolderKind,
    readonly id: string,
  ) {}

  /** @throws {InvalidLoyaltyHolderError} identifiant vide. */
  static of(kind: LoyaltyHolderKind, id: string): LoyaltyHolder {
    if (id.trim() === "") {
      throw new InvalidLoyaltyHolderError();
    }
    return new LoyaltyHolder(kind, id);
  }

  /**
   * Ligne → titulaire. La base garantit qu'une seule des deux colonnes est
   * posée ; si aucune ne l'est, la ligne est corrompue et on le dit.
   */
  static fromColumns(companyId: string | null, userId: string | null): LoyaltyHolder {
    if (companyId !== null) {
      return LoyaltyHolder.of("company", companyId);
    }
    if (userId !== null) {
      return LoyaltyHolder.of("user", userId);
    }
    throw new InvalidLoyaltyHolderError();
  }

  get companyId(): string | null {
    return this.kind === "company" ? this.id : null;
  }

  get userId(): string | null {
    return this.kind === "user" ? this.id : null;
  }

  /**
   * La clé du verrou de livre, préfixée : un identifiant de société et un
   * identifiant de personne ne tombent jamais sur le même verrou (plan D2).
   */
  get lockKey(): string {
    return `${this.kind}:${this.id}`;
  }

  equals(other: LoyaltyHolder): boolean {
    return this.kind === other.kind && this.id === other.id;
  }
}
