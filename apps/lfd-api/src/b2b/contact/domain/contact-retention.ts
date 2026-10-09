/**
 * **Combien de temps un message traité garde ses données personnelles** —
 * douze mois après son traitement (`plan-nous-ecrire.md`, §5.3 ; durée par
 * défaut, à confirmer par Hugo). Passé ce délai, le balayage nocturne vide le
 * nom, l'e-mail, le téléphone et le texte ; la ligne reste.
 */
export const CONTACT_MESSAGE_RETENTION_MONTHS = 12;

/**
 * La frontière : un message traité AVANT cet instant est à anonymiser. Douze
 * mois calendaires en UTC ; un 29 février recule au 28 (ou au 1er mars) par
 * l'arithmétique de `Date`, ce qui ne déplace la purge que d'un jour.
 */
export function contactMessageKeptSince(now: Date): Date {
  const limit = new Date(now.getTime());
  limit.setUTCMonth(limit.getUTCMonth() - CONTACT_MESSAGE_RETENTION_MONTHS);
  return limit;
}
