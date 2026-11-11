import { MercurialeAmendedMeanwhileError } from "../pricing-errors.js";
import type { CompanyMercurialeState } from "./company-mercuriale-state.js";
import type { MercurialeAmendment, MercurialeAmendmentDraft } from "./mercuriale-amendment.js";
import { assertNoDoubleNegotiation, checkedAmendment } from "./mercuriale-amendment-checks.js";

/**
 * L'état d'une mercuriale à laquelle s'ajoute un avenant daté, vérifié puis
 * confronté aux lignes déjà négociées. Ne regarde pas la clôture : c'est à
 * l'agrégat de la refuser avant.
 *
 * @throws les refus de `checkedAmendment` et `assertNoDoubleNegotiation`.
 */
export function amendedState(
  state: CompanyMercurialeState,
  id: string,
  draft: MercurialeAmendmentDraft,
  by: string,
  now: Date,
): CompanyMercurialeState {
  const amendment: MercurialeAmendment = {
    ...checkedAmendment(state, draft, now),
    id,
    createdBy: by,
    createdAt: now,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };
  const amended = { ...state, amendments: [...state.amendments, amendment] };
  assertNoDoubleNegotiation(amended, amendment);
  return amended;
}

/** Le dernier avenant écrit et non rangé, ou `null`. */
export function latestAmendmentIdOf(state: CompanyMercurialeState): string | null {
  return state.amendments.filter((a) => a.archivedAt === null).at(-1)?.id ?? null;
}

/**
 * Refuse si un avenant a été écrit depuis celui que l'appelant a vu : son
 * écart serait calculé sur un état périmé.
 *
 * @throws {MercurialeAmendedMeanwhileError} le dernier avenant n'est pas celui annoncé.
 */
export function assertNotAmendedSince(
  state: CompanyMercurialeState,
  basedOnAmendmentId: string | null,
): void {
  const latest = latestAmendmentIdOf(state);
  if (latest !== basedOnAmendmentId) {
    throw new MercurialeAmendedMeanwhileError(basedOnAmendmentId, latest);
  }
}
