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
  product_in_cart: 'Quand cet article est dans le panier',
  category_in_cart: 'Quand un article de cette famille est dans le panier',
  product_viewed: 'Quand on regarde la fiche de cet article',
};

/** Un exemple par choix : le staff se représente la règle avant de la composer. */
export const TRIGGER_EXAMPLES: Readonly<Record<StaffSuggestionTriggerKind, string>> = {
  everywhere: 'Exemple : toute la semaine, on propose la galette des rois à tout le monde.',
  product_in_cart: 'Exemple : croissant au panier → on propose le café.',
  category_in_cart: 'Exemple : une viennoiserie au panier → on propose le jus d’orange.',
  product_viewed: 'Exemple : sur la fiche de la baguette → on propose le beurre.',
};

const PLACEMENTS: Readonly<Record<StaffSuggestionPlacement, string>> = {
  home: 'Sur l’accueil',
  cart: 'Au panier',
  product: 'Sur la fiche de l’article',
};

/** Pourquoi un emplacement n'est pas possible avec ce « Quand » — dit, plutôt que masqué. */
const PLACEMENT_REFUSALS: Readonly<Record<StaffSuggestionPlacement, string>> = {
  home: 'l’accueil ne montre ni panier ni fiche',
  cart: 'le panier ne se voit pas depuis une fiche',
  product: 'la fiche ne voit pas ce qui est au panier',
};

const AUDIENCES: Readonly<Record<StaffSuggestionAudience, string>> = {
  both: 'Les deux',
  pro: 'Les professionnels',
  public: 'Les particuliers',
};

const ORDERS: Readonly<Record<StaffSuggestionOrder, string>> = {
  recent: 'La plus récente',
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

/** Les trois emplacements, toujours ; ceux que ce « Quand » rend impossibles sont fermés, avec leur raison. */
export function placementOptions(
  trigger: StaffSuggestionTriggerKind,
): readonly FoldSelectOption<StaffSuggestionPlacement>[] {
  return (['home', 'cart', 'product'] as const).map((value) =>
    PLACEMENTS_OF[trigger].includes(value)
      ? { value, label: PLACEMENTS[value] }
      : {
          value,
          label: `${PLACEMENTS[value]} — impossible ici : ${PLACEMENT_REFUSALS[value]}`,
          disabled: true,
        },
  );
}

export function orderLabel(order: StaffSuggestionOrder): string {
  return ORDERS[order];
}

export function isSuggestionOrder(value: string): value is StaffSuggestionOrder {
  return value === 'recent' || value === 'priority';
}

/**
 * Les noms courts que lit l'agent (`agent/suggestion-agent-text.ts`) : une
 * ligne dense, pas une question posée au staff comme dans le panneau.
 */
const TRIGGER_NAMES: Readonly<Record<StaffSuggestionTriggerKind, string>> = {
  everywhere: 'Partout',
  product_in_cart: 'Article au panier',
  category_in_cart: 'Famille au panier',
  product_viewed: 'Fiche d’article ouverte',
};

const AUDIENCE_NAMES: Readonly<Record<StaffSuggestionAudience, string>> = {
  both: 'Professionnels et particuliers',
  pro: 'Professionnels',
  public: 'Particuliers',
};

export function placementLabel(placement: StaffSuggestionPlacement): string {
  return PLACEMENTS[placement];
}

export function audienceLabel(audience: StaffSuggestionAudience): string {
  return AUDIENCE_NAMES[audience];
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
    return TRIGGER_NAMES[kind];
  }
  return `${TRIGGER_NAMES[kind]} : ${nameOf(choices, kind === 'category_in_cart' ? 'family' : 'sku', ref)}`;
}

/** Les articles montrés, nommés, dans l'ordre voulu. */
export function suggestedLabel(
  rule: Pick<StaffSuggestionRuleView, 'suggestedSkus'>,
  choices: StaffSuggestionChoicesView | null,
): string {
  return rule.suggestedSkus.map((sku) => nameOf(choices, 'sku', sku)).join(', ');
}

export function refusalOf(error: unknown, fallback: string): string {
  return httpErrorMessage(error, fallback);
}
