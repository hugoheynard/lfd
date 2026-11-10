import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * La plus longue marge admise : une journée. Au-delà, retrancher la marge de
 * n'importe quelle échéance tomberait la veille, que le modèle du jour de
 * service ne représente pas (plan composition automatique, Q1 : la borne
 * basse est minuit du jour livré). Tenue aussi en base par un `CHECK`.
 */
export const MAX_PRODUCTION_MARGIN_MINUTES = 24 * 60;

/** Une marge réglée hors de `[0, une journée]`, ou non entière. */
export class InvalidProductionMarginError extends DomainError {
  constructor(which: "delivery" | "pickup", value: number) {
    const label = which === "delivery" ? "La marge de livraison" : "La marge de retrait";
    super(
      "delivery_availability.invalid_margin",
      `${label} doit être un nombre entier de minutes entre 0 et ` +
        `${String(MAX_PRODUCTION_MARGIN_MINUTES)} (reçu : ${String(value)}). ` +
        "Corrigez la valeur, ou videz le champ pour ne pas régler de marge.",
    );
  }
}

/**
 * Une marge de production telle qu'on l'écrit : `null` (non réglée) ou un
 * entier de minutes dans la journée. Refuse le reste.
 *
 * @throws {InvalidProductionMarginError} hors bornes ou non entière.
 */
export function productionMargin(
  which: "delivery" | "pickup",
  value: number | null,
): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_PRODUCTION_MARGIN_MINUTES) {
    throw new InvalidProductionMarginError(which, value);
  }
  return value;
}
