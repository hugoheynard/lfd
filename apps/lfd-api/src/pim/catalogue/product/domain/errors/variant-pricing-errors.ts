import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/** Un prix ou un poids qui n'a pas de sens : négatif, fractionnaire, infini. */
export class InvalidVariantPricingError extends DomainError {
  constructor(field: string, received: number) {
    super(
      "catalogue.variant.invalid_pricing",
      `Valeur impossible pour « ${field} » (${String(received)}) : ` +
        `attendu un entier positif ou nul.`,
    );
  }
}

/**
 * Un prix au kilo à zéro (`saisir-un-prix.md`) : il s'afficherait
 * « 0,00 € / kg ». Pour ne rien afficher, on laisse le champ vide.
 */
export class ZeroPricePerKgError extends DomainError {
  constructor(field: string) {
    super(
      "catalogue.variant.zero_price_per_kg",
      `Le prix au kilo « ${field} » ne peut pas valoir zéro : ` +
        `saisissez un montant, ou laissez le champ vide pour ne rien afficher.`,
    );
  }
}

/**
 * Un prix pro HT saisi que la fiche ne peut pas ranger : plus de cinq
 * décimales, négatif, ou hors de la colonne (lot P du plan
 * `plan-catalogue-synchronise-par-audience.md`).
 */
export class InvalidProPriceError extends DomainError {
  constructor(received: string, expected: string) {
    super(
      "catalogue.variant.invalid_pro_price",
      `Prix pro HT impossible (« ${received} ») : attendu ${expected}. ` +
        `Corriger le montant dans la section « Tarif » de la déclinaison.`,
    );
  }
}
