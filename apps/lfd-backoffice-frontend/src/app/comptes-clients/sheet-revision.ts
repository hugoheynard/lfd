import { HttpHeaders } from '@angular/common/http';
import { httpErrorCode } from '@lfd/endpoints';

/** Le refus d'une fiche réécrite depuis sa lecture (`CompanyChangedSinceReadError`). */
export const STALE_SHEET_CODE = 'account.company.changed_since_read';

/**
 * L'en-tête qui dit à l'API sur quelle révision de la fiche le geste a été
 * décidé (`comptes-client/plan-fiche-perimee.md`). `null` : l'appelant n'a pas
 * lu de fiche, rien n'est envoyé et rien n'est comparé.
 */
export function revisionOptions(revision: number | null): { readonly headers?: HttpHeaders } {
  return revision === null ? {} : { headers: new HttpHeaders({ 'If-Match': `"${revision}"` }) };
}

/** Le refus vient-il d'une fiche périmée ? Le seul remède est de la relire. */
export function isStaleSheet(error: unknown): boolean {
  return httpErrorCode(error) === STALE_SHEET_CODE;
}
