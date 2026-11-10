import { instantToLocal } from "@lfd/contracts";

import { CollectionProcedureNotFoundError } from "../errors/collection-errors.js";

/**
 * **L'identifiant d'une procédure de prélèvement** : l'entité et le jour
 * (Paris) de la clôture, `<entité>~<AAAA-MM-JJ>` (Hugo, 2026-10-23).
 *
 * Pourquoi pas l'identifiant du lot : une procédure existe AVANT son lot (à
 * venir, à préparer) et en porte jusqu'à deux (CORE et B2B) — l'adresse
 * d'un détail ne doit pas changer quand le lot est préparé. Le jour suffit :
 * une clôture tombe à minuit de Paris, une par jour au plus.
 */
const SEPARATOR = "~";
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Ce que l'adresse désigne. */
export interface ProcedureAddress {
  readonly legalEntityId: string;
  /** `AAAA-MM-JJ` — le jour local de la clôture. */
  readonly closureDay: string;
}

export function procedureIdOf(legalEntityId: string, closesAt: Date): string {
  return `${legalEntityId}${SEPARATOR}${closureDayOf(closesAt)}`;
}

/** Le jour (Paris) d'une clôture — celui qui entre dans l'identifiant. */
export function closureDayOf(closesAt: Date): string {
  return instantToLocal(closesAt).day;
}

/** @throws {CollectionProcedureNotFoundError} l'adresse n'a pas la forme `<entité>~<jour>`. */
export function parseProcedureId(raw: string): ProcedureAddress {
  const cut = raw.lastIndexOf(SEPARATOR);
  const legalEntityId = cut > 0 ? raw.slice(0, cut) : "";
  const closureDay = raw.slice(cut + 1);
  if (legalEntityId === "" || !DAY_PATTERN.test(closureDay)) {
    throw new CollectionProcedureNotFoundError(raw);
  }
  return { legalEntityId, closureDay };
}
