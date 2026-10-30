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
}

/**
 * Au plus tant de générations suivies : une lignée plus longue serait une
 * donnée corrompue (un cycle), pas un historique.
 */
export const MAX_SUCCESSION_DEPTH = 16;

/**
 * Le successeur DIRECT de chaque ancienne référence. Le commerce range la
 * filiation sur chaque article de la fiche née : un seul enfant le désigne ;
 * plusieurs, leur défaut ; sans défaut unique, aucun — deux lignes valent
 * mieux qu'un choix inventé.
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
    const chosen = soleOrDefault(siblings);
    if (chosen !== null) {
      successors.set(parent, chosen.sku);
    }
  }
  return successors;
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
