/**
 * **La forme d'une couleur de site, jugée à la saisie.**
 *
 * Copie de la règle du serveur (`apps/lfd-api/src/b2b/sites/domain/site-color.ts`,
 * relue le 2026-10-13) : `#rrggbb`, normalisée en minuscules. Aucune teinte
 * n'est refusée (Hugo, 2026-10-13 : couleurs entièrement libres, l'équipe
 * s'organise). Le serveur reste l'AUTORITÉ : ce jugement n'annonce le refus
 * qu'en avance.
 */

/** `#rrggbb`, insensible à la casse. */
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

/** Ce que l'écran dit d'une saisie ; `null` = rien à redire. */
export type SiteColorIssue = 'format';

export const SITE_COLOR_MESSAGES: Readonly<Record<SiteColorIssue, string>> = {
  format: 'Couleur attendue sous la forme #rrggbb — choisissez-la dans le sélecteur.',
};

/** Normalise comme le serveur : sans blancs, en minuscules. */
export function normalizeSiteColor(value: string): string {
  return value.trim().toLowerCase();
}

/** Ce qui cloche dans une couleur saisie, ou `null`. */
export function siteColorIssue(value: string): SiteColorIssue | null {
  return HEX_COLOR.test(normalizeSiteColor(value)) ? null : 'format';
}
