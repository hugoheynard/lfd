import { httpErrorCode } from '@lfd/endpoints';

/**
 * Les deux refus « la pièce n'est plus celle que vous regardiez » (409), depuis
 * le 2026-09-15 (plan `documentation/comptabilite/plan-restes-du-mandat.md` §8,
 * lot C) :
 *
 * - `proof_revision_stale` — la signature vise une révision de pièce qui n'est
 *   plus la courante ;
 * - `proof_changed` — un autre geste (un second dépôt, une signature, un
 *   abandon) est passé entre la lecture du mandat et son écriture.
 *
 * On teste le **code**, jamais le message : un relecteur a le droit de
 * reformuler le second sans casser l'enchaînement de l'écran.
 */
const PROOF_CONFLICTS: ReadonlySet<string> = new Set([
  'payments.mandate.proof_revision_stale',
  'payments.mandate.proof_changed',
]);

/**
 * Ce refus dit-il que la vue du mandat est périmée ? Vrai ⇒ l'écran relit la
 * section, faute de quoi le staff recommencerait sur la même vue et se ferait
 * refuser à nouveau.
 */
export function isProofConflict(error: unknown): boolean {
  const code = httpErrorCode(error);
  return code !== null && PROOF_CONFLICTS.has(code);
}
