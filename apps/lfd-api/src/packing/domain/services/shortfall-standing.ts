import type { BusinessError } from "../../../platform/shared/errors/app-error.js";
import { ContainersCountedError } from "../errors/packing-container-errors.js";
import {
  NothingShortError,
  ShortfallAlreadyAuthorizedError,
} from "../errors/packing-shortfall-errors.js";
import { PackedOrderSealedError } from "../errors/packing-station-errors.js";
import { PackingSheetWithdrawnError } from "../errors/packing-withdrawal-errors.js";
import type { ShortfallLine } from "./shortfall.js";

/**
 * Pourquoi « Il manque » ne se pose pas sur cette feuille, dans l'ordre où
 * l'agrégat juge : retirée, bac fermé, comptée par contenants, départ déjà
 * autorisé, rien ne manque.
 */
export type ShortfallRefusal =
  "withdrawn" | "sealed" | "counted" | "already_authorized" | "nothing_short";

/**
 * **Ce que « Il manque » ferait sur cette feuille, sans le faire** (C1b,
 * Hugo, 2026-11-03) : le refus, ou les quantités au bac ligne par ligne —
 * complètes comprises. Une seule règle pour le geste (`reportShortfall`, qui
 * lève) et pour l'aperçu du comptoir (qui le dit avant).
 */
export type ShortfallStanding =
  | { readonly kind: "refused"; readonly refusal: ShortfallRefusal }
  | { readonly kind: "short"; readonly lines: readonly ShortfallLine[] };

const REFUSAL_ERRORS: Readonly<Record<ShortfallRefusal, (reference: string) => BusinessError>> = {
  withdrawn: (reference) => new PackingSheetWithdrawnError(reference),
  sealed: (reference) => new PackedOrderSealedError(reference),
  counted: (reference) => new ContainersCountedError(reference),
  already_authorized: (reference) => new ShortfallAlreadyAuthorizedError(reference),
  nothing_short: (reference) => new NothingShortError(reference),
};

/** L'erreur que le geste lève pour ce refus — la même qu'avant l'extraction. */
export function shortfallRefusalError(refusal: ShortfallRefusal, reference: string): BusinessError {
  return REFUSAL_ERRORS[refusal](reference);
}
