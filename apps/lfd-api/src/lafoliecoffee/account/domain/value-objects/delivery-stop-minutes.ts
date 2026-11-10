import { InvalidDeliveryStopMinutesError } from "../errors/account-errors.js";

/** Une minute au moins : zéro dirait « on ne s'arrête pas », ce qui n'est pas une livraison. */
export const DELIVERY_STOP_MINUTES_MIN = 1;
/** Deux heures au plus : au-delà, c'est une installation, plus une livraison. */
export const DELIVERY_STOP_MINUTES_MAX = 120;

/**
 * **Le temps de livraison sur place d'une adresse** (plan de tournée,
 * L7b-C4) — décharger, porter, faire signer. Une fromagerie à procédure en
 * trois étapes ne se livre pas en même temps qu'un café : le calculateur de
 * tournée prend cette valeur pour l'arrêt, sinon son réglage global.
 *
 * Absent (`null` ou non saisi) est un état légitime : l'adresse suit le
 * réglage. Rend la valeur à écrire.
 *
 * @throws {InvalidDeliveryStopMinutesError} hors de 1 à 120, ou pas entier.
 */
export function deliveryStopMinutesOf(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (
    !Number.isInteger(raw) ||
    raw < DELIVERY_STOP_MINUTES_MIN ||
    raw > DELIVERY_STOP_MINUTES_MAX
  ) {
    throw new InvalidDeliveryStopMinutesError(
      raw,
      DELIVERY_STOP_MINUTES_MIN,
      DELIVERY_STOP_MINUTES_MAX,
    );
  }
  return raw;
}
