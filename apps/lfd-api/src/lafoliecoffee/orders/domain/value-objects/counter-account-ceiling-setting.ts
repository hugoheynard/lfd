import { InvalidCounterAccountCeilingError } from "../errors/counter-account-ceiling-setting.error.js";

/**
 * **Le réglage du plafond des comptes ouverts au comptoir** (§ 3.3), tel
 * qu'un geste le pose : le montant en centimes TTC ou `null` (aucun
 * plafond), l'instant et l'auteur — la trace de qui a réglé.
 */
export class CounterAccountCeilingSetting {
  private constructor(
    readonly ceilingCents: number | null,
    readonly updatedAt: Date,
    readonly updatedByStaffId: string,
  ) {}

  /** @throws {InvalidCounterAccountCeilingError} un montant négatif ou non entier. */
  static pose(
    ceilingCents: number | null,
    at: Date,
    staffUserId: string,
  ): CounterAccountCeilingSetting {
    if (ceilingCents !== null && (!Number.isSafeInteger(ceilingCents) || ceilingCents < 0)) {
      throw new InvalidCounterAccountCeilingError(ceilingCents);
    }
    return new CounterAccountCeilingSetting(ceilingCents, at, staffUserId);
  }
}
