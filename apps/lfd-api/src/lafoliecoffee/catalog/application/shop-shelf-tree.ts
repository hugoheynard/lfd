import type { ShopShelfView } from "@lfd/contracts";

import type { CatalogTranslations } from "../domain/catalog-translations.js";
import type { ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";

/** Un rayon de l'arbre, avant d'être rangé. */
interface ShelfNode {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly parentId: string | null;
}

/**
 * **Les rayons en arbre** — les familles peuplées et toutes leurs parentes,
 * chaque parente avant ses filles, des sœurs dans l'ordre du référentiel
 * (position, puis nom, puis identifiant — la règle de `compareFamilies`).
 *
 * Rend `null` quand aucune famille peuplée n'a de parente : le catalogue est
 * plat, et l'appelant garde sa composition d'avant l'imbrication, mot pour mot.
 *
 * Une parente est un rayon même sans article à elle : choisir « Pâtisseries »
 * montre ses tartes et ses entremets. Elle n'entre que par une fille peuplée —
 * une branche entièrement vide n'a pas de pastille.
 */
export function shelfTreeOf(
  sellable: readonly ResolvedCatalogItem[],
  peopled: ReadonlySet<string>,
): readonly ShopShelfView[] | null {
  const nodes = new Map<string, ShelfNode>();
  for (const item of sellable) {
    if (!peopled.has(item.categoryId) || nodes.has(item.categoryId)) {
      continue;
    }
    const ancestors = item.family.ancestors ?? [];
    nodes.set(item.categoryId, {
      id: item.categoryId,
      name: item.categoryName,
      position: item.family.position,
      parentId: ancestors[0]?.id ?? null,
    });
    ancestors.forEach((ancestor, index) => {
      if (!nodes.has(ancestor.id)) {
        nodes.set(ancestor.id, {
          id: ancestor.id,
          name: ancestor.name,
          position: ancestor.position,
          parentId: ancestors[index + 1]?.id ?? null,
        });
      }
    });
  }
  if ([...nodes.values()].every((node) => node.parentId === null)) {
    return null;
  }
  return depthFirst(nodes).map((node, position) => ({
    id: node.id,
    name: node.name,
    position,
    parentId: node.parentId,
  }));
}

/**
 * Les traductions du nom de chaque rayon servi, parentes comprises — la
 * vitrine traduit ses rayons après coup (`inShopLanguage`), et une parente
 * sans article n'a pas de ligne d'où les tirer.
 */
export function shelfTranslationsOf(
  sellable: readonly ResolvedCatalogItem[],
): ReadonlyMap<string, CatalogTranslations> {
  const translations = new Map<string, CatalogTranslations>();
  for (const item of sellable) {
    translations.set(item.categoryId, item.translations.categoryName);
    for (const ancestor of item.family.ancestors ?? []) {
      translations.set(ancestor.id, ancestor.nameTranslations);
    }
  }
  return translations;
}

function depthFirst(nodes: ReadonlyMap<string, ShelfNode>): readonly ShelfNode[] {
  const children = new Map<string | null, ShelfNode[]>();
  for (const node of nodes.values()) {
    // Une parente qui n'est pas dans l'arbre (absente du miroir) : le rayon
    // remonte en tête plutôt que de disparaître.
    const parent = node.parentId !== null && nodes.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const ordered: ShelfNode[] = [];
  const visit = (parent: string | null): void => {
    for (const node of [...(children.get(parent) ?? [])].sort(bySiblingOrder)) {
      ordered.push(node);
      visit(node.id);
    }
  };
  visit(null);
  return ordered;
}

function bySiblingOrder(left: ShelfNode, right: ShelfNode): number {
  const delta = left.position - right.position;
  if (delta !== 0) {
    return delta;
  }
  const byName = left.name.localeCompare(right.name, "fr");
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}
