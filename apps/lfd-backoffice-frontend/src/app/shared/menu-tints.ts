/**
 * Le **rose de la marque** des sections de menu — fold n'en a pas ; il se
 * compose du rouge et du violet de la marque, et ressort PÂLE là où fold le
 * dilue (survol, sélection) tout en restant lisible sur le trait de la
 * section (Hugo, 2026-10-12 : « un rose pâle »).
 *
 * Une constante et non une chaîne par usage : la Communication la porte, et
 * Réglages › Légal doit porter la MÊME (Hugo, 2026-10-15).
 */
export const BRAND_PINK_TINT =
  'color-mix(in oklab, var(--fold-ref-red-450), var(--fold-ref-grape-500) 45%)';
