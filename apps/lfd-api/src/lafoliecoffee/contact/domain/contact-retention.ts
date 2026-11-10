/**
 * **Combien de temps une demande garde ses données personnelles** — douze
 * mois après son traitement, ou après sa réception si personne ne l'a
 * traitée (Hugo, 2026-10-09 ; `demandes-clients.md`, §6.2). Passé ce
 * délai, le balayage nocturne vide l'auteur, le texte, les rattachements, la
 * commande, et SUPPRIME les photos du stockage ; la ligne reste.
 */
export const CUSTOMER_REQUEST_RETENTION_MONTHS = 12;

/**
 * La frontière : une demande traitée — ou, jamais traitée, reçue — AVANT cet
 * instant est à anonymiser. Douze mois calendaires en UTC ; un 29 février
 * recule au 28 (ou au 1er mars) par l'arithmétique de `Date`, ce qui ne
 * déplace la purge que d'un jour.
 */
export function customerRequestKeptSince(now: Date): Date {
  const limit = new Date(now.getTime());
  limit.setUTCMonth(limit.getUTCMonth() - CUSTOMER_REQUEST_RETENTION_MONTHS);
  return limit;
}
