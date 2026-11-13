import type { BillingRhythmKind } from '@lfd/contracts';

/**
 * Le mode de facturation choisi à l'ouverture ou à l'activation d'un compte
 * (`documentation/comptabilite/facturation/le-mode-de-facturation-d-un-client.md`,
 * § 2.3) — posé par la route du mode du payeur, juste après le geste.
 *
 * - `chosen` : un mode, chez une entité émettrice ;
 * - `missing` : le choix est exigé et n'est pas fait — le geste attend ;
 * - `not-required` : rien à choisir ici (aucune entité en service, pas le droit
 *   d'écrire le mode, ou un mode déjà choisi) — le geste n'attend pas.
 */
export type InitialBillingMode =
  | {
      readonly kind: 'chosen';
      readonly legalEntityId: string;
      readonly mode: BillingRhythmKind;
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'not-required' };

/** Le choix retient-il le geste ? */
export function initialBillingModeMissing(choice: InitialBillingMode): boolean {
  return choice.kind === 'missing';
}
