import type {
  StaffSuggestionChoicesView,
  StaffSuggestionConditions,
  StaffSuggestionPlacement,
  Weekday,
} from '@lfd/contracts';
import { NO_STAFF_SUGGESTION_CONDITIONS, STAFF_SUGGESTION_WEEKDAYS } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

import { centsField, centsOf } from '../comptabilite/cents-field';

/**
 * **Les conditions facultatives d'une règle** (RS8,
 * `documentation/recommandation-produit/suggestions-du-staff.md` §2.1), côté
 * écran : le brouillon des champs, le contrat qu'il devient, et la phrase qui
 * les dit. Rien n'y est jugé : l'agrégat refuse ce qu'il doit.
 */

/** Les conditions telles qu'on les saisit. Vide = la condition n'est pas posée. */
export interface ConditionsDraft {
  /** Aucun jour coché = tous les jours. */
  readonly weekdays: readonly Weekday[];
  /** `HH:MM`, ou vide. */
  readonly hoursFrom: string;
  readonly hoursTo: string;
  /** Le montant minimum en euros, tel que tapé (« 20 », « 12,50 »), ou vide. */
  readonly minCartEuros: string;
  /** L'id de la famille exclue, ou vide. */
  readonly cartWithoutFamilyId: string;
  /** Aucun point = tous les points, et la livraison. */
  readonly pickupAddressIds: readonly string[];
}

export const EMPTY_CONDITIONS: ConditionsDraft = {
  weekdays: [],
  hoursFrom: '',
  hoursTo: '',
  minCartEuros: '',
  cartWithoutFamilyId: '',
  pickupAddressIds: [],
};

const DAY_NAMES: Readonly<Record<Weekday, string>> = {
  mon: 'lundi',
  tue: 'mardi',
  wed: 'mercredi',
  thu: 'jeudi',
  fri: 'vendredi',
  sat: 'samedi',
  sun: 'dimanche',
};

export const WEEKDAY_OPTIONS: readonly FoldSelectOption<Weekday>[] = STAFF_SUGGESTION_WEEKDAYS.map(
  (value) => ({ value, label: DAY_NAMES[value].replace(/^./u, (first) => first.toUpperCase()) }),
);

/** Les conditions relues d'une règle, en champs. */
export function conditionsDraftOf(conditions: StaffSuggestionConditions): ConditionsDraft {
  return {
    weekdays: conditions.weekdays ?? [],
    hoursFrom: conditions.hours?.from ?? '',
    hoursTo: conditions.hours?.to ?? '',
    minCartEuros:
      conditions.minCartTotalCents === null ? '' : centsField(conditions.minCartTotalCents),
    cartWithoutFamilyId: conditions.cartWithoutFamilyId ?? '',
    pickupAddressIds: conditions.pickupAddressIds ?? [],
  };
}

/** Le panier seul connaît son montant et ses familles. */
export function cartOnly(placement: StaffSuggestionPlacement): boolean {
  return placement === 'cart';
}

/**
 * Ce qui empêche d'enregistrer, dit au staff — `null` : rien. Une plage à
 * moitié remplie, un montant illisible.
 */
export function conditionsMissing(
  draft: ConditionsDraft,
  placement: StaffSuggestionPlacement,
): string | null {
  if ((draft.hoursFrom === '') !== (draft.hoursTo === '')) {
    return 'Donnez le début ET la fin de la plage horaire, ou aucun des deux.';
  }
  if (cartOnly(placement) && draft.minCartEuros.trim() !== '' && thresholdOf(draft) === null) {
    return 'Le montant minimum du panier doit être un montant en euros (« 20 » ou « 12,50 »).';
  }
  return null;
}

function thresholdOf(draft: ConditionsDraft): number | null {
  return draft.minCartEuros.trim() === '' ? null : centsOf(draft.minCartEuros);
}

/**
 * Le contrat. Les conditions de panier ne partent qu'au panier : changer
 * d'emplacement les laisse dans le brouillon, sans les envoyer.
 */
