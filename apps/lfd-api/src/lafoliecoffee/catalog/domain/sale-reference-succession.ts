/**
 * **La référence la plus récente d'une lignée de détachement**
 * (`plan-pro-voit-les-declinaisons.md`, L7d-bis) — le calcul pur.
 *
 * Un article né d'un détachement porte la référence de vente dont il est né
 * (`detachedFromSku`). Les rapports par article regroupent sous la référence
 * la plus RÉCENTE : celle qu'on vend aujourd'hui, ou la dernière qu'on a
 * vendue.
 */

/** Un article qui porte une filiation : sa référence, celle d'où il vient, et s'il est le défaut de sa fiche. */
export interface DetachedArticle {
  readonly sku: string;
  readonly detachedFromSku: string;
  readonly isDefault: boolean;
  /**
   * La déclinaison dont CET article est la copie (« Trace de la déclinaison
   * d'origine ») ; absente ou `null` sur les autres articles, et sur toute
   * fiche détachée avant la trace — qui reste à la règle du défaut.
   */
  readonly detachedFromVariantSku?: string | null | undefined;
}

/**
 * Au plus tant de générations suivies : une lignée plus longue serait une
 * donnée corrompue (un cycle), pas un historique.
 */
export const MAX_SUCCESSION_DEPTH = 16;

/**
 * Le successeur DIRECT de chaque ancienne référence. Le commerce range la
 * filiation sur chaque article de la fiche née. Si un frère porte la trace de
 * la déclinaison d'origine, elle tranche : l'article qu'elle désigne, défaut
 * ou non — un changement de défaut ne déplace pas la lignée. Sans trace (fiche
 * détachée avant elle) : un seul enfant le désigne ; plusieurs, leur défaut ;
 * sans défaut unique, aucun — deux lignes valent mieux qu'un choix inventé.
 */
export function directSuccessorsOf(
  articles: readonly DetachedArticle[],
): ReadonlyMap<string, string> {
  const children = new Map<string, DetachedArticle[]>();
  for (const article of articles) {
    if (article.sku === article.detachedFromSku) {
      continue;
    }
    const siblings = children.get(article.detachedFromSku) ?? [];
    siblings.push(article);
    children.set(article.detachedFromSku, siblings);
  }
  const successors = new Map<string, string>();
  for (const [parent, siblings] of children) {
    const chosen = siblings.some(isTraced) ? tracedTo(parent, siblings) : soleOrDefault(siblings);
    if (chosen !== null) {
      successors.set(parent, chosen.sku);
    }
  }
  return successors;
}

function isTraced(article: DetachedArticle): boolean {
  return article.detachedFromVariantSku != null;
}

/** L'article unique dont la trace désigne `parent` ; aucun, si elle n'en désigne pas exactement un. */
function tracedTo(parent: string, siblings: readonly DetachedArticle[]): DetachedArticle | null {
  const designated = siblings.filter((article) => article.detachedFromVariantSku === parent);
  return designated.length === 1 ? (designated[0] ?? null) : null;
}

function soleOrDefault(siblings: readonly DetachedArticle[]): DetachedArticle | null {
  if (siblings.length === 1) {
    return siblings[0] ?? null;
  }
  const defaults = siblings.filter((article) => article.isDefault);
  return defaults.length === 1 ? (defaults[0] ?? null) : null;
}

/**
 * La référence la plus récente de chaque SKU demandé qui a un successeur ;
 * les autres n'y figurent pas. La lignée se suit au plus
 * {@link MAX_SUCCESSION_DEPTH} fois, et s'arrête sur une référence déjà vue.
 */
export function latestOfEach(
  skus: readonly string[],
  successors: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const latest = new Map<string, string>();
  for (const sku of skus) {
    const seen = new Set([sku]);
    let current = sku;
    for (let depth = 0; depth < MAX_SUCCESSION_DEPTH; depth += 1) {
      const next = successors.get(current);
      if (next === undefined || seen.has(next)) {
        break;
      }
      seen.add(next);
      current = next;
    }
    if (current !== sku) {
      latest.set(sku, current);
    }
  }
  return latest;
}

/**
 * Les ANCÊTRES de chaque SKU demandé, du plus proche au plus lointain ; un SKU
 * sans ancêtre n'est pas dans la carte. Un article n'hérite de la référence
 * dont sa fiche est née que s'il en est le successeur retenu
 * ({@link directSuccessorsOf}) : un frère non désigné ne reçoit rien, comme
 * dans {@link latestOfEach}. Borne et arrêt sur cycle identiques.
 */
export function ancestorsOfEach(
  skus: readonly string[],
  articles: readonly DetachedArticle[],
): ReadonlyMap<string, readonly string[]> {
  const predecessors = new Map<string, string>();
  for (const [parent, child] of directSuccessorsOf(articles)) {
    predecessors.set(child, parent);
  }
  const ancestors = new Map<string, readonly string[]>();
  for (const sku of skus) {
    const chain = walk(sku, predecessors);
    if (chain.length > 0) {
      ancestors.set(sku, chain);
    }
  }
  return ancestors;
}

function walk(sku: string, links: ReadonlyMap<string, string>): readonly string[] {
  const seen = new Set([sku]);
  const chain: string[] = [];
  let current = sku;
  for (let depth = 0; depth < MAX_SUCCESSION_DEPTH; depth += 1) {
    const next = links.get(current);
    if (next === undefined || seen.has(next)) {
      break;
    }
    seen.add(next);
    chain.push(next);
    current = next;
  }
  return chain;
}
