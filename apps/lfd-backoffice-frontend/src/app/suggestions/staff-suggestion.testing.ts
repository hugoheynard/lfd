import type { StaffSuggestionRuleView } from '@lfd/contracts';

/** Une règle d'exemple pour les specs : « croissant au panier → baguette ». Ses jours ne sont comparés à aucune horloge. */
export function staffSuggestion(
  over: Partial<StaffSuggestionRuleView> = {},
): StaffSuggestionRuleView {
  return {
    id: '01JRULE',
    audienceKey: '01jrule',
    trigger: { kind: 'product_in_cart', ref: 'VIE-001' },
    suggestedSkus: ['PAI-001'],
    placement: 'cart',
    audience: 'both',
    startsOn: '2026-10-18',
    endsOn: '2026-10-25',
    phrase: { fr: 'Avec un croissant, la baguette' },
    priority: 0,
    active: true,
    archivedAt: null,
    createdAt: '2026-10-18T08:00:00.000Z',
    updatedAt: '2026-10-18T08:00:00.000Z',
    ...over,
  };
}