export function conditionsPayloadOf(
  draft: ConditionsDraft,
  placement: StaffSuggestionPlacement,
): StaffSuggestionConditions {
  const family = draft.cartWithoutFamilyId.trim();
  return {
    ...NO_STAFF_SUGGESTION_CONDITIONS,
    weekdays: draft.weekdays.length === 0 ? null : [...draft.weekdays],
    hours:
      draft.hoursFrom === '' || draft.hoursTo === ''
        ? null
        : { from: draft.hoursFrom, to: draft.hoursTo },
    minCartTotalCents: cartOnly(placement) ? thresholdOf(draft) : null,
    cartWithoutFamilyId: cartOnly(placement) && family !== '' ? family : null,
    pickupAddressIds: draft.pickupAddressIds.length === 0 ? null : [...draft.pickupAddressIds],
  };
}

/** « du lundi au vendredi », « le samedi », « le lundi et le jeudi ». */
export function weekdaysText(weekdays: readonly Weekday[]): string {
  const indexes = weekdays
    .map((day) => STAFF_SUGGESTION_WEEKDAYS.indexOf(day))
    .sort((left, right) => left - right);
  const first = indexes[0];
  const last = indexes.at(-1);
  const names = indexes.map((index) => DAY_NAMES[STAFF_SUGGESTION_WEEKDAYS[index] ?? 'mon']);
  const consecutive =
    first !== undefined && last !== undefined && last - first === names.length - 1;
  if (consecutive && names.length >= 3) {
    return `du ${names[0] ?? ''} au ${names.at(-1) ?? ''}`;
  }
  if (names.length <= 1) {
    return `le ${names[0] ?? ''}`;
  }
  return `le ${names.slice(0, -1).join(', le ')} et le ${names.at(-1) ?? ''}`;
}

/** `07:30` → « 7 h 30 », `07:00` → « 7 h ». */
function hourText(time: string): string {
  const [hours = '0', minutes = '00'] = time.split(':');
  return minutes === '00' ? `${Number(hours)} h` : `${Number(hours)} h ${minutes}`;
}

/** « de 7 h à 11 h ». */
export function hoursText(from: string, to: string): string {
  return `de ${hourText(from)} à ${hourText(to)}`;
}

const CENTS_PER_EURO = 100;

/** Des centimes, dits comme on les dit : « 20 € », « 12,50 € ». */
export function eurosText(cents: number): string {
  const euros = Math.floor(cents / CENTS_PER_EURO);
  const rest = cents % CENTS_PER_EURO;
  return rest === 0 ? `${euros} €` : `${euros},${String(rest).padStart(2, '0')} €`;
}

function familyName(choices: StaffSuggestionChoicesView | null, id: string): string {
  return choices?.families.find((family) => family.id === id)?.name ?? id;
}

/** Les noms des points de retrait, leur id s'ils ne sont plus ouverts. */
export function sitesText(
  choices: StaffSuggestionChoicesView | null,
  ids: readonly string[],
): string {
  const names = ids.map((id) => choices?.sites.find((site) => site.id === id)?.label ?? id);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} ou ${names.at(-1) ?? ''}`;
}

/**
 * **Les conditions en morceaux de phrase**, dans l'ordre où l'on parle : « du
 * lundi au vendredi », « de 7 h à 11 h », « si le panier atteint 20 € », « si
 * le panier n'a aucun article de la famille Boissons », « en retrait à
 * Centre ». Vide sans condition.
 */
export function conditionsParts(
  conditions: StaffSuggestionConditions,
  choices: StaffSuggestionChoicesView | null,
): readonly string[] {
  const parts: string[] = [];
  if (conditions.weekdays !== null) {
    parts.push(weekdaysText(conditions.weekdays));
  }
  if (conditions.hours !== null) {
    parts.push(hoursText(conditions.hours.from, conditions.hours.to));
  }
  if (conditions.minCartTotalCents !== null) {
    parts.push(`si le panier atteint ${eurosText(conditions.minCartTotalCents)}`);
  }
  if (conditions.cartWithoutFamilyId !== null) {
    parts.push(
      `si le panier n’a aucun article de la famille ${familyName(choices, conditions.cartWithoutFamilyId)}`,
    );
  }
  if (conditions.pickupAddressIds !== null) {
    parts.push(`en retrait à ${sitesText(choices, conditions.pickupAddressIds)}`);
  }
  return parts;
}
