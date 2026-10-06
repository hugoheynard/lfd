/**
 * **Combien de jours une position relevée au geste est gardée**
 * (`documentation/livraisons/gps-y-aller-et-position.md`, YA-D4, YA-Q3 ;
 * `documentation/legal/rgpd-livreur.md`). Hugo, 2026-10-06 : 60 jours, à faire
 * valider. Source UNIQUE : la purge, le texte d'information du livreur et le
 * registre (`rgpd-registre.json`, `conservation.jours`) disent ce nombre.
 */
export const POSITION_RETENTION_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * La frontière de la purge : une position relevée AVANT cet instant s'efface.
 * Comptée sur l'heure de clôture de l'arrêt — l'instant même du relevé.
 */
export function positionKeptSince(now: Date): Date {
  return new Date(now.getTime() - POSITION_RETENTION_DAYS * MS_PER_DAY);
}
