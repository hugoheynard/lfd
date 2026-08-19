import { TvaRegimeNotFoundError, TvaTagConflictError } from "../domain/errors/commerce-errors.js";
import {
  TvaRegimeRepository,
  type TvaRegimeRecord,
} from "../domain/ports/tva-regime.repository.js";

/**
 * Charge commerciale des régimes de TVA — dérivation du `tag` et gardes **partagées**
 * par les handlers. Le `tag` (handle Shopify) est dérivé du taux, jamais saisi.
 */
export function tagFor(percent: number): string {
  return `tva-${String(percent).replace(".", "-")}`;
}

/** Refuse un `tag` déjà porté par un **autre** régime (même taux ⇒ même handle). */
export async function ensureTagFree(
  regimes: TvaRegimeRepository,
  tag: string,
  exceptId: string | null,
): Promise<void> {
  const existing = await regimes.findByTag(tag);
  if (existing !== null && existing.id !== exceptId) {
    throw new TvaTagConflictError(tag);
  }
}

export async function requireRegime(
  regimes: TvaRegimeRepository,
  id: string,
): Promise<TvaRegimeRecord> {
  const regime = await regimes.findById(id);
  if (regime === null) {
    throw new TvaRegimeNotFoundError(id);
  }
  return regime;
}
