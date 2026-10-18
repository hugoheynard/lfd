import type { StaffSuggestionRuleView } from '@lfd/contracts';

import { stateOf, type SuggestionState } from './suggestion-summary';

/**
 * **La liste regroupée** (RS9) : « À venir », « En cours », « Finies », puis
 * « Coupées » et « Archivées », repliées — elles se lisent, rien n'en paraît en
 * boutique. Le groupe est l'état que la ligne affiche déjà (`stateOf`) : une
 * règle n'est jamais rangée ailleurs que ce que dit son badge.
 */
export interface SuggestionGroup {
  readonly state: SuggestionState;
  readonly title: string;
  readonly subtitle: string;
  /** Replié tant que le staff ne l'ouvre pas. */
  readonly collapsed: boolean;
  readonly rules: readonly StaffSuggestionRuleView[];
}

const GROUPS: readonly Omit<SuggestionGroup, 'rules'>[] = [
  {
    state: 'scheduled',
    title: 'À venir',
    subtitle: 'Allumées, elles paraîtront à leur premier jour.',
    collapsed: false,
  },
  {
    state: 'live',
    title: 'En cours',
    subtitle: 'Allumées et dans leur période : la boutique peut les montrer aujourd’hui.',
    collapsed: false,
  },
  {
    state: 'ended',
    title: 'Finies',
    subtitle: 'Leur dernier jour est passé. Dupliquez-en une pour la décliner.',
    collapsed: false,
  },
  {
    state: 'cut',
    title: 'Coupées',
    subtitle: 'Éteintes à la main : rien n’en paraît tant qu’on ne les rallume pas.',
    collapsed: true,
  },
  {
    state: 'archived',
    title: 'Archivées',
    subtitle: 'Retirées pour toujours : elles se lisent, rien n’en paraît en boutique.',
    collapsed: true,
  },
];

/** Les groupes non vides, dans l'ordre de lecture ; l'ordre servi est gardé dans chacun. */
export function groupsOf(
  rules: readonly StaffSuggestionRuleView[],
  today: string,
): readonly SuggestionGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    rules: rules.filter((rule) => stateOf(rule, today) === group.state),
  })).filter((group) => group.rules.length > 0);
}
