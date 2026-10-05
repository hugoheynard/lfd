import { LEGAL_FORM_LABELS, toLegalForm } from '@lfd/contracts';

/**
 * La forme juridique telle qu'on la LIT. La valeur stockée est une clé de la
 * liste fermée (`foreign`, `sas`) ; une saisie d'avant la liste, non reconnue,
 * s'affiche telle quelle plutôt que d'être devinée.
 *
 * Régression du 2026-10-05 : la fiche client affichait « foreign » — la carte
 * montrait la clé brute.
 */
export function legalFormLabelFor(raw: string): string {
  const form = toLegalForm(raw);
  return form === null ? raw : LEGAL_FORM_LABELS[form];
}
