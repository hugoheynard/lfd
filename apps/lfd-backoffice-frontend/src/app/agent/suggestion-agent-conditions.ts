import {
  NO_STAFF_SUGGESTION_CONDITIONS,
  STAFF_SUGGESTION_WEEKDAYS,
  type StaffSuggestionConditions,
  type StaffSuggestionRuleView,
  type Weekday,
} from '@lfd/contracts';

/**
 * **Les conditions d'une règle pour un agent** (RS8) : des champs à plat, un
 * par condition, sur le modèle de la phrase — OMIS = gardé, VIDE = retiré.
 */

/** Les champs que `suggestion_create` et `suggestion_update` acceptent en plus. */
export const CONDITION_FIELDS = {
  weekdays: { type: 'array', items: { type: 'string', enum: STAFF_SUGGESTION_WEEKDAYS } },
  hoursFrom: { type: 'string' },
  hoursTo: { type: 'string' },
  minCartTotalCents: { type: 'integer' },
  cartWithoutFamilyId: { type: 'string' },
  pickupAddressIds: { type: 'array', items: { type: 'string' } },
} as const;

export const CONDITIONS_HELP =
  'Conditions FACULTATIVES, toutes cumulées : `weekdays` (mon…sun ; [] = tous les jours), `hoursFrom` et `hoursTo` (HH:MM heure de Paris, début compris, fin exclue, sans passer minuit ; les deux vides = toute la journée), `minCartTotalCents` (le total que le client lit au panier, en centimes : HT au compte, TTC sinon ; 0 = aucun seuil ; panier seulement), `cartWithoutFamilyId` (le panier ne doit contenir aucun article de cette famille ; vide = aucune ; panier seulement), `pickupAddressIds` (la règle ne vaut qu’en retrait à l’un de ces points, ni avant le choix du point, ni en livraison ; [] = partout). Les points ouverts se lisent par suggestion_list.';

/** Ce qu'un outil reçoit des conditions — tous facultatifs. */
export interface ConditionFields {
  readonly weekdays?: readonly Weekday[] | undefined;
  readonly hoursFrom?: string | undefined;
  readonly hoursTo?: string | undefined;
  readonly minCartTotalCents?: number | undefined;
  readonly cartWithoutFamilyId?: string | undefined;
  readonly pickupAddressIds?: readonly string[] | undefined;
}

/** Les conditions à envoyer : celles de la règle lue, et ce qui est donné par-dessus. */
export function conditionsOf(
  given: ConditionFields,
  rule: StaffSuggestionRuleView | null,
): StaffSuggestionConditions {
  const kept = rule?.conditions ?? NO_STAFF_SUGGESTION_CONDITIONS;
  const from = given.hoursFrom ?? kept.hours?.from ?? '';
  const to = given.hoursTo ?? kept.hours?.to ?? '';
  const weekdays = given.weekdays ?? kept.weekdays ?? [];
  const sites = given.pickupAddressIds ?? kept.pickupAddressIds ?? [];
  const threshold = given.minCartTotalCents ?? kept.minCartTotalCents ?? 0;
  const family = given.cartWithoutFamilyId ?? kept.cartWithoutFamilyId ?? '';
  return {
    weekdays: weekdays.length === 0 ? null : [...weekdays],
    hours: from === '' && to === '' ? null : { from, to },
    minCartTotalCents: threshold === 0 ? null : threshold,
    cartWithoutFamilyId: family.trim() === '' ? null : family.trim(),
    pickupAddressIds: sites.length === 0 ? null : [...sites],
  };
}
