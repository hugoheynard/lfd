import type {
  ShopItemView,
  StaffSuggestionChoicesView,
  StaffSuggestionOrder,
  StaffSuggestionPreviewItem,
  StaffSuggestionPlacement,
  StaffSuggestionPreviewPayload,
  StaffSuggestionReader,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import { MILLICENTS_PER_CENT, unitPriceCents } from '@lfd/money';

/**
 * **L'aperçu dit en clair** (RS5) — ce que l'écran et l'agent écrivent d'un
 * diagnostic rendu par le serveur. Rien n'y est jugé : chaque raison est celle
 * de la chaîne de la boutique, ici seulement traduite.
 */

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

/** `AAAA-MM-JJ` → « 18 octobre ». */
export function dayAndMonth(day: string): string {
  const [, month, date] = day.split('-');
  const name = MONTHS[Number(month) - 1] ?? month ?? '';
  return `${Number(date)} ${name}`;
}

/** Les titres par défaut de la boutique, en français (`shop.staffAdvice`, `alsoLike`, `ourPicks`). */
const DEFAULT_CARD_TITLES: Readonly<Record<StaffSuggestionPlacement, string>> = {
  cart: 'Notre conseil',
  product: 'Vous aimerez aussi',
  home: 'Notre sélection',
};

/** Le titre de la carte quand la règle n'a pas de phrase — celui de la boutique, selon l'emplacement. */
export function defaultCardTitle(placement: StaffSuggestionPlacement): string {
  return DEFAULT_CARD_TITLES[placement];
}

/** Le prix tel que la carte l'écrit : HT à un pro, TTC à un particulier, arrondi au centime comme le rayon. */
export function previewPrice(item: ShopItemView, audience: StaffSuggestionReader): string {
  return audience === 'pro'
    ? `${formatEuros(unitPriceCents(item.unitPriceMillicents) * MILLICENTS_PER_CENT)} HT`
    : `${formatEuros(item.unitPriceTtcCents * MILLICENTS_PER_CENT)} TTC`;
}

/** Ce qu'il faut pour dire une raison : la règle, le catalogue, les autres règles, l'ordre. */
export interface ReasonContext {
  readonly choices: StaffSuggestionChoicesView | null;
  readonly rules: ReadonlyMap<string, StaffSuggestionRuleView>;
  readonly order: StaffSuggestionOrder | null;
}

/** Un nom d'article ou de famille entre guillemets, sa référence s'il n'est plus servi. */
function quoted(choices: StaffSuggestionChoicesView | null, ref: string, family = false): string {
  const name = family
    ? choices?.families.find((candidate) => candidate.id === ref)?.name
    : choices?.articles.find((candidate) => candidate.sku === ref)?.name;
  return `« ${name ?? ref} »`;
}

/** Une règle nommée : sa phrase, sinon ses articles. */
export function ruleName(rule: StaffSuggestionRuleView | undefined, ctx: ReasonContext): string {
  if (rule === undefined) {
    return '« une autre suggestion »';
  }
  return rule.phrase === null
    ? rule.suggestedSkus.map((sku) => quoted(ctx.choices, sku)).join(', ')
    : `« ${rule.phrase.fr} »`;
}

function triggerFalse(rule: StaffSuggestionRuleView, ctx: ReasonContext): string {
  const { kind, ref } = rule.trigger;
  if (ref === null) {
    return 'Son déclencheur n’est pas vrai ici';
  }
  if (kind === 'category_in_cart') {
    return `Aucun article de la famille ${quoted(ctx.choices, ref, true)} dans le panier`;
  }
  return kind === 'product_viewed'
    ? `Ce n’est pas la fiche de ${quoted(ctx.choices, ref)}`
    : `${quoted(ctx.choices, ref)} n’est pas dans le panier`;
}

function outranked(owner: string, by: string | null, ctx: ReasonContext): string {
  if (by === owner) {
    return 'Pas de place : les places de cet emplacement sont déjà prises';
  }
  const how = ctx.order === 'priority' ? 'priorité' : 'plus récente';
  return `Battue par ${ruleName(by === null ? undefined : ctx.rules.get(by), ctx)} (${how})`;
}

/**
 * Le statut d'une règle ou d'un de ses articles, en français. `sku` est
 * l'article jugé (absent pour une raison de règle).
 */
export function previewReason(
  rule: StaffSuggestionRuleView,
  verdict: Pick<StaffSuggestionPreviewItem, 'status' | 'outrankedBy'>,
  ctx: ReasonContext,
  sku: string | null = null,
): string {
  const item = quoted(ctx.choices, sku ?? rule.suggestedSkus[0] ?? '');
  switch (verdict.status) {
    case 'shown':
      return 'Affichée';
    case 'ended':
      return `Finie le ${dayAndMonth(rule.endsOn)}`;
    case 'not_started':
      return `Commence le ${dayAndMonth(rule.startsOn)}`;
    case 'inactive':
      return 'Coupée';
    case 'wrong_audience':
      return 'Pas pour cette clientèle';
    case 'wrong_placement':
      return 'Pas à cet emplacement';
    case 'trigger_false':
      return triggerFalse(rule, ctx);
    case 'item_not_served':
      return `${item} n’est pas en vente pour cette clientèle`;
    case 'item_not_orderable_that_day':
      return `${item} n’est pas commandable ce jour-là`;
    case 'item_in_cart':
      return `${item} est déjà dans le panier`;
    case 'item_is_the_product':
      return `${item} est l’article de la fiche`;
    case 'outranked_by':
      return outranked(rule.id, verdict.outrankedBy, ctx);
  }
}

/** Ce que l'aperçu demande, côté écran : le payload sans sa forme discriminée. */
export interface PreviewSetup {
  readonly placement: StaffSuggestionPlacement;
  readonly cart: readonly string[];
  readonly viewedSku: string | null;
  readonly audience: StaffSuggestionReader;
  readonly day: string;
}

/** Le payload envoyé ; `null` tant qu'une fiche n'a pas d'article choisi. */
export function previewPayload(setup: PreviewSetup): StaffSuggestionPreviewPayload | null {
  const common = {
    skus: [...setup.cart],
    audience: setup.audience,
    day: setup.day,
    pickupAddressId: null,
  };
  if (setup.placement !== 'product') {
    return { placement: setup.placement, ...common };
  }
  return setup.viewedSku === null
    ? null
    : { placement: 'product', viewedSku: setup.viewedSku, ...common };
}

/**
 * **L'aperçu ouvert depuis une règle** : son emplacement, sa clientèle, un
 * jour de sa période, et un déclencheur qui la rend vraie — l'article qui
 * déclenche, un article de la famille, ou la fiche d'un article qu'elle ne
 * suggère pas. À l'accueil, seul « partout » vaut : un panier vide.
 */
export function previewSetupOf(
  rule: StaffSuggestionRuleView,
  choices: StaffSuggestionChoicesView | null,
  today: string,
): PreviewSetup {
  const { kind, ref } = rule.trigger;
  const articles = choices?.articles ?? [];
  const inFamily = articles.find((article) => article.familyId === ref)?.sku;
  const other = articles.find((article) => !rule.suggestedSkus.includes(article.sku))?.sku;
  const cart =
    kind === 'product_in_cart' && ref !== null
      ? [ref]
      : kind === 'category_in_cart' && inFamily !== undefined
        ? [inFamily]
        : [];
  return {
    placement: rule.placement,
    cart: rule.placement === 'cart' ? cart : [],
    viewedSku:
      rule.placement === 'product' ? (kind === 'product_viewed' ? ref : (other ?? null)) : null,
    audience: rule.audience === 'pro' ? 'pro' : 'public',
    day: rule.startsOn > today ? rule.startsOn : today,
  };
}
