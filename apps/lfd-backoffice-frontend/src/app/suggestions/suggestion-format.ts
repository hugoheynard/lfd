import type {
  StaffSuggestionAudience,
  StaffSuggestionChoicesView,
  StaffSuggestionOrder,
  StaffSuggestionPlacement,
  StaffSuggestionRuleView,
  StaffSuggestionTriggerKind,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';

/**
 * Ce que l'écran « Suggestions » dit d'une règle. Rien n'y est jugé : les
 * refus viennent du serveur, qui tient l'agrégat.
 */

const TRIGGERS: Readonly<Record<StaffSuggestionTriggerKind, string>> = {
  everywhere: 'Partout',
  product_in_cart: 'Article au panier',
  category_in_cart: 'Famille au panier',
  product_viewed: 'Fiche d’article ouverte',
};

const PLACEMENTS: Readonly<Record<StaffSuggestionPlacement, string>> = {
  cart: 'Panier',
  product: 'Fiche d’article',
  home: 'Accueil',
};

const AUDIENCES: Readonly<Record<StaffSuggestionAudience, string>> = {
  both: 'Professionnels et particuliers',
  pro: 'Professionnels',
  public: 'Particuliers',
};

const ORDERS: Readonly<Record<StaffSuggestionOrder, string>> = {
  recent: 'La plus récente d’abord',
  priority: 'Par priorité',
};

/**
 * Où chaque déclencheur peut être vrai — le miroir de la table de l'agrégat
 * (`suggestion-trigger.ts`, lue le 2026-10-18) : l'écran ne propose que ce que
 * le serveur acceptera.
 */
export const PLACEMENTS_OF: Readonly<
  Record<StaffSuggestionTriggerKind, readonly StaffSuggestionPlacement[]>
> = {
  everywhere: ['home', 'cart', 'product'],
  product_in_cart: ['cart'],
  category_in_cart: ['cart'],
  product_viewed: ['product'],
};

export const TRIGGER_OPTIONS: readonly FoldSelectOption<StaffSuggestionTriggerKind>[] = (
  ['everywhere', 'product_in_cart', 'category_in_cart', 'product_viewed'] as const
).map((value) => ({ value, label: TRIGGERS[value] }));

export const AUDIENCE_OPTIONS: readonly FoldSelectOption<StaffSuggestionAudience>[] = (
  ['both', 'pro', 'public'] as const
).map((value) => ({ value, label: AUDIENCES[value] }));

export const ORDER_OPTIONS: readonly FoldViewToggleOption[] = (['recent', 'priority'] as const).map(
  (value) => ({ value, label: ORDERS[value] }),
);

export function placementOptions(
  trigger: StaffSuggestionTriggerKind,
): readonly FoldSelectOption<StaffSuggestionPlacement>[] {
  return PLACEMENTS_OF[trigger].map((value) => ({ value, label: PLACEMENTS[value] }));
}

export function placementLabel(placement: StaffSuggestionPlacement): string {
  return PLACEMENTS[placement];
}

export function audienceLabel(audience: StaffSuggestionAudience): string {
  return AUDIENCES[audience];
}

export function isSuggestionOrder(value: string): value is StaffSuggestionOrder {
  return value === 'recent' || value === 'priority';
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`. */
export function frenchDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date ?? ''}/${month ?? ''}/${year ?? ''}`;
}

export function periodLabel(rule: Pick<StaffSuggestionRuleView, 'startsOn' | 'endsOn'>): string {
  return rule.startsOn === rule.endsOn
    ? `Le ${frenchDay(rule.startsOn)}`
    : `Du ${frenchDay(rule.startsOn)} au ${frenchDay(rule.endsOn)}`;
}

/** Le nom d'un article ou d'une famille, ou sa référence si le catalogue ne la sert plus. */
function nameOf(choices: StaffSuggestionChoicesView | null, kind: 'sku' | 'family', ref: string) {
  const found =
    kind === 'sku'
      ? choices?.articles.find((article) => article.sku === ref)
      : choices?.families.find((family) => family.id === ref);
  return found === undefined ? ref : found.name;
}

/** « Article au panier : Croissant » — le déclencheur, nommé. */
export function triggerLabel(
  rule: Pick<StaffSuggestionRuleView, 'trigger'>,
  choices: StaffSuggestionChoicesView | null,
): string {
  const { kind, ref } = rule.trigger;
  if (ref === null) {
    return TRIGGERS[kind];
  }
  return `${TRIGGERS[kind]} : ${nameOf(choices, kind === 'category_in_cart' ? 'family' : 'sku', ref)}`;
}

/** Les articles montrés, nommés, dans l'ordre voulu. */
export function suggestedLabel(
  rule: Pick<StaffSuggestionRuleView, 'suggestedSkus'>,
  choices: StaffSuggestionChoicesView | null,
): string {
  return rule.suggestedSkus.map((sku) => nameOf(choices, 'sku', sku)).join(', ');
}

/** Les vivantes d'abord, les archivées à part : on ne les confond pas. */
export function splitArchived(rules: readonly StaffSuggestionRuleView[]): {
  readonly live: readonly StaffSuggestionRuleView[];
  readonly archived: readonly StaffSuggestionRuleView[];
} {
  return {
    live: rules.filter((rule) => rule.archivedAt === null),
    archived: rules.filter((rule) => rule.archivedAt !== null),
  };
}

/**
 * La période des chiffres (RS3) : du premier jour de la plus ancienne règle
 * jusqu'à aujourd'hui. `null` : aucune règle n'a encore commencé — il n'y a
 * rien à compter.
 */
export function countersWindow(
  rules: readonly StaffSuggestionRuleView[],
  today: string,
): { readonly from: string; readonly to: string } | null {
  const started = rules.map((rule) => rule.startsOn).filter((day) => day <= today);
  if (started.length === 0) {
    return null;
  }
  return { from: started.reduce((first, day) => (day < first ? day : first)), to: today };
}

export function refusalOf(error: unknown, fallback: string): string {
  return httpErrorMessage(error, fallback);
}
