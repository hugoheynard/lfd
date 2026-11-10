import { InvalidBankCollectionLimitError } from "../errors/bank-collection-limits-errors.js";

/** Ce qu'on saisit : trois montants en centimes, chacun `null` = « non renseigné ». */
export interface BankCollectionLimitsInput {
  readonly perDebitCents: number | null;
  readonly perRemittanceCents: number | null;
  readonly monthlyCents: number | null;
}

/**
 * **Les plafonds de la convention d'émission**, pour un schéma SEPA —
 * unitaire (un prélèvement), par remise (un fichier), cumul mensuel
 * (`plan-plafonds-de-la-banque.md`, § 1 et § 6).
 *
 * Chacun est facultatif : `null` dit « non renseigné », rien n'est alors
 * comparé, et l'écran le dit — jamais une valeur inventée.
 *
 * Il refuse un montant non entier ou ≤ 0, et RIEN d'autre. L'ordre
 * unitaire ≤ remise ≤ mensuel n'est PAS un refus (contradiction de vitruve,
 * § 6) : la banque n'a rien dit de cette relation, l'écran en avertit.
 */
export class BankCollectionLimits {
  private constructor(
    readonly perDebitCents: number | null,
    readonly perRemittanceCents: number | null,
    readonly monthlyCents: number | null,
  ) {}

  /** @throws {InvalidBankCollectionLimitError} un montant non entier ou ≤ 0. */
  static create(input: BankCollectionLimitsInput): BankCollectionLimits {
    return new BankCollectionLimits(
      requireLimit("Plafond unitaire", input.perDebitCents),
      requireLimit("Plafond par remise", input.perRemittanceCents),
      requireLimit("Plafond mensuel", input.monthlyCents),
    );
  }

  /** Aucun plafond renseigné — l'état d'une entité qui n'a rien saisi. */
  static empty(): BankCollectionLimits {
    return new BankCollectionLimits(null, null, null);
  }

  get isEmpty(): boolean {
    return (
      this.perDebitCents === null && this.perRemittanceCents === null && this.monthlyCents === null
    );
  }

  equals(other: BankCollectionLimits): boolean {
    return (
      this.perDebitCents === other.perDebitCents &&
      this.perRemittanceCents === other.perRemittanceCents &&
      this.monthlyCents === other.monthlyCents
    );
  }
}

function requireLimit(field: string, cents: number | null): number | null {
  if (cents === null) {
    return null;
  }
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new InvalidBankCollectionLimitError(field, cents);
  }
  return cents;
}
