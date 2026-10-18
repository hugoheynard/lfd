import type {
  StaffSuggestionAudience,
  StaffSuggestionChoicesView,
  StaffSuggestionConditions,
  StaffSuggestionPlacement,
  StaffSuggestionRuleView,
  StaffSuggestionTriggerKind,
} from '@lfd/contracts';

import { conditionsParts } from './suggestion-conditions';

/**
 * **La règle dite en une phrase** — « Quand un croissant est dans le panier,
 * proposer Café au panier, aux particuliers, du 20 au 31 octobre, du lundi au
 * vendredi, de 7 h à 11 h, si le panier atteint 20 €. » La même
 * phrase sert d'aperçu en direct dans le panneau et de résumé dans la liste :
 * le staff relit ce qu'il a décidé dans ses mots, pas dans ceux du contrat.
 */

/** Ce dont la phrase a besoin — un brouillon ou une règle s'y ramènent. */
export interface SuggestionSummaryInput {
  readonly triggerKind: StaffSuggestionTriggerKind;
  readonly triggerRef: string;
  readonly suggestedSkus: readonly string[];
  readonly placement: StaffSuggestionPlacement;
  readonly audience: StaffSuggestionAudience;
  readonly startsOn: string;
  readonly endsOn: string;
  /** Les conditions de RS8, dites après la période ; `null` = aucune. */
  readonly conditions: StaffSuggestionConditions | null;
}

const WHERE: Readonly<Record<StaffSuggestionPlacement, string>> = {
  home: 'sur l’accueil',
  cart: 'au panier',
  product: 'sur la fiche de l’article',
};

const WHO: Readonly<Record<StaffSuggestionAudience, string>> = {
  both: 'aux professionnels et aux particuliers',
  pro: 'aux professionnels',
  public: 'aux particuliers',
};

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

function parts(day: string): {
  readonly year: string;
  readonly month: string;
  readonly date: string;
} {
  const [year = '', month = '', date = ''] = day.split('-');
  return { year, month: MONTHS[Number(month) - 1] ?? month, date: String(Number(date)) };
}

/** « du 20 au 31 octobre », « du 28 octobre au 3 novembre », « le 20 octobre ». */
export function frenchPeriod(startsOn: string, endsOn: string): string {
  if (startsOn === '' || endsOn === '') {
    return 'à des dates à choisir';
  }
  const start = parts(startsOn);
  const end = parts(endsOn);
  const endText = `${end.date} ${end.month}${start.year === end.year ? '' : ` ${end.year}`}`;
  if (startsOn === endsOn) {
    return `le ${endText}`;
  }
  if (start.year !== end.year) {
    return `du ${start.date} ${start.month} ${start.year} au ${endText}`;
  }
  return start.month === end.month
    ? `du ${start.date} au ${endText}`
    : `du ${start.date} ${start.month} au ${endText}`;
}

function nameOf(
  choices: StaffSuggestionChoicesView | null,
  kind: 'sku' | 'family',
  ref: string,
): string {
  const found =
    kind === 'sku'
      ? choices?.articles.find((article) => article.sku === ref)
      : choices?.families.find((family) => family.id === ref);
  return found === undefined ? ref : found.name;
}

function whenOf(input: SuggestionSummaryInput, choices: StaffSuggestionChoicesView | null): string {
  const ref = input.triggerRef.trim();
  switch (input.triggerKind) {
    case 'everywhere':
      return 'Partout';
    case 'product_in_cart':
      return `Quand ${ref === '' ? 'l’article à choisir' : nameOf(choices, 'sku', ref)} est dans le panier`;
    case 'category_in_cart':
      return ref === ''
        ? 'Quand un article de la famille à choisir est dans le panier'
        : `Quand un article de la famille ${nameOf(choices, 'family', ref)} est dans le panier`;
    case 'product_viewed':
      return `Quand on regarde la fiche ${ref === '' ? 'de l’article à choisir' : `de ${nameOf(choices, 'sku', ref)}`}`;
  }
}

/** La phrase entière, ponctuée. */
export function summaryOf(
  input: SuggestionSummaryInput,
  choices: StaffSuggestionChoicesView | null,
): string {
  const what =
    input.suggestedSkus.length === 0
      ? '(les articles à choisir)'
      : input.suggestedSkus.map((sku) => nameOf(choices, 'sku', sku)).join(', ');
  const conditions = input.conditions === null ? [] : conditionsParts(input.conditions, choices);
  const tail = conditions.map((part) => `, ${part}`).join('');
  return `${whenOf(input, choices)}, proposer ${what} ${WHERE[input.placement]}, ${WHO[input.audience]}, ${frenchPeriod(input.startsOn, input.endsOn)}${tail}.`;
}

/** Une règle servie, ramenée à la phrase. */
export function ruleSummary(
  rule: StaffSuggestionRuleView,
  choices: StaffSuggestionChoicesView | null,
): string {
  return summaryOf(
    {
      triggerKind: rule.trigger.kind,
      triggerRef: rule.trigger.ref ?? '',
      suggestedSkus: rule.suggestedSkus,
      placement: rule.placement,
      audience: rule.audience,
      startsOn: rule.startsOn,
      endsOn: rule.endsOn,
      conditions: rule.conditions,
    },
    choices,
  );
}

/** Où en est une règle, vue d'aujourd'hui. « Coupée » : le staff l'a éteinte à la main. */
export type SuggestionState = 'archived' | 'cut' | 'scheduled' | 'ended' | 'live';

export function stateOf(
  rule: Pick<StaffSuggestionRuleView, 'archivedAt' | 'active' | 'startsOn' | 'endsOn'>,
  today: string,
): SuggestionState {
  if (rule.archivedAt !== null) {
    return 'archived';
  }
  if (!rule.active) {
    return 'cut';
  }
  if (today < rule.startsOn) {
    return 'scheduled';
  }
  return today > rule.endsOn ? 'ended' : 'live';
}

export const STATE_BADGES: Readonly<
  Record<
    SuggestionState,
    { readonly label: string; readonly variant: 'neutral' | 'success' | 'warning' | 'info' }
  >
> = {
  archived: { label: 'Archivée', variant: 'neutral' },
  cut: { label: 'Coupée', variant: 'warning' },
  scheduled: { label: 'Programmée', variant: 'info' },
  ended: { label: 'Finie', variant: 'neutral' },
  live: { label: 'Active', variant: 'success' },
};
