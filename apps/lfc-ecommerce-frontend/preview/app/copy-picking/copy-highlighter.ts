import type { CopyMarkers } from './copy-markers';

/** Le nom de la surbrillance — stylée dans `preview.scss` par `::highlight(…)`. */
export const COPY_HIGHLIGHT = 'lfc-preview-copy';

/**
 * **Les clés que l'écran montre** : un parcours des nœuds de texte, et des
 * `placeholder` — les seuls attributs qu'on lit à l'écran.
 *
 * TOUT le document rendu, pas la seule zone affichée : un dialogue ouvert
 * (monté dans le `body`) en fait partie, le bas d'une page aussi. Les clés
 * sont rendues dans l'ORDRE du document (textes, puis `placeholder`) :
 * l'éditeur range ses espaces comme l'écran les montre.
 */
export function visibleKeys(root: Element, markers: CopyMarkers): readonly string[] {
  const keys = new Set<string>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    for (const marker of markers.read(node.nodeValue ?? '')) {
      keys.add(marker.key);
    }
  }
  for (const field of root.querySelectorAll('[placeholder]')) {
    for (const marker of markers.read(field.getAttribute('placeholder') ?? '')) {
      keys.add(marker.key);
    }
  }
  return [...keys];
}

/**
 * **La clé du texte cliqué.** Le point du clic désigne un nœud de texte et
 * une position : le marqueur le plus proche avant elle est celui de la phrase
 * cliquée. Sans point lisible (navigateur sans `caretPositionFromPoint`), le
 * premier marqueur de l'élément cliqué.
 */
export function keyAtClick(event: MouseEvent, markers: CopyMarkers): string | null {
  const document = event.view?.document;
  const caret = document?.caretPositionFromPoint?.(event.clientX, event.clientY) ?? null;
  if (caret !== null && caret.offsetNode.nodeType === Node.TEXT_NODE) {
    const key = markers.keyAt(caret.offsetNode.nodeValue ?? '', caret.offset);
    if (key !== null) {
      return key;
    }
  }
  const target = event.target;
  return target instanceof Element ? markers.keyAt(target.textContent ?? '', 0) : null;
}

/**
 * **Surligne les textes d'une clé** — sans toucher au DOM d'Angular : la
 * surbrillance passe par l'API des surlignages CSS (`CSS.highlights`), qui
 * peint des plages sans insérer d'élément. Rend le premier élément surligné,
 * pour le faire défiler jusqu'à lui.
 */
export function highlightKey(
  root: Element,
  key: string | null,
  markers: CopyMarkers,
): Element | null {
  const registry = typeof CSS === 'undefined' ? undefined : CSS.highlights;
  if (registry === undefined) {
    return null;
  }
  registry.delete(COPY_HIGHLIGHT);
  if (key === null) {
    return null;
  }
  const ranges: Range[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const found = markers.read(text);
    found.forEach((marker, index) => {
      if (marker.key !== key) {
        return;
      }
      const range = root.ownerDocument.createRange();
      range.setStart(node, marker.end);
      range.setEnd(node, found[index + 1]?.index ?? text.length);
      ranges.push(range);
    });
  }
  if (ranges.length === 0) {
    return null;
  }
  registry.set(COPY_HIGHLIGHT, new Highlight(...ranges));
  const first = ranges[0]?.startContainer.parentElement ?? null;
  return first;
}
