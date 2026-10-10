/**
 * **Les ordres du fonds**, et ce qu'est une position dans chacun.
 *
 * Un ordre se définit par la clé qu'il lit d'une image et la façon de comparer
 * deux clés ; l'URL départage toujours, en croissant — c'est l'identité de
 * l'image, et sans elle deux dépôts du même instant pourraient changer de place
 * entre deux lectures.
 *
 * 🔴 Une table d'ordres, pas un `switch` : la prise de vue (`shot`, L3) y est
 * entrée comme une ligne de plus, sans branche ajoutée ailleurs.
 */
export const LIBRARY_SORTS = ["deposited", "name", "uses", "shot"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** La clé d'un ordre : un instant ISO, une étiquette, un compte. */
export type LibrarySortKey = string | number;

/**
 * Où l'on s'est arrêté : la clé de la dernière image lue, et son URL.
 *
 * C'est ce que le curseur transporte. Lire « ce qui vient après » plutôt que
 * « à partir du rang n » est ce qui rend la lecture insensible à un dépôt fait
 * pendant qu'on défile : un rang se décale, une position non.
 */
export interface LibraryPosition {
  readonly sort: LibrarySort;
  readonly key: LibrarySortKey;
  readonly url: string;
}

/** Ce qu'un ordre lit d'une image. */
export interface RankedImage {
  readonly url: string;
  readonly name: string;
  readonly depositedAt: Date;
  readonly uses: number;
  /** Le jour de prise de vue de sa série, `AAAA-MM-JJ` — `null` sans série ni date. */
  readonly shotOn: string | null;
}

interface LibraryOrder {
  keyOf(image: RankedImage): LibrarySortKey;
  /** Négatif si `a` vient avant `b`. */
  compare(a: LibrarySortKey, b: LibrarySortKey): number;
  /** La clé relue d'un curseur est-elle une clé de cet ordre ? */
  accepts(key: unknown): key is LibrarySortKey;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Une clé vide va EN DERNIER, quel que soit le sens des autres. */
function emptyLast(a: string, b: string, compare: (a: string, b: string) => number): number {
  if ((a === "") !== (b === "")) {
    return a === "" ? 1 : -1;
  }
  return compare(a, b);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const ORDERS: Readonly<Record<LibrarySort, LibraryOrder>> = {
  deposited: {
    keyOf: (image) => image.depositedAt.toISOString(),
    // Le plus récent d'abord. Des ISO de même forme se comparent comme du texte.
    compare: (a, b) => byText(String(b), String(a)),
    accepts: (key): key is string =>
      typeof key === "string" &&
      !Number.isNaN(Date.parse(key)) &&
      new Date(key).toISOString() === key,
  },
  name: {
    keyOf: (image) => image.name,
    // Une image sans étiquette n'a rien à classer : elle va EN DERNIER, sans
    // quoi le tri alphabétique ouvrirait sur la pile de ce que personne n'a nommé.
    compare: (a, b) => emptyLast(String(a), String(b), byText),
    accepts: (key): key is string => typeof key === "string",
  },
  shot: {
    // Le jour de prise de vue de la série ; `""` = sans série, ou série sans
    // date — rangées EN DERNIER : on ne sait pas où les mettre dans le temps.
    keyOf: (image) => image.shotOn ?? "",
    // La plus récente d'abord. Des jours `AAAA-MM-JJ` se comparent comme du texte.
    compare: (a, b) => emptyLast(String(a), String(b), (left, right) => byText(right, left)),
    accepts: (key): key is string => typeof key === "string" && (key === "" || DAY_KEY.test(key)),
  },
  uses: {
    keyOf: (image) => image.uses,
    compare: (a, b) => Number(b) - Number(a),
    accepts: (key): key is number => Number.isInteger(key) && Number(key) >= 0,
  },
};

export function isLibrarySort(value: unknown): value is LibrarySort {
  return LIBRARY_SORTS.some((sort) => sort === value);
}

export function acceptsKey(sort: LibrarySort, key: unknown): key is LibrarySortKey {
  return ORDERS[sort].accepts(key);
}

export function positionOf(sort: LibrarySort, image: RankedImage): LibraryPosition {
  return { sort, key: ORDERS[sort].keyOf(image), url: image.url };
}

/** Compare deux images dans un ordre, l'URL départageant. */
export function compareImages(sort: LibrarySort, a: RankedImage, b: RankedImage): number {
  return comparePositions(positionOf(sort, a), positionOf(sort, b));
}

/** L'image vient-elle STRICTEMENT après cette position ? */
export function comesAfter(image: RankedImage, position: LibraryPosition): boolean {
  return comparePositions(positionOf(position.sort, image), position) > 0;
}

function comparePositions(a: LibraryPosition, b: LibraryPosition): number {
  const byKey = ORDERS[a.sort].compare(a.key, b.key);
  return byKey !== 0 ? byKey : byText(a.url, b.url);
}
