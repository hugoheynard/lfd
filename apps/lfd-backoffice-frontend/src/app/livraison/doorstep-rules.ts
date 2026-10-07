import type { DoorstepRule } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

/**
 * **La décision réglée d'avance à la porte, en mots**
 * (`documentation/livraisons/livreur/a-la-porte.md`, B3 bis, LB-Q6) — pour la
 * carte du réglage global et pour l'adresse sur la fiche société.
 */

export const DOORSTEP_RULE_LABELS: Readonly<Record<DoorstepRule, string>> = {
  ask: 'Me demander',
  deposit: 'Déposer avec photo, même si la signature est exigée',
  bring_back: 'Rapporter',
};

export const DOORSTEP_RULE_OPTIONS: readonly FoldSelectOption<DoorstepRule>[] = [
  { value: 'ask', label: DOORSTEP_RULE_LABELS.ask },
  { value: 'deposit', label: DOORSTEP_RULE_LABELS.deposit },
  { value: 'bring_back', label: DOORSTEP_RULE_LABELS.bring_back },
];

/** Le choix d'une adresse : une règle, ou hériter du réglage global (`null` côté serveur). */
export type AddressDoorstepChoice = DoorstepRule | 'inherit';

export const ADDRESS_DOORSTEP_OPTIONS: readonly FoldSelectOption<AddressDoorstepChoice>[] = [
  { value: 'inherit', label: 'Comme le réglage de livraison' },
  ...DOORSTEP_RULE_OPTIONS,
];

export function choiceOf(rule: DoorstepRule | null): AddressDoorstepChoice {
  return rule ?? 'inherit';
}

export function ruleOfChoice(choice: AddressDoorstepChoice): DoorstepRule | null {
  return choice === 'inherit' ? null : choice;
}
