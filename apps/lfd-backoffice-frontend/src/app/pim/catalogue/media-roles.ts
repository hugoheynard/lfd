/**
 * Les usages d'un visuel de fiche qu'un canal PUBLIE.
 *
 * Ce sont les deux rôles que le canal du référentiel fait traverser vers la
 * boutique (`SHOWCASE_ROLE` et `THUMBNAIL_ROLE` dans
 * `apps/lfd-api/src/pim/channels/b2b-platform/products/showcase.ts`, vérifié le
 * 2026-10-10) ; la boutique retombe sur l'ouverture quand la vignette manque.
 * Les trois autres (`gallery`, `lifestyle`, `print`) ne paraissent NULLE PART :
 * un croissant laissé en `gallery` a passé pour une panne, faute que l'écran le
 * dise. C'est ce que cette liste sert à dire.
 */
export const PUBLISHED_MEDIA_ROLES: readonly string[] = ['hero', 'thumbnail'];

/** L'usage est-il montré par au moins un canal ? */
export function isPublishedMediaRole(role: string): boolean {
  return PUBLISHED_MEDIA_ROLES.includes(role);
}
