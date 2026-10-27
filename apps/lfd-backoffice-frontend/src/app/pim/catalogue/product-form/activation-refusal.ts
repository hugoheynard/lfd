import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';

/** Le code du refus d'activation (`ProductNotActivatableError`, référentiel). */
export const NOT_ACTIVATABLE = 'catalogue.product.not_activatable';

/**
 * La composition cite un allergène que la déclaration contredit
 * (`ProductAllergenContradictionError`) — bloquant depuis le 2026-10-27. Son
 * message nomme chaque SKU, les codes et les deux gestes de sortie : il
 * s'affiche entier, il n'a pas la forme « SKU : manques » à découper.
 */
export const ALLERGEN_CONTRADICTION = 'catalogue.product.allergen_contradiction';

/**
 * **Le refus d'activer**, découpé pour l'écran : la phrase d'en-tête, puis une
 * ligne par déclinaison et ce qui lui manque.
 */
export interface ActivationRefusal {
  readonly intro: string;
  readonly lines: readonly string[];
}

/**
 * Lit les refus `catalogue.product.not_activatable` et
 * `catalogue.product.allergen_contradiction` — `null` pour tout autre
 * erreur, que l'appelant traite comme avant.
 *
 * ⚠️ **Le serveur ne rend que du texte** : l'enveloppe d'erreur ne porte que
 * `code` et `message` (`app-error.filter.ts`, vérifié le 2026-10-15), et le
 * message de `ProductNotActivatableError` énumère les déclinaisons séparées
 * par « ; » après un tiret cadratin. Le découpage s'appuie sur cette forme ;
 * hors de cette forme, le message s'affiche entier, sans liste — jamais faux, au
 * pire moins rangé. Une liste structurée dans l'erreur serait la vraie
 * réponse (signalée au rapport du lot 3).
 */
export function activationRefusalOf(caught: unknown): ActivationRefusal | null {
  const code = httpErrorCode(caught);
  if (code === ALLERGEN_CONTRADICTION) {
    return { intro: httpErrorMessage(caught, 'Activation refusée.'), lines: [] };
  }
  if (code !== NOT_ACTIVATABLE) {
    return null;
  }
  const message = httpErrorMessage(caught, 'Activation refusée.');
  const whole = { intro: message, lines: [] };
  const dash = message.indexOf(' — ');
  if (dash < 0) {
    return whole;
  }
  const lines = message
    .slice(dash + ' — '.length)
    .replace(/\.$/u, '')
    .split(' ; ')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  // Une ligne de déclinaison se lit « SKU : manques ». Sans cette forme — « toutes
  // les déclinaisons sont arrêtées — en rouvrir une… » —, le tiret n'annonçait
  // pas une liste : on garde la phrase entière.
  return lines.every((line) => line.includes(' : '))
    ? { intro: message.slice(0, dash), lines }
    : whole;
}
