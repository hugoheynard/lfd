import { InvalidInvoicePaymentTermsError } from "../errors/invoice-issuance-errors.js";

/**
 * Le taux des pénalités de retard, en **points de base** (1 pb = 0,01 %).
 *
 * Des points de base et non un pourcentage décimal : le taux légal se dit
 * « taux BCE + 10 points », le taux BCE se publie au centième (4,15 %), et un
 * entier en points de base le porte sans flottant — 14,15 % = 1415 pb. Au
 * plus 100 % : au-delà, c'est une faute de saisie (un taux tapé en points de
 * base là où l'on pensait en pourcents), pas une clause.
 */
export const LATE_PENALTY_RATE_MIN_BASIS_POINTS = 1;
export const LATE_PENALTY_RATE_MAX_BASIS_POINTS = 10_000;

/**
 * La suggestion d'écran (Q4, Hugo, 2026-10-08) : les points ajoutés au taux
 * BCE par le taux légal par défaut (L441-10, cité de mémoire — le cabinet
 * tranche). Le taux BCE varie : il n'est PAS codé ici, l'écran le fait saisir.
 */
export const LEGAL_PENALTY_MARGIN_BASIS_POINTS = 1_000;

/**
 * L'indemnité forfaitaire pour frais de recouvrement, en centimes.
 *
 * Plancher à 40 € (D441-5, de mémoire) : c'est le montant fixé par le texte,
 * et le refuser en dessous attrape surtout une confusion d'unité — « 40 »
 * tapé en centimes ferait imprimer 0,40 € sur une facture.
 */
export const RECOVERY_INDEMNITY_MIN_CENTS = 4_000;
export const RECOVERY_INDEMNITY_MAX_CENTS = 100_000;

/** L'escompte s'imprime sur une ligne de mentions : une phrase, pas un paragraphe. */
export const EARLY_PAYMENT_DISCOUNT_MAX_LENGTH = 200;

export interface InvoicePaymentTermsInput {
  readonly latePenaltyRateBasisPoints: number | null;
  readonly recoveryIndemnityCents: number | null;
  readonly earlyPaymentDiscount: string | null;
}

/**
 * **Les mentions de paiement d'une facture** : pénalités de retard, indemnité
 * forfaitaire de recouvrement, escompte pour paiement anticipé.
 *
 * Chacune est nullable, et `null` veut dire « à renseigner » — jamais une
 * valeur posée d'office. Le taux légal est une SUGGESTION d'écran (Q4) ; le
 * poser en base sans que personne l'ait décidé imprimerait sur des factures un
 * taux que l'entreprise n'a pas choisi. L'absence d'une mention empêche
 * d'émettre (`invoiceIssuanceBlockers`), elle n'est pas comblée.
 */
export class InvoicePaymentTerms {
  private constructor(
    readonly latePenaltyRateBasisPoints: number | null,
    readonly recoveryIndemnityCents: number | null,
    readonly earlyPaymentDiscount: string | null,
  ) {}

  /** Rien de renseigné — l'état d'une entité déclarée. */
  static empty(): InvoicePaymentTerms {
    return new InvoicePaymentTerms(null, null, null);
  }

  /**
   * @throws {InvalidInvoicePaymentTermsError} une valeur hors de ses bornes.
   */
  static create(input: InvoicePaymentTermsInput): InvoicePaymentTerms {
    return new InvoicePaymentTerms(
      boundedInteger(
        input.latePenaltyRateBasisPoints,
        "Taux des pénalités de retard",
        LATE_PENALTY_RATE_MIN_BASIS_POINTS,
        LATE_PENALTY_RATE_MAX_BASIS_POINTS,
        "en points de base (1 % = 100)",
      ),
      boundedInteger(
        input.recoveryIndemnityCents,
        "Indemnité forfaitaire de recouvrement",
        RECOVERY_INDEMNITY_MIN_CENTS,
        RECOVERY_INDEMNITY_MAX_CENTS,
        "en centimes (40 € = 4000)",
      ),
      discountText(input.earlyPaymentDiscount),
    );
  }

  /** Les mentions encore à renseigner, nommées pour du personnel. */
  missing(): readonly string[] {
    const missing: string[] = [];
    if (this.latePenaltyRateBasisPoints === null) {
      missing.push("le taux des pénalités de retard");
    }
    if (this.recoveryIndemnityCents === null) {
      missing.push("l'indemnité forfaitaire de recouvrement");
    }
    if (this.earlyPaymentDiscount === null) {
      missing.push("les conditions d'escompte pour paiement anticipé");
    }
    return missing;
  }

  equals(other: InvoicePaymentTerms): boolean {
    return (
      this.latePenaltyRateBasisPoints === other.latePenaltyRateBasisPoints &&
      this.recoveryIndemnityCents === other.recoveryIndemnityCents &&
      this.earlyPaymentDiscount === other.earlyPaymentDiscount
    );
  }
}

function boundedInteger(
  value: number | null,
  field: string,
  min: number,
  max: number,
  unit: string,
): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new InvalidInvoicePaymentTermsError(
      field,
      `entier entre ${String(min)} et ${String(max)} attendu, ${unit} — reçu ${String(value)}`,
    );
  }
  return value;
}

/** Un texte vide redevient « à renseigner » : on n'imprime pas une mention blanche. */
function discountText(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed.length > EARLY_PAYMENT_DISCOUNT_MAX_LENGTH) {
    throw new InvalidInvoicePaymentTermsError(
      "Escompte pour paiement anticipé",
      `au plus ${String(EARLY_PAYMENT_DISCOUNT_MAX_LENGTH)} caractères — une ligne de mentions`,
    );
  }
  return trimmed;
}
