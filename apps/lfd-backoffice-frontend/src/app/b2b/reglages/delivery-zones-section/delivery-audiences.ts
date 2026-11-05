import type { CustomerAudience } from '@lfd/contracts';

/** Les deux côtés d'une saisie. */
export type InputSide = 'center' | 'bottom';

/**
 * Les clientèles de la livraison, telles que l'écran des zones les montre
 * (plan `plan-livraison-offerte.md`, 0b) : seules les OUVERTES dans la
 * disponibilité de la livraison. Masquer une clientèle n'efface pas ses
 * valeurs — l'écriture ne les envoie simplement pas.
 */
export const AUDIENCE_LABELS: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Pros',
  b2c: 'Particuliers',
};

/** Les clientèles à qui la livraison est proposée, pros d'abord. */
export function openAudiences(open: {
  readonly openToB2b: boolean;
  readonly openToB2c: boolean;
}): readonly CustomerAudience[] {
  return [...(open.openToB2b ? ['b2b' as const] : []), ...(open.openToB2c ? ['b2c' as const] : [])];
}

/** Le seuil « étroit » du back-office (`shared/viewport/narrow-viewport.ts`). */
const NARROW = '(max-width: 640px)';

/**
 * Le côté d'une saisie, lu AU CLIC : dialogue centré au bureau, feuille du
 * bas en mobile (règle « Saisir » du CLAUDE.md de la boutique, reprise ici).
 */
export function dialogSide(): InputSide {
  const narrow =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW).matches;
  return narrow ? 'bottom' : 'center';
}
