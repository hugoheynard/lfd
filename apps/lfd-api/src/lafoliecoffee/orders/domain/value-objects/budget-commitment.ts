import { InvalidBudgetCommitmentError } from "../errors/budget-commitment-errors.js";

/** Le numéro d'engagement : 1 à 50 caractères (l'État en a 10, une collectivité d'autres). */
const NUMBER_MAX_LENGTH = 50;
/** Un code service Chorus Pro tient en 100 caractères (la fiche du compte, P1a). */
const SERVICE_CODE_MAX_LENGTH = 100;
/** Imprimable : ni caractère de contrôle, ni saut de ligne. */
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Ce que la passation reçoit : deux textes, vides permis. */
export interface EnteredBudgetCommitment {
  readonly number: string;
  readonly serviceCode: string;
}

/**
 * **L'engagement budgétaire d'une commande** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 quater) : le numéro de son bon de commande (BT-13 de la facture) et le
 * code service Chorus (BT-10). L'un des deux peut manquer, pas les deux.
 *
 * Une forme LARGE, jamais le format de l'État en dur : 1 à 50 caractères
 * imprimables, espaces de tête et de queue retirés à la saisie.
 */
export class BudgetCommitment {
  private constructor(
    readonly number: string,
    readonly serviceCode: string,
  ) {}

  /**
   * Un engagement saisi ; `null` quand les deux champs sont vides.
   *
   * @throws {InvalidBudgetCommitmentError} trop long, ou un caractère non imprimable.
   */
  static entered(input: EnteredBudgetCommitment): BudgetCommitment | null {
    const number = checked(input.number, "numéro d'engagement", NUMBER_MAX_LENGTH);
    const serviceCode = checked(input.serviceCode, "code service", SERVICE_CODE_MAX_LENGTH);
    return number === "" && serviceCode === "" ? null : new BudgetCommitment(number, serviceCode);
  }

  /** Relit deux colonnes rangées ; `null` quand aucune ne porte rien. */
  static stored(number: string | null, serviceCode: string | null): BudgetCommitment | null {
    return BudgetCommitment.entered({ number: number ?? "", serviceCode: serviceCode ?? "" });
  }

  sameAs(other: BudgetCommitment | null): boolean {
    return other !== null && this.number === other.number && this.serviceCode === other.serviceCode;
  }
}

function checked(
  raw: string,
  field: "numéro d'engagement" | "code service",
  maxLength: number,
): string {
  const value = raw.trim();
  if (value.length > maxLength) {
    throw new InvalidBudgetCommitmentError(field, `au plus ${String(maxLength)} caractères`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new InvalidBudgetCommitmentError(field, "un caractère n'est pas imprimable");
  }
  return value;
}
