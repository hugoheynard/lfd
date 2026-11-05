import type { CustomerAudience } from '@lfd/contracts';

/** Les deux côtés d'une saisie. */
export type InputSide = 'center' | 'bottom';

/**
 * Les clientèles de la livraison (plan `plan-livraison-offerte.md`, 0b). Le
 * réglage global les montre TOUTES, une clientèle fermée dans la
 * disponibilité de la livraison grisée (Hugo, 2026-11-05) ; les zones ne
 * montrent que les ouvertes. Une clientèle fermée garde ses valeurs —
 * l'écriture ne les envoie simplement pas.
 */
export const AUDIENCE_LABELS: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Pros',
  b2c: 'Particuliers',
};

/** Toutes les clientèles, pros d'abord. */
export const ALL_AUDIENCES: readonly CustomerAudience[] = ['b2b', 'b2c'];

/** Le libellé de la case qui ouvre la clientèle, carte « Disponibilité de la livraison ». */
const AVAILABILITY_CHECKBOX: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'B2B',
  b2c: 'B2C',
};

/** Ce que dit l'écran d'une clientèle fermée, et où l'ouvrir. */
export function closedAudienceNotice(audience: CustomerAudience): string {
  return (
    `La livraison n'est pas proposée aux ${AUDIENCE_LABELS[audience].toLowerCase()} : ` +
    `leur réglage est gardé mais ne s'applique pas. Pour la leur ouvrir, cochez ` +
    `« ${AVAILABILITY_CHECKBOX[audience]} » dans « Disponibilité de la livraison », sur cette page.`
  );
}

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
