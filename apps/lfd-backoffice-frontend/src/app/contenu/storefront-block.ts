import type { StorefrontContent } from '@lfd/contracts';
import { DEFAULT_TONE, type PlacedBlock, type StorefrontTone } from '@lfd/storefront-layout';

/**
 * Un objet tel que l'éditeur « Vitrine » le tient : la forme posée du paquet
 * (`@lfd/storefront-layout`), plus ce que le paquet ne porte pas — le ton et
 * la liste ORDONNÉE des contenus (`plan-vitrine-enregistrement.md`, D3 et D4).
 *
 * `items` et non `contents` : le paquet appelle déjà `contents` le mode « un
 * seul / plusieurs ».
 */
export interface EditorBlock extends PlacedBlock {
  /** Absent = `light`. */
  readonly tone?: StorefrontTone;
  /** Dans l'ordre de défilement. Absent = aucun contenu encore (un objet peut exister vide). */
  readonly items?: readonly StorefrontContent[];
}

export function toneOf(block: EditorBlock): StorefrontTone {
  return block.tone ?? DEFAULT_TONE;
}

export function setTone(
  blocks: readonly EditorBlock[],
  id: string,
  tone: StorefrontTone,
): readonly EditorBlock[] {
  return blocks.map((block) => (block.id === id ? { ...block, tone } : block));
}

export function itemsOf(block: EditorBlock): readonly StorefrontContent[] {
  return block.items ?? [];
}

/** Remplace la liste des contenus d'un objet — les gestes (ajout, retrait, ordre) se calculent avant. */
export function setItems(
  blocks: readonly EditorBlock[],
  id: string,
  items: readonly StorefrontContent[],
): readonly EditorBlock[] {
  return blocks.map((block) => (block.id === id ? { ...block, items } : block));
}

/** Déplace le contenu `index` d'un cran (`-1` : plus tôt, `+1` : plus tard). Hors bornes : inchangé. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const target = index + delta;
  const moved = items[index];
  if (moved === undefined || target < 0 || target >= items.length) {
    return items;
  }
  const rest = items.filter((_, position) => position !== index);
  return [...rest.slice(0, target), moved, ...rest.slice(target)];
}

export function removeItem<T>(items: readonly T[], index: number): readonly T[] {
  return items.filter((_, position) => position !== index);
}

export function replaceItem<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((current, position) => (position === index ? item : current));
}
