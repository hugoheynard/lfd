/**
 * **Le repli de la bande de mots-clés** — de la géométrie pure, sans DOM.
 *
 * La bande grandit avec le vocabulaire ; repliée, elle tient en deux rangées.
 * Ce qui ne tient pas se dit par un bouton « + N autres » en fin de bande, et
 * ce bouton doit tenir LUI AUSSI dans la deuxième rangée.
 */

/** La boîte d'une pastille, lue dans le conteneur (offsetTop / offsetLeft). */
export interface ChipBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

/** Ce qu'il faut pour couper : les boîtes, la largeur utile, le bouton, l'écart. */
export interface FoldLayout {
  readonly boxes: readonly ChipBox[];
  readonly width: number;
  /** La largeur du bouton « + N autres », à loger en fin de dernière rangée. */
  readonly reserve: number;
  readonly gap: number;
}

/** Le nombre de rangées qu'une bande repliée montre. */
export const FOLDED_ROWS = 2;

/**
 * Combien de pastilles la bande repliée montre — `null` si tout tient.
 *
 * Les boîtes sont lues avec TOUTES les pastilles rendues : une pastille ne
 * déplace jamais celles qui la précèdent dans un flux qui passe à la ligne,
 * donc couper après la mesure ne change pas les rangées gardées.
 */
export function foldCut(layout: FoldLayout, rows = FOLDED_ROWS): number | null {
  const tops = [...new Set(layout.boxes.map((box) => box.top))].sort((a, b) => a - b);
  const lastTop = tops[rows - 1];
  if (tops.length <= rows || lastTop === undefined) {
    return null;
  }
  let cut = layout.boxes.findIndex((box) => box.top > lastTop);
  // Le bouton se loge après la dernière gardée : on rend des pastilles tant
  // qu'il déborderait. Au moins une reste, sinon le repli ne montre plus rien.
  while (cut > 1) {
    const last = layout.boxes[cut - 1];
    if (
      last === undefined ||
      last.top < lastTop ||
      last.left + last.width + layout.gap + layout.reserve <= layout.width
    ) {
      break;
    }
    cut -= 1;
  }
  return Math.max(cut, 1);
}

/**
 * Place en tête les mots ÉPINGLÉS (l'armé, ceux du filtre), dans l'ordre
 * donné, et garde le reste dans son ordre. Un mot épinglé ne disparaît jamais
 * derrière le repli : c'est celui qu'on est en train d'utiliser.
 */
export function pinFirst<T extends { readonly tag: string }>(
  entries: readonly T[],
  pinned: readonly string[],
): readonly T[] {
  const head = [...new Set(pinned)]
    .map((tag) => entries.find((entry) => entry.tag === tag))
    .filter((entry): entry is T => entry !== undefined);
  const kept = new Set(head.map((entry) => entry.tag));
  return [...head, ...entries.filter((entry) => !kept.has(entry.tag))];
}

/**
 * Lit la géométrie d'une liste de pastilles, toutes rendues. Le bouton
 * « + N autres » est rendu pendant la mesure pour qu'on connaisse sa largeur.
 */
export function layoutOf(list: HTMLElement): FoldLayout {
  const items = [...list.querySelectorAll<HTMLElement>(':scope > li.word-item')];
  const boxes: ChipBox[] = items.map((item) => ({
    top: item.offsetTop,
    left: item.offsetLeft,
    width: item.offsetWidth,
  }));
  const toggle = list.querySelector<HTMLElement>(':scope > li.toggle-item');
  const gap = Number.parseFloat(getComputedStyle(list).columnGap);
  return {
    boxes,
    width: list.clientWidth,
    reserve: toggle?.offsetWidth ?? 0,
    gap: Number.isNaN(gap) ? 0 : gap,
  };
}
