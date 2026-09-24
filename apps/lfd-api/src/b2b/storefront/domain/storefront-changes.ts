import type { StorefrontObject } from "./storefront-object.js";
import type { StorefrontPage } from "./storefront-page.js";

/**
 * **Ce qu'un enregistrement a changé** — la charge du fait `storefront.saved`
 * (plan, D6). C'est la seule trace de qui a vidé un rayon : elle dit quels
 * objets sont apparus, lesquels ont bougé, lesquels sont partis, et sur quels
 * rayons la page a changé.
 */
export interface StorefrontChanges {
  readonly added: readonly string[];
  readonly moved: readonly string[];
  readonly archived: readonly string[];
  /** Les rayons dont la page a changé, en ordre alphabétique. */
  readonly shelves: readonly string[];
}

/**
 * Compare deux états de la vitrine. Un rayon est « touché » quand sa page
 * apparaît, disparaît ou change de hauteur, ou qu'un objet qui y paraît —
 * avant ou après — change en quoi que ce soit.
 */
export function diffStorefront(
  before: {
    readonly pages: readonly StorefrontPage[];
    readonly objects: readonly StorefrontObject[];
  },
  after: {
    readonly pages: readonly StorefrontPage[];
    readonly objects: readonly StorefrontObject[];
  },
): StorefrontChanges {
  const previous = new Map(before.objects.map((object) => [object.id, object]));
  const kept = new Set(after.objects.map((object) => object.id));
  const shelves = new Set<string>(touchedPages(before.pages, after.pages));
  const touch = (object: StorefrontObject): void => {
    object.state.shelves.forEach((shelf) => shelves.add(shelf));
  };
  const added: string[] = [];
  const moved: string[] = [];
  for (const object of after.objects) {
    const old = previous.get(object.id);
    if (old === undefined) {
      added.push(object.id);
      touch(object);
    } else if (!object.sameAs(old)) {
      if (object.movedFrom(old)) {
        moved.push(object.id);
      }
      touch(old);
      touch(object);
    }
  }
  const archived = before.objects.filter((object) => !kept.has(object.id));
  archived.forEach(touch);
  return {
    added,
    moved,
    archived: archived.map((object) => object.id),
    shelves: [...shelves].sort(),
  };
}

function touchedPages(
  before: readonly StorefrontPage[],
  after: readonly StorefrontPage[],
): readonly string[] {
  const rowsBefore = new Map(before.map((page) => [page.shelfKey, page.rows]));
  const rowsAfter = new Map(after.map((page) => [page.shelfKey, page.rows]));
  const keys = new Set([...rowsBefore.keys(), ...rowsAfter.keys()]);
  return [...keys].filter((key) => rowsBefore.get(key) !== rowsAfter.get(key));
}
