import type { StaffSuggestionRuleView } from '@lfd/contracts';

/** Ce que le staff demande depuis une ligne de la liste — la page l'exécute. */
export interface SuggestionGesture {
  readonly kind: 'preview' | 'edit' | 'duplicate' | 'toggle' | 'archive';
  readonly rule: StaffSuggestionRuleView;
}
