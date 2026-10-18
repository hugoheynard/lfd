import type {
  StaffSuggestionAudience,
  StaffSuggestionPlacement,
  StaffSuggestionRulePayload,
  StaffSuggestionRuleView,
  StaffSuggestionTriggerKind,
} from '@lfd/contracts';

import { PLACEMENTS_OF } from './suggestion-format';

/** Une suggestion montre trois articles au plus — la borne de l'agrégat. */
export const MAX_SUGGESTED = 3;

/** Une règle telle qu'on la saisit : les chaînes des champs, pas encore un contrat. */
export interface SuggestionDraft {
  readonly triggerKind: StaffSuggestionTriggerKind;
  /** Le SKU ou l'id de famille ; ignoré pour « partout ». */
  readonly triggerRef: string;
  readonly suggestedSkus: readonly string[];
  readonly placement: StaffSuggestionPlacement;
  readonly audience: StaffSuggestionAudience;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly phraseFr: string;
  readonly phraseEn: string;
  readonly phraseIt: string;
  readonly priority: number | null;
}

/** Une règle neuve : partout, à l'accueil, pour tous, aujourd'hui seulement. */
export function emptyDraft(today: string): SuggestionDraft {
  return {
    triggerKind: 'everywhere',
    triggerRef: '',
    suggestedSkus: [],
    placement: 'home',
    audience: 'both',
    startsOn: today,
    endsOn: today,
    phraseFr: '',
    phraseEn: '',
    phraseIt: '',
    priority: 0,
  };
}

/** Une règle existante, à réécrire. */
export function draftOf(rule: StaffSuggestionRuleView): SuggestionDraft {
  return {
    triggerKind: rule.trigger.kind,
    triggerRef: rule.trigger.ref ?? '',
    suggestedSkus: rule.suggestedSkus,
    placement: rule.placement,
    audience: rule.audience,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn,
    phraseFr: rule.phrase?.fr ?? '',
    phraseEn: rule.phrase?.en ?? '',
    phraseIt: rule.phrase?.it ?? '',
    priority: rule.priority,
  };
}

/**
 * Changer de déclencheur garde l'emplacement s'il reste possible, sinon prend
 * le premier qui l'est — l'écran ne propose jamais une règle que le serveur
 * refuserait pour cette raison. La référence s'efface : un SKU n'est pas une
 * famille.
 */
export function withTrigger(
  draft: SuggestionDraft,
  kind: StaffSuggestionTriggerKind,
): SuggestionDraft {
  const allowed = PLACEMENTS_OF[kind];
  const placement = allowed.includes(draft.placement)
    ? draft.placement
    : (allowed[0] ?? draft.placement);
  return { ...draft, triggerKind: kind, triggerRef: '', placement };
}

/** Ajoute un article montré, sans doublon, dans la borne. */
export function withSuggested(draft: SuggestionDraft, sku: string): SuggestionDraft {
  if (draft.suggestedSkus.includes(sku) || draft.suggestedSkus.length >= MAX_SUGGESTED) {
    return draft;
  }
  return { ...draft, suggestedSkus: [...draft.suggestedSkus, sku] };
}

export function withoutSuggested(draft: SuggestionDraft, sku: string): SuggestionDraft {
  return { ...draft, suggestedSkus: draft.suggestedSkus.filter((one) => one !== sku) };
}

/** Ce qui manque encore — une phrase, pour que le bouton fermé dise pourquoi. `null` : rien. */
export function missingOf(draft: SuggestionDraft): string | null {
  if (draft.triggerKind !== 'everywhere' && draft.triggerRef.trim() === '') {
    return draft.triggerKind === 'category_in_cart'
      ? 'Choisissez la famille qui déclenche.'
      : 'Choisissez l’article qui déclenche.';
  }
  if (draft.suggestedSkus.length === 0) {
    return 'Choisissez au moins un article à montrer.';
  }
  if (draft.startsOn === '' || draft.endsOn === '') {
    return 'Donnez le premier et le dernier jour.';
  }
  if (draft.priority === null) {
    return 'Donnez une priorité (0 si elle ne compte pas).';
  }
  return null;
}

/**
 * Le contrat, tel que l'écran l'envoie. Une phrase entièrement vide part à
 * `null` (« Notre conseil ») ; les traductions vides n'y figurent pas. Rien
 * n'est jugé ici : le serveur refuse ce qu'il doit refuser, et le dit.
 */
export function payloadOf(draft: SuggestionDraft): StaffSuggestionRulePayload {
  const fr = draft.phraseFr.trim();
  const en = draft.phraseEn.trim();
  const it = draft.phraseIt.trim();
  const phrase =
    fr === '' && en === '' && it === ''
      ? null
      : { fr, ...(en === '' ? {} : { en }), ...(it === '' ? {} : { it }) };
  return {
    trigger: {
      kind: draft.triggerKind,
      ref: draft.triggerKind === 'everywhere' ? null : draft.triggerRef.trim(),
    },
    suggestedSkus: [...draft.suggestedSkus],
    placement: draft.placement,
    audience: draft.audience,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    phrase,
    priority: draft.priority ?? 0,
  };
}
